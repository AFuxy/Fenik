import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, cleanupTestDb } from './setup.js';
import {
  setBotAccount,
  upsertChannel,
  createTimer,
  getTimerById,
  toggleTimer,
} from '../src/db/index.js';
import {
  recordChatMessage,
  getChannelChatLines,
  resetChannelChatLines,
  formatTimerMessage,
  isTimerDue,
  processTimerTick,
} from '../src/services/timerService.js';

describe('Timer Service & Gating Logic', () => {
  beforeEach(() => {
    clearDatabase();
    resetChannelChatLines();
  });

  after(() => {
    cleanupTestDb();
  });

  describe('Chat Line Activity Tracking', () => {
    it('should record chat messages per channel independently', () => {
      assert.equal(getChannelChatLines('channel_a'), 0);
      assert.equal(getChannelChatLines('channel_b'), 0);

      recordChatMessage('channel_a');
      recordChatMessage('channel_a');
      recordChatMessage('channel_b');

      assert.equal(getChannelChatLines('channel_a'), 2);
      assert.equal(getChannelChatLines('channel_b'), 1);

      resetChannelChatLines('channel_a');
      assert.equal(getChannelChatLines('channel_a'), 0);
      assert.equal(getChannelChatLines('channel_b'), 1);
    });
  });

  describe('Message Formatting', () => {
    it('should replace {channel} variable and {random.X-Y} expressions', () => {
      const template = 'Welcome to {channel}! Roll a d6: {random.1-6}';
      const output = formatTimerMessage(template, {
        channel: { displayName: 'CoolStreamer' },
      });

      assert.ok(output.includes('Welcome to CoolStreamer!'));
      assert.match(output, /Roll a d6: [1-6]/);
    });
  });

  describe('isTimerDue Gating Logic', () => {
    const baseTimer = {
      id: 'timer-1',
      channelId: 'ch-1',
      name: 'Discord',
      message: 'Join discord',
      intervalMinutes: 15,
      minChatLines: 5,
      enabled: true,
      lastRunAt: 1000000,
    };

    it('should return false if timer is disabled', () => {
      const disabledTimer = { ...baseTimer, enabled: false };
      const due = isTimerDue(disabledTimer, 100, 0, 1000000 + 20 * 60 * 1000);
      assert.equal(due, false);
    });

    it('should return false if interval has not elapsed', () => {
      // 10 minutes passed, but interval is 15 minutes
      const now = 1000000 + 10 * 60 * 1000;
      const due = isTimerDue(baseTimer, 100, 0, now);
      assert.equal(due, false);
    });

    it('should return false if chat lines are below threshold even if interval elapsed', () => {
      // 20 minutes passed (interval met), but only 3 lines sent (needs 5)
      const now = 1000000 + 20 * 60 * 1000;
      const due = isTimerDue(baseTimer, 3, 0, now);
      assert.equal(due, false);
    });

    it('should return true when BOTH interval and chat lines are satisfied', () => {
      // 20 minutes passed (needs 15) and 6 lines sent (needs 5)
      const now = 1000000 + 20 * 60 * 1000;
      const due = isTimerDue(baseTimer, 6, 0, now);
      assert.equal(due, true);
    });

    it('should always pass line gate when minChatLines is 0', () => {
      const zeroLineTimer = { ...baseTimer, minChatLines: 0 };
      const now = 1000000 + 20 * 60 * 1000;
      const due = isTimerDue(zeroLineTimer, 0, 0, now);
      assert.equal(due, true);
    });
  });

  describe('processTimerTick Integration', () => {
    it('should execute due timers, invoke sendFn, update last_run_at, and respect activity threshold', async () => {
      // Setup central bot and channel
      setBotAccount({
        userId: 'bot999',
        login: 'testbot',
        displayName: 'TestBot',
        accessToken: 'oauth:test',
        refreshToken: 'refresh:test',
        expiresAt: Date.now() + 3600000,
      });

      upsertChannel({
        id: '1001',
        login: 'livestreamer',
        displayName: 'LiveStreamer',
        joined: true,
      });

      // Create timer: 10 min interval, 3 min chat lines
      const timer = createTimer('1001', {
        name: 'Community Discord',
        message: 'Join {channel}\'s Discord: https://discord.gg/test',
        intervalMinutes: 10,
        minChatLines: 3,
      });

      const sentMessages = [];
      const mockSend = async (opts) => {
        sentMessages.push(opts);
        return { message_id: 'msg_1' };
      };

      const now = Date.now() + 15 * 60 * 1000; // 15 mins later

      // 1. Tick without chat lines: Should NOT send because minChatLines = 3
      const firstPass = await processTimerTick({ now, sendFn: mockSend });
      assert.equal(firstPass.length, 0);
      assert.equal(sentMessages.length, 0);

      // 2. Chatter sends 3 messages
      recordChatMessage('1001');
      recordChatMessage('1001');
      recordChatMessage('1001');
      assert.equal(getChannelChatLines('1001'), 3);

      // 3. Tick again: Now both time and lines are satisfied!
      const secondPass = await processTimerTick({ now, sendFn: mockSend });
      assert.equal(secondPass.length, 1);
      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0].broadcasterId, '1001');
      assert.equal(sentMessages[0].senderId, 'bot999');
      assert.equal(sentMessages[0].message, "Join LiveStreamer's Discord: https://discord.gg/test");

      // Verify DB last_run_at updated
      const updatedTimer = getTimerById('1001', timer.id);
      assert.equal(updatedTimer.lastRunAt, now);

      // 4. Immediately tick again: Should NOT re-send because interval and lines have reset
      const immediatePass = await processTimerTick({ now: now + 1000, sendFn: mockSend });
      assert.equal(immediatePass.length, 0);
      assert.equal(sentMessages.length, 1);
    });
  });
});
