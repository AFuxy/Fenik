import { db } from './connection.js';
import { encrypt, decrypt } from './crypto.js';

export function getBotAccount() {
  const row = db.prepare(`
    SELECT b.*, COALESCE(b.avatar_url, c.avatar_url) AS avatar_url 
    FROM bot_account b 
    LEFT JOIN channels c ON (c.id = b.id OR LOWER(c.login) = LOWER(b.login)) 
    ORDER BY b.updated_at DESC
    LIMIT 1
  `).get();
  if (!row) return null;

  return {
    userId: row.id,
    login: row.login,
    displayName: row.display_name,
    avatar: row.avatar_url,
    accessToken: decrypt(row.access_token),
    refreshToken: decrypt(row.refresh_token),
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  };
}

export function unlinkBotAccount() {
  const info = db.prepare('DELETE FROM bot_account').run();
  return info.changes > 0;
}

export function setBotAccount(data) {
  const id = String(data.userId || data.id);
  const encAccessToken = encrypt(data.accessToken);
  const encRefreshToken = encrypt(data.refreshToken);
  const now = Date.now();

  // Ensure there are no stale bot accounts lingering in the database
  db.prepare('DELETE FROM bot_account WHERE id != ?').run(id);

  const stmt = db.prepare(`
    INSERT INTO bot_account (id, login, display_name, avatar_url, access_token, refresh_token, expires_at, updated_at)
    VALUES (@id, @login, @displayName, @avatarUrl, @accessToken, @refreshToken, @expiresAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      login = excluded.login,
      display_name = excluded.display_name,
      avatar_url = COALESCE(excluded.avatar_url, bot_account.avatar_url),
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    id,
    login: data.login,
    displayName: data.displayName || data.login,
    avatarUrl: data.avatar || data.avatarUrl || null,
    accessToken: encAccessToken,
    refreshToken: encRefreshToken,
    expiresAt: data.expiresAt || now + 14400000,
    updatedAt: now,
  });

  return getBotAccount();
}
