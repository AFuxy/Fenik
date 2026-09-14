import { db } from './connection.js';

export const DEFAULT_ALERT_SETTINGS = {
  followEnabled: true,
  followMessage: 'Thank you for following, @{user}! Welcome to the stream! 💜',
  subEnabled: true,
  subMessage: 'Thank you @{user} for subscribing at {tier}! Welcome to the family! 🎉',
  resubMessage: 'Welcome back @{user} for resubscribing at {tier} for {months} months! {streak} {message}',
  giftSubMessage: 'Thank you @{user} for gifting a {tier} sub! 🎁',
  communityGiftMessage: 'WOW! Huge thanks to @{user} for gifting {count} subs to the community! 🌟',
};

function mapAlertSettings(channelId, row) {
  if (!row) {
    return {
      channelId: String(channelId),
      followEnabled: DEFAULT_ALERT_SETTINGS.followEnabled,
      followMessage: DEFAULT_ALERT_SETTINGS.followMessage,
      subEnabled: DEFAULT_ALERT_SETTINGS.subEnabled,
      subMessage: DEFAULT_ALERT_SETTINGS.subMessage,
      resubMessage: DEFAULT_ALERT_SETTINGS.resubMessage,
      giftSubMessage: DEFAULT_ALERT_SETTINGS.giftSubMessage,
      communityGiftMessage: DEFAULT_ALERT_SETTINGS.communityGiftMessage,
      updatedAt: 0,
    };
  }

  return {
    channelId: row.channel_id,
    followEnabled: Boolean(row.follow_enabled),
    followMessage: row.follow_message || DEFAULT_ALERT_SETTINGS.followMessage,
    subEnabled: Boolean(row.sub_enabled),
    subMessage: row.sub_message || DEFAULT_ALERT_SETTINGS.subMessage,
    resubMessage: row.resub_message || DEFAULT_ALERT_SETTINGS.resubMessage,
    giftSubMessage: row.gift_sub_message || DEFAULT_ALERT_SETTINGS.giftSubMessage,
    communityGiftMessage: row.community_gift_message || DEFAULT_ALERT_SETTINGS.communityGiftMessage,
    updatedAt: Number(row.updated_at),
  };
}

/**
 * Fetch stream alert settings for a channel.
 */
export function getStreamAlertSettings(channelId) {
  const row = db.prepare(`
    SELECT * FROM stream_alert_settings WHERE channel_id = ?
  `).get(String(channelId));

  return mapAlertSettings(channelId, row);
}

/**
 * Update stream alert settings for a channel.
 */
export function updateStreamAlertSettings(channelId, data = {}) {
  const current = getStreamAlertSettings(channelId);

  const followEnabled = data.followEnabled !== undefined ? (data.followEnabled ? 1 : 0) : (current.followEnabled ? 1 : 0);
  const followMessage = data.followMessage !== undefined
    ? String(data.followMessage || '').trim() || DEFAULT_ALERT_SETTINGS.followMessage
    : current.followMessage;

  const subEnabled = data.subEnabled !== undefined ? (data.subEnabled ? 1 : 0) : (current.subEnabled ? 1 : 0);
  const subMessage = data.subMessage !== undefined
    ? String(data.subMessage || '').trim() || DEFAULT_ALERT_SETTINGS.subMessage
    : current.subMessage;
  const resubMessage = data.resubMessage !== undefined
    ? String(data.resubMessage || '').trim() || DEFAULT_ALERT_SETTINGS.resubMessage
    : current.resubMessage;
  const giftSubMessage = data.giftSubMessage !== undefined
    ? String(data.giftSubMessage || '').trim() || DEFAULT_ALERT_SETTINGS.giftSubMessage
    : current.giftSubMessage;
  const communityGiftMessage = data.communityGiftMessage !== undefined
    ? String(data.communityGiftMessage || '').trim() || DEFAULT_ALERT_SETTINGS.communityGiftMessage
    : current.communityGiftMessage;

  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO stream_alert_settings (
      channel_id, follow_enabled, follow_message, sub_enabled, sub_message,
      resub_message, gift_sub_message, community_gift_message, updated_at
    )
    VALUES (@channelId, @followEnabled, @followMessage, @subEnabled, @subMessage, @resubMessage, @giftSubMessage, @communityGiftMessage, @updatedAt)
    ON CONFLICT(channel_id) DO UPDATE SET
      follow_enabled = excluded.follow_enabled,
      follow_message = excluded.follow_message,
      sub_enabled = excluded.sub_enabled,
      sub_message = excluded.sub_message,
      resub_message = excluded.resub_message,
      gift_sub_message = excluded.gift_sub_message,
      community_gift_message = excluded.community_gift_message,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    channelId: String(channelId),
    followEnabled,
    followMessage,
    subEnabled,
    subMessage,
    resubMessage,
    giftSubMessage,
    communityGiftMessage,
    updatedAt: now,
  });

  return getStreamAlertSettings(channelId);
}
