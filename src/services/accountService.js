import {
  getChannel,
  removeChannel,
  destroyUserSessions,
  removeManagerEverywhere,
} from '../db/index.js';
import { unsubscribeChannel } from './eventSub.js';
import { resetChannelChatLines } from './timerService.js';
import { clearBroadcasterCaches } from './twitchApi.js';

/**
 * Permanently delete a channel and user account from the platform.
 * 
 * Actions performed:
 * 1. Disconnects bot from stream chat and EventSub WebSocket listeners.
 * 2. Purges in-memory timer activity and chat line counters.
 * 3. Clears cached Twitch Helix data (stream info, moderator status, token validation).
 * 4. Destroys all active login sessions for the broadcaster.
 * 5. Removes manager associations across other channels.
 * 6. Deletes channel database records (cascading commands, timers, shoutouts, raids, moderation).
 */
export async function deleteChannelAccount(channelId) {
  if (!channelId) {
    return { success: false, error: 'Broadcaster ID is required' };
  }

  const channel = getChannel(channelId);
  if (!channel) {
    return { success: false, error: 'Channel account not found or already deleted' };
  }

  // 1. Unsubscribe from EventSub chat & raid listeners
  try {
    unsubscribeChannel(channel.id);
  } catch (err) {
    console.warn('[Account Deletion] Error unsubscribing EventSub:', err.message);
  }

  // 2. Clear timer chat activity tracking
  try {
    resetChannelChatLines(channel.id);
  } catch (err) {
    console.warn('[Account Deletion] Error clearing timer lines:', err.message);
  }

  // 3. Clear Twitch API caches
  try {
    clearBroadcasterCaches(channel.id, channel.accessToken);
  } catch (err) {
    console.warn('[Account Deletion] Error clearing Twitch API caches:', err.message);
  }

  // 4. Destroy active sessions for this user
  try {
    destroyUserSessions(channel.id);
  } catch (err) {
    console.warn('[Account Deletion] Error destroying sessions:', err.message);
  }

  // 5. Remove user from channel_managers across any channels
  try {
    removeManagerEverywhere(channel.id, channel.login);
  } catch (err) {
    console.warn('[Account Deletion] Error removing manager records:', err.message);
  }

  // 6. Delete channel and cascade all related database rows
  const removed = removeChannel(channel.id);

  console.log(`[Account Deletion] Successfully deleted channel #${channel.login} (${channel.id}).`);
  return { success: removed, channel };
}
