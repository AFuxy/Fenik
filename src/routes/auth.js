import crypto from 'crypto';
import { Router } from 'express';
import { config, isAdmin } from '../config.js';
import {
  setBotAccount,
  getBotAccount,
  upsertChannel,
  createSession,
  destroySession,
  getSession,
} from '../db/index.js';
import { getUser } from '../services/twitchApi.js';
import { startEventSub, stopEventSub, subscribeChannel } from '../services/eventSub.js';

export const authRouter = Router();

/**
 * Generate a signed, time-limited key allowing an admin to authorize the bot
 * from an incognito window or separate browser profile without session cookies.
 */
export function createAdminAuthKey() {
  const expires = Date.now() + 30 * 60 * 1000; // 30 minutes validity
  const data = `bot-auth:${expires}`;
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('hex');
  return `${expires}.${sig}`;
}

/**
 * Verify a signed admin authorization key.
 */
export function verifyAdminAuthKey(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [expiresStr, sig] = parts;
  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) return false;
  const data = `bot-auth:${expires}`;
  const expectedSig = crypto.createHmac('sha256', config.sessionSecret).update(data).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch (_) {
    return false;
  }
}

export const REQUIRED_STREAMER_SCOPES = [
  {
    id: 'channel:bot',
    name: 'Twitch Chatbot Integration',
    desc: 'Allows the bot to join and speak in your stream chat room.',
    required: true,
  },
  {
    id: 'channel:manage:moderators',
    name: 'Moderator Management',
    desc: 'Enables 1-click automatic bot modding and moderator status detection.',
    required: true,
  },
  {
    id: 'moderator:read:followers',
    name: 'Follower Alerts & Verification',
    desc: 'Powers follower chat alerts and follow duration ({followage}) in chat commands.',
    required: true,
  },
  {
    id: 'channel:read:subscriptions',
    name: 'Subscriber Alerts & Events',
    desc: 'Enables real-time chat announcements for new subs, resubs, and gift subs.',
    required: false,
  },
  {
    id: 'channel:read:redemptions',
    name: 'Channel Points & Rewards',
    desc: 'Allows the bot to trigger chat actions and responses on custom reward redemptions.',
    required: false,
  },
];

// Streamer scopes
export const STREAMER_SCOPES = [
  'channel:bot',
  'channel:manage:moderators',
  'moderator:read:followers',
  'channel:read:subscriptions',
  'channel:read:redemptions',
  'user:read:email',
].join(' ');

// Central bot account required scopes with metadata
export const REQUIRED_BOT_SCOPES = [
  { id: 'user:bot', name: 'Twitch Chatbot Identity', desc: 'Registers bot account as an official Twitch chat bot.', required: true },
  { id: 'user:read:chat', name: 'Chat Reading Presence', desc: 'Allows the bot to receive and parse incoming chat messages.', required: true },
  { id: 'user:write:chat', name: 'Chat Response Dispatch', desc: 'Allows the bot to send automated responses and alerts.', required: true },
  { id: 'moderator:read:followers', name: 'Follower EventSub Listening', desc: 'Enables real-time detection of new channel followers.', required: true },
  { id: 'moderator:manage:chat_messages', name: 'Spam & Link Deletion', desc: 'Deletes scam promotions, unauthorized links, and spam messages.', required: true },
  { id: 'moderator:manage:banned_users', name: 'Scam Bot Bans & Timeouts', desc: 'Allows the bot to timeout and permanently ban fake viewbot accounts.', required: true },
  { id: 'channel:read:stream_key', name: 'Stream Key Auto-Detection', desc: 'Enables 1-click automatic RTMP stream key fetching for the 24/7 showcase.', required: false },
  { id: 'channel:manage:broadcast', name: 'Stream Title & Category Automation', desc: 'Allows the bot server to set stream title and category on Twitch.', required: false },
];

// Central bot account scopes
export const BOT_SCOPES = [
  'user:bot',
  'user:read:chat',
  'user:write:chat',
  'moderator:read:followers',
  'moderator:manage:chat_messages',
  'moderator:manage:banned_users',
  'channel:read:stream_key',
  'channel:manage:broadcast',
].join(' ');

// 1. Broadcaster OAuth initiation
authRouter.get('/login', (req, res) => {
  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', STREAMER_SCOPES);
  authUrl.searchParams.set('state', 'streamer');
  authUrl.searchParams.set('force_verify', 'true');
  res.redirect(authUrl.toString());
});

// 2. Central Bot OAuth initiation (host setup)
authRouter.get('/bot', (req, res) => {
  const sessionToken = req.cookies?.session_token;
  const session = getSession(sessionToken);
  const bot = getBotAccount();
  const adminKey = req.query.admin_key || req.query.key;
  const hasValidAdminKey = adminKey ? verifyAdminAuthKey(String(adminKey)) : false;

  // If a central bot account is already linked, only an admin or valid signed key can re-link it
  if (bot && !hasValidAdminKey && (!session || !isAdmin(session))) {
    res.setFlash('error', 'Administrator login required to re-link bot');
    return res.redirect('/admin');
  }

  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', BOT_SCOPES);
  authUrl.searchParams.set('state', hasValidAdminKey ? `bot:${adminKey}` : 'bot');
  authUrl.searchParams.set('force_verify', 'true');
  res.redirect(authUrl.toString());
});

// 3. OAuth Callback handler
authRouter.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const isBotState = state === 'bot' || (typeof state === 'string' && state.startsWith('bot:'));
  const fallbackRedirect = isBotState ? '/admin' : '/';

  if (error) {
    console.error('[OAuth Error from Twitch]', error, error_description);
    res.setFlash('error', error_description || error);
    return res.redirect(fallbackRedirect);
  }

  if (!code || !state) {
    res.setFlash('error', 'Missing OAuth code or state');
    return res.redirect(fallbackRedirect);
  }

  try {
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[OAuth Token Exchange Failed]', tokenRes.status, errText);
      res.setFlash('error', 'Token exchange failed with Twitch: ' + (errText || tokenRes.statusText));
      return res.redirect(fallbackRedirect);
    }

    const tokenData = await tokenRes.json();
    const user = await getUser(tokenData.access_token);
    if (!user) {
      res.setFlash('error', 'Failed to fetch Twitch profile for authenticated account');
      return res.redirect(fallbackRedirect);
    }

    if (isBotState) {
      const stateKey = typeof state === 'string' && state.startsWith('bot:') ? state.slice(4) : null;
      const sessionToken = req.cookies?.session_token;
      const session = getSession(sessionToken);
      const isAuthorized = (session && isAdmin(session)) || (stateKey && verifyAdminAuthKey(stateKey));

      if (!isAuthorized && getBotAccount()) {
        res.setFlash('error', 'Unauthorized bot link attempt');
        return res.redirect('/admin');
      }

      // Central bot account linked
      setBotAccount({
        userId: user.id,
        login: user.login,
        displayName: user.display_name,
        avatar: user.profile_image_url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in || 14400) * 1000,
      });

      console.log(`[Auth] Central bot account connected: @${user.display_name} (${user.id})`);
      stopEventSub();
      startEventSub();
      res.setFlash('success', `Bot account @${user.display_name} linked successfully!`);
      return res.redirect('/admin');
    }

    // Streamer joined
    upsertChannel({
      id: user.id,
      login: user.login,
      displayName: user.display_name,
      avatar: user.profile_image_url,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in || 14400) * 1000,
    });

    // Subscribe channel to active EventSub listener
    await subscribeChannel(user.id);

    // Create session cookie
    const sessionToken = createSession({
      userId: user.id,
      login: user.login,
      displayName: user.display_name,
      avatar: user.profile_image_url,
    });

    res.cookie('session_token', sessionToken, {
      httpOnly: true,
      secure: false, // true in HTTPS prod
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    console.log(`[Auth] Streamer joined: #${user.login} (${user.id})`);
    res.setFlash('success', 'Welcome! Your channel is connected');
    res.redirect('/dashboard');
  } catch (err) {
    console.error('[OAuth Callback Error]', err);
    res.setFlash('error', 'Authentication failed: ' + err.message);
    res.redirect('/');
  }
});

// 4. Logout
authRouter.get('/logout', (req, res) => {
  const sessionToken = req.cookies?.session_token;
  destroySession(sessionToken);
  res.clearCookie('session_token');
  res.clearCookie('active_channel_id', { path: '/' });
  res.setFlash('success', 'You have been signed out');
  res.redirect('/');
});
