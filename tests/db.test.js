import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, cleanupTestDb } from './setup.js';
import {
  setBotAccount,
  getBotAccount,
  unlinkBotAccount,
  upsertChannel,
  getChannel,
  getChannelByLogin,
  getAllChannels,
  getAccessibleChannels,
  canManageChannel,
  upsertCommand,
  getCommandById,
  getCommandByTrigger,
  getCommandsForChannel,
  updateCommand,
  deleteCommand,
  incrementCommandCounter,
  insertDefaultCommands,
  BUILTIN_COMMANDS,
  getDisabledBuiltins,
  isBuiltinDisabled,
  setBuiltinDisabled,
  getModerationSettings,
  updateModerationSettings,
  addManager,
  removeManager,
  getManagers,
  getManagerDetails,
  isManager,
  createSession,
  getSession,
  destroySession,
  createTimer,
  getTimers,
  getTimerById,
  updateTimer,
  toggleTimer,
  deleteTimer,
  updateTimerLastRun,
  getAllActiveTimers,
  getRaidSettings,
  updateRaidSettings,
  getShoutoutSettings,
  updateShoutoutSettings,
} from '../src/db/index.js';

describe('Database Repositories', () => {
  beforeEach(() => {
    clearDatabase();
  });

  after(() => {
    cleanupTestDb();
  });

  describe('botRepo', () => {
    it('should save and retrieve the central bot account with encrypted tokens', () => {
      assert.equal(getBotAccount(), null);

      setBotAccount({
        userId: '999001',
        login: 'companionbot',
        displayName: 'CompanionBot',
        avatar: 'https://example.com/bot.png',
        accessToken: 'oauth_bot_access_123',
        refreshToken: 'oauth_bot_refresh_456',
        expiresAt: Date.now() + 3600000,
      });

      const bot = getBotAccount();
      assert.ok(bot);
      assert.equal(bot.userId, '999001');
      assert.equal(bot.login, 'companionbot');
      assert.equal(bot.displayName, 'CompanionBot');
      assert.equal(bot.accessToken, 'oauth_bot_access_123');
      assert.equal(bot.refreshToken, 'oauth_bot_refresh_456');
    });

    it('should clean up old bot records when switching to a new bot account', () => {
      setBotAccount({
        userId: '111111',
        login: 'oldbot',
        displayName: 'OldBot',
        accessToken: 'token_1',
        refreshToken: 'refresh_1',
      });
      assert.equal(getBotAccount()?.login, 'oldbot');

      // Now switch to FenikBot
      setBotAccount({
        userId: '222222',
        login: 'fenikbot',
        displayName: 'FenikBot',
        accessToken: 'token_2',
        refreshToken: 'refresh_2',
      });

      const current = getBotAccount();
      assert.equal(current?.userId, '222222');
      assert.equal(current?.login, 'fenikbot');
    });

    it('should cleanly unlink and disconnect the central bot account', () => {
      setBotAccount({
        userId: '222222',
        login: 'fenikbot',
        displayName: 'FenikBot',
        accessToken: 'token_2',
        refreshToken: 'refresh_2',
      });
      assert.ok(getBotAccount());

      const unlinked = unlinkBotAccount();
      assert.equal(unlinked, true);
      assert.equal(getBotAccount(), null);
    });
  });

  describe('channelRepo', () => {
    it('should create and retrieve a channel with default settings', () => {
      const ch = upsertChannel({
        id: '123456',
        login: 'streamerone',
        displayName: 'StreamerOne',
        avatar: 'https://example.com/avatar.png',
        accessToken: 'streamer_access_token',
        refreshToken: 'streamer_refresh_token',
      });

      assert.equal(ch.id, '123456');
      assert.equal(ch.login, 'streamerone');
      assert.equal(ch.prefix, '!');
      assert.equal(ch.joined, true);

      // Verify defaults inserted
      assert.ok(ch.commands.length >= 3);
      assert.equal(ch.moderation.filterLinks, false);
      assert.equal(ch.moderation.filterCaps, false);
      assert.deepEqual(ch.disabledBuiltins, []);

      const byLogin = getChannelByLogin('STREAMERONE');
      assert.ok(byLogin);
      assert.equal(byLogin.id, '123456');
    });

    it('should update channel prefix and joined state', () => {
      upsertChannel({ id: '1001', login: 'customch', displayName: 'CustomCh' });
      const updated = upsertChannel({ id: '1001', prefix: '?', joined: false });

      assert.equal(updated.prefix, '?');
      assert.equal(updated.joined, false);
    });

    it('should check permissions via canManageChannel and getAccessibleChannels', () => {
      const ownerUser = { userId: '2001', login: 'owneruser' };
      const managerUser = { userId: '2002', login: 'manageruser' };
      const strangerUser = { userId: '2003', login: 'strangeruser' };

      upsertChannel({ id: '2001', login: 'owneruser', displayName: 'OwnerUser' });
      addManager('2001', 'manageruser');

      assert.equal(canManageChannel(ownerUser, '2001'), true);
      assert.equal(canManageChannel(managerUser, '2001'), true);
      assert.equal(canManageChannel(strangerUser, '2001'), false);

      const adminUser = { userId: '9999', login: 'afuxy' };
      assert.equal(canManageChannel(adminUser, '2001'), false, 'Admins cannot manage channels without being owner or manager');

      const accessible = getAccessibleChannels(managerUser);
      assert.equal(accessible.length, 1);
      assert.equal(accessible[0].id, '2001');
    });
  });

  describe('commandRepo', () => {
    it('should CRUD custom commands and increment counter', () => {
      upsertChannel({ id: '3001', login: 'cmdtest' });

      // Create
      const created = upsertCommand('3001', {
        trigger: 'discord',
        response: 'Join https://discord.gg/test',
        userlevel: 'everyone',
        cooldown: 10,
      });
      assert.ok(created.id);
      assert.equal(created.trigger, 'discord');

      // Read by ID and Trigger
      const byId = getCommandById('3001', created.id);
      assert.equal(byId.response, 'Join https://discord.gg/test');

      const byTrigger = getCommandByTrigger('3001', 'DISCORD');
      assert.equal(byTrigger.id, created.id);

      // Update
      const updated = updateCommand('3001', created.id, {
        response: 'Updated discord link',
        cooldown: 15,
        userlevel: 'sub',
      });
      assert.equal(updated.response, 'Updated discord link');
      assert.equal(updated.cooldown, 15);
      assert.equal(updated.userlevel, 'sub');

      // Increment counter
      incrementCommandCounter('3001', created.id);
      const afterInc = getCommandById('3001', created.id);
      assert.equal(afterInc.counter, 1);

      // Delete
      const deleted = deleteCommand('3001', created.id);
      assert.equal(deleted, true);
      assert.equal(getCommandById('3001', created.id), null);
    });
  });

  describe('builtinRepo', () => {
    it('should have all 5 standard built-in commands defined', () => {
      assert.equal(BUILTIN_COMMANDS.length, 5);
      const ids = BUILTIN_COMMANDS.map((b) => b.id);
      assert.ok(ids.includes('ping'));
      assert.ok(ids.includes('roll'));
      assert.ok(ids.includes('so'));
      assert.ok(ids.includes('permit'));
      assert.ok(ids.includes('commands'));
    });

    it('should disable and re-enable built-in commands per channel', () => {
      upsertChannel({ id: '4001', login: 'builtinch' });

      assert.equal(isBuiltinDisabled('4001', 'roll'), false);
      assert.deepEqual(getDisabledBuiltins('4001'), []);

      // Disable roll
      setBuiltinDisabled('4001', 'roll', true);
      assert.equal(isBuiltinDisabled('4001', 'roll'), true);
      assert.deepEqual(getDisabledBuiltins('4001'), ['roll']);

      // Disable ping
      setBuiltinDisabled('4001', 'ping', true);
      assert.equal(isBuiltinDisabled('4001', 'ping'), true);
      assert.equal(getDisabledBuiltins('4001').length, 2);

      // Re-enable roll
      setBuiltinDisabled('4001', 'roll', false);
      assert.equal(isBuiltinDisabled('4001', 'roll'), false);
      assert.deepEqual(getDisabledBuiltins('4001'), ['ping']);
    });
  });

  describe('moderationRepo', () => {
    it('should update and retrieve moderation rules', () => {
      upsertChannel({ id: '5001', login: 'modtest' });

      updateModerationSettings('5001', {
        filterLinks: true,
        filterCaps: true,
        bannedWords: ['badword', 'spammer'],
      });

      const settings = getModerationSettings('5001');
      assert.equal(settings.filterLinks, true);
      assert.equal(settings.filterCaps, true);
      assert.deepEqual(settings.bannedWords, ['badword', 'spammer']);
    });
  });

  describe('managerRepo', () => {
    it('should add, check, and remove channel managers', () => {
      upsertChannel({ id: '6001', login: 'mgrtest' });

      assert.equal(isManager('6001', 'modjoe'), false);
      addManager('6001', 'ModJoe');
      assert.equal(isManager('6001', 'modjoe'), true);

      const managers = getManagers('6001');
      assert.deepEqual(managers, ['modjoe']);

      removeManager('6001', 'modjoe');
      assert.equal(isManager('6001', 'modjoe'), false);
      assert.deepEqual(getManagers('6001'), []);
    });

    it('should store and resolve manager profile metadata including real avatar', () => {
      upsertChannel({ 
        id: '6002', 
        login: 'mgrtest2', 
        displayName: 'MgrTest2',
        avatar: 'https://cdn.example.com/mgrtest2.png',
      });
      upsertChannel({ 
        id: '6003', 
        login: 'headmod', 
        displayName: 'HeadMod',
        avatar: 'https://cdn.example.com/headmod.png',
      });

      addManager('6002', 'headmod', {
        displayName: 'HeadMod',
        avatarUrl: 'https://cdn.example.com/headmod.png',
        userId: '6003',
      });

      const details = getManagerDetails('6002');
      assert.equal(details.length, 1);
      assert.equal(details[0].username, 'headmod');
      assert.equal(details[0].displayName, 'HeadMod');
      assert.equal(details[0].avatar, 'https://cdn.example.com/headmod.png');
      assert.equal(details[0].userId, '6003');
    });
  });

  describe('sessionRepo', () => {
    it('should create, validate, and destroy login sessions', () => {
      const user = {
        userId: '7001',
        login: 'sessionuser',
        displayName: 'SessionUser',
        avatar: 'https://example.com/avatar.png',
      };

      const token = createSession(user);
      assert.ok(token);

      const session = getSession(token);
      assert.ok(session);
      assert.equal(session.userId, '7001');
      assert.equal(session.login, 'sessionuser');

      destroySession(token);
      assert.equal(getSession(token), null);
    });
  });

  describe('timerRepo', () => {
    it('should create, retrieve, update, toggle, and delete timers', () => {
      upsertChannel({ id: '8001', login: 'timertester' });

      // 1. Create timer
      const timer = createTimer('8001', {
        name: 'Discord Reminder',
        message: 'Join our community Discord: https://discord.gg/example',
        intervalMinutes: 20,
        minChatLines: 5,
      });

      assert.ok(timer.id);
      assert.equal(timer.name, 'Discord Reminder');
      assert.equal(timer.intervalMinutes, 20);
      assert.equal(timer.minChatLines, 5);
      assert.equal(timer.enabled, true);

      // 2. Fetch via getTimers and getChannel
      const list = getTimers('8001');
      assert.equal(list.length, 1);
      assert.equal(list[0].id, timer.id);

      const ch = getChannel('8001');
      assert.equal(ch.timers.length, 1);
      assert.equal(ch.timers[0].name, 'Discord Reminder');

      // 3. Update timer
      const updated = updateTimer('8001', timer.id, {
        name: 'Discord & Socials',
        message: 'Join Discord and check socials!',
        intervalMinutes: 10,
        minChatLines: 2,
      });
      assert.equal(updated.name, 'Discord & Socials');
      assert.equal(updated.intervalMinutes, 10);
      assert.equal(updated.minChatLines, 2);

      // 4. Toggle timer
      const toggledOff = toggleTimer('8001', timer.id, false);
      assert.equal(toggledOff.enabled, false);

      const activeList = getAllActiveTimers();
      assert.equal(activeList.length, 0); // Not active because enabled = false

      toggleTimer('8001', timer.id, true);
      const activeList2 = getAllActiveTimers();
      assert.equal(activeList2.length, 1);

      // 5. Update last run
      const testTimestamp = 1700000000000;
      updateTimerLastRun('8001', timer.id, testTimestamp);
      const fetchedAgain = getTimerById('8001', timer.id);
      assert.equal(fetchedAgain.lastRunAt, testTimestamp);

      // 6. Delete timer
      const deleted = deleteTimer('8001', timer.id);
      assert.equal(deleted, true);
      assert.equal(getTimers('8001').length, 0);
    });

    it('should throw error when creating timer with empty name or message', () => {
      upsertChannel({ id: '8002', login: 'timertester2' });

      assert.throws(() => {
        createTimer('8002', { name: '', message: 'Test message' });
      }, /Timer name is required/);

      assert.throws(() => {
        createTimer('8002', { name: 'Test', message: '' });
      }, /Timer message is required/);
    });
  });

  describe('raidRepo', () => {
    it('should return default raid settings for unconfigured channel', () => {
      upsertChannel({ id: '8501', login: 'raidtester1' });
      const settings = getRaidSettings('8501');

      assert.ok(settings);
      assert.equal(settings.enabled, true);
      assert.equal(settings.minViewers, 1);
      assert.equal(settings.cooldownMinutes, 30);
      assert.ok(settings.message.includes('{raider}'));
      assert.equal(settings.sendTwitchShoutout, true);
    });

    it('should update and retrieve custom raid settings', () => {
      upsertChannel({ id: '8502', login: 'raidtester2' });

      const updated = updateRaidSettings('8502', {
        enabled: false,
        minViewers: 15,
        cooldownMinutes: 30,
        message: 'Massive love to {raider} and their {viewers} viewers playing {game}! Check them at {url}',
        sendTwitchShoutout: false,
      });

      assert.equal(updated.enabled, false);
      assert.equal(updated.minViewers, 15);
      assert.equal(updated.cooldownMinutes, 30);
      assert.equal(updated.message, 'Massive love to {raider} and their {viewers} viewers playing {game}! Check them at {url}');
      assert.equal(updated.sendTwitchShoutout, false);

      const fetched = getRaidSettings('8502');
      assert.equal(fetched.enabled, false);
      assert.equal(fetched.minViewers, 15);
      assert.equal(fetched.cooldownMinutes, 30);
      assert.equal(fetched.sendTwitchShoutout, false);

      // Verify channel hydration includes raidSettings
      const ch = getChannel('8502');
      assert.ok(ch.raidSettings);
      assert.equal(ch.raidSettings.minViewers, 15);
    });
  });

  describe('shoutoutRepo', () => {
    it('should return default shoutout settings for unconfigured channel', () => {
      upsertChannel({ id: '8601', login: 'sotester1' });
      const settings = getShoutoutSettings('8601');

      assert.ok(settings);
      assert.equal(settings.enabled, true);
      assert.ok(settings.message.includes('{target}'));
      assert.equal(settings.autoOnRaid, true);
      assert.equal(settings.sendTwitchShoutout, true);
      assert.equal(settings.userlevel, 'mod');
      assert.equal(settings.cooldownSeconds, 15);
    });

    it('should update and retrieve custom shoutout settings', () => {
      upsertChannel({ id: '8602', login: 'sotester2' });

      const updated = updateShoutoutSettings('8602', {
        enabled: false,
        message: 'Show love to {target} at {url}!',
        autoOnRaid: false,
        sendTwitchShoutout: false,
        userlevel: 'everyone',
        cooldownSeconds: 45,
      });

      assert.equal(updated.enabled, false);
      assert.equal(updated.message, 'Show love to {target} at {url}!');
      assert.equal(updated.autoOnRaid, false);
      assert.equal(updated.sendTwitchShoutout, false);
      assert.equal(updated.userlevel, 'everyone');
      assert.equal(updated.cooldownSeconds, 45);

      const fetched = getShoutoutSettings('8602');
      assert.equal(fetched.enabled, false);
      assert.equal(fetched.cooldownSeconds, 45);

      // Verify channel hydration includes shoutoutSettings
      const ch = getChannel('8602');
      assert.ok(ch.shoutoutSettings);
      assert.equal(ch.shoutoutSettings.cooldownSeconds, 45);
    });
  });
});
