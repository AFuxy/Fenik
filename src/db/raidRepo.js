import { db } from './connection.js';

export const DEFAULT_RAID_MESSAGE =
  'Huge raid welcome to @{raider} and their {viewers} raiders! They were last streaming {game}. Show them some love at {url} <3';

function mapRaidSettings(channelId, row) {
  if (!row) {
    return {
      channelId: String(channelId),
      enabled: true,
      minViewers: 1,
      message: DEFAULT_RAID_MESSAGE,
      cooldownMinutes: 30,
      sendTwitchShoutout: true,
      updatedAt: 0,
    };
  }

  return {
    channelId: row.channel_id,
    enabled: Boolean(row.enabled),
    minViewers: Number(row.min_viewers),
    message: row.message || DEFAULT_RAID_MESSAGE,
    cooldownMinutes: Number(row.cooldown_minutes),
    sendTwitchShoutout: Boolean(row.send_twitch_shoutout),
    updatedAt: Number(row.updated_at),
  };
}

/**
 * Fetch raid welcome and shoutout settings for a channel.
 */
export function getRaidSettings(channelId) {
  const row = db.prepare(`
    SELECT * FROM raid_settings WHERE channel_id = ?
  `).get(String(channelId));

  return mapRaidSettings(channelId, row);
}

/**
 * Update raid welcome and shoutout settings for a channel.
 */
export function updateRaidSettings(channelId, data = {}) {
  const current = getRaidSettings(channelId);

  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : (current.enabled ? 1 : 0);
  const minViewers = data.minViewers !== undefined
    ? Math.max(0, Math.min(10000, parseInt(data.minViewers, 10) || 0))
    : current.minViewers;
  const message = data.message !== undefined
    ? String(data.message || '').trim() || DEFAULT_RAID_MESSAGE
    : current.message;
  const cooldownMinutes = data.cooldownMinutes !== undefined
    ? Math.max(0, Math.min(1440, parseInt(data.cooldownMinutes, 10) || 0))
    : current.cooldownMinutes;
  const sendTwitchShoutout = data.sendTwitchShoutout !== undefined
    ? (data.sendTwitchShoutout ? 1 : 0)
    : (current.sendTwitchShoutout ? 1 : 0);

  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO raid_settings (channel_id, enabled, min_viewers, message, cooldown_minutes, send_twitch_shoutout, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      enabled = excluded.enabled,
      min_viewers = excluded.min_viewers,
      message = excluded.message,
      cooldown_minutes = excluded.cooldown_minutes,
      send_twitch_shoutout = excluded.send_twitch_shoutout,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    String(channelId),
    enabled,
    minViewers,
    message,
    cooldownMinutes,
    sendTwitchShoutout,
    now
  );

  return getRaidSettings(channelId);
}
