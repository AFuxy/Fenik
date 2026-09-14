import { getBotAccount, getChannel, getStreamAlertSettings } from '../db/index.js';
import { sendChatMessage } from './twitchApi.js';
import { recordActivity } from './activityService.js';

/**
 * Human-readable tier label.
 */
export function formatTierName(tier) {
  if (!tier) return 'Tier 1';
  const str = String(tier);
  if (str === '1000') return 'Tier 1';
  if (str === '2000') return 'Tier 2';
  if (str === '3000') return 'Tier 3';
  if (/prime/i.test(str)) return 'Prime';
  return str;
}

/**
 * Format follow alert template with dynamic variables.
 */
export function formatFollowMessage(template, { user, channel }) {
  if (!template) return '';
  const cleanUser = String(user || '').replace(/^@/, '');
  const channelName = channel?.displayName || channel?.login || '';

  return template
    .replace(/@?{user}/gi, cleanUser ? `@${cleanUser}` : '')
    .replace(/@?{channel}/gi, (m) => m.startsWith('@') ? `@${channelName.replace(/^@/, '')}` : channelName.replace(/^@/, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format subscriber alert template with dynamic variables.
 */
export function formatSubMessage(template, {
  user,
  tier = '1000',
  months = 1,
  streak = 0,
  recipient = '',
  count = 1,
  message = '',
  channel,
}) {
  if (!template) return '';
  const cleanUser = String(user || '').replace(/^@/, '');
  const cleanRecipient = String(recipient || '').replace(/^@/, '');
  const tierFormatted = formatTierName(tier);
  const streakStr = streak && Number(streak) > 1 ? `${streak} month streak!` : '';
  const msgStr = message ? `"${message}"` : '';
  const channelName = channel?.displayName || channel?.login || '';

  return template
    .replace(/@?{user}/gi, cleanUser ? `@${cleanUser}` : '')
    .replace(/@?{recipient}/gi, cleanRecipient ? `@${cleanRecipient}` : '')
    .replace(/{tier}/gi, tierFormatted)
    .replace(/{months}/gi, String(months || 1))
    .replace(/{streak}/gi, streakStr)
    .replace(/{count}/gi, String(count || 1))
    .replace(/{message}/gi, msgStr)
    .replace(/@?{channel}/gi, (m) => m.startsWith('@') ? `@${channelName.replace(/^@/, '')}` : channelName.replace(/^@/, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Handle incoming EventSub channel.follow event.
 */
export async function executeFollowAlert(event, {
  sendChatFn = sendChatMessage,
  getChannelFn = getChannel,
  getAlertSettingsFn = getStreamAlertSettings,
} = {}) {
  const bot = getBotAccount();
  if (!bot) return null;

  const broadcasterId = String(event.broadcaster_user_id);
  const followerName = event.user_name || event.user_login;
  if (!broadcasterId || !followerName) return null;

  const channel = getChannelFn(broadcasterId);
  if (!channel || !channel.joined) return null;

  const settings = channel.streamAlerts || getAlertSettingsFn(broadcasterId);
  if (!settings || !settings.followEnabled) return null;

  const message = formatFollowMessage(settings.followMessage, {
    user: followerName,
    channel,
  });

  if (!message) return null;

  try {
    await sendChatFn({
      broadcasterId: channel.id,
      senderId: bot.userId,
      message,
    });
    recordActivity(channel.id, {
      type: 'alert',
      title: 'Follower Alert',
      detail: message,
      target: followerName,
    });
    return { success: true, message };
  } catch (err) {
    console.warn(`[Alerts] Failed to send follower alert to #${channel.login}:`, err.message);
    return null;
  }
}

/**
 * Handle incoming EventSub subscription events:
 * - channel.subscribe
 * - channel.subscription.message
 * - channel.subscription.gift
 */
export async function executeSubscriptionAlert(event, subType, {
  sendChatFn = sendChatMessage,
  getChannelFn = getChannel,
  getAlertSettingsFn = getStreamAlertSettings,
} = {}) {
  const bot = getBotAccount();
  if (!bot) return null;

  const broadcasterId = String(event.broadcaster_user_id);
  if (!broadcasterId) return null;

  const channel = getChannelFn(broadcasterId);
  if (!channel || !channel.joined) return null;

  const settings = channel.streamAlerts || getAlertSettingsFn(broadcasterId);
  if (!settings || !settings.subEnabled) return null;

  let message = '';

  if (subType === 'channel.subscribe') {
    // If it's a gift, skip individual notification to prevent chat floods on gift bombs
    if (event.is_gift) return null;

    const subscriberName = event.user_name || event.user_login;
    message = formatSubMessage(settings.subMessage, {
      user: subscriberName,
      tier: event.tier,
      channel,
    });
  } else if (subType === 'channel.subscription.message') {
    const subscriberName = event.user_name || event.user_login;
    message = formatSubMessage(settings.resubMessage, {
      user: subscriberName,
      tier: event.tier,
      months: event.cumulative_months,
      streak: event.streak_months,
      message: event.message?.text,
      channel,
    });
  } else if (subType === 'channel.subscription.gift') {
    const isAnon = Boolean(event.is_anonymous);
    const gifterName = isAnon ? 'An Anonymous Gifter' : (event.user_name || event.user_login || 'A Gifter');
    const totalGifts = Number(event.total || 1);

    if (totalGifts > 1) {
      // Community Sub Bomb
      message = formatSubMessage(settings.communityGiftMessage, {
        user: gifterName,
        count: totalGifts,
        tier: event.tier,
        channel,
      });
    } else {
      // Single Gift Sub
      message = formatSubMessage(settings.giftSubMessage, {
        user: gifterName,
        count: 1,
        tier: event.tier,
        recipient: event.recipient_user_name || event.recipient_user_login || 'a viewer',
        channel,
      });
    }
  }

  if (!message) return null;

  try {
    await sendChatFn({
      broadcasterId: channel.id,
      senderId: bot.userId,
      message,
    });
    recordActivity(channel.id, {
      type: 'alert',
      title: subType === 'channel.subscription.gift' ? 'Gift Sub Alert' : 'Subscription Alert',
      detail: message,
    });
    return { success: true, message, subType };
  } catch (err) {
    console.warn(`[Alerts] Failed to send subscription alert to #${channel.login}:`, err.message);
    return null;
  }
}

/**
 * Dispatch an on-demand test alert directly into the channel's chat.
 */
export async function executeTestAlert(channelId, alertType = 'follow', {
  sendChatFn = sendChatMessage,
  getChannelFn = getChannel,
  getAlertSettingsFn = getStreamAlertSettings,
} = {}) {
  const bot = getBotAccount();
  if (!bot) throw new Error('Central bot account is not connected');

  const channel = getChannelFn(channelId);
  if (!channel) throw new Error(`Channel not found: ${channelId}`);

  const settings = channel.streamAlerts || getAlertSettingsFn(channelId);
  let message = '';

  switch (alertType) {
    case 'follow':
      message = formatFollowMessage(settings.followMessage, {
        user: 'LuckySupporter',
        channel,
      });
      break;

    case 'sub':
      message = formatSubMessage(settings.subMessage, {
        user: 'LuckySupporter',
        tier: '1000',
        channel,
      });
      break;

    case 'resub':
      message = formatSubMessage(settings.resubMessage, {
        user: 'LoyalViewer',
        tier: '1000',
        months: 6,
        streak: 6,
        message: 'Best stream on Twitch! Keep it up!',
        channel,
      });
      break;

    case 'gift':
      message = formatSubMessage(settings.giftSubMessage, {
        user: 'GenerousFriend',
        tier: '1000',
        recipient: 'ExcitedChatter',
        channel,
      });
      break;

    case 'community_gift':
      message = formatSubMessage(settings.communityGiftMessage, {
        user: 'HypeGifter',
        tier: '1000',
        count: 5,
        channel,
      });
      break;

    default:
      throw new Error(`Unknown alert test type: ${alertType}`);
  }

  await sendChatFn({
    broadcasterId: channel.id,
    senderId: bot.userId,
    message: `[TEST] ${message}`,
  });

  return { success: true, message: `[TEST] ${message}` };
}
