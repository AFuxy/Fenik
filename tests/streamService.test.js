import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { clearDatabase, cleanupTestDb } from './setup.js';
import { createServer } from '../src/server.js';
import { createSession, upsertChannel } from '../src/db/index.js';
import { getStreamSettings, updateStreamSettings } from '../src/db/streamRepo.js';
import {
  getFfmpegInfo,
  ensureMediaDir,
  ensureDefaultShowcase,
  getActiveMediaInfo,
  getStreamStatus,
  saveUploadedMedia,
  stopStream,
  hasAudioStream,
  prepareVideoLoop,
} from '../src/services/streamService.js';
import { updateChannelBroadcast, resolveTwitchCategory } from '../src/services/twitchApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testMediaDir = path.resolve(__dirname, '../media/stream');

describe('24/7 Live Stream Showcase & Linux FFmpeg Service', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createServer();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    stopStream();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    cleanupTestDb();
  });

  beforeEach(() => {
    clearDatabase();
    stopStream();
  });

  describe('FFmpeg Discovery & Linux Zero-Config Diagnostics', () => {
    it('should detect FFmpeg binary (ffmpeg-static or system PATH)', () => {
      const info = getFfmpegInfo();
      assert.ok(info !== null && typeof info === 'object');
      assert.ok('available' in info);
      assert.ok('path' in info);
      assert.ok('source' in info);

      if (info.available) {
        assert.ok(info.path);
        assert.ok(fs.existsSync(info.path), `FFmpeg path ${info.path} must exist`);
        assert.ok(
          info.source.includes('static') || info.source.includes('PATH') || info.source.includes('env')
        );
      }
    });

    it('should create default promotional showcase card SVG when no media exists', () => {
      const showcasePath = ensureDefaultShowcase();
      assert.ok(fs.existsSync(showcasePath));
      assert.ok(showcasePath.endsWith('.svg') || showcasePath.endsWith('.png'));

      const svgPath = path.join(testMediaDir, 'default_showcase.svg');
      assert.ok(fs.existsSync(svgPath));
      const content = fs.readFileSync(svgPath, 'utf8');
      assert.ok(content.includes('FENIK TWITCH BOT PLATFORM'));
      assert.ok(content.includes('24/7 PRODUCT SHOWCASE'));
      assert.ok(content.includes('viewBox="0 0 1920 1080"'));
    });

    it('should return active media info with human-readable formatting and dimensions', () => {
      const media = getActiveMediaInfo();
      assert.ok(media !== null);
      assert.ok(media.url);
      assert.ok(media.filename);
      assert.ok(media.type === 'image' || media.type === 'video');
      assert.equal(media.width, 1920);
      assert.equal(media.height, 1080);
      assert.ok(media.sizeFormatted);
    });

    it('should return comprehensive stream status with telemetry and masked stream key', () => {
      updateStreamSettings({
        title: 'Test Broadcast Title',
        category: 'Software and Game Development',
        streamKey: 'live_123456789_abcdefsecretkey',
      });

      const status = getStreamStatus();
      assert.equal(status.isLive, false);
      assert.equal(status.streamSettings.title, 'Test Broadcast Title');
      assert.equal(status.streamSettings.category, 'Software and Game Development');
      assert.equal(status.streamSettings.bitrate, 5000);
      assert.equal(status.streamSettings.streamKeyConfigured, true);
      assert.ok(status.streamSettings.streamKeyMasked.startsWith('live'));
      assert.ok(status.streamSettings.streamKeyMasked.endsWith('tkey'));
      assert.ok(status.streamSettings.streamKeyMasked.includes('••••••••'));
      // Never leak unmasked stream key in status
      assert.equal(JSON.stringify(status).includes('abcdefsecretkey'), false);
    });

    it('should save uploaded image, update stream settings, and serve from /media static router', async () => {
      // 1x1 transparent PNG Base64
      const samplePngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const media = await saveUploadedMedia({
        filename: 'custom_banner.png',
        buffer: samplePngBuffer,
      });

      assert.ok(media);
      assert.ok(fs.existsSync(path.join(testMediaDir, 'current_showcase.png')));

      // Test serving from express /media route
      const res = await fetch(`${baseUrl}${media.url}`);
      assert.equal(res.status, 200);
      const contentType = res.headers.get('content-type');
      assert.ok(contentType.includes('video/mp4') || contentType.includes('image/png'));
    });

    it('should ignore and delete 0-byte corrupt files and never select them as activeMedia', () => {
      const corruptPath = path.join(testMediaDir, 'showcase_loop.mp4');
      fs.writeFileSync(corruptPath, Buffer.alloc(0));
      assert.ok(fs.existsSync(corruptPath));
      assert.equal(fs.statSync(corruptPath).size, 0);

      const media = getActiveMediaInfo();
      assert.ok(media);
      assert.notEqual(media.filename, 'showcase_loop.mp4');
      // Corrupt 0-byte file must be purged automatically
      assert.equal(fs.existsSync(corruptPath), false);
    });

    it('should handle RangeNotSatisfiable (HTTP 416) gracefully without crashing with 500', async () => {
      // Send unsatisfiable range request on static asset (e.g. bytes=99999999-)
      const res = await fetch(`${baseUrl}/media/stream/default_showcase.svg`, {
        headers: { Range: 'bytes=99999999-100000000' },
      });
      assert.equal(res.status, 416);
      assert.ok(res.headers.get('content-range'));
      const body = await res.text();
      assert.ok(body.includes('Range Not Satisfiable'));
    });

    it('should correctly detect audio presence via hasAudioStream', () => {
      const ffmpeg = getFfmpegInfo();
      if (!ffmpeg.available) return;

      // An image or non-existent file has no audio stream
      assert.equal(hasAudioStream(path.join(testMediaDir, 'default_showcase.png'), ffmpeg.path), false);
      assert.equal(hasAudioStream('nonexistent.mp4', ffmpeg.path), false);

      // If current_showcase.mp4 exists, test audio detection
      const showcaseVid = path.join(testMediaDir, 'current_showcase.mp4');
      if (fs.existsSync(showcaseVid)) {
        assert.equal(hasAudioStream(showcaseVid, ffmpeg.path), true);
      }
    });

    it('should compile video upload into Twitch-standard H.264 1080p CBR loop MP4', async () => {
      const ffmpeg = getFfmpegInfo();
      if (!ffmpeg.available) return;

      const showcaseVid = path.join(testMediaDir, 'current_showcase.mp4');
      if (!fs.existsSync(showcaseVid)) return;

      const compiled = await prepareVideoLoop(showcaseVid, { bitrate: 5000 });
      assert.ok(fs.existsSync(compiled));
      assert.ok(fs.statSync(compiled).size > 100000);
      assert.ok(compiled.endsWith('showcase_loop.mp4'));
    });
  });

  describe('Stream Control API Routes', () => {
    it('should allow public GET /api/stream/status', async () => {
      const res = await fetch(`${baseUrl}/api/stream/status`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.ok('isLive' in data);
      assert.ok('activeMedia' in data);
      assert.ok('ffmpeg' in data);
      assert.ok('streamSettings' in data);
    });

    it('should reject unauthenticated POST /api/stream/settings with 302/401/403', async () => {
      const res = await fetch(`${baseUrl}/api/stream/settings`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Unauthorized' }),
      });
      // requireAuth redirects to /auth/login (302) or rejects
      assert.ok([302, 401, 403].includes(res.status));
    });

    it('should reject non-admin user POST /api/stream/settings with 403', async () => {
      upsertChannel({
        id: 'regular_user_id',
        login: 'regular_user',
        displayName: 'RegularUser',
      });
      const token = createSession({
        userId: 'regular_user_id',
        login: 'regular_user',
        displayName: 'RegularUser',
      });

      const res = await fetch(`${baseUrl}/api/stream/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${token}`,
        },
        body: JSON.stringify({ title: 'Unauthorized Non-Admin' }),
      });

      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.ok(data.error.includes('Administrator privileges required'));
    });

    it('should allow authorized admin to update stream settings via POST /api/stream/settings', async () => {
      upsertChannel({
        id: 'admin_id_1',
        login: 'afuxy',
        displayName: 'afuxy',
      });
      const token = createSession({
        userId: 'admin_id_1',
        login: 'afuxy',
        displayName: 'afuxy',
      });

      const res = await fetch(`${baseUrl}/api/stream/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${token}`,
        },
        body: JSON.stringify({
          title: '24/7 Twitch Bot Product Showcase',
          category: 'Software and Game Development',
          streamKey: 'live_test_stream_key_123',
          bitrate: 5000,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.equal(data.streamSettings.title, '24/7 Twitch Bot Product Showcase');
      assert.equal(data.streamSettings.category, 'Software and Game Development');
      assert.equal(data.streamSettings.bitrate, 5000);

      const saved = getStreamSettings();
      assert.equal(saved.title, '24/7 Twitch Bot Product Showcase');
      assert.equal(saved.streamKey, 'live_test_stream_key_123');
      assert.equal(saved.bitrate, 5000);
    });

    it('should allow authorized admin to upload media via POST /api/stream/upload', async () => {
      upsertChannel({
        id: 'admin_id_2',
        login: 'afuxy',
        displayName: 'afuxy',
      });
      const token = createSession({
        userId: 'admin_id_2',
        login: 'afuxy',
        displayName: 'afuxy',
      });

      const base64Png =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const res = await fetch(`${baseUrl}/api/stream/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${token}`,
        },
        body: JSON.stringify({
          fileName: 'api_upload_test.png',
          fileData: base64Png,
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
      assert.ok(data.media);
      assert.ok(
        data.media.filename === 'showcase_loop.mp4' || data.media.filename === 'current_showcase.png'
      );
    });

    it('should reject POST /api/stream/start if stream key is not configured', async () => {
      upsertChannel({
        id: 'admin_id_3',
        login: 'afuxy',
        displayName: 'afuxy',
      });
      const token = createSession({
        userId: 'admin_id_3',
        login: 'afuxy',
        displayName: 'afuxy',
      });

      updateStreamSettings({ streamKey: null });

      const res = await fetch(`${baseUrl}/api/stream/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${token}`,
        },
        body: JSON.stringify({ streamKey: '' }),
      });

      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.ok(data.error.includes('Stream Key not configured'));
    });

    it('should handle POST /api/stream/stop cleanly when stream is offline', async () => {
      upsertChannel({
        id: 'admin_id_4',
        login: 'afuxy',
        displayName: 'afuxy',
      });
      const token = createSession({
        userId: 'admin_id_4',
        login: 'afuxy',
        displayName: 'afuxy',
      });

      const res = await fetch(`${baseUrl}/api/stream/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${token}`,
        },
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.ok, true);
    });

    it('should reject unauthenticated POST /api/stream/sync-broadcast with 302/401/403', async () => {
      const res = await fetch(`${baseUrl}/api/stream/sync-broadcast`, {
        method: 'POST',
        redirect: 'manual',
      });
      assert.ok([302, 401, 403].includes(res.status));
    });

    it('should handle POST /api/stream/sync-broadcast cleanly when bot is not authorized', async () => {
      upsertChannel({
        id: 'admin_id_5',
        login: 'afuxy',
        displayName: 'afuxy',
      });
      const token = createSession({
        userId: 'admin_id_5',
        login: 'afuxy',
        displayName: 'afuxy',
      });

      const res = await fetch(`${baseUrl}/api/stream/sync-broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: `session_token=${token}`,
        },
      });

      assert.equal(res.status, 404);
      const data = await res.json();
      assert.equal(data.ok, false);
      assert.ok(data.error.includes('Could not fetch channel broadcast info'));
    });

    it('should handle updateChannelBroadcast cleanly when no bot account is registered', async () => {
      const result = await updateChannelBroadcast({
        title: 'Test Title',
        category: 'Software and Game Development',
      });
      assert.equal(result.ok, false);
      assert.ok(result.error);
    });

    it('should handle resolveTwitchCategory with numeric ID directly without failing', async () => {
      const result = await resolveTwitchCategory('1469308723');
      assert.ok(result);
      assert.equal(result.id, '1469308723');
    });
  });
});
