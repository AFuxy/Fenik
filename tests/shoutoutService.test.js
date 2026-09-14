import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, cleanupTestDb } from './setup.js';
import { upsertChannel, setBotAccount, updateShoutoutSettings } from '../src/db/index.js';
import {
  formatShoutoutMessage,
  executeShoutout,
  resetShoutoutCooldowns,
} from '../src/services/shoutoutService.js';

describe('Shoutout Service & Formatting', () => {
  beforeEach(() => {
    clearDatabase();
    resetShoutoutCooldowns();
  });

  after(() => {
    cleanupTestDb();
  });

  describe('formatShoutoutMessage', () => {
    it('should interpolate {target}, {game}, {url}, {channel}, and {user}', () => {
      const template = 'Huge shoutout to {target}! Playing {game} over at {url}! Requested by {user} for #{channel}.';
      const output = formatShoutoutMessage(template, {
        target: '@CoolStreamer',
        game: 'Hollow Knight',
        url: 'https://twitch.tv/coolstreamer',
        channel: { displayName: 'MainHost', login: 'mainhost' },
        user: '@ModUser',
      });

      assert.equal(
        output,
        'Huge shoutout to @CoolStreamer! Playing Hollow Knight over at https://twitch.tv/coolstreamer! Requested by @ModUser for #MainHost.'
      );
    });

    it('should strip leading @ from target cleanly', () => {
      const template = 'Go follow {target} at {url}!';
      const output = formatShoutoutMessage(template, {
        target: '@@@TargetPerson',
      });

      assert.equal(output, 'Go follow @TargetPerson at https://twitch.tv/TargetPerson!');
    });
  });

  describe('executeShoutout', () => {
    it('should reject when shoutouts are disabled in channel settings', async () => {
      upsertChannel({ id: '7001', login: 'disabledhost' });
      setBotAccount({
        userId: '999001',
        login: 'companionbot',
        displayName: 'CompanionBot',
        accessToken: 'oauth_bot_access',
        refreshToken: 'oauth_bot_refresh',
      });

      updateShoutoutSettings('7001', { enabled: false });

      const sentMessages = [];
      const res = await executeShoutout({
        channelId: '7001',
        targetLogin: 'somefriend',
        sendChatFn: async (payload) => {
          sentMessages.push(payload);
        },
      });

      assert.equal(res.success, false);
      assert.equal(res.reason, 'shoutout_disabled');
      assert.equal(sentMessages.length, 0);
    });

    it('should dispatch formatted message and trigger Twitch native shoutout when enabled', async () => {
      upsertChannel({ id: '7002', login: 'activehost', displayName: 'ActiveHost' });
      setBotAccount({
        userId: '999001',
        login: 'companionbot',
        displayName: 'CompanionBot',
        accessToken: 'oauth_bot_access',
        refreshToken: 'oauth_bot_refresh',
      });

      updateShoutoutSettings('7002', {
        enabled: true,
        message: 'Check out {target}! They were playing {game} at {url}!',
        sendTwitchShoutout: true,
      });

      const sentMessages = [];
      let nativeShoutoutTriggered = false;

      const res = await executeShoutout({
        channelId: '7002',
        targetLogin: 'awesomecreator',
        requestedBy: 'headmod',
        sendChatFn: async (payload) => {
          sentMessages.push(payload);
        },
        sendShoutoutFn: async () => {
          nativeShoutoutTriggered = true;
        },
        getUserByLoginFn: async (login) => {
          return { id: '555001', login, displayName: 'AwesomeCreator' };
        },
        getChannelInfoFn: async () => {
          return { gameName: 'Chrono Trigger' };
        },
      });

      assert.equal(res.success, true);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].message.includes('Check out @AwesomeCreator!'));
      assert.ok(sentMessages[0].message.includes('Chrono Trigger'));
      assert.equal(nativeShoutoutTriggered, true);
    });
  });
});
