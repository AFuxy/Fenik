import { Router } from 'express';
import { getBotAccount, unlinkBotAccount, getAllChannels, getChannel, getSession } from '../db/index.js';
import { renderAdminView } from '../ui/adminView.js';
import { renderErrorView } from '../ui/errorView.js';
import { config, isAdmin } from '../config.js';
import { validateUserToken, checkBotModeratorStatus, getChannelBroadcastInfo } from '../services/twitchApi.js';
import { REQUIRED_STREAMER_SCOPES, createAdminAuthKey } from './auth.js';
import { deleteChannelAccount } from '../services/accountService.js';
import { getStreamStatus } from '../services/streamService.js';
import { updateStreamSettings } from '../db/streamRepo.js';
import { stopEventSub } from '../services/eventSub.js';

export const adminRouter = Router();

function requireAdmin(req, res, next) {
  const sessionToken = req.cookies?.session_token;
  const session = getSession(sessionToken);

  if (!session) {
    res.setFlash('error', 'Administrator login required');
    return res.redirect('/');
  }

  if (!isAdmin(session)) {
    return res.status(403).send(
      renderErrorView({
        statusCode: 403,
        title: 'Access Denied',
        message: 'You do not have permission to access Host Control. This section is restricted to authorized platform administrators.',
        backUrl: '/dashboard',
        backLabel: 'Return to Dashboard',
        user: session,
      })
    );
  }

  req.user = session;
  next();
}

// 1. Host Control Overview & Channel Roster
adminRouter.get('/', requireAdmin, async (req, res) => {
  const bot = getBotAccount();
  const channels = getAllChannels();
  const success = req.flash?.success;
  const error = req.flash?.error;

  // Validate central bot token scopes
  let botTokenInfo = { valid: false, scopes: [] };
  if (bot && bot.accessToken) {
    try {
      botTokenInfo = await validateUserToken(bot.accessToken);
    } catch (_) {}
  }

  // Enrich each channel with real-time Getting Started checklist & permissions
  const enrichedChannels = await Promise.all(
    channels.map(async (ch) => {
      let tokenInfo = { valid: false, scopes: [] };
      if (ch.accessToken) {
        try {
          tokenInfo = await validateUserToken(ch.accessToken);
        } catch (_) {}
      }

      const grantedScopes = new Set(tokenInfo.scopes || []);
      const missingScopes = REQUIRED_STREAMER_SCOPES.filter((s) => s.required && !grantedScopes.has(s.id));
      const allScopesGranted = missingScopes.length === 0;

      let isBotMod = null;
      if (bot && bot.userId && ch.accessToken) {
        try {
          isBotMod = await checkBotModeratorStatus({
            broadcasterId: ch.id,
            botUserId: bot.userId,
            userToken: ch.accessToken,
          });
        } catch (_) {}
      }

      let completedTasks = 0;
      if (bot && bot.userId) completedTasks++;
      if (allScopesGranted) completedTasks++;
      if (isBotMod === true) completedTasks++;
      if (ch.joined) completedTasks++;

      const isFullySetup = completedTasks === 4;
      const percentReady = Math.round((completedTasks / 4) * 100);

      return {
        ...ch,
        setupState: {
          tokenInfo,
          grantedScopes: tokenInfo.scopes || [],
          missingScopes,
          allScopesGranted,
          isBotMod,
          completedTasks,
          totalTasks: 4,
          percentReady,
          isFullySetup,
        },
      };
    })
  );

  // Compute platform-wide metrics
  const totalChannels = enrichedChannels.length;
  const joinedCount = enrichedChannels.filter((c) => c.joined).length;
  const fullySetupCount = enrichedChannels.filter((c) => c.setupState?.isFullySetup).length;
  const moddedCount = enrichedChannels.filter((c) => c.setupState?.isBotMod === true).length;
  const totalCommands = enrichedChannels.reduce((acc, c) => acc + (c.commands?.length || 0), 0);
  const totalTimers = enrichedChannels.reduce((acc, c) => acc + (c.timers?.length || 0), 0);

  const stats = {
    totalChannels,
    joinedCount,
    fullySetupCount,
    moddedCount,
    totalCommands,
    totalTimers,
  };

  if (bot && bot.userId && botTokenInfo.scopes?.includes('channel:manage:broadcast')) {
    try {
      const liveInfo = await getChannelBroadcastInfo(bot.userId);
      if (liveInfo && liveInfo.title) {
        updateStreamSettings({
          title: liveInfo.title,
          category: liveInfo.category || undefined,
        });
      }
    } catch (_) {}
  }

  const streamStatus = getStreamStatus();

  const adminAuthKey = createAdminAuthKey();
  const botAuthUrl = `${config.baseUrl}/auth/bot?admin_key=${adminAuthKey}`;

  const html = renderAdminView({
    bot: bot ? { ...bot, tokenInfo: botTokenInfo } : null,
    channels: enrichedChannels,
    stats,
    streamStatus,
    user: req.user,
    adminAuthKey,
    botAuthUrl,
    success,
    error,
  });

  res.send(html);
});

// 2. Disconnect Central Bot Account
adminRouter.post('/bot/unlink', requireAdmin, async (req, res) => {
  try {
    stopEventSub();
    unlinkBotAccount();
    res.setFlash('success', 'Central bot account disconnected. You can now link a new bot account.');
  } catch (err) {
    console.error('[Admin Unlink Bot Error]', err);
    res.setFlash('error', `Failed to disconnect bot: ${err.message}`);
  }
  return res.redirect('/admin');
});

// 3. Permanently Delete Channel Account & Disconnect Bot
adminRouter.post('/channels/delete', requireAdmin, async (req, res) => {
  const channelId = req.body.channelId ? String(req.body.channelId).trim() : null;
  if (!channelId) {
    res.setFlash('error', 'Channel ID is required for deletion.');
    return res.redirect('/admin');
  }

  // Safety guard: Admin cannot delete their own active account
  if (String(channelId) === String(req.user.userId)) {
    res.setFlash('error', 'You cannot delete your own active administrator account.');
    return res.redirect('/admin');
  }

  const channel = getChannel(channelId);
  if (!channel) {
    res.setFlash('error', 'Channel not found or has already been deleted.');
    return res.redirect('/admin');
  }

  try {
    const result = await deleteChannelAccount(channelId);
    if (result.success) {
      if (req.cookies?.active_channel_id === channelId) {
        res.clearCookie('active_channel_id', { path: '/' });
      }
      res.setFlash(
        'success',
        `Channel @${channel.displayName || channel.login} was completely deleted. The bot has disconnected from chat and all user data was purged.`
      );
    } else {
      res.setFlash('error', result.error || 'Failed to delete channel account.');
    }
  } catch (err) {
    console.error('[Admin Delete Channel Error]', err);
    res.setFlash('error', `Error deleting channel: ${err.message}`);
  }

  return res.redirect('/admin');
});
