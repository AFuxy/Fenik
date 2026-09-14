import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { clearDatabase, cleanupTestDb } from './setup.js';
import { createServer } from '../src/server.js';
import {
  upsertChannel,
  getChannel,
  createSession,
  getSession,
  addManager,
  getRaidSettings,
  getShoutoutSettings,
  setBotAccount,
  getBotAccount,
  unlinkBotAccount,
  getCommandsForChannel,
  getTimers,
  createTimer,
  upsertCommand,
  getModerationSettings,
} from '../src/db/index.js';
import { REQUIRED_STREAMER_SCOPES, createAdminAuthKey, verifyAdminAuthKey } from '../src/routes/auth.js';

describe('Server HTTP Routes & Clean URL Flow', () => {
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
  });

  it('should render custom 404 page with 404 status code', async () => {
    const res = await fetch(`${baseUrl}/this-page-definitely-does-not-exist-xyz`);
    assert.equal(res.status, 404);
    const body = await res.text();
    assert.ok(body.includes('404'));
    assert.ok(body.includes('Page Not Found'));
    // Security check: must NEVER disclose admin usernames or secrets on error pages
    assert.equal(body.includes('afuxy'), false);
    assert.equal(body.includes('adminUsers'), false);
  });

  it('should redirect unauthenticated users from /dashboard to /auth/login', async () => {
    const res = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/auth/login');
  });

  it('should block non-admins from /admin with 403 Forbidden custom error page', async () => {
    // Create a regular non-admin user session
    upsertChannel({ id: '8001', login: 'regularuser', displayName: 'RegularUser' });
    const sessionToken = createSession({
      userId: '8001',
      login: 'regularuser',
      displayName: 'RegularUser',
    });

    const res = await fetch(`${baseUrl}/admin`, {
      headers: { Cookie: `session_token=${sessionToken}` },
      redirect: 'manual',
    });

    assert.equal(res.status, 403);
    const body = await res.text();
    assert.ok(body.includes('403'));
    assert.ok(body.includes('Access Denied'));
  });

  it('should cleanly switch active channel via cookie without query param in destination URL', async () => {
    // Channel owner and managed channel
    upsertChannel({ id: '9001', login: 'mainstreamer', displayName: 'MainStreamer' });
    upsertChannel({ id: '9002', login: 'managedstreamer', displayName: 'ManagedStreamer' });
    addManager('9002', 'mainstreamer');

    const sessionToken = createSession({
      userId: '9001',
      login: 'mainstreamer',
      displayName: 'MainStreamer',
    });

    const switchRes = await fetch(`${baseUrl}/api/channel/switch/managedstreamer`, {
      headers: { Cookie: `session_token=${sessionToken}` },
      redirect: 'manual',
    });

    assert.equal(switchRes.status, 302);
    assert.equal(switchRes.headers.get('location'), '/dashboard'); // Clean redirect without ?channel=

    // Must set active_channel_id cookie (signed)
    const setCookie = switchRes.headers.get('set-cookie');
    assert.ok(setCookie.includes('active_channel_id=s%3A9002') || setCookie.includes('active_channel_id=9002'));
  });

  it('should redirect cleanly to /dashboard and set active_dashboard_tab cookie after toggling built-in command', async () => {
    upsertChannel({ id: '9100', login: 'togglestreamer', displayName: 'ToggleStreamer' });
    const sessionToken = createSession({
      userId: '9100',
      login: 'togglestreamer',
      displayName: 'ToggleStreamer',
    });

    const toggleRes = await fetch(`${baseUrl}/api/commands/builtin/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9100',
        command: 'roll',
        hasEnabledField: '1',
        enabled: 'true',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(toggleRes.status, 302);
    // Verified: clean URL redirect without ?tab=
    assert.equal(toggleRes.headers.get('location'), '/dashboard');
    const setCookie = toggleRes.headers.get('set-cookie');
    assert.ok(setCookie.includes('active_dashboard_tab=builtins'));
  });

  it('should reject forged or unauthorized active_channel_id cookie, clear it, and load own channel', async () => {
    // User A and Victim B
    upsertChannel({ id: '9201', login: 'attackeruser', displayName: 'AttackerUser' });
    upsertChannel({ id: '9202', login: 'victimuser', displayName: 'VictimUser' });

    const sessionToken = createSession({
      userId: '9201',
      login: 'attackeruser',
      displayName: 'AttackerUser',
    });

    // Attacker manually sets active_channel_id to victim's channel ID
    const res = await fetch(`${baseUrl}/dashboard`, {
      headers: {
        Cookie: `session_token=${sessionToken}; active_channel_id=9202`,
      },
    });

    assert.equal(res.status, 200);
    const body = await res.text();

    // MUST render attacker's own channel, NOT victim's channel
    assert.ok(body.includes('AttackerUser'));
    assert.equal(body.includes('VictimUser'), false);

    // MUST clear the unauthorized active_channel_id cookie
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie.includes('active_channel_id=;'));
  });

  it('should reject unauthorized mutations when spoofed channelId is passed in POST request', async () => {
    upsertChannel({ id: '9301', login: 'regularstreamer', displayName: 'RegularStreamer' });
    upsertChannel({ id: '9302', login: 'victimstreamer', displayName: 'VictimStreamer', prefix: '!' });

    const sessionToken = createSession({
      userId: '9301',
      login: 'regularstreamer',
      displayName: 'RegularStreamer',
    });

    // Attacker sends POST trying to change prefix of victimstreamer
    const res = await fetch(`${baseUrl}/api/channel/prefix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9302',
        prefix: '$$$',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');

    // Verify victim's channel prefix was NOT changed in database
    const { getChannel } = await import('../src/db/index.js');
    const victim = getChannel('9302');
    assert.equal(victim.prefix, '!'); // Unchanged!
  });

  it('should create, render, toggle, and delete timers via HTTP API and stay on tab=timers', async () => {
    const { getTimers } = await import('../src/db/index.js');

    upsertChannel({ id: '9401', login: 'timerstreamer', displayName: 'TimerStreamer' });
    const sessionToken = createSession({
      userId: '9401',
      login: 'timerstreamer',
      displayName: 'TimerStreamer',
    });

    // 1. Create Timer
    const createRes = await fetch(`${baseUrl}/api/timers/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9401',
        name: 'Discord Invite',
        message: 'Join {channel}\'s Discord community: https://discord.gg/stream',
        intervalMinutes: '20',
        minChatLines: '5',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(createRes.status, 302);
    assert.equal(createRes.headers.get('location'), '/dashboard');
    assert.ok(createRes.headers.get('set-cookie')?.includes('active_dashboard_tab=timers'));

    const timers = getTimers('9401');
    assert.equal(timers.length, 1);
    assert.equal(timers[0].name, 'Discord Invite');
    assert.equal(timers[0].intervalMinutes, 20);
    assert.equal(timers[0].minChatLines, 5);
    assert.equal(timers[0].enabled, true);

    const timerId = timers[0].id;

    // 2. View dashboard with active_dashboard_tab=timers cookie
    const viewRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}; active_dashboard_tab=timers` },
    });
    assert.equal(viewRes.status, 200);
    const viewHtml = await viewRes.text();
    assert.ok(viewHtml.includes('Discord Invite'));
    assert.ok(viewHtml.includes('Every 20m'));
    assert.ok(viewHtml.includes('tab-timers'));

    // 3. Toggle Timer
    const toggleRes = await fetch(`${baseUrl}/api/timers/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9401',
        timerId,
        hasEnabledField: '1',
        enabled: 'false',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(toggleRes.status, 302);
    assert.equal(toggleRes.headers.get('location'), '/dashboard');
    assert.ok(toggleRes.headers.get('set-cookie')?.includes('active_dashboard_tab=timers'));

    const timersAfterToggle = getTimers('9401');
    assert.equal(timersAfterToggle[0].enabled, false);

    // 4. Delete Timer
    const deleteRes = await fetch(`${baseUrl}/api/timers/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9401',
        timerId,
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(deleteRes.status, 302);
    assert.equal(deleteRes.headers.get('location'), '/dashboard');
    assert.ok(deleteRes.headers.get('set-cookie')?.includes('active_dashboard_tab=timers'));
    assert.equal(getTimers('9401').length, 0);
  });

  it('should reject unauthorized timer creation by stranger or attacker', async () => {
    const { getTimers } = await import('../src/db/index.js');

    upsertChannel({ id: '9501', login: 'attacker9501', displayName: 'Attacker9501' });
    upsertChannel({ id: '9502', login: 'victim9502', displayName: 'Victim9502' });

    const sessionToken = createSession({
      userId: '9501',
      login: 'attacker9501',
      displayName: 'Attacker9501',
    });

    const res = await fetch(`${baseUrl}/api/timers/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9502',
        name: 'Malicious Timer',
        message: 'Visit spam site!',
        intervalMinutes: '5',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');

    // Victim channel has 0 timers
    assert.equal(getTimers('9502').length, 0);
  });

  it('should save raid settings via POST /api/raid/settings and redirect cleanly to /dashboard with active_dashboard_tab=raids cookie', async () => {
    upsertChannel({ id: '9601', login: 'raidbroadcaster', displayName: 'RaidBroadcaster' });
    const sessionToken = createSession({
      userId: '9601',
      login: 'raidbroadcaster',
      displayName: 'RaidBroadcaster',
    });

    const res = await fetch(`${baseUrl}/api/raid/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9601',
        minViewers: '5',
        cooldownMinutes: '15',
        message: 'Welcome raiders from {raider}! They were playing {game}. Check out {url}!',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
    assert.ok(res.headers.get('set-cookie')?.includes('active_dashboard_tab=raids'));

    const updated = getRaidSettings('9601');
    assert.equal(updated.minViewers, 5);
    assert.equal(updated.cooldownMinutes, 15);
    assert.equal(updated.message, 'Welcome raiders from {raider}! They were playing {game}. Check out {url}!');

    // Verify GET /dashboard with active_dashboard_tab=raids renders properly
    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}; active_dashboard_tab=raids` },
    });
    assert.equal(dashRes.status, 200);
    const body = await dashRes.text();
    assert.ok(body.includes('Incoming Raid Welcomes'));
    assert.ok(body.includes('Welcome raiders from {raider}!'));
    assert.ok(body.includes('insertRaidTag'));
  });

  it('should reject unauthorized raid settings update for a channel the user does not own or manage', async () => {
    upsertChannel({ id: '9701', login: 'attacker9701', displayName: 'Attacker9701' });
    upsertChannel({ id: '9702', login: 'victim9702', displayName: 'Victim9702' });

    const sessionToken = createSession({
      userId: '9701',
      login: 'attacker9701',
      displayName: 'Attacker9701',
    });

    const res = await fetch(`${baseUrl}/api/raid/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9702',
        minViewers: '999',
        cooldownMinutes: '99',
        message: 'Hacked message',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');

    const victimSettings = getRaidSettings('9702');
    assert.notEqual(victimSettings.message, 'Hacked message');
  });

  it('should trigger test raid alert via POST /api/raid/test and redirect cleanly to /dashboard', async () => {
    upsertChannel({ id: '9801', login: 'testbroadcaster', displayName: 'TestBroadcaster' });
    const sessionToken = createSession({
      userId: '9801',
      login: 'testbroadcaster',
      displayName: 'TestBroadcaster',
    });

    const res = await fetch(`${baseUrl}/api/raid/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9801',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
    assert.ok(res.headers.get('set-cookie')?.includes('active_dashboard_tab=raids'));
  });

  it('should save shoutout settings via POST /api/shoutout/settings and render in /dashboard', async () => {
    upsertChannel({ id: '9850', login: 'sobroadcaster', displayName: 'SOBroadcaster' });
    const sessionToken = createSession({
      userId: '9850',
      login: 'sobroadcaster',
      displayName: 'SOBroadcaster',
    });

    const res = await fetch(`${baseUrl}/api/shoutout/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9850',
        message: 'Please follow {target}! Last playing {game} at {url}!',
        autoOnRaid: 'true',
        sendTwitchShoutout: 'true',
        userlevel: 'everyone',
        cooldownSeconds: '20',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
    assert.ok(res.headers.get('set-cookie')?.includes('active_dashboard_tab=shoutouts'));

    const settings = getShoutoutSettings('9850');
    assert.equal(settings.message, 'Please follow {target}! Last playing {game} at {url}!');
    assert.equal(settings.autoOnRaid, true);
    assert.equal(settings.sendTwitchShoutout, true);
    assert.equal(settings.userlevel, 'everyone');
    assert.equal(settings.cooldownSeconds, 20);

    // Verify GET /dashboard with active_dashboard_tab=shoutouts renders properly
    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}; active_dashboard_tab=shoutouts` },
    });
    assert.equal(dashRes.status, 200);
    const body = await dashRes.text();
    assert.ok(body.includes('Streamer Shoutouts &amp; !so Command'));
    assert.ok(body.includes('Please follow {target}!'));
    assert.ok(body.includes('insertShoutoutTag'));
  });

  it('should trigger test shoutout alert via POST /api/shoutout/test and redirect cleanly to /dashboard', async () => {
    upsertChannel({ id: '9860', login: 'testsochannel', displayName: 'TestSOChannel' });
    const sessionToken = createSession({
      userId: '9860',
      login: 'testsochannel',
      displayName: 'TestSOChannel',
    });

    const res = await fetch(`${baseUrl}/api/shoutout/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9860',
        target: 'CoolGamer',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
    assert.ok(res.headers.get('set-cookie')?.includes('active_dashboard_tab=shoutouts'));
  });

  it('should strip ?tab= query parameter from URL, persist to cookie, and redirect to clean /dashboard', async () => {
    upsertChannel({ id: '9870', login: 'querystripstreamer', displayName: 'QueryStripStreamer' });
    const sessionToken = createSession({
      userId: '9870',
      login: 'querystripstreamer',
      displayName: 'QueryStripStreamer',
    });

    const res = await fetch(`${baseUrl}/dashboard?tab=timers`, {
      headers: { Cookie: `session_token=${sessionToken}` },
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
    assert.ok(res.headers.get('set-cookie')?.includes('active_dashboard_tab=timers'));
  });

  it('should serve branded favicon at /favicon.ico and /favicon.svg with 200 OK and image/svg+xml', async () => {
    const icoRes = await fetch(`${baseUrl}/favicon.ico`);
    assert.equal(icoRes.status, 200);
    assert.equal(icoRes.headers.get('content-type'), 'image/svg+xml');
    const icoBody = await icoRes.text();
    assert.ok(icoBody.includes('<svg'));

    const svgRes = await fetch(`${baseUrl}/favicon.svg`);
    assert.equal(svgRes.status, 200);
    assert.equal(svgRes.headers.get('content-type'), 'image/svg+xml');
    const svgBody = await svgRes.text();
    assert.ok(svgBody.includes('<svg'));
  });

  it('should render favicon link tags in layout and mobile navigation bar on dashboard', async () => {
    upsertChannel({ id: '9880', login: 'layoutteststreamer', displayName: 'LayoutTestStreamer' });
    const sessionToken = createSession({
      userId: '9880',
      login: 'layoutteststreamer',
      displayName: 'LayoutTestStreamer',
    });

    const res = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'));
    assert.ok(html.includes('<link rel="alternate icon" href="/favicon.ico">'));
    assert.ok(html.includes('ks-sidebar-mobile-bar'));
    assert.ok(html.includes('ksSidebarMobileToggle'));
    assert.ok(html.includes('fuxy_dashboard_scroll'));

    // Assert all rendered inline <script> tags parse with 100% valid JavaScript syntax
    const scriptRegex = /<script>([\s\S]*?)<\/script>/gi;
    let match;
    let scriptCount = 0;
    while ((match = scriptRegex.exec(html)) !== null) {
      scriptCount++;
      assert.doesNotThrow(() => new vm.Script(match[1]), `Inline script ${scriptCount} has invalid syntax`);
    }
    assert.ok(scriptCount > 0);
  });

  it('should deliver mobile-optimized viewport, overflow containment, and responsive styling', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('viewport-fit=cover'));
    assert.ok(html.includes('overflow-x: hidden'));
    assert.ok(html.includes('@media (max-width: 768px)'));
    assert.ok(html.includes('@media (max-width: 640px)'));
  });

  it('should serve branded default avatar at /default-avatar.svg and render fallback in dashboard', async () => {
    const svgRes = await fetch(`${baseUrl}/default-avatar.svg`);
    assert.equal(svgRes.status, 200);
    assert.equal(svgRes.headers.get('content-type'), 'image/svg+xml');
    const svgText = await svgRes.text();
    assert.ok(svgText.includes('<svg'));
    assert.ok(svgText.includes('viewBox="0 0 100 100"'));

    const altRes = await fetch(`${baseUrl}/avatar-placeholder.svg`);
    assert.equal(altRes.status, 200);
    assert.equal(altRes.headers.get('content-type'), 'image/svg+xml');

    upsertChannel({ id: '9890', login: 'noavatarguy', displayName: 'NoAvatarGuy' });
    const sessionToken = createSession({
      userId: '9890',
      login: 'noavatarguy',
      displayName: 'NoAvatarGuy',
    });

    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });
    assert.equal(dashRes.status, 200);
    const dashHtml = await dashRes.text();
    assert.ok(dashHtml.includes('/default-avatar.svg'));
    assert.ok(dashHtml.includes("onerror=\"this.onerror=null;this.src='/default-avatar.svg'\""));
    assert.ok(!dashHtml.includes('user-default-pictures-uv/75305d54-c7cc-40d1-bb60-aa1f2d1594b1'));
  });

  it('should add manager and render manager profile with avatar in dashboard', async () => {
    upsertChannel({ 
      id: '9910', 
      login: 'broadcasterowner', 
      displayName: 'BroadcasterOwner',
      avatar: 'https://cdn.example.com/broadcaster.png',
    });
    upsertChannel({ 
      id: '9911', 
      login: 'awesomehelper', 
      displayName: 'AwesomeHelper',
      avatar: 'https://cdn.example.com/helper.png',
    });

    const sessionToken = createSession({
      userId: '9910',
      login: 'broadcasterowner',
      displayName: 'BroadcasterOwner',
    });

    const addRes = await fetch(`${baseUrl}/api/managers/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '9910',
        username: 'awesomehelper',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(addRes.status, 302);
    assert.equal(addRes.headers.get('location'), '/dashboard');

    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });
    assert.equal(dashRes.status, 200);
    const dashHtml = await dashRes.text();
    assert.ok(dashHtml.includes('AwesomeHelper'));
    assert.ok(dashHtml.includes('twitch.tv/awesomehelper'));
    assert.ok(
      dashHtml.includes('profile_image-300x300.png') ||
      dashHtml.includes('https://cdn.example.com/helper.png') ||
      dashHtml.includes('ks-channel-avatar')
    );
  });

  it('should render interactive dynamic variable pills ({uptime}, {game}, {title}, {followage}) in dashboard', async () => {
    const sessionToken = createSession({
      userId: '9910',
      login: 'broadcasterowner',
      displayName: 'BroadcasterOwner',
    });

    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });
    assert.equal(dashRes.status, 200);
    const html = await dashRes.text();

    assert.ok(html.includes('data-insert="{uptime}"'));
    assert.ok(html.includes('data-insert="{game}"'));
    assert.ok(html.includes('data-insert="{title}"'));
    assert.ok(html.includes('data-insert="{followage}"'));
    assert.ok(html.includes('ks-var-pill'));
  });

  it('should default to overview (Getting Started) tab on /dashboard with setup checklist and scope verification', async () => {
    upsertChannel({
      id: '9920',
      login: 'newstreamer',
      displayName: 'NewStreamer',
      accessToken: 'test_token',
    });
    const sessionToken = createSession({
      userId: '9920',
      login: 'newstreamer',
      displayName: 'NewStreamer',
    });

    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });
    assert.equal(dashRes.status, 200);
    const html = await dashRes.text();

    // Default tab active is tab-overview
    assert.ok(html.includes('id="tab-overview" class="ks-tab-content active"'));
    assert.ok(html.includes('Getting Started with'));
    assert.ok(html.includes('Platform Readiness'));
    assert.ok(html.includes('1. Twitch Permissions'));
    assert.ok(html.includes('2. Channel Moderator'));
    assert.ok(html.includes('3. Chat Presence'));
    assert.ok(html.includes('4. Send Test Message'));
    assert.ok(html.includes('Essential Stream Commands to Try'));
    assert.ok(html.includes('copy-mod-btn'));
  });

  it('should mod bot automatically via POST /api/setup/mod-bot and redirect to /dashboard', async () => {
    setBotAccount({
      userId: '8888',
      login: 'testfuxybot',
      displayName: 'TestFuxyBot',
      accessToken: 'bot_access_token',
      refreshToken: 'bot_refresh_token',
    });

    upsertChannel({
      id: '9930',
      login: 'modstreamer',
      displayName: 'ModStreamer',
      accessToken: 'streamer_access_token',
    });

    const sessionToken = createSession({
      userId: '9930',
      login: 'modstreamer',
      displayName: 'ModStreamer',
    });

    const originalFetch = globalThis.fetch;
    let helixCalled = false;
    globalThis.fetch = async (url, opts) => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.includes('/helix/moderation/moderators')) {
        helixCalled = true;
        return new Response(null, { status: 204 });
      }
      return originalFetch(url, opts);
    };

    try {
      const res = await fetch(`${baseUrl}/api/setup/mod-bot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `session_token=${sessionToken}`,
        },
        body: new URLSearchParams({ channelId: '9930' }).toString(),
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/dashboard');
      assert.ok(res.headers.get('set-cookie')?.includes('active_dashboard_tab=overview'));
      assert.equal(helixCalled, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should reject unauthorized POST /api/setup/mod-bot from non-broadcaster', async () => {
    upsertChannel({ id: '9940', login: 'ownerbroadcaster', displayName: 'OwnerBroadcaster' });
    upsertChannel({ id: '9941', login: 'randomguest', displayName: 'RandomGuest' });

    const sessionToken = createSession({
      userId: '9941',
      login: 'randomguest',
      displayName: 'RandomGuest',
    });

    const res = await fetch(`${baseUrl}/api/setup/mod-bot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({ channelId: '9940' }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
  });

  it('should verify REQUIRED_STREAMER_SCOPES contains moderator, follower, subscriber, and redemption scopes', () => {
    const scopeIds = REQUIRED_STREAMER_SCOPES.map((s) => s.id);
    assert.ok(scopeIds.includes('channel:manage:moderators'));
    assert.ok(scopeIds.includes('moderator:read:followers'));
    assert.ok(scopeIds.includes('channel:bot'));
    assert.ok(scopeIds.includes('channel:read:subscriptions'));
    assert.ok(scopeIds.includes('channel:read:redemptions'));
  });

  it('should render enhanced Host Control /admin page with metrics, setup checklist badges, and delete buttons', async () => {
    upsertChannel({ id: '1001', login: 'afuxy', displayName: 'Afuxy' });
    const adminSessionToken = createSession({
      userId: '1001',
      login: 'afuxy',
      displayName: 'Afuxy',
    });

    upsertChannel({
      id: '9950',
      login: 'streamertarget',
      displayName: 'StreamerTarget',
      joined: 1,
    });

    const res = await fetch(`${baseUrl}/admin`, {
      headers: { Cookie: `session_token=${adminSessionToken}` },
    });
    assert.equal(res.status, 200);
    const html = await res.text();

    assert.ok(html.includes('Host Control Center'));
    assert.ok(html.includes('Authorized Channels'));
    assert.ok(html.includes('Chat Presence'));
    assert.ok(html.includes('Setups Complete'));
    assert.ok(html.includes('Central Bot Worker Account'));
    assert.ok(html.includes('Connected Streamers Roster'));
    assert.ok(html.includes('StreamerTarget'));
    assert.ok(html.includes('In Chat'));
    assert.ok(html.includes('open-delete-modal-btn'));
    assert.ok(html.includes('Permanently Delete Account'));
  });

  it('should delete channel account via POST /admin/channels/delete, purge database records, and destroy sessions', async () => {
    upsertChannel({ id: '1001', login: 'afuxy', displayName: 'Afuxy' });
    const adminSessionToken = createSession({
      userId: '1001',
      login: 'afuxy',
      displayName: 'Afuxy',
    });

    upsertChannel({
      id: '9955',
      login: 'deleteme',
      displayName: 'DeleteMe',
      joined: 1,
    });
    const userSessionToken = createSession({
      userId: '9955',
      login: 'deleteme',
      displayName: 'DeleteMe',
    });

    createTimer('9955', {
      name: 'Custom Timer',
      message: 'Hello chat',
      intervalMinutes: 10,
      minChatLines: 2,
    });

    assert.ok(getChannel('9955'));
    assert.ok(getSession(userSessionToken));
    assert.equal(getTimers('9955').length, 1);

    const deleteRes = await fetch(`${baseUrl}/admin/channels/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${adminSessionToken}`,
      },
      body: new URLSearchParams({ channelId: '9955' }).toString(),
      redirect: 'manual',
    });

    assert.equal(deleteRes.status, 302);
    assert.equal(deleteRes.headers.get('location'), '/admin');

    // Verify completely deleted from database
    assert.equal(getChannel('9955'), null);
    // Verify sessions destroyed
    assert.equal(getSession(userSessionToken), null);
    // Verify child timers and commands purged
    assert.equal(getTimers('9955').length, 0);
    assert.equal(getCommandsForChannel('9955').length, 0);
  });

  it('should prevent administrator from deleting their own active account via POST /admin/channels/delete', async () => {
    upsertChannel({ id: '1001', login: 'afuxy', displayName: 'Afuxy' });
    const adminSessionToken = createSession({
      userId: '1001',
      login: 'afuxy',
      displayName: 'Afuxy',
    });

    const deleteRes = await fetch(`${baseUrl}/admin/channels/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${adminSessionToken}`,
      },
      body: new URLSearchParams({ channelId: '1001' }).toString(),
      redirect: 'manual',
    });

    assert.equal(deleteRes.status, 302);
    assert.equal(deleteRes.headers.get('location'), '/admin');

    // Admin must NOT be deleted
    assert.ok(getChannel('1001'));
  });

  it('should reject non-admin POST /admin/channels/delete with 403', async () => {
    upsertChannel({ id: '8880', login: 'regularuser', displayName: 'RegularUser' });
    const userSessionToken = createSession({
      userId: '8880',
      login: 'regularuser',
      displayName: 'RegularUser',
    });

    upsertChannel({ id: '8881', login: 'victimchannel', displayName: 'VictimChannel' });

    const deleteRes = await fetch(`${baseUrl}/admin/channels/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${userSessionToken}`,
      },
      body: new URLSearchParams({ channelId: '8881' }).toString(),
      redirect: 'manual',
    });

    assert.equal(deleteRes.status, 403);
    assert.ok(getChannel('8881')); // Victim must still exist!
  });

  it('should render Stream Alerts and Channel Points navigation and tabs on /dashboard', async () => {
    upsertChannel({
      id: '7720',
      login: 'streamerevents',
      displayName: 'StreamerEvents',
    });
    const sessionToken = createSession({
      userId: '7720',
      login: 'streamerevents',
      displayName: 'StreamerEvents',
    });

    const res = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });
    assert.equal(res.status, 200);
    const html = await res.text();

    // Verify navigation sidebar
    assert.ok(html.includes('Events &amp; Rewards') || html.includes('Events & Rewards'));
    assert.ok(html.includes('data-tab="alerts"'));
    assert.ok(html.includes('data-tab="rewards"'));
    assert.ok(html.includes('Stream Alerts'));
    assert.ok(html.includes('Channel Points'));

    // Verify tab contents
    assert.ok(html.includes('id="tab-alerts"'));
    assert.ok(html.includes('id="tab-rewards"'));
    assert.ok(html.includes('Follower Chat Alerts'));
    assert.ok(html.includes('Subscriber &amp; Gift Chat Alerts') || html.includes('Subscriber & Gift Chat Alerts'));
    assert.ok(html.includes('Channel Point Reward Triggers'));
  });

  it('should save stream alert settings via POST /api/alerts/settings and redirect to /dashboard', async () => {
    upsertChannel({ id: '7721', login: 'alertssavechan', displayName: 'AlertsSaveChan' });
    const sessionToken = createSession({
      userId: '7721',
      login: 'alertssavechan',
      displayName: 'AlertsSaveChan',
    });

    const res = await fetch(`${baseUrl}/api/alerts/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '7721',
        followEnabled: 'on',
        followMessage: 'Awesome follow @{user}! Welcome to {channel}!',
        subEnabled: 'on',
        subMessage: 'Hype sub @{user} at {tier}!',
        resubMessage: 'Great to see @{user} back for {months} months!',
        giftSubMessage: 'Huge thanks to @{user} for gifting {tier} to @{recipient}!',
        communityGiftMessage: 'MONSTER {count} subs bomb from @{user}!',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');

    const updated = getChannel('7721');
    assert.equal(updated.streamAlerts.followEnabled, true);
    assert.equal(updated.streamAlerts.followMessage, 'Awesome follow @{user}! Welcome to {channel}!');
    assert.equal(updated.streamAlerts.subMessage, 'Hype sub @{user} at {tier}!');
    assert.equal(updated.streamAlerts.communityGiftMessage, 'MONSTER {count} subs bomb from @{user}!');
  });

  it('should dispatch test stream alert via POST /api/alerts/test and redirect to /dashboard', async () => {
    upsertChannel({ id: '7722', login: 'alertstestchan', displayName: 'AlertsTestChan' });
    const sessionToken = createSession({
      userId: '7722',
      login: 'alertstestchan',
      displayName: 'AlertsTestChan',
    });

    const res = await fetch(`${baseUrl}/api/alerts/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '7722',
        type: 'follow',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), '/dashboard');
  });

  it('should manage channel point triggers (save, toggle, test, delete) via /api/redemptions/*', async () => {
    upsertChannel({ id: '7723', login: 'pointmanagechan', displayName: 'PointManageChan' });
    const sessionToken = createSession({
      userId: '7723',
      login: 'pointmanagechan',
      displayName: 'PointManageChan',
    });

    // 1. Create Trigger
    const createRes = await fetch(`${baseUrl}/api/redemptions/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '7723',
        rewardTitle: 'Hydrate Reminder',
        cooldownSeconds: '15',
        responseMessage: '💧 Time for water @{channel}! Thanks @{user}!',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(createRes.status, 302);
    assert.equal(createRes.headers.get('location'), '/dashboard');

    const ch = getChannel('7723');
    assert.equal(ch.channelPointTriggers.length, 1);
    const trigger = ch.channelPointTriggers[0];
    assert.equal(trigger.rewardTitle, 'Hydrate Reminder');
    assert.equal(trigger.cooldownSeconds, 15);
    assert.equal(trigger.enabled, true);

    // 2. Toggle Trigger
    const toggleRes = await fetch(`${baseUrl}/api/redemptions/toggle`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '7723',
        id: trigger.id,
        enabled: 'false',
      }).toString(),
      redirect: 'manual',
    });
    assert.equal(toggleRes.status, 302);

    const toggledCh = getChannel('7723');
    assert.equal(toggledCh.channelPointTriggers[0].enabled, false);

    // 3. Test Trigger
    const testRes = await fetch(`${baseUrl}/api/redemptions/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '7723',
        id: trigger.id,
      }).toString(),
      redirect: 'manual',
    });
    assert.equal(testRes.status, 302);

    // 4. Delete Trigger
    const deleteRes = await fetch(`${baseUrl}/api/redemptions/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '7723',
        id: trigger.id,
      }).toString(),
      redirect: 'manual',
    });
    assert.equal(deleteRes.status, 302);

    const deletedCh = getChannel('7723');
    assert.equal(deletedCh.channelPointTriggers.length, 0);
  });

  it('should return JSON when test endpoints are invoked with Accept: application/json', async () => {
    upsertChannel({
      id: '8810',
      login: 'jsontestchan',
      displayName: 'JsonTestChan',
    });
    const sessionToken = createSession({
      userId: '8810',
      login: 'jsontestchan',
      displayName: 'JsonTestChan',
    });

    // 1. /api/alerts/test with Accept: application/json
    const alertRes = await fetch(`${baseUrl}/api/alerts/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '8810',
        type: 'follow',
      }).toString(),
    });
    // Status is 400 because central bot is not linked in test mock, but it returns JSON { ok: false, error: ... } instead of redirecting!
    assert.equal(alertRes.status, 400);
    const alertJson = await alertRes.json();
    assert.equal(alertJson.ok, false);
    assert.ok(alertJson.error.includes('Central bot'));

    // 2. /api/send-test with Accept: application/json
    const sendRes = await fetch(`${baseUrl}/api/send-test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '8810',
        message: 'Hello test',
      }).toString(),
    });
    assert.equal(sendRes.status, 400);
    const sendJson = await sendRes.json();
    assert.equal(sendJson.ok, false);
    assert.ok(sendJson.error.includes('Central bot'));

    // 3. /api/shoutout/test with Accept: application/json
    const shoutoutRes = await fetch(`${baseUrl}/api/shoutout/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '8810',
        target: 'speedy',
      }).toString(),
    });
    assert.equal(shoutoutRes.status, 400);
    const shoutoutJson = await shoutoutRes.json();
    assert.equal(shoutoutJson.ok, false);
    assert.ok(shoutoutJson.error.includes('Central bot'));
  });

  it('should render WAI-ARIA tabpanel and modal attributes across dashboard and admin views', async () => {
    upsertChannel({
      id: '8820',
      login: 'ariatestchan',
      displayName: 'AriaTestChan',
    });
    const sessionToken = createSession({
      userId: '8820',
      login: 'ariatestchan',
      displayName: 'AriaTestChan',
    });

    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });
    assert.equal(dashRes.status, 200);
    const dashHtml = await dashRes.text();

    // Verify tabs have role="tablist", role="tab", role="tabpanel"
    assert.ok(dashHtml.includes('role="tablist"'));
    assert.ok(dashHtml.includes('role="tab"'));
    assert.ok(dashHtml.includes('role="tabpanel"'));
    assert.ok(dashHtml.includes('aria-labelledby="tab-btn-overview"'));
    assert.ok(dashHtml.includes('aria-labelledby="tab-btn-alerts"'));
    assert.ok(dashHtml.includes('aria-labelledby="tab-btn-rewards"'));
    assert.ok(dashHtml.includes('aria-labelledby="tab-btn-test"'));

    // Verify admin modal has role="alertdialog" and aria-modal="true"
    const adminSessionToken = createSession({
      userId: '1001',
      login: 'afuxy',
      displayName: 'Afuxy',
    });
    const adminRes = await fetch(`${baseUrl}/admin`, {
      headers: { Cookie: `session_token=${adminSessionToken}` },
    });
    assert.equal(adminRes.status, 200);
    const adminHtml = await adminRes.text();
    assert.ok(adminHtml.includes('role="alertdialog"'));
    assert.ok(adminHtml.includes('aria-modal="true"'));
    assert.ok(adminHtml.includes('aria-labelledby="deleteModalTitle"'));
    assert.ok(adminHtml.includes('aria-describedby="deleteModalDesc"'));
    assert.ok(adminHtml.includes('aria-label="Filter streamers by name, login, or ID"'));
  });

  it('should render flash notifications inside floating ks-toast-container and dismiss toasts on tab switch', async () => {
    upsertChannel({
      id: '8830',
      login: 'toastchan',
      displayName: 'ToastChan',
    });
    const sessionToken = createSession({
      userId: '8830',
      login: 'toastchan',
      displayName: 'ToastChan',
    });

    // Send a flash message via cookie
    const flashCookie = JSON.stringify({ success: 'Channel settings updated cleanly!' });
    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      headers: {
        Cookie: `session_token=${sessionToken}; flash_message=${encodeURIComponent(flashCookie)}`,
      },
    });
    assert.equal(dashRes.status, 200);
    const dashHtml = await dashRes.text();

    // Verify floating toast container is present and holds the notification
    assert.ok(dashHtml.includes('id="ks-toast-container"'));
    assert.ok(dashHtml.includes('class="ks-toast ks-toast-success"'));
    assert.ok(dashHtml.includes('Channel settings updated cleanly!'));
    // Verify it includes dismissal on tab change in script
    assert.ok(dashHtml.includes('dismissAllToasts()'));
  });

  it('should export custom commands via GET /api/commands/export as JSON attachment with aliases', async () => {
    const { upsertCommand } = await import('../src/db/index.js');
    upsertChannel({
      id: '8910',
      login: 'exportstreamer',
      displayName: 'ExportStreamer',
    });
    const sessionToken = createSession({
      userId: '8910',
      login: 'exportstreamer',
      displayName: 'ExportStreamer',
    });

    upsertCommand('8910', {
      trigger: 'discord',
      response: 'Join https://discord.gg/stream',
      userlevel: 'everyone',
      cooldown: 5,
      aliases: 'dc, disc',
      enabled: true,
    });

    const exportRes = await fetch(`${baseUrl}/api/commands/export?channelId=8910`, {
      headers: { Cookie: `session_token=${sessionToken}` },
    });

    assert.equal(exportRes.status, 200);
    assert.ok(exportRes.headers.get('content-type')?.includes('application/json'));
    assert.ok(exportRes.headers.get('content-disposition')?.includes('attachment; filename="commands-exportstreamer-'));

    const data = await exportRes.json();
    assert.equal(data.channel, 'exportstreamer');
    assert.ok(Array.isArray(data.commands));
    assert.ok(data.commands.length >= 1);
    const discordCmd = data.commands.find((c) => c.trigger === 'discord');
    assert.ok(discordCmd, 'Export must include discord command');
    assert.equal(discordCmd.trigger, 'discord');
    assert.equal(discordCmd.aliases, 'dc,disc');
  });

  it('should import custom commands via POST /api/commands/import in merge and replace modes', async () => {
    const { upsertCommand, getCommandsForChannel } = await import('../src/db/index.js');
    upsertChannel({
      id: '8920',
      login: 'importstreamer',
      displayName: 'ImportStreamer',
    });
    const sessionToken = createSession({
      userId: '8920',
      login: 'importstreamer',
      displayName: 'ImportStreamer',
    });

    // Seed with existing command !rules
    upsertCommand('8920', {
      trigger: 'rules',
      response: 'Be nice and respectful',
      userlevel: 'everyone',
      cooldown: 10,
      aliases: '',
      enabled: true,
    });

    // 1. Merge Mode: import updated !discord and new !twitter
    const importDataMerge = {
      commands: [
        { trigger: 'discord', response: 'https://discord.gg/merge', aliases: 'dc' },
        { trigger: 'twitter', response: '@streamer', aliases: 'x' },
      ],
    };

    const mergeRes = await fetch(`${baseUrl}/api/commands/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '8920',
        mode: 'merge',
        commandsJson: JSON.stringify(importDataMerge),
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(mergeRes.status, 302);
    assert.equal(mergeRes.headers.get('location'), '/dashboard');

    const mergedCmds = getCommandsForChannel('8920');
    // Verify rules was preserved
    const rulesCmd = mergedCmds.find((c) => c.trigger === 'rules');
    assert.ok(rulesCmd, 'Existing rules command must be preserved in merge mode');
    // Verify discord was updated
    const discordCmd = mergedCmds.find((c) => c.trigger === 'discord');
    assert.ok(discordCmd);
    assert.equal(discordCmd.response, 'https://discord.gg/merge');
    assert.equal(discordCmd.aliases, 'dc');
    // Verify twitter was added
    const twitterCmd = mergedCmds.find((c) => c.trigger === 'twitter');
    assert.ok(twitterCmd);
    assert.equal(twitterCmd.response, '@streamer');
    assert.equal(twitterCmd.aliases, 'x');

    // 2. Replace Mode: import only !specs
    const importDataReplace = [
      { trigger: 'specs', response: 'CPU: Ryzen 9, GPU: RTX 4090', aliases: 'pc, hardware' },
    ];

    const replaceRes = await fetch(`${baseUrl}/api/commands/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '8920',
        mode: 'replace',
        commandsJson: JSON.stringify(importDataReplace),
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(replaceRes.status, 302);

    const replacedCmds = getCommandsForChannel('8920');
    assert.equal(replacedCmds.length, 1);
    assert.equal(replacedCmds[0].trigger, 'specs');
    assert.equal(replacedCmds[0].aliases, 'pc,hardware');
  });

  it('should save emote limit and repetition spam settings via POST /api/moderation', async () => {
    const { getModerationSettings } = await import('../src/db/index.js');
    upsertChannel({
      id: '8930',
      login: 'modstreamer',
      displayName: 'ModStreamer',
    });
    const sessionToken = createSession({
      userId: '8930',
      login: 'modstreamer',
      displayName: 'ModStreamer',
    });

    const modRes = await fetch(`${baseUrl}/api/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '8930',
        filterLinks: 'on',
        filterCaps: 'on',
        filterEmotes: 'on',
        maxEmotes: '7',
        filterRepetition: 'on',
        maxRepetition: '3',
        bannedWords: 'scam, free followers',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(modRes.status, 302);
    assert.equal(modRes.headers.get('location'), '/dashboard');

    const saved = getModerationSettings('8930');
    assert.equal(saved.filterLinks, true);
    assert.equal(saved.filterCaps, true);
    assert.equal(saved.filterEmotes, true);
    assert.equal(saved.maxEmotes, 7);
    assert.equal(saved.filterRepetition, true);
    assert.equal(saved.maxRepetition, 3);
    assert.deepEqual(saved.bannedWords, ['scam', 'free followers']);
  });

  it('should return recent live activities via GET /api/activity for dashboard feed', async () => {
    const { recordActivity } = await import('../src/services/activityService.js');
    upsertChannel({
      id: '8940',
      login: 'activitystreamer',
      displayName: 'ActivityStreamer',
    });
    const sessionToken = createSession({
      userId: '8940',
      login: 'activitystreamer',
      displayName: 'ActivityStreamer',
    });

    recordActivity('8940', {
      type: 'command',
      title: 'Command !uptime',
      detail: 'Live for 1h 45m',
      actor: 'chatter42',
    });

    const actRes = await fetch(`${baseUrl}/api/activity?channelId=8940&limit=10`, {
      headers: {
        Accept: 'application/json',
        Cookie: `session_token=${sessionToken}`,
      },
    });

    assert.equal(actRes.status, 200);
    const data = await actRes.json();
    assert.equal(data.ok, true);
    assert.equal(data.channel, 'activitystreamer');
    assert.ok(Array.isArray(data.activities));
    assert.equal(data.activities.length, 1);
    assert.equal(data.activities[0].title, 'Command !uptime');
    assert.equal(data.activities[0].type, 'command');
    assert.equal(data.activities[0].actor, 'chatter42');
  });

  it('should save scam bot and gfx bot filter settings with configured action via POST /api/moderation', async () => {
    const { getModerationSettings } = await import('../src/db/index.js');
    upsertChannel({
      id: '8950',
      login: 'scamprotected',
      displayName: 'ScamProtected',
    });
    const sessionToken = createSession({
      userId: '8950',
      login: 'scamprotected',
      displayName: 'ScamProtected',
    });

    const modRes = await fetch(`${baseUrl}/api/moderation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: `session_token=${sessionToken}`,
      },
      body: new URLSearchParams({
        channelId: '8950',
        filterScamBots: 'on',
        scamAction: 'ban',
        filterGfxBots: 'on',
      }).toString(),
      redirect: 'manual',
    });

    assert.equal(modRes.status, 302);
    assert.equal(modRes.headers.get('location'), '/dashboard');

    const saved = getModerationSettings('8950');
    assert.equal(saved.filterScamBots, true);
    assert.equal(saved.scamAction, 'ban');
    assert.equal(saved.filterGfxBots, true);
  });

  describe('Central Bot Authorization & Incognito Linking', () => {
    it('should generate and verify cryptographically signed admin auth keys', () => {
      const key = createAdminAuthKey();
      assert.ok(key);
      assert.equal(typeof key, 'string');
      assert.ok(key.includes('.'));

      assert.equal(verifyAdminAuthKey(key), true);
      assert.equal(verifyAdminAuthKey('invalid.key'), false);
      assert.equal(verifyAdminAuthKey(''), false);
      assert.equal(verifyAdminAuthKey(null), false);

      // Expired key should fail
      const expiredKey = `${Date.now() - 1000}.fakeSignature`;
      assert.equal(verifyAdminAuthKey(expiredKey), false);
    });

    it('should reject unauthenticated GET /auth/bot if a bot is already linked and no admin key is provided', async () => {
      setBotAccount({
        userId: '5551',
        login: 'existingbot',
        displayName: 'ExistingBot',
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const res = await fetch(`${baseUrl}/auth/bot`, {
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/admin');
    });

    it('should allow GET /auth/bot with a valid admin_key query param without requiring a session cookie', async () => {
      setBotAccount({
        userId: '5551',
        login: 'existingbot',
        displayName: 'ExistingBot',
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      const key = createAdminAuthKey();
      const res = await fetch(`${baseUrl}/auth/bot?admin_key=${key}`, {
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      const location = res.headers.get('location');
      assert.ok(location.includes('id.twitch.tv/oauth2/authorize'));
      assert.ok(location.includes(`state=bot%3A${encodeURIComponent(key)}`));
    });

    it('should reject unauthorized POST /admin/bot/unlink from non-admin', async () => {
      const res = await fetch(`${baseUrl}/admin/bot/unlink`, {
        method: 'POST',
        redirect: 'manual',
      });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/');
    });

    it('should allow authorized admin to disconnect bot via POST /admin/bot/unlink', async () => {
      setBotAccount({
        userId: '5551',
        login: 'fenikbot',
        displayName: 'FenikBot',
        accessToken: 'token',
        refreshToken: 'refresh',
      });
      assert.ok(getBotAccount());

      const adminSession = createSession({
        userId: '1',
        login: 'afuxy',
        displayName: 'afuxy',
      });

      const res = await fetch(`${baseUrl}/admin/bot/unlink`, {
        method: 'POST',
        headers: {
          Cookie: `session_token=${adminSession}`,
        },
        redirect: 'manual',
      });

      assert.equal(res.status, 302);
      assert.equal(res.headers.get('location'), '/admin');
      assert.equal(getBotAccount(), null);
    });
  });
});



