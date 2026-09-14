import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, formatResponse, handleChatMessage } from '../src/services/commandService.js';
import { formatDuration, formatFollowage } from '../src/services/twitchApi.js';

describe('Command Execution Service', () => {
  describe('Permission Validation', () => {
    const broadcasterId = '10001';

    it('should grant everyone permission for "everyone" userlevel', () => {
      const viewerEvent = { chatter_user_id: '99999', badges: [] };
      assert.equal(hasPermission(viewerEvent, broadcasterId, 'everyone'), true);
    });

    it('should properly gate sub-only commands', () => {
      const viewerEvent = { chatter_user_id: '99999', badges: [] };
      const subEvent = { chatter_user_id: '99998', badges: [{ set_id: 'subscriber', id: '12' }] };
      const broadcasterEvent = { chatter_user_id: '10001', badges: [] };

      assert.equal(hasPermission(viewerEvent, broadcasterId, 'sub'), false);
      assert.equal(hasPermission(subEvent, broadcasterId, 'sub'), true);
      assert.equal(hasPermission(broadcasterEvent, broadcasterId, 'sub'), true); // Broadcaster always passes
    });

    it('should properly gate vip-only commands', () => {
      const subEvent = { chatter_user_id: '99998', badges: [{ set_id: 'subscriber', id: '12' }] };
      const vipEvent = { chatter_user_id: '99997', badges: [{ set_id: 'vip', id: '1' }] };
      const modEvent = { chatter_user_id: '99996', badges: [{ set_id: 'moderator', id: '1' }] };

      assert.equal(hasPermission(subEvent, broadcasterId, 'vip'), false);
      assert.equal(hasPermission(vipEvent, broadcasterId, 'vip'), true);
      assert.equal(hasPermission(modEvent, broadcasterId, 'vip'), true); // Mod inherits VIP
    });

    it('should properly gate mod-only commands', () => {
      const vipEvent = { chatter_user_id: '99997', badges: [{ set_id: 'vip', id: '1' }] };
      const modEvent = { chatter_user_id: '99996', badges: [{ set_id: 'moderator', id: '1' }] };

      assert.equal(hasPermission(vipEvent, broadcasterId, 'mod'), false);
      assert.equal(hasPermission(modEvent, broadcasterId, 'mod'), true);
    });

    it('should gate broadcaster-only commands exclusively to the channel broadcaster', () => {
      const modEvent = { chatter_user_id: '99996', badges: [{ set_id: 'moderator', id: '1' }] };
      const broadcasterEvent = { chatter_user_id: '10001', badges: [] };

      assert.equal(hasPermission(modEvent, broadcasterId, 'broadcaster'), false);
      assert.equal(hasPermission(broadcasterEvent, broadcasterId, 'broadcaster'), true);
    });
  });

  describe('Dynamic Variable Interpolation', () => {
    const event = { chatter_user_name: 'testviewer' };
    const channel = { displayName: 'CoolStreamer', login: 'coolstreamer' };
    const command = { counter: 4 };

    it('should interpolate {user}, {target}, {channel}, and {count}', () => {
      const template = '{user} says hello to {target} in {channel}! Trigger count: {count}';
      const output = formatResponse(template, {
        event,
        channel,
        args: ['@buddy'],
        command,
      });

      assert.equal(output, '@testviewer says hello to @buddy in CoolStreamer! Trigger count: 5');
    });

    it('should fallback {target} to the chatter username if no argument was passed', () => {
      const template = 'Target is {target}';
      const output = formatResponse(template, {
        event,
        channel,
        args: [],
        command,
      });

      assert.equal(output, 'Target is @testviewer');
    });

    it('should interpolate {random.X-Y} within the specified bounds', () => {
      const template = 'Rolled: {random.10-20}';
      const output = formatResponse(template, {
        event,
        channel,
        args: [],
        command,
      });

      const match = output.match(/Rolled: (\d+)/);
      assert.ok(match, 'Output must contain rolled number');
      const num = parseInt(match[1], 10);
      assert.ok(num >= 10 && num <= 20, `Number ${num} must be between 10 and 20`);
    });

    it('should format stream duration and followage accurately', () => {
      // formatDuration
      assert.equal(formatDuration(0), '0m');
      assert.equal(formatDuration(45 * 60 * 1000), '45m');
      assert.equal(formatDuration((2 * 3600 + 15 * 60) * 1000), '2h 15m');
      assert.equal(formatDuration((26 * 3600 + 10 * 60) * 1000), '1d 2h 10m');

      // formatFollowage
      assert.equal(formatFollowage(null), 'not following');
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 24 * 3600 * 1000).toISOString();
      assert.ok(formatFollowage(tenDaysAgo).includes('10 days'));

      const oneYearAgo = new Date(now - 400 * 24 * 3600 * 1000).toISOString();
      assert.ok(formatFollowage(oneYearAgo).includes('1 year'));
    });

    it('should interpolate {uptime} when stream is live', async () => {
      const template = '{channel} has been live for {uptime}!';
      const output = await formatResponse(template, {
        event,
        channel,
        args: [],
        command,
        getStreamInfoFn: async () => ({
          isLive: true,
          uptimeFormatted: '2h 15m',
        }),
      });

      assert.equal(output, 'CoolStreamer has been live for 2h 15m!');
    });

    it('should intelligently format {uptime} when stream is offline', async () => {
      const liveForTemplate = '{channel} has been live for {uptime}';
      const output1 = await formatResponse(liveForTemplate, {
        event,
        channel,
        args: [],
        command,
        getStreamInfoFn: async () => ({ isLive: false }),
      });
      assert.equal(output1, 'CoolStreamer is currently offline');

      const standaloneTemplate = '{uptime}';
      const output2 = await formatResponse(standaloneTemplate, {
        event,
        channel,
        args: [],
        command,
        getStreamInfoFn: async () => ({ isLive: false }),
      });
      assert.equal(output2, 'Stream is currently offline');
    });

    it('should interpolate {game} and {title} from live stream metadata', async () => {
      const template = 'Now playing {game}: {title}';
      const output = await formatResponse(template, {
        event,
        channel,
        args: [],
        command,
        getStreamInfoFn: async () => ({
          isLive: true,
          gameName: 'Lethal Company',
          title: 'Deep moon exploration with crew',
        }),
      });

      assert.equal(output, 'Now playing Lethal Company: Deep moon exploration with crew');
    });

    it('should fallback {game} and {title} to channel info when stream is offline', async () => {
      const template = 'Last played {game} with title: {title}';
      const output = await formatResponse(template, {
        event,
        channel,
        args: [],
        command,
        getStreamInfoFn: async () => ({ isLive: false }),
        getChannelInfoFn: async () => ({
          gameName: 'Super Mario 64',
          title: 'Speedruns and practice',
        }),
      });

      assert.equal(output, 'Last played Super Mario 64 with title: Speedruns and practice');
    });

    it('should interpolate {followage} for a following chatter', async () => {
      const template = '{user} has been following {channel} for {followage}';
      const output = await formatResponse(template, {
        event: { chatter_user_name: 'testviewer', chatter_user_id: '99999' },
        channel,
        args: [],
        command,
        getFollowAgeFn: async () => ({
          isFollowing: true,
          followageFormatted: '1 year, 2 months',
        }),
      });

      assert.equal(output, '@testviewer has been following CoolStreamer for 1 year, 2 months');
    });

    it('should intelligently format {followage} when user is not following', async () => {
      const template = '{target} has been following {channel} for {followage}';
      const output = await formatResponse(template, {
        event,
        channel,
        args: ['@newbie'],
        command,
        getUserByLoginFn: async () => ({ id: '88888' }),
        getFollowAgeFn: async () => ({
          isFollowing: false,
          followageFormatted: 'not following',
        }),
      });

      assert.equal(output, '@newbie is not following CoolStreamer');
    });

    it('should recognize broadcaster for {followage}', async () => {
      const template = '{target} has been following {channel} for {followage}';
      const output = await formatResponse(template, {
        event,
        channel,
        args: ['@coolstreamer'],
        command,
      });

      assert.equal(output, '@coolstreamer is the channel broadcaster');
    });

    it('should interpolate multi-variable templates with combined twitch tags', async () => {
      const template = '[{channel}] Live for {uptime} playing {game}! Chat rules: no spam. Counter: #{count}';
      const output = await formatResponse(template, {
        event,
        channel,
        args: [],
        command: { counter: 41 },
        getStreamInfoFn: async () => ({
          isLive: true,
          uptimeFormatted: '3h 40m',
          gameName: 'Valorant',
          title: 'Ranked Grinding',
        }),
      });

      assert.equal(
        output,
        '[CoolStreamer] Live for 3h 40m playing Valorant! Chat rules: no spam. Counter: #42'
      );
    });
  });

  describe('Custom Command Aliases & Execution', () => {
    it('should trigger a command when called via any of its configured aliases', async () => {
      const channel = {
        id: 'alias-ch-1',
        login: 'aliastester',
        displayName: 'AliasTester',
        prefix: '!',
        commands: [
          {
            id: 'cmd-discord',
            trigger: 'discord',
            aliases: 'dc, disc, chatcord',
            response: 'Join our Discord: https://discord.gg/test',
            userlevel: 'everyone',
            cooldown: 5,
            enabled: true,
          },
        ],
      };

      const sentMessages = [];
      const sendChatFn = async ({ message }) => {
        sentMessages.push(message);
      };

      // Call via primary trigger
      await handleChatMessage(
        { message: { text: '!discord' }, chatter_user_name: 'viewer1', chatter_user_id: '111' },
        { channel, botId: 'bot-1', sendChatFn }
      );
      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0], 'Join our Discord: https://discord.gg/test');

      // Call via alias !dc (alter command id to avoid active cooldown in test)
      channel.commands[0].id = 'cmd-discord-2';
      await handleChatMessage(
        { message: { text: '!dc' }, chatter_user_name: 'viewer2', chatter_user_id: '222' },
        { channel, botId: 'bot-1', sendChatFn }
      );
      assert.equal(sentMessages.length, 2);
      assert.equal(sentMessages[1], 'Join our Discord: https://discord.gg/test');
    });

    it('should share cooldown between the primary command trigger and its aliases', async () => {
      const channel = {
        id: 'shared-cd-ch',
        login: 'cdtester',
        prefix: '!',
        commands: [
          {
            id: 'cmd-shared-cd',
            trigger: 'twitter',
            aliases: 'x, twt',
            response: 'Follow on Twitter: @streamer',
            userlevel: 'everyone',
            cooldown: 60, // 60s cooldown
            enabled: true,
          },
        ],
      };

      const sentMessages = [];
      const sendChatFn = async ({ message }) => {
        sentMessages.push(message);
      };

      // 1. First execution via primary trigger !twitter
      await handleChatMessage(
        { message: { text: '!twitter' }, chatter_user_name: 'viewer1', chatter_user_id: '111' },
        { channel, botId: 'bot-1', sendChatFn }
      );
      assert.equal(sentMessages.length, 1);

      // 2. Immediately try executing via alias !x -> must be blocked by shared cooldown!
      await handleChatMessage(
        { message: { text: '!x' }, chatter_user_name: 'viewer2', chatter_user_id: '222' },
        { channel, botId: 'bot-1', sendChatFn }
      );
      assert.equal(sentMessages.length, 1); // Still 1!

      // 3. Immediately try executing via alias !twt -> must also be blocked
      await handleChatMessage(
        { message: { text: '!twt' }, chatter_user_name: 'viewer3', chatter_user_id: '333' },
        { channel, botId: 'bot-1', sendChatFn }
      );
      assert.equal(sentMessages.length, 1); // Still 1!
    });

    it('should enforce userlevel permissions when invoked via alias', async () => {
      const channel = {
        id: 'perm-alias-ch',
        login: 'permtester',
        prefix: '!',
        commands: [
          {
            id: 'cmd-mod-alias',
            trigger: 'secret',
            aliases: 'shh, vipzone',
            response: 'Top secret moderator info',
            userlevel: 'mod',
            cooldown: 5,
            enabled: true,
          },
        ],
      };

      const sentMessages = [];
      const sendChatFn = async ({ message }) => {
        sentMessages.push(message);
      };

      // Non-mod user calls alias !shh
      await handleChatMessage(
        { message: { text: '!shh' }, chatter_user_name: 'regular', chatter_user_id: '555', badges: [] },
        { channel, botId: 'bot-1', sendChatFn }
      );
      assert.equal(sentMessages.length, 0);

      // Mod user calls alias !shh
      await handleChatMessage(
        { message: { text: '!shh' }, chatter_user_name: 'moderator1', chatter_user_id: '666', badges: [{ set_id: 'moderator', id: '1' }] },
        { channel, botId: 'bot-1', sendChatFn }
      );
      assert.equal(sentMessages.length, 1);
      assert.equal(sentMessages[0], 'Top secret moderator info');
    });
  });
});
