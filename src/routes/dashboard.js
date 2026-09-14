import { Router } from 'express';
import {
  getSession,
  getChannel,
  getChannelByLogin,
  upsertChannel,
  getAccessibleChannels,
  canManageChannel,
} from '../db/index.js';
import { renderDashboardView } from '../ui/dashboardView.js';

export const dashboardRouter = Router();

function requireAuth(req, res, next) {
  const sessionToken = req.cookies?.session_token;
  const session = getSession(sessionToken);

  if (!session) {
    return res.redirect('/auth/login');
  }

  req.user = session;
  next();
}

dashboardRouter.get('/', requireAuth, (req, res) => {
  const user = req.user;

  // 1. Ensure user's own channel record exists
  let ownChannel = getChannel(user.userId);
  if (!ownChannel) {
    ownChannel = upsertChannel({
      id: user.userId,
      login: user.login,
      displayName: user.displayName,
      avatar: user.avatar,
    });
  }

  // 2. Fetch all channels accessible to this user (own + managed)
  const accessibleChannels = getAccessibleChannels(user);

  // If ?channel= is passed in URL query, sanitize and redirect cleanly to strip it from address bar
  const requestedChannel = req.query.channel ? String(req.query.channel).trim() : null;
  if (requestedChannel) {
    const target = getChannel(requestedChannel) || getChannelByLogin(requestedChannel);
    if (target && canManageChannel(user, target.id)) {
      res.cookie('active_channel_id', target.id, {
        httpOnly: true,
        signed: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    } else {
      res.clearCookie('active_channel_id', { path: '/' });
      res.setFlash('error', `You do not have permission to manage channel #${requestedChannel}.`);
    }

    return res.redirect('/dashboard');
  }

  // Clean URL enforcement: If ?tab= query parameter is present, persist to cookie and redirect to clean /dashboard
  if (req.query.tab) {
    const tabParam = String(req.query.tab).trim();
    if (tabParam) {
      res.cookie('active_dashboard_tab', tabParam, { sameSite: 'lax', path: '/' });
    }
    return res.redirect('/dashboard');
  }

  // 3. Determine active target channel from signed or fallback cookie
  let activeChannel = null;
  const cookieChannelId = req.signedCookies?.active_channel_id || req.cookies?.active_channel_id;
  if (cookieChannelId) {
    const cookieTarget = getChannel(cookieChannelId);
    if (cookieTarget && canManageChannel(user, cookieTarget.id)) {
      activeChannel = cookieTarget;
    } else {
      res.clearCookie('active_channel_id', { path: '/' });
    }
  }

  // Default strictly to user's own channel if unauthorized or unset
  if (!activeChannel) {
    activeChannel = ownChannel;
  }

  const isOwner = String(activeChannel.id) === String(user.userId);
  const role = isOwner ? 'owner' : 'manager';

  const success = req.flash?.success;
  const error = req.flash?.error;
  const activeTab = req.cookies?.active_dashboard_tab || 'commands';

  const html = renderDashboardView({
    channel: activeChannel,
    user,
    accessibleChannels,
    role,
    isOwner,
    success,
    error,
    activeTab,
  });

  res.send(html);
});
