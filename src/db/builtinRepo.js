import { db } from './connection.js';

export const BUILTIN_COMMANDS = [
  {
    id: 'ping',
    trigger: 'ping',
    name: 'Ping & Latency',
    description: 'Responds with pong and confirms the bot is connected and active in chat.',
    userlevel: 'everyone',
    usage: 'ping',
  },
  {
    id: 'roll',
    trigger: 'roll',
    name: 'Dice Roll',
    description: 'Rolls a random number from 1 to specified max (default 100).',
    userlevel: 'everyone',
    usage: 'roll [max]',
  },
  {
    id: 'so',
    trigger: 'so',
    name: 'Streamer Shoutout',
    description: 'Promotes another streamer with a direct Twitch channel link (aliases: !so, !shoutout).',
    userlevel: 'mod',
    usage: 'so <username>',
  },
  {
    id: 'permit',
    trigger: 'permit',
    name: 'Link Permit',
    description: 'Grants a chatter a temporary 60-second exemption to post a link without automod timeout.',
    userlevel: 'mod',
    usage: 'permit <username>',
  },
  {
    id: 'commands',
    trigger: 'commands',
    name: 'Commands Directory',
    description: 'Outputs all active built-in and custom commands available to the requester in chat.',
    userlevel: 'everyone',
    usage: 'commands',
  },
];

export function getDisabledBuiltins(channelId) {
  if (!channelId) return [];
  const rows = db.prepare('SELECT command FROM channel_disabled_builtins WHERE channel_id = ?').all(String(channelId));
  return rows.map((r) => r.command);
}

export function isBuiltinDisabled(channelId, command) {
  if (!channelId || !command) return false;
  const row = db.prepare('SELECT 1 FROM channel_disabled_builtins WHERE channel_id = ? AND command = ? LIMIT 1')
    .get(String(channelId), String(command).toLowerCase());
  return Boolean(row);
}

export function setBuiltinDisabled(channelId, command, disabled) {
  if (!channelId || !command) return;
  const cId = String(channelId);
  const cmd = String(command).toLowerCase();

  if (disabled) {
    db.prepare(`
      INSERT INTO channel_disabled_builtins (channel_id, command, disabled_at)
      VALUES (?, ?, ?)
      ON CONFLICT(channel_id, command) DO NOTHING
    `).run(cId, cmd, Date.now());
  } else {
    db.prepare(`
      DELETE FROM channel_disabled_builtins WHERE channel_id = ? AND command = ?
    `).run(cId, cmd);
  }
}
