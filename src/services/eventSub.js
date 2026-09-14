import WebSocket from 'ws';
import { getBotAccount, getActiveChannels } from '../db/index.js';
import { createEventSubSubscription } from './twitchApi.js';
import { dispatchChatMessage } from './commandService.js';
import { handleIncomingRaid } from './raidService.js';

let ws = null;
let keepaliveTimeout = null;
let reconnectUrl = null;
let currentSessionId = null;
let isRunning = false;
const subscribedChannels = new Set();

const TWITCH_WS_URL = 'wss://eventsub.wss.twitch.tv/ws';

/**
 * Start the EventSub WebSocket listener.
 */
export function startEventSub() {
  if (isRunning) return;
  const bot = getBotAccount();
  if (!bot) {
    console.log('[EventSub] Waiting for central bot account to be connected before starting WebSocket.');
    return;
  }

  isRunning = true;
  connect(TWITCH_WS_URL);
}

/**
 * Stop the EventSub WebSocket listener.
 */
export function stopEventSub() {
  isRunning = false;
  clearTimeout(keepaliveTimeout);
  subscribedChannels.clear();
  currentSessionId = null;
  if (ws) {
    ws.close();
    ws = null;
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
      console.log(`[EventSub] Session initialized (${currentSessionId}). Syncing channel listeners...`);

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
 * Subscribe a single channel to chat and raid events.
 */
export async function subscribeChannel(broadcasterId) {
  if (!currentSessionId) return false;
  const bot = getBotAccount();
  if (!bot) return false;

  const bId = String(broadcasterId);
  if (subscribedChannels.has(bId)) return true;

  try {
    // 1. Subscribe to chat messages
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
    });

    // 2. Subscribe to incoming raids
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
      });
    } catch (raidErr) {
      console.warn(`[EventSub] Could not subscribe to channel.raid for ${bId}:`, raidErr.message);
    }

    subscribedChannels.add(bId);
    console.log(`[EventSub] Subscribed to channel ${bId} (chat & raids).`);
    return true;
  } catch (err) {
    console.error(`[EventSub] Failed to subscribe to channel ${bId}:`, err.message);
    return false;
  }
}

/**
 * Subscribe all active channels registered in the database.
 */
export async function subscribeAllActiveChannels() {
  const activeChannels = getActiveChannels();
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
  console.log(`[EventSub] Unsubscribed channel ${bId}.`);
}
