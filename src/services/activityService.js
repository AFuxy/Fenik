/**
 * Live Activity Stream Service
 * Maintains an in-memory ring buffer of real-time bot events per channel
 * for fast, zero-disk-overhead rendering in the Broadcaster Dashboard.
 */

const MAX_ACTIVITIES_PER_CHANNEL = 100;
const activityBuffers = new Map(); // channelId -> Array<ActivityItem>

/**
 * Record a new activity event for a channel.
 * @param {string} channelId
 * @param {Object} entry
 * @param {'command'|'moderation'|'alert'|'timer'|'shoutout'|'reward'|'system'} entry.type
 * @param {string} entry.title
 * @param {string} entry.detail
 * @param {string} [entry.actor]
 * @param {string} [entry.target]
 */
export function recordActivity(channelId, { type = 'system', title, detail, actor = null, target = null }) {
  if (!channelId) return null;
  const cId = String(channelId);

  if (!activityBuffers.has(cId)) {
    activityBuffers.set(cId, []);
  }

  const list = activityBuffers.get(cId);
  const item = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    channelId: cId,
    type,
    title: String(title || 'Bot Event').slice(0, 100),
    detail: String(detail || '').slice(0, 300),
    actor: actor ? String(actor).replace(/^@/, '') : null,
    target: target ? String(target).replace(/^@/, '') : null,
    timestamp: Date.now(),
  };

  list.unshift(item);

  // Maintain max buffer size
  if (list.length > MAX_ACTIVITIES_PER_CHANNEL) {
    list.length = MAX_ACTIVITIES_PER_CHANNEL;
  }

  return item;
}

/**
 * Retrieve recent activities for a channel.
 * @param {string} channelId
 * @param {number} [limit=25]
 * @returns {Array}
 */
export function getRecentActivities(channelId, limit = 25) {
  if (!channelId) return [];
  const cId = String(channelId);
  const list = activityBuffers.get(cId) || [];
  return list.slice(0, Math.max(1, Math.min(100, limit)));
}

/**
 * Clear activity log for a channel (useful for testing or reset).
 */
export function clearActivities(channelId) {
  if (channelId) {
    activityBuffers.delete(String(channelId));
  } else {
    activityBuffers.clear();
  }
}
