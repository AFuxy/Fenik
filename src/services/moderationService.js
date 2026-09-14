import { deleteChatMessage, timeoutUser, banUser, sendChatMessage } from './twitchApi.js';
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

// Homoglyphs map: maps Cyrillic, Greek, and Unicode lookalikes to ASCII Latin
const HOMOGLYPHS_MAP = {
  // Cyrillic small letters
  'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y',
  'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԛ': 'q', 'в': 'b', 'к': 'k', 'м': 'm', 'н': 'h', 'т': 't',
  // Cyrillic capital letters
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'І': 'I', 'Ј': 'J',
  'К': 'K', 'М': 'M', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X',
  // Greek letters
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'ν': 'v', 'τ': 't',
  // Bullets and period equivalents
  '•': '.', '●': '.', '․': '.', '·': '.', '⋅': '.', '．': '.',
};

const HOMOGLYPHS_REGEX = new RegExp(`[${Object.keys(HOMOGLYPHS_MAP).join('')}]`, 'g');

/**
 * Common Top-Level Domains leveraged by spammers and standard web links
 */
export const COMMON_TLDS = 'com|net|org|ru|top|xyz|site|shop|online|biz|info|store|me|pro|gg|io|tv|cc|to|link|click|space|club|fun|live|buzz|vip|art|agency|tech|app|dev|co|uk|de';

/**
 * De-obfuscate chat text by removing invisible characters, normalizing Unicode,
 * mapping Cyrillic/Greek homoglyphs, resolving textual dot/slash substitutions,
 * collapsing whitespace around domain separators, and collapsing spaced single letters.
 */
export function deobfuscateText(text) {
  if (!text) return '';

  // 1. Strip zero-width and invisible characters
  let clean = String(text).replace(/[\u200B-\u200D\uFEFF\u00AD\u2060\u2063]/g, '');

  // 2. Unicode NFKD normalization (converts fullwidth e.g. ｄｏｇ -> dog)
  clean = clean.normalize('NFKD');

  // 3. Map homoglyphs (Cyrillic, Greek, bullet dots)
  clean = clean.replace(HOMOGLYPHS_REGEX, (ch) => HOMOGLYPHS_MAP[ch] || ch);

  // 4. Decode textual dot substitutions: (dot), [dot], {dot}, <dot>, " dot ", " d0t "
  clean = clean.replace(/[\(\[\{<]\s*(?:dot|d0t|\.)\s*[\)\]\}>]/gi, '.');
  clean = clean.replace(/\b(?:dot|d0t)\b/gi, '.');

  // 5. Decode textual slash substitutions: (slash), [slash], {slash}
  clean = clean.replace(/[\(\[\{<]\s*(?:slash|\/)\s*[\)\]\}>]/gi, '/');
  clean = clean.replace(/\bslash\b/gi, '/');

  // 6. Collapse single-character runs separated by spaces (e.g. "d o g v i e w s" -> "dogviews", "c o m" -> "com")
  clean = clean.replace(/\b([a-zA-Z0-9])(?:\s+([a-zA-Z0-9])){2,}\b/g, (match) => match.replace(/\s+/g, ''));
  clean = clean.replace(/(?<=\.)\s*([a-zA-Z0-9])(?:\s+([a-zA-Z0-9])){1,}\b/g, (match) => match.replace(/\s+/g, ''));

  // 7. Collapse spaces around dots and slashes (e.g. "dogviews . com" -> "dogviews.com")
  clean = clean.replace(/([a-zA-Z0-9_-])\s*\.\s*([a-zA-Z0-9_-])/g, '$1.$2');
  clean = clean.replace(/([a-zA-Z0-9_-])\s*\/\s*([a-zA-Z0-9_-])/g, '$1/$2');

  return clean;
}

export const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|org|net|tv|io|gg|me|dev|app|co|uk|de|xyz|ru|top|site|shop|online|biz|info|store|pro|cc|to|link|click|space|club|fun|live|buzz|vip|art|agency|tech)\b)/i;

export const OBFUSCATED_LINK_REGEX = new RegExp(
  `[a-zA-Z0-9_-]+\\s*(?:\\.|\\(dot\\)|\\[dot\\]|\\{dot\\}|\\bdot\\b)\\s*(?:${COMMON_TLDS})\\b`,
  'i'
);

export function containsLink(text) {
  if (!text) return false;
  return URL_REGEX.test(text);
}

export function detectObfuscatedLink(text) {
  if (!text) return false;
  if (URL_REGEX.test(text)) return true;
  if (OBFUSCATED_LINK_REGEX.test(text)) return true;

  const deob = deobfuscateText(text);
  if (URL_REGEX.test(deob)) return true;
  if (OBFUSCATED_LINK_REGEX.test(deob)) return true;

  return false;
}

const KNOWN_SCAM_PLATFORMS = [
  'dogviews',
  'topviews',
  'bigfollows',
  'streampromo',
  'topviewers',
  'streamviewers',
  'booststream',
  'twitchgrow',
  'viewers-shop',
  'fastviewers',
  'viewbot',
  'bestviewers',
  'viewershub',
  'channelboost',
  'buyfollowers',
  'buyviewers',
  'getfollowers',
];

/**
 * Detect fake view, follower seller, and viewbot promotion scam bots in chat.
 */
export function isScamBotMessage(text) {
  if (!text || text.length < 10) return false;
  const raw = String(text);
  const deob = deobfuscateText(raw).toLowerCase();
  const rawLower = raw.toLowerCase();

  // 1. Check known viewbot platform brand names
  const hasKnownScamBrand = KNOWN_SCAM_PLATFORMS.some(
    (brand) => deob.includes(brand) || rawLower.includes(brand)
  );
  if (hasKnownScamBrand) {
    return true;
  }

  // 2. Viewbot promotion patterns
  const hasLink = detectObfuscatedLink(raw) || containsLink(raw) || containsLink(deob);

  // Matches "become famous" or "wanna become famous"
  const hasBecomeFamous = /\b(?:wanna|want\s+to|wanna\s+be|want\s+to\s+be)?\s*become\s+famous\b/i.test(deob);
  if (hasBecomeFamous) {
    const hasEngagementTerms = /\b(?:views|viewers|followers|primes|chatters|channel|stream)\b/i.test(deob);
    if (hasEngagementTerms || hasLink) {
      return true;
    }
  }

  // Matches "buy followers", "buy viewers", "buy primes", "buy chatters"
  if (/\bbuy\s+(?:followers|viewers|views|primes|chatters)\b/i.test(deob)) {
    return true;
  }

  // Matches "cheap views", "cheap viewers", "cheap followers", "cheap primes"
  if (/\bcheap\s+(?:followers|viewers|views|primes|chatters)\b/i.test(deob)) {
    return true;
  }

  // Matches "primes and chatters", "primes & views", "primes, followers", etc.
  if (/\bprimes\s*(?:and|&|,|\+)\s*(?:chatters|views|viewers|followers)\b/i.test(deob)) {
    return true;
  }

  // Matches "best viewer bot" or "best viewbot"
  if (/\b(?:best\s+viewer\s*bot|best\s+viewbot|viewer\s*bot\s+for\s+twitch)\b/i.test(deob)) {
    return true;
  }

  // Matches "grow your channel/stream" or "boost your channel/stream" + link
  if (/\b(?:grow|boost)\s+your\s+(?:channel|stream)\b/i.test(deob) && hasLink) {
    return true;
  }

  return false;
}

/**
 * Detect unsolicited graphic artist / GFX copy-paste bots soliciting commissions.
 */
export function isGfxBotMessage(text) {
  if (!text || text.length < 35) return false;
  const deob = deobfuscateText(text).toLowerCase();

  const artistSignals = [
    'digital artist',
    'graphic designer',
    'freelance artist',
    'commission artist',
    'stream designer',
    'illustrator',
    'custom overlays',
    'custom emotes',
    'sub badges',
    'twitch badges',
    'stream overlay',
    'stream revamp',
    'vtuber model',
  ];

  const solicitationSignals = [
    'dm me on discord',
    'add me on discord',
    'message me on discord',
    'discord:',
    'discord tag',
    'check my portfolio',
    'cheap commissions',
    'affordable prices',
    'reasonable prices',
    'open for commission',
    'discord.gg',
  ];

  const hasArtistSignal = artistSignals.some((s) => deob.includes(s));
  const hasSolicitationSignal = solicitationSignals.some((s) => deob.includes(s));

  return hasArtistSignal && hasSolicitationSignal;
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

async function safeSendChat(params) {
  try {
    await sendChatMessage(params);
  } catch (err) {
    console.warn('[Auto-Moderation] Could not dispatch chat notice:', err.message);
  }
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

  // 0. Fake Views & Scam Bot Protection (Obfuscated Links, Fake Followers, Viewbots)
  if (moderation.filterScamBots !== false && isScamBotMessage(text)) {
    const action = moderation.scamAction || 'timeout';
    await deleteChatMessage({
      broadcasterId: channel.id,
      moderatorId: botId,
      messageId: event.message_id,
    });

    if (action === 'ban') {
      await banUser({
        broadcasterId: channel.id,
        moderatorId: botId,
        userId: event.chatter_user_id,
        reason: 'Automated scam bot / viewbot promotion ban',
      });
      await safeSendChat({
        broadcasterId: channel.id,
        senderId: botId,
        message: `@${chatterName} has been permanently banned for posting viewbot / follower scam promotions.`,
      });
      recordActivity(channel.id, {
        type: 'moderation',
        title: 'Scam Bot Banned',
        detail: `Permanently banned @${chatterName} for posting obfuscated viewbot scam`,
        actor: chatterName,
      });
    } else if (action === 'timeout') {
      await timeoutUser({
        broadcasterId: channel.id,
        moderatorId: botId,
        userId: event.chatter_user_id,
        duration: 600,
        reason: 'Automated scam bot / viewbot promotion timeout',
      });
      await safeSendChat({
        broadcasterId: channel.id,
        senderId: botId,
        message: `@${chatterName} has been timed out for posting viewbot / follower scam promotions.`,
      });
      recordActivity(channel.id, {
        type: 'moderation',
        title: 'Scam Bot Timed Out',
        detail: `Timed out @${chatterName} (600s) for posting obfuscated viewbot scam`,
        actor: chatterName,
      });
    } else {
      // delete only
      await safeSendChat({
        broadcasterId: channel.id,
        senderId: botId,
        message: `@${chatterName}, viewbot / follower scam promotions are strictly prohibited.`,
      });
      recordActivity(channel.id, {
        type: 'moderation',
        title: 'Scam Message Removed',
        detail: `Deleted obfuscated viewbot scam message from @${chatterName}`,
        actor: chatterName,
      });
    }
    return true;
  }

  // 0b. Unsolicited Graphic Artist / GFX Bot Filter
  if (moderation.filterGfxBots && isGfxBotMessage(text)) {
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
      reason: 'Automated unsolicited GFX bot timeout',
    });
    await safeSendChat({
      broadcasterId: channel.id,
      senderId: botId,
      message: `@${chatterName}, unsolicited art solicitations and portfolio spam are not permitted in chat.`,
    });
    recordActivity(channel.id, {
      type: 'moderation',
      title: 'GFX Bot Blocked',
      detail: `Timed out @${chatterName} (300s) for unsolicited graphic artist solicitation`,
      actor: chatterName,
    });
    return true;
  }

  // 1. Link Protection (checks standard URLs and obfuscated link variations)
  if (moderation.filterLinks && (containsLink(text) || detectObfuscatedLink(text)) && !hasLinkPermit(channel.id, event.chatter_user_login)) {
    await deleteChatMessage({
      broadcasterId: channel.id,
      moderatorId: botId,
      messageId: event.message_id,
    });
    await safeSendChat({
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
    await safeSendChat({
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
    await safeSendChat({
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
    await safeSendChat({
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
