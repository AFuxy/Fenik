import { db } from './connection.js';

export function normalizeAliases(aliases) {
  if (!aliases) return '';
  const list = Array.isArray(aliases) ? aliases : String(aliases).split(/[\s,]+/);
  const clean = list
    .map((a) => String(a).trim().toLowerCase().replace(/^!+/, ''))
    .filter((a) => a && /^[a-zA-Z0-9_]+$/.test(a));
  return Array.from(new Set(clean)).join(',');
}

export function getCommandsForChannel(channelId) {
  const rows = db.prepare(`
    SELECT * FROM commands WHERE channel_id = ? ORDER BY trigger ASC
  `).all(String(channelId));

  return rows.map((r) => ({
    id: r.id,
    trigger: r.trigger,
    response: r.response,
    userlevel: r.userlevel,
    cooldown: r.cooldown,
    counter: r.counter,
    enabled: Boolean(r.enabled),
    aliases: r.aliases || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getCommandByTrigger(channelId, trigger) {
  const trig = String(trigger).trim().toLowerCase().replace(/^!+/, '');
  const rows = db.prepare(`
    SELECT * FROM commands WHERE channel_id = ?
  `).all(String(channelId));

  const match = rows.find((r) => {
    if (r.trigger.toLowerCase() === trig) return true;
    const aliases = (r.aliases || '').split(',').map((a) => a.trim().toLowerCase());
    return aliases.includes(trig);
  });

  if (!match) return null;
  return {
    id: match.id,
    trigger: match.trigger,
    response: match.response,
    userlevel: match.userlevel,
    cooldown: match.cooldown,
    counter: match.counter,
    enabled: Boolean(match.enabled),
    aliases: match.aliases || '',
  };
}

export function upsertCommand(channelId, commandData) {
  const cId = String(channelId);
  const trigger = String(commandData.trigger).trim().toLowerCase().replace(/^!+/, '');
  const id = commandData.id || `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const aliases = normalizeAliases(commandData.aliases);
  const now = Date.now();

  const stmt = db.prepare(`
    INSERT INTO commands (id, channel_id, trigger, response, userlevel, cooldown, counter, enabled, aliases, created_at, updated_at)
    VALUES (@id, @channelId, @trigger, @response, @userlevel, @cooldown, @counter, @enabled, @aliases, @createdAt, @updatedAt)
    ON CONFLICT(channel_id, trigger) DO UPDATE SET
      response = excluded.response,
      userlevel = excluded.userlevel,
      cooldown = excluded.cooldown,
      enabled = excluded.enabled,
      aliases = excluded.aliases,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    id,
    channelId: cId,
    trigger,
    response: commandData.response,
    userlevel: commandData.userlevel || 'everyone',
    cooldown: commandData.cooldown || 5,
    counter: commandData.counter || 0,
    enabled: commandData.enabled !== undefined ? (commandData.enabled ? 1 : 0) : 1,
    aliases,
    createdAt: commandData.createdAt || now,
    updatedAt: now,
  });

  return getCommandByTrigger(cId, trigger);
}

export function getCommandById(channelId, commandId) {
  const row = db.prepare(`
    SELECT * FROM commands WHERE channel_id = ? AND id = ? LIMIT 1
  `).get(String(channelId), String(commandId));

  if (!row) return null;
  return {
    id: row.id,
    trigger: row.trigger,
    response: row.response,
    userlevel: row.userlevel,
    cooldown: row.cooldown,
    counter: row.counter,
    enabled: Boolean(row.enabled),
    aliases: row.aliases || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function updateCommand(channelId, commandId, commandData) {
  const cId = String(channelId);
  const cmdId = String(commandId);
  const trigger = String(commandData.trigger).trim().toLowerCase().replace(/^[^a-zA-Z0-9_]+/, '');
  const aliases = normalizeAliases(commandData.aliases);
  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE commands
    SET trigger = ?,
        response = ?,
        userlevel = ?,
        cooldown = ?,
        aliases = ?,
        updated_at = ?
    WHERE channel_id = ? AND id = ?
  `);

  const res = stmt.run(
    trigger,
    String(commandData.response).trim(),
    commandData.userlevel || 'everyone',
    parseInt(commandData.cooldown, 10) || 5,
    aliases,
    now,
    cId,
    cmdId
  );

  return res.changes > 0 ? getCommandById(cId, cmdId) : null;
}

export function deleteCommand(channelId, commandId) {
  const stmt = db.prepare(`
    DELETE FROM commands WHERE channel_id = ? AND id = ?
  `);
  const res = stmt.run(String(channelId), String(commandId));
  return res.changes > 0;
}

export function incrementCommandCounter(channelId, commandId) {
  const stmt = db.prepare(`
    UPDATE commands SET counter = counter + 1, updated_at = ? WHERE channel_id = ? AND id = ?
  `);
  stmt.run(Date.now(), String(channelId), String(commandId));
}

export function insertDefaultCommands(channelId) {
  const defaults = [
    {
      trigger: 'discord',
      response: 'Join our community Discord: https://discord.gg/yourserver',
      userlevel: 'everyone',
      cooldown: 5,
    },
    {
      trigger: 'schedule',
      response: 'Stream Schedule: Mon/Wed/Fri at 7 PM EST! Follow and turn on notifications!',
      userlevel: 'everyone',
      cooldown: 5,
    },
    {
      trigger: 'rules',
      response: 'Chat rules: Be respectful, no self-promo, listen to mods, and have a good time!',
      userlevel: 'everyone',
      cooldown: 5,
    },
    {
      trigger: 'uptime',
      response: '{channel} has been live for {uptime}',
      userlevel: 'everyone',
      cooldown: 5,
    },
    {
      trigger: 'game',
      response: '{channel} is currently playing {game}',
      userlevel: 'everyone',
      cooldown: 5,
    },
    {
      trigger: 'title',
      response: 'Current stream title: {title}',
      userlevel: 'everyone',
      cooldown: 5,
    },
    {
      trigger: 'followage',
      response: '{target} has been following {channel} for {followage}',
      userlevel: 'everyone',
      cooldown: 5,
    },
  ];

  for (const def of defaults) {
    upsertCommand(channelId, def);
  }
}
