import { config } from '../config.js';
import { getBotAccount, setBotAccount, getChannel, upsertChannel } from '../db/index.js';

let cachedAppAccessToken = null;
let appTokenExpiresAt = 0;

// In-memory caches for Twitch Helix read calls to prevent rate-limiting and maximize performance
const streamInfoCache = new Map(); // broadcasterId -> { data, expiresAt }
const channelInfoCache = new Map(); // broadcasterId -> { data, expiresAt }
const followAgeCache = new Map(); // `${broadcasterId}:${userId}` -> { data, expiresAt }
const tokenValidationCache = new Map(); // token -> { data, expiresAt }
const botModStatusCache = new Map(); // `${broadcasterId}:${botUserId}` -> { isMod, expiresAt }

export function clearTwitchApiCaches() {
  streamInfoCache.clear();
  channelInfoCache.clear();
  followAgeCache.clear();
  tokenValidationCache.clear();
  botModStatusCache.clear();
}

export function clearBroadcasterCaches(broadcasterId, token = null) {
  if (!broadcasterId) return;
  const bId = String(broadcasterId);
  streamInfoCache.delete(bId);
  channelInfoCache.delete(bId);
  for (const key of followAgeCache.keys()) {
    if (key.startsWith(`${bId}:`)) followAgeCache.delete(key);
  }
  for (const key of botModStatusCache.keys()) {
    if (key.startsWith(`${bId}:`)) botModStatusCache.delete(key);
  }
  if (token) {
    tokenValidationCache.delete(token);
  }
}

/**
 * Obtain or return a cached Twitch App Access Token (Client Credentials).
 */
export async function getAppAccessToken() {
  const now = Date.now();
  if (cachedAppAccessToken && appTokenExpiresAt > now + 60000) {
    return cachedAppAccessToken;
  }

  if (!config.clientId || !config.clientSecret) {
    throw new Error('TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET is missing from .env');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
  });

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to obtain App Access Token: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  cachedAppAccessToken = data.access_token;
  appTokenExpiresAt = now + data.expires_in * 1000;
  return cachedAppAccessToken;
}

/**
 * Refresh the central bot user access token.
 */
export async function refreshBotToken() {
  const bot = getBotAccount();
  if (!bot || !bot.refreshToken) {
    throw new Error('No central bot account or refresh token registered');
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: bot.refreshToken,
  });

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to refresh bot token: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  bot.accessToken = data.access_token;
  bot.refreshToken = data.refresh_token || bot.refreshToken;
  bot.expiresAt = Date.now() + (data.expires_in || 14400) * 1000;
  setBotAccount(bot);
  return bot.accessToken;
}

/**
 * Get a valid central bot user access token.
 */
export async function getValidBotToken() {
  const bot = getBotAccount();
  if (!bot || !bot.accessToken) {
    throw new Error('Central bot account is not authorized yet');
  }

  if (bot.expiresAt && Date.now() > bot.expiresAt - 60000) {
    return await refreshBotToken();
  }

  return bot.accessToken;
}

/**
 * Refresh a channel's broadcaster access token using their refresh token.
 */
export async function refreshChannelToken(channelId) {
  const channel = getChannel(channelId);
  if (!channel || !channel.refreshToken) {
    throw new Error(`Channel ${channelId} does not have a refresh token`);
  }

  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: channel.refreshToken,
  });

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to refresh channel token: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  const updatedChannel = upsertChannel({
    id: channel.id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || channel.refreshToken,
    expiresAt: Date.now() + (data.expires_in || 14400) * 1000,
  });

  return updatedChannel ? updatedChannel.accessToken : data.access_token;
}

/**
 * Get a valid channel broadcaster user access token.
 */
export async function getValidChannelToken(channelId) {
  const channel = getChannel(channelId);
  if (!channel || !channel.accessToken) {
    return null;
  }

  if (channel.expiresAt && Date.now() > channel.expiresAt - 60000) {
    try {
      return await refreshChannelToken(channelId);
    } catch (err) {
      console.warn(`[Twitch API] Could not refresh token for channel ${channelId}:`, err.message);
      return channel.accessToken;
    }
  }

  return channel.accessToken;
}

/**
 * Validate an OAuth user token and return its granted scopes and metadata.
 */
export async function validateUserToken(token) {
  if (!token) return { valid: false, scopes: [] };

  const cached = tokenValidationCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const res = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${token}` },
    });

    if (!res.ok) {
      const result = { valid: false, scopes: [] };
      return result;
    }

    const data = await res.json();
    const result = {
      valid: true,
      scopes: Array.isArray(data.scopes) ? data.scopes : [],
      clientId: data.client_id,
      login: data.login,
      userId: data.user_id,
      expiresIn: data.expires_in,
    };

    tokenValidationCache.set(token, {
      data: result,
      expiresAt: Date.now() + 60000, // 60-second cache
    });

    return result;
  } catch (err) {
    console.warn('[Twitch API] Token validation failed:', err.message);
    return { valid: false, scopes: [] };
  }
}

/**
 * Check if the bot account is a moderator in the broadcaster's channel.
 * Returns:
 *   true  - Bot is confirmed moderator
 *   false - Bot is confirmed NOT a moderator
 *   null  - Unable to check (e.g. missing channel:manage:moderators or offline)
 */
export async function checkBotModeratorStatus({ broadcasterId, botUserId, userToken = null }) {
  if (!broadcasterId || !botUserId) return null;

  const cacheKey = `${broadcasterId}:${botUserId}`;
  const cached = botModStatusCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.isMod;
  }

  let token = userToken;
  if (!token) {
    token = await getValidChannelToken(broadcasterId);
  }

  if (!token) {
    return null;
  }

  try {
    const url = `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${encodeURIComponent(broadcasterId)}&user_id=${encodeURIComponent(botUserId)}`;
    const res = await fetch(url, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      return null;
    }

    if (!res.ok) {
      return null;
    }

    const json = await res.json();
    const isMod = Array.isArray(json.data) && json.data.length > 0;

    botModStatusCache.set(cacheKey, {
      isMod,
      expiresAt: Date.now() + 30000, // 30-second cache
    });

    return isMod;
  } catch (err) {
    console.warn('[Twitch API] Could not check bot moderator status:', err.message);
    return null;
  }
}

/**
 * Add the bot account as a moderator in the broadcaster's channel via Twitch Helix.
 * Requires scope: channel:manage:moderators on the broadcaster's user token.
 */
export async function addChannelModerator({ broadcasterId, botUserId, userToken = null }) {
  if (!broadcasterId || !botUserId) {
    throw new Error('Broadcaster ID and Bot User ID are required');
  }

  let token = userToken;
  if (!token) {
    token = await getValidChannelToken(broadcasterId);
  }

  if (!token) {
    throw new Error('Broadcaster authorization token not found. Please re-connect with Twitch.');
  }

  const url = `https://api.twitch.tv/helix/moderation/moderators?broadcaster_id=${encodeURIComponent(broadcasterId)}&user_id=${encodeURIComponent(botUserId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Client-Id': config.clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (res.status === 204 || res.status === 400) {
    botModStatusCache.set(`${broadcasterId}:${botUserId}`, {
      isMod: true,
      expiresAt: Date.now() + 120000,
    });
    return true;
  }

  const errText = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new Error('Missing "channel:manage:moderators" permission. Please click "Update Twitch Permissions" to grant access.');
  }

  throw new Error(`Failed to mod bot (${res.status}): ${errText}`);
}

/**
 * Fetch Twitch User information (id, login, display_name, profile_image_url).
 */
export async function getUser(token, loginOrId = null) {
  const url = new URL('https://api.twitch.tv/helix/users');
  if (loginOrId) {
    if (/^\d+$/.test(loginOrId)) {
      url.searchParams.set('id', loginOrId);
    } else {
      url.searchParams.set('login', loginOrId);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Client-Id': config.clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch user: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  return json.data && json.data.length > 0 ? json.data[0] : null;
}

/**
 * Validate token and return scopes & user details.
 */
export async function validateToken(token) {
  const res = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { 'Authorization': `OAuth ${token}` },
  });
  if (!res.ok) return null;
  return await res.json();
}

/**
 * SEND CHAT MESSAGE API (Helix)
 * Dispatches chat messages reliably into the streamer's channel.
 */
export async function sendChatMessage({ broadcasterId, senderId, message, replyParentMessageId = null }) {
  const token = await getAppAccessToken();

  const payload = {
    broadcaster_id: String(broadcasterId),
    sender_id: String(senderId),
    message: String(message).slice(0, 500),
  };

  if (replyParentMessageId) {
    payload.reply_parent_message_id = String(replyParentMessageId);
  }

  const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    headers: {
      'Client-Id': config.clientId,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Send chat message failed (${res.status}): ${errText}`);
  }

  const result = await res.json();
  return result.data?.[0];
}

/**
 * DELETE CHAT MESSAGE API (Helix) - For auto-moderation
 */
export async function deleteChatMessage({ broadcasterId, moderatorId, messageId }) {
  try {
    const token = await getValidBotToken();
    const url = new URL('https://api.twitch.tv/helix/moderation/chat');
    url.searchParams.set('broadcaster_id', String(broadcasterId));
    url.searchParams.set('moderator_id', String(moderatorId));
    url.searchParams.set('message_id', String(messageId));

    await fetch(url.toString(), {
      method: 'DELETE',
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });
  } catch (err) {
    console.warn('[Moderation] Could not delete message:', err.message);
  }
}

/**
 * TIMEOUT USER API (Helix) - For auto-moderation
 */
export async function timeoutUser({ broadcasterId, moderatorId, userId, duration = 60, reason = 'Automated moderation' }) {
  try {
    const token = await getValidBotToken();
    const url = new URL('https://api.twitch.tv/helix/moderation/bans');
    url.searchParams.set('broadcaster_id', String(broadcasterId));
    url.searchParams.set('moderator_id', String(moderatorId));

    await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          user_id: String(userId),
          duration: parseInt(duration, 10),
          reason: String(reason),
        },
      }),
    });
  } catch (err) {
    console.warn('[Moderation] Could not timeout user:', err.message);
  }
}

/**
 * PERMANENT BAN USER API (Helix) - For auto-moderation / scam bot elimination
 */
export async function banUser({ broadcasterId, moderatorId, userId, reason = 'Automated moderation' }) {
  try {
    const token = await getValidBotToken();
    const url = new URL('https://api.twitch.tv/helix/moderation/bans');
    url.searchParams.set('broadcaster_id', String(broadcasterId));
    url.searchParams.set('moderator_id', String(moderatorId));

    await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          user_id: String(userId),
          reason: String(reason),
        },
      }),
    });
  } catch (err) {
    console.warn('[Moderation] Could not ban user:', err.message);
  }
}

/**
 * Create an EventSub subscription (WebSocket)
 */
export async function createEventSubSubscription({ type, version = '1', condition, transport, token = null }) {
  const authToken = token || await getValidBotToken();

  const payload = {
    type,
    version,
    condition,
    transport,
  };

  const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
    method: 'POST',
    headers: {
      'Client-Id': config.clientId,
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Create EventSub subscription failed (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Fetch a user profile by Twitch login name via Helix.
 */
export async function getUserByLogin(login) {
  if (!login) return null;
  try {
    const token = await getAppAccessToken();
    const url = `https://api.twitch.tv/helix/users?login=${encodeURIComponent(login.toLowerCase())}`;
    const res = await fetch(url, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data?.[0];
    if (!data) return null;

    return {
      id: data.id,
      login: data.login,
      displayName: data.display_name,
      avatar: data.profile_image_url,
      avatarUrl: data.profile_image_url,
      profileImageUrl: data.profile_image_url,
    };
  } catch (err) {
    console.warn('[Twitch API] Could not fetch user by login:', login, err.message);
    return null;
  }
}

/**
 * Format milliseconds into a stream duration string (e.g. "2h 15m", "45m").
 */
export function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

/**
 * Format a followed_at timestamp into a friendly human-readable duration (e.g. "1 year, 2 months").
 */
export function formatFollowage(followedAt) {
  if (!followedAt) return 'not following';
  const diffMs = Date.now() - new Date(followedAt).getTime();
  if (diffMs <= 0) return 'just now';

  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const years = Math.floor(diffDays / 365);
  const remainingDays = diffDays % 365;
  const months = Math.floor(remainingDays / 30);
  const days = remainingDays % 30;

  const totalHours = Math.floor(diffMs / (60 * 60 * 1000));
  const hours = totalHours % 24;
  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const minutes = totalMinutes % 60;

  if (years > 0) {
    const yrStr = `${years} year${years > 1 ? 's' : ''}`;
    return months > 0 ? `${yrStr}, ${months} month${months > 1 ? 's' : ''}` : yrStr;
  }
  if (months > 0) {
    const moStr = `${months} month${months > 1 ? 's' : ''}`;
    return days > 0 ? `${moStr}, ${days} day${days > 1 ? 's' : ''}` : moStr;
  }
  if (days > 0) {
    const dStr = `${days} day${days > 1 ? 's' : ''}`;
    return hours > 0 ? `${dStr}, ${hours} hour${hours > 1 ? 's' : ''}` : dStr;
  }
  if (hours > 0) {
    const hStr = `${hours} hour${hours > 1 ? 's' : ''}`;
    return minutes > 0 ? `${hStr}, ${minutes} minute${minutes > 1 ? 's' : ''}` : hStr;
  }
  if (minutes > 0) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  return 'just now';
}

/**
 * Fetch live stream info for a broadcaster (or offline state) via Helix.
 */
export async function getStreamInfo(broadcasterId) {
  if (!broadcasterId) return null;
  const cached = streamInfoCache.get(String(broadcasterId));
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const token = await getAppAccessToken();
    const url = `https://api.twitch.tv/helix/streams?user_id=${encodeURIComponent(broadcasterId)}`;
    const res = await fetch(url, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const stream = json.data?.[0];

    let result;
    if (stream) {
      const startedAt = stream.started_at;
      const uptimeMs = Math.max(0, Date.now() - new Date(startedAt).getTime());
      result = {
        isLive: true,
        startedAt,
        uptimeMs,
        uptimeFormatted: formatDuration(uptimeMs),
        gameId: stream.game_id,
        gameName: stream.game_name || 'Just Chatting',
        title: stream.title || 'No title set',
        viewerCount: stream.viewer_count || 0,
      };
    } else {
      result = {
        isLive: false,
        startedAt: null,
        uptimeMs: 0,
        uptimeFormatted: 'offline',
        gameId: null,
        gameName: null,
        title: null,
        viewerCount: 0,
      };
    }

    streamInfoCache.set(String(broadcasterId), {
      data: result,
      expiresAt: Date.now() + 20000, // 20-second cache
    });

    return result;
  } catch (err) {
    console.warn('[Twitch API] Could not fetch stream info for', broadcasterId, err.message);
    return null;
  }
}

/**
 * Fetch channel stream metadata (last game, title) via Helix.
 */
export async function getChannelInformation(broadcasterId) {
  if (!broadcasterId) return null;
  const cached = channelInfoCache.get(String(broadcasterId));
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  try {
    const token = await getAppAccessToken();
    const url = `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(broadcasterId)}`;
    const res = await fetch(url, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data?.[0];
    if (!data) return null;

    const result = {
      broadcasterId: data.broadcaster_id,
      broadcasterLogin: data.broadcaster_login,
      broadcasterName: data.broadcaster_name,
      gameId: data.game_id,
      gameName: data.game_name || 'Just Chatting',
      title: data.title || 'No title set',
    };

    channelInfoCache.set(String(broadcasterId), {
      data: result,
      expiresAt: Date.now() + 30000, // 30-second cache
    });

    return result;
  } catch (err) {
    console.warn('[Twitch API] Could not fetch channel info for', broadcasterId, err.message);
    return null;
  }
}

/**
 * Check how long a user has followed a channel via Helix.
 */
export async function getFollowAge({ broadcasterId, userId, channelToken = null, botToken = null }) {
  if (!broadcasterId || !userId) return null;

  const cacheKey = `${broadcasterId}:${userId}`;
  const cached = followAgeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let token = channelToken;
  if (!token) {
    try {
      const channel = getChannel(broadcasterId);
      if (channel?.accessToken) {
        token = channel.accessToken;
      }
    } catch (_) {}
  }

  if (!token) {
    try {
      token = await getValidBotToken();
    } catch (_) {}
  }

  if (!token) {
    try {
      token = await getAppAccessToken();
    } catch (_) {}
  }

  try {
    const url = `https://api.twitch.tv/helix/channels/followers?broadcaster_id=${encodeURIComponent(broadcasterId)}&user_id=${encodeURIComponent(userId)}`;
    const res = await fetch(url, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Followage API] Query failed (${res.status}): ${errText}`);
      return {
        isFollowing: false,
        followedAt: null,
        followageFormatted: 'not following',
      };
    }

    const json = await res.json();
    const followData = json.data?.[0];

    let result;
    if (followData && followData.followed_at) {
      result = {
        isFollowing: true,
        followedAt: followData.followed_at,
        followageFormatted: formatFollowage(followData.followed_at),
      };
    } else {
      result = {
        isFollowing: false,
        followedAt: null,
        followageFormatted: 'not following',
      };
    }

    followAgeCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + 60000, // 60-second cache
    });

    return result;
  } catch (err) {
    console.warn('[Twitch API] Could not fetch followage for', broadcasterId, userId, err.message);
    return {
      isFollowing: false,
      followedAt: null,
      followageFormatted: 'not following',
    };
  }
}

/**
 * Send official Twitch native shoutout popup banner in chat via Helix.
 */
export async function sendTwitchShoutout({ broadcasterId, toBroadcasterId, moderatorId }) {
  try {
    const token = await getValidBotToken();
    const url = new URL('https://api.twitch.tv/helix/chat/shoutouts');
    url.searchParams.set('from_broadcaster_id', String(broadcasterId));
    url.searchParams.set('to_broadcaster_id', String(toBroadcasterId));
    url.searchParams.set('moderator_id', String(moderatorId));

    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[Shoutout] Twitch native shoutout returned (${res.status}): ${errText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Shoutout] Could not trigger native shoutout:', err.message);
    return false;
  }
}

/**
 * Fetch the bot's own RTMP stream key via Helix API (requires channel:read:stream_key).
 */
export async function getBotStreamKey() {
  const bot = getBotAccount();
  if (!bot || !bot.userId) return null;
  const token = await getValidBotToken();
  if (!token) return null;

  try {
    const res = await fetch(`https://api.twitch.tv/helix/streams/key?broadcaster_id=${bot.userId}`, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.stream_key || null;
  } catch (err) {
    console.warn('[Twitch API] Could not fetch bot stream key:', err.message);
    return null;
  }
}

/**
 * Resolves a category name or ID into its canonical Twitch { id, name }.
 */
export async function resolveTwitchCategory(categoryInput) {
  if (!categoryInput) return null;
  const trimmed = String(categoryInput).trim();
  if (!trimmed) return null;

  let token = null;
  try {
    token = await getValidBotToken();
  } catch (_) {
    try {
      token = await getAppAccessToken();
    } catch (_) {}
  }

  if (!token) return null;

  // 1. If numeric ID passed directly
  if (/^\d+$/.test(trimmed)) {
    try {
      const res = await fetch(`https://api.twitch.tv/helix/games?id=${encodeURIComponent(trimmed)}`, {
        headers: {
          'Client-Id': config.clientId,
          'Authorization': `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data && data.data.length > 0) {
          return { id: data.data[0].id, name: data.data[0].name };
        }
      }
    } catch (_) {}
    return { id: trimmed, name: trimmed };
  }

  // 2. Exact match by name
  try {
    const res = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(trimmed)}`, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        return { id: data.data[0].id, name: data.data[0].name };
      }
    }
  } catch (_) {}

  // 3. Search categories query
  try {
    const res = await fetch(`https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(trimmed)}`, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        const exact = data.data.find(
          (c) => c.name && c.name.toLowerCase() === trimmed.toLowerCase()
        );
        const selected = exact || data.data[0];
        return { id: selected.id, name: selected.name };
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Fetch current broadcast channel title and category from Twitch Helix.
 */
export async function getChannelBroadcastInfo(broadcasterId = null) {
  const bot = getBotAccount();
  const targetId = broadcasterId || bot?.userId;
  if (!targetId) return null;

  let token = null;
  try {
    token = await getValidBotToken();
  } catch (_) {
    try {
      token = await getAppAccessToken();
    } catch (_) {}
  }
  if (!token) return null;

  try {
    const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${targetId}`, {
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const channel = data.data?.[0];
    if (!channel) return null;

    return {
      broadcasterId: channel.broadcaster_id,
      login: channel.broadcaster_login,
      displayName: channel.broadcaster_name,
      title: channel.title || '',
      category: channel.game_name || '',
      categoryId: channel.game_id || '',
    };
  } catch (err) {
    console.warn('[Twitch API] Could not fetch channel broadcast info:', err.message);
    return null;
  }
}

/**
 * Update broadcast channel title and category on Twitch (requires channel:manage:broadcast).
 * Automatically resolves category names (e.g. "Software and Game Development" or "Always On")
 * to Twitch numeric game_ids and defaults to the central bot channel ID.
 */
export async function updateChannelBroadcast({ broadcasterId = null, title = null, category = null, categoryId = null } = {}) {
  const bot = getBotAccount();
  const targetBroadcasterId = broadcasterId || bot?.userId;
  if (!targetBroadcasterId) {
    console.warn('[Twitch API] Cannot update broadcast: No broadcasterId specified and bot account not registered.');
    return { ok: false, error: 'Central bot account not registered.' };
  }

  let token = null;
  try {
    token = await getValidBotToken();
  } catch (err) {
    console.warn('[Twitch API] Cannot update broadcast: Valid bot token not available:', err.message);
    return { ok: false, error: 'Central bot is not authorized with Twitch. Please authorize the bot in Host Control.' };
  }

  try {
    const body = {};
    if (title !== null && title !== undefined && String(title).trim().length > 0) {
      body.title = String(title).trim().slice(0, 140);
    }

    let resolvedCategory = null;
    const catInput = categoryId !== null && categoryId !== undefined ? categoryId : category;
    if (catInput !== null && catInput !== undefined) {
      const trimmedCat = String(catInput).trim();
      if (trimmedCat === '') {
        body.game_id = '';
      } else {
        resolvedCategory = await resolveTwitchCategory(trimmedCat);
        if (resolvedCategory && resolvedCategory.id) {
          body.game_id = String(resolvedCategory.id);
        } else {
          console.warn(`[Twitch API] Category "${trimmedCat}" not found on Twitch. Skipping game_id.`);
        }
      }
    }

    if (Object.keys(body).length === 0) {
      return { ok: true, message: 'No broadcast changes requested.' };
    }

    const res = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${targetBroadcasterId}`, {
      method: 'PATCH',
      headers: {
        'Client-Id': config.clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[Twitch API] Failed to update broadcast (status ${res.status}):`, errText);
      return { ok: false, error: `Twitch API rejected update (${res.status}): ${errText}` };
    }

    // Clear cached channel info so next read reflects updated metadata
    clearBroadcasterCaches(targetBroadcasterId);

    return {
      ok: true,
      title: body.title !== undefined ? body.title : undefined,
      category: resolvedCategory ? resolvedCategory.name : undefined,
      categoryId: body.game_id !== undefined ? body.game_id : undefined,
    };
  } catch (err) {
    console.warn('[Twitch API] Error updating channel broadcast info:', err.message);
    return { ok: false, error: err.message };
  }
}
