import { config } from '../config.js';
import { getBotAccount, getChannel, incrementCommandCounter, addAutoShoutout, removeAutoShoutout, getAutoShoutouts } from '../db/index.js';
import { sendChatMessage, getUserByLogin } from './twitchApi.js';
import { checkAutoModeration, grantLinkPermit } from './moderationService.js';
import { recordChatMessage } from './timerService.js';
import { executeShoutout, checkAutoShoutoutOnChat } from './shoutoutService.js';

// Cooldown tracker: `${channelId}:${trigger}` -> lastExecutionTimestamp
const cooldowns = new Map();

/**
 * Check if chatter meets the required userlevel.
 */
export function hasPermission(event, broadcasterId, requiredLevel = 'everyone') {
  if (requiredLevel === 'everyone') return true;

  const isBroadcaster = event.chatter_user_id === String(broadcasterId) ||
    event.badges?.some((b) => b.set_id === 'broadcaster');
  if (isBroadcaster) return true;
  if (requiredLevel === 'broadcaster') return false;

  const isMod = event.badges?.some((b) => b.set_id === 'moderator');
  if (isMod) return true;
  if (requiredLevel === 'mod') return false;

  const isVip = event.badges?.some((b) => b.set_id === 'vip');
  if (isVip) return true;
  if (requiredLevel === 'vip') return false;

  const isSub = event.badges?.some((b) => b.set_id === 'subscriber' || b.set_id === 'founder');
  if (isSub) return true;
  if (requiredLevel === 'sub') return false;

  return false;
}

/**
 * Interpolate dynamic variables in custom command templates.
 */
export function formatResponse(template, { event, channel, args, command }) {
  const chatter = `@${event.chatter_user_name}`;
  const target = args[0] ? args[0].replace(/^@/, '') : event.chatter_user_name;

  return template
    .replace(/{user}/gi, chatter)
    .replace(/{target}/gi, `@${target}`)
    .replace(/{channel}/gi, channel.displayName || channel.login)
    .replace(/{count}/gi, String((command.counter || 0) + 1))
    .replace(/{random\.(\d+)-(\d+)}/gi, (_, min, max) => {
      const low = parseInt(min, 10);
      const high = parseInt(max, 10);
      return String(Math.floor(Math.random() * (high - low + 1)) + low);
    });
}

/**
 * Main dispatcher for incoming chat messages.
 */
export async function dispatchChatMessage(
  event,
  {
    sendChatFn = sendChatMessage,
    getUserByLoginFn = getUserByLogin,
    sendShoutoutFn,
    getChannelInfoFn,
  } = {}
) {
  const bot = getBotAccount();
  if (!bot) return;

  const botId = bot.userId;
  // Ignore messages from the bot itself to prevent infinite loops
  if (event.chatter_user_id === String(botId)) return;

  const broadcasterId = String(event.broadcaster_user_id);
  const channel = getChannel(broadcasterId);
  if (!channel || !channel.joined) return;

  // Run auto-moderation checks
  const wasModerated = await checkAutoModeration(event, channel, botId);
  if (wasModerated) return;

  // Track chat line activity for scheduled chat timers
  recordChatMessage(channel.id);

  // Check auto-shoutout for creators speaking in chat
  const chatterLogin = event.chatter_user_login || event.chatter_user_name;
  if (chatterLogin) {
    checkAutoShoutoutOnChat({
      channel,
      chatterLogin,
      chatterUserId: event.chatter_user_id,
      sendChatFn,
      sendShoutoutFn,
      getChannelInfoFn,
      getUserByLoginFn,
    }).catch((err) => {
      console.warn('[Auto-Shoutout] Check error:', err.message);
    });
  }

  const text = event.message?.text?.trim() || '';
  const prefix = channel.prefix || '!';

  if (!text.startsWith(prefix)) return;

  const raw = text.slice(prefix.length).trim();
  const parts = raw.split(/\s+/);
  const trigger = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  if (!trigger) return;

  const reply = async (replyText) => {
    return await sendChatFn({
      broadcasterId: channel.id,
      senderId: botId,
      message: replyText,
      replyParentMessageId: event.message_id,
    });
  };

  // Cooldown key
  const cdKey = `${channel.id}:${trigger}`;
  const lastRun = cooldowns.get(cdKey) || 0;
  const disabledBuiltins = new Set(channel.disabledBuiltins || []);

  // 1. Built-in moderation commands
  if (trigger === 'permit' && !disabledBuiltins.has('permit')) {
    if (!hasPermission(event, channel.id, 'mod')) return;
    const target = args[0]?.replace(/^@/, '');
    if (!target) {
      await reply(`Usage: ${prefix}permit <username>`);
      return;
    }
    grantLinkPermit(channel.id, target);
    await reply(`Granted @${target} permission to post 1 link in the next 60 seconds.`);
    return;
  }

  // 2. Built-in utility commands
  if (trigger === 'ping' && !disabledBuiltins.has('ping')) {
    await reply(`Pong! ${config.botName} is active in #${channel.login}.`);
    return;
  }

  if (trigger === 'roll' && !disabledBuiltins.has('roll')) {
    const max = parseInt(args[0], 10) || 100;
    const result = Math.floor(Math.random() * max) + 1;
    await reply(`@${event.chatter_user_name} rolled a ${result} (1-${max}).`);
    return;
  }

  // Auto-shoutout subcommand (!so auto ...) or standalone command (!autoso ...)
  const isAutoSo = trigger === 'autoso' || ((trigger === 'so' || trigger === 'shoutout') && args[0]?.toLowerCase() === 'auto');
  if (isAutoSo && !disabledBuiltins.has('so')) {
    if (!hasPermission(event, channel.id, 'mod')) return;

    const subAction = trigger === 'autoso' ? args[0]?.toLowerCase() : args[1]?.toLowerCase();
    const rawTarget = trigger === 'autoso' ? args[1] : args[2];
    const cleanTarget = rawTarget ? rawTarget.replace(/^@+/, '').trim() : '';

    if (subAction === 'add') {
      if (!cleanTarget) {
        await reply(`Usage: ${prefix}${trigger === 'autoso' ? 'autoso' : 'so auto'} add <username>`);
        return;
      }
      let targetUser = null;
      try {
        targetUser = await getUserByLoginFn(cleanTarget);
      } catch (_) {}

      addAutoShoutout(channel.id, {
        targetLogin: cleanTarget,
        targetUserId: targetUser?.id || null,
        targetDisplayName: targetUser?.displayName || cleanTarget,
        targetAvatar: targetUser?.avatar || targetUser?.avatarUrl || targetUser?.profileImageUrl || null,
      });

      await reply(`Added @${cleanTarget} to the auto-shoutout directory.`);
      return;
    }

    if (subAction === 'remove' || subAction === 'delete' || subAction === 'rm') {
      if (!cleanTarget) {
        await reply(`Usage: ${prefix}${trigger === 'autoso' ? 'autoso' : 'so auto'} remove <username>`);
        return;
      }
      const removed = removeAutoShoutout(channel.id, cleanTarget);
      if (removed) {
        await reply(`Removed @${cleanTarget} from the auto-shoutout directory.`);
      } else {
        await reply(`@${cleanTarget} was not found in the auto-shoutout directory.`);
      }
      return;
    }

    if (subAction === 'list') {
      const list = getAutoShoutouts(channel.id);
      if (!list || list.length === 0) {
        await reply('The auto-shoutout directory is currently empty.');
        return;
      }
      const names = list.map((item) => `@${item.targetDisplayName || item.targetLogin}`).join(', ');
      await reply(`Auto-shoutout directory (${list.length}): ${names}`);
      return;
    }

    await reply(`Usage: ${prefix}${trigger === 'autoso' ? 'autoso' : 'so auto'} <add|remove|list> [username]`);
    return;
  }

  if ((trigger === 'so' || trigger === 'shoutout') && !disabledBuiltins.has('so')) {
    const soSettings = channel.shoutoutSettings || { enabled: true, userlevel: 'mod', cooldownSeconds: 15 };
    if (!soSettings.enabled) return;
    if (!hasPermission(event, channel.id, soSettings.userlevel || 'mod')) return;

    const target = args[0]?.replace(/^@/, '');
    if (!target) {
      await reply(`Usage: ${prefix}so <username> (or ${prefix}so auto <add|remove|list>)`);
      return;
    }

    // Cooldown check per channel
    const cdKey = `${channel.id}:so`;
    const lastSo = cooldowns.get(cdKey) || 0;
    const cdSec = soSettings.cooldownSeconds !== undefined ? soSettings.cooldownSeconds : 15;
    if (Date.now() - lastSo < cdSec * 1000) return;
    cooldowns.set(cdKey, Date.now());

    await executeShoutout({
      channelId: channel.id,
      targetLogin: target,
      requestedBy: event.chatter_user_name,
      sendChatFn,
      sendShoutoutFn,
      getChannelInfoFn,
      getUserByLoginFn,
    });
    return;
  }

  if (trigger === 'commands' && !disabledBuiltins.has('commands')) {
    const available = (channel.commands || [])
      .filter((cmd) => cmd.enabled && hasPermission(event, channel.id, cmd.userlevel))
      .map((cmd) => `${prefix}${cmd.trigger}`);
    const builtins = [];
    if (!disabledBuiltins.has('ping')) builtins.push(`${prefix}ping`);
    if (!disabledBuiltins.has('roll')) builtins.push(`${prefix}roll`);
    if (!disabledBuiltins.has('commands')) builtins.push(`${prefix}commands`);
    if (!disabledBuiltins.has('so') && hasPermission(event, channel.id, 'mod')) builtins.push(`${prefix}so`);
    if (!disabledBuiltins.has('permit') && hasPermission(event, channel.id, 'mod')) builtins.push(`${prefix}permit`);
    await reply(`Available commands: ${[...builtins, ...available].join(', ')}`);
    return;
  }

  // 3. Custom Commands matching
  const customCmd = (channel.commands || []).find(
    (c) => c.trigger?.toLowerCase() === trigger && c.enabled
  );

  if (!customCmd) return;

  // Verify permission
  if (!hasPermission(event, channel.id, customCmd.userlevel)) return;

  // Verify cooldown
  const cdSec = customCmd.cooldown || 5;
  if (Date.now() - lastRun < cdSec * 1000) return;
  cooldowns.set(cdKey, Date.now());

  // Increment counter in SQLite DB
  incrementCommandCounter(channel.id, customCmd.id);

  // Format response and send
  const response = formatResponse(customCmd.response, {
    event,
    channel,
    args,
    command: customCmd,
  });

  await reply(response);
}
