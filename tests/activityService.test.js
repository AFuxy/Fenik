import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  recordActivity,
  getRecentActivities,
  clearActivities,
} from '../src/services/activityService.js';

describe('Activity Service Ring Buffer', () => {
  const channelA = 'test-ch-1';
  const channelB = 'test-ch-2';

  beforeEach(() => {
    clearActivities(channelA);
    clearActivities(channelB);
  });

  it('should record and retrieve activities in reverse chronological order', () => {
    recordActivity(channelA, {
      type: 'command',
      title: 'Command !discord',
      detail: 'Sent Discord invite',
      actor: 'viewer1',
    });

    recordActivity(channelA, {
      type: 'moderation',
      title: 'Link Blocked',
      detail: 'Deleted link from viewer2',
      actor: 'viewer2',
    });

    const activities = getRecentActivities(channelA);
    assert.equal(activities.length, 2);
    // Newest first
    assert.equal(activities[0].title, 'Link Blocked');
    assert.equal(activities[0].type, 'moderation');
    assert.equal(activities[1].title, 'Command !discord');
    assert.equal(activities[1].type, 'command');
    assert.ok(activities[0].id);
    assert.ok(activities[0].timestamp);
  });

  it('should respect the limit parameter on retrieval', () => {
    for (let i = 1; i <= 10; i++) {
      recordActivity(channelA, {
        type: 'command',
        title: `Command ${i}`,
      });
    }

    const limited = getRecentActivities(channelA, 4);
    assert.equal(limited.length, 4);
    assert.equal(limited[0].title, 'Command 10');
    assert.equal(limited[3].title, 'Command 7');
  });

  it('should isolate activities between different channels', () => {
    recordActivity(channelA, { type: 'alert', title: 'Follower Alert' });
    recordActivity(channelB, { type: 'timer', title: 'Scheduled Timer' });

    const actsA = getRecentActivities(channelA);
    const actsB = getRecentActivities(channelB);

    assert.equal(actsA.length, 1);
    assert.equal(actsA[0].title, 'Follower Alert');

    assert.equal(actsB.length, 1);
    assert.equal(actsB[0].title, 'Scheduled Timer');
  });

  it('should clear channel activities cleanly', () => {
    recordActivity(channelA, { type: 'command', title: 'Test Cmd' });
    assert.equal(getRecentActivities(channelA).length, 1);

    clearActivities(channelA);
    assert.equal(getRecentActivities(channelA).length, 0);
  });
});
