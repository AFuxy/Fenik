import { deleteChatMessage, timeoutUser, sendChatMessage } from './twitchApi.js';

// Temporary link permits: `${channelId}:${username}` -> expiresAt (timestamp)
const linkPermits = new Map();

/**
 * Check if chatter is privileged (Broadcaster or Moderator).
 */
export function isPrivilegedUser(event, broadcasterId) {
  const isBroadcaster = event.chatter_user_id === String(broadcasterId) ||
    event.badges?.some((b) => b.set_id === 'broadcaster');
  if (isBroadcaster) return true;

  const isMod = event.badges?.some((b) => b.set_id === 'moderator');
  if (isMod) return true;

  return false;
}

/**
 * Grant a chatter a temporary link permit (60s).
 */
export function grantLinkPermit(channelId, username) {
  linkPermits.set(`${channelId}:${username.toLowerCase()}`, Date.now() + 60000);
}

export function hasLinkPermit(channelId, username) {
  const key = `${channelId}:${username.toLowerCase()}`;
  const expiry = linkPermits.get(key);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    linkPermits.delete(key);
    return false;
  }
  return true;
}

export const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|net|tv|io|gg|me|dev|app|co|uk|de|xyz)\b)/i;

export function containsLink(text) {
  if (!text) return false;
  return URL_REGEX.test(text);
}

export function isExcessiveCaps(text) {
  if (!text || text.length < 12) return false;
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 8) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  return upper / letters.length > 0.7;
}

export function containsBannedWord(text, bannedWords = []) {
  if (!text || !Array.isArray(bannedWords) || bannedWords.length === 0) return false;
  const lower = text.toLowerCase();
  return Boolean(bannedWords.find((w) => w && lower.includes(String(w).toLowerCase())));
}

/**
 * Run Auto-Moderation checks on a chat message.
 * Returns true if the message was moderated/deleted.
 */
export async function checkAutoModeration(event, channel, botId) {
  const moderation = channel.moderation || {};
  if (isPrivilegedUser(event, channel.id)) return false;

  const text = event.message?.text || '';

  // 1. Link Protection
  if (moderation.filterLinks && containsLink(text) && !hasLinkPermit(channel.id, event.chatter_user_login)) {
    await deleteChatMessage({
      broadcasterId: channel.id,
      moderatorId: botId,
      messageId: event.message_id,
    });
    await sendChatMessage({
      broadcasterId: channel.id,
      senderId: botId,
      message: `@${event.chatter_user_name}, links are not permitted in chat without a permit.`,
    });
    return true;
  }

  // 2. Excessive Caps Protection (>70% caps, min 12 characters)
  if (moderation.filterCaps && isExcessiveCaps(text)) {
    await deleteChatMessage({
      broadcasterId: channel.id,
      moderatorId: botId,
      messageId: event.message_id,
    });
    await sendChatMessage({
      broadcasterId: channel.id,
      senderId: botId,
      message: `@${event.chatter_user_name}, please refrain from excessive caps in chat.`,
    });
    return true;
  }

  // 3. Banned Words / Phrases Filter
  if (containsBannedWord(text, moderation.bannedWords)) {
    await deleteChatMessage({
      broadcasterId: channel.id,
      moderatorId: botId,
      messageId: event.message_id,
    });
    await timeoutUser({
      broadcasterId: channel.id,
      moderatorId: botId,
      userId: event.chatter_user_id,
      duration: 300,
      reason: 'Automated word filter violation',
    });
    return true;
  }

  return false;
}
