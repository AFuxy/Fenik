import { getBotAccount, getChannel, getShoutoutSettings, getAutoShoutout, updateAutoShoutoutLastTime } from '../db/index.js';
import { sendChatMessage, getChannelInformation, sendTwitchShoutout, getUserByLogin } from './twitchApi.js';
import { recordActivity } from './activityService.js';

// Cooldown tracker: `${channelId}` -> timestamp
const shoutoutCooldowns = new Map();

/**
 * Format a shoutout template with dynamic variables.
 */
export function formatShoutoutMessage(template, { target, game = 'Just Chatting', url, channel, user = '' }) {
  const cleanTarget = String(target || '').replace(/^@+/, '');
  const targetUrl = url || `https://twitch.tv/${cleanTarget}`;

  return template
    .replace(/{target}/gi, `@${cleanTarget}`)
    .replace(/{targetName}/gi, cleanTarget)
    .replace(/{game}/gi, game || 'Just Chatting')
    .replace(/{url}/gi, targetUrl)
    .replace(/{channel}/gi, channel?.displayName || channel?.login || '')
    .replace(/{user}/gi, user ? `@${String(user).replace(/^@+/, '')}` : '');
}

/**
 * Reset all in-memory cooldowns (for test isolation).
 */
export function resetShoutoutCooldowns() {
  shoutoutCooldowns.clear();
}

/**
 * Execute a shoutout for a target streamer.
 */
export async function executeShoutout({
  channelId,
  targetLogin,
  requestedBy = '',
  sendChatFn = sendChatMessage,
  sendShoutoutFn = sendTwitchShoutout,
  getChannelInfoFn = getChannelInformation,
  getUserByLoginFn = getUserByLogin,
}) {
  const channel = getChannel(channelId);
  if (!channel) return { success: false, reason: 'channel_not_found' };

  const settings = getShoutoutSettings(channelId);
  if (!settings || !settings.enabled) {
    return { success: false, reason: 'shoutout_disabled' };
  }

  const cleanTarget = String(targetLogin || '').trim().replace(/^@/, '').toLowerCase();
  if (!cleanTarget) {
    return { success: false, reason: 'invalid_target' };
  }

  const bot = getBotAccount();
  if (!bot) return { success: false, reason: 'bot_offline' };

  // Fetch target user info and channel category
  let game = 'their favorite game';
  let targetUserId = null;
  let targetDisplayName = cleanTarget;

  try {
    const targetUser = await getUserByLoginFn(cleanTarget);
    if (targetUser) {
      targetUserId = targetUser.id;
      targetDisplayName = targetUser.displayName || targetUser.login;
      const info = await getChannelInfoFn(targetUser.id);
      if (info?.gameName) {
        game = info.gameName;
      }
    }
  } catch (err) {
    console.warn('[Shoutout] Could not fetch target channel info:', err.message);
  }

  const formattedMessage = formatShoutoutMessage(settings.message, {
    target: targetDisplayName,
    game,
    url: `https://twitch.tv/${cleanTarget}`,
    channel,
    user: requestedBy,
  });

  // 1. Post chat shoutout
  await sendChatFn({
    broadcasterId: channel.id,
    senderId: bot.userId,
    message: formattedMessage,
  });

  recordActivity(channel.id, {
    type: 'shoutout',
    title: `Shoutout to @${cleanTarget}`,
    detail: formattedMessage,
    target: cleanTarget,
    actor: requestedBy || null,
  });

  // 2. If Twitch Native Shoutout Banner is enabled and target user ID exists
  if (settings.sendTwitchShoutout && targetUserId) {
    try {
      await sendShoutoutFn({
        broadcasterId: channel.id,
        toBroadcasterId: targetUserId,
        moderatorId: bot.userId,
      });
    } catch (err) {
      console.warn('[Shoutout] Twitch native shoutout banner skipped:', err.message);
    }
  }

  // If this target is in the auto-shoutout directory, update their last shouted timestamp
  try {
    if (getAutoShoutout(channel.id, cleanTarget)) {
      updateAutoShoutoutLastTime(channel.id, cleanTarget, Date.now());
    }
  } catch (_) {}

  return {
    success: true,
    channelId: channel.id,
    target: cleanTarget,
    message: formattedMessage,
  };
}

/**
 * Check and execute an auto-shoutout when a chatter speaks in a channel.
 * Default cooldown is 4 hours (14,400,000 ms) so chatters aren't repeatedly shouted out during the same stream.
 */
export async function checkAutoShoutoutOnChat({
  channel,
  chatterLogin,
  chatterUserId,
  sendChatFn = sendChatMessage,
  sendShoutoutFn = sendTwitchShoutout,
  getChannelInfoFn = getChannelInformation,
  getUserByLoginFn = getUserByLogin,
  cooldownMs = 4 * 60 * 60 * 1000,
}) {
  if (!channel || !chatterLogin) return { triggered: false, reason: 'missing_params' };

  const cleanChatter = String(chatterLogin).trim().toLowerCase().replace(/^@+/, '');
  if (!cleanChatter) return { triggered: false, reason: 'empty_login' };

  // Never shout out the broadcaster themself in their own chat
  if (String(channel.login || '').toLowerCase() === cleanChatter || String(channel.id) === String(chatterUserId)) {
    return { triggered: false, reason: 'is_broadcaster' };
  }

  // Never shout out the central bot
  const bot = getBotAccount();
  if (bot && (bot.userId === String(chatterUserId) || bot.login?.toLowerCase() === cleanChatter)) {
    return { triggered: false, reason: 'is_bot' };
  }

  // Check shoutout settings
  const settings = getShoutoutSettings(channel.id);
  if (!settings || !settings.enabled) {
    return { triggered: false, reason: 'shoutout_disabled' };
  }

  // Look up auto-shoutout entry
  const autoSo = getAutoShoutout(channel.id, cleanChatter);
  if (!autoSo || !autoSo.enabled) {
    return { triggered: false, reason: 'not_configured' };
  }

  // Check cooldown
  const now = Date.now();
  if (autoSo.lastShoutedAt && (now - autoSo.lastShoutedAt < cooldownMs)) {
    return { triggered: false, reason: 'on_cooldown', lastShoutedAt: autoSo.lastShoutedAt };
  }

  // Execute shoutout
  const res = await executeShoutout({
    channelId: channel.id,
    targetLogin: cleanChatter,
    requestedBy: 'Auto-Shoutout',
    sendChatFn,
    sendShoutoutFn,
    getChannelInfoFn,
    getUserByLoginFn,
  });

  if (res.success) {
    updateAutoShoutoutLastTime(channel.id, cleanChatter, now);
    return { triggered: true, ...res };
  }

  return { triggered: false, reason: res.reason || 'execution_failed' };
}

