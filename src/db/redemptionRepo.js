import { randomUUID } from 'crypto';
import { db } from './connection.js';

function mapChannelPointTrigger(row) {
  if (!row) return null;
  return {
    id: row.id,
    channelId: row.channel_id,
    rewardTitle: row.reward_title,
    rewardId: row.reward_id || null,
    responseMessage: row.response_message,
    enabled: Boolean(row.enabled),
    counter: Number(row.counter || 0),
    cooldownSeconds: Number(row.cooldown_seconds || 0),
    lastTriggeredAt: Number(row.last_triggered_at || 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

/**
 * Fetch all channel point triggers for a specific channel.
 */
export function getChannelPointTriggers(channelId) {
  const rows = db.prepare(`
    SELECT * FROM channel_point_triggers
    WHERE channel_id = ?
    ORDER BY created_at ASC
  `).all(String(channelId));

  return rows.map(mapChannelPointTrigger);
}

/**
 * Fetch a single trigger by ID and channel ID.
 */
export function getChannelPointTriggerById(channelId, triggerId) {
  const row = db.prepare(`
    SELECT * FROM channel_point_triggers
    WHERE channel_id = ? AND id = ?
    LIMIT 1
  `).get(String(channelId), String(triggerId));

  return mapChannelPointTrigger(row);
}

/**
 * Fetch a single trigger by global ID.
 */
export function getChannelPointTrigger(triggerId) {
  const row = db.prepare(`
    SELECT * FROM channel_point_triggers
    WHERE id = ?
    LIMIT 1
  `).get(String(triggerId));

  return mapChannelPointTrigger(row);
}

/**
 * Create or update a channel point trigger.
 */
export function upsertChannelPointTrigger(channelId, data = {}) {
  const id = data.id || randomUUID();
  const rewardTitle = String(data.rewardTitle || data.reward_title || '').trim();
  const rewardId = data.rewardId || data.reward_id ? String(data.rewardId || data.reward_id).trim() : null;
  const responseMessage = String(data.responseMessage || data.response_message || '').trim();
  const cooldownSeconds = Math.max(0, Math.min(3600, parseInt(data.cooldownSeconds ?? data.cooldown_seconds, 10) || 5));
  const enabled = data.enabled !== undefined ? (data.enabled ? 1 : 0) : 1;
  const now = Date.now();

  const existing = getChannelPointTriggerById(channelId, id);

  const stmt = db.prepare(`
    INSERT INTO channel_point_triggers (
      id, channel_id, reward_title, reward_id, response_message,
      enabled, counter, cooldown_seconds, last_triggered_at, created_at, updated_at
    )
    VALUES (@id, @channelId, @rewardTitle, @rewardId, @responseMessage, @enabled, @counter, @cooldownSeconds, @lastTriggeredAt, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      reward_title = excluded.reward_title,
      reward_id = excluded.reward_id,
      response_message = excluded.response_message,
      cooldown_seconds = excluded.cooldown_seconds,
      enabled = excluded.enabled,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    id,
    channelId: String(channelId),
    rewardTitle,
    rewardId,
    responseMessage,
    enabled,
    counter: existing ? existing.counter : (Number(data.counter) || 0),
    cooldownSeconds,
    lastTriggeredAt: existing ? existing.lastTriggeredAt : 0,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  });

  return getChannelPointTriggerById(channelId, id);
}

/**
 * Toggle trigger enabled state.
 */
export function toggleChannelPointTrigger(channelId, triggerId, enabled) {
  const isEnabled = enabled ? 1 : 0;
  const now = Date.now();
  const stmt = db.prepare(`
    UPDATE channel_point_triggers
    SET enabled = ?, updated_at = ?
    WHERE channel_id = ? AND id = ?
  `);
  stmt.run(isEnabled, now, String(channelId), String(triggerId));
  return getChannelPointTriggerById(channelId, triggerId);
}

/**
 * Delete a channel point trigger.
 */
export function deleteChannelPointTrigger(channelId, triggerId) {
  const stmt = db.prepare(`
    DELETE FROM channel_point_triggers
    WHERE channel_id = ? AND id = ?
  `);
  const res = stmt.run(String(channelId), String(triggerId));
  return res.changes > 0;
}

/**
 * Record a trigger execution: increments counter and updates last_triggered_at.
 */
export function recordRedemptionTriggerExecution(triggerId, now = Date.now()) {
  const stmt = db.prepare(`
    UPDATE channel_point_triggers
    SET counter = counter + 1, last_triggered_at = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(now, now, String(triggerId));
  return getChannelPointTrigger(triggerId);
}
