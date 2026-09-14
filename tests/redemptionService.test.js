import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRedemptionMessage,
  findMatchingTrigger,
  executeRedemptionTrigger,
  executeTestRedemption,
} from '../src/services/redemptionService.js';
import { setBotAccount } from '../src/db/botRepo.js';
import { upsertChannel } from '../src/db/channelRepo.js';
import {
  upsertChannelPointTrigger,
  getChannelPointTriggers,
  deleteChannelPointTrigger,
} from '../src/db/redemptionRepo.js';

test('Channel Point Reward Redemption Service', async (t) => {
  const dummyChannel = {
    id: 'point_chan_101',
    login: 'streamchannel',
    displayName: 'StreamChannel',
  };

  await t.test('formatRedemptionMessage', async () => {
    // 1. Basic synchronous variables
    const tpl = '🥤 Drink up @{channel}! {user} redeemed {reward} with message: "{input}"! (Count: {count})';
    const res = await formatRedemptionMessage(tpl, {
      user: 'CoolViewer',
      reward: 'Hydrate',
      input: 'Stay healthy!',
      channel: dummyChannel,
      counter: 42,
    });
    assert.strictEqual(
      res,
      '🥤 Drink up @StreamChannel! @CoolViewer redeemed Hydrate with message: "Stay healthy!"! (Count: 42)'
    );

    // 2. Dynamic Twitch variables ({uptime}, {game}, {title})
    const tplTwitch = '🎮 Playing {game} for {uptime} - Title: {title} | Redeemed by {user}';
    const mockGetStream = async () => ({
      isLive: true,
      uptimeFormatted: '3h 15m',
      gameName: 'Elden Ring',
      title: 'No Death Run',
    });
    const resTwitch = await formatRedemptionMessage(tplTwitch, {
      user: 'GamerFan',
      reward: 'Check Stream',
      channel: dummyChannel,
      getStreamInfoFn: mockGetStream,
    });
    assert.strictEqual(
      resTwitch,
      '🎮 Playing Elden Ring for 3h 15m - Title: No Death Run | Redeemed by @GamerFan'
    );
  });

  await t.test('findMatchingTrigger', () => {
    const triggers = [
      {
        id: 'trig_1',
        rewardTitle: 'Hydrate',
        rewardId: 'twitch_reward_100',
        enabled: true,
      },
      {
        id: 'trig_2',
        rewardTitle: 'Posture Check',
        rewardId: null,
        enabled: true,
      },
      {
        id: 'trig_3',
        rewardTitle: 'Disabled Reward',
        rewardId: null,
        enabled: false,
      },
    ];

    // 1. Match by reward ID
    const matchId = findMatchingTrigger(triggers, { id: 'twitch_reward_100', title: 'Any Title' });
    assert.strictEqual(matchId?.id, 'trig_1');

    // 2. Match by case-insensitive title
    const matchTitle = findMatchingTrigger(triggers, { id: 'some_other_id', title: 'posture check' });
    assert.strictEqual(matchTitle?.id, 'trig_2');

    // 3. Disabled trigger should not match
    const matchDisabled = findMatchingTrigger(triggers, { title: 'Disabled Reward' });
    assert.strictEqual(matchDisabled, null);

    // 4. Unknown reward
    const matchNone = findMatchingTrigger(triggers, { title: 'Non Existent' });
    assert.strictEqual(matchNone, null);
  });

  await t.test('executeRedemptionTrigger execution, cooldown, and counters', async () => {
    setBotAccount({
      userId: 'bot_redemp_1',
      login: 'fuxybot',
      displayName: 'FuxyBot',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
    });

    upsertChannel({
      id: 'point_chan_exec',
      login: 'redeemchan',
      displayName: 'RedeemChan',
      joined: true,
    });

    const existing = getChannelPointTriggers('point_chan_exec');
    for (const t of existing) {
      deleteChannelPointTrigger('point_chan_exec', t.id);
    }

    const trigger = upsertChannelPointTrigger('point_chan_exec', {
      rewardTitle: 'Hydrate',
      responseMessage: '💧 Water break for @{channel}! Thanks @{user}! (Count: {count})',
      cooldownSeconds: 10,
      enabled: true,
    });

    const sent = [];
    const mockSendChat = async (payload) => {
      sent.push(payload);
    };

    const event = {
      broadcaster_user_id: 'point_chan_exec',
      user_name: 'WaterLover',
      user_input: '',
      reward: {
        id: 'reward_123',
        title: 'Hydrate',
      },
    };

    const t0 = 1000000;
    // 1. First execution succeeds
    const r1 = await executeRedemptionTrigger(event, {
      sendChatFn: mockSendChat,
      now: t0,
    });
    assert.ok(r1);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].message, '💧 Water break for @RedeemChan! Thanks @WaterLover! (Count: 1)');

    // 2. Immediate redemption within 10s cooldown should be suppressed
    const r2 = await executeRedemptionTrigger(event, {
      sendChatFn: mockSendChat,
      now: t0 + 5000, // 5s later (< 10s cooldown)
    });
    assert.strictEqual(r2, null);
    assert.strictEqual(sent.length, 1); // No new message

    // 3. Redemption after cooldown expires (15s later) succeeds and increments counter
    const r3 = await executeRedemptionTrigger(event, {
      sendChatFn: mockSendChat,
      now: t0 + 15000,
    });
    assert.ok(r3);
    assert.strictEqual(sent.length, 2);
    assert.strictEqual(sent[1].message, '💧 Water break for @RedeemChan! Thanks @WaterLover! (Count: 2)');

    // Cleanup
    deleteChannelPointTrigger('point_chan_exec', trigger.id);
  });

  await t.test('executeTestRedemption', async () => {
    upsertChannel({
      id: 'point_chan_test',
      login: 'testpoints',
      displayName: 'TestPoints',
      joined: true,
    });

    const existingTest = getChannelPointTriggers('point_chan_test');
    for (const t of existingTest) {
      deleteChannelPointTrigger('point_chan_test', t.id);
    }

    const trigger = upsertChannelPointTrigger('point_chan_test', {
      rewardTitle: 'Ask Bot',
      responseMessage: '🔮 @{user} asked: "{input}" | Bot says: Yes!',
      cooldownSeconds: 5,
      enabled: true,
    });

    const sent = [];
    const mockSendChat = async (payload) => {
      sent.push(payload);
    };

    const res = await executeTestRedemption('point_chan_test', trigger.id, {
      sendChatFn: mockSendChat,
      testInput: 'Will it rain today?',
    });

    assert.ok(res.success);
    assert.strictEqual(
      res.message,
      '[TEST] 🔮 @LuckyRedeemer asked: "Will it rain today?" | Bot says: Yes!'
    );
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].message, res.message);

    // Cleanup
    deleteChannelPointTrigger('point_chan_test', trigger.id);
  });
});
