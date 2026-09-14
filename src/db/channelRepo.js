import { db } from './connection.js';
import { encrypt, decrypt } from './crypto.js';
import { getCommandsForChannel, insertDefaultCommands } from './commandRepo.js';
import { getModerationSettings } from './moderationRepo.js';
import { getManagers, getManagerDetails, getManagedChannelIds, isManager } from './managerRepo.js';
import { getDisabledBuiltins } from './builtinRepo.js';
import { getTimers } from './timerRepo.js';
import { getRaidSettings } from './raidRepo.js';
import { getShoutoutSettings } from './shoutoutRepo.js';
import { getAutoShoutouts } from './autoShoutoutRepo.js';
import { getStreamAlertSettings } from './alertRepo.js';
import { getChannelPointTriggers } from './redemptionRepo.js';

export function getChannel(broadcasterId) {
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(String(broadcasterId));
  if (!row) return null;

  return {
    id: row.id,
    login: row.login,
    displayName: row.display_name,
    avatar: row.avatar_url,
    joined: Boolean(row.joined),
    prefix: row.prefix,
    accessToken: decrypt(row.access_token),
    refreshToken: decrypt(row.refresh_token),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    commands: getCommandsForChannel(row.id),
    moderation: getModerationSettings(row.id),
    managers: getManagers(row.id),
    managerProfiles: getManagerDetails(row.id),
    disabledBuiltins: getDisabledBuiltins(row.id),
    timers: getTimers(row.id),
    raidSettings: getRaidSettings(row.id),
    shoutoutSettings: getShoutoutSettings(row.id),
    autoShoutouts: getAutoShoutouts(row.id),
    streamAlerts: getStreamAlertSettings(row.id),
    channelPointTriggers: getChannelPointTriggers(row.id),
  };
}

export function getChannelByLogin(login) {
  if (!login) return null;
  const row = db.prepare('SELECT id FROM channels WHERE LOWER(login) = LOWER(?) LIMIT 1').get(login);
  if (!row) return null;
  return getChannel(row.id);
}

export function getAllChannels() {
  const rows = db.prepare('SELECT id FROM channels ORDER BY login ASC').all();
  return rows.map((r) => getChannel(r.id));
}

export function getActiveChannels() {
  const rows = db.prepare('SELECT id FROM channels WHERE joined = 1 ORDER BY login ASC').all();
  return rows.map((r) => getChannel(r.id));
}

export function upsertChannel(data) {
  const id = String(data.id || data.broadcasterId);
  const now = Date.now();
  const existing = getChannel(id);

  const encAccess = data.accessToken ? encrypt(data.accessToken) : (existing ? encrypt(existing.accessToken) : null);
  const encRefresh = data.refreshToken ? encrypt(data.refreshToken) : (existing ? encrypt(existing.refreshToken) : null);

  const stmt = db.prepare(`
    INSERT INTO channels (id, login, display_name, avatar_url, joined, prefix, access_token, refresh_token, expires_at, created_at, updated_at)
    VALUES (@id, @login, @displayName, @avatarUrl, @joined, @prefix, @accessToken, @refreshToken, @expiresAt, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      login = excluded.login,
      display_name = excluded.display_name,
      avatar_url = COALESCE(excluded.avatar_url, channels.avatar_url),
      joined = COALESCE(excluded.joined, channels.joined),
      prefix = COALESCE(excluded.prefix, channels.prefix),
      access_token = COALESCE(excluded.access_token, channels.access_token),
      refresh_token = COALESCE(excluded.refresh_token, channels.refresh_token),
      expires_at = COALESCE(excluded.expires_at, channels.expires_at),
      updated_at = excluded.updated_at
  `);

  stmt.run({
    id,
    login: data.login || (existing ? existing.login : null),
    displayName: data.displayName || data.login || (existing ? existing.displayName : null),
    avatarUrl: data.avatar || data.avatarUrl || (existing ? existing.avatar : null),
    joined: data.joined !== undefined ? (data.joined ? 1 : 0) : 1,
    prefix: data.prefix || (existing ? existing.prefix : '!'),
    accessToken: encAccess,
    refreshToken: encRefresh,
    expiresAt: data.expiresAt || null,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  });

  // If new channel, populate standard default commands
  if (!existing) {
    insertDefaultCommands(id);
  }

  return getChannel(id);
}

export function updateChannel(broadcasterId, updates) {
  const id = String(broadcasterId);
  const existing = getChannel(id);
  if (!existing) return null;

  const now = Date.now();
  const joined = updates.joined !== undefined ? (updates.joined ? 1 : 0) : (existing.joined ? 1 : 0);
  const prefix = updates.prefix !== undefined ? updates.prefix : existing.prefix;

  const stmt = db.prepare(`
    UPDATE channels SET joined = ?, prefix = ?, updated_at = ? WHERE id = ?
  `);
  stmt.run(joined, prefix, now, id);

  return getChannel(id);
}

export function removeChannel(broadcasterId) {
  const id = String(broadcasterId);
  try {
    db.prepare('DELETE FROM commands WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM moderation_settings WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM channel_managers WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM channel_disabled_builtins WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM timers WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM raid_settings WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM shoutout_settings WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM auto_shoutouts WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM stream_alert_settings WHERE channel_id = ?').run(id);
    db.prepare('DELETE FROM channel_point_triggers WHERE channel_id = ?').run(id);
  } catch (_) {}
  const stmt = db.prepare('DELETE FROM channels WHERE id = ?');
  const res = stmt.run(id);
  return res.changes > 0;
}

export function getAccessibleChannels(user) {
  if (!user) return [];
  const list = [];
  const seen = new Set();

  // 1. Broadcaster's own channel (if exists)
  const ownChannel = getChannel(user.userId);
  if (ownChannel) {
    list.push({ ...ownChannel, role: 'owner' });
    seen.add(ownChannel.id);
  }

  // 2. Channels where user is designated as a channel manager
  const cleanUser = String(user.login || '').trim().toLowerCase();
  const managedIds = getManagedChannelIds(cleanUser);
  for (const cid of managedIds) {
    if (!seen.has(cid)) {
      const ch = getChannel(cid);
      if (ch) {
        list.push({ ...ch, role: 'manager' });
        seen.add(ch.id);
      }
    }
  }

  return list;
}

export function canManageChannel(user, channelId) {
  if (!user || !channelId) return false;
  const cId = String(channelId);
  const uId = String(user.userId || user.id);
  const uLogin = String(user.login || '').toLowerCase();

  // 1. Broadcaster (Channel Owner)
  if (cId === uId) return true;

  // 2. Explicitly assigned Channel Manager
  if (isManager(cId, uLogin)) return true;

  // Under NO circumstance does an admin or stranger get access without being owner or manager
  return false;
}
