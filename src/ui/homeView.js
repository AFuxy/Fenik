import { config } from '../config.js';
import { getBotAccount } from '../db/index.js';
import { renderLayout } from './layout.js';

export function renderHomeView({ user = null, error = null, success = null }) {
  const bot = getBotAccount();

  const extraCss = `
    .ks-hero {
      padding: clamp(64px, 10vw, 112px) 0 clamp(48px, 6vw, 72px);
      max-width: 860px;
      margin: 0 auto;
      text-align: center;
    }
    .ks-hero-title {
      font-family: var(--ks-font-display);
      font-size: clamp(3.2rem, 6.4vw, 5.4rem);
      font-weight: 250;
      line-height: 1.02;
      letter-spacing: -0.01em;
      color: var(--ks-champagne);
      margin-bottom: 24px;
    }
    .ks-hero-body {
      font-family: var(--ks-font);
      font-size: clamp(1.05rem, 1.8vw, 1.25rem);
      color: var(--ks-text-muted);
      max-width: 68ch;
      margin: 0 auto 40px;
      line-height: 1.6;
    }
    .ks-hero-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    /* Interactive Live Stream Chat Proof Module */
    .ks-proof-frame {
      max-width: 780px;
      margin: 48px auto 0;
      background: var(--ks-raised-lacquer);
      border: 1px solid var(--ks-rule);
      border-radius: var(--ks-radius-sm);
      overflow: hidden;
      box-shadow: 0 16px 36px -12px oklch(0% 0 0 / 0.6);
      text-align: left;
    }
    .ks-proof-header {
      background: var(--ks-lacquer-deep);
      border-bottom: 1px solid var(--ks-rule);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-family: var(--ks-mono);
      font-size: 0.72rem;
      color: var(--ks-text-muted);
    }
    .ks-proof-dots {
      display: flex;
      gap: 6px;
    }
    .ks-proof-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ks-graphite-2);
    }
    .ks-chat-feed {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      font-size: 0.92rem;
    }
    .ks-chat-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      line-height: 1.5;
    }
    .ks-chat-user {
      font-weight: 600;
      color: var(--ks-patina);
      font-size: 0.88rem;
    }
    .ks-chat-bot {
      font-weight: 600;
      color: var(--ks-kinpaku);
      font-size: 0.88rem;
    }
    .ks-chat-text {
      color: var(--ks-champagne);
    }

    /* Bento Section */
    .ks-section-lead {
      max-width: 640px;
      margin-bottom: 32px;
    }
    .ks-section-lead h2 {
      font-family: var(--ks-font-display);
      font-size: clamp(2.2rem, 4vw, 3.2rem);
      font-weight: 300;
      line-height: 1.06;
      color: var(--ks-champagne);
      margin-bottom: 10px;
    }
    .ks-section-lead p {
      color: var(--ks-text-muted);
      font-size: 1rem;
    }

    /* Direct Steps */
    .ks-steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1px;
      background: var(--ks-rule);
      border: 1px solid var(--ks-rule);
      border-radius: var(--ks-radius-sm);
      overflow: hidden;
      margin-top: 48px;
    }
    .ks-step-tile {
      background: var(--ks-lacquer-black);
      padding: 32px 28px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ks-step-num {
      font-family: var(--ks-mono);
      font-size: 0.74rem;
      color: var(--ks-kinpaku);
      letter-spacing: 0.1em;
    }
    .ks-step-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--ks-champagne);
    }
    .ks-step-body {
      font-size: 0.88rem;
      color: var(--ks-text-muted);
      line-height: 1.5;
    }
  `;

  const content = `
    <main class="ks-container">
    <!-- Floating Toast Notifications Container (Fixed overlay: never pushes content down) -->
    <div class="ks-toast-container" id="ks-toast-container" aria-live="polite" aria-atomic="true">
      ${success ? `
        <div class="ks-toast ks-toast-success" role="status">
          <div class="ks-toast-body">
            <svg class="ks-toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <div class="ks-toast-text">${success}</div>
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
            <div class="ks-toast-text">${error}</div>
          </div>
          <button type="button" class="ks-toast-close" aria-label="Dismiss notification">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>
      ` : ''}
    </div>

      <!-- Hero Section -->
      <section class="ks-hero">
        <h1 class="ks-hero-title">A modern Twitch bot built for your community.</h1>
        <p class="ks-hero-body">
          Instant custom commands, hands-off auto-moderation, and granular permissions.
          One click to authorize, zero maintenance required.
        </p>

        <div class="ks-hero-actions">
          ${user ? `
            <a href="/dashboard" class="ks-button ks-button-primary ks-button-lg">
              <span>Open Dashboard</span>
              <span class="ks-button-arrow" aria-hidden="true">
                <svg viewBox="0 0 14 8" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M0 4h12M8 0l4 4-4 4"/>
                </svg>
              </span>
            </a>
          ` : `
            <a href="/auth/login" class="ks-button ks-button-primary ks-button-lg">
              <span>Add to Twitch</span>
              <span class="ks-button-arrow" aria-hidden="true">
                <svg viewBox="0 0 14 8" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M0 4h12M8 0l4 4-4 4"/>
                </svg>
              </span>
            </a>
          `}
          <a href="#features" class="ks-button ks-button-secondary ks-button-lg">
            <span>Explore Features</span>
          </a>
        </div>

        <!-- Live Chat Simulator Proof -->
        <div class="ks-proof-frame" aria-label="Interactive chat simulator">
          <div class="ks-proof-header">
            <div class="ks-proof-dots">
              <span class="ks-proof-dot"></span>
              <span class="ks-proof-dot"></span>
              <span class="ks-proof-dot"></span>
            </div>
            <span>#streamer_chat · LIVE STREAM</span>
            <span>0.0ms LATENCY</span>
          </div>
          <div class="ks-chat-feed">
            <div class="ks-chat-row">
              <span class="ks-chat-user">viewer_99</span>
              <span class="ks-chat-text">!discord</span>
            </div>
            <div class="ks-chat-row">
              <span class="ks-chat-bot">${config.botName}</span>
              <span class="ks-chat-text">Join our community Discord: https://discord.gg/yourchannel</span>
            </div>
            <div class="ks-chat-row">
              <span class="ks-chat-user">regular_chatter</span>
              <span class="ks-chat-text">!roll 20</span>
            </div>
            <div class="ks-chat-row">
              <span class="ks-chat-bot">${config.botName}</span>
              <span class="ks-chat-text">@regular_chatter rolled a 19 (1-20).</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Bento Grid Architecture (No nested card soup) -->
      <section id="features" style="padding-top: 48px;">
        <div class="ks-section-lead">
          <h2>Engineered for stream stability.</h2>
          <p>Everything your channel needs to run seamlessly without technical friction.</p>
        </div>

        <div class="ks-bento">
          <article class="ks-bento-tile ks-bento-tile--span-4">
            <span class="ks-tile-num">01 / DISPATCH</span>
            <h3 class="ks-tile-h">Custom Commands Studio</h3>
            <p class="ks-tile-p">
              Configure commands with dynamic variables like <code>{user}</code>, <code>{target}</code>, and execution counters. Set per-command cooldowns and aliases in seconds.
            </p>
          </article>

          <article class="ks-bento-tile ks-bento-tile--span-4">
            <span class="ks-tile-num">02 / DEFENSE</span>
            <h3 class="ks-tile-h">Hands-Off Auto-Moderation</h3>
            <p class="ks-tile-p">
              Protect your chat from unpermitted links, aggressive uppercase spam, and banned phrases. Moderators can grant temporary link permits with <code>!permit &lt;user&gt;</code>.
            </p>
          </article>

          <article class="ks-bento-tile ks-bento-tile--span-4">
            <span class="ks-tile-num">03 / RBAC</span>
            <h3 class="ks-tile-h">Manager Permissions</h3>
            <p class="ks-tile-p">
              Restrict sensitive commands to Subscribers, VIPs, or Moderators. Authorize trusted staff to manage channel commands without giving away your Twitch credentials.
            </p>
          </article>
        </div>
      </section>

      <!-- Step sequence with sequence information -->
      <section style="padding: 40px 0;">
        <div class="ks-section-lead">
          <h2>Three steps to live.</h2>
          <p>Connect your channel in seconds and manage everything through your dashboard.</p>
        </div>

        <div class="ks-steps-grid">
          <div class="ks-step-tile">
            <span class="ks-step-num">STEP ONE</span>
            <div class="ks-step-title">Authorize with Twitch</div>
            <p class="ks-step-body">Click "Add to Twitch" to grant the bot permission to speak in your channel.</p>
          </div>
          <div class="ks-step-tile">
            <span class="ks-step-num">STEP TWO</span>
            <div class="ks-step-title">Mod the Bot in Chat</div>
            <p class="ks-step-body">Type <code>/mod ${bot ? bot.login : config.botName}</code> in your Twitch chat so the bot is recognized as a channel moderator.</p>
          </div>
          <div class="ks-step-tile">
            <span class="ks-step-num">STEP THREE</span>
            <div class="ks-step-title">Customize Commands</div>
            <p class="ks-step-body">Add your Discord, social links, and moderation rules in your dashboard.</p>
          </div>
        </div>
      </section>

      <script>
        (function() {
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

          document.querySelectorAll('.ks-toast').forEach(function(toast) {
            var isError = toast.classList.contains('ks-toast-error');
            setupToast(toast, isError ? 6000 : 4500);
          });
        })();
      </script>
    </main>
  `;

  return renderLayout({
    title: 'Modern Twitch Bot',
    content,
    user,
    extraCss,
  });
}
