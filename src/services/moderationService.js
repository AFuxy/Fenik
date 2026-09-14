import { deleteChatMessage, timeoutUser, sendChatMessage } from './twitchApi.js';
import { recordActivity } from './activityService.js';

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
 * Count total emotes in a chat message (Twitch native emote fragments + Unicode emojis).
 */
export function countEmotes(event) {
  if (!event) return 0;
  // 1. Twitch native emote fragments from EventSub payload
  const fragments = event.message?.fragments || [];
  const twitchEmotes = fragments.filter((f) => f.type === 'emote').length;

  // 2. Unicode emojis in message text
  const text = event.message?.text || '';
  const emojiMatches = text.match(/[\p{Extended_Pictographic}\u{1F300}-\u{1F9FF}]/gu) || [];
  const unicodeEmojis = emojiMatches.length;

  return twitchEmotes + unicodeEmojis;
}

export function hasExcessiveEmotes(event, maxEmotes = 10) {
  return countEmotes(event) > maxEmotes;
}

/**
 * Detect repeated character or word spam in chat messages.
 */
export function isRepeatedTextSpam(text, maxRepetition = 4) {
  if (!text || text.length < 10) return false;

  // 1. Single character repeated many consecutive times (e.g. "aaaaaaaaaaaa" or "wwwwwwwwwwww")
  const charThreshold = Math.max(8, maxRepetition * 2);
  const charRegex = new RegExp(`(.)\\1{${charThreshold - 1},}`, 'i');
  if (charRegex.test(text)) return true;

  // 2. Consecutive repeated words (e.g. "spam spam spam spam spam")
  const wordRegex = new RegExp(`\\b(\\w+)\\b(?:\\s+\\1\\b){${maxRepetition - 1},}`, 'i');
  if (wordRegex.test(text)) return true;

  // 3. Short phrase repetition over full message
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= maxRepetition * 2) {
    const unique = new Set(words);
    if (unique.size <= 2) {
      return true;
    }
  }

  return false;
}

/**
 * Run Auto-Moderation checks on a chat message.
 * Returns true if the message was moderated/deleted.
 */
export async function checkAutoModeration(event, channel, botId) {
  const moderation = channel.moderation || {};
  if (isPrivilegedUser(event, channel.id)) return false;

  const text = event.message?.text || '';
  const chatterName = event.chatter_user_name || event.chatter_user_login || 'viewer';

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
      message: `@${chatterName}, links are not permitted in chat without a permit.`,
    });
    recordActivity(channel.id, {
      type: 'moderation',
      title: 'Link Removed',
      detail: `Deleted unauthorized link posted by @${chatterName}`,
      actor: chatterName,
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
      message: `@${chatterName}, please refrain from excessive caps in chat.`,
    });
    recordActivity(channel.id, {
      type: 'moderation',
      title: 'Caps Warning',
      detail: `Deleted message with excessive caps from @${chatterName}`,
      actor: chatterName,
    });
    return true;
  }

  // 3. Emote Limit Protection
  const maxEmotes = moderation.maxEmotes || 10;
  if (moderation.filterEmotes && hasExcessiveEmotes(event, maxEmotes)) {
    const totalEmotes = countEmotes(event);
    await deleteChatMessage({
      broadcasterId: channel.id,
      moderatorId: botId,
      messageId: event.message_id,
    });
    await sendChatMessage({
      broadcasterId: channel.id,
      senderId: botId,
      message: `@${chatterName}, please limit emotes in chat (max ${maxEmotes}).`,
    });
    recordActivity(channel.id, {
      type: 'moderation',
      title: 'Emote Limit Exceeded',
      detail: `Deleted message with ${totalEmotes} emotes from @${chatterName} (limit: ${maxEmotes})`,
      actor: chatterName,
    });
    return true;
  }

  // 4. Repeated Text / Spam Protection
  const maxRep = moderation.maxRepetition || 4;
  if (moderation.filterRepetition && isRepeatedTextSpam(text, maxRep)) {
    await deleteChatMessage({
      broadcasterId: channel.id,
      moderatorId: botId,
      messageId: event.message_id,
    });
    await sendChatMessage({
      broadcasterId: channel.id,
      senderId: botId,
      message: `@${chatterName}, please avoid repeated text spam in chat.`,
    });
    recordActivity(channel.id, {
      type: 'moderation',
      title: 'Repetition Spam Removed',
      detail: `Deleted repetitive spam message from @${chatterName}`,
      actor: chatterName,
    });
    return true;
  }

  // 5. Banned Words / Phrases Filter
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
    recordActivity(channel.id, {
      type: 'moderation',
      title: 'Banned Word Timeout',
      detail: `Timed out @${chatterName} for 300s due to blacklisted word violation`,
      actor: chatterName,
    });
    return true;
  }

  return false;
}
