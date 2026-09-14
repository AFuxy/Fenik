import { db } from './connection.js';

export function getModerationSettings(channelId) {
  const row = db.prepare(`
    SELECT * FROM moderation_settings WHERE channel_id = ?
  `).get(String(channelId));

  if (!row) {
    return {
      filterLinks: false,
      filterCaps: false,
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
    bannedWords: banned,
  };
}

export function updateModerationSettings(channelId, settings) {
  const cId = String(channelId);
  const now = Date.now();
  const bannedJson = JSON.stringify(settings.bannedWords || []);

  const stmt = db.prepare(`
    INSERT INTO moderation_settings (channel_id, filter_links, filter_caps, banned_words, updated_at)
    VALUES (@channelId, @filterLinks, @filterCaps, @bannedWords, @updatedAt)
    ON CONFLICT(channel_id) DO UPDATE SET
      filter_links = excluded.filter_links,
      filter_caps = excluded.filter_caps,
      banned_words = excluded.banned_words,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    channelId: cId,
    filterLinks: settings.filterLinks ? 1 : 0,
    filterCaps: settings.filterCaps ? 1 : 0,
    bannedWords: bannedJson,
    updatedAt: now,
  });

  return getModerationSettings(cId);
}
