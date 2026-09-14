import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env
dotenv.config({ path: path.join(rootDir, '.env') });

const port = parseInt(process.env.PORT || '3000', 10);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const secret = process.env.SESSION_SECRET || 'companion-secret-key-twitch-bot-2026';

// Derive 32-byte encryption key for database token encryption
const encryptionKey = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || secret).digest();

const adminUsers = (process.env.ADMIN_USERS || 'afuxy')
  .split(',')
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean);

export const config = {
  platformName: process.env.PLATFORM_NAME || 'Fenik',
  botName: process.env.BOT_NAME || 'FenikBot',
  clientId: process.env.TWITCH_CLIENT_ID || '',
  clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  port,
  baseUrl,
  redirectUri: process.env.REDIRECT_URI || `${baseUrl}/auth/callback`,
  commandPrefix: process.env.COMMAND_PREFIX || '!',
  productionDomain: process.env.PRODUCTION_DOMAIN || 'fenik.live',
  sessionSecret: secret,
  encryptionKey,
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'local.db'),
  adminUsers,
};

export function isAdmin(user) {
  if (!user) return false;
  const login = String(user.login || '').toLowerCase();
  const userId = String(user.userId || user.id || '');
  return config.adminUsers.includes(login) || config.adminUsers.includes(userId);
}
