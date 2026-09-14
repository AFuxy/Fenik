import { db } from './connection.js';

export function getManagers(channelId) {
  const rows = db.prepare(`
    SELECT username FROM channel_managers WHERE channel_id = ? ORDER BY username ASC
  `).all(String(channelId));

  return rows.map((r) => r.username);
}

export function getManagerDetails(channelId) {
  const rows = db.prepare(`
    SELECT 
      m.username,
      m.created_at,
      COALESCE(m.user_id, c.id, s.user_id) AS user_id,
      COALESCE(m.display_name, c.display_name, s.display_name, m.username) AS display_name,
      COALESCE(m.avatar_url, c.avatar_url, s.avatar_url) AS avatar_url
    FROM channel_managers m
    LEFT JOIN channels c ON (c.id = m.user_id OR LOWER(c.login) = LOWER(m.username))
    LEFT JOIN sessions s ON (s.user_id = m.user_id OR LOWER(s.login) = LOWER(m.username))
    WHERE m.channel_id = ? 
    ORDER BY m.username ASC
  `).all(String(channelId));

  return rows.map((r) => ({
    username: r.username,
    displayName: r.display_name || r.username,
    avatar: r.avatar_url || null,
    userId: r.user_id || null,
    createdAt: Number(r.created_at || 0),
  }));
}

export function addManager(channelId, username, extra = {}) {
  const cleanUser = String(username).trim().toLowerCase().replace(/^@/, '');
  if (!cleanUser) return false;

  let displayName = extra.displayName || null;
  let avatarUrl = extra.avatarUrl || extra.avatar || extra.profileImageUrl || null;
  let userId = extra.userId ? String(extra.userId) : null;

  if (!avatarUrl || !displayName || !userId) {
    try {
      const existing = db.prepare(`
        SELECT avatar_url, display_name, id FROM channels WHERE LOWER(login) = ? 
        UNION 
        SELECT avatar_url, display_name, user_id AS id FROM sessions WHERE LOWER(login) = ? 
        LIMIT 1
      `).get(cleanUser, cleanUser);
      if (existing) {
        if (!avatarUrl && existing.avatar_url) avatarUrl = existing.avatar_url;
        if (!displayName && existing.display_name) displayName = existing.display_name;
        if (!userId && existing.id) userId = String(existing.id);
      }
    } catch (_) {}
  }

  const stmt = db.prepare(`
    INSERT INTO channel_managers (channel_id, username, display_name, avatar_url, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(channel_id, username) DO UPDATE SET
      display_name = COALESCE(excluded.display_name, channel_managers.display_name),
      avatar_url = COALESCE(excluded.avatar_url, channel_managers.avatar_url),
      user_id = COALESCE(excluded.user_id, channel_managers.user_id)
  `);

  const res = stmt.run(String(channelId), cleanUser, displayName, avatarUrl, userId, Date.now());
  return res.changes > 0;
}

export function removeManager(channelId, username) {
  const cleanUser = String(username).trim().toLowerCase().replace(/^@/, '');
  const stmt = db.prepare(`
    DELETE FROM channel_managers WHERE channel_id = ? AND username = ?
  `);

  const res = stmt.run(String(channelId), cleanUser);
  return res.changes > 0;
}

export function isManager(channelId, username) {
  const cleanUser = String(username).trim().toLowerCase().replace(/^@/, '');
  const row = db.prepare(`
    SELECT 1 FROM channel_managers WHERE channel_id = ? AND username = ? LIMIT 1
  `).get(String(channelId), cleanUser);

  return Boolean(row);
}

export function getManagedChannelIds(username) {
  const cleanUser = String(username).trim().toLowerCase().replace(/^@/, '');
  if (!cleanUser) return [];

  const rows = db.prepare(`
    SELECT channel_id FROM channel_managers WHERE LOWER(username) = ? ORDER BY created_at ASC
  `).all(cleanUser);

  return rows.map((r) => r.channel_id);
}
