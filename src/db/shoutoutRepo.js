import { db } from './connection.js';

export const DEFAULT_SHOUTOUT_MESSAGE =
  'Shoutout to @{target}! Check them out over at {url} - they were last streaming {game}! Give them a follow! <3';

function mapShoutoutSettings(channelId, row) {
  if (!row) {
    return {
      channelId: String(channelId),
      enabled: true,
      message: DEFAULT_SHOUTOUT_MESSAGE,
      autoOnRaid: true,
      sendTwitchShoutout: true,
      userlevel: 'mod',
      cooldownSeconds: 15,
      updatedAt: 0,
    };
  }

  return {
    channelId: row.channel_id,
    enabled: Boolean(row.enabled),
    message: row.message || DEFAULT_SHOUTOUT_MESSAGE,
    autoOnRaid: Boolean(row.auto_on_raid),
    sendTwitchShoutout: Boolean(row.send_twitch_shoutout),
    userlevel: row.userlevel || 'mod',
    cooldownSeconds: Number(row.cooldown_seconds) || 15,
    updatedAt: Number(row.updated_at),
  };
}

/**
 * Fetch shoutout settings for a channel.
 */
export function getShoutoutSettings(channelId) {
  const row = db.prepare(`
    SELECT * FROM shoutout_settings WHERE channel_id = ?
  `).get(String(channelId));

  return mapShoutoutSettings(channelId, row);
}

/**
 * Update shoutout settings for a channel.
 */
export function updateShoutoutSettings(channelId, data = {}) {
  const current = getShoutoutSettings(channelId);

  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : (current.enabled ? 1 : 0);
  const message = data.message !== undefined
    ? String(data.message || '').trim() || DEFAULT_SHOUTOUT_MESSAGE
    : current.message;
  const autoOnRaid = data.autoOnRaid !== undefined
    ? (data.autoOnRaid ? 1 : 0)
    : (current.autoOnRaid ? 1 : 0);
  const sendTwitchShoutout = data.sendTwitchShoutout !== undefined
    ? (data.sendTwitchShoutout ? 1 : 0)
    : (current.sendTwitchShoutout ? 1 : 0);
  
  const validLevels = ['everyone', 'vip', 'mod', 'broadcaster'];
  const userlevel = validLevels.includes(data.userlevel) ? data.userlevel : current.userlevel;

  const cooldownSeconds = data.cooldownSeconds !== undefined
    ? Math.max(0, Math.min(3600, parseInt(data.cooldownSeconds, 10) || 0))
    : current.cooldownSeconds;

  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO shoutout_settings (channel_id, enabled, message, auto_on_raid, send_twitch_shoutout, userlevel, cooldown_seconds, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id) DO UPDATE SET
      enabled = excluded.enabled,
      message = excluded.message,
      auto_on_raid = excluded.auto_on_raid,
      send_twitch_shoutout = excluded.send_twitch_shoutout,
      userlevel = excluded.userlevel,
      cooldown_seconds = excluded.cooldown_seconds,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    String(channelId),
    enabled,
    message,
    autoOnRaid,
    sendTwitchShoutout,
    userlevel,
    cooldownSeconds,
    now
  );

  return getShoutoutSettings(channelId);
}
