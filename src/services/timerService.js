import { getBotAccount, getAllActiveTimers, updateTimerLastRun } from '../db/index.js';
import { sendChatMessage } from './twitchApi.js';

// Total chat lines per channel: channelId -> lineCount
const channelLineCounters = new Map();

// Line count snapshot at time of last execution: timerId -> lineCount
const timerLastRunLines = new Map();

let tickInterval = null;

/**
 * Record an incoming chat message for a channel.
 * Called when a non-bot chatter sends a message.
 */
export function recordChatMessage(channelId) {
  const cid = String(channelId);
  const current = channelLineCounters.get(cid) || 0;
  channelLineCounters.set(cid, current + 1);
  return current + 1;
}

/**
 * Get the current chat line count for a channel.
 */
export function getChannelChatLines(channelId) {
  return channelLineCounters.get(String(channelId)) || 0;
}

/**
 * Reset chat lines (primarily for testing and state reset).
 */
export function resetChannelChatLines(channelId) {
  if (channelId) {
    channelLineCounters.delete(String(channelId));
  } else {
    channelLineCounters.clear();
    timerLastRunLines.clear();
  }
}

/**
 * Format timer message template with channel variables and dynamic expressions.
 */
export function formatTimerMessage(template, { channel }) {
  if (!template) return '';
  const channelName = channel?.displayName || channel?.login || '';

  return template
    .replace(/{channel}/gi, channelName)
    .replace(/{random\.(\d+)-(\d+)}/gi, (_, min, max) => {
      const low = parseInt(min, 10);
      const high = parseInt(max, 10);
      return String(Math.floor(Math.random() * (high - low + 1)) + low);
    });
}

/**
 * Check if a scheduled timer is ready to trigger.
 */
export function isTimerDue(timer, currentLines = 0, lastRunLines = 0, now = Date.now()) {
  if (!timer || !timer.enabled) return false;

  const intervalMs = (timer.intervalMinutes || 15) * 60 * 1000;
  const lastRun = timer.lastRunAt || 0;
  const effectiveLastRun = lastRun > 0 ? lastRun : (timer.createdAt || now);

  // Time requirement
  if (now - effectiveLastRun < intervalMs) {
    return false;
  }

  // Chat activity requirement
  const minLines = timer.minChatLines || 0;
  const linesSinceLastRun = currentLines - lastRunLines;
  if (linesSinceLastRun < minLines) {
    return false;
  }

  return true;
}

/**
 * Process a tick cycle across all active timers.
 */
export async function processTimerTick({ now = Date.now(), sendFn = sendChatMessage } = {}) {
  const bot = getBotAccount();
  if (!bot) return [];

  const activeTimers = getAllActiveTimers();
  const executed = [];

  for (const timer of activeTimers) {
    const channelId = String(timer.channelId);
    const currentLines = getChannelChatLines(channelId);
    const lastRunLines = timerLastRunLines.get(timer.id) || 0;

    if (isTimerDue(timer, currentLines, lastRunLines, now)) {
      const channel = {
        displayName: timer.channelDisplayName,
        login: timer.channelLogin,
        prefix: timer.channelPrefix || '!',
      };

      const message = formatTimerMessage(timer.message, { channel });

      try {
        await sendFn({
          broadcasterId: channelId,
          senderId: bot.userId,
          message,
        });

        // Persist last run in DB
        updateTimerLastRun(channelId, timer.id, now);
        // Record line snapshot
        timerLastRunLines.set(timer.id, currentLines);

        executed.push({
          timerId: timer.id,
          channelId,
          name: timer.name,
          message,
        });
      } catch (err) {
        console.error(`[Timers] Failed to post timer "${timer.name}" to channel ${channelId}:`, err.message);
      }
    }
  }

  return executed;
}

/**
 * Start background periodic tick for timers.
 */
export function startTimerService(intervalMs = 15000) {
  if (tickInterval) return;
  console.log('[Timers] Background timer service active (checking every 15s)...');
  tickInterval = setInterval(async () => {
    try {
      await processTimerTick();
    } catch (err) {
      console.error('[Timers] Error during timer tick:', err);
    }
  }, intervalMs);
}

/**
 * Stop background timer service.
 */
export function stopTimerService() {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}
