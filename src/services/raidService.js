import { getBotAccount, getChannel, getRaidSettings } from '../db/index.js';
import { sendChatMessage, sendTwitchShoutout, getChannelInformation } from './twitchApi.js';

// Cooldown tracker: `${channelId}:${raiderId}` -> lastRaidTimestamp
const raidCooldowns = new Map();

/**
 * Reset raid cooldown tracker (primarily for testing and cache reset).
 */
export function resetRaidCooldowns() {
  raidCooldowns.clear();
}

/**
 * Format raid announcement template with dynamic variables.
 */
export function formatRaidMessage(template, { raider, viewers, game = 'Just Chatting', url, channel }) {
  if (!template) return '';
  const cleanRaider = String(raider || '').replace(/^@/, '');
  const raiderUrl = url || `https://twitch.tv/${cleanRaider}`;
  const channelName = channel?.displayName || channel?.login || '';

  return template
    .replace(/{raider}/gi, cleanRaider)
    .replace(/{viewers}/gi, String(viewers || 0))
    .replace(/{game}/gi, game)
    .replace(/{url}/gi, raiderUrl)
    .replace(/{channel}/gi, channelName);
}

/**
 * Check if an incoming raid is eligible for automated welcome & shoutout.
 */
export function isRaidEligible(settings, { channelId, raiderId, viewers = 0, now = Date.now() }) {
  if (!settings || !settings.enabled) return false;

  const minViewers = settings.minViewers !== undefined ? settings.minViewers : 1;
  if (viewers < minViewers) return false;

  const cdKey = `${channelId}:${raiderId}`;
  const lastRaid = raidCooldowns.get(cdKey) || 0;
  const cooldownMs = (settings.cooldownMinutes || 0) * 60 * 1000;

  if (now - lastRaid < cooldownMs) {
    return false;
  }

  return true;
}

/**
 * Handle incoming EventSub channel.raid event.
 */
export async function handleIncomingRaid(event, {
  sendChatFn = sendChatMessage,
  sendShoutoutFn = sendTwitchShoutout,
  getChannelInfoFn = getChannelInformation,
  now = Date.now(),
} = {}) {
  const bot = getBotAccount();
  if (!bot) return null;

  const channelId = String(event.to_broadcaster_user_id);
  const raiderId = String(event.from_broadcaster_user_id);
  const raiderLogin = event.from_broadcaster_user_login;
  const raiderName = event.from_broadcaster_user_name || raiderLogin;
  const viewers = parseInt(event.viewers, 10) || 0;

  const channel = getChannel(channelId);
  if (!channel || !channel.joined) return null;

  const settings = channel.raidSettings || getRaidSettings(channelId);
  if (!isRaidEligible(settings, { channelId, raiderId, viewers, now })) {
    return null;
  }

  // Fetch raider's last played game/category
  let game = 'Just Chatting';
  try {
    const info = await getChannelInfoFn(raiderId);
    if (info?.gameName) {
      game = info.gameName;
    }
  } catch (err) {
    console.warn('[Raids] Could not fetch raider channel info:', err.message);
  }

  const message = formatRaidMessage(settings.message, {
    raider: raiderName,
    viewers,
    game,
    url: `https://twitch.tv/${raiderLogin}`,
    channel,
  });

  try {
    // 1. Send chat welcome announcement
    await sendChatFn({
      broadcasterId: channel.id,
      senderId: bot.userId,
      message,
    });

    // 2. Optionally fire Twitch's native popup shoutout banner
    if (settings.sendTwitchShoutout) {
      try {
        await sendShoutoutFn({
          broadcasterId: channel.id,
          toBroadcasterId: raiderId,
          moderatorId: bot.userId,
        });
      } catch (err) {
        console.warn('[Raids] Optional native shoutout skipped:', err.message);
      }
    }

    // 3. Persist cooldown
    const cdKey = `${channel.id}:${raiderId}`;
    raidCooldowns.set(cdKey, now);

    return {
      sent: true,
      channelId: channel.id,
      raiderId,
      raiderName,
      viewers,
      message,
    };
  } catch (err) {
    console.error(`[Raids] Failed to send raid greeting for @${raiderName} in channel ${channel.id}:`, err.message);
    return null;
  }
}
