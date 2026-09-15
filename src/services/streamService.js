import fs from 'fs';
import path from 'path';
import { spawn, spawnSync, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { getStreamSettings, updateStreamSettings } from '../db/streamRepo.js';
import { getBotAccount } from '../db/botRepo.js';
import { getBotStreamKey } from './twitchApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const streamMediaDir = path.join(rootDir, 'media', 'stream');

// In-memory stream process state
let ffmpegProcess = null;
let isHotReloading = false;
let isStopping = false;
const recentStderrLines = [];
const MAX_STDERR_LINES = 25;

let streamState = {
  isLive: false,
  startedAt: null,
  pid: null,
  fps: 0,
  bitrate: '0 kbps',
  speed: '1.0x',
  lastError: null,
  autoRestartAttempts: 0,
};

/**
 * Detect FFmpeg binary availability with automatic static fallback.
 * Checks:
 * 1. process.env.FFMPEG_PATH
 * 2. npm static binary (ffmpeg-static)
 * 3. System PATH (which/where ffmpeg)
 */
export function getFfmpegInfo() {
  // 1. Environment override
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return {
      available: true,
      path: process.env.FFMPEG_PATH,
      source: 'env (FFMPEG_PATH)',
    };
  }

  // 2. System PATH check (Preferred: uses native OS compiled binary with system codecs)
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const out = execSync(cmd, { stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim().split('\n')[0].trim();
    if (out && fs.existsSync(out)) {
      return {
        available: true,
        path: out,
        source: 'system (PATH)',
      };
    }
  } catch (_) {}

  // 3. npm static binary fallback (ffmpeg-static)
  try {
    const staticPath = path.join(
      rootDir,
      'node_modules',
      'ffmpeg-static',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
    );
    if (fs.existsSync(staticPath)) {
      if (process.platform !== 'win32') {
        try { fs.chmodSync(staticPath, 0o755); } catch (_) {}
      }
      return {
        available: true,
        path: staticPath,
        source: 'static (ffmpeg-static)',
      };
    }
  } catch (_) {}

  return {
    available: false,
    path: null,
    source: 'none',
  };
}

/**
 * Ensure media/stream storage directory exists.
 */
export function ensureMediaDir() {
  if (!fs.existsSync(streamMediaDir)) {
    fs.mkdirSync(streamMediaDir, { recursive: true });
  }
  return streamMediaDir;
}

/**
 * Generates the default promotional showcase SVG/PNG if no custom asset has been uploaded.
 */
export function ensureDefaultShowcase() {
  ensureMediaDir();
  const defaultSvgPath = path.join(streamMediaDir, 'default_showcase.svg');
  const defaultPngPath = path.join(streamMediaDir, 'default_showcase.png');

  if (fs.existsSync(defaultPngPath)) {
    return defaultPngPath;
  }

  // High-resolution 1920x1080 promotional card in Dark Neo-Kinpaku aesthetic
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="50%" r="65%">
      <stop offset="0%" stop-color="#14141b"/>
      <stop offset="100%" stop-color="#09090c"/>
    </radialGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8e7a2"/>
      <stop offset="50%" stop-color="#d4af37"/>
      <stop offset="100%" stop-color="#aa851d"/>
    </linearGradient>
    <linearGradient id="patinaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3ddbd9"/>
      <stop offset="100%" stop-color="#1c7c7a"/>
    </linearGradient>
    <filter id="cardGlow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="30" flood-color="#000" flood-opacity="0.8"/>
    </filter>
  </defs>

  <!-- Deep Lacquer Black Background -->
  <rect width="1920" height="1080" fill="url(#bgGrad)"/>

  <!-- Subtle Geometric Grid Lines -->
  <line x1="0" y1="120" x2="1920" y2="120" stroke="#d4af37" stroke-opacity="0.1" stroke-width="1"/>
  <line x1="0" y1="960" x2="1920" y2="960" stroke="#d4af37" stroke-opacity="0.1" stroke-width="1"/>
  <line x1="160" y1="0" x2="160" y2="1080" stroke="#d4af37" stroke-opacity="0.06" stroke-width="1"/>
  <line x1="1760" y1="0" x2="1760" y2="1080" stroke="#d4af37" stroke-opacity="0.06" stroke-width="1"/>

  <!-- Header Branding Badge -->
  <g transform="translate(180, 80)">
    <rect width="280" height="42" rx="6" fill="#1b1b22" stroke="#d4af37" stroke-opacity="0.3"/>
    <circle cx="24" cy="21" r="6" fill="#3ddbd9"/>
    <text x="40" y="27" font-family="'Segoe UI', -apple-system, sans-serif" font-size="16" font-weight="700" fill="#3ddbd9" letter-spacing="1.5">24/7 PRODUCT SHOWCASE</text>
  </g>

  <!-- Main Headline -->
  <text x="180" y="210" font-family="'Segoe UI', -apple-system, sans-serif" font-size="64" font-weight="800" fill="url(#goldGrad)" letter-spacing="-1">
    FENIK TWITCH BOT PLATFORM
  </text>
  <text x="180" y="265" font-family="'Segoe UI', -apple-system, sans-serif" font-size="28" font-weight="500" fill="#f3ebd7" opacity="0.85">
    The Universal Chat Automation &amp; Moderation Suite • Powered by @FenikBot
  </text>

  <!-- 4 Feature Cards Grid -->
  <!-- Card 1: Custom Commands -->
  <g transform="translate(180, 320)" filter="url(#cardGlow)">
    <rect width="740" height="240" rx="12" fill="#131319" stroke="#d4af37" stroke-opacity="0.25" stroke-width="1.5"/>
    <circle cx="60" cy="60" r="26" fill="#1e1e28"/>
    <text x="50" y="69" font-size="26">⚡</text>
    <text x="105" y="68" font-family="'Segoe UI', sans-serif" font-size="24" font-weight="700" fill="#f3ebd7">Ultra-Fast Custom Commands</text>
    <text x="60" y="125" font-family="'Segoe UI', sans-serif" font-size="18" fill="#a0a0b2" width="620">
      Dynamic variables: {user}, {touser}, {followage}, {random}, {count}. Shared command aliases and permission tiers (everyone, sub, mod, broadcaster).
    </text>
    <rect x="60" y="165" width="220" height="34" rx="4" fill="#0d0d12" stroke="#d4af37" stroke-opacity="0.2"/>
    <text x="75" y="188" font-family="'Consolas', monospace" font-size="15" fill="#d4af37">Try: !help • !ping • !uptime</text>
  </g>

  <!-- Card 2: Scam Bot & Link Shield -->
  <g transform="translate(1000, 320)" filter="url(#cardGlow)">
    <rect width="740" height="240" rx="12" fill="#131319" stroke="#3ddbd9" stroke-opacity="0.3" stroke-width="1.5"/>
    <circle cx="60" cy="60" r="26" fill="#1e1e28"/>
    <text x="50" y="69" font-size="26">🛡️</text>
    <text x="105" y="68" font-family="'Segoe UI', sans-serif" font-size="24" font-weight="700" fill="#f3ebd7">Autonomous Scam Bot Shield</text>
    <text x="60" y="125" font-family="'Segoe UI', sans-serif" font-size="18" fill="#a0a0b2">
      De-obfuscates text to eliminate fake viewbot promotions (dogviews . com, [dot] ru), unsolicited GFX artist spam, and blacklisted phrases with auto-timeout &amp; ban.
    </text>
    <rect x="60" y="165" width="230" height="34" rx="4" fill="#0d0d12" stroke="#3ddbd9" stroke-opacity="0.3"/>
    <text x="75" y="188" font-family="'Consolas', monospace" font-size="15" fill="#3ddbd9">Auto-Mod &amp; Instant Bans</text>
  </g>

  <!-- Card 3: Stream Alerts & Rewards -->
  <g transform="translate(180, 600)" filter="url(#cardGlow)">
    <rect width="740" height="240" rx="12" fill="#131319" stroke="#d4af37" stroke-opacity="0.25" stroke-width="1.5"/>
    <circle cx="60" cy="60" r="26" fill="#1e1e28"/>
    <text x="50" y="69" font-size="26">🔔</text>
    <text x="105" y="68" font-family="'Segoe UI', sans-serif" font-size="24" font-weight="700" fill="#f3ebd7">Real-Time EventSub Alerts</text>
    <text x="60" y="125" font-family="'Segoe UI', sans-serif" font-size="18" fill="#a0a0b2">
      Instant celebratory chat announcements for new followers, Tier 1/2/3 subscriptions, resub streaks, gift bombs, community raids, and channel point rewards.
    </text>
    <rect x="60" y="165" width="210" height="34" rx="4" fill="#0d0d12" stroke="#d4af37" stroke-opacity="0.2"/>
    <text x="75" y="188" font-family="'Consolas', monospace" font-size="15" fill="#d4af37">Followers • Subs • Raids</text>
  </g>

  <!-- Card 4: Intelligent Chat Timers -->
  <g transform="translate(1000, 600)" filter="url(#cardGlow)">
    <rect width="740" height="240" rx="12" fill="#131319" stroke="#d4af37" stroke-opacity="0.25" stroke-width="1.5"/>
    <circle cx="60" cy="60" r="26" fill="#1e1e28"/>
    <text x="50" y="69" font-size="26">⏱️</text>
    <text x="105" y="68" font-family="'Segoe UI', sans-serif" font-size="24" font-weight="700" fill="#f3ebd7">Smart Activity-Gated Timers</text>
    <text x="60" y="125" font-family="'Segoe UI', sans-serif" font-size="18" fill="#a0a0b2">
      Scheduled announcements that respect your stream pace. Only sends when chat is active, completely eliminating annoying empty-chat bot spam.
    </text>
    <rect x="60" y="165" width="240" height="34" rx="4" fill="#0d0d12" stroke="#d4af37" stroke-opacity="0.2"/>
    <text x="75" y="188" font-family="'Consolas', monospace" font-size="15" fill="#d4af37">Chat-Line Activity Gating</text>
  </g>

  <!-- Bottom CTA Footer Bar -->
  <g transform="translate(180, 880)">
    <rect width="1560" height="90" rx="10" fill="#16161e" stroke="#d4af37" stroke-opacity="0.4" stroke-width="2"/>
    <text x="40" y="55" font-family="'Segoe UI', sans-serif" font-size="26" font-weight="700" fill="#f3ebd7">
      👉 Try typing <tspan fill="#d4af37">!help</tspan>, <tspan fill="#d4af37">!ping</tspan>, or <tspan fill="#d4af37">!uptime</tspan> in chat right now!
    </text>
    <g transform="translate(1120, 22)">
      <rect width="400" height="46" rx="6" fill="url(#goldGrad)"/>
      <text x="200" y="30" font-family="'Segoe UI', sans-serif" font-size="18" font-weight="800" fill="#0d0d11" text-anchor="middle">GET STARTED AT FENIK.LIVE</text>
    </g>
  </g>
</svg>`;

  fs.writeFileSync(defaultSvgPath, svgContent);

  // If FFmpeg is available, convert SVG to standard PNG or generate clean 1080p canvas PNG
  const ffmpeg = getFfmpegInfo();
  if (ffmpeg.available) {
    try {
      const res = spawnSync(ffmpeg.path, ['-y', '-i', defaultSvgPath, defaultPngPath], { stdio: 'ignore' });
      if (res.status === 0 && fs.existsSync(defaultPngPath) && fs.statSync(defaultPngPath).size > 0) {
        return defaultPngPath;
      }
    } catch (_) {}

    try {
      const res = spawnSync(ffmpeg.path, [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=0x0d0d11:s=1920x1080',
        '-frames:v', '1',
        defaultPngPath,
      ], { stdio: 'ignore' });
      if (res.status === 0 && fs.existsSync(defaultPngPath) && fs.statSync(defaultPngPath).size > 0) {
        return defaultPngPath;
      }
    } catch (_) {}
  }

  return defaultSvgPath;
}

/**
 * Returns the currently active media asset for broadcasting.
 */
export function getActiveMediaInfo() {
  ensureMediaDir();
  const settings = getStreamSettings();

  const candidates = [
    settings.activeFile,
    'current_showcase.mp4',
    'current_showcase.webm',
    'current_showcase.png',
    'current_showcase.jpg',
    'showcase_loop.mp4',
    'default_showcase.png',
    'default_showcase.svg',
  ];

  for (let filename of candidates) {
    if (!filename) continue;

    // FFmpeg static cannot decode SVGs without librsvg, so transparently route SVG to PNG
    if (filename.toLowerCase().endsWith('.svg')) {
      const fallbackPng = path.join(streamMediaDir, 'default_showcase.png');
      if (fs.existsSync(fallbackPng) && fs.statSync(fallbackPng).size > 0) {
        filename = 'default_showcase.png';
      }
    }

    const fullPath = path.join(streamMediaDir, filename);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      if (stats.size === 0) {
        try { fs.unlinkSync(fullPath); } catch (_) {}
        continue;
      }
      const ext = path.extname(filename).toLowerCase();
      const isVideo = ['.mp4', '.webm', '.mkv'].includes(ext);
      return {
        filename,
        fullPath,
        url: `/media/stream/${filename}`,
        isVideo,
        type: isVideo ? 'video' : 'image',
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        width: 1920,
        height: 1080,
        modifiedAt: stats.mtimeMs,
        exists: true,
      };
    }
  }

  // Generate default if not present
  const defaultFile = ensureDefaultShowcase();
  const ext = path.extname(defaultFile).toLowerCase();
  const stats = fs.existsSync(defaultFile) ? fs.statSync(defaultFile) : { size: 1024, mtimeMs: Date.now() };
  return {
    filename: path.basename(defaultFile),
    fullPath: defaultFile,
    url: `/media/stream/${path.basename(defaultFile)}`,
    isVideo: false,
    type: 'image',
    size: stats.size,
    sizeFormatted: formatBytes(stats.size),
    width: 1920,
    height: 1080,
    modifiedAt: stats.mtimeMs,
    exists: true,
  };
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Detect whether a media file has an audio track using FFmpeg.
 */
export function hasAudioStream(filePath, ffmpegPath) {
  try {
    const res = spawnSync(ffmpegPath, ['-i', filePath], { encoding: 'utf8' });
    return /Stream #.*: Audio:/i.test(res.stderr || '');
  } catch (_) {
    return false;
  }
}

/**
 * Compiles an image or video into a Twitch-compliant H.264 CBR loop MP4.
 * Once pre-rendered, streaming runs at 0.0% CPU via '-c copy'.
 * Standardizes resolution to 1920x1080 (letterboxing if needed), CFR 30fps,
 * 2-second GOP (60 frames), and stereo AAC audio.
 */
export async function prepareVideoLoop(inputPath, options = {}) {
  const ffmpeg = getFfmpegInfo();
  if (!ffmpeg.available) {
    throw new Error('FFmpeg binary not found. Please install FFmpeg or ffmpeg-static.');
  }

  ensureMediaDir();
  const outputPath = path.join(streamMediaDir, 'showcase_loop.mp4');
  const tempOutputPath = path.join(streamMediaDir, 'showcase_loop_tmp.mp4');
  const ext = path.extname(inputPath).toLowerCase();
  const isVideo = ['.mp4', '.webm', '.mkv', '.mov', '.avi'].includes(ext);
  const settings = getStreamSettings();
  const bitrate = options.bitrate || settings.bitrate || 5000;

  return new Promise((resolve, reject) => {
    let args = [];
    if (isVideo) {
      // Normalize video to Twitch standard:
      // Canvas: 1920x1080 (letterbox padded preserving aspect ratio)
      // Video Codec: H.264 High profile, CFR 30 fps, 2-second keyframes (GOP 60)
      // Rate Control: Twitch-compliant CBR at specified bitrate
      // Audio: Stereo AAC 128 kbps 44.1 kHz (or silent lavfi audio if source has no sound)
      const hasAudio = hasAudioStream(inputPath, ffmpeg.path);
      if (hasAudio) {
        args = [
          '-y',
          '-i', inputPath,
          '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-r', '30',
          '-g', '60',
          '-b:v', `${bitrate}k`,
          '-minrate', `${bitrate}k`,
          '-maxrate', `${bitrate}k`,
          '-bufsize', `${bitrate * 2}k`,
          '-nal-hrd', 'cbr',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-ar', '44100',
          '-ac', '2',
          tempOutputPath,
        ];
      } else {
        args = [
          '-y',
          '-i', inputPath,
          '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-r', '30',
          '-g', '60',
          '-b:v', `${bitrate}k`,
          '-minrate', `${bitrate}k`,
          '-maxrate', `${bitrate}k`,
          '-bufsize', `${bitrate * 2}k`,
          '-nal-hrd', 'cbr',
          '-c:a', 'aac',
          '-b:a', '128k',
          '-shortest',
          tempOutputPath,
        ];
      }
    } else {
      // Static image converted to 60-second silent loop MP4 with 1920x1080 canvas scaling
      // Uses Twitch-compliant CBR (Constant Bitrate) with strict buffer size and NAL HRD
      args = [
        '-y',
        '-loop', '1',
        '-i', inputPath,
        '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
        '-t', '60',
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p',
        '-c:v', 'libx264',
        '-tune', 'stillimage',
        '-preset', 'ultrafast',
        '-r', '30',
        '-g', '60',
        '-b:v', `${bitrate}k`,
        '-minrate', `${bitrate}k`,
        '-maxrate', `${bitrate}k`,
        '-bufsize', `${bitrate * 2}k`,
        '-nal-hrd', 'cbr',
        '-c:a', 'aac',
        '-b:a', '128k',
        tempOutputPath,
      ];
    }

    const compileStderr = [];
    const proc = spawn(ffmpeg.path, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    proc.stderr.on('data', (d) => {
      const txt = d.toString();
      compileStderr.push(txt);
      if (compileStderr.length > 20) compileStderr.shift();
    });

    proc.on('close', (code) => {
      const exists = fs.existsSync(tempOutputPath);
      const size = exists ? fs.statSync(tempOutputPath).size : 0;
      if (code === 0 && exists && size > 0) {
        try {
          fs.renameSync(tempOutputPath, outputPath);
        } catch (_) {
          fs.copyFileSync(tempOutputPath, outputPath);
          try { fs.unlinkSync(tempOutputPath); } catch (_) {}
        }
        resolve(outputPath);
      } else {
        if (exists) {
          try { fs.unlinkSync(tempOutputPath); } catch (_) {}
        }
        const errDetail = compileStderr.join('\n').slice(-500);
        reject(new Error(`Failed to compile stream loop (code ${code}): ${errDetail || 'Unknown error'}`));
      }
    });
    proc.on('error', (err) => {
      if (fs.existsSync(tempOutputPath)) {
        try { fs.unlinkSync(tempOutputPath); } catch (_) {}
      }
      reject(err);
    });
  });
}

/**
 * Recompiles the 60-second showcase loop with the specified or saved bitrate.
 * If currently live, hot-reloads the broadcast stream.
 */
export async function recompileVideoLoop(options = {}) {
  // Find primary source asset (excluding showcase_loop.mp4 to prevent self-referential compile)
  const sourceCandidates = [
    'current_showcase.mp4',
    'current_showcase.webm',
    'current_showcase.png',
    'current_showcase.jpg',
    'current_showcase.webp',
    'default_showcase.png',
    'default_showcase.svg',
  ];
  let sourcePath = null;
  for (const file of sourceCandidates) {
    const full = path.join(streamMediaDir, file);
    if (fs.existsSync(full) && fs.statSync(full).size > 0) {
      sourcePath = full;
      break;
    }
  }
  if (!sourcePath) {
    sourcePath = ensureDefaultShowcase();
  }
  if (sourcePath.toLowerCase().endsWith('.svg')) {
    const fallbackPng = path.join(streamMediaDir, 'default_showcase.png');
    if (fs.existsSync(fallbackPng) && fs.statSync(fallbackPng).size > 0) {
      sourcePath = fallbackPng;
    }
  }

  const outputPath = await prepareVideoLoop(sourcePath, options);
  if (streamState.isLive) {
    await hotReloadStream();
  }
  return outputPath;
}

/**
 * Handle new video/image upload from the dashboard.
 * Supports live hot-reload: if currently streaming, updates the stream on the fly.
 */
export async function saveUploadedMedia({ filename, buffer }) {
  ensureMediaDir();
  const ext = path.extname(filename).toLowerCase();
  const safeName = `current_showcase${ext}`;
  const targetPath = path.join(streamMediaDir, safeName);

  // Remove any obsolete showcase source files from previous uploads with different extensions
  try {
    const existing = fs.readdirSync(streamMediaDir);
    for (const f of existing) {
      if (f.startsWith('current_showcase.') && f !== safeName) {
        try { fs.unlinkSync(path.join(streamMediaDir, f)); } catch (_) {}
      }
    }
  } catch (_) {}

  fs.writeFileSync(targetPath, buffer);

  // Pre-render the 60s loop MP4 for 0% CPU streaming
  try {
    await prepareVideoLoop(targetPath);
    updateStreamSettings({ activeFile: 'showcase_loop.mp4' });
  } catch (err) {
    console.warn('[StreamService] Could not pre-render MP4 loop, using direct source:', err.message);
    updateStreamSettings({ activeFile: safeName });
  }

  // If streaming is currently live, hot-reload the broadcast!
  if (streamState.isLive) {
    hotReloadStream();
  }

  return getActiveMediaInfo();
}

/**
 * Hot-reloads the active stream process seamlessly without dropping the Twitch connection.
 */
export async function hotReloadStream() {
  if (!streamState.isLive || !ffmpegProcess) return;
  console.log('[StreamService] Hot-reloading live stream with newly uploaded asset...');

  const settings = getStreamSettings();
  const streamKey = settings.streamKey;
  if (!streamKey) return;

  isHotReloading = true;

  // Gracefully terminate old process and spawn new stream
  try {
    ffmpegProcess.kill('SIGTERM');
  } catch (_) {}

  setTimeout(() => {
    startStream({ streamKey: settings.streamKey, isHotReload: true })
      .catch((err) => {
        console.error('[StreamService] Hot-reload error:', err.message);
      })
      .finally(() => {
        isHotReloading = false;
      });
  }, 1000);
}

/**
 * Starts broadcasting the showcase loop to Twitch RTMP.
 */
export async function startStream({ streamKey = null, isHotReload = false } = {}) {
  if (streamState.isLive && !isHotReload) {
    return { ok: true, message: 'Stream is already live.' };
  }

  const ffmpeg = getFfmpegInfo();
  if (!ffmpeg.available) {
    throw new Error('FFmpeg not detected. Please install FFmpeg or ffmpeg-static.');
  }

  const settings = getStreamSettings();
  let key = streamKey || settings.streamKey;

  // Auto-detect stream key from Twitch Helix if bot has channel:read:stream_key
  if (!key) {
    try {
      key = await getBotStreamKey();
    } catch (_) {}
  }

  if (!key) {
    throw new Error('Twitch Stream Key not configured. Please enter your bot stream key.');
  }

  // Update saved settings if key provided
  if (streamKey && streamKey !== settings.streamKey) {
    updateStreamSettings({ streamKey });
  }

  // Ensure loop video is prepared
  let targetFile = path.join(streamMediaDir, 'showcase_loop.mp4');
  if (!fs.existsSync(targetFile)) {
    const activeMedia = getActiveMediaInfo();
    try {
      await prepareVideoLoop(activeMedia.fullPath);
    } catch (err) {
      console.warn('[StreamService] Fallback to direct streaming:', err.message);
      targetFile = activeMedia.fullPath;
    }
  }

  const ingest = settings.ingestServer || 'rtmp://live.twitch.tv/app';
  const rtmpUrl = `${ingest}/${key.trim()}`;

  // FFmpeg arguments: Mode 1 (-c copy) for 0% CPU streaming!
  const isMp4 = targetFile.endsWith('.mp4');
  let ffmpegArgs = [];

  if (isMp4) {
    ffmpegArgs = [
      '-re',
      '-stream_loop', '-1',
      '-i', targetFile,
      '-c', 'copy',
      '-f', 'flv',
      rtmpUrl,
    ];
  } else {
    const bitrate = settings.bitrate || 5000;
    // Fallback: Direct still image streaming with Twitch CBR
    ffmpegArgs = [
      '-re',
      '-loop', '1',
      '-i', targetFile,
      '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
      '-c:v', 'libx264',
      '-tune', 'stillimage',
      '-preset', 'ultrafast',
      '-pix_fmt', 'yuv420p',
      '-r', '30',
      '-g', '60',
      '-b:v', `${bitrate}k`,
      '-minrate', `${bitrate}k`,
      '-maxrate', `${bitrate}k`,
      '-bufsize', `${bitrate * 2}k`,
      '-nal-hrd', 'cbr',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-f', 'flv',
      rtmpUrl,
    ];
  }

  recentStderrLines.length = 0;
  console.log(`[StreamService] Launching Twitch stream via ${ffmpeg.source}...`);
  ffmpegProcess = spawn(ffmpeg.path, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  streamState.isLive = true;
  streamState.startedAt = Date.now();
  streamState.pid = ffmpegProcess.pid;
  streamState.lastError = null;
  updateStreamSettings({ isLive: true });

  // Parse real-time bitrate & fps from FFmpeg progress output and maintain recent stderr ring buffer
  ffmpegProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      recentStderrLines.push(line);
      if (recentStderrLines.length > MAX_STDERR_LINES) {
        recentStderrLines.shift();
      }
    }

    const fpsMatch = text.match(/fps=\s*([\d.]+)/i);
    const brMatch = text.match(/bitrate=\s*([\d.]+k?bits\/s)/i);
    const speedMatch = text.match(/speed=\s*([\d.]+x)/i);

    if (fpsMatch) streamState.fps = Math.round(parseFloat(fpsMatch[1]));
    if (brMatch) streamState.bitrate = brMatch[1];
    if (speedMatch) streamState.speed = speedMatch[1];
  });

  ffmpegProcess.on('close', (code, signal) => {
    console.log(`[StreamService] FFmpeg exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`);

    if (code !== 0 && recentStderrLines.length > 0) {
      const excerpt = recentStderrLines.slice(-8).join('\n  ');
      console.warn(`[StreamService] FFmpeg stderr excerpt:\n  ${excerpt}`);
      streamState.lastError = `FFmpeg exit ${code ?? signal}: ${recentStderrLines.slice(-2).join('; ')}`;
    }

    const wasDeliberate = isStopping || isHotReloading || !streamState.isLive;

    if (isHotReloading) {
      console.log('[StreamService] Active FFmpeg process exited cleanly for scheduled hot-reload.');
      ffmpegProcess = null;
      return;
    }

    streamState.isLive = false;
    streamState.pid = null;
    ffmpegProcess = null;
    updateStreamSettings({ isLive: false });

    // Auto-reconnect if unexpected drop (up to 5 retries)
    if (!wasDeliberate && code !== 0 && streamState.autoRestartAttempts < 5) {
      streamState.autoRestartAttempts++;
      const delay = Math.min(30000, 3000 * streamState.autoRestartAttempts);
      console.warn(`[StreamService] Stream dropped unexpectedly. Reconnecting in ${delay / 1000}s (attempt ${streamState.autoRestartAttempts}/5)...`);
      setTimeout(() => {
        startStream().catch((e) => console.error('[StreamService] Auto-restart error:', e.message));
      }, delay);
    } else if (code === 0 || wasDeliberate) {
      streamState.autoRestartAttempts = 0;
    }
  });

  ffmpegProcess.on('error', (err) => {
    console.error('[StreamService] FFmpeg process error:', err.message);
    streamState.lastError = err.message;
    streamState.isLive = false;
    updateStreamSettings({ isLive: false });
  });

  return {
    ok: true,
    message: 'Twitch live showcase stream launched.',
    pid: streamState.pid,
  };
}

/**
 * Stops broadcasting.
 */
export function stopStream() {
  if (!streamState.isLive && !ffmpegProcess) {
    return { ok: true, message: 'Stream is not running.' };
  }

  isStopping = true;
  streamState.isLive = false;
  streamState.autoRestartAttempts = 0;
  updateStreamSettings({ isLive: false });

  if (ffmpegProcess) {
    try {
      ffmpegProcess.kill('SIGTERM');
      setTimeout(() => {
        if (ffmpegProcess) {
          try { ffmpegProcess.kill('SIGKILL'); } catch (_) {}
        }
        isStopping = false;
      }, 2000);
    } catch (_) {
      isStopping = false;
    }
  } else {
    isStopping = false;
  }

  return { ok: true, message: 'Stream stopped successfully.' };
}

/**
 * Get comprehensive streaming diagnostic and runtime status.
 */
export function getStreamStatus() {
  const settings = getStreamSettings();
  const ffmpeg = getFfmpegInfo();
  const media = getActiveMediaInfo();

  const uptimeSeconds = streamState.isLive && streamState.startedAt
    ? Math.floor((Date.now() - streamState.startedAt) / 1000)
    : 0;

  return {
    isLive: streamState.isLive,
    startedAt: streamState.startedAt,
    uptimeSeconds,
    uptimeFormatted: formatUptime(uptimeSeconds),
    fps: streamState.fps,
    bitrate: streamState.bitrate,
    speed: streamState.speed,
    lastError: streamState.lastError,
    activeMedia: media,
    ffmpeg,
    streamSettings: {
      title: settings.title,
      category: settings.category,
      ingestServer: settings.ingestServer,
      bitrate: settings.bitrate || 5000,
      streamKeyConfigured: Boolean(settings.streamKey),
      streamKeyMasked: settings.streamKey ? `${settings.streamKey.slice(0, 4)}••••••••${settings.streamKey.slice(-4)}` : '',
    },
  };
}

function formatUptime(sec) {
  if (!sec || sec <= 0) return '0s';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${s}s`;
  if (mins > 0) return `${mins}m ${s}s`;
  return `${s}s`;
}
