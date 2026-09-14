import { config } from './config.js';
import {
  migrateLegacyJson,
  getBotAccount,
  getActiveChannels,
  db,
} from './db/index.js';
import { createServer } from './server.js';
import { startEventSub, stopEventSub } from './services/eventSub.js';
import { startTimerService, stopTimerService } from './services/timerService.js';
import { getAppAccessToken } from './services/twitchApi.js';

async function main() {
  console.log('====================================================');
  console.log(`       [${config.botName}] Universal Twitch Bot Server`);
  console.log('   Secure SQLite • Modular Architecture • EventSub');
  console.log('====================================================\n');

  // 1. Run legacy data migration to encrypted SQLite if needed
  migrateLegacyJson();

  // 2. Start Modular HTTP Server
  const app = createServer();
  app.listen(config.port, () => {
    console.log(`[Web] Server online and listening at:`);
    console.log(`  http://localhost:${config.port}`);
    console.log(`  Interim public domain configured: https://${config.productionDomain}\n`);
  });

  // 3. Verify Twitch Application Credentials
  if (!config.clientId || !config.clientSecret) {
    console.warn('[Config] TWITCH_CLIENT_ID or TWITCH_CLIENT_SECRET not configured in .env');
    return;
  }

  try {
    await getAppAccessToken();
    console.log('[Twitch] Helix App Access Token active.');
  } catch (err) {
    console.error('[Twitch] Failed to get App Access Token:', err.message);
  }

  // 4. Verify Bot Account and Start EventSub
  const bot = getBotAccount();
  const activeChannels = getActiveChannels();

  if (bot) {
    console.log(`[Central Bot] Account: @${bot.displayName} (ID: ${bot.userId})`);
    console.log(`[Channels]    ${activeChannels.length} active channel(s) connected in local.db`);

    // Start EventSub WebSocket listener
    startEventSub();

    // Start background chat timers service
    startTimerService();
  } else {
    console.log('[Notice] Central bot account not linked yet.');
    console.log(`  Visit http://localhost:${config.port}/admin to link the central bot account once.\n`);
  }
}

// Graceful shutdown
function shutdown() {
  console.log('\n[Bot] Shutting down gracefully...');
  stopEventSub();
  stopTimerService();
  try {
    db.close();
  } catch {}
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('Fatal startup error:', err);
});
