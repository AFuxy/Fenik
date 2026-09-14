import WebSocket from 'ws';
import { getBotAccount, getActiveChannels, getChannel } from '../db/index.js';
import {
  createEventSubSubscription,
  getValidBotToken,
  getValidChannelToken,
  validateUserToken,
  checkBotModeratorStatus,
} from './twitchApi.js';
import { dispatchChatMessage } from './commandService.js';
import { handleIncomingRaid } from './raidService.js';
import { executeFollowAlert, executeSubscriptionAlert } from './alertService.js';
import { executeRedemptionTrigger } from './redemptionService.js';

let ws = null;
let keepaliveTimeout = null;
let reconnectUrl = null;
let currentSessionId = null;
let isRunning = false;
const subscribedChannels = new Set();
const broadcasterSockets = new Map(); // broadcasterId -> { ws, sessionId, keepaliveTimeout, reconnectTimeout, token, login, wantsSubs, wantsPoints }

const TWITCH_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

/**
 * Start the EventSub WebSocket listener.
 */
export async function startEventSub() {
  if (isRunning) return;
  const bot = getBotAccount();
  if (!bot) {
    console.log('[EventSub] Waiting for central bot account to be connected before starting WebSocket.');
    return;
  }

  // Pre-flight check on central bot token scopes
  try {
    const botToken = await getValidBotToken();
    const botValidation = await validateUserToken(botToken);
    const botScopes = new Set(botValidation?.scopes || []);
    if (!botScopes.has('moderator:read:followers')) {
      console.log(`[EventSub] Note: Central bot @${bot.displayName} lacks 'moderator:read:followers' scope. Follower alerts will remain inactive until bot is re-authorized in Admin Panel.`);
    }
  } catch (_) {}

  isRunning = true;
  connect(TWITCH_WS_URL);
}

/**
 * Stop the EventSub WebSocket listener and any broadcaster sockets.
 */
export function stopEventSub() {
  isRunning = false;
  clearTimeout(keepaliveTimeout);
  subscribedChannels.clear();
  currentSessionId = null;
  if (ws) {
    try {
      ws.removeAllListeners();
      ws.close();
    } catch (_) {}
    ws = null;
  }
  for (const bId of broadcasterSockets.keys()) {
    closeBroadcasterSocket(bId);
  }
}

function connect(url) {
  console.log(`[EventSub] Connecting to Twitch WebSocket...`);
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('[EventSub] WebSocket connection established.');
  });

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleSocketMessage(message);
    } catch (err) {
      console.error('[EventSub] Error parsing WebSocket message:', err);
    }
  });

  ws.on('error', (err) => {
    console.error('[EventSub] WebSocket error:', err.message);
  });

  ws.on('close', (code, reason) => {
    console.warn(`[EventSub] WebSocket closed (${code}): ${reason.toString()}`);
    clearTimeout(keepaliveTimeout);
    subscribedChannels.clear();

    if (isRunning) {
      const nextUrl = reconnectUrl || TWITCH_WS_URL;
      reconnectUrl = null;
      console.log('[EventSub] Reconnecting in 3s...');
      setTimeout(() => connect(nextUrl), 3000);
    }
  });
}

async function handleSocketMessage(message) {
  const { metadata, payload } = message;
  const messageType = metadata?.message_type;

  switch (messageType) {
    case 'session_welcome': {
      currentSessionId = payload.session.id;
      const keepaliveSec = payload.session.keepalive_timeout_seconds || 10;
      resetKeepaliveTimer(keepaliveSec);
      console.log(`[EventSub] Central bot session initialized (${currentSessionId}). Syncing channel listeners...`);

      // Subscribe to all active channels
      await subscribeAllActiveChannels();
      break;
    }

    case 'session_keepalive': {
      resetKeepaliveTimer(15);
      break;
    }

    case 'session_reconnect': {
      reconnectUrl = payload.session?.reconnect_url;
      console.log(`[EventSub] Reconnect requested by Twitch.`);
      break;
    }

    case 'notification': {
      resetKeepaliveTimer(15);
      const subType = metadata?.subscription_type;
      if (subType === 'channel.chat.message') {
        try {
          await dispatchChatMessage(payload.event);
        } catch (err) {
          console.error('[EventSub] Error handling chat message:', err);
        }
      } else if (subType === 'channel.raid') {
        try {
          await handleIncomingRaid(payload.event);
        } catch (err) {
          console.error('[EventSub] Error handling raid event:', err);
        }
      } else if (subType === 'channel.follow') {
        try {
          await executeFollowAlert(payload.event);
        } catch (err) {
          console.error('[EventSub] Error handling follow alert:', err);
        }
      } else if (
        subType === 'channel.subscribe' ||
        subType === 'channel.subscription.message' ||
        subType === 'channel.subscription.gift'
      ) {
        try {
          await executeSubscriptionAlert(payload.event, subType);
        } catch (err) {
          console.error('[EventSub] Error handling subscription alert:', err);
        }
      } else if (subType === 'channel.channel_points_custom_reward_redemption.add') {
        try {
          await executeRedemptionTrigger(payload.event);
        } catch (err) {
          console.error('[EventSub] Error handling redemption trigger:', err);
        }
      }
      break;
    }

    case 'revocation': {
      const bId = payload.subscription?.condition?.broadcaster_user_id || payload.subscription?.condition?.to_broadcaster_user_id;
      if (bId) subscribedChannels.delete(bId);
      console.warn(`[EventSub] Subscription revoked for channel ${bId}:`, payload.subscription?.status);
      break;
    }

    default:
      break;
  }
}

function resetKeepaliveTimer(seconds) {
  clearTimeout(keepaliveTimeout);
  keepaliveTimeout = setTimeout(() => {
    console.warn('[EventSub] Keepalive timeout expired. Reconnecting...');
    if (ws) ws.close();
  }, (seconds + 2) * 1000);
}

/**
 * Helper to subscribe to subscription alerts (channel.subscribe, message, gift).
 */
async function subscribeSubs(bId, sessionId, token, login) {
  const types = [
    { type: 'channel.subscribe', version: '1' },
    { type: 'channel.subscription.message', version: '1' },
    { type: 'channel.subscription.gift', version: '1' },
  ];

  for (const { type, version } of types) {
    try {
      await createEventSubSubscription({
        type,
        version,
        condition: { broadcaster_user_id: bId },
        transport: { method: 'websocket', session_id: sessionId },
        token,
      });
    } catch (err) {
      if (!err.message?.includes('already exists')) {
        console.warn(`[EventSub] Sub alert notice (${type}) for #${login || bId}:`, err.message);
      }
    }
  }
}

/**
 * Helper to subscribe to channel point redemption triggers.
 */
async function subscribePoints(bId, sessionId, token, login) {
  try {
    await createEventSubSubscription({
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      condition: { broadcaster_user_id: bId },
      transport: { method: 'websocket', session_id: sessionId },
      token,
    });
  } catch (err) {
    if (!err.message?.includes('already exists')) {
      console.warn(`[EventSub] Reward redemption notice for #${login || bId}:`, err.message);
    }
  }
}

/**
 * Close and tear down a broadcaster-specific WebSocket listener.
 */
function closeBroadcasterSocket(bId) {
  const entry = broadcasterSockets.get(bId);
  if (!entry) return;
  clearTimeout(entry.keepaliveTimeout);
  clearTimeout(entry.reconnectTimeout);
  if (entry.ws) {
    try {
      entry.ws.removeAllListeners();
      entry.ws.close();
    } catch (_) {}
  }
  broadcasterSockets.delete(bId);
}

/**
 * Connect or synchronize a dedicated WebSocket for a broadcaster who granted subscriber or redemption scopes.
 * Solves Twitch error: "websocket transport cannot have subscriptions created by different users".
 */
function syncBroadcasterSocket(bId, channel, { broadcasterToken, wantsSubs, wantsPoints }) {
  const existing = broadcasterSockets.get(bId);
  if (existing && existing.ws && (existing.ws.readyState === WebSocket.OPEN || existing.ws.readyState === WebSocket.CONNECTING)) {
    existing.wantsSubs = wantsSubs;
    existing.wantsPoints = wantsPoints;
    existing.token = broadcasterToken;
    if (existing.sessionId) {
      if (wantsSubs) subscribeSubs(bId, existing.sessionId, broadcasterToken, channel.login);
      if (wantsPoints) subscribePoints(bId, existing.sessionId, broadcasterToken, channel.login);
    }
    return;
  }

  closeBroadcasterSocket(bId);

  const socketState = {
    ws: null,
    sessionId: null,
    keepaliveTimeout: null,
    reconnectTimeout: null,
    wantsSubs,
    wantsPoints,
    token: broadcasterToken,
    login: channel.login,
  };

  broadcasterSockets.set(bId, socketState);
  connectBroadcasterSocket(bId);
}

function connectBroadcasterSocket(bId) {
  const state = broadcasterSockets.get(bId);
  if (!state || !isRunning) return;

  const bWs = new WebSocket(TWITCH_WS_URL);
  state.ws = bWs;

  function resetBKeepalive(sec) {
    clearTimeout(state.keepaliveTimeout);
    state.keepaliveTimeout = setTimeout(() => {
      console.warn(`[EventSub] Keepalive timeout for #${state.login} listener. Reconnecting...`);
      if (bWs) bWs.close();
    }, (sec + 2) * 1000);
  }

  bWs.on('open', () => {
    // Awaiting welcome
  });

  bWs.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const { metadata, payload } = msg;
      const msgType = metadata?.message_type;

      if (msgType === 'session_welcome') {
        state.sessionId = payload.session.id;
        const keepaliveSec = payload.session.keepalive_timeout_seconds || 10;
        resetBKeepalive(keepaliveSec);
        console.log(`[EventSub] Dedicated listener active for #${state.login} (${state.sessionId}).`);

        if (state.wantsSubs) {
          await subscribeSubs(bId, state.sessionId, state.token, state.login);
        }
        if (state.wantsPoints) {
          await subscribePoints(bId, state.sessionId, state.token, state.login);
        }
      } else if (msgType === 'session_keepalive') {
        resetBKeepalive(15);
      } else if (msgType === 'notification') {
        resetBKeepalive(15);
        const subType = metadata?.subscription_type;
        if (
          subType === 'channel.subscribe' ||
          subType === 'channel.subscription.message' ||
          subType === 'channel.subscription.gift'
        ) {
          try {
            await executeSubscriptionAlert(payload.event, subType);
          } catch (err) {
            console.error(`[EventSub] Error handling subscription alert for #${state.login}:`, err);
          }
        } else if (subType === 'channel.channel_points_custom_reward_redemption.add') {
          try {
            await executeRedemptionTrigger(payload.event);
          } catch (err) {
            console.error(`[EventSub] Error handling redemption trigger for #${state.login}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[EventSub] Error parsing message on #${state.login} listener:`, err);
    }
  });

  bWs.on('error', (err) => {
    console.warn(`[EventSub] WebSocket error for #${state.login}:`, err.message);
  });

  bWs.on('close', (code, reason) => {
    clearTimeout(state.keepaliveTimeout);
    state.sessionId = null;
    if (isRunning && broadcasterSockets.has(bId)) {
      clearTimeout(state.reconnectTimeout);
      state.reconnectTimeout = setTimeout(() => {
        if (isRunning && broadcasterSockets.has(bId)) {
          connectBroadcasterSocket(bId);
        }
      }, 5000);
    }
  });
}

/**
 * Subscribe a single channel to chat, raid, follow, sub, and redemption events.
 * Performs rigorous pre-flight scope validation to avoid unauthorized Twitch API requests.
 */
export async function subscribeChannel(broadcasterId) {
  if (!currentSessionId) return false;
  const bot = getBotAccount();
  if (!bot) return false;

  const bId = String(broadcasterId);
  // 1. Skip non-numeric / test mock channel IDs immediately
  if (!/^\d+$/.test(bId)) {
    return false;
  }

  const channel = getChannel(bId);
  if (!channel || !channel.joined) return false;

  let botToken = null;
  try {
    botToken = await getValidBotToken();
  } catch (err) {
    console.warn('[EventSub] Central bot token not available:', err.message);
    return false;
  }

  // Pre-validate bot token and obtain granted scopes
  const botValidation = await validateUserToken(botToken);
  const botScopes = new Set(botValidation?.scopes || []);

  // 1. Subscribe to chat messages on Central Bot WebSocket
  try {
    await createEventSubSubscription({
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: bId,
        user_id: String(bot.userId),
      },
      transport: {
        method: 'websocket',
        session_id: currentSessionId,
      },
      token: botToken,
    });
  } catch (err) {
    if (!err.message?.includes('already exists')) {
      console.warn(`[EventSub] Chat listener notice for #${channel.login}:`, err.message);
    }
  }

  // 2. Subscribe to incoming raids on Central Bot WebSocket
  try {
    await createEventSubSubscription({
      type: 'channel.raid',
      version: '1',
      condition: {
        to_broadcaster_user_id: bId,
      },
      transport: {
        method: 'websocket',
        session_id: currentSessionId,
      },
      token: botToken,
    });
  } catch (raidErr) {
    if (!raidErr.message?.includes('already exists')) {
      console.warn(`[EventSub] Raid listener notice for #${channel.login}:`, raidErr.message);
    }
  }

  let broadcasterToken = null;
  try {
    broadcasterToken = await getValidChannelToken(bId);
  } catch (_) {}

  // 3. Follower alerts (channel.follow v2)
  // Strict pre-check:
  // - Bot token MUST have 'moderator:read:followers' scope
  // - Streamer must have followEnabled !== false
  // - Bot must be moderator in the channel
  const streamAlerts = channel.streamAlerts || {};
  const followEnabled = streamAlerts.followEnabled !== false;

  if (botScopes.has('moderator:read:followers') && followEnabled) {
    let isMod = bId === String(bot.userId);
    if (!isMod) {
      isMod = await checkBotModeratorStatus({
        broadcasterId: bId,
        botUserId: bot.userId,
        userToken: broadcasterToken,
      });
    }

    if (isMod) {
      try {
        await createEventSubSubscription({
          type: 'channel.follow',
          version: '2',
          condition: {
            broadcaster_user_id: bId,
            moderator_user_id: String(bot.userId),
          },
          transport: {
            method: 'websocket',
            session_id: currentSessionId,
          },
          token: botToken,
        });
      } catch (followErr) {
        if (!followErr.message?.includes('already exists')) {
          console.warn(`[EventSub] Follow alert notice for #${channel.login}:`, followErr.message);
        }
      }
    }
  }

  // 4. Broadcaster-scoped Subscriptions & Redemptions
  // Strict pre-check:
  // - Broadcaster token must exist and have channel:read:subscriptions / channel:read:redemptions
  // - Streamer must have enabled sub alerts or redemptions
  if (broadcasterToken) {
    const chValidation = await validateUserToken(broadcasterToken);
    const chScopes = new Set(chValidation?.scopes || []);

    const hasSubScope = chScopes.has('channel:read:subscriptions');
    const wantsSubs = hasSubScope && streamAlerts.subEnabled !== false;

    const hasPointsScope = chScopes.has('channel:read:redemptions');
    const triggers = channel.channelPointTriggers || [];
    const wantsPoints = hasPointsScope && Array.isArray(triggers) && triggers.some((t) => t.enabled);

    if (bId === String(bot.userId)) {
      // If broadcaster IS the central bot account, subscriptions live on bot WebSocket
      if (wantsSubs) {
        await subscribeSubs(bId, currentSessionId, botToken, channel.login);
      }
      if (wantsPoints) {
        await subscribePoints(bId, currentSessionId, botToken, channel.login);
      }
    } else if (wantsSubs || wantsPoints) {
      // Connect dedicated Broadcaster WebSocket for this user (avoids Twitch 400 user mismatch)
      syncBroadcasterSocket(bId, channel, {
        broadcasterToken,
        wantsSubs,
        wantsPoints,
      });
    } else {
      // Broadcaster has no active sub alerts or point triggers, or lacks scopes: ensure no socket is open
      closeBroadcasterSocket(bId);
    }
  }

  subscribedChannels.add(bId);
  console.log(`[EventSub] Subscribed to channel #${channel.login} (${bId}) for chat & raids.`);
  return true;
}

/**
 * Subscribe all active channels registered in the database.
 * Automatically filters out non-numeric mock test IDs to avoid unnecessary API requests.
 */
export async function subscribeAllActiveChannels() {
  const activeChannels = getActiveChannels().filter((ch) => /^\d+$/.test(String(ch.id)));
  console.log(`[EventSub] Subscribing ${activeChannels.length} active channel(s)...`);

  for (const channel of activeChannels) {
    await subscribeChannel(channel.id);
  }
}

/**
 * Unsubscribe a single channel from EventSub tracking.
 */
export function unsubscribeChannel(broadcasterId) {
  if (!broadcasterId) return;
  const bId = String(broadcasterId);
  subscribedChannels.delete(bId);
  closeBroadcasterSocket(bId);
  console.log(`[EventSub] Unsubscribed channel ${bId}.`);
}
