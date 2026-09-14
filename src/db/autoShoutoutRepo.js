import { db } from './connection.js';

function mapAutoShoutout(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    targetLogin: row.target_login,
    targetUserId: row.target_user_id || null,
    targetDisplayName: row.target_display_name || row.target_login,
    targetAvatar: row.target_avatar || null,
    enabled: Boolean(row.enabled),
    lastShoutedAt: Number(row.last_shouted_at || 0),
    createdAt: Number(row.created_at || 0),
  };
}

/**
 * Get all auto-shoutout creators configured for a channel.
 */
export function getAutoShoutouts(channelId) {
  if (!channelId) return [];
  const rows = db.prepare(`
    SELECT a.*, COALESCE(a.target_avatar, c.avatar_url) AS target_avatar
    FROM auto_shoutouts a
    LEFT JOIN channels c ON (c.id = a.target_user_id OR LOWER(c.login) = LOWER(a.target_login))
    WHERE a.channel_id = ? 
    ORDER BY a.created_at DESC
  `).all(String(channelId));

  return rows.map(mapAutoShoutout);
}

/**
 * Get a specific auto-shoutout entry by channel and username.
 */
export function getAutoShoutout(channelId, targetLogin) {
  if (!channelId || !targetLogin) return null;
  const cleanLogin = String(targetLogin).trim().toLowerCase().replace(/^@+/, '');
  const row = db.prepare(`
    SELECT a.*, COALESCE(a.target_avatar, c.avatar_url) AS target_avatar
    FROM auto_shoutouts a
    LEFT JOIN channels c ON (c.id = a.target_user_id OR LOWER(c.login) = LOWER(a.target_login))
    WHERE a.channel_id = ? AND LOWER(a.target_login) = LOWER(?)
    LIMIT 1
  `).get(String(channelId), cleanLogin);

  return mapAutoShoutout(row);
}

/**
 * Add or update an auto-shoutout creator for a channel.
 */
export function addAutoShoutout(channelId, data = {}) {
  if (!channelId) throw new Error('channelId is required');
  const cleanLogin = String(data.targetLogin || '').trim().toLowerCase().replace(/^@+/, '');
  if (!cleanLogin) throw new Error('Target username is required');

  const now = Date.now();
  const id = `autoso_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const displayName = data.targetDisplayName || cleanLogin;
  const userId = data.targetUserId ? String(data.targetUserId) : null;
  let avatar = data.targetAvatar || data.avatar || data.profileImageUrl || null;
  if (!avatar) {
    try {
      const existing = db.prepare('SELECT avatar_url FROM channels WHERE (id = ? AND ? IS NOT NULL) OR LOWER(login) = LOWER(?) LIMIT 1').get(userId, userId, cleanLogin);
      if (existing?.avatar_url) {
        avatar = existing.avatar_url;
      }
    } catch (_) {}
  }

  const stmt = db.prepare(`
    INSERT INTO auto_shoutouts (
      id, channel_id, target_login, target_user_id, target_display_name, target_avatar, enabled, last_shouted_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?)
    ON CONFLICT(channel_id, target_login) DO UPDATE SET
      enabled = 1,
      target_user_id = COALESCE(excluded.target_user_id, auto_shoutouts.target_user_id),
      target_display_name = COALESCE(excluded.target_display_name, auto_shoutouts.target_display_name),
      target_avatar = COALESCE(excluded.target_avatar, auto_shoutouts.target_avatar)
  `);

  stmt.run(id, String(channelId), cleanLogin, userId, displayName, avatar, now);
  return getAutoShoutout(channelId, cleanLogin);
}

/**
 * Remove an auto-shoutout creator from a channel.
 */
export function removeAutoShoutout(channelId, targetLogin) {
  if (!channelId || !targetLogin) return false;
  const cleanLogin = String(targetLogin).trim().toLowerCase().replace(/^@+/, '');
  const stmt = db.prepare(`
    DELETE FROM auto_shoutouts 
    WHERE channel_id = ? AND LOWER(target_login) = LOWER(?)
  `);
  const info = stmt.run(String(channelId), cleanLogin);
  return info.changes > 0;
}

/**
 * Toggle active state of an auto-shoutout creator.
 */
export function toggleAutoShoutout(channelId, targetLogin, enabled) {
  if (!channelId || !targetLogin) return null;
  const cleanLogin = String(targetLogin).trim().toLowerCase().replace(/^@+/, '');
  const isEnabled = enabled ? 1 : 0;
  const stmt = db.prepare(`
    UPDATE auto_shoutouts 
    SET enabled = ? 
    WHERE channel_id = ? AND LOWER(target_login) = LOWER(?)
  `);
  stmt.run(isEnabled, String(channelId), cleanLogin);
  return getAutoShoutout(channelId, cleanLogin);
}

/**
 * Update the last_shouted_at timestamp for an auto-shoutout creator.
 */
export function updateAutoShoutoutLastTime(channelId, targetLogin, timestamp = Date.now()) {
  if (!channelId || !targetLogin) return;
  const cleanLogin = String(targetLogin).trim().toLowerCase().replace(/^@+/, '');
  const stmt = db.prepare(`
    UPDATE auto_shoutouts 
    SET last_shouted_at = ? 
    WHERE channel_id = ? AND LOWER(target_login) = LOWER(?)
  `);
  stmt.run(timestamp, String(channelId), cleanLogin);
}
