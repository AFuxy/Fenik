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

// Streamer scopes
const STREAMER_SCOPES = [
  'channel:bot',
  'channel:read:redemptions',
  'user:read:email',
].join(' ');

// Central bot account scopes
const BOT_SCOPES = [
  'user:bot',
  'user:read:chat',
  'user:write:chat',
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

  // If a central bot account is already linked, only an admin can re-link it
  if (bot && (!session || !isAdmin(session))) {
    res.setFlash('error', 'Administrator login required to re-link bot');
    return res.redirect('/admin');
  }

  const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
  authUrl.searchParams.set('client_id', config.clientId);
  authUrl.searchParams.set('redirect_uri', config.redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', BOT_SCOPES);
  authUrl.searchParams.set('state', 'bot');
  authUrl.searchParams.set('force_verify', 'true');
  res.redirect(authUrl.toString());
});

// 3. OAuth Callback handler
authRouter.get('/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    res.setFlash('error', error_description || error);
    return res.redirect('/');
  }

  if (!code || !state) {
    res.setFlash('error', 'Missing OAuth code or state');
    return res.redirect('/');
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
      res.setFlash('error', 'Token exchange failed with Twitch');
      return res.redirect('/');
    }

    const tokenData = await tokenRes.json();
    const user = await getUser(tokenData.access_token);
    if (!user) {
      res.setFlash('error', 'Failed to fetch Twitch profile');
      return res.redirect('/');
    }

    if (state === 'bot') {
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

      console.log(`[Auth] Central bot account connected: @${user.display_name}`);
      stopEventSub();
      startEventSub();
      res.setFlash('success', 'Bot account linked successfully');
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
