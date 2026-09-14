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
  user = null,
  success = null,
  error = null,
}) {
  const totalChannels = stats.totalChannels ?? channels.length;
  const joinedCount = stats.joinedCount ?? channels.filter((c) => c.joined).length;
  const fullySetupCount = stats.fullySetupCount ?? channels.filter((c) => c.setupState?.isFullySetup).length;
  const moddedCount = stats.moddedCount ?? channels.filter((c) => c.setupState?.isBotMod === true).length;
  const totalCommands = stats.totalCommands ?? channels.reduce((acc, c) => acc + (c.commands?.length || 0), 0);
  const totalTimers = stats.totalTimers ?? channels.reduce((acc, c) => acc + (c.timers?.length || 0), 0);

  const content = `
    <div class="ks-container" style="max-width: 1320px;">
      
      <!-- Alert Flash Messages -->
      ${success ? `
        <div class="ks-alert ks-alert-success" role="alert" style="margin-bottom: 20px;">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3.5 8.5L6.5 11.5L12.5 4.5"/>
          </svg>
          <div style="flex: 1;"><strong>Success:</strong> ${escapeHtml(success)}</div>
          <button type="button" onclick="this.closest('.ks-alert').remove()" style="background:none;border:none;color:currentColor;opacity:0.6;cursor:pointer;padding:4px;display:flex;align-items:center;" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>
      ` : ''}

      ${error ? `
        <div class="ks-alert ks-alert-danger" role="alert" style="margin-bottom: 20px;">
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 4l8 8M12 4l-8 8"/>
          </svg>
          <div style="flex: 1;"><strong>Error:</strong> ${escapeHtml(error)}</div>
          <button type="button" onclick="this.closest('.ks-alert').remove()" style="background:none;border:none;color:currentColor;opacity:0.6;cursor:pointer;padding:4px;display:flex;align-items:center;" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>
      ` : ''}

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
        <div class="ks-card-header">
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

          <div>
            <a href="/auth/bot" class="ks-button ks-button-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <span>${bot ? 'Re-authorize Bot Account' : 'Authorize Central Bot Account'}</span>
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
            </div>
          </div>

          ${bot ? `
            <div style="display: flex; align-items: center; gap: 8px;">
              <a href="https://twitch.tv/${bot.login}" target="_blank" rel="noopener noreferrer" class="ks-button ks-button-secondary" style="min-height: 32px; padding: 0 12px; font-size: 0.8rem;">
                <span>View on Twitch</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            </div>
          ` : ''}
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
      <div id="deleteAccountModal" class="ks-modal-backdrop" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.78); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 16px;">
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
                <h3 style="font-size: 1.15rem; font-weight: 700; color: var(--ks-champagne); margin: 0;">Permanently Delete Account</h3>
                <div style="font-size: 0.78rem; color: var(--ks-text-muted);">Irreversible channel and user purge</div>
              </div>
            </div>
            
            <button type="button" id="closeDeleteModalBtn" style="background: none; border: none; color: var(--ks-text-muted); cursor: pointer; padding: 4px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          <p style="font-size: 0.86rem; color: var(--ks-text-warm); line-height: 1.5; margin-bottom: 16px;">
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

        function openModal(btn) {
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
          }
        }

        function closeModal() {
          if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
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
        });

        if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
        if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeModal);

        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
            closeModal();
          }
        });
      })();
    </script>
  `;

  return renderLayout({
    title: 'Host Control Center',
    content,
    user,
  });
}
