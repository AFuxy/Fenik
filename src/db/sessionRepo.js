import crypto from 'crypto';
import { db } from './connection.js';

export function createSession(userData) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30 days

  const stmt = db.prepare(`
    INSERT INTO sessions (token, user_id, login, display_name, avatar_url, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    token,
    String(userData.userId || userData.id),
    userData.login,
    userData.displayName || userData.login,
    userData.avatar || userData.avatarUrl || null,
    now,
    expiresAt
  );

  return token;
}

export function getSession(token) {
  if (!token) return null;

  const row = db.prepare(`
    SELECT * FROM sessions WHERE token = ?
  `).get(String(token));

  if (!row) return null;

  if (row.expires_at < Date.now()) {
    destroySession(token);
    return null;
  }

  return {
    userId: row.user_id,
    login: row.login,
    displayName: row.display_name,
    avatar: row.avatar_url,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(String(token));
}

export function destroyUserSessions(userId) {
  if (!userId) return;
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(String(userId));
}
