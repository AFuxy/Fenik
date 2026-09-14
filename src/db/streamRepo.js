import { db } from './connection.js';
import { encrypt, decrypt } from './crypto.js';

export function getStreamSettings() {
  const row = db.prepare(`
    SELECT * FROM stream_settings WHERE id = 'default'
  `).get();

  if (!row) {
    return {
      streamKey: '',
      title: '⚡ Fenik Twitch Bot • Live Demo & Showcase • Type !help in chat',
      category: 'Software and Game Development',
      ingestServer: 'rtmp://live.twitch.tv/app',
      activeFile: 'showcase_loop.mp4',
      bitrate: 5000,
      isLive: false,
    };
  }

  return {
    streamKey: row.stream_key ? decrypt(row.stream_key) : '',
    title: row.title || '⚡ Fenik Twitch Bot • Live Demo & Showcase • Type !help in chat',
    category: row.category || 'Software and Game Development',
    ingestServer: row.ingest_server || 'rtmp://live.twitch.tv/app',
    activeFile: row.active_file || 'showcase_loop.mp4',
    bitrate: row.bitrate !== undefined && row.bitrate !== null ? Number(row.bitrate) : 5000,
    isLive: Boolean(row.is_live),
  };
}

export function updateStreamSettings(settings) {
  const current = getStreamSettings();
  const now = Date.now();

  const updateKey = settings.streamKey !== undefined;
  const rawKey = updateKey ? settings.streamKey : current.streamKey;
  const encKey = rawKey ? encrypt(rawKey) : null;

  const stmt = db.prepare(`
    INSERT INTO stream_settings (id, stream_key, title, category, ingest_server, active_file, bitrate, is_live, updated_at)
    VALUES ('default', @streamKey, @title, @category, @ingestServer, @activeFile, @bitrate, @isLive, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      stream_key = CASE WHEN @updateKey = 1 THEN excluded.stream_key ELSE stream_settings.stream_key END,
      title = excluded.title,
      category = excluded.category,
      ingest_server = excluded.ingest_server,
      active_file = excluded.active_file,
      bitrate = excluded.bitrate,
      is_live = excluded.is_live,
      updated_at = excluded.updated_at
  `);

  stmt.run({
    streamKey: encKey,
    updateKey: updateKey ? 1 : 0,
    title: settings.title !== undefined ? settings.title : current.title,
    category: settings.category !== undefined ? settings.category : current.category,
    ingestServer: settings.ingestServer || current.ingestServer || 'rtmp://live.twitch.tv/app',
    activeFile: settings.activeFile || current.activeFile || 'showcase_loop.mp4',
    bitrate: settings.bitrate !== undefined ? Number(settings.bitrate) : (current.bitrate || 5000),
    isLive: settings.isLive !== undefined ? (settings.isLive ? 1 : 0) : (current.isLive ? 1 : 0),
    updatedAt: now,
  });

  return getStreamSettings();
}
