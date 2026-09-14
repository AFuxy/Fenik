import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, cleanupTestDb } from './setup.js';
import { setBotAccount, upsertChannel, updateRaidSettings, getRaidSettings } from '../src/db/index.js';
import {
  formatRaidMessage,
  isRaidEligible,
  handleIncomingRaid,
  resetRaidCooldowns,
} from '../src/services/raidService.js';

describe('Raid & Shoutout Automation Service', () => {
  beforeEach(() => {
    clearDatabase();
    resetRaidCooldowns();
  });

  after(() => {
    cleanupTestDb();
  });

  describe('Message Formatting', () => {
    it('should interpolate {raider}, {viewers}, {game}, {url}, and {channel}', () => {
      const template = 'Raid alert! @{raider} joined with {viewers} viewers after playing {game}! Follow them at {url} (Channel: {channel})';
      const output = formatRaidMessage(template, {
        raider: 'SpeedyGamer',
        viewers: 55,
        game: 'Super Mario 64',
        url: 'https://twitch.tv/speedygamer',
        channel: { displayName: 'HostStreamer' },
      });

      assert.equal(
        output,
        'Raid alert! @SpeedyGamer joined with 55 viewers after playing Super Mario 64! Follow them at https://twitch.tv/speedygamer (Channel: HostStreamer)'
      );
    });

    it('should strip leading @ in {raider} variable gracefully', () => {
      const template = 'Welcome {raider}!';
      const output = formatRaidMessage(template, { raider: '@SuperFan' });
      assert.equal(output, 'Welcome SuperFan!');
    });
  });

  describe('Eligibility & Gating Logic', () => {
    const defaultSettings = {
      enabled: true,
      minViewers: 3,
      cooldownMinutes: 20,
    };

    it('should reject raid when automation is disabled', () => {
      const settings = { ...defaultSettings, enabled: false };
      const eligible = isRaidEligible(settings, {
        channelId: 'ch-1',
        raiderId: 'raider-1',
        viewers: 10,
      });
      assert.equal(eligible, false);
    });

    it('should reject raid when viewers are below minViewers threshold', () => {
      const eligible = isRaidEligible(defaultSettings, {
        channelId: 'ch-1',
        raiderId: 'raider-1',
        viewers: 2, // min is 3
      });
      assert.equal(eligible, false);
    });

    it('should allow raid when viewers meet or exceed minViewers threshold', () => {
      const eligible = isRaidEligible(defaultSettings, {
        channelId: 'ch-1',
        raiderId: 'raider-1',
        viewers: 3,
      });
      assert.equal(eligible, true);
    });
  });

  describe('handleIncomingRaid Execution', () => {
    it('should dispatch welcome message to chat and invoke Twitch native shoutout', async () => {
      setBotAccount({
        userId: 'bot999',
        login: 'fuxybot',
        displayName: 'FuxyBot',
        accessToken: 'oauth:test',
        refreshToken: 'refresh:test',
        expiresAt: Date.now() + 3600000,
      });

      upsertChannel({
        id: '2001',
        login: 'coolbroadcaster',
        displayName: 'CoolBroadcaster',
        joined: true,
      });

      updateRaidSettings('2001', {
        enabled: true,
        minViewers: 5,
        message: 'Massive raid! Welcome @{raider} and the {viewers} raiders! They played {game}. URL: {url}',
        cooldownMinutes: 30,
        sendTwitchShoutout: true,
      });

      const sentChats = [];
      const sentShoutouts = [];

      const mockSendChat = async (opts) => {
        sentChats.push(opts);
        return { message_id: 'm1' };
      };

      const mockSendShoutout = async (opts) => {
        sentShoutouts.push(opts);
        return true;
      };

      const mockGetChannelInfo = async (id) => {
        if (id === 'raider888') {
          return { gameName: 'Grand Theft Auto V' };
        }
        return null;
      };

      const raidEvent = {
        from_broadcaster_user_id: 'raider888',
        from_broadcaster_user_login: 'faststreamer',
        from_broadcaster_user_name: 'FastStreamer',
        to_broadcaster_user_id: '2001',
        to_broadcaster_user_login: 'coolbroadcaster',
        to_broadcaster_user_name: 'CoolBroadcaster',
        viewers: 25,
      };

      const result = await handleIncomingRaid(raidEvent, {
        sendChatFn: mockSendChat,
        sendShoutoutFn: mockSendShoutout,
        getChannelInfoFn: mockGetChannelInfo,
      });

      assert.ok(result);
      assert.equal(result.sent, true);
      assert.equal(sentChats.length, 1);
      assert.equal(sentChats[0].broadcasterId, '2001');
      assert.equal(sentChats[0].senderId, 'bot999');
      assert.equal(
        sentChats[0].message,
        'Massive raid! Welcome @FastStreamer and the 25 raiders! They played Grand Theft Auto V. URL: https://twitch.tv/faststreamer'
      );

      assert.equal(sentShoutouts.length, 1);
      assert.equal(sentShoutouts[0].broadcasterId, '2001');
      assert.equal(sentShoutouts[0].toBroadcasterId, 'raider888');
      assert.equal(sentShoutouts[0].moderatorId, 'bot999');

      // Test cooldown: immediate second raid from same raider should be ignored
      const secondRaid = await handleIncomingRaid(raidEvent, {
        sendChatFn: mockSendChat,
        sendShoutoutFn: mockSendShoutout,
        getChannelInfoFn: mockGetChannelInfo,
      });
      assert.equal(secondRaid, null);
      assert.equal(sentChats.length, 1); // No new message sent
    });
  });
});
