import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

export * from './connection.js';
export * from './crypto.js';
export * from './botRepo.js';
export * from './channelRepo.js';
export * from './commandRepo.js';
export * from './moderationRepo.js';
export * from './managerRepo.js';
export * from './builtinRepo.js';
export * from './timerRepo.js';
export * from './raidRepo.js';
export * from './shoutoutRepo.js';
export * from './autoShoutoutRepo.js';
export * from './alertRepo.js';
export * from './redemptionRepo.js';
export * from './sessionRepo.js';
export * from './streamRepo.js';

import { getBotAccount, setBotAccount } from './botRepo.js';
import { upsertChannel } from './channelRepo.js';
import { upsertCommand } from './commandRepo.js';
import { updateModerationSettings } from './moderationRepo.js';
import { addManager } from './managerRepo.js';

/**
 * Automatically migrate legacy JSON files (store.json, tokens.json) into SQLite.
 */
export function migrateLegacyJson() {
  const storeJsonPath = path.join(rootDir, 'data', 'store.json');
  const tokensJsonPath = path.join(rootDir, 'tokens.json');

  // 1. Try data/store.json first
  if (fs.existsSync(storeJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(storeJsonPath, 'utf-8'));
      if (data.bot && !getBotAccount()) {
        console.log('[SQLite Migration] Migrating central bot account from store.json...');
        setBotAccount({
          userId: data.bot.userId,
          login: data.bot.login,
          displayName: data.bot.displayName,
          avatar: data.bot.avatar,
          accessToken: data.bot.accessToken,
          refreshToken: data.bot.refreshToken,
          expiresAt: data.bot.expiresAt,
        });
      }

      if (data.channels && typeof data.channels === 'object') {
        for (const [id, ch] of Object.entries(data.channels)) {
          console.log(`[SQLite Migration] Migrating channel #${ch.login || id}...`);
          upsertChannel({
            id,
            login: ch.login,
            displayName: ch.displayName,
            avatar: ch.avatar,
            joined: ch.joined,
            prefix: ch.prefix,
            accessToken: ch.broadcasterToken?.accessToken,
            refreshToken: ch.broadcasterToken?.refreshToken,
            expiresAt: ch.broadcasterToken?.expiresAt,
          });

          // Migrate custom commands
          if (Array.isArray(ch.commands)) {
            for (const cmd of ch.commands) {
              upsertCommand(id, cmd);
            }
          }

          // Migrate moderation
          if (ch.moderation) {
            updateModerationSettings(id, ch.moderation);
          }

          // Migrate managers
          if (Array.isArray(ch.managers)) {
            for (const m of ch.managers) {
              addManager(id, m);
            }
          }
        }
      }

      // Rename store.json so we don't re-run migration every time
      fs.renameSync(storeJsonPath, `${storeJsonPath}.migrated`);
      console.log('[SQLite Migration] Successfully migrated store.json into encrypted SQLite database.');
    } catch (err) {
      console.warn('[SQLite Migration] Error migrating store.json:', err.message);
    }
  }

  // 2. Try tokens.json if central bot is still not set
  if (!getBotAccount() && fs.existsSync(tokensJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(tokensJsonPath, 'utf-8'));
      if (data.bot) {
        console.log('[SQLite Migration] Migrating central bot from tokens.json...');
        setBotAccount({
          userId: data.bot.userId,
          login: data.bot.login,
          displayName: data.bot.displayName,
          accessToken: data.bot.accessToken,
          refreshToken: data.bot.refreshToken,
          expiresAt: data.bot.expiresAt,
        });
      }
    } catch (err) {
      console.warn('[SQLite Migration] Error migrating tokens.json:', err.message);
    }
  }
}
