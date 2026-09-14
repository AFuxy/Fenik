import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, cleanupTestDb } from './setup.js';
import { createServer } from '../src/server.js';
import {
  upsertChannel,
  getChannel,
  createSession,
  setBotAccount,
  getShoutoutSettings,
  updateShoutoutSettings,
  addAutoShoutout,
  removeAutoShoutout,
  getAutoShoutouts,
  getAutoShoutout,
  toggleAutoShoutout,
  updateAutoShoutoutLastTime,
} from '../src/db/index.js';
import { checkAutoShoutoutOnChat, resetShoutoutCooldowns } from '../src/services/shoutoutService.js';
import { dispatchChatMessage } from '../src/services/commandService.js';

describe('Auto-Shoutout Feature Suite', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createServer();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    cleanupTestDb();
  });

  beforeEach(() => {
    clearDatabase();
    resetShoutoutCooldowns();
  });

  describe('Database Repository (autoShoutoutRepo)', () => {
    it('should add, get, toggle, update timestamp, and remove an auto-shoutout entry', () => {
      const channelId = '1001';
      upsertChannel({ id: channelId, login: 'streamerone' });

      // 1. Add auto-shoutout
      const entry = addAutoShoutout(channelId, {
        targetLogin: '@CoolFriend',
        targetDisplayName: 'CoolFriend',
        targetUserId: '5001',
        targetAvatar: 'https://example.com/avatar.png',
      });

      assert.ok(entry);
      assert.equal(entry.targetLogin, 'coolfriend');
      assert.equal(entry.targetDisplayName, 'CoolFriend');
      assert.equal(entry.targetUserId, '5001');
      assert.equal(entry.enabled, true);
      assert.equal(entry.lastShoutedAt, 0);

      // 2. Hydrated in getChannel
      const ch = getChannel(channelId);
      assert.ok(Array.isArray(ch.autoShoutouts));
      assert.equal(ch.autoShoutouts.length, 1);
      assert.equal(ch.autoShoutouts[0].targetLogin, 'coolfriend');

      // 3. Toggle to disabled
      toggleAutoShoutout(channelId, 'coolfriend', false);
      const disabled = getAutoShoutout(channelId, 'coolfriend');
      assert.equal(disabled.enabled, false);

      // 4. Update last shouted timestamp
      const now = Date.now();
      updateAutoShoutoutLastTime(channelId, 'coolfriend', now);
      const updated = getAutoShoutout(channelId, 'coolfriend');
      assert.equal(updated.lastShoutedAt, now);

      // 5. Remove
      const removed = removeAutoShoutout(channelId, 'coolfriend');
      assert.equal(removed, true);
      const afterRemove = getAutoShoutout(channelId, 'coolfriend');
      assert.equal(afterRemove, null);
    });
  });

  describe('Auto-Shoutout Trigger Logic (checkAutoShoutoutOnChat)', () => {
    const channelId = '2001';

    beforeEach(() => {
      upsertChannel({ id: channelId, login: 'broadcasthost', displayName: 'BroadcastHost' });
      setBotAccount({
        userId: '999001',
        login: 'companionbot',
        displayName: 'CompanionBot',
        accessToken: 'bot_access',
        refreshToken: 'bot_refresh',
      });
      updateShoutoutSettings(channelId, {
        enabled: true,
        message: 'Go follow {target} at {url}!',
      });
    });

    it('should fire shoutout when an enabled target chats and update their lastShoutedAt', async () => {
      addAutoShoutout(channelId, {
        targetLogin: 'vipcreator',
        targetDisplayName: 'VIPCreator',
      });

      const sentMessages = [];
      const channel = getChannel(channelId);

      const res = await checkAutoShoutoutOnChat({
        channel,
        chatterLogin: 'vipcreator',
        chatterUserId: '88801',
        sendChatFn: async (payload) => {
          sentMessages.push(payload);
        },
        getUserByLoginFn: async (login) => ({
          id: '88801',
          login,
          displayName: 'VIPCreator',
        }),
      });

      assert.equal(res.triggered, true);
      assert.equal(sentMessages.length, 1);
      assert.ok(sentMessages[0].message.toLowerCase().includes('go follow @vipcreator'));

      // Verify lastShoutedAt was updated in the DB
      const updated = getAutoShoutout(channelId, 'vipcreator');
      assert.ok(updated.lastShoutedAt > 0);
    });

    it('should not fire shoutout if target is on cooldown (< 4 hours)', async () => {
      addAutoShoutout(channelId, {
        targetLogin: 'recentcreator',
        targetDisplayName: 'RecentCreator',
      });

      // Set lastShoutedAt to 10 minutes ago
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      updateAutoShoutoutLastTime(channelId, 'recentcreator', tenMinutesAgo);

      const sentMessages = [];
      const channel = getChannel(channelId);

      const res = await checkAutoShoutoutOnChat({
        channel,
        chatterLogin: 'recentcreator',
        chatterUserId: '88802',
        sendChatFn: async (payload) => {
          sentMessages.push(payload);
        },
      });

      assert.equal(res.triggered, false);
      assert.equal(res.reason, 'on_cooldown');
      assert.equal(sentMessages.length, 0);
    });

    it('should not fire shoutout if chatter is the channel owner themself', async () => {
      addAutoShoutout(channelId, {
        targetLogin: 'broadcasthost',
      });

      const channel = getChannel(channelId);
      const res = await checkAutoShoutoutOnChat({
        channel,
        chatterLogin: 'broadcasthost',
        chatterUserId: channelId,
      });

      assert.equal(res.triggered, false);
      assert.equal(res.reason, 'is_broadcaster');
    });

    it('should not fire shoutout if auto-shoutout entry is disabled', async () => {
      addAutoShoutout(channelId, {
        targetLogin: 'pausedcreator',
      });
      toggleAutoShoutout(channelId, 'pausedcreator', false);

      const channel = getChannel(channelId);
      const res = await checkAutoShoutoutOnChat({
        channel,
        chatterLogin: 'pausedcreator',
        chatterUserId: '88803',
      });

      assert.equal(res.triggered, false);
      assert.equal(res.reason, 'not_configured');
    });
  });

  describe('Chat Commands & Subcommands (!so auto ... and !autoso ...)', () => {
    const channelId = '3001';
    const mockSendChat = async () => ({ message_id: 'test_id' });
    const mockGetUser = async (login) => ({
      id: '55512',
      login: login.toLowerCase(),
      displayName: login,
    });

    beforeEach(() => {
      upsertChannel({ id: channelId, login: 'cmdchannel', prefix: '!' });
      setBotAccount({
        userId: '999001',
        login: 'companionbot',
        displayName: 'CompanionBot',
        accessToken: 'bot_access',
        refreshToken: 'bot_refresh',
      });
    });

    it('should allow moderator to add a creator via !so auto add <username>', async () => {
      const modEvent = {
        broadcaster_user_id: channelId,
        chatter_user_id: '99996',
        chatter_user_name: 'ModUser',
        badges: [{ set_id: 'moderator', id: '1' }],
        message_id: 'msg_1',
        message: { text: '!so auto add CoolPal' },
      };

      await dispatchChatMessage(modEvent, { sendChatFn: mockSendChat, getUserByLoginFn: mockGetUser });

      const list = getAutoShoutouts(channelId);
      assert.equal(list.length, 1);
      assert.equal(list[0].targetLogin, 'coolpal');
    });

    it('should allow moderator to add a creator via !autoso add <username>', async () => {
      const modEvent = {
        broadcaster_user_id: channelId,
        chatter_user_id: '99996',
        chatter_user_name: 'ModUser',
        badges: [{ set_id: 'moderator', id: '1' }],
        message_id: 'msg_2',
        message: { text: '!autoso add StreamFriend' },
      };

      await dispatchChatMessage(modEvent, { sendChatFn: mockSendChat, getUserByLoginFn: mockGetUser });

      const entry = getAutoShoutout(channelId, 'streamfriend');
      assert.ok(entry);
    });

    it('should allow moderator to remove a creator via !so auto remove <username>', async () => {
      addAutoShoutout(channelId, { targetLogin: 'toremove' });
      assert.equal(getAutoShoutouts(channelId).length, 1);

      const modEvent = {
        broadcaster_user_id: channelId,
        chatter_user_id: '99996',
        chatter_user_name: 'ModUser',
        badges: [{ set_id: 'moderator', id: '1' }],
        message_id: 'msg_3',
        message: { text: '!so auto remove toremove' },
      };

      await dispatchChatMessage(modEvent, { sendChatFn: mockSendChat, getUserByLoginFn: mockGetUser });

      assert.equal(getAutoShoutouts(channelId).length, 0);
    });

    it('should reject viewer without mod permissions from using !so auto add', async () => {
      const viewerEvent = {
        broadcaster_user_id: channelId,
        chatter_user_id: '12345',
        chatter_user_name: 'ViewerZero',
        badges: [],
        message_id: 'msg_4',
        message: { text: '!so auto add malicious' },
      };

      await dispatchChatMessage(viewerEvent, { sendChatFn: mockSendChat, getUserByLoginFn: mockGetUser });

      assert.equal(getAutoShoutouts(channelId).length, 0);
    });
  });

  describe('HTTP Endpoints & Dashboard Rendering', () => {
    const ownerId = '4001';
    let sessionToken;

    beforeEach(() => {
      upsertChannel({ id: ownerId, login: 'dashboardstreamer', displayName: 'DashboardStreamer' });
      sessionToken = createSession({
        userId: ownerId,
        login: 'dashboardstreamer',
        displayName: 'DashboardStreamer',
      });
    });

    it('should add streamer via POST /api/shoutout/auto/add and redirect cleanly to /dashboard with active_dashboard_tab=shoutouts cookie', async () => {
      const res = await fetch(`${baseUrl}/api/shoutout/auto/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_token=${sessionToken}`,
        },
        body: new URLSearchParams({
          channelId: ownerId,
          targetLogin: 'GreatStreamer',
        }).toString(),
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/dashboard');

      const setCookie = res.headers.get('set-cookie');
      assert.ok(setCookie.includes('active_dashboard_tab=shoutouts'));

      const list = getAutoShoutouts(ownerId);
      assert.equal(list.length, 1);
      assert.equal(list[0].targetLogin, 'greatstreamer');
    });

    it('should toggle streamer active status via POST /api/shoutout/auto/toggle', async () => {
      addAutoShoutout(ownerId, { targetLogin: 'greatstreamer' });

      const res = await fetch(`${baseUrl}/api/shoutout/auto/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_token=${sessionToken}`,
        },
        body: new URLSearchParams({
          channelId: ownerId,
          targetLogin: 'greatstreamer',
          enabled: 'false',
        }).toString(),
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/dashboard');

      const entry = getAutoShoutout(ownerId, 'greatstreamer');
      assert.equal(entry.enabled, false);
    });

    it('should remove streamer via POST /api/shoutout/auto/remove', async () => {
      addAutoShoutout(ownerId, { targetLogin: 'greatstreamer' });

      const res = await fetch(`${baseUrl}/api/shoutout/auto/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_token=${sessionToken}`,
        },
        body: new URLSearchParams({
          channelId: ownerId,
          targetLogin: 'greatstreamer',
        }).toString(),
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/dashboard');

      const list = getAutoShoutouts(ownerId);
      assert.equal(list.length, 0);
    });

    it('should render the Auto-Shoutout Directory card in the Dashboard UI', async () => {
      addAutoShoutout(ownerId, { targetLogin: 'partnercreator', targetDisplayName: 'PartnerCreator' });

      const res = await fetch(`${baseUrl}/dashboard`, {
        headers: {
          Cookie: `session_token=${sessionToken}; active_dashboard_tab=shoutouts`,
        },
      });

      assert.equal(res.status, 200);
      const html = await res.text();
      assert.ok(html.includes('Auto-Shoutout Directory'));
      assert.ok(html.includes('PartnerCreator'));
      assert.ok(html.includes('twitch.tv/partnercreator'));
      assert.ok(html.includes('Active'));
      assert.ok(html.includes('Remove'));
    });
  });
});
