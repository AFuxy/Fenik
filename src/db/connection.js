import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

// Ensure data directory exists
const dataDir = path.dirname(config.dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(config.dbPath);

// Enable WAL mode for high performance and concurrency, and enable foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Initialize SQLite database tables.
 */
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_account (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      joined INTEGER NOT NULL DEFAULT 1,
      prefix TEXT NOT NULL DEFAULT '!',
      access_token TEXT,
      refresh_token TEXT,
      expires_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      trigger TEXT NOT NULL,
      response TEXT NOT NULL,
      userlevel TEXT NOT NULL DEFAULT 'everyone',
      cooldown INTEGER NOT NULL DEFAULT 5,
      counter INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(channel_id, trigger)
    );

    CREATE TABLE IF NOT EXISTS moderation_settings (
      channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
      filter_links INTEGER NOT NULL DEFAULT 0,
      filter_caps INTEGER NOT NULL DEFAULT 0,
      banned_words TEXT NOT NULL DEFAULT '[]',
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_managers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      user_id TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(channel_id, username)
    );

    CREATE TABLE IF NOT EXISTS channel_disabled_builtins (
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      command TEXT NOT NULL,
      disabled_at INTEGER NOT NULL,
      PRIMARY KEY (channel_id, command)
    );

    CREATE TABLE IF NOT EXISTS timers (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      interval_minutes INTEGER NOT NULL DEFAULT 15,
      min_chat_lines INTEGER NOT NULL DEFAULT 3,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raid_settings (
      channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1,
      min_viewers INTEGER NOT NULL DEFAULT 1,
      message TEXT NOT NULL DEFAULT 'Huge raid welcome to @{raider} and their {viewers} raiders! They were last streaming {game}. Show them some love at {url} <3',
      cooldown_minutes INTEGER NOT NULL DEFAULT 30,
      send_twitch_shoutout INTEGER NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shoutout_settings (
      channel_id TEXT PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 1,
      message TEXT NOT NULL DEFAULT 'Shoutout to @{target}! Check them out over at {url} - they were last streaming {game}! Give them a follow! <3',
      auto_on_raid INTEGER NOT NULL DEFAULT 1,
      send_twitch_shoutout INTEGER NOT NULL DEFAULT 1,
      userlevel TEXT NOT NULL DEFAULT 'mod',
      cooldown_seconds INTEGER NOT NULL DEFAULT 15,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auto_shoutouts (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      target_login TEXT NOT NULL,
      target_user_id TEXT,
      target_display_name TEXT,
      target_avatar TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_shouted_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE(channel_id, target_login)
    );

    CREATE INDEX IF NOT EXISTS idx_auto_shoutouts_channel ON auto_shoutouts(channel_id);

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      login TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);

  // Safe migrations for channel_managers rich profile metadata
  try { db.prepare('ALTER TABLE channel_managers ADD COLUMN display_name TEXT').run(); } catch (_) {}
  try { db.prepare('ALTER TABLE channel_managers ADD COLUMN avatar_url TEXT').run(); } catch (_) {}
  try { db.prepare('ALTER TABLE channel_managers ADD COLUMN user_id TEXT').run(); } catch (_) {}
}

// Automatically initialize schema on module load
initDb();
