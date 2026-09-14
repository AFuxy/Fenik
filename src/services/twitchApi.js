import { config } from '../config.js';
import { getBotAccount, setBotAccount } from '../db/index.js';

let cachedAppAccessToken = null;
let appTokenExpiresAt = 0;

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
 * Create an EventSub subscription (WebSocket)
 */
export async function createEventSubSubscription({ type, version = '1', condition, transport }) {
  const token = await getValidBotToken();

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
      'Authorization': `Bearer ${token}`,
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
 * Fetch channel stream metadata (last game, title) via Helix.
 */
export async function getChannelInformation(broadcasterId) {
  if (!broadcasterId) return null;
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

    return {
      broadcasterId: data.broadcaster_id,
      broadcasterLogin: data.broadcaster_login,
      broadcasterName: data.broadcaster_name,
      gameId: data.game_id,
      gameName: data.game_name || 'Just Chatting',
      title: data.title,
    };
  } catch (err) {
    console.warn('[Twitch API] Could not fetch channel info for', broadcasterId, err.message);
    return null;
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
