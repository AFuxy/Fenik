import { config } from '../config.js';
import { renderLayout } from './layout.js';

export function renderAdminView({ bot, channels, user = null, success = null, error = null }) {
  const content = `
    <div class="ks-container">
      ${success ? `
        <div class="ks-alert ks-alert-success" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5"/>
          </svg>
          <div style="flex: 1;"><strong>Success:</strong> ${success}</div>
          <button type="button" onclick="this.closest('.ks-alert').remove()" style="background:none;border:none;color:currentColor;opacity:0.6;cursor:pointer;padding:4px;display:flex;align-items:center;" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>
      ` : ''}

      ${error ? `
        <div class="ks-alert ks-alert-danger" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
          <div style="flex: 1;"><strong>Error:</strong> ${error}</div>
          <button type="button" onclick="this.closest('.ks-alert').remove()" style="background:none;border:none;color:currentColor;opacity:0.6;cursor:pointer;padding:4px;display:flex;align-items:center;" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>
      ` : ''}

      <!-- Central Bot Worker Account -->
      <section class="ks-card">
        <div class="ks-card-header">
          <div>
            <h2 class="ks-card-title">Central Bot Account</h2>
            <p class="ks-card-desc">The shared Twitch worker account executing chat responses across all connected channels.</p>
          </div>
        </div>

        <div style="background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs); padding: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px;">
          <div>
            <div style="font-family: var(--ks-mono); font-size: 0.75rem; color: var(--ks-text-muted); text-transform: uppercase; letter-spacing: 0.08em;">Connected Bot Account</div>
            <div style="display: flex; align-items: center; gap: 12px; margin-top: 6px;">
              <span style="font-size: 1.35rem; font-weight: 600; color: var(--ks-champagne);">
                ${bot ? `@${bot.displayName}` : 'No Bot Account Connected'}
              </span>
              ${bot ? `
                <span class="ks-live-pill"><span class="ks-dot-live"></span> Active</span>
              ` : `
                <span class="ks-tag" style="color: var(--ks-vermilion); border-color: oklch(58% 0.15 35 / 0.3);">Disconnected</span>
              `}
            </div>
            <div style="font-family: var(--ks-mono); font-size: 0.8rem; color: var(--ks-text-faint); margin-top: 4px;">
              ${bot ? `Twitch User ID: ${bot.userId}` : 'Authorize your dedicated bot Twitch account once to start serving chats'}
            </div>
          </div>

          <a href="/auth/bot" class="ks-button ks-button-primary">
            <span>${bot ? 'Re-authorize Bot Account' : 'Connect Central Bot Account'}</span>
            <span class="ks-button-arrow">
              <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </span>
          </a>
        </div>
      </section>

      <!-- Connected Streamers Roster -->
      <section class="ks-card">
        <div class="ks-card-header">
          <div>
            <h2 class="ks-card-title">Connected Streamers</h2>
            <p class="ks-card-desc">Active channels authorized to use the platform (${channels.length} total).</p>
          </div>
        </div>

        <div class="ks-table-wrap">
          <table class="ks-table">
            <thead>
              <tr>
                <th scope="col">Channel</th>
                <th scope="col">Status</th>
                <th scope="col">Commands</th>
                <th scope="col">Prefix</th>
                <th scope="col">Connected Date</th>
              </tr>
            </thead>
            <tbody>
              ${channels.length > 0 ? channels.map(ch => `
                <tr>
                  <td>
                    <div style="font-weight: 600; color: var(--ks-champagne);">#${ch.login}</div>
                    <div style="color: var(--ks-text-muted); font-size: 0.8rem;">${ch.displayName}</div>
                  </td>
                  <td>
                    ${ch.joined 
                      ? `<span class="ks-tag ks-tag-patina">Active</span>`
                      : `<span class="ks-tag">Paused</span>`
                    }
                  </td>
                  <td style="font-family: var(--ks-mono); font-size: 0.85rem;">${ch.commands?.length || 0}</td>
                  <td><span class="ks-tag ks-tag-gold">${ch.prefix}</span></td>
                  <td style="font-family: var(--ks-mono); font-size: 0.8rem; color: var(--ks-text-muted);">${new Date(ch.createdAt).toLocaleDateString()}</td>
                </tr>
              `).join('') : `
                <tr>
                  <td colspan="5" style="text-align: center; color: var(--ks-text-muted); padding: 36px 14px;">
                    No channels authorized yet. Share the home page with streamers to begin onboarding.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  `;

  return renderLayout({
    title: 'Host Control',
    content,
    user,
  });
}
