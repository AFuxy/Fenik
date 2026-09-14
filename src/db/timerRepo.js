import { randomUUID } from 'crypto';
import { db } from './connection.js';

function mapTimer(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    name: row.name,
    message: row.message,
    intervalMinutes: Number(row.interval_minutes),
    minChatLines: Number(row.min_chat_lines),
    enabled: Boolean(row.enabled),
    lastRunAt: Number(row.last_run_at || 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    channelLogin: row.channel_login || undefined,
    channelDisplayName: row.channel_display_name || undefined,
    channelPrefix: row.channel_prefix || undefined,
  };
}

/**
 * Fetch all timers for a specific channel.
 */
export function getTimers(channelId) {
  const rows = db.prepare(`
    SELECT * FROM timers
    WHERE channel_id = ?
    ORDER BY created_at ASC
  `).all(String(channelId));

  return rows.map(mapTimer);
}

/**
 * Fetch a single timer by ID for a channel.
 */
export function getTimerById(channelId, timerId) {
  const row = db.prepare(`
    SELECT * FROM timers
    WHERE channel_id = ? AND id = ?
    LIMIT 1
  `).get(String(channelId), String(timerId));

  return mapTimer(row);
}

/**
 * Create a new scheduled timer.
 */
export function createTimer(channelId, { name, message, intervalMinutes = 15, minChatLines = 3 }) {
  const cleanName = String(name || '').trim();
  const cleanMessage = String(message || '').trim();
  const interval = Math.max(2, Math.min(240, parseInt(intervalMinutes, 10) || 15));
  const lines = Math.max(0, Math.min(100, parseInt(minChatLines, 10) || 0));

  if (!cleanName) throw new Error('Timer name is required');
  if (!cleanMessage) throw new Error('Timer message is required');

  const id = randomUUID();
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO timers (id, channel_id, name, message, interval_minutes, min_chat_lines, enabled, last_run_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  stmt.run(id, String(channelId), cleanName, cleanMessage, interval, lines, now, now, now);
  return getTimerById(channelId, id);
}

/**
 * Update an existing timer.
 */
export function updateTimer(channelId, timerId, { name, message, intervalMinutes, minChatLines, enabled }) {
  const existing = getTimerById(channelId, timerId);
  if (!existing) return null;

  const cleanName = name !== undefined ? String(name).trim() : existing.name;
  const cleanMessage = message !== undefined ? String(message).trim() : existing.message;
  const interval = intervalMinutes !== undefined
    ? Math.max(2, Math.min(240, parseInt(intervalMinutes, 10) || 15))
    : existing.intervalMinutes;
  const lines = minChatLines !== undefined
    ? Math.max(0, Math.min(100, parseInt(minChatLines, 10) || 0))
    : existing.minChatLines;
  const isEnabled = enabled !== undefined ? (enabled ? 1 : 0) : (existing.enabled ? 1 : 0);

  if (!cleanName) throw new Error('Timer name cannot be empty');
  if (!cleanMessage) throw new Error('Timer message cannot be empty');

  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE timers
    SET name = ?, message = ?, interval_minutes = ?, min_chat_lines = ?, enabled = ?, updated_at = ?
    WHERE channel_id = ? AND id = ?
  `);

  stmt.run(cleanName, cleanMessage, interval, lines, isEnabled, now, String(channelId), String(timerId));
  return getTimerById(channelId, timerId);
}

/**
 * Toggle a timer's active/inactive state.
 */
export function toggleTimer(channelId, timerId, enabled) {
  const existing = getTimerById(channelId, timerId);
  if (!existing) return null;

  const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : (existing.enabled ? 0 : 1);
  const now = Date.now();

  db.prepare(`
    UPDATE timers
    SET enabled = ?, updated_at = ?
    WHERE channel_id = ? AND id = ?
  `).run(newEnabled, now, String(channelId), String(timerId));

  return getTimerById(channelId, timerId);
}

/**
 * Delete a scheduled timer.
 */
export function deleteTimer(channelId, timerId) {
  const res = db.prepare(`
    DELETE FROM timers
    WHERE channel_id = ? AND id = ?
  `).run(String(channelId), String(timerId));

  return res.changes > 0;
}

/**
 * Update the last_run_at timestamp of a timer.
 */
export function updateTimerLastRun(channelId, timerId, timestamp = Date.now()) {
  const res = db.prepare(`
    UPDATE timers
    SET last_run_at = ?
    WHERE channel_id = ? AND id = ?
  `).run(Number(timestamp), String(channelId), String(timerId));

  return res.changes > 0;
}

/**
 * Fetch all enabled timers across all active joined channels for the runner engine.
 */
export function getAllActiveTimers() {
  const rows = db.prepare(`
    SELECT t.*, c.login AS channel_login, c.display_name AS channel_display_name, c.prefix AS channel_prefix
    FROM timers t
    JOIN channels c ON t.channel_id = c.id
    WHERE t.enabled = 1 AND c.joined = 1
    ORDER BY t.created_at ASC
  `).all();

  return rows.map(mapTimer);
}
