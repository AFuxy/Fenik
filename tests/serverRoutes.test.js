import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { clearDatabase, cleanupTestDb } from './setup.js';
import { createServer } from '../src/server.js';
import { upsertChannel, createSession, addManager, getRaidSettings, getShoutoutSettings } from '../src/db/index.js';

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
});

