import { config } from '../config.js';
import { renderLayout } from './layout.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderAdminView({
  bot,
  channels = [],
  stats = {},
  streamStatus = null,
  user = null,
  adminAuthKey = null,
  botAuthUrl = null,
  success = null,
  error = null,
}) {
  const activeStream = streamStatus || {
    isLive: false,
    startedAt: null,
    uptimeFormatted: '0s',
    fps: 0,
    bitrate: '0 kbps',
    speed: '1.0x',
    lastError: null,
    activeMedia: {
      url: '/media/stream/default_showcase.svg',
      filename: 'default_showcase.svg',
      type: 'image',
      sizeFormatted: 'Standard SVG',
      width: 1920,
      height: 1080,
    },
    ffmpeg: { available: true, source: 'static (ffmpeg-static)', path: 'Bundled npm binary' },
    streamSettings: {
      title: 'Fenik Universal Twitch Bot • 24/7 Product Showcase & Commands Demo',
      category: 'Software and Game Development',
      ingestServer: 'rtmp://live.twitch.tv/app/',
      streamKeyConfigured: false,
      streamKeyMasked: '',
    },
  };

  const totalChannels = stats.totalChannels ?? channels.length;
  const joinedCount = stats.joinedCount ?? channels.filter((c) => c.joined).length;
  const fullySetupCount = stats.fullySetupCount ?? channels.filter((c) => c.setupState?.isFullySetup).length;
  const moddedCount = stats.moddedCount ?? channels.filter((c) => c.setupState?.isBotMod === true).length;
  const totalCommands = stats.totalCommands ?? channels.reduce((acc, c) => acc + (c.commands?.length || 0), 0);
  const totalTimers = stats.totalTimers ?? channels.reduce((acc, c) => acc + (c.timers?.length || 0), 0);

  const content = `
    <div class="ks-container" style="max-width: 1320px;">
      
      <!-- Floating Toast Notifications Container (Fixed overlay: never pushes content down) -->
      <div class="ks-toast-container" id="ks-toast-container" aria-live="polite" aria-atomic="true">
        ${success ? `
          <div class="ks-toast ks-toast-success" role="status">
            <div class="ks-toast-body">
              <svg class="ks-toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              <div class="ks-toast-text">${escapeHtml(success)}</div>
            </div>
            <button type="button" class="ks-toast-close" aria-label="Dismiss notification">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
            </button>
          </div>
        ` : ''}

        ${error ? `
          <div class="ks-toast ks-toast-error" role="alert">
            <div class="ks-toast-body">
              <svg class="ks-toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
              <div class="ks-toast-text">${escapeHtml(error)}</div>
            </div>
            <button type="button" class="ks-toast-close" aria-label="Dismiss notification">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Host Control Top Header -->
      <header style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 24px;">
        <div>
          <div style="font-family: var(--ks-mono); font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--ks-kinpaku); margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
            <span>Platform Administration & Host Control</span>
          </div>
          <h1 style="font-family: var(--ks-font-display); font-size: 2.2rem; font-weight: 700; color: var(--ks-champagne); letter-spacing: -0.02em; line-height: 1.1;">
            Host Control Center
          </h1>
          <p style="color: var(--ks-text-muted); font-size: 0.88rem; max-width: 680px; margin-top: 6px;">
            Monitor central bot worker health, inspect streamer onboarding status and OAuth permissions, and manage platform channel accounts.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <a href="/dashboard" class="ks-button ks-button-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Streamer Dashboard</span>
          </a>
        </div>
      </header>

      <!-- Platform Health & Metrics Summary Grid -->
      <section style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px;">
        
        <!-- Metric 1: Total Streamers -->
        <div class="ks-card" style="padding: 18px 20px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule);">
          <div style="font-size: 0.74rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); letter-spacing: 0.06em;">Authorized Channels</div>
          <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
            <span style="font-size: 1.85rem; font-weight: 700; font-family: var(--ks-mono); color: var(--ks-champagne);">${totalChannels}</span>
            <span style="font-size: 0.78rem; color: var(--ks-text-faint);">streamers</span>
          </div>
          <div style="font-size: 0.74rem; color: var(--ks-text-muted); margin-top: 4px;">Registered on platform</div>
        </div>

        <!-- Metric 2: Live Chat Presence -->
        <div class="ks-card" style="padding: 18px 20px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule);">
          <div style="font-size: 0.74rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); letter-spacing: 0.06em;">Chat Presence</div>
          <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
            <span style="font-size: 1.85rem; font-weight: 700; font-family: var(--ks-mono); color: var(--ks-patina);">${joinedCount}</span>
            <span style="font-size: 0.78rem; color: var(--ks-text-faint);">/ ${totalChannels} joined</span>
          </div>
          <div style="font-size: 0.74rem; color: var(--ks-patina); margin-top: 4px; display: flex; align-items: center; gap: 4px;">
            <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></span>
            <span>${totalChannels ? Math.round((joinedCount / totalChannels) * 100) : 0}% active chat coverage</span>
          </div>
        </div>

        <!-- Metric 3: Setups Complete -->
        <div class="ks-card" style="padding: 18px 20px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule);">
          <div style="font-size: 0.74rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); letter-spacing: 0.06em;">Setups Complete</div>
          <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
            <span style="font-size: 1.85rem; font-weight: 700; font-family: var(--ks-mono); color: var(--ks-kinpaku);">${fullySetupCount}</span>
            <span style="font-size: 0.78rem; color: var(--ks-text-faint);">/ ${totalChannels} Setups Complete</span>
          </div>
          <div style="font-size: 0.74rem; color: var(--ks-text-muted); margin-top: 4px;">
            ${moddedCount} channels modded via Twitch
          </div>
        </div>

        <!-- Metric 4: Total Workload -->
        <div class="ks-card" style="padding: 18px 20px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule);">
          <div style="font-size: 0.74rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); letter-spacing: 0.06em;">Configured Workload</div>
          <div style="display: flex; align-items: baseline; gap: 8px; margin-top: 6px;">
            <span style="font-size: 1.85rem; font-weight: 700; font-family: var(--ks-mono); color: var(--ks-champagne);">${totalCommands}</span>
            <span style="font-size: 0.78rem; color: var(--ks-text-faint);">cmds · ${totalTimers} timers</span>
          </div>
          <div style="font-size: 0.74rem; color: var(--ks-text-muted); margin-top: 4px;">Active across all channels</div>
        </div>

      </section>

      <!-- Central Bot Worker Account Card -->
      <section class="ks-card" style="margin-bottom: 24px; border-color: ${bot ? 'var(--ks-gold-hairline)' : 'var(--ks-rule)'};">
        <div class="ks-card-header" style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h2 class="ks-card-title">Central Bot Worker Account</h2>
              ${bot ? `
                <span class="ks-live-pill"><span class="ks-dot-live"></span> Active Worker</span>
              ` : `
                <span class="ks-tag ks-tag-vermilion">Offline / Disconnected</span>
              `}
            </div>
            <p class="ks-card-desc">The single shared Twitch account executing chat messages and EventSub listeners for all broadcasters.</p>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${bot ? `
              <button type="button" class="ks-button ks-button-danger" style="min-height: 36px; padding: 0 14px; font-size: 0.82rem;" onclick="openUnlinkBotModal()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <span>Disconnect Bot</span>
              </button>
            ` : ''}
            <button type="button" class="ks-button ks-button-secondary" style="min-height: 36px; padding: 0 14px; font-size: 0.82rem;" onclick="openIncognitoBotModal()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20M7 12a5 5 0 0 1 10 0M12 2v2M4.93 4.93l1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              <span>Authorize via Private Window</span>
            </button>
            <a href="/auth/bot" class="ks-button ks-button-primary" style="min-height: 36px; padding: 0 14px; font-size: 0.82rem;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>${bot ? 'Re-authorize in Current Browser' : 'Authorize Central Bot'}</span>
            </a>
          </div>
        </div>

        <div style="background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); padding: 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <img 
              src="${bot?.avatar || '/default-avatar.svg'}" 
              alt="${escapeHtml(bot?.displayName || config.botName)}"
              onerror="this.onerror=null;this.src='/default-avatar.svg'"
              style="width: 52px; height: 52px; border-radius: 50%; border: 2px solid var(--ks-gold-hairline); object-fit: cover;" 
            />
            <div>
              <div style="font-size: 1.15rem; font-weight: 600; color: var(--ks-champagne);">
                ${bot ? `@${escapeHtml(bot.displayName || bot.login)}` : 'No Bot Account Connected'}
              </div>
              <div style="font-family: var(--ks-mono); font-size: 0.78rem; color: var(--ks-text-muted); margin-top: 2px;">
                ${bot ? `Twitch User ID: ${bot.userId} · Chat Presence: Multi-Channel EventSub WebSocket` : 'Connect a dedicated bot account to enable automated chat responses'}
              </div>
              ${bot?.tokenInfo ? `
                <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Chat & Raids Active</span>
                  ${bot.tokenInfo.scopes?.includes('moderator:read:followers') ? `
                    <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Follower Alerts Scope</span>
                  ` : `
                    <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;" title="Bot needs 'moderator:read:followers' scope. Re-authorize bot to enable.">
                      ⚠ Follower Scope Missing
                    </span>
                  `}
                  ${(bot.tokenInfo.scopes?.includes('moderator:manage:chat_messages') && bot.tokenInfo.scopes?.includes('moderator:manage:banned_users')) ? `
                    <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Moderation &amp; Scam Bot Protection Active</span>
                  ` : `
                    <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;" title="Bot needs 'moderator:manage:chat_messages' and 'moderator:manage:banned_users' scopes to delete spam and ban scam bots. Click 'Re-authorize Bot Account' to update.">
                      ⚠ Moderation Scopes Missing (Re-authorize to enable scam bot bans)
                    </span>
                  `}
                  ${(bot.tokenInfo.scopes?.includes('channel:read:stream_key') && bot.tokenInfo.scopes?.includes('channel:manage:broadcast')) ? `
                    <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ 24/7 Live Stream Showcase Scopes Active</span>
                  ` : `
                    <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;" title="Bot needs 'channel:read:stream_key' and 'channel:manage:broadcast' scopes to auto-detect stream key and update broadcast title. Re-authorize bot to enable.">
                      ⚠ Stream Showcase Scopes Missing (Optional: for auto stream key &amp; title sync)
                    </span>
                  `}
                </div>
              ` : ''}
            </div>
          </div>

          ${bot ? `
            <div style="display: flex; align-items: center; gap: 8px;">
              <a href="https://twitch.tv/${bot.login}" target="_blank" rel="noopener noreferrer" class="ks-button ks-button-secondary" style="min-height: 32px; padding: 0 12px; font-size: 0.8rem;">
                <span>View @${escapeHtml(bot.displayName || bot.login)} on Twitch</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            </div>
          ` : ''}
        </div>

        <!-- Quick 1-Click Incognito Setup Banner -->
        <div style="margin-top: 14px; padding: 12px 16px; background: var(--ks-lacquer-deep); border: 1px dashed var(--ks-gold-hairline); border-radius: var(--ks-radius-xs); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 10px; font-size: 0.82rem; color: var(--ks-text-muted);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ks-kinpaku)" stroke-width="2" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span>Switching bot account to <strong>@${escapeHtml(config.botName)}</strong>? Use a Private/Incognito window so your personal Twitch login doesn't overwrite it.</span>
          </div>
          <button type="button" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 12px; font-size: 0.76rem;" onclick="copyBotAuthLink('${escapeHtml(botAuthUrl || '')}')">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span id="quickCopyBtnText">Copy Incognito Link</span>
          </button>
        </div>
      </section>

      <!-- 24/7 Live Stream Showcase & Product Demo Card -->
      <section class="ks-card" style="margin-bottom: 24px; border-color: ${activeStream.isLive ? 'var(--ks-patina)' : 'var(--ks-gold-hairline)'};">
        <div class="ks-card-header" style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <h2 class="ks-card-title" style="margin: 0;">24/7 Live Stream Showcase &amp; Product Demo</h2>
              <span id="streamLiveBadge" class="${activeStream.isLive ? 'ks-live-pill' : 'ks-tag'}" style="${activeStream.isLive ? '' : 'background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); color: var(--ks-text-muted);'}">
                ${activeStream.isLive ? `<span class="ks-dot-live"></span> LIVE (${activeStream.uptimeFormatted || '0s'})` : '● Offline'}
              </span>
              <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem; font-family: var(--ks-mono);">
                ⚡ Mode 1 Loop (~0.0% CPU)
              </span>
            </div>
            <p class="ks-card-desc" style="margin-top: 6px; max-width: 780px;">
              Broadcast a continuous promotional showcase loop directly to the bot's Twitch channel. Upload custom banners, product graphics, or short MP4/WebM videos to convert new streamers and demonstrate commands 24/7 with virtually zero CPU usage.
            </p>
          </div>

          <!-- Live Stream Action Buttons -->
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <button type="button" id="startStreamBtn" class="ks-button ks-button-primary" style="${activeStream.isLive ? 'display: none;' : ''}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Start 24/7 Showcase</span>
            </button>
            <button type="button" id="stopStreamBtn" class="ks-button" style="background: rgba(224, 76, 76, 0.15); border: 1px solid rgba(224, 76, 76, 0.4); color: #ff7b7b; ${activeStream.isLive ? '' : 'display: none;'}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
              <span>Stop Broadcast</span>
            </button>
          </div>
        </div>

        <!-- Real-Time Telemetry Bar (Visible when live) -->
        <div id="streamTelemetryBar" style="margin-bottom: 20px; padding: 12px 16px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); display: ${activeStream.isLive ? 'flex' : 'none'}; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap; font-family: var(--ks-mono); font-size: 0.8rem;">
            <div>
              <span style="color: var(--ks-text-muted);">STATUS: </span>
              <span style="color: var(--ks-patina); font-weight: 600;">STREAMING TO TWITCH RTMP</span>
            </div>
            <div>
              <span style="color: var(--ks-text-muted);">UPTIME: </span>
              <span id="telemetryUptime" style="color: var(--ks-champagne); font-weight: 600;">${activeStream.uptimeFormatted || '0s'}</span>
            </div>
            <div>
              <span style="color: var(--ks-text-muted);">FPS: </span>
              <span id="telemetryFps" style="color: var(--ks-kinpaku); font-weight: 600;">${activeStream.fps || 30}</span>
            </div>
            <div>
              <span style="color: var(--ks-text-muted);">BITRATE: </span>
              <span id="telemetryBitrate" style="color: var(--ks-champagne); font-weight: 600;">${activeStream.bitrate || '5000 kbps'}</span>
            </div>
            <div>
              <span style="color: var(--ks-text-muted);">AUDIO: </span>
              <span style="color: var(--ks-patina); font-weight: 600;">Silent AAC (Twitch Compliant)</span>
            </div>
          </div>
          <div style="font-size: 0.74rem; font-family: var(--ks-mono); color: var(--ks-text-faint);">
            PID: <span id="telemetryPid">${activeStream.pid || 'Active'}</span>
          </div>
        </div>

        <!-- Media Preview & Live Uploader Two-Column Grid -->
        <div style="display: grid; grid-template-columns: minmax(320px, 480px) 1fr; gap: 24px; align-items: start; margin-bottom: 24px;">
          
          <!-- Left Column: 16:9 Media Preview Box -->
          <div style="background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); padding: 14px; position: relative;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <span style="font-size: 0.74rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-kinpaku); letter-spacing: 0.06em;">Live Stream Feed Preview</span>
              <span id="mediaBadgeType" class="ks-tag" style="font-size: 0.7rem; text-transform: uppercase;">
                ${activeStream.activeMedia?.type || 'Image'} (${activeStream.activeMedia?.width || 1920}×${activeStream.activeMedia?.height || 1080})
              </span>
            </div>

            <!-- 16:9 Aspect Ratio Container -->
            <div style="position: relative; width: 100%; padding-top: 56.25%; background: #000; border-radius: 4px; overflow: hidden; border: 1px solid var(--ks-rule);">
              <video 
                id="streamPreviewVideo" 
                ${activeStream.activeMedia?.type === 'video' && activeStream.activeMedia?.url ? `src="${activeStream.activeMedia.url}"` : ''} 
                autoplay 
                muted 
                loop 
                playsinline 
                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; ${activeStream.activeMedia?.type === 'video' ? 'display: block;' : 'display: none;'}">
              </video>
              <img 
                id="streamPreviewImg" 
                src="${activeStream.activeMedia?.type !== 'video' ? (activeStream.activeMedia?.url || '/media/stream/default_showcase.svg') : '/media/stream/default_showcase.svg'}" 
                alt="Live Showcase Preview" 
                style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; ${activeStream.activeMedia?.type !== 'video' ? 'display: block;' : 'display: none;'}"
              />
              
              <div id="mediaHotReloadOverlay" style="display: none; position: absolute; inset: 0; background: rgba(13, 13, 17, 0.85); backdrop-filter: blur(4px); align-items: center; justify-content: center; flex-direction: column; gap: 8px; z-index: 10;">
                <div class="ks-spinner" style="width: 28px; height: 28px; border-width: 3px;"></div>
                <div style="font-size: 0.82rem; font-family: var(--ks-mono); color: var(--ks-champagne);">Hot-Reloading Live Stream...</div>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; font-size: 0.74rem; color: var(--ks-text-muted); font-family: var(--ks-mono);">
              <span id="activeMediaFilename" title="${activeStream.activeMedia?.filename || 'default_showcase.svg'}">
                File: ${escapeHtml(activeStream.activeMedia?.filename || 'default_showcase.svg')}
              </span>
              <span id="activeMediaSize">
                Size: ${escapeHtml(activeStream.activeMedia?.sizeFormatted || 'Standard SVG')}
              </span>
            </div>
          </div>

          <!-- Right Column: Media Uploader & Live Update -->
          <div style="display: flex; flex-direction: column; gap: 16px;">
            
            <!-- Upload Drop Zone Card -->
            <div 
              id="streamUploadDropZone"
              style="background: var(--ks-raised-lacquer); border: 2px dashed var(--ks-gold-hairline); border-radius: var(--ks-radius-xs); padding: 24px 20px; text-align: center; cursor: pointer; transition: all 0.2s ease;"
              role="button"
              tabindex="0"
              aria-label="Upload showcase image or video"
            >
              <input 
                type="file" 
                id="streamFileInput" 
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" 
                style="display: none;" 
              />
              
              <div style="width: 44px; height: 44px; margin: 0 auto 12px; border-radius: 50%; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); display: flex; align-items: center; justify-content: center; color: var(--ks-kinpaku);">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
              </div>

              <div style="font-size: 0.95rem; font-weight: 600; color: var(--ks-champagne); margin-bottom: 4px;">
                Choose or Drop Showcase Image / Video
              </div>
              <div style="font-size: 0.8rem; color: var(--ks-text-muted); max-width: 380px; margin: 0 auto;">
                Supports <span style="color: var(--ks-champagne); font-weight: 500;">PNG, JPG, WebP, MP4, WebM</span> (Recommended: 1920×1080, up to 100MB).
              </div>
              <div style="margin-top: 10px; font-size: 0.74rem; font-family: var(--ks-mono); color: var(--ks-patina);">
                ✓ Live Hot-Reload: Automatically updates the stream on air without dropping viewers!
              </div>

              <!-- Progress Indicator -->
              <div id="uploadProgressBarWrap" style="display: none; width: 100%; max-width: 320px; margin: 14px auto 0;">
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; font-family: var(--ks-mono); color: var(--ks-text-muted); margin-bottom: 4px;">
                  <span id="uploadStatusText">Uploading &amp; Compiling Loop...</span>
                  <span id="uploadPercentText">0%</span>
                </div>
                <div style="width: 100%; height: 6px; background: var(--ks-lacquer-deep); border-radius: 99px; overflow: hidden; border: 1px solid var(--ks-rule);">
                  <div id="uploadProgressBar" style="width: 100%; height: 100%; background: linear-gradient(90deg, var(--ks-kinpaku), var(--ks-patina)); transform: scaleX(0); transform-origin: left; transition: transform 0.2s ease;"></div>
                </div>
              </div>
            </div>

            <!-- Quick Upload Button Alternative -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <button type="button" id="triggerFileSelectBtn" class="ks-button ks-button-secondary" style="font-size: 0.82rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
                <span>Select Local Media File</span>
              </button>
              <span style="font-size: 0.74rem; color: var(--ks-text-faint); font-family: var(--ks-mono);">
                Assets stored at <code style="color: var(--ks-kinpaku);">media/stream/</code>
              </span>
            </div>

          </div>
        </div>

        <!-- Broadcast Configuration & Stream Key Section -->
        <div style="background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); padding: 20px; margin-bottom: 20px;">
          <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--ks-champagne); margin: 0 0 14px 0; display: flex; align-items: center; gap: 8px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            <span>Twitch Broadcast &amp; RTMP Credentials</span>
          </h3>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
            
            <!-- Stream Key Field -->
            <div>
              <label for="streamKeyInput" style="display: block; font-size: 0.78rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); margin-bottom: 6px;">
                Bot Stream Key (Encrypted AES-256)
              </label>
              <div style="display: flex; gap: 8px;">
                <input 
                  type="password" 
                  id="streamKeyInput" 
                  class="ks-input-text" 
                  placeholder="${activeStream.streamSettings?.streamKeyConfigured ? '••••••••••••••••••••••••' : 'live_123456789_abcdef...'}" 
                  value="" 
                  style="font-family: var(--ks-mono); font-size: 0.84rem; flex: 1;"
                />
                <button type="button" id="toggleStreamKeyVisibility" class="ks-button ks-button-secondary" style="min-width: 40px; padding: 0 10px;" title="Show/Hide stream key">
                  👁
                </button>
                <button type="button" id="autoDetectKeyBtn" class="ks-button ks-button-secondary" style="white-space: nowrap; font-size: 0.8rem;" title="Automatically fetch stream key from Twitch Helix API">
                  Auto-Detect from Twitch
                </button>
              </div>
              <div id="streamKeyCaption" style="font-size: 0.72rem; color: var(--ks-text-faint); margin-top: 4px;">
                ${activeStream.streamSettings?.streamKeyConfigured ? `✓ Key Configured: ${activeStream.streamSettings.streamKeyMasked}` : 'No key configured. Use Auto-Detect or paste from your Twitch Creator Dashboard.'}
              </div>
            </div>

            <!-- Stream Title Field -->
            <div>
              <label for="streamTitleInput" style="display: block; font-size: 0.78rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); margin-bottom: 6px;">
                Twitch Broadcast Title
              </label>
              <input 
                type="text" 
                id="streamTitleInput" 
                class="ks-input-text" 
                placeholder="Fenik Universal Twitch Bot • 24/7 Showcase &amp; Feature Demo" 
                value="${escapeHtml(activeStream.streamSettings?.title || 'Fenik Universal Twitch Bot • 24/7 Showcase & Feature Demo')}"
                style="font-size: 0.84rem;"
              />
              <div style="font-size: 0.72rem; color: var(--ks-text-faint); margin-top: 4px;">
                Auto-syncs to Twitch channel title when stream launches.
              </div>
            </div>

            <!-- Category / Game Field -->
            <div>
              <label for="streamCategoryInput" style="display: block; font-size: 0.78rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); margin-bottom: 6px;">
                Twitch Category
              </label>
              <input 
                type="text" 
                id="streamCategoryInput" 
                class="ks-input-text" 
                placeholder="Software and Game Development" 
                value="${escapeHtml(activeStream.streamSettings?.category || 'Software and Game Development')}"
                style="font-size: 0.84rem;"
              />
              <div style="font-size: 0.72rem; color: var(--ks-text-faint); margin-top: 4px;">
                E.g. "Software and Game Development" or "Just Chatting".
              </div>
            </div>

            <!-- Video Bitrate Field -->
            <div>
              <label for="streamBitrateInput" style="display: block; font-size: 0.78rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted); margin-bottom: 6px;">
                Video Bitrate (CBR)
              </label>
              <div style="display: flex; align-items: center; gap: 8px;">
                <input 
                  type="number" 
                  id="streamBitrateInput" 
                  class="ks-input-text" 
                  min="1000"
                  max="8000"
                  step="500"
                  value="${activeStream.streamSettings?.bitrate || 5000}" 
                  style="font-family: var(--ks-mono); font-size: 0.84rem; flex: 1;"
                />
                <span style="font-family: var(--ks-mono); font-size: 0.8rem; color: var(--ks-text-muted);">kbps</span>
                <button type="button" id="applyBitrateBtn" class="ks-button ks-button-secondary" style="font-size: 0.78rem; white-space: nowrap; padding: 5px 12px;" title="Re-encodes showcase video loop at specified bitrate">
                  <span>Re-encode at Bitrate</span>
                </button>
              </div>
              <div style="font-size: 0.72rem; color: var(--ks-text-faint); margin-top: 4px;">
                Twitch Constant Bitrate (CBR). Default: 5000 kbps (1080p).
              </div>
            </div>

          </div>

          <!-- Save Settings & Sync Buttons -->
          <div style="display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 14px;">
            <button type="button" id="syncTwitchBroadcastBtn" class="ks-button ks-button-secondary" style="font-size: 0.82rem;" title="Fetch currently active title and category directly from Twitch channel">
              <span>↻ Pull from Twitch</span>
            </button>
            <button type="button" id="saveStreamSettingsBtn" class="ks-button ks-button-secondary" style="font-size: 0.82rem;">
              <span>Save &amp; Update on Twitch</span>
            </button>
          </div>
        </div>

        <!-- Linux Server Diagnostic & FFmpeg Status Footer -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px 16px; background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs);">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span style="font-size: 0.75rem; font-family: var(--ks-mono); text-transform: uppercase; color: var(--ks-text-muted);">
              FFmpeg Engine:
            </span>
            ${activeStream.ffmpeg?.available ? `
              <span class="ks-tag ks-tag-patina" style="font-size: 0.74rem;">
                ✓ ${escapeHtml(activeStream.ffmpeg.source)} detected
              </span>
            ` : `
              <span class="ks-tag ks-tag-vermilion" style="font-size: 0.74rem;">
                ⚠ FFmpeg Not Detected
              </span>
            `}
            <span style="font-size: 0.74rem; color: var(--ks-text-faint); font-family: var(--ks-mono);">
              ${activeStream.ffmpeg?.path ? escapeHtml(activeStream.ffmpeg.path) : 'Bundled via ffmpeg-static (no root/apt required)'}
            </span>
          </div>

          <div style="font-size: 0.75rem; color: var(--ks-text-muted);">
            Linux Deployment: <span style="color: var(--ks-patina);">Zero-config via npm</span> • Optional: <code style="color: var(--ks-champagne);">sudo apt install ffmpeg</code>
          </div>
        </div>

      </section>

      <!-- Connected Streamers Roster Section -->
      <section class="ks-card">
        <div class="ks-card-header" style="margin-bottom: 16px;">
          <div>
            <h2 class="ks-card-title">Connected Streamers Roster</h2>
            <p class="ks-card-desc">Detailed setup progress, Twitch OAuth scopes, moderator verification, and channel presence (${channels.length} total).</p>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--ks-rule);">
          
          <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 260px; max-width: 420px;">
            <input 
              type="text" 
              id="adminStreamerFilter" 
              class="ks-input-text" 
              aria-label="Filter streamers by name, login, or ID"
              placeholder="Filter by streamer name, login, or ID..." 
              style="font-size: 0.84rem; min-height: 34px;"
            />
          </div>

          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;" id="filterPillsGroup">
            <button type="button" class="ks-button ks-button-secondary admin-filter-pill active" data-filter="all" style="min-height: 28px; padding: 0 12px; font-size: 0.78rem;">All (${channels.length})</button>
            <button type="button" class="ks-button ks-button-secondary admin-filter-pill" data-filter="in-chat" style="min-height: 28px; padding: 0 12px; font-size: 0.78rem;">In Chat (${joinedCount})</button>
            <button type="button" class="ks-button ks-button-secondary admin-filter-pill" data-filter="left-chat" style="min-height: 28px; padding: 0 12px; font-size: 0.78rem;">Disconnected (${channels.length - joinedCount})</button>
            <button type="button" class="ks-button ks-button-secondary admin-filter-pill" data-filter="ready" style="min-height: 28px; padding: 0 12px; font-size: 0.78rem;">Setups Complete (${fullySetupCount})</button>
            <button type="button" class="ks-button ks-button-secondary admin-filter-pill" data-filter="incomplete" style="min-height: 28px; padding: 0 12px; font-size: 0.78rem;">Incomplete (${channels.length - fullySetupCount})</button>
          </div>
        </div>

        <!-- Streamers Table Wrap -->
        <div class="ks-table-wrap">
          <table class="ks-table" id="adminStreamersTable">
            <thead>
              <tr>
                <th scope="col">Streamer / Channel</th>
                <th scope="col">Chat Presence</th>
                <th scope="col">Setup Status</th>
                <th scope="col">OAuth Scopes</th>
                <th scope="col">Bot Modded</th>
                <th scope="col">Config</th>
                <th scope="col">Joined Date</th>
                <th scope="col" style="text-align: right;">Admin Actions</th>
              </tr>
            </thead>
            <tbody>
              ${channels.length > 0 ? channels.map((ch) => {
                const setup = ch.setupState || { completedTasks: 0, percentReady: 0, allScopesGranted: false, isBotMod: null };
                const isReady = setup.isFullySetup;
                const filterState = [
                  'all',
                  ch.joined ? 'in-chat' : 'left-chat',
                  isReady ? 'ready' : 'incomplete',
                ].join(' ');

                return `
                  <tr 
                    class="admin-streamer-row" 
                    data-filter="${filterState}"
                    data-search="${escapeHtml((ch.displayName + ' ' + ch.login + ' ' + ch.id).toLowerCase())}"
                  >
                    <!-- 1. Streamer Details -->
                    <td>
                      <div style="display: flex; align-items: center; gap: 12px;">
                        <img 
                          src="${ch.avatar || '/default-avatar.svg'}" 
                          alt="${escapeHtml(ch.displayName)}" 
                          onerror="this.onerror=null;this.src='/default-avatar.svg'"
                          style="width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--ks-rule); object-fit: cover;" 
                        />
                        <div>
                          <div style="font-weight: 600; color: var(--ks-champagne); font-size: 0.92rem;">
                            ${escapeHtml(ch.displayName)}
                          </div>
                          <div style="font-size: 0.76rem; color: var(--ks-text-muted); display: flex; align-items: center; gap: 6px;">
                            <a href="https://twitch.tv/${ch.login}" target="_blank" rel="noopener noreferrer" style="color: var(--ks-text-muted); text-decoration: underline;" title="View Twitch Channel">
                              twitch.tv/${ch.login}
                            </a>
                            <span style="color: var(--ks-text-faint);">·</span>
                            <span style="font-family: var(--ks-mono); font-size: 0.72rem; color: var(--ks-text-faint);">${ch.id}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <!-- 2. Chat Presence -->
                    <td>
                      ${ch.joined ? `
                        <div>
                          <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">● In Chat</span>
                          <div style="font-size: 0.7rem; color: var(--ks-text-muted); margin-top: 3px;">Active listener</div>
                        </div>
                      ` : `
                        <div>
                          <span class="ks-tag" style="color: var(--ks-vermilion); border-color: oklch(58% 0.15 35 / 0.3); font-size: 0.72rem;">○ Left Chat</span>
                          <div style="font-size: 0.7rem; color: var(--ks-text-faint); margin-top: 3px;">Bot disconnected</div>
                        </div>
                      `}
                    </td>

                    <!-- 3. Setup Progress -->
                    <td>
                      <div style="min-width: 160px;">
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px;">
                          ${isReady ? `
                            <span class="ks-tag ks-tag-gold" style="font-size: 0.7rem; padding: 1px 6px; white-space: nowrap;">✓ Setup Complete</span>
                          ` : `
                            <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; white-space: nowrap;">${setup.completedTasks}/4 Tasks Done</span>
                          `}
                          <span style="font-family: var(--ks-mono); font-size: 0.72rem; color: var(--ks-text-muted); flex-shrink: 0;">${setup.percentReady}%</span>
                        </div>
                        <div style="width: 100%; height: 5px; background: var(--ks-lacquer-deep); border-radius: 99px; overflow: hidden; border: 1px solid var(--ks-rule);">
                          <div style="width: ${setup.percentReady}%; height: 100%; background: ${isReady ? 'var(--ks-kinpaku)' : 'var(--ks-patina)'};"></div>
                        </div>
                      </div>
                    </td>

                    <!-- 4. Scopes Verification -->
                    <td>
                      ${setup.allScopesGranted ? `
                        <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Scopes</span>
                      ` : `
                        <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;" title="Missing: ${setup.missingScopes?.map(s => s.name).join(', ')}">
                          ⚠ Scopes (${setup.missingScopes?.length || 0} missing)
                        </span>
                      `}
                    </td>

                    <!-- 5. Moderator Status -->
                    <td>
                      ${setup.isBotMod === true ? `
                        <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Modded</span>
                      ` : setup.isBotMod === false ? `
                        <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;">Not Modded</span>
                      ` : `
                        <span class="ks-tag" style="font-size: 0.72rem; color: var(--ks-text-faint);">Unknown</span>
                      `}
                    </td>

                    <!-- 6. Workload & Config -->
                    <td>
                      <div>
                        <span class="ks-tag ks-tag-gold" style="font-size: 0.72rem;">${ch.prefix}</span>
                        <div style="font-family: var(--ks-mono); font-size: 0.72rem; color: var(--ks-text-muted); margin-top: 3px;">
                          ${ch.commands?.length || 0} cmds · ${ch.timers?.length || 0} timers
                        </div>
                      </div>
                    </td>

                    <!-- 7. Joined Date -->
                    <td style="font-family: var(--ks-mono); font-size: 0.78rem; color: var(--ks-text-muted); white-space: nowrap;">
                      ${new Date(ch.createdAt).toLocaleDateString()}
                    </td>

                    <!-- 8. Admin Actions (Delete) -->
                    <td style="text-align: right; white-space: nowrap;">
                      ${String(user?.userId) !== String(ch.id) ? `
                        <button 
                          type="button" 
                          class="ks-button ks-button-danger open-delete-modal-btn" 
                          style="min-height: 26px; padding: 0 10px; font-size: 0.76rem;"
                          data-channel-id="${ch.id}"
                          data-channel-name="${escapeHtml(ch.displayName)}"
                          data-channel-login="${escapeHtml(ch.login)}"
                          data-commands-count="${ch.commands?.length || 0}"
                          data-timers-count="${ch.timers?.length || 0}"
                          title="Permanently delete account for #${ch.login}"
                        >
                          Delete Account
                        </button>
                      ` : `
                        <span class="ks-tag" style="font-size: 0.7rem; color: var(--ks-text-faint);" title="Cannot delete active administrator account">Active Admin</span>
                      `}
                    </td>
                  </tr>
                `;
              }).join('') : `
                <tr>
                  <td colspan="8" style="text-align: center; color: var(--ks-text-muted); padding: 48px 14px;">
                    No channels authorized yet. Share your application link with streamers to begin onboarding.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Account Deletion Confirmation Modal -->
      <div 
        id="deleteAccountModal" 
        class="ks-modal-backdrop" 
        role="alertdialog" 
        aria-modal="true" 
        aria-labelledby="deleteModalTitle" 
        aria-describedby="deleteModalDesc" 
        style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.78); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 16px;"
      >
        <div class="ks-card" style="max-width: 520px; width: 100%; border-color: var(--ks-vermilion); box-shadow: 0 20px 40px rgba(0,0,0,0.8); background: var(--ks-raised-lacquer); padding: 24px;">
          
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 36px; height: 36px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); border: 1px solid var(--ks-vermilion); display: flex; align-items: center; justify-content: center; color: var(--ks-vermilion);">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <h3 id="deleteModalTitle" style="font-size: 1.15rem; font-weight: 700; color: var(--ks-champagne); margin: 0;">Permanently Delete Account</h3>
                <div style="font-size: 0.78rem; color: var(--ks-text-muted);">Irreversible channel and user purge</div>
              </div>
            </div>
            
            <button type="button" id="closeDeleteModalBtn" aria-label="Close delete confirmation dialog" style="background: none; border: none; color: var(--ks-text-muted); cursor: pointer; padding: 4px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <p id="deleteModalDesc" style="font-size: 0.86rem; color: var(--ks-text-warm); line-height: 1.5; margin-bottom: 16px;">
            Are you sure you want to completely delete <strong id="modalTargetStreamerName" style="color: var(--ks-champagne);">@streamer</strong> (<code id="modalTargetStreamerLogin" style="font-family: var(--ks-mono); color: var(--ks-kinpaku);">streamer</code>)?
          </p>

          <div style="padding: 12px 14px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); margin-bottom: 20px; font-size: 0.8rem; color: var(--ks-text-muted); line-height: 1.55;">
            <div style="font-weight: 600; color: var(--ks-champagne); margin-bottom: 6px;">This action will perform the following:</div>
            <ul style="padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 4px;">
              <li>Disconnect the bot from stream chatroom (<strong>#<span id="modalTargetChatName"></span></strong>) and unsubscribe EventSub listeners.</li>
              <li>Purge all custom commands, timers, auto-shoutouts, and moderation settings.</li>
              <li>Revoke all manager permissions and terminate active login sessions.</li>
              <li>Permanently erase channel database records.</li>
            </ul>
          </div>

          <form action="/admin/channels/delete" method="POST" id="deleteAccountForm">
            <input type="hidden" name="channelId" id="modalTargetChannelId" value="" />
            
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
              <button type="button" id="cancelDeleteBtn" class="ks-button ks-button-secondary">
                Cancel
              </button>
              <button type="submit" class="ks-button ks-button-danger">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Permanently Delete Channel</span>
              </button>
            </div>
          </form>

        </div>
      </div>

      <!-- Disconnect Bot Worker Confirmation Modal -->
      <div id="unlinkBotModal" role="dialog" aria-modal="true" aria-labelledby="unlinkBotModalTitle" style="display: none; position: fixed; inset: 0; z-index: 9999; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); padding: 20px;">
        <div class="ks-card" style="max-width: 500px; width: 100%; background: var(--ks-lacquer); border: 1px solid var(--ks-vermilion); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: var(--ks-radius-xs); background: rgba(224, 76, 56, 0.15); border: 1px solid rgba(224, 76, 56, 0.3); display: flex; align-items: center; justify-content: center; color: var(--ks-vermilion); flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
              <div>
                <h3 id="unlinkBotModalTitle" style="font-size: 1.15rem; font-weight: 700; color: var(--ks-champagne); margin: 0;">Disconnect Bot Account</h3>
                <div style="font-size: 0.78rem; color: var(--ks-text-muted);">Unlink worker to switch accounts</div>
              </div>
            </div>
            
            <button type="button" onclick="closeUnlinkBotModal()" aria-label="Close dialog" style="background: none; border: none; color: var(--ks-text-muted); cursor: pointer; padding: 4px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <p style="font-size: 0.86rem; color: var(--ks-text-warm); line-height: 1.5; margin-bottom: 16px;">
            Are you sure you want to disconnect <strong style="color: var(--ks-champagne);">@${escapeHtml(bot?.displayName || bot?.login || config.botName)}</strong>?
          </p>

          <div style="padding: 12px 14px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); margin-bottom: 20px; font-size: 0.8rem; color: var(--ks-text-muted); line-height: 1.55;">
            <div style="font-weight: 600; color: var(--ks-champagne); margin-bottom: 6px;">What happens when disconnected:</div>
            <ul style="padding-left: 18px; margin: 0; display: flex; flex-direction: column; gap: 4px;">
              <li>The central EventSub websocket listener will be paused.</li>
              <li>Automated chat responses and timers will be paused until a new bot account is linked.</li>
              <li>Broadcaster settings, custom commands, and channel configurations remain completely intact.</li>
            </ul>
          </div>

          <form action="/admin/bot/unlink" method="POST">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
              <button type="button" onclick="closeUnlinkBotModal()" class="ks-button ks-button-secondary">
                Cancel
              </button>
              <button type="submit" class="ks-button ks-button-danger">
                <span>Confirm Disconnect</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Authorize Bot in Private Window Modal -->
      <div id="incognitoBotModal" role="dialog" aria-modal="true" aria-labelledby="incognitoBotModalTitle" style="display: none; position: fixed; inset: 0; z-index: 9999; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(4px); padding: 20px;">
        <div class="ks-card" style="max-width: 560px; width: 100%; background: var(--ks-lacquer); border: 1px solid var(--ks-gold-hairline); box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <div style="width: 38px; height: 38px; border-radius: var(--ks-radius-xs); background: rgba(200, 168, 107, 0.15); border: 1px solid var(--ks-gold-hairline); display: flex; align-items: center; justify-content: center; color: var(--ks-kinpaku); flex-shrink: 0;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20M7 12a5 5 0 0 1 10 0M12 2v2M4.93 4.93l1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              </div>
              <div>
                <h3 id="incognitoBotModalTitle" style="font-size: 1.15rem; font-weight: 700; color: var(--ks-champagne); margin: 0;">Authorize in Private / Incognito Window</h3>
                <div style="font-size: 0.78rem; color: var(--ks-text-muted);">Connect a separate bot Twitch account cleanly</div>
              </div>
            </div>
            
            <button type="button" onclick="closeIncognitoBotModal()" aria-label="Close dialog" style="background: none; border: none; color: var(--ks-text-muted); cursor: pointer; padding: 4px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <p style="font-size: 0.86rem; color: var(--ks-text-warm); line-height: 1.5; margin-bottom: 16px;">
            Because you are signed into your personal Twitch broadcaster account in this browser, use an Incognito / Private window so Twitch doesn't accidentally re-link your personal account:
          </p>

          <div style="padding: 14px 16px; background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); margin-bottom: 20px; font-size: 0.82rem; color: var(--ks-text-muted); line-height: 1.6;">
            <div style="margin-bottom: 8px;"><strong style="color: var(--ks-champagne);">Step 1:</strong> Open a <strong>Private / Incognito window</strong> (or a separate browser like Firefox/Edge).</div>
            <div style="margin-bottom: 8px;"><strong style="color: var(--ks-champagne);">Step 2:</strong> Go to <a href="https://twitch.tv" target="_blank" rel="noopener noreferrer" style="color: var(--ks-patina); text-decoration: underline;">twitch.tv</a> and log into <strong>@${escapeHtml(config.botName)}</strong>.</div>
            <div style="margin-bottom: 8px;"><strong style="color: var(--ks-champagne);">Step 3:</strong> Copy and paste this secure one-time link into that Incognito window's address bar:</div>
            
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <input 
                type="text" 
                readonly 
                id="modalBotAuthInput" 
                value="${escapeHtml(botAuthUrl || '')}" 
                class="ks-input" 
                style="font-family: var(--ks-mono); font-size: 0.76rem; background: var(--ks-lacquer); color: var(--ks-champagne); border-color: var(--ks-gold-hairline); flex: 1;"
                onclick="this.select()"
              />
              <button type="button" class="ks-button ks-button-primary" style="white-space: nowrap; font-size: 0.8rem; min-height: 36px;" onclick="copyModalBotLink()">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                <span id="modalCopyBtnText">Copy Link</span>
              </button>
            </div>
            <div style="margin-top: 10px; font-size: 0.74rem; color: var(--ks-text-faint);">Link is cryptographically signed with your admin session and valid for 30 minutes.</div>
          </div>

          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
            <button type="button" onclick="closeIncognitoBotModal()" class="ks-button ks-button-secondary">
              Close
            </button>
          </div>
        </div>
      </div>

    </div>

    <!-- Client-Side Search, Filter, & Modal Controller Script -->
    <script>
      (function() {
        var searchInput = document.getElementById('adminStreamerFilter');
        var filterPills = document.querySelectorAll('.admin-filter-pill');
        var rows = document.querySelectorAll('.admin-streamer-row');
        var currentFilter = 'all';

        function applyFilters() {
          var query = (searchInput ? searchInput.value : '').toLowerCase().trim();
          rows.forEach(function(row) {
            var searchData = row.getAttribute('data-search') || '';
            var filterData = (row.getAttribute('data-filter') || '').split(' ');
            var matchesSearch = !query || searchData.indexOf(query) !== -1;
            var matchesFilter = currentFilter === 'all' || filterData.indexOf(currentFilter) !== -1;
            if (matchesSearch && matchesFilter) {
              row.style.display = '';
            } else {
              row.style.display = 'none';
            }
          });
        }

        if (searchInput) {
          searchInput.addEventListener('input', applyFilters);
        }

        filterPills.forEach(function(pill) {
          pill.addEventListener('click', function() {
            filterPills.forEach(function(p) { p.classList.remove('active'); p.style.borderColor = ''; });
            pill.classList.add('active');
            currentFilter = pill.getAttribute('data-filter') || 'all';
            applyFilters();
          });
        });

        // Modal Management
        var modal = document.getElementById('deleteAccountModal');
        var modalTargetName = document.getElementById('modalTargetStreamerName');
        var modalTargetLogin = document.getElementById('modalTargetStreamerLogin');
        var modalTargetChat = document.getElementById('modalTargetChatName');
        var modalTargetId = document.getElementById('modalTargetChannelId');
        var closeModalBtn = document.getElementById('closeDeleteModalBtn');
        var cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        var activeTriggerBtn = null;

        function openModal(btn) {
          activeTriggerBtn = btn;
          var id = btn.getAttribute('data-channel-id');
          var name = btn.getAttribute('data-channel-name');
          var login = btn.getAttribute('data-channel-login');

          if (modalTargetName) modalTargetName.textContent = '@' + name;
          if (modalTargetLogin) modalTargetLogin.textContent = login;
          if (modalTargetChat) modalTargetChat.textContent = login;
          if (modalTargetId) modalTargetId.value = id;

          if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
            if (cancelDeleteBtn) {
              setTimeout(function() { cancelDeleteBtn.focus(); }, 40);
            }
          }
        }

        function closeModal() {
          if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
            if (activeTriggerBtn && typeof activeTriggerBtn.focus === 'function') {
              activeTriggerBtn.focus();
            }
            activeTriggerBtn = null;
          }
        }

        document.addEventListener('click', function(e) {
          var delBtn = e.target.closest('.open-delete-modal-btn');
          if (delBtn) {
            e.preventDefault();
            openModal(delBtn);
            return;
          }

          if (e.target === modal) {
            closeModal();
          }
          if (e.target === unlinkModal) {
            closeUnlinkBotModal();
          }
          if (e.target === incognitoModal) {
            closeIncognitoBotModal();
          }
        });

        // Bot Modal Controllers
        var unlinkModal = document.getElementById('unlinkBotModal');
        var incognitoModal = document.getElementById('incognitoBotModal');

        window.openUnlinkBotModal = function() {
          if (unlinkModal) {
            unlinkModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
          }
        };

        window.closeUnlinkBotModal = function() {
          if (unlinkModal) {
            unlinkModal.style.display = 'none';
            document.body.style.overflow = '';
          }
        };

        window.openIncognitoBotModal = function() {
          if (incognitoModal) {
            incognitoModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
          }
        };

        window.closeIncognitoBotModal = function() {
          if (incognitoModal) {
            incognitoModal.style.display = 'none';
            document.body.style.overflow = '';
          }
        };

        window.copyBotAuthLink = function(url) {
          if (!url) return;
          navigator.clipboard.writeText(url).then(function() {
            var btn = document.getElementById('quickCopyBtnText');
            if (btn) {
              var orig = btn.textContent;
              btn.textContent = '✓ Copied!';
              setTimeout(function() { btn.textContent = orig; }, 3000);
            }
            if (typeof showDynamicToast === 'function') {
              showDynamicToast('success', 'Incognito authorization link copied to clipboard!');
            }
          }).catch(function() {
            window.openIncognitoBotModal();
          });
        };

        window.copyModalBotLink = function() {
          var input = document.getElementById('modalBotAuthInput');
          if (!input) return;
          input.select();
          navigator.clipboard.writeText(input.value).then(function() {
            var btn = document.getElementById('modalCopyBtnText');
            if (btn) {
              var orig = btn.textContent;
              btn.textContent = '✓ Copied!';
              setTimeout(function() { btn.textContent = orig; }, 3000);
            }
            if (typeof showDynamicToast === 'function') {
              showDynamicToast('success', 'Link copied! Paste it in an Incognito window.');
            }
          });
        };

        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
        if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeModal);

        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            if (unlinkModal && unlinkModal.style.display === 'flex') {
              e.preventDefault();
              closeUnlinkBotModal();
              return;
            }
            if (incognitoModal && incognitoModal.style.display === 'flex') {
              e.preventDefault();
              closeIncognitoBotModal();
              return;
            }
            if (modal && modal.style.display === 'flex') {
              e.preventDefault();
              closeModal();
              return;
            }
          }

          if (!modal || modal.style.display !== 'flex') return;

          if (e.key === 'Tab') {
            var focusable = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];

            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        });

        // --- Toast Lifecycle Management ---
        function dismissToast(toast) {
          if (!toast || toast.classList.contains('is-leaving')) return;
          toast.classList.add('is-leaving');
          toast.style.opacity = '0';
          toast.style.transform = 'translateY(8px) scale(0.96)';
          setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
          }, 240);
        }

        function setupToast(toast, duration) {
          if (!toast) return;
          var timer = null;
          var remaining = duration || 4500;
          var startTime = Date.now();

          function startTimer() {
            startTime = Date.now();
            timer = setTimeout(function() {
              dismissToast(toast);
            }, remaining);
          }

          function pauseTimer() {
            if (timer) {
              clearTimeout(timer);
              timer = null;
              var elapsed = Date.now() - startTime;
              remaining = Math.max(1500, remaining - elapsed);
            }
          }

          startTimer();

          toast.addEventListener('mouseenter', pauseTimer);
          toast.addEventListener('mouseleave', startTimer);

          var closeBtn = toast.querySelector('.ks-toast-close');
          if (closeBtn) {
            closeBtn.addEventListener('click', function(e) {
              e.stopPropagation();
              if (timer) clearTimeout(timer);
              dismissToast(toast);
            });
          }
        }

        // Dynamic Toast Helper
        function showDynamicToast(type, message) {
          var container = document.getElementById('ks-toast-container');
          if (!container) return;
          var toast = document.createElement('div');
          toast.className = 'ks-toast ks-toast-' + (type === 'error' ? 'error' : 'success');
          toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
          toast.innerHTML = 
            '<div class="ks-toast-body">' +
              '<svg class="ks-toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                (type === 'error' ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>' : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>') +
              '</svg>' +
              '<div class="ks-toast-text">' + escapeHtml(message) + '</div>' +
            '</div>' +
            '<button type="button" class="ks-toast-close" aria-label="Dismiss notification">' +
              '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>' +
            '</button>';
          container.appendChild(toast);
          setupToast(toast, type === 'error' ? 6000 : 4500);
        }

        // Auto-dismiss initial toasts on page load
        document.querySelectorAll('.ks-toast').forEach(function(toast) {
          var isError = toast.classList.contains('ks-toast-error');
          setupToast(toast, isError ? 6000 : 4500);
        });

        // ==========================================
        // 24/7 Live Stream Showcase Controller
        // ==========================================
        var streamDropZone = document.getElementById('streamUploadDropZone');
        var streamFileInput = document.getElementById('streamFileInput');
        var triggerFileBtn = document.getElementById('triggerFileSelectBtn');
        var uploadWrap = document.getElementById('uploadProgressBarWrap');
        var uploadBar = document.getElementById('uploadProgressBar');
        var uploadStatus = document.getElementById('uploadStatusText');
        var uploadPercent = document.getElementById('uploadPercentText');
        var hotReloadOverlay = document.getElementById('mediaHotReloadOverlay');
        var previewImg = document.getElementById('streamPreviewImg');
        var previewVideo = document.getElementById('streamPreviewVideo');
        var activeFilenameLabel = document.getElementById('activeMediaFilename');
        var activeSizeLabel = document.getElementById('activeMediaSize');
        var mediaBadgeType = document.getElementById('mediaBadgeType');

        var startBtn = document.getElementById('startStreamBtn');
        var stopBtn = document.getElementById('stopStreamBtn');
        var streamLiveBadge = document.getElementById('streamLiveBadge');
        var telemetryBar = document.getElementById('streamTelemetryBar');
        var telemetryUptime = document.getElementById('telemetryUptime');
        var telemetryFps = document.getElementById('telemetryFps');
        var telemetryBitrate = document.getElementById('telemetryBitrate');
        var telemetryPid = document.getElementById('telemetryPid');

        var keyInput = document.getElementById('streamKeyInput');
        var titleInput = document.getElementById('streamTitleInput');
        var categoryInput = document.getElementById('streamCategoryInput');
        var autoKeyBtn = document.getElementById('autoDetectKeyBtn');
        var saveSettingsBtn = document.getElementById('saveStreamSettingsBtn');
        var syncTwitchBtn = document.getElementById('syncTwitchBroadcastBtn');
        var applyBitrateBtn = document.getElementById('applyBitrateBtn');
        var toggleKeyBtn = document.getElementById('toggleStreamKeyVisibility');
        var keyCaption = document.getElementById('streamKeyCaption');

        var telemetryPollTimer = null;

        // Toggle Stream Key Visibility
        if (toggleKeyBtn && keyInput) {
          toggleKeyBtn.addEventListener('click', function() {
            if (keyInput.type === 'password') {
              keyInput.type = 'text';
              toggleKeyBtn.textContent = '🔒';
            } else {
              keyInput.type = 'password';
              toggleKeyBtn.textContent = '👁';
            }
          });
        }

        // File Selection Triggers
        if (triggerFileBtn && streamFileInput) {
          triggerFileBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            streamFileInput.click();
          });
        }

        if (streamDropZone && streamFileInput) {
          streamDropZone.addEventListener('click', function() {
            streamFileInput.click();
          });

          streamDropZone.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              streamFileInput.click();
            }
          });

          streamDropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            streamDropZone.style.borderColor = 'var(--ks-kinpaku)';
            streamDropZone.style.background = 'var(--ks-lacquer-deep)';
          });

          streamDropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            streamDropZone.style.borderColor = '';
            streamDropZone.style.background = '';
          });

          streamDropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            streamDropZone.style.borderColor = '';
            streamDropZone.style.background = '';
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleStreamUpload(e.dataTransfer.files[0]);
            }
          });

          streamFileInput.addEventListener('change', function() {
            if (streamFileInput.files && streamFileInput.files.length > 0) {
              handleStreamUpload(streamFileInput.files[0]);
            }
          });
        }

        function handleStreamUpload(file) {
          if (!file) return;

          var validTypes = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'];
          var ext = file.name.split('.').pop().toLowerCase();
          var allowedExts = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'];
          if (allowedExts.indexOf(ext) === -1) {
            showDynamicToast('error', 'Unsupported file type (' + ext + '). Please upload PNG, JPG, WebP, MP4, or WebM.');
            return;
          }

          if (file.size > 100 * 1024 * 1024) {
            showDynamicToast('error', 'File exceeds maximum limit of 100MB.');
            return;
          }

          if (uploadWrap) uploadWrap.style.display = 'block';
          if (uploadBar) uploadBar.style.transform = 'scaleX(0.2)';
          if (uploadStatus) uploadStatus.textContent = 'Reading local media file...';
          if (uploadPercent) uploadPercent.textContent = '20%';
          if (hotReloadOverlay) hotReloadOverlay.style.display = 'flex';

          var reader = new FileReader();
          reader.onload = function(e) {
            var fileData = e.target.result;
            if (uploadBar) uploadBar.style.transform = 'scaleX(0.6)';
            if (uploadStatus) uploadStatus.textContent = 'Compiling 0% CPU loop & hot-reloading...';
            if (uploadPercent) uploadPercent.textContent = '60%';

            fetch('/api/stream/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: file.name,
                fileData: fileData,
              }),
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (uploadBar) uploadBar.style.transform = 'scaleX(1)';
              if (uploadPercent) uploadPercent.textContent = '100%';

              setTimeout(function() {
                if (uploadWrap) uploadWrap.style.display = 'none';
                if (hotReloadOverlay) hotReloadOverlay.style.display = 'none';
                if (uploadBar) uploadBar.style.transform = 'scaleX(0)';
              }, 600);

              if (data.ok && data.media) {
                var media = data.media;
                var cacheBuster = '?t=' + Date.now();

                if (media.type === 'video') {
                  if (previewImg) previewImg.style.display = 'none';
                  if (previewVideo) {
                    previewVideo.src = media.url + cacheBuster;
                    previewVideo.style.display = 'block';
                    previewVideo.load();
                    previewVideo.play().catch(function() {});
                  }
                } else {
                  if (previewVideo) {
                    previewVideo.style.display = 'none';
                    previewVideo.pause();
                  }
                  if (previewImg) {
                    previewImg.src = media.url + cacheBuster;
                    previewImg.style.display = 'block';
                  }
                }

                if (activeFilenameLabel) activeFilenameLabel.textContent = 'File: ' + media.filename;
                if (activeSizeLabel) activeSizeLabel.textContent = 'Size: ' + media.sizeFormatted;
                if (mediaBadgeType) mediaBadgeType.textContent = media.type.toUpperCase() + ' (' + media.width + '×' + media.height + ')';

                showDynamicToast('success', 'Showcase media uploaded and compiled! Broadcast updated on the fly.');
              } else {
                showDynamicToast('error', data.error || 'Failed to process media file.');
              }
            })
            .catch(function(err) {
              if (uploadWrap) uploadWrap.style.display = 'none';
              if (hotReloadOverlay) hotReloadOverlay.style.display = 'none';
              showDynamicToast('error', 'Upload error: ' + err.message);
            });
          };

          reader.onerror = function() {
            if (uploadWrap) uploadWrap.style.display = 'none';
            if (hotReloadOverlay) hotReloadOverlay.style.display = 'none';
            showDynamicToast('error', 'Could not read local file.');
          };

          reader.readAsDataURL(file);
        }

        // Broadcast Start / Stop Controls
        if (startBtn) {
          startBtn.addEventListener('click', function() {
            var streamKey = keyInput ? keyInput.value.trim() : '';
            var title = titleInput ? titleInput.value.trim() : '';
            var category = categoryInput ? categoryInput.value.trim() : '';

            startBtn.disabled = true;
            startBtn.innerHTML = '<span class="ks-spinner" style="width:14px;height:14px;border-width:2px;"></span> <span>Starting...</span>';

            fetch('/api/stream/start', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ streamKey: streamKey, title: title, category: category }),
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              startBtn.disabled = false;
              startBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Start 24/7 Showcase</span>';

              if (data.ok) {
                setStreamLiveUI(true);
                showDynamicToast('success', '24/7 Live Stream launched to Twitch!');
              } else {
                showDynamicToast('error', data.error || 'Could not start stream broadcast.');
              }
            })
            .catch(function(err) {
              startBtn.disabled = false;
              startBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Start 24/7 Showcase</span>';
              showDynamicToast('error', 'Error launching stream: ' + err.message);
            });
          });
        }

        if (stopBtn) {
          stopBtn.addEventListener('click', function() {
            stopBtn.disabled = true;
            stopBtn.innerHTML = '<span class="ks-spinner" style="width:14px;height:14px;border-width:2px;"></span> <span>Stopping...</span>';

            fetch('/api/stream/stop', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              stopBtn.disabled = false;
              stopBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg> <span>Stop Broadcast</span>';

              if (data.ok) {
                setStreamLiveUI(false);
                showDynamicToast('success', 'Live broadcast stopped.');
              } else {
                showDynamicToast('error', data.error || 'Could not stop stream.');
              }
            })
            .catch(function(err) {
              stopBtn.disabled = false;
              stopBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg> <span>Stop Broadcast</span>';
              showDynamicToast('error', 'Error stopping stream: ' + err.message);
            });
          });
        }

        // Auto-Detect Stream Key from Twitch
        if (autoKeyBtn) {
          autoKeyBtn.addEventListener('click', function() {
            autoKeyBtn.disabled = true;
            autoKeyBtn.textContent = 'Detecting...';

            fetch('/api/stream/auto-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              autoKeyBtn.disabled = false;
              autoKeyBtn.textContent = 'Auto-Detect from Twitch';

              if (data.ok) {
                if (keyInput) keyInput.placeholder = '••••••••••••••••••••••••';
                if (keyCaption) keyCaption.textContent = '✓ Key Configured: ' + data.streamKeyMasked;
                showDynamicToast('success', 'Stream key retrieved and saved from Twitch Helix!');
              } else {
                showDynamicToast('error', data.error || 'Could not detect stream key.');
              }
            })
            .catch(function(err) {
              autoKeyBtn.disabled = false;
              autoKeyBtn.textContent = 'Auto-Detect from Twitch';
              showDynamicToast('error', 'Auto-detect error: ' + err.message);
            });
          });
        }

        // Save Settings & Sync to Twitch (Title & Category only — no video re-encoding)
        if (saveSettingsBtn) {
          saveSettingsBtn.addEventListener('click', function() {
            var streamKey = keyInput ? keyInput.value.trim() : '';
            var title = titleInput ? titleInput.value.trim() : '';
            var category = categoryInput ? categoryInput.value.trim() : '';

            saveSettingsBtn.disabled = true;
            saveSettingsBtn.textContent = 'Saving & Syncing...';

            var payload = { title: title, category: category };
            if (streamKey) payload.streamKey = streamKey;

            fetch('/api/stream/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              saveSettingsBtn.disabled = false;
              saveSettingsBtn.textContent = 'Save & Update on Twitch';

              if (data.ok) {
                if (streamKey && keyCaption && data.streamSettings && data.streamSettings.streamKeyMasked) {
                  keyCaption.textContent = '✓ Key Configured: ' + data.streamSettings.streamKeyMasked;
                  keyInput.value = '';
                  keyInput.placeholder = '••••••••••••••••••••••••';
                }
                if (data.streamSettings) {
                  if (titleInput && data.streamSettings.title) {
                    titleInput.value = data.streamSettings.title;
                  }
                  if (categoryInput && data.streamSettings.category) {
                    categoryInput.value = data.streamSettings.category;
                  }
                }
                if (data.broadcastSync && !data.broadcastSync.ok) {
                  showDynamicToast('warning', data.message || 'Settings saved locally, but Twitch update failed.');
                } else {
                  showDynamicToast('success', data.message || 'Broadcast title & category updated on Twitch!');
                }
              } else {
                showDynamicToast('error', data.error || 'Failed to save settings.');
              }
            })
            .catch(function(err) {
              saveSettingsBtn.disabled = false;
              saveSettingsBtn.textContent = 'Save & Update on Twitch';
              showDynamicToast('error', 'Error saving settings: ' + err.message);
            });
          });
        }

        // Re-encode video loop at specified CBR bitrate
        if (applyBitrateBtn) {
          applyBitrateBtn.addEventListener('click', function() {
            var bitrateInput = document.getElementById('streamBitrateInput');
            var bitrate = bitrateInput ? parseInt(bitrateInput.value, 10) : 5000;
            if (isNaN(bitrate) || bitrate < 500 || bitrate > 10000) {
              showDynamicToast('error', 'Bitrate must be between 500 and 10000 kbps.');
              return;
            }

            applyBitrateBtn.disabled = true;
            applyBitrateBtn.textContent = 'Re-encoding...';

            fetch('/api/stream/settings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ bitrate: bitrate, recompileVideo: true }),
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              applyBitrateBtn.disabled = false;
              applyBitrateBtn.textContent = 'Re-encode at Bitrate';

              if (data.ok) {
                showDynamicToast('success', 'Showcase loop re-encoded at ' + bitrate + ' kbps.');
              } else {
                showDynamicToast('error', data.error || 'Failed to re-encode video loop.');
              }
            })
            .catch(function(err) {
              applyBitrateBtn.disabled = false;
              applyBitrateBtn.textContent = 'Re-encode at Bitrate';
              showDynamicToast('error', 'Re-encode error: ' + err.message);
            });
          });
        }

        // Pull / Sync Current Broadcast Metadata directly from Twitch
        if (syncTwitchBtn) {
          syncTwitchBtn.addEventListener('click', function() {
            syncTwitchBtn.disabled = true;
            syncTwitchBtn.textContent = 'Pulling...';

            fetch('/api/stream/sync-broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
              syncTwitchBtn.disabled = false;
              syncTwitchBtn.textContent = '↻ Pull from Twitch';

              if (data.ok && data.info) {
                if (titleInput && data.info.title) {
                  titleInput.value = data.info.title;
                }
                if (categoryInput && data.info.category) {
                  categoryInput.value = data.info.category;
                }
                showDynamicToast('success', 'Pulled current broadcast metadata from Twitch!');
              } else {
                showDynamicToast('error', data.error || 'Could not pull broadcast metadata from Twitch.');
              }
            })
            .catch(function(err) {
              syncTwitchBtn.disabled = false;
              syncTwitchBtn.textContent = '↻ Pull from Twitch';
              showDynamicToast('error', 'Sync error: ' + err.message);
            });
          });
        }

        function setStreamLiveUI(isLive, statusData) {
          if (isLive) {
            if (streamLiveBadge) {
              streamLiveBadge.className = 'ks-live-pill';
              streamLiveBadge.style.background = '';
              streamLiveBadge.style.border = '';
              streamLiveBadge.style.color = '';
              streamLiveBadge.innerHTML = '<span class="ks-dot-live"></span> LIVE (' + ((statusData && statusData.uptimeFormatted) || '0s') + ')';
            }
            if (startBtn) startBtn.style.display = 'none';
            if (stopBtn) stopBtn.style.display = '';
            if (telemetryBar) telemetryBar.style.display = 'flex';

            if (statusData) {
              if (telemetryUptime) telemetryUptime.textContent = statusData.uptimeFormatted || '0s';
              if (telemetryFps) telemetryFps.textContent = statusData.fps || 30;
              if (telemetryBitrate) telemetryBitrate.textContent = statusData.bitrate || '5000 kbps';
              if (telemetryPid) telemetryPid.textContent = statusData.pid || 'Active';
            }

            if (!telemetryPollTimer) {
              telemetryPollTimer = setInterval(pollStreamStatus, 4000);
            }
          } else {
            if (streamLiveBadge) {
              streamLiveBadge.className = 'ks-tag';
              streamLiveBadge.style.background = 'var(--ks-lacquer-deep)';
              streamLiveBadge.style.border = '1px solid var(--ks-rule)';
              streamLiveBadge.style.color = 'var(--ks-text-muted)';
              streamLiveBadge.textContent = '● Offline';
            }
            if (startBtn) startBtn.style.display = '';
            if (stopBtn) stopBtn.style.display = 'none';
            if (telemetryBar) telemetryBar.style.display = 'none';

            if (telemetryPollTimer) {
              clearInterval(telemetryPollTimer);
              telemetryPollTimer = null;
            }
          }
        }

        function pollStreamStatus() {
          fetch('/api/stream/status')
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (data && data.ok) {
                if (data.isLive) {
                  setStreamLiveUI(true, data);
                } else {
                  setStreamLiveUI(false);
                }
              }
            })
            .catch(function() {});
        }

        // Start polling if stream is initially live
        ${activeStream.isLive ? 'pollStreamStatus();' : ''}
      })();
    </script>
  `;

  return renderLayout({
    title: 'Host Control Center',
    content,
    user,
  });
}
