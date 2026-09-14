import { Router } from 'express';
import { config, isAdmin } from '../config.js';
import { deleteChannelAccount } from '../services/accountService.js';
import {
  getSession,
  getChannel,
  getChannelByLogin,
  updateChannel,
  getCommandById,
  getCommandByTrigger,
  updateCommand,
  upsertCommand,
  deleteCommand,
  updateModerationSettings,
  addManager,
  removeManager,
  getBotAccount,
  canManageChannel,
  BUILTIN_COMMANDS,
  setBuiltinDisabled,
  isBuiltinDisabled,
  getTimerById,
  createTimer,
  updateTimer,
  toggleTimer,
  deleteTimer,
  getRaidSettings,
  updateRaidSettings,
  getShoutoutSettings,
  updateShoutoutSettings,
  addAutoShoutout,
  removeAutoShoutout,
  toggleAutoShoutout,
  getStreamAlertSettings,
  updateStreamAlertSettings,
  getChannelPointTriggers,
  getChannelPointTriggerById,
  upsertChannelPointTrigger,
  toggleChannelPointTrigger,
  deleteChannelPointTrigger,
  getCommandsForChannel,
} from '../db/index.js';
import { subscribeChannel } from '../services/eventSub.js';
import { sendChatMessage, getUserByLogin, addChannelModerator } from '../services/twitchApi.js';
import { formatRaidMessage } from '../services/raidService.js';
import { formatShoutoutMessage } from '../services/shoutoutService.js';
import { executeTestAlert } from '../services/alertService.js';
import { executeTestRedemption } from '../services/redemptionService.js';
import { getRecentActivities, recordActivity } from '../services/activityService.js';
import {
  startStream,
  stopStream,
  getStreamStatus,
  saveUploadedMedia,
  getFfmpegInfo,
  recompileVideoLoop,
} from '../services/streamService.js';
import { getStreamSettings, updateStreamSettings } from '../db/streamRepo.js';
import { getBotStreamKey, updateChannelBroadcast, getChannelBroadcastInfo } from '../services/twitchApi.js';

export const apiRouter = Router();

function redirectToTab(res, tabName) {
  if (tabName) {
    res.cookie('active_dashboard_tab', tabName, { sameSite: 'lax', path: '/' });
  }
  return res.redirect('/dashboard');
}

function requireAuth(req, res, next) {
  const sessionToken = req.cookies?.session_token;
  const session = getSession(sessionToken);

  if (!session) {
    return res.redirect('/auth/login');
  }

  req.user = session;
  next();
}

function resolveTargetChannel(req, res) {
  const user = req.user;
  const targetId = req.body.channelId || req.query.channelId || req.signedCookies?.active_channel_id || req.cookies?.active_channel_id || user.userId;

  if (!canManageChannel(user, targetId)) {
    res.clearCookie('active_channel_id', { path: '/' });
    res.setFlash('error', 'You do not have permission to manage this channel.');
    res.redirect('/dashboard');
    return null;
  }

  const channel = getChannel(targetId);
  if (!channel) {
    res.clearCookie('active_channel_id', { path: '/' });
    res.setFlash('error', 'Target channel could not be found.');
    res.redirect('/dashboard');
    return null;
  }

  res.cookie('active_channel_id', channel.id, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return channel;
}

// 0. Switch Active Channel (clean URL, cookie-persisted)
apiRouter.get('/channel/switch/:channel', requireAuth, (req, res) => {
  const user = req.user;
  const targetParam = String(req.params.channel || '').trim();
  const target = getChannel(targetParam) || getChannelByLogin(targetParam);

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
    res.setFlash('error', 'You do not have permission to access that channel.');
  }

  res.redirect('/dashboard');
});

// 1. Toggle Bot Active/Paused in Channel
apiRouter.post(['/channel/toggle', '/channel/join'], requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const joined = req.body.joined === 'true' || req.body.joined === true || req.body.joined === '1' || req.body.joined === 1;
  updateChannel(channel.id, { joined });

  if (joined) {
    await subscribeChannel(channel.id);
  }
  res.setFlash('success', joined ? 'Bot connected to chat.' : 'Bot disconnected from chat.');
  const targetTab = req.cookies?.active_dashboard_tab === 'overview' ? 'overview' : 'commands';
  return redirectToTab(res, targetTab);
});

// 1b. Toggle Built-in Command Active/Disabled
apiRouter.post('/commands/builtin/toggle', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const command = String(req.body.command || '').trim().toLowerCase();
  const validBuiltin = BUILTIN_COMMANDS.find((b) => b.id === command);
  if (!validBuiltin) {
    res.setFlash('error', 'Unknown built-in command.');
    return redirectToTab(res, 'builtins');
  }

  let enabled;
  if (req.body.hasEnabledField) {
    enabled = Boolean(req.body.enabled === 'true' || req.body.enabled === 'on' || req.body.enabled === '1');
  } else {
    enabled = isBuiltinDisabled(channel.id, command);
  }

  setBuiltinDisabled(channel.id, command, !enabled);

  res.setFlash(
    'success',
    `Built-in command "${channel.prefix || '!'}${validBuiltin.trigger}" ${enabled ? 'enabled' : 'disabled'}.`
  );
  return redirectToTab(res, 'builtins');
});

// 2. Create or Update Custom Command
apiRouter.post(['/commands/save', '/commands/create', '/commands/update'], requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const commandId = req.body.commandId ? String(req.body.commandId).trim() : null;
  const trigger = String(req.body.trigger || '').trim().toLowerCase().replace(/^[^a-zA-Z0-9_]+/, '');
  const response = String(req.body.response || '').trim();
  const userlevel = req.body.userlevel || 'everyone';
  const cooldown = Math.max(1, Math.min(300, parseInt(req.body.cooldown, 10) || 5));
  const aliases = String(req.body.aliases || '').trim();

  if (!trigger || !response) {
    res.setFlash('error', 'Trigger and response are required');
    return redirectToTab(res, 'commands');
  }

  const existingWithTrigger = getCommandByTrigger(channel.id, trigger);

  if (commandId) {
    // EDIT MODE
    const existingCmd = getCommandById(channel.id, commandId);
    if (!existingCmd) {
      res.setFlash('error', 'Command not found');
      return redirectToTab(res, 'commands');
    }

    if (existingWithTrigger && existingWithTrigger.id !== commandId) {
      res.setFlash('error', `A command with trigger "${trigger}" already exists`);
      return redirectToTab(res, 'commands');
    }

    updateCommand(channel.id, commandId, {
      trigger,
      response,
      userlevel,
      cooldown,
      aliases,
    });

    recordActivity(channel.id, {
      type: 'command',
      title: 'Command Updated',
      detail: `Updated command !${trigger}${aliases ? ` (aliases: ${aliases})` : ''}`,
    });

    res.setFlash('success', `Command "${trigger}" updated`);
    return redirectToTab(res, 'commands');
  }

  // CREATE MODE
  if (existingWithTrigger) {
    res.setFlash('error', `A command with trigger "${trigger}" already exists. You can edit it from the commands list.`);
    return redirectToTab(res, 'commands');
  }

  upsertCommand(channel.id, {
    trigger,
    response,
    userlevel,
    cooldown,
    aliases,
    enabled: true,
  });

  recordActivity(channel.id, {
    type: 'command',
    title: 'Command Created',
    detail: `Created new command !${trigger}${aliases ? ` (aliases: ${aliases})` : ''}`,
  });

  res.setFlash('success', `Command "${trigger}" created`);
  return redirectToTab(res, 'commands');
});

// 3. Delete Custom Command
apiRouter.post('/commands/delete', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const commandId = req.body.commandId;
  const existing = getCommandById(channel.id, commandId);
  deleteCommand(channel.id, commandId);

  if (existing) {
    recordActivity(channel.id, {
      type: 'command',
      title: 'Command Deleted',
      detail: `Deleted command !${existing.trigger}`,
    });
  }

  res.setFlash('success', 'Command deleted');
  return redirectToTab(res, 'commands');
});

// 3a. Export Custom Commands (JSON Download)
apiRouter.get('/commands/export', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const commands = channel.commands || getCommandsForChannel(channel.id);
  const exportPayload = {
    version: '1.0',
    bot: config.botName,
    channel: channel.login,
    exportedAt: new Date().toISOString(),
    commands: commands.map((c) => ({
      trigger: c.trigger,
      response: c.response,
      userlevel: c.userlevel,
      cooldown: c.cooldown,
      aliases: c.aliases || '',
      enabled: c.enabled,
    })),
  };

  const filename = `commands-${channel.login}-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  return res.send(JSON.stringify(exportPayload, null, 2));
});

// 3a-2. Import Custom Commands (JSON Upload or Paste)
apiRouter.post('/commands/import', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const mode = String(req.body.mode || 'merge').trim().toLowerCase(); // 'merge' or 'replace'
  const rawJson = String(req.body.commandsJson || req.body.jsonContent || '').trim();

  if (!rawJson) {
    res.setFlash('error', 'Please provide or upload valid JSON command data.');
    return redirectToTab(res, 'commands');
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    res.setFlash('error', `Invalid JSON syntax: ${err.message}`);
    return redirectToTab(res, 'commands');
  }

  const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.commands) ? parsed.commands : null);
  if (!list || list.length === 0) {
    res.setFlash('error', 'No commands array found in the uploaded JSON file.');
    return redirectToTab(res, 'commands');
  }

  // If replace mode, delete all existing custom commands first
  if (mode === 'replace') {
    const existing = channel.commands || getCommandsForChannel(channel.id);
    for (const cmd of existing) {
      deleteCommand(channel.id, cmd.id);
    }
  }

  let importedCount = 0;
  for (const item of list) {
    const trigger = String(item.trigger || '').trim().toLowerCase().replace(/^!+/, '');
    const response = String(item.response || '').trim();
    if (!trigger || !response) continue;

    upsertCommand(channel.id, {
      trigger,
      response,
      userlevel: item.userlevel || 'everyone',
      cooldown: parseInt(item.cooldown, 10) || 5,
      aliases: item.aliases || '',
      enabled: item.enabled !== false,
    });
    importedCount++;
  }

  recordActivity(channel.id, {
    type: 'command',
    title: 'Commands Imported',
    detail: `Imported ${importedCount} command(s) (${mode} mode)`,
  });

  res.setFlash('success', `Successfully imported ${importedCount} command(s) (${mode === 'replace' ? 'replaced existing' : 'merged'}).`);
  return redirectToTab(res, 'commands');
});

// 3b. Create or Update Scheduled Timer
apiRouter.post(['/timers/save', '/timers/create', '/timers/update'], requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const timerId = req.body.timerId ? String(req.body.timerId).trim() : null;
  const name = String(req.body.name || '').trim();
  const message = String(req.body.message || '').trim();
  const intervalMinutes = parseInt(req.body.intervalMinutes, 10) || 15;
  const minChatLines = parseInt(req.body.minChatLines, 10) || 0;

  if (!name || !message) {
    res.setFlash('error', 'Timer name and message are required.');
    return redirectToTab(res, 'timers');
  }

  if (timerId) {
    const existing = getTimerById(channel.id, timerId);
    if (!existing) {
      res.setFlash('error', 'Timer not found.');
      return redirectToTab(res, 'timers');
    }

    updateTimer(channel.id, timerId, {
      name,
      message,
      intervalMinutes,
      minChatLines,
    });

    res.setFlash('success', `Timer "${name}" updated.`);
    return redirectToTab(res, 'timers');
  }

  createTimer(channel.id, {
    name,
    message,
    intervalMinutes,
    minChatLines,
  });

  res.setFlash('success', `Timer "${name}" created.`);
  return redirectToTab(res, 'timers');
});

// 3c. Toggle Scheduled Timer Active/Paused
apiRouter.post('/timers/toggle', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const timerId = String(req.body.timerId || '').trim();
  const timer = getTimerById(channel.id, timerId);
  if (!timer) {
    res.setFlash('error', 'Timer not found.');
    return redirectToTab(res, 'timers');
  }

  let enabled;
  if (req.body.hasEnabledField !== undefined) {
    enabled = Boolean(req.body.enabled === 'true' || req.body.enabled === 'on' || req.body.enabled === '1');
  } else {
    enabled = !timer.enabled;
  }

  toggleTimer(channel.id, timerId, enabled);
  res.setFlash('success', `Timer "${timer.name}" ${enabled ? 'enabled' : 'paused'}.`);
  return redirectToTab(res, 'timers');
});

// 3d. Delete Scheduled Timer
apiRouter.post('/timers/delete', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const timerId = String(req.body.timerId || '').trim();
  const timer = getTimerById(channel.id, timerId);
  if (timer) {
    deleteTimer(channel.id, timerId);
    res.setFlash('success', `Timer "${timer.name}" deleted.`);
  } else {
    res.setFlash('error', 'Timer not found.');
  }
  return redirectToTab(res, 'timers');
});

// 3e. Update Raid Welcome Settings
apiRouter.post('/raid/settings', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const enabled = Boolean(req.body.enabled === 'true' || req.body.enabled === 'on' || req.body.enabled === '1');
  const minViewers = parseInt(req.body.minViewers, 10) || 0;
  const message = String(req.body.message || '').trim();
  const cooldownMinutes = parseInt(req.body.cooldownMinutes, 10) || 0;

  if (!message) {
    res.setFlash('error', 'Raid welcome message cannot be empty.');
    return redirectToTab(res, 'raids');
  }

  updateRaidSettings(channel.id, {
    enabled,
    minViewers,
    message,
    cooldownMinutes,
  });

  res.setFlash('success', 'Raid welcome settings updated.');
  return redirectToTab(res, 'raids');
});

// 3f. Send Test Raid Message
apiRouter.post('/raid/test', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const bot = getBotAccount();
  if (!bot) {
    res.setFlash('error', 'Central bot account is not linked yet.');
    return redirectToTab(res, 'raids');
  }

  const settings = channel.raidSettings || getRaidSettings(channel.id);
  const formatted = formatRaidMessage(settings.message, {
    raider: 'SpeedyRaider',
    viewers: 42,
    game: 'Super Mario World',
    url: 'https://twitch.tv/speedyraider',
    channel,
  });

  try {
    await sendChatMessage({
      broadcasterId: channel.id,
      senderId: bot.userId,
      message: `[TEST RAID] ${formatted}`,
    });
    res.setFlash('success', 'Simulated raid welcome message dispatched to Twitch chat!');
  } catch (err) {
    res.setFlash('error', `Could not send test message: ${err.message}`);
  }

  return redirectToTab(res, 'raids');
});

// 3g. Update Shoutout Settings
apiRouter.post('/shoutout/settings', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const enabled = Boolean(req.body.enabled === 'true' || req.body.enabled === 'on' || req.body.enabled === '1');
  const message = String(req.body.message || '').trim();
  const autoOnRaid = Boolean(req.body.autoOnRaid === 'true' || req.body.autoOnRaid === 'on' || req.body.autoOnRaid === '1');
  const sendTwitchShoutout = Boolean(req.body.sendTwitchShoutout === 'true' || req.body.sendTwitchShoutout === 'on' || req.body.sendTwitchShoutout === '1');
  const userlevel = req.body.userlevel || 'mod';
  const cooldownSeconds = parseInt(req.body.cooldownSeconds, 10) || 15;

  if (!message) {
    res.setFlash('error', 'Shoutout message template cannot be empty.');
    return redirectToTab(res, 'shoutouts');
  }

  updateShoutoutSettings(channel.id, {
    enabled,
    message,
    autoOnRaid,
    sendTwitchShoutout,
    userlevel,
    cooldownSeconds,
  });

  res.setFlash('success', 'Shoutout settings saved successfully.');
  return redirectToTab(res, 'shoutouts');
});

// 3h. Send Test Shoutout Message
apiRouter.post('/shoutout/test', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const wantsJson = req.xhr || req.headers.accept?.includes('application/json');

  const bot = getBotAccount();
  if (!bot) {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: 'Central bot account is not linked yet.' });
    }
    res.setFlash('error', 'Central bot account is not linked yet.');
    return redirectToTab(res, 'shoutouts');
  }

  const settings = channel.shoutoutSettings || getShoutoutSettings(channel.id);
  const target = String(req.body.target || 'SpeedyRaider').trim().replace(/^@/, '');
  const formatted = formatShoutoutMessage(settings.message, {
    target,
    game: 'Super Mario World',
    url: `https://twitch.tv/${target.toLowerCase()}`,
    channel,
    user: req.user.displayName || req.user.login,
  });

  try {
    await sendChatMessage({
      broadcasterId: channel.id,
      senderId: bot.userId,
      message: `[TEST SHOUTOUT] ${formatted}`,
    });
    if (wantsJson) {
      return res.json({ ok: true, message: `Simulated shoutout for @${target} dispatched to Twitch chat!` });
    }
    res.setFlash('success', `Simulated shoutout for @${target} dispatched to Twitch chat!`);
  } catch (err) {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: `Could not send test shoutout: ${err.message}` });
    }
    res.setFlash('error', `Could not send test shoutout: ${err.message}`);
  }

  return redirectToTab(res, 'shoutouts');
});

// 3i. Add Auto-Shoutout Streamer
apiRouter.post('/shoutout/auto/add', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const rawLogin = String(req.body.targetLogin || req.body.username || '').trim().replace(/^@+/, '');
  if (!rawLogin) {
    res.setFlash('error', 'Twitch username cannot be empty.');
    return redirectToTab(res, 'shoutouts');
  }

  // Prevent adding channel owner to their own auto shoutout
  if (rawLogin.toLowerCase() === String(channel.login || '').toLowerCase()) {
    res.setFlash('error', 'You cannot add your own channel to auto-shoutout.');
    return redirectToTab(res, 'shoutouts');
  }

  let targetUser = null;
  try {
    targetUser = await getUserByLogin(rawLogin);
  } catch (err) {
    console.warn('[Auto-Shoutout API] User lookup failed:', err.message);
  }

  addAutoShoutout(channel.id, {
    targetLogin: rawLogin,
    targetUserId: targetUser?.id || null,
    targetDisplayName: targetUser?.displayName || rawLogin,
    targetAvatar: targetUser?.avatar || targetUser?.avatarUrl || targetUser?.profileImageUrl || null,
  });

  res.setFlash('success', `Added @${targetUser?.displayName || rawLogin} to auto-shoutout directory.`);
  return redirectToTab(res, 'shoutouts');
});

// 3j. Remove Auto-Shoutout Streamer
apiRouter.post('/shoutout/auto/remove', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const rawLogin = String(req.body.targetLogin || req.body.username || '').trim().replace(/^@+/, '');
  if (!rawLogin) {
    res.setFlash('error', 'Username cannot be empty.');
    return redirectToTab(res, 'shoutouts');
  }

  const removed = removeAutoShoutout(channel.id, rawLogin);
  if (removed) {
    res.setFlash('success', `Removed @${rawLogin} from auto-shoutout directory.`);
  } else {
    res.setFlash('error', `@${rawLogin} was not found in the auto-shoutout directory.`);
  }

  return redirectToTab(res, 'shoutouts');
});

// 3k. Toggle Auto-Shoutout Streamer Active State
apiRouter.post('/shoutout/auto/toggle', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const rawLogin = String(req.body.targetLogin || req.body.username || '').trim().replace(/^@+/, '');
  if (!rawLogin) {
    res.setFlash('error', 'Username cannot be empty.');
    return redirectToTab(res, 'shoutouts');
  }

  const enabled = Boolean(req.body.enabled === 'true' || req.body.enabled === '1' || req.body.enabled === 'on');
  toggleAutoShoutout(channel.id, rawLogin, enabled);

  res.setFlash('success', `Auto-shoutout for @${rawLogin} ${enabled ? 'enabled' : 'disabled'}.`);
  return redirectToTab(res, 'shoutouts');
});

// 4. Update Auto-Moderation Settings
apiRouter.post('/moderation', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const filterLinks = Boolean(req.body.filterLinks === 'true' || req.body.filterLinks === 'on' || req.body.filterLinks === true || req.body.filterLinks === '1');
  const filterCaps = Boolean(req.body.filterCaps === 'true' || req.body.filterCaps === 'on' || req.body.filterCaps === true || req.body.filterCaps === '1');
  const filterEmotes = Boolean(req.body.filterEmotes === 'true' || req.body.filterEmotes === 'on' || req.body.filterEmotes === true || req.body.filterEmotes === '1');
  const maxEmotes = Math.max(1, Math.min(100, parseInt(req.body.maxEmotes, 10) || 10));
  const filterRepetition = Boolean(req.body.filterRepetition === 'true' || req.body.filterRepetition === 'on' || req.body.filterRepetition === true || req.body.filterRepetition === '1');
  const maxRepetition = Math.max(2, Math.min(20, parseInt(req.body.maxRepetition, 10) || 4));

  const filterScamBots = Boolean(req.body.filterScamBots === 'true' || req.body.filterScamBots === 'on' || req.body.filterScamBots === true || req.body.filterScamBots === '1');
  const rawScamAction = String(req.body.scamAction || 'timeout').toLowerCase();
  const scamAction = ['timeout', 'ban', 'delete'].includes(rawScamAction) ? rawScamAction : 'timeout';
  const filterGfxBots = Boolean(req.body.filterGfxBots === 'true' || req.body.filterGfxBots === 'on' || req.body.filterGfxBots === true || req.body.filterGfxBots === '1');

  const rawBanned = String(req.body.bannedWords || '');
  const bannedWords = rawBanned
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  updateModerationSettings(channel.id, {
    filterLinks,
    filterCaps,
    filterEmotes,
    maxEmotes,
    filterRepetition,
    maxRepetition,
    filterScamBots,
    scamAction,
    filterGfxBots,
    bannedWords,
  });

  res.setFlash('success', 'Moderation settings saved');
  return redirectToTab(res, 'moderation');
});

// 4b. Live Dashboard Activity Stream API
apiRouter.get('/activity', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
  const activities = getRecentActivities(channel.id, limit);

  return res.json({
    ok: true,
    channel: channel.login,
    activities,
  });
});

// 5. Add Manager
apiRouter.post('/managers/add', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  // Only the channel broadcaster can add managers
  if (String(channel.id) !== String(req.user.userId)) {
    res.setFlash('error', 'Only the channel broadcaster can add channel managers.');
    return redirectToTab(res, 'managers');
  }

  const rawUsername = String(req.body.username || '').trim().replace(/^@+/, '');
  if (!rawUsername) {
    res.setFlash('error', 'Please provide a username to add as manager.');
    return redirectToTab(res, 'managers');
  }

  if (rawUsername.toLowerCase() === String(channel.login || '').toLowerCase()) {
    res.setFlash('error', 'You are already the channel broadcaster.');
    return redirectToTab(res, 'managers');
  }

  let twitchUser = null;
  try {
    twitchUser = await getUserByLogin(rawUsername);
  } catch (err) {
    console.warn('[Manager Add] Twitch user lookup failed:', err.message);
  }

  addManager(channel.id, rawUsername, {
    displayName: twitchUser?.displayName || twitchUser?.display_name || rawUsername,
    avatarUrl: twitchUser?.avatar || twitchUser?.avatarUrl || twitchUser?.profileImageUrl || null,
    userId: twitchUser?.id || null,
  });

  res.setFlash('success', `Manager @${twitchUser?.displayName || rawUsername} added`);
  return redirectToTab(res, 'managers');
});

// 6. Remove Manager
apiRouter.post('/managers/remove', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  // Only the channel broadcaster can remove managers
  if (String(channel.id) !== String(req.user.userId)) {
    res.setFlash('error', 'Only the channel broadcaster can remove channel managers.');
    return redirectToTab(res, 'managers');
  }

  const username = req.body.username;
  if (username) {
    removeManager(channel.id, username);
    res.setFlash('success', `Manager @${username} removed`);
  }
  return redirectToTab(res, 'managers');
});

// 7. Live Test Message
apiRouter.post('/send-test', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const wantsJson = req.xhr || req.headers.accept?.includes('application/json');

  const bot = getBotAccount();
  if (!bot) {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: 'Central bot account is not linked yet. Contact the host.' });
    }
    res.setFlash('error', 'Central bot account is not linked yet. Contact the host.');
    return redirectToTab(res, 'test');
  }

  const message = req.body.message || `Hello from ${config.botName}!`;

  try {
    await sendChatMessage({
      broadcasterId: channel.id,
      senderId: bot.userId,
      message,
    });
    if (wantsJson) {
      return res.json({ ok: true, message: 'Message sent to Twitch chat!' });
    }
    res.setFlash('success', 'Message sent to Twitch chat!');
    return redirectToTab(res, 'test');
  } catch (err) {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: err.message });
    }
    res.setFlash('error', err.message);
    return redirectToTab(res, 'test');
  }
});

// 8. Update Custom Command Prefix
apiRouter.post('/channel/prefix', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const rawPrefix = String(req.body.prefix || '').trim();
  if (!rawPrefix) {
    res.setFlash('error', 'Prefix cannot be empty');
    return redirectToTab(res, 'prefix');
  }
  if (rawPrefix.length > 3) {
    res.setFlash('error', 'Prefix must be at most 3 characters');
    return redirectToTab(res, 'prefix');
  }
  if (/\s/.test(rawPrefix)) {
    res.setFlash('error', 'Prefix cannot contain spaces');
    return redirectToTab(res, 'prefix');
  }

  updateChannel(channel.id, { prefix: rawPrefix });
  res.setFlash('success', `Command prefix updated to ${rawPrefix}`);
  return redirectToTab(res, 'prefix');
});

// 9. Automated Modding of Central Bot via Twitch Helix
apiRouter.post('/setup/mod-bot', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  // Only the broadcaster can manage channel moderators
  if (String(channel.id) !== String(req.user.userId)) {
    res.setFlash('error', 'Only the channel broadcaster can add moderators.');
    return redirectToTab(res, 'overview');
  }

  const bot = getBotAccount();
  if (!bot || !bot.userId) {
    res.setFlash('error', 'Central bot account is not registered yet.');
    return redirectToTab(res, 'overview');
  }

  try {
    await addChannelModerator({
      broadcasterId: channel.id,
      botUserId: bot.userId,
      userToken: channel.accessToken,
    });
    res.setFlash('success', `Success! @${bot.displayName || bot.login} is now a moderator in #${channel.login}.`);
    return redirectToTab(res, 'overview');
  } catch (err) {
    console.warn('[Setup Mod-Bot Error]', err.message);
    res.setFlash('error', err.message);
    return redirectToTab(res, 'overview');
  }
});

// 10. Save Stream Alerts Settings
apiRouter.post('/alerts/settings', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const followEnabled = req.body.followEnabled === 'on' || req.body.followEnabled === 'true' || req.body.followEnabled === '1' || req.body.followEnabled === true;
  const subEnabled = req.body.subEnabled === 'on' || req.body.subEnabled === 'true' || req.body.subEnabled === '1' || req.body.subEnabled === true;

  updateStreamAlertSettings(channel.id, {
    followEnabled,
    followMessage: req.body.followMessage,
    subEnabled,
    subMessage: req.body.subMessage,
    resubMessage: req.body.resubMessage,
    giftSubMessage: req.body.giftSubMessage,
    communityGiftMessage: req.body.communityGiftMessage,
  });

  // Re-sync EventSub listeners for this channel
  subscribeChannel(channel.id).catch((err) => {
    console.warn('[EventSub] Sync error after alert settings update:', err.message);
  });

  res.setFlash('success', 'Stream alert settings updated successfully.');
  return redirectToTab(res, 'alerts');
});

// 11. Test Stream Alert
apiRouter.post('/alerts/test', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const wantsJson = req.xhr || req.headers.accept?.includes('application/json');
  const type = String(req.body.type || 'follow').trim();

  try {
    const result = await executeTestAlert(channel.id, type);
    if (wantsJson) {
      return res.json({ ok: true, message: `Sent test alert to #${channel.login}: ${result.message}` });
    }
    res.setFlash('success', `Sent test alert to #${channel.login}: ${result.message}`);
  } catch (err) {
    console.warn('[Test Alert Error]', err.message);
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: `Failed to send test alert: ${err.message}` });
    }
    res.setFlash('error', `Failed to send test alert: ${err.message}`);
  }

  return redirectToTab(res, 'alerts');
});

// 12. Save Channel Point Trigger (Create / Update)
apiRouter.post('/redemptions/save', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const rewardTitle = String(req.body.rewardTitle || '').trim();
  const responseMessage = String(req.body.responseMessage || '').trim();

  if (!rewardTitle) {
    res.setFlash('error', 'Reward title is required (must match your Twitch channel points reward).');
    return redirectToTab(res, 'rewards');
  }

  if (!responseMessage) {
    res.setFlash('error', 'Bot response message cannot be empty.');
    return redirectToTab(res, 'rewards');
  }

  const id = req.body.id ? String(req.body.id).trim() : null;
  const rewardId = req.body.rewardId ? String(req.body.rewardId).trim() : null;
  const cooldownSeconds = parseInt(req.body.cooldownSeconds, 10) || 5;
  const enabled = req.body.enabled !== undefined ? (req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === '1' || req.body.enabled === true) : true;

  try {
    upsertChannelPointTrigger(channel.id, {
      id,
      rewardTitle,
      rewardId,
      responseMessage,
      cooldownSeconds,
      enabled,
    });
    subscribeChannel(channel.id).catch(() => {});
    res.setFlash('success', `Reward trigger "${rewardTitle}" saved successfully.`);
  } catch (err) {
    console.warn('[Save Redemption Trigger Error]', err.message);
    res.setFlash('error', `Failed to save trigger: ${err.message}`);
  }

  return redirectToTab(res, 'rewards');
});

// 13. Toggle Channel Point Trigger
apiRouter.post('/redemptions/toggle', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const id = String(req.body.id || '').trim();
  const enabled = req.body.enabled === 'on' || req.body.enabled === 'true' || req.body.enabled === '1' || req.body.enabled === true;

  if (!id) {
    res.setFlash('error', 'Trigger ID is required.');
    return redirectToTab(res, 'rewards');
  }

  toggleChannelPointTrigger(channel.id, id, enabled);
  subscribeChannel(channel.id).catch(() => {});
  res.setFlash('success', `Reward trigger ${enabled ? 'enabled' : 'disabled'}.`);
  return redirectToTab(res, 'rewards');
});

// 14. Delete Channel Point Trigger
apiRouter.post('/redemptions/delete', requireAuth, (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const id = String(req.body.id || '').trim();
  if (!id) {
    res.setFlash('error', 'Trigger ID is required.');
    return redirectToTab(res, 'rewards');
  }

  deleteChannelPointTrigger(channel.id, id);
  subscribeChannel(channel.id).catch(() => {});
  res.setFlash('success', 'Reward trigger deleted.');
  return redirectToTab(res, 'rewards');
});

// 15. Test Channel Point Trigger
apiRouter.post('/redemptions/test', requireAuth, async (req, res) => {
  const channel = resolveTargetChannel(req, res);
  if (!channel) return;

  const wantsJson = req.xhr || req.headers.accept?.includes('application/json');
  const id = String(req.body.id || '').trim();
  if (!id) {
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: 'Trigger ID is required.' });
    }
    res.setFlash('error', 'Trigger ID is required.');
    return redirectToTab(res, 'rewards');
  }

  try {
    const result = await executeTestRedemption(channel.id, id);
    if (wantsJson) {
      return res.json({ ok: true, message: `Dispatched test redemption response: ${result.message}` });
    }
    res.setFlash('success', `Dispatched test redemption response: ${result.message}`);
  } catch (err) {
    console.warn('[Test Redemption Error]', err.message);
    if (wantsJson) {
      return res.status(400).json({ ok: false, error: `Failed to test trigger: ${err.message}` });
    }
    res.setFlash('error', `Failed to test trigger: ${err.message}`);
  }

  return redirectToTab(res, 'rewards');
});

// 16. Admin Account Deletion Endpoint
apiRouter.post('/admin/channels/delete', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) {
    res.setFlash('error', 'Administrator privileges required.');
    return res.redirect('/admin');
  }

  const channelId = req.body.channelId ? String(req.body.channelId).trim() : null;
  if (!channelId) {
    res.setFlash('error', 'Channel ID is required.');
    return res.redirect('/admin');
  }

  if (String(channelId) === String(req.user.userId)) {
    res.setFlash('error', 'You cannot delete your own active administrator account.');
    return res.redirect('/admin');
  }

  const channel = getChannel(channelId);
  if (!channel) {
    res.setFlash('error', 'Channel account not found.');
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
        `Channel @${channel.displayName || channel.login} was completely deleted and disconnected from the bot.`
      );
    } else {
      res.setFlash('error', result.error || 'Failed to delete channel.');
    }
  } catch (err) {
    console.error('[API Admin Delete Channel Error]', err);
    res.setFlash('error', `Error deleting channel: ${err.message}`);
  }

  return res.redirect('/admin');
});

// 17. 24/7 Live Stream Showcase Endpoints (Admin Only)
apiRouter.get('/stream/status', (req, res) => {
  try {
    const status = getStreamStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/stream/upload', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Administrator privileges required.' });
  }

  try {
    const { fileName, fileData } = req.body;
    if (!fileName || !fileData) {
      return res.status(400).json({ ok: false, error: 'File name and file data are required.' });
    }

    const base64Data = fileData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 100 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Uploaded file exceeds 100MB maximum limit.' });
    }

    const media = await saveUploadedMedia({ filename: fileName, buffer });
    return res.json({ ok: true, message: 'Media uploaded and processed successfully.', media });
  } catch (err) {
    console.error('[API Stream Upload Error]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/stream/start', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Administrator privileges required.' });
  }

  try {
    const { streamKey, title, category } = req.body || {};
    if (streamKey) {
      updateStreamSettings({ streamKey });
    }

    const currentSettings = getStreamSettings();
    const effectiveTitle = title !== undefined ? title : currentSettings.title;
    const effectiveCategory = category !== undefined ? category : currentSettings.category;

    if (effectiveTitle || effectiveCategory) {
      updateStreamSettings({ title: effectiveTitle, category: effectiveCategory });
      try {
        const syncResult = await updateChannelBroadcast({ title: effectiveTitle, category: effectiveCategory });
        if (syncResult && syncResult.category) {
          updateStreamSettings({ category: syncResult.category });
        }
      } catch (e) {
        console.warn('[API Stream] Twitch broadcast update notice:', e.message);
      }
    }

    const result = await startStream({ streamKey });
    return res.json(result);
  } catch (err) {
    console.error('[API Stream Start Error]', err);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/stream/stop', requireAuth, (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Administrator privileges required.' });
  }

  try {
    const result = stopStream();
    return res.json(result);
  } catch (err) {
    console.error('[API Stream Stop Error]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/stream/settings', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Administrator privileges required.' });
  }

  try {
    const { streamKey, title, category, ingestServer, bitrate, recompileVideo } = req.body || {};
    const updates = {};
    if (streamKey !== undefined) updates.streamKey = streamKey;
    if (title !== undefined) updates.title = title;
    if (category !== undefined) updates.category = category;
    if (ingestServer !== undefined) updates.ingestServer = ingestServer;
    if (bitrate !== undefined) {
      const br = parseInt(bitrate, 10);
      if (!isNaN(br) && br >= 500 && br <= 10000) {
        updates.bitrate = br;
      }
    }

    updateStreamSettings(updates);

    // Only recompile video loop if explicitly requested (e.g. bitrate change or upload)
    if (recompileVideo === true && updates.bitrate !== undefined) {
      try {
        await recompileVideoLoop({ bitrate: updates.bitrate });
      } catch (e) {
        console.warn('[API Stream] Loop recompile notice:', e.message);
      }
    }

    let broadcastSync = null;
    if (title !== undefined || category !== undefined) {
      try {
        broadcastSync = await updateChannelBroadcast({ title, category });
        if (broadcastSync && broadcastSync.category) {
          updates.category = broadcastSync.category;
          updateStreamSettings({ category: broadcastSync.category });
        }
      } catch (e) {
        console.warn('[API Stream] Broadcast metadata update notice:', e.message);
        broadcastSync = { ok: false, error: e.message };
      }
    }

    const current = getStreamStatus();
    let message = 'Broadcast settings saved.';
    if (broadcastSync) {
      if (broadcastSync.ok) {
        message = 'Broadcast settings saved and updated on Twitch channel.';
      } else {
        message = `Settings saved locally, but Twitch update notice: ${broadcastSync.error}`;
      }
    }

    return res.json({ ok: true, message, broadcastSync, ...current });
  } catch (err) {
    console.error('[API Stream Settings Error]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/stream/sync-broadcast', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Administrator privileges required.' });
  }

  try {
    const info = await getChannelBroadcastInfo();
    if (!info) {
      return res.status(404).json({
        ok: false,
        error: 'Could not fetch channel broadcast info from Twitch. Ensure central bot account is authorized.',
      });
    }

    const updates = {};
    if (info.title) updates.title = info.title;
    if (info.category) updates.category = info.category;
    updateStreamSettings(updates);

    const current = getStreamStatus();
    return res.json({
      ok: true,
      message: 'Twitch broadcast title and category pulled from channel.',
      info,
      ...current,
    });
  } catch (err) {
    console.error('[API Stream Sync Error]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

apiRouter.post('/stream/auto-key', requireAuth, async (req, res) => {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ ok: false, error: 'Administrator privileges required.' });
  }

  try {
    const key = await getBotStreamKey();
    if (!key) {
      return res.status(404).json({
        ok: false,
        error: 'Could not fetch stream key from Twitch. Ensure central bot account has the channel:read:stream_key scope.',
      });
    }

    updateStreamSettings({ streamKey: key });
    const masked = `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
    return res.json({ ok: true, message: 'Stream key automatically retrieved and saved!', streamKeyMasked: masked });
  } catch (err) {
    console.error('[API Stream Auto-Key Error]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});


