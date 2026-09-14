import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatTierName,
  formatFollowMessage,
  formatSubMessage,
  executeFollowAlert,
  executeSubscriptionAlert,
  executeTestAlert,
} from '../src/services/alertService.js';
import { setBotAccount } from '../src/db/botRepo.js';
import { upsertChannel } from '../src/db/channelRepo.js';
import { updateStreamAlertSettings } from '../src/db/alertRepo.js';

test('Stream Alerts Service & Formatting', async (t) => {
  const dummyChannel = {
    id: 'alert_chan_101',
    login: 'teststreamer',
    displayName: 'TestStreamer',
  };

  await t.test('formatTierName', () => {
    assert.strictEqual(formatTierName('1000'), 'Tier 1');
    assert.strictEqual(formatTierName('2000'), 'Tier 2');
    assert.strictEqual(formatTierName('3000'), 'Tier 3');
    assert.strictEqual(formatTierName('Prime'), 'Prime');
    assert.strictEqual(formatTierName('prime'), 'Prime');
    assert.strictEqual(formatTierName(null), 'Tier 1');
    assert.strictEqual(formatTierName('CustomTier'), 'CustomTier');
  });

  await t.test('formatFollowMessage', () => {
    const template = 'Welcome to the stream, @{user}! Thanks for following {channel}!';
    const result = formatFollowMessage(template, {
      user: 'CoolViewer',
      channel: dummyChannel,
    });
    assert.strictEqual(result, 'Welcome to the stream, @CoolViewer! Thanks for following TestStreamer!');
  });

  await t.test('formatSubMessage', () => {
    // 1. Regular sub
    const subTpl = 'Thanks @{user} for subscribing at {tier} in {channel}!';
    const subResult = formatSubMessage(subTpl, {
      user: 'SuperFan',
      tier: '2000',
      channel: dummyChannel,
    });
    assert.strictEqual(subResult, 'Thanks @SuperFan for subscribing at Tier 2 in TestStreamer!');

    // 2. Resub with streak & message
    const resubTpl = 'Welcome back @{user} at {tier} for {months} months! {streak} {message}';
    const resubResult = formatSubMessage(resubTpl, {
      user: 'LoyalSub',
      tier: '1000',
      months: 12,
      streak: 5,
      message: 'Happy anniversary!',
      channel: dummyChannel,
    });
    assert.strictEqual(
      resubResult,
      'Welcome back @LoyalSub at Tier 1 for 12 months! 5 month streak! "Happy anniversary!"'
    );

    // 3. Single gift sub
    const giftTpl = 'Thanks @{user} for gifting a {tier} sub to @{recipient}!';
    const giftResult = formatSubMessage(giftTpl, {
      user: 'Gifter1',
      tier: '1000',
      recipient: 'LuckyChatter',
      channel: dummyChannel,
    });
    assert.strictEqual(giftResult, 'Thanks @Gifter1 for gifting a Tier 1 sub to @LuckyChatter!');

    // 4. Community sub bomb
    const bombTpl = 'WOW! Huge thanks to @{user} for gifting {count} subs to the community!';
    const bombResult = formatSubMessage(bombTpl, {
      user: 'GenerousWhale',
      count: 20,
      channel: dummyChannel,
    });
    assert.strictEqual(bombResult, 'WOW! Huge thanks to @GenerousWhale for gifting 20 subs to the community!');
  });

  await t.test('executeFollowAlert', async () => {
    setBotAccount({
      userId: 'bot_alert_1',
      login: 'fuxybot',
      displayName: 'FuxyBot',
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 100000,
    });

    upsertChannel({
      id: 'alert_chan_follow',
      login: 'followchan',
      displayName: 'FollowChan',
      joined: true,
    });

    updateStreamAlertSettings('alert_chan_follow', {
      followEnabled: true,
      followMessage: 'Huge welcome to @{user}! Thanks for following {channel}!',
    });

    const sent = [];
    const mockSendChat = async (payload) => {
      sent.push(payload);
    };

    const event = {
      broadcaster_user_id: 'alert_chan_follow',
      user_login: 'brandnewfan',
      user_name: 'BrandNewFan',
    };

    const res = await executeFollowAlert(event, { sendChatFn: mockSendChat });
    assert.ok(res);
    assert.strictEqual(res.success, true);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].broadcasterId, 'alert_chan_follow');
    assert.strictEqual(sent[0].message, 'Huge welcome to @BrandNewFan! Thanks for following FollowChan!');

    // Disabled follow alert should return null
    updateStreamAlertSettings('alert_chan_follow', { followEnabled: false });
    const disabledRes = await executeFollowAlert(event, { sendChatFn: mockSendChat });
    assert.strictEqual(disabledRes, null);
    assert.strictEqual(sent.length, 1); // No new message sent
  });

  await t.test('executeSubscriptionAlert', async () => {
    upsertChannel({
      id: 'alert_chan_sub',
      login: 'subchan',
      displayName: 'SubChan',
      joined: true,
    });

    updateStreamAlertSettings('alert_chan_sub', {
      subEnabled: true,
      subMessage: 'Thank you @{user} for subscribing at {tier}!',
      resubMessage: 'Welcome back @{user} for {months} months at {tier}! {streak} {message}',
      giftSubMessage: 'Thank you @{user} for gifting a {tier} sub to @{recipient}!',
      communityGiftMessage: 'WOW! @{user} gifted {count} subs at {tier}!',
    });

    const sent = [];
    const mockSendChat = async (payload) => {
      sent.push(payload);
    };

    // 1. New direct subscriber
    const newSubEvent = {
      broadcaster_user_id: 'alert_chan_sub',
      user_name: 'SuperFan',
      tier: '1000',
      is_gift: false,
    };
    const r1 = await executeSubscriptionAlert(newSubEvent, 'channel.subscribe', { sendChatFn: mockSendChat });
    assert.ok(r1);
    assert.strictEqual(sent[0].message, 'Thank you @SuperFan for subscribing at Tier 1!');

    // 2. Gift in channel.subscribe should be ignored (avoids flood on sub bombs)
    const giftSubDirect = {
      broadcaster_user_id: 'alert_chan_sub',
      user_name: 'SuperFan',
      tier: '1000',
      is_gift: true,
    };
    const r2 = await executeSubscriptionAlert(giftSubDirect, 'channel.subscribe', { sendChatFn: mockSendChat });
    assert.strictEqual(r2, null);
    assert.strictEqual(sent.length, 1);

    // 3. Resubscription message
    const resubEvent = {
      broadcaster_user_id: 'alert_chan_sub',
      user_name: 'LoyalSub',
      tier: '2000',
      cumulative_months: 6,
      streak_months: 6,
      message: { text: 'Love the stream!' },
    };
    const r3 = await executeSubscriptionAlert(resubEvent, 'channel.subscription.message', { sendChatFn: mockSendChat });
    assert.ok(r3);
    assert.strictEqual(sent[1].message, 'Welcome back @LoyalSub for 6 months at Tier 2! 6 month streak! "Love the stream!"');

    // 4. Single gift sub
    const singleGiftEvent = {
      broadcaster_user_id: 'alert_chan_sub',
      user_name: 'NiceGifter',
      tier: '1000',
      total: 1,
      recipient_user_name: 'LuckyFriend',
      is_anonymous: false,
    };
    const r4 = await executeSubscriptionAlert(singleGiftEvent, 'channel.subscription.gift', { sendChatFn: mockSendChat });
    assert.ok(r4);
    assert.strictEqual(sent[2].message, 'Thank you @NiceGifter for gifting a Tier 1 sub to @LuckyFriend!');

    // 5. Community sub bomb (e.g. 10 subs)
    const communityGiftEvent = {
      broadcaster_user_id: 'alert_chan_sub',
      user_name: 'HypeTrainDriver',
      tier: '1000',
      total: 10,
      is_anonymous: false,
    };
    const r5 = await executeSubscriptionAlert(communityGiftEvent, 'channel.subscription.gift', { sendChatFn: mockSendChat });
    assert.ok(r5);
    assert.strictEqual(sent[3].message, 'WOW! @HypeTrainDriver gifted 10 subs at Tier 1!');

    // 6. Sub alerts disabled
    updateStreamAlertSettings('alert_chan_sub', { subEnabled: false });
    const r6 = await executeSubscriptionAlert(newSubEvent, 'channel.subscribe', { sendChatFn: mockSendChat });
    assert.strictEqual(r6, null);
  });

  await t.test('executeTestAlert', async () => {
    upsertChannel({
      id: 'alert_chan_test',
      login: 'testchan',
      displayName: 'TestChan',
      joined: true,
    });

    const sent = [];
    const mockSendChat = async (payload) => {
      sent.push(payload);
    };

    const types = ['follow', 'sub', 'resub', 'gift', 'community_gift'];
    for (const t of types) {
      const res = await executeTestAlert('alert_chan_test', t, { sendChatFn: mockSendChat });
      assert.ok(res.success);
      assert.ok(res.message.startsWith('[TEST]'));
    }

    assert.strictEqual(sent.length, 5);
  });
});
