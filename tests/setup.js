import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Point to dedicated test database in tmp directory to prevent touching production DB
const testDbPath = path.join(os.tmpdir(), `fuxybot_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
process.env.DB_PATH = testDbPath;

// Import db connection after setting DB_PATH
const { db, initDb } = await import('../src/db/connection.js');
initDb();

export { db };

export function clearDatabase() {
  db.exec(`
    DELETE FROM commands;
    DELETE FROM channel_disabled_builtins;
    DELETE FROM channel_managers;
    DELETE FROM moderation_settings;
    DELETE FROM channels;
    DELETE FROM bot_account;
    DELETE FROM sessions;
  `);
}

export function cleanupTestDb() {
  try {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      fs.unlinkSync(`${testDbPath}-wal`);
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      fs.unlinkSync(`${testDbPath}-shm`);
    }
  } catch (err) {
    // Ignore cleanup errors
  }
}
