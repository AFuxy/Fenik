import {
  getBotAccount,
  getChannel,
  getChannelPointTriggers,
  getChannelPointTriggerById,
  recordRedemptionTriggerExecution,
} from '../db/index.js';
import { sendChatMessage, getStreamInfo, getChannelInformation } from './twitchApi.js';
import { recordActivity } from './activityService.js';

/**
 * Format channel point reward trigger message with dynamic variables.
 */
export async function formatRedemptionMessage(
  template,
  {
    user,
    reward,
    input = '',
    channel,
    counter = 1,
    getStreamInfoFn = getStreamInfo,
    getChannelInfoFn = getChannelInformation,
  } = {}
) {
  if (!template) return '';
  const cleanUser = String(user || '').replace(/^@/, '');
  const channelName = channel?.displayName || channel?.login || '';

  let text = template
    .replace(/@?{user}/gi, cleanUser ? `@${cleanUser}` : '')
    .replace(/{reward}/gi, String(reward || ''))
    .replace(/{input}/gi, String(input || ''))
    .replace(/@?{channel}/gi, (m) => m.startsWith('@') ? `@${channelName.replace(/^@/, '')}` : channelName.replace(/^@/, ''))
    .replace(/{count}/gi, String(counter))
    .replace(/{random\.(\d+)-(\d+)}/gi, (_, min, max) => {
      const low = parseInt(min, 10);
      const high = parseInt(max, 10);
      return String(Math.floor(Math.random() * (high - low + 1)) + low);
    });

  const needsUptime = /{uptime}/i.test(text);
  const needsGame = /{game}/i.test(text);
  const needsTitle = /{title}/i.test(text);

  if (needsUptime || needsGame || needsTitle) {
    let streamInfo = null;
    try {
      streamInfo = await getStreamInfoFn(channel?.id);
    } catch (_) {}

    let channelInfo = null;
    if ((needsGame && (!streamInfo?.isLive || !streamInfo?.gameName)) ||
        (needsTitle && (!streamInfo?.isLive || !streamInfo?.title))) {
      try {
        channelInfo = await getChannelInfoFn(channel?.id);
      } catch (_) {}
    }

    if (needsUptime) {
      const uptime = streamInfo?.isLive ? (streamInfo.uptimeFormatted || 'live') : 'offline';
      text = text.replace(/{uptime}/gi, uptime);
    }
    if (needsGame) {
      const game = streamInfo?.gameName || channelInfo?.gameName || 'Just Chatting';
      text = text.replace(/{game}/gi, game);
    }
    if (needsTitle) {
      const title = streamInfo?.title || channelInfo?.title || 'No title set';
      text = text.replace(/{title}/gi, title);
    }
  }

  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Find matching trigger for an incoming channel point redemption event.
 */
export function findMatchingTrigger(triggers = [], eventReward = {}) {
  if (!Array.isArray(triggers) || !eventReward) return null;
  const rewardId = String(eventReward.id || '').trim();
  const rewardTitle = String(eventReward.title || '').trim().toLowerCase();

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;

    // Match by ID if specified
    if (trigger.rewardId && rewardId && trigger.rewardId.trim() === rewardId) {
      return trigger;
    }

    // Match by reward title (case-insensitive)
    if (trigger.rewardTitle && trigger.rewardTitle.trim().toLowerCase() === rewardTitle) {
      return trigger;
    }
  }

  return null;
}

/**
 * Handle incoming EventSub channel.channel_points_custom_reward_redemption.add event.
 */
export async function executeRedemptionTrigger(event, {
  sendChatFn = sendChatMessage,
  getChannelFn = getChannel,
  getTriggersFn = getChannelPointTriggers,
  recordExecutionFn = recordRedemptionTriggerExecution,
  getStreamInfoFn = getStreamInfo,
  getChannelInfoFn = getChannelInformation,
  now = Date.now(),
} = {}) {
  const bot = getBotAccount();
  if (!bot) return null;

  const broadcasterId = String(event.broadcaster_user_id);
  if (!broadcasterId) return null;

  const channel = getChannelFn(broadcasterId);
  if (!channel || !channel.joined) return null;

  const triggers = getTriggersFn(broadcasterId);
  if (!triggers || triggers.length === 0) return null;

  const matchingTrigger = findMatchingTrigger(triggers, event.reward);
  if (!matchingTrigger) return null;

  // Cooldown check
  if (matchingTrigger.cooldownSeconds > 0) {
    const elapsed = now - (matchingTrigger.lastTriggeredAt || 0);
    if (elapsed < matchingTrigger.cooldownSeconds * 1000) {
      return null; // Cooldown active
    }
  }

  // Increment counter and update lastTriggeredAt
  const updatedTrigger = recordExecutionFn(matchingTrigger.id, now);
  const counter = updatedTrigger ? updatedTrigger.counter : matchingTrigger.counter + 1;

  const redeemerName = event.user_name || event.user_login || 'Viewer';
  const rewardTitle = event.reward?.title || matchingTrigger.rewardTitle;
  const userInput = event.user_input || '';

  const message = await formatRedemptionMessage(matchingTrigger.responseMessage, {
    user: redeemerName,
    reward: rewardTitle,
    input: userInput,
    channel,
    counter,
    getStreamInfoFn,
    getChannelInfoFn,
  });

  if (!message) return null;

  try {
    await sendChatFn({
      broadcasterId: channel.id,
      senderId: bot.userId,
      message,
    });
    recordActivity(channel.id, {
      type: 'reward',
      title: `Reward "${rewardTitle}"`,
      detail: message,
      actor: redeemerName,
    });
    return { success: true, trigger: matchingTrigger, message };
  } catch (err) {
    console.warn(`[Redemptions] Failed to send trigger response to #${channel.login}:`, err.message);
    return null;
  }
}

/**
 * Execute an on-demand test redemption for a trigger directly in chat.
 */
export async function executeTestRedemption(channelId, triggerId, {
  sendChatFn = sendChatMessage,
  getChannelFn = getChannel,
  getTriggerByIdFn = getChannelPointTriggerById,
  testInput = 'Sample user input text',
  getStreamInfoFn = getStreamInfo,
  getChannelInfoFn = getChannelInformation,
} = {}) {
  const bot = getBotAccount();
  if (!bot) throw new Error('Central bot account is not connected');

  const channel = getChannelFn(channelId);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);

  const trigger = getTriggerByIdFn(channelId, triggerId);
  if (!trigger) throw new Error(`Reward trigger not found: ${triggerId}`);

  const message = await formatRedemptionMessage(trigger.responseMessage, {
    user: 'LuckyRedeemer',
    reward: trigger.rewardTitle,
    input: testInput,
    channel,
    counter: trigger.counter + 1,
    getStreamInfoFn,
    getChannelInfoFn,
  });

  await sendChatFn({
    broadcasterId: channel.id,
    senderId: bot.userId,
    message: `[TEST] ${message}`,
  });

  return { success: true, message: `[TEST] ${message}` };
}
