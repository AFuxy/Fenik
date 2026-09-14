import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission, formatResponse } from '../src/services/commandService.js';

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
  });
});
