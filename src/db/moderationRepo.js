import { db } from './connection.js';

export function getModerationSettings(channelId) {
  const row = db.prepare(`
    SELECT * FROM moderation_settings WHERE channel_id = ?
  `).get(String(channelId));

  if (!row) {
    return {
      filterLinks: false,
      filterCaps: false,
      filterEmotes: false,
      maxEmotes: 10,
      filterRepetition: false,
      maxRepetition: 4,
      bannedWords: [],
    };
  }

  let banned = [];
  try {
    banned = JSON.parse(row.banned_words || '[]');
  } catch {}

  return {
    filterLinks: Boolean(row.filter_links),
    filterCaps: Boolean(row.filter_caps),
    filterEmotes: Boolean(row.filter_emotes),
    maxEmotes: parseInt(row.max_emotes, 10) || 10,
    filterRepetition: Boolean(row.filter_repetition),
    maxRepetition: parseInt(row.max_repetition, 10) || 4,
    bannedWords: banned,
  };
}

export function updateModerationSettings(channelId, settings) {
  const cId = String(channelId);
  const now = Date.now();
  const bannedJson = JSON.stringify(settings.bannedWords || []);

  const stmt = db.prepare(`
    INSERT INTO moderation_settings (channel_id, filter_links, filter_caps, filter_emotes, max_emotes, filter_repetition, max_repetition, banned_words, updated_at)
    VALUES (@channelId, @filterLinks, @filterCaps, @filterEmotes, @maxEmotes, @filterRepetition, @maxRepetition, @bannedWords, @updatedAt)
    ON CONFLICT(channel_id) DO UPDATE SET
      filter_links = excluded.filter_links,
      filter_caps = excluded.filter_caps,
      filter_emotes = excluded.filter_emotes,
      max_emotes = excluded.max_emotes,
      filter_repetition = excluded.filter_repetition,
      max_repetition = excluded.max_repetition,
      banned_words = excluded.banned_words,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    channelId: cId,
    filterLinks: settings.filterLinks ? 1 : 0,
    filterCaps: settings.filterCaps ? 1 : 0,
    filterEmotes: settings.filterEmotes ? 1 : 0,
    maxEmotes: parseInt(settings.maxEmotes, 10) || 10,
    filterRepetition: settings.filterRepetition ? 1 : 0,
    maxRepetition: parseInt(settings.maxRepetition, 10) || 4,
    bannedWords: bannedJson,
    updatedAt: now,
  });

  return getModerationSettings(cId);
}
