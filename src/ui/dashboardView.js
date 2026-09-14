import { config } from '../config.js';
import { renderLayout, DEFAULT_AVATAR_URL } from './layout.js';
import { BUILTIN_COMMANDS } from '../db/index.js';

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderDashboardView({
  channel,
  user,
  accessibleChannels = [],
  role = 'owner',
  isOwner = true,
  success = null,
  error = null,
  activeTab = 'commands',
}) {
  const currentPrefix = channel.prefix || '!';
  const disabledSet = new Set(channel.disabledBuiltins || []);
  const activeBuiltinCount = BUILTIN_COMMANDS.filter((b) => !disabledSet.has(b.id)).length;
  const timers = channel.timers || [];
  const activeTimerCount = timers.filter((t) => t.enabled).length;

  const chatGroupTabs = ['commands', 'builtins', 'timers', 'raids', 'shoutouts'];
  const safetyGroupTabs = ['moderation'];
  const settingsGroupTabs = ['prefix', 'managers', 'test'];

  const raidSettings = channel.raidSettings || {
    enabled: true,
    minViewers: 1,
    message: 'Huge raid welcome to @{raider} and their {viewers} raiders! They were last streaming {game}. Show them some love at {url} <3',
    cooldownMinutes: 30,
  };

  const shoutoutSettings = channel.shoutoutSettings || {
    enabled: true,
    message: 'Shoutout to @{target}! Check them out over at {url} - they were last streaming {game}! Give them a follow! <3',
    autoOnRaid: true,
    sendTwitchShoutout: true,
    userlevel: 'mod',
    cooldownSeconds: 15,
  };

  const autoShoutouts = channel.autoShoutouts || [];

  function formatRelativeTime(ts) {
    if (!ts || ts === 0) return 'Never';
    const diffMs = Date.now() - ts;
    if (diffMs < 0) return 'Just now';
    const diffMin = Math.floor(diffMs / (60 * 1000));
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  const tabTitleMap = {
    commands: 'Custom Commands',
    builtins: 'Built-in Commands',
    timers: 'Chat Timers',
    raids: 'Raid Welcomes',
    shoutouts: 'Shoutouts',
    prefix: 'Command Prefix',
    moderation: 'Auto-Moderation',
    managers: 'Managers & Access',
    test: 'Live Test Message',
  };
  const currentTabTitle = tabTitleMap[activeTab] || 'Menu';

  // Keep groups expanded by default so dropdowns never retract unexpectedly on refresh
  const isChatOpen = true;
  const isSafetyOpen = true;
  const isSettingsOpen = true;

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

      <!-- Channel Profile & Bot Status -->
      <header class="ks-channel-header">
        <div class="ks-channel-profile">
          <img 
            src="${channel.avatar || DEFAULT_AVATAR_URL}" 
            class="ks-channel-avatar" 
            alt="${channel.displayName}"
            onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'"
          >
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <div class="ks-channel-name">${channel.displayName}</div>
              <span class="ks-tag ${isOwner ? 'ks-tag-gold' : ''}" style="font-size: 0.72rem; padding: 2px 7px;">
                ${isOwner ? 'Broadcaster' : 'Channel Manager'}
              </span>
            </div>
            <div class="ks-channel-sub">twitch.tv/${channel.login}</div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.85rem; color: var(--ks-text-secondary); font-weight: 500;">Prefix:</span>
            <button 
              type="button" 
              data-tab="prefix"
              class="ks-tag ks-tag-gold" 
              style="font-family: var(--ks-mono); font-weight: 700; cursor: pointer; border: 1px dashed var(--ks-gold-hairline);" 
              title="Click to change prefix"
            >
              ${currentPrefix}
            </button>
          </div>

          <form action="/api/channel/toggle" method="POST" style="display: flex; align-items: center; gap: 10px; margin: 0;">
            <input type="hidden" name="channelId" value="${channel.id}">
            <input type="hidden" name="joined" value="${channel.joined ? '' : '1'}">
            <span style="font-size: 0.85rem; color: var(--ks-text-secondary); font-weight: 500;">
              Bot: <strong style="color: ${channel.joined ? 'var(--ks-gold)' : 'var(--ks-text-muted)'};">${channel.joined ? 'Active' : 'Paused'}</strong>
            </span>
            <button 
              type="submit" 
              class="ks-button ${channel.joined ? 'ks-button-secondary' : 'ks-button-primary'}"
              style="min-height: 32px; padding: 0 14px; font-size: 0.8rem;"
            >
              ${channel.joined ? 'Pause Bot' : 'Activate Bot'}
            </button>
          </form>
        </div>
      </header>

      <!-- Dashboard Two-Column Shell -->
      <div class="ks-dashboard-shell">
        <!-- Left Navigation Sidebar -->
        <aside class="ks-sidebar" aria-label="Dashboard navigation">
          <!-- Mobile Navigation Toggle Bar -->
          <div class="ks-sidebar-mobile-bar">
            <button type="button" class="ks-sidebar-mobile-toggle" id="ksSidebarMobileToggle" aria-expanded="false" aria-label="Toggle navigation menu">
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                <span style="font-size: 0.85rem; font-weight: 600; color: var(--ks-text-primary);">Navigation</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span class="ks-sidebar-mobile-badge" id="ksSidebarActiveBadge">${currentTabTitle}</span>
                <svg class="ks-sidebar-mobile-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
            </button>
          </div>

          <div class="ks-sidebar-inner">

            <!-- 1. Chat & Commands Group (Collapsible Dropdown) -->
            <div class="ks-sidebar-group ${isChatOpen ? '' : 'is-collapsed'}" data-group="chat">
              <button type="button" class="ks-sidebar-group-header" aria-expanded="${isChatOpen ? 'true' : 'false'}">
                <div class="ks-sidebar-group-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <span>Chat & Commands</span>
                </div>
                <svg class="ks-sidebar-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              <div class="ks-sidebar-items">
                <button type="button" data-tab="commands" class="ks-sidebar-item ${activeTab === 'commands' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                  <span class="ks-sidebar-item-label">Custom Commands</span>
                  <span class="ks-tag ks-tag-gold" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${channel.commands?.length || 0}</span>
                </button>

                <button type="button" data-tab="builtins" class="ks-sidebar-item ${activeTab === 'builtins' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Built-in Commands</span>
                  <span class="ks-tag ${activeBuiltinCount > 0 ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${activeBuiltinCount}/${BUILTIN_COMMANDS.length}</span>
                </button>

                <button type="button" data-tab="timers" class="ks-sidebar-item ${activeTab === 'timers' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span class="ks-sidebar-item-label">Chat Timers</span>
                  <span class="ks-tag ${activeTimerCount > 0 ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${activeTimerCount}/${timers.length}</span>
                </button>

                <button type="button" data-tab="raids" class="ks-sidebar-item ${activeTab === 'raids' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Raid Welcomes</span>
                  <span class="ks-tag ${raidSettings.enabled ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">
                    ${raidSettings.enabled ? 'On' : 'Off'}
                  </span>
                </button>

                <button type="button" data-tab="shoutouts" class="ks-sidebar-item ${activeTab === 'shoutouts' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Shoutouts</span>
                  <span class="ks-tag ${shoutoutSettings.enabled ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">
                    ${shoutoutSettings.enabled ? (autoShoutouts.length > 0 ? `${autoShoutouts.length} auto` : 'On') : 'Off'}
                  </span>
                </button>
              </div>
            </div>

            <!-- 2. Safety & Protection Group (Collapsible Dropdown) -->
            <div class="ks-sidebar-group ${isSafetyOpen ? '' : 'is-collapsed'}" data-group="safety">
              <button type="button" class="ks-sidebar-group-header" aria-expanded="${isSafetyOpen ? 'true' : 'false'}">
                <div class="ks-sidebar-group-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                  <span>Safety & Protection</span>
                </div>
                <svg class="ks-sidebar-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              <div class="ks-sidebar-items">
                <button type="button" data-tab="moderation" class="ks-sidebar-item ${activeTab === 'moderation' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                  </svg>
                  <span class="ks-sidebar-item-label">Auto-Moderation</span>
                  ${(channel.moderation?.filterLinks || channel.moderation?.filterCaps || (channel.moderation?.bannedWords && channel.moderation?.bannedWords.length > 0)) ? `
                    <span class="ks-tag ks-tag-gold" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">On</span>
                  ` : ''}
                </button>
              </div>
            </div>

            <!-- 3. Channel Settings & Tools Group (Collapsible Dropdown) -->
            <div class="ks-sidebar-group ${isSettingsOpen ? '' : 'is-collapsed'}" data-group="settings">
              <button type="button" class="ks-sidebar-group-header" aria-expanded="${isSettingsOpen ? 'true' : 'false'}">
                <div class="ks-sidebar-group-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                  <span>Settings & Tools</span>
                </div>
                <svg class="ks-sidebar-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              <div class="ks-sidebar-items">
                <button type="button" data-tab="prefix" class="ks-sidebar-item ${activeTab === 'prefix' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="4" y1="9" x2="20" y2="9"></line>
                    <line x1="4" y1="15" x2="20" y2="15"></line>
                    <line x1="10" y1="3" x2="8" y2="21"></line>
                    <line x1="16" y1="3" x2="14" y2="21"></line>
                  </svg>
                  <span class="ks-sidebar-item-label">Command Prefix</span>
                  <span class="ks-tag ks-tag-gold" style="font-family: var(--ks-mono); font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${currentPrefix}</span>
                </button>

                <button type="button" data-tab="managers" class="ks-sidebar-item ${activeTab === 'managers' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Managers & Access</span>
                  <span class="ks-tag" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${channel.managers?.length || 0}</span>
                </button>

                <button type="button" data-tab="test" class="ks-sidebar-item ${activeTab === 'test' ? 'active' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                  <span class="ks-sidebar-item-label">Live Test Message</span>
                </button>
              </div>
            </div>

          </div>
        </aside>

        <!-- Main Content Area -->
        <main class="ks-dashboard-main">

      <!-- 1. CUSTOM COMMANDS TAB -->
      <div id="tab-commands" class="ks-tab-content ${activeTab === 'commands' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Channel Commands</h2>
              <p class="ks-card-desc">Commands respond instantly in stream chat using prefix <code>${currentPrefix}</code>.</p>
            </div>
            <button type="button" id="openAddCommandBtn" class="ks-button ks-button-primary">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              <span>Add Command</span>
            </button>
          </div>

          <div class="ks-table-wrap">
            <table class="ks-table">
              <thead>
                <tr>
                  <th scope="col">Trigger</th>
                  <th scope="col">Response</th>
                  <th scope="col">Permission</th>
                  <th scope="col">Cooldown</th>
                  <th scope="col">Uses</th>
                  <th scope="col" style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${(channel.commands && channel.commands.length > 0) ? channel.commands.map((cmd) => `
                  <tr>
                    <td><span class="ks-tag ks-tag-gold">${currentPrefix}${cmd.trigger}</span></td>
                    <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem;">
                      ${cmd.response}
                    </td>
                    <td><span class="ks-tag">${cmd.userlevel}</span></td>
                    <td style="font-family: var(--ks-mono); font-size: 0.85rem;">${cmd.cooldown || 5}s</td>
                    <td style="font-family: var(--ks-mono); font-size: 0.85rem;">${cmd.counter || 0}</td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button 
                        type="button" 
                        class="ks-button ks-button-secondary edit-command-btn" 
                        style="min-height: 26px; padding: 0 10px; font-size: 0.78rem; margin-right: 6px;"
                        data-cmd-id="${cmd.id}"
                        data-cmd-trigger="${escapeAttr(cmd.trigger)}"
                        data-cmd-response="${escapeAttr(cmd.response)}"
                        data-cmd-userlevel="${escapeAttr(cmd.userlevel)}"
                        data-cmd-cooldown="${cmd.cooldown || 5}"
                        title="Edit ${currentPrefix}${cmd.trigger}"
                      >
                        Edit
                      </button>
                      <form action="/api/commands/delete" method="POST" style="display: inline;" onsubmit="return confirm('Delete ${currentPrefix}${cmd.trigger}?');">
                        <input type="hidden" name="channelId" value="${channel.id}">
                        <input type="hidden" name="commandId" value="${cmd.id}">
                        <button type="submit" class="ks-button ks-button-danger" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">Delete</button>
                      </form>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="6" style="text-align: center; color: var(--ks-text-muted); padding: 36px 14px;">
                      No custom commands configured yet. Click <strong>Add Command</strong> above to create your first response.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
          <div style="margin-top: 18px; padding: 14px 18px; border-radius: var(--ks-radius-sm); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
            <div style="font-size: 0.85rem; color: var(--ks-text-muted);">
              Looking for standard bot utilities like <code>${currentPrefix}ping</code>, <code>${currentPrefix}roll</code>, or <code>${currentPrefix}so</code>?
            </div>
            <button type="button" data-tab="builtins" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 12px; font-size: 0.8rem;">
              Manage Built-in Commands (${activeBuiltinCount} active)
            </button>
          </div>
        </section>

        <!-- Add / Edit Command Form Card -->
        <section class="ks-card" id="addCommandCard" style="display: none; border-color: var(--ks-gold-hairline);">
          <div class="ks-card-header">
            <div>
              <h3 class="ks-card-title" id="commandFormTitle">New Custom Command</h3>
              <p class="ks-card-desc" id="commandFormDesc">Define a command trigger, access level, and automated response.</p>
            </div>
            <button type="button" id="cancelAddCommandBtn" class="ks-button ks-button-secondary">Cancel</button>
          </div>

          <form action="/api/commands/save" method="POST" id="commandForm">
            <input type="hidden" name="channelId" value="${channel.id}" />
            <input type="hidden" id="cmd-id" name="commandId" value="" />

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
              <div class="ks-form-group">
                <label class="ks-label" for="cmd-trigger">Command Trigger (without prefix: ${currentPrefix})</label>
                <input type="text" id="cmd-trigger" name="trigger" class="ks-input-text" placeholder="discord, specs, socials" required pattern="[a-zA-Z0-9_]+" />
              </div>
              <div class="ks-form-group">
                <label class="ks-label" for="cmd-userlevel">Permission Level</label>
                <select id="cmd-userlevel" name="userlevel" class="ks-select">
                  <option value="everyone">Everyone (All chatters)</option>
                  <option value="sub">Subscribers & Founders</option>
                  <option value="vip">VIPs & above</option>
                  <option value="mod">Moderators only</option>
                  <option value="broadcaster">Broadcaster only</option>
                </select>
              </div>
            </div>

            <div class="ks-form-group">
              <label class="ks-label" for="cmd-response">
                Response Message
                <span style="color: var(--ks-text-faint); font-weight: normal; margin-left: 8px;">
                  Variables: <code>{user}</code>, <code>{target}</code>, <code>{count}</code>, <code>{channel}</code>
                </span>
              </label>
              <input type="text" id="cmd-response" name="response" class="ks-input-text" placeholder="Join our Discord community at https://discord.gg/..." required maxlength="500" />
            </div>

            <div style="display: grid; grid-template-columns: 140px 1fr; gap: 16px; align-items: flex-end;">
              <div class="ks-form-group" style="margin-bottom: 0;">
                <label class="ks-label" for="cmd-cooldown">Cooldown (seconds)</label>
                <input type="number" id="cmd-cooldown" name="cooldown" class="ks-input-text" value="5" min="1" max="300" />
              </div>
              <div>
                <button type="submit" class="ks-button ks-button-primary" style="min-height: var(--ks-control-md);">
                  <span id="cmd-submit-label">Save Command</span>
                  <span class="ks-button-arrow">
                    <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>

      <!-- 2. BUILT-IN COMMANDS TAB -->
      <div id="tab-builtins" class="ks-tab-content ${activeTab === 'builtins' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Built-in Bot Commands</h2>
              <p class="ks-card-desc">Core utilities and moderation commands available in stream chat using prefix <code>${currentPrefix}</code>. Toggle off any command you wish to disable in this channel.</p>
            </div>
            <div style="font-size: 0.82rem; color: var(--ks-text-muted);">
              Active: <strong style="color: var(--ks-champagne);">${activeBuiltinCount}</strong> / ${BUILTIN_COMMANDS.length}
            </div>
          </div>

          <div class="ks-table-wrap">
            <table class="ks-table">
              <thead>
                <tr>
                  <th scope="col" style="width: 150px;">Trigger</th>
                  <th scope="col">Command & Purpose</th>
                  <th scope="col" style="width: 140px;">Permission</th>
                  <th scope="col" style="width: 110px;">Status</th>
                  <th scope="col" style="width: 90px; text-align: right;">State</th>
                </tr>
              </thead>
              <tbody>
                ${BUILTIN_COMMANDS.map((b) => {
                  const isDisabled = disabledSet.has(b.id);
                  return `
                    <tr>
                      <td>
                        <span class="ks-tag ${isDisabled ? '' : 'ks-tag-gold'}" style="font-family: var(--ks-mono); font-size: 0.88rem;">
                          ${currentPrefix}${b.trigger}
                        </span>
                      </td>
                      <td>
                        <div style="font-weight: 600; font-size: 0.92rem; color: var(--ks-champagne); margin-bottom: 3px;">
                          ${b.name}
                        </div>
                        <div style="font-size: 0.82rem; color: var(--ks-text-muted); line-height: 1.4;">
                          ${b.description}
                        </div>
                        <div style="font-size: 0.76rem; color: var(--ks-text-faint); margin-top: 4px; font-family: var(--ks-mono);">
                          Usage: <code>${currentPrefix}${b.usage}</code>
                        </div>
                      </td>
                      <td>
                        <span class="ks-tag">${b.userlevel === 'mod' ? 'Moderators only' : 'Everyone'}</span>
                      </td>
                      <td>
                        ${isDisabled 
                          ? `<span class="ks-tag" style="opacity: 0.5;">Disabled</span>`
                          : `<span class="ks-tag ks-tag-gold"><span class="ks-dot-live" style="width: 5px; height: 5px; display: inline-block; margin-right: 4px; vertical-align: middle;"></span>Active</span>`
                        }
                      </td>
                      <td style="text-align: right;">
                        <form action="/api/commands/builtin/toggle" method="POST" style="margin: 0; display: inline-flex; align-items: center;">
                          <input type="hidden" name="channelId" value="${channel.id}">
                          <input type="hidden" name="command" value="${b.id}">
                          <input type="hidden" name="hasEnabledField" value="1">
                          <label class="ks-toggle" title="${isDisabled ? 'Enable' : 'Disable'} ${currentPrefix}${b.trigger}">
                            <input 
                              type="checkbox" 
                              name="enabled" 
                              value="true" 
                              ${!isDisabled ? 'checked' : ''} 
                              onchange="this.form.submit()"
                            >
                            <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
                          </label>
                        </form>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- 2b. CHAT TIMERS TAB -->
      <div id="tab-timers" class="ks-tab-content ${activeTab === 'timers' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Scheduled Chat Timers</h2>
              <p class="ks-card-desc">
                Post recurring messages for your Discord, social handles, stream rules, or sponsor promotions.
                Timers only fire when chat is active so the bot never spams a quiet room.
              </p>
            </div>
            <button type="button" id="openAddTimerBtn" class="ks-button ks-button-primary">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              <span>Add Timer</span>
            </button>
          </div>

          <div class="ks-table-wrap">
            <table class="ks-table">
              <thead>
                <tr>
                  <th scope="col">Timer Name</th>
                  <th scope="col">Message</th>
                  <th scope="col">Interval</th>
                  <th scope="col">Chat Activity</th>
                  <th scope="col" style="text-align: center;">Active</th>
                  <th scope="col" style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${timers.length > 0 ? timers.map((t) => `
                  <tr>
                    <td><span class="ks-tag ks-tag-gold">${escapeAttr(t.name)}</span></td>
                    <td style="max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.88rem;" title="${escapeAttr(t.message)}">
                      ${escapeAttr(t.message)}
                    </td>
                    <td><span class="ks-tag" style="font-family: var(--ks-mono);">Every ${t.intervalMinutes}m</span></td>
                    <td>
                      <span class="ks-tag" style="font-family: var(--ks-mono);">
                        ${t.minChatLines > 0 ? `≥ ${t.minChatLines} lines` : 'Always'}
                      </span>
                    </td>
                    <td style="text-align: center;">
                      <form action="/api/timers/toggle" method="POST" style="display: inline-block;">
                        <input type="hidden" name="channelId" value="${channel.id}">
                        <input type="hidden" name="timerId" value="${t.id}">
                        <input type="hidden" name="hasEnabledField" value="1">
                        <label class="ks-toggle" title="${t.enabled ? 'Pause' : 'Enable'} timer &quot;${escapeAttr(t.name)}&quot;">
                          <input 
                            type="checkbox" 
                            name="enabled" 
                            value="true" 
                            ${t.enabled ? 'checked' : ''} 
                            onchange="this.form.submit()"
                          >
                          <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
                        </label>
                      </form>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                      <button 
                        type="button" 
                        class="ks-button ks-button-secondary edit-timer-btn" 
                        style="min-height: 26px; padding: 0 10px; font-size: 0.78rem; margin-right: 6px;"
                        data-timer-id="${t.id}"
                        data-timer-name="${escapeAttr(t.name)}"
                        data-timer-message="${escapeAttr(t.message)}"
                        data-timer-interval="${t.intervalMinutes}"
                        data-timer-lines="${t.minChatLines}"
                        title="Edit ${escapeAttr(t.name)}"
                      >
                        Edit
                      </button>
                      <form action="/api/timers/delete" method="POST" style="display: inline;" onsubmit="return confirm('Delete timer &quot;${escapeAttr(t.name)}&quot;?');">
                        <input type="hidden" name="channelId" value="${channel.id}">
                        <input type="hidden" name="timerId" value="${t.id}">
                        <button type="submit" class="ks-button ks-button-danger" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">Delete</button>
                      </form>
                    </td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="6" style="text-align: center; color: var(--ks-text-muted); padding: 36px 14px;">
                      <div style="max-width: 440px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ks-gold)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85; margin-bottom: 4px;">
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <div style="font-weight: 600; color: var(--ks-text-primary); font-size: 0.98rem;">No Scheduled Timers Yet</div>
                        <div style="font-size: 0.85rem; line-height: 1.45; color: var(--ks-text-muted);">
                          Keep chatters informed with automated social links, discord invites, or rules on a customizable interval.
                        </div>
                      </div>
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Add / Edit Timer Form Card -->
        <section class="ks-card" id="addTimerCard" style="display: none; border-color: var(--ks-gold-hairline); margin-top: 18px;">
          <div class="ks-card-header">
            <div>
              <h3 class="ks-card-title" id="timerFormTitle">New Scheduled Timer</h3>
              <p class="ks-card-desc" id="timerFormDesc">Configure recurring message content, posting interval, and chat activity requirements.</p>
            </div>
            <button type="button" id="cancelAddTimerBtn" class="ks-button ks-button-secondary">Cancel</button>
          </div>

          <form action="/api/timers/save" method="POST" id="timerForm">
            <input type="hidden" name="channelId" value="${channel.id}" />
            <input type="hidden" id="timer-id" name="timerId" value="" />

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
              <div class="ks-form-group">
                <label class="ks-label" for="timer-name">Timer Name / Label</label>
                <input type="text" id="timer-name" name="name" class="ks-input-text" placeholder="Discord Community, Follow Socials, Stream Rules" required maxlength="50" />
              </div>
              <div class="ks-form-group">
                <label class="ks-label" for="timer-interval">Post Interval</label>
                <select id="timer-interval" name="intervalMinutes" class="ks-select">
                  <option value="5">Every 5 minutes</option>
                  <option value="10">Every 10 minutes</option>
                  <option value="15" selected>Every 15 minutes (Standard)</option>
                  <option value="20">Every 20 minutes</option>
                  <option value="30">Every 30 minutes</option>
                  <option value="45">Every 45 minutes</option>
                  <option value="60">Every 1 hour</option>
                  <option value="90">Every 90 minutes</option>
                  <option value="120">Every 2 hours</option>
                </select>
              </div>
            </div>

            <div class="ks-form-group">
              <label class="ks-label" for="timer-message">
                Announcement Message
                <span style="color: var(--ks-text-faint); font-weight: normal; margin-left: 8px;">
                  Variables: <code>{channel}</code>, <code>{random.1-100}</code>
                </span>
              </label>
              <textarea 
                id="timer-message" 
                name="message" 
                class="ks-input-text" 
                rows="3" 
                style="resize: vertical; min-height: 80px;"
                placeholder="Check out our community Discord at https://discord.gg/... to stay connected when the stream is offline!" 
                required 
                maxlength="500"
              ></textarea>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; align-items: flex-end;">
              <div class="ks-form-group" style="margin-bottom: 0;">
                <label class="ks-label" for="timer-lines">
                  Minimum Chat Activity Required
                </label>
                <select id="timer-lines" name="minChatLines" class="ks-select">
                  <option value="0">0 lines (Always post, even if chat is silent)</option>
                  <option value="2">At least 2 chat lines</option>
                  <option value="3" selected>At least 3 chat lines (Recommended)</option>
                  <option value="5">At least 5 chat lines</option>
                  <option value="10">At least 10 chat lines (Active chats)</option>
                  <option value="20">At least 20 chat lines (High-volume chats)</option>
                </select>
                <div style="font-size: 0.76rem; color: var(--ks-text-muted); margin-top: 4px;">
                  Prevents the bot from repeatedly speaking when nobody is in chat.
                </div>
              </div>
              <div>
                <button type="submit" class="ks-button ks-button-primary" style="min-height: var(--ks-control-md);">
                  <span id="timer-submit-label">Save Timer</span>
                  <span class="ks-button-arrow">
                    <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>

      <!-- 2c. RAIDS TAB -->
      <div id="tab-raids" class="ks-tab-content ${activeTab === 'raids' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Incoming Raid Welcomes</h2>
              <p class="ks-card-desc">
                Automatically greet incoming raids, celebrate their community, and thank the raiding streamer.
              </p>
            </div>
            <span class="ks-tag ${raidSettings.enabled ? 'ks-tag-gold' : ''}" style="font-size: 0.8rem; padding: 3px 10px;">
              ${raidSettings.enabled ? 'Automation Active' : 'Automation Paused'}
            </span>
          </div>

          <form action="/api/raid/settings" method="POST">
            <input type="hidden" name="channelId" value="${channel.id}">

            <div class="ks-toggle-row" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); margin-bottom: 22px;">
              <div>
                <div style="font-weight: 600; font-size: 0.95rem; color: var(--ks-text-primary);">Enable Automated Raid Welcomes</div>
                <div style="font-size: 0.8rem; color: var(--ks-text-muted); margin-top: 2px;">When active, incoming raids trigger an automated announcement in stream chat.</div>
              </div>
              <label class="ks-toggle" title="Toggle Raid Greetings">
                <input type="checkbox" name="enabled" value="true" ${raidSettings.enabled ? 'checked' : ''}>
                <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
              </label>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 18px;">
              <div class="ks-form-group" style="margin-bottom: 0;">
                <label class="ks-label" for="raid-min-viewers">Minimum Raider Viewers</label>
                <input 
                  type="number" 
                  id="raid-min-viewers" 
                  name="minViewers" 
                  class="ks-input-text" 
                  value="${raidSettings.minViewers}" 
                  min="0" 
                  max="10000" 
                  required
                />
                <div style="font-size: 0.76rem; color: var(--ks-text-muted); margin-top: 4px;">
                  Only greet raids with at least this many viewers (set to 0 for all raids).
                </div>
              </div>

              <div class="ks-form-group" style="margin-bottom: 0;">
                <label class="ks-label" for="raid-cooldown">Raid Cooldown (Minutes)</label>
                <input 
                  type="number" 
                  id="raid-cooldown" 
                  name="cooldownMinutes" 
                  class="ks-input-text" 
                  value="${raidSettings.cooldownMinutes}" 
                  min="0" 
                  max="1440" 
                  required
                />
                <div style="font-size: 0.76rem; color: var(--ks-text-muted); margin-top: 4px;">
                  Prevents duplicate announcements if the same channel re-raids shortly.
                </div>
              </div>
            </div>

            <div class="ks-form-group" style="margin-bottom: 22px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
                <label class="ks-label" for="raid-message" style="margin-bottom: 0;">Raid Welcome Message Template</label>
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-size: 0.76rem; color: var(--ks-text-muted);">Variables:</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertRaidTag('{raider}')">{raider}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertRaidTag('{viewers}')">{viewers}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertRaidTag('{game}')">{game}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertRaidTag('{url}')">{url}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertRaidTag('{channel}')">{channel}</span>
                </div>
              </div>
              <textarea 
                id="raid-message" 
                name="message" 
                class="ks-input-text" 
                rows="3" 
                style="resize: vertical; min-height: 80px;" 
                required 
                maxlength="500"
              >${escapeAttr(raidSettings.message)}</textarea>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
              <button type="submit" class="ks-button ks-button-primary">
                <span>Save Raid Settings</span>
                <span class="ks-button-arrow">
                  <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
              </button>
              <div style="font-size: 0.8rem; color: var(--ks-text-muted);">
                Want to customize streamer shoutouts and the <code>!so</code> command? Visit <button type="button" data-tab="shoutouts" style="background:none;border:none;color:var(--ks-champagne);cursor:pointer;text-decoration:underline;font-size:inherit;padding:0;">Shoutouts</button>.
              </div>
            </div>
          </form>
        </section>

        <!-- Test Simulation Card -->
        <section class="ks-card" style="border-color: var(--ks-gold-hairline);">
          <div class="ks-card-header">
            <div>
              <h3 class="ks-card-title">Live Raid Simulation</h3>
              <p class="ks-card-desc">Simulate an incoming raid announcement to verify formatting in your Twitch stream chat.</p>
            </div>
          </div>
          <form action="/api/raid/test" method="POST" style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
            <input type="hidden" name="channelId" value="${channel.id}">
            <button type="submit" class="ks-button ks-button-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              </svg>
              <span>Dispatch Test Raid Alert</span>
            </button>
            <span style="font-size: 0.8rem; color: var(--ks-text-muted);">
              Posts a test announcement for <code>@SpeedyRaider</code> (42 viewers) to chat.
            </span>
          </form>
        </section>
      </div>

      <!-- 2d. SHOUTOUTS TAB -->
      <div id="tab-shoutouts" class="ks-tab-content ${activeTab === 'shoutouts' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Streamer Shoutouts &amp; !so Command</h2>
              <p class="ks-card-desc">
                Promote fellow creators in chat with custom message templates, automated raid triggers, and official Twitch shoutout overlays.
              </p>
            </div>
            <span class="ks-tag ${shoutoutSettings.enabled ? 'ks-tag-gold' : ''}" style="font-size: 0.8rem; padding: 3px 10px;">
              ${shoutoutSettings.enabled ? 'Shoutouts Active' : 'Shoutouts Disabled'}
            </span>
          </div>

          <form action="/api/shoutout/settings" method="POST">
            <input type="hidden" name="channelId" value="${channel.id}">

            <div class="ks-toggle-row" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule); margin-bottom: 22px;">
              <div>
                <div style="font-weight: 600; font-size: 0.95rem; color: var(--ks-text-primary);">Enable Shoutout System</div>
                <div style="font-size: 0.8rem; color: var(--ks-text-muted); margin-top: 2px;">Enables the <code>${currentPrefix}so</code> command and automated raid shoutouts.</div>
              </div>
              <label class="ks-toggle" title="Toggle Shoutout System">
                <input type="checkbox" name="enabled" value="true" ${shoutoutSettings.enabled ? 'checked' : ''}>
                <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
              </label>
            </div>

            <div class="ks-form-group">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
                <label class="ks-label" for="shoutout-message" style="margin-bottom: 0;">Shoutout Message Template</label>
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-size: 0.76rem; color: var(--ks-text-muted);">Variables:</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertShoutoutTag('{target}')">{target}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertShoutoutTag('{game}')">{game}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertShoutoutTag('{url}')">{url}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertShoutoutTag('{channel}')">{channel}</span>
                  <span class="ks-tag" style="font-size: 0.7rem; padding: 1px 6px; cursor: pointer;" title="Click to insert" onclick="insertShoutoutTag('{user}')">{user}</span>
                </div>
              </div>
              <textarea 
                id="shoutout-message" 
                name="message" 
                class="ks-input-text" 
                rows="3" 
                style="resize: vertical; min-height: 80px;" 
                required 
                maxlength="500"
              >${escapeAttr(shoutoutSettings.message)}</textarea>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 20px;">
              <div style="padding: 14px 18px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule);">
                <label style="display: flex; align-items: flex-start; gap: 12px; cursor: pointer;">
                  <input 
                    type="checkbox" 
                    name="autoOnRaid" 
                    value="true" 
                    ${shoutoutSettings.autoOnRaid ? 'checked' : ''} 
                    style="margin-top: 3px; accent-color: var(--ks-gold);"
                  >
                  <div>
                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--ks-text-primary);">
                      Automatic Shoutout on Incoming Raid
                    </div>
                    <div style="font-size: 0.8rem; color: var(--ks-text-muted); line-height: 1.4; margin-top: 2px;">
                      Automatically fire this shoutout in chat whenever an incoming raid is received.
                    </div>
                  </div>
                </label>
              </div>

              <div style="padding: 14px 18px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); border: 1px solid var(--ks-rule);">
                <label style="display: flex; align-items: flex-start; gap: 12px; cursor: pointer;">
                  <input 
                    type="checkbox" 
                    name="sendTwitchShoutout" 
                    value="true" 
                    ${shoutoutSettings.sendTwitchShoutout ? 'checked' : ''} 
                    style="margin-top: 3px; accent-color: var(--ks-gold);"
                  >
                  <div>
                    <div style="font-weight: 600; font-size: 0.9rem; color: var(--ks-text-primary);">
                      Trigger Twitch Native Shoutout Banner
                    </div>
                    <div style="font-size: 0.8rem; color: var(--ks-text-muted); line-height: 1.4; margin-top: 2px;">
                      Fires Twitch's official top-of-chat popup banner with follow button (requires bot moderator status).
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 22px;">
              <div class="ks-form-group" style="margin-bottom: 0;">
                <label class="ks-label" for="so-userlevel">Permission Level</label>
                <select id="so-userlevel" name="userlevel" class="ks-select">
                  <option value="mod" ${shoutoutSettings.userlevel === 'mod' ? 'selected' : ''}>Moderators &amp; Broadcaster (Recommended)</option>
                  <option value="broadcaster" ${shoutoutSettings.userlevel === 'broadcaster' ? 'selected' : ''}>Broadcaster Only</option>
                  <option value="vip" ${shoutoutSettings.userlevel === 'vip' ? 'selected' : ''}>VIPs, Mods &amp; Broadcaster</option>
                  <option value="everyone" ${shoutoutSettings.userlevel === 'everyone' ? 'selected' : ''}>Everyone</option>
                </select>
                <div style="font-size: 0.76rem; color: var(--ks-text-muted); margin-top: 4px;">
                  Who can execute the <code>${currentPrefix}so</code> command in stream chat.
                </div>
              </div>

              <div class="ks-form-group" style="margin-bottom: 0;">
                <label class="ks-label" for="so-cooldown">Command Cooldown (Seconds)</label>
                <input 
                  type="number" 
                  id="so-cooldown" 
                  name="cooldownSeconds" 
                  class="ks-input-text" 
                  value="${shoutoutSettings.cooldownSeconds}" 
                  min="0" 
                  max="3600" 
                  required
                />
                <div style="font-size: 0.76rem; color: var(--ks-text-muted); margin-top: 4px;">
                  Prevents chat flooding if multiple moderators use the command in quick succession.
                </div>
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
              <button type="submit" class="ks-button ks-button-primary">
                <span>Save Shoutout Settings</span>
                <span class="ks-button-arrow">
                  <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
              </button>
            </div>
          </form>
        </section>

        <!-- Test Simulation Card for Shoutouts -->
        <section class="ks-card" style="border-color: var(--ks-gold-hairline);">
          <div class="ks-card-header">
            <div>
              <h3 class="ks-card-title">Live Shoutout Simulation</h3>
              <p class="ks-card-desc">Simulate a shoutout message directly in your stream chat to verify formatting.</p>
            </div>
          </div>
          <form action="/api/shoutout/test" method="POST" style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
            <input type="hidden" name="channelId" value="${channel.id}">
            <input 
              type="text" 
              name="target" 
              class="ks-input-text" 
              value="SpeedyRaider" 
              placeholder="Username to shoutout" 
              style="max-width: 220px;" 
              required
            />
            <button type="submit" class="ks-button ks-button-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
              <span>Dispatch Test Shoutout</span>
            </button>
            <span style="font-size: 0.8rem; color: var(--ks-text-muted);">
              Fires a test announcement using your template into stream chat.
            </span>
          </form>
        </section>

        <!-- Auto-Shoutout Directory Card -->
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <h3 class="ks-card-title">Auto-Shoutout Directory</h3>
                <span class="ks-tag ${autoShoutouts.length > 0 ? 'ks-tag-gold' : ''}" style="font-size: 0.75rem; padding: 2px 8px;">
                  ${autoShoutouts.length} ${autoShoutouts.length === 1 ? 'Streamer' : 'Streamers'}
                </span>
              </div>
              <p class="ks-card-desc">
                Streamers listed here are automatically shouted out when they send their first message in your stream chat.
              </p>
            </div>
          </div>

          <!-- Add Streamer Form -->
          <form action="/api/shoutout/auto/add" method="POST" style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
            <input type="hidden" name="channelId" value="${channel.id}">
            <div style="position: relative; max-width: 320px; width: 100%;">
              <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--ks-text-muted); font-size: 0.95rem; font-weight: 600;">@</span>
              <input 
                type="text" 
                name="targetLogin" 
                class="ks-input-text" 
                placeholder="Twitch username (e.g. streamer)" 
                required 
                style="padding-left: 28px; width: 100%;" 
              />
            </div>
            <button type="submit" class="ks-button ks-button-primary">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              <span>Add to Auto-Shoutouts</span>
            </button>
          </form>

          ${autoShoutouts.length === 0 ? `
            <div style="text-align: center; padding: 36px 16px; border: 1px dashed var(--ks-rule); border-radius: var(--ks-radius-sm); background: var(--ks-lacquer-deep);">
              <div style="color: var(--ks-champagne); margin-bottom: 8px;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85;">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <line x1="19" y1="8" x2="19" y2="14"></line>
                  <line x1="22" y1="11" x2="16" y2="11"></line>
                </svg>
              </div>
              <div style="font-weight: 600; color: var(--ks-text-primary); font-size: 0.95rem;">No Auto-Shoutout Creators Yet</div>
              <p style="color: var(--ks-text-muted); font-size: 0.85rem; max-width: 480px; margin: 6px auto 0; line-height: 1.5;">
                Add fellow creators above, or use the in-chat command <code>${currentPrefix}so auto add &lt;username&gt;</code>. They will automatically be greeted with your custom shoutout when they chat!
              </p>
            </div>
          ` : `
            <div class="ks-table-wrap">
              <table class="ks-table">
                <thead>
                  <tr>
                    <th scope="col">Streamer</th>
                    <th scope="col">Status</th>
                    <th scope="col">Last Shouted</th>
                    <th scope="col" style="text-align: right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${autoShoutouts.map((item) => `
                    <tr>
                      <td>
                        <div style="display: flex; align-items: center; gap: 10px;">
                          <img 
                            src="${item.targetAvatar || DEFAULT_AVATAR_URL}" 
                            alt="${escapeAttr(item.targetDisplayName || item.targetLogin)}" 
                            style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--ks-gold-hairline); background: var(--ks-obsidian-deep);"
                            onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'"
                          />
                          <div>
                            <div style="font-weight: 600; color: var(--ks-text-primary); font-size: 0.9rem;">
                              ${escapeAttr(item.targetDisplayName || item.targetLogin)}
                            </div>
                            <div style="font-size: 0.78rem; color: var(--ks-text-muted);">
                              twitch.tv/${escapeAttr(item.targetLogin)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <form action="/api/shoutout/auto/toggle" method="POST" style="display: inline;">
                          <input type="hidden" name="channelId" value="${channel.id}">
                          <input type="hidden" name="targetLogin" value="${escapeAttr(item.targetLogin)}">
                          <input type="hidden" name="enabled" value="${item.enabled ? 'false' : 'true'}">
                          <button 
                            type="submit" 
                            class="ks-tag ${item.enabled ? 'ks-tag-gold' : ''}" 
                            style="cursor: pointer; border: 1px solid ${item.enabled ? 'var(--ks-champagne)' : 'var(--ks-rule)'}; background: ${item.enabled ? 'var(--ks-gold-soft)' : 'transparent'};"
                            title="Click to toggle active state"
                          >
                            ${item.enabled ? 'Active' : 'Paused'}
                          </button>
                        </form>
                      </td>
                      <td style="color: var(--ks-text-muted); font-size: 0.85rem;">
                        ${formatRelativeTime(item.lastShoutedAt)}
                      </td>
                      <td style="text-align: right;">
                        <form action="/api/shoutout/auto/remove" method="POST" style="display: inline;" onsubmit="return confirm('Remove @${escapeAttr(item.targetLogin)} from auto-shoutout directory?');">
                          <input type="hidden" name="channelId" value="${channel.id}">
                          <input type="hidden" name="targetLogin" value="${escapeAttr(item.targetLogin)}">
                          <button type="submit" class="ks-button ks-button-danger" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">
                            Remove
                          </button>
                        </form>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}

          <!-- Quick Tip Footer -->
          <div style="margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--ks-rule); display: flex; align-items: flex-start; gap: 8px; color: var(--ks-text-muted); font-size: 0.82rem; line-height: 1.5;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ks-champagne)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; margin-top: 2px;">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div>
              <strong>Pro-tip:</strong> You and your moderators can also manage this directory directly from Twitch chat using 
              <code>${currentPrefix}so auto add &lt;username&gt;</code>, 
              <code>${currentPrefix}so auto remove &lt;username&gt;</code>, or 
              <code>${currentPrefix}so auto list</code>. Auto-shoutouts have an automatic 4-hour per-streamer cooldown to prevent repeat triggers.
            </div>
          </div>
        </section>
      </div>

      <!-- 3. COMMAND PREFIX TAB -->
      <div id="tab-prefix" class="ks-tab-content ${activeTab === 'prefix' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Command Prefix Configuration</h2>
              <p class="ks-card-desc">Customize the trigger symbol that precedes all chat commands in your channel.</p>
            </div>
          </div>

          <form action="/api/channel/prefix" method="POST" style="max-width: 520px;">
            <input type="hidden" name="channelId" value="${channel.id}">
            <div class="ks-form-group">
              <label class="ks-label" for="channel-prefix">Chat Command Prefix (1 to 3 characters)</label>
              <div style="display: flex; gap: 12px; align-items: center; margin-top: 6px;">
                <input 
                  type="text" 
                  id="channel-prefix" 
                  name="prefix" 
                  class="ks-input-text" 
                  value="${currentPrefix}" 
                  maxlength="3" 
                  required 
                  style="max-width: 110px; font-family: var(--ks-mono); font-size: 1.15rem; text-align: center; font-weight: 700;" 
                />
                <button type="submit" class="ks-button ks-button-primary">
                  <span>Save Prefix</span>
                  <span class="ks-button-arrow">
                    <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
              </div>
              <div style="color: var(--ks-text-muted); font-size: 0.85rem; margin-top: 14px; line-height: 1.6;">
                Common prefix choices: <code>!</code>, <code>?</code>, <code>$</code>, <code>.</code>, <code>-</code>, <code>#</code>, <code>~</code>, <code>^</code>.<br>
                All commands in your stream will immediately respond to this prefix (for example, <code>${currentPrefix}discord</code>, <code>${currentPrefix}ping</code>, <code>${currentPrefix}so</code>, <code>${currentPrefix}permit</code>).
              </div>
            </div>
          </form>
        </section>
      </div>

      <!-- 3. AUTO-MODERATION TAB -->
      <div id="tab-moderation" class="ks-tab-content ${activeTab === 'moderation' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Chat Auto-Moderation</h2>
              <p class="ks-card-desc">Protect your stream chat against unauthorized links, caps spam, and blocked phrases.</p>
            </div>
          </div>

          <form action="/api/moderation" method="POST">
            <input type="hidden" name="channelId" value="${channel.id}">
            <div style="display: flex; flex-direction: column; gap: 20px;">
              <div class="ks-toggle-row" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--ks-rule);">
                <div style="max-width: 600px;">
                  <div style="font-weight: 600; color: var(--ks-champagne);">Block Unpermitted Links</div>
                  <div style="color: var(--ks-text-muted); font-size: 0.85rem; margin-top: 2px;">
                    Deletes links sent by standard viewers. Moderators can grant temporary exemption via <code>${currentPrefix}permit &lt;username&gt;</code>.
                  </div>
                </div>
                <label class="ks-toggle" title="Toggle link filter">
                  <input type="checkbox" name="filterLinks" ${channel.moderation?.filterLinks ? 'checked' : ''}>
                  <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
                </label>
              </div>

              <div class="ks-toggle-row" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--ks-rule);">
                <div style="max-width: 600px;">
                  <div style="font-weight: 600; color: var(--ks-champagne);">Block Excessive Caps</div>
                  <div style="color: var(--ks-text-muted); font-size: 0.85rem; margin-top: 2px;">
                    Deletes chat messages with more than 70% uppercase characters (minimum 12 characters).
                  </div>
                </div>
                <label class="ks-toggle" title="Toggle caps filter">
                  <input type="checkbox" name="filterCaps" ${channel.moderation?.filterCaps ? 'checked' : ''}>
                  <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
                </label>
              </div>

              <div class="ks-form-group" style="margin-top: 8px;">
                <label class="ks-label" for="banned-words">Banned Words & Phrases (comma-separated)</label>
                <input 
                  type="text" 
                  id="banned-words" 
                  name="bannedWords" 
                  class="ks-input-text" 
                  value="${(channel.moderation?.bannedWords || []).join(', ')}" 
                  placeholder="badword1, suspicious phrase, spam pattern" 
                />
                <div style="color: var(--ks-text-faint); font-size: 0.82rem; margin-top: 6px;">
                  Messages matching any listed entry are automatically removed from chat and the author timed out.
                </div>
              </div>

              <div>
                <button type="submit" class="ks-button ks-button-primary">
                  <span>Save Moderation Settings</span>
                  <span class="ks-button-arrow">
                    <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                </button>
              </div>
            </div>
          </form>
        </section>
      </div>

      <!-- 4. MANAGERS & PERMISSIONS TAB -->
      <div id="tab-managers" class="ks-tab-content ${activeTab === 'managers' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Channel Managers</h2>
              <p class="ks-card-desc">Delegate bot management to trusted moderators without sharing Twitch credentials.</p>
            </div>
          </div>

          ${!isOwner ? `
            <div class="ks-alert" style="background: var(--ks-lacquer-deep); border-color: var(--ks-rule); margin-bottom: 24px; color: var(--ks-text-muted);">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="8" cy="8" r="7"/><line x1="8" y1="7" x2="8" y2="12"/><line x1="8" y1="4" x2="8" y2="4"/>
              </svg>
              <div>You have <strong>Channel Manager</strong> access to #${channel.login}. Only the channel broadcaster (@${channel.displayName}) can add or remove other managers.</div>
            </div>
          ` : `
            <form action="/api/managers/add" method="POST" style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
              <input type="hidden" name="channelId" value="${channel.id}">
              <input 
                type="text" 
                name="username" 
                class="ks-input-text" 
                placeholder="Twitch username (e.g. headmod)" 
                required 
                style="max-width: 320px;" 
              />
              <button type="submit" class="ks-button ks-button-primary">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <path d="M8 2v12M2 8h12"/>
                </svg>
                <span>Add Manager</span>
              </button>
            </form>
          `}

          <div class="ks-table-wrap">
            <table class="ks-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                  <th scope="col" style="text-align: right;">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <img 
                        src="${channel.avatar || DEFAULT_AVATAR_URL}" 
                        alt="${escapeAttr(channel.displayName)}"
                        class="ks-channel-avatar" 
                        style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--ks-gold-hairline); background: var(--ks-lacquer-deep);" 
                        onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'"
                      />
                      <div>
                        <div style="font-weight: 600; color: var(--ks-text-primary); font-size: 0.9rem;">
                          ${escapeAttr(channel.displayName)}
                        </div>
                        <div style="font-size: 0.78rem; color: var(--ks-text-muted);">
                          twitch.tv/${escapeAttr(channel.login)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><span class="ks-tag ks-tag-gold">Broadcaster (Owner)</span></td>
                  <td style="text-align: right; color: var(--ks-text-muted); font-size: 0.85rem;">Primary</td>
                </tr>
                ${(channel.managerProfiles || (channel.managers || []).map((m) => (typeof m === 'object' ? m : { username: m, displayName: m, avatar: null }))).map((m) => `
                  <tr>
                    <td>
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <img 
                          src="${m.avatar || DEFAULT_AVATAR_URL}" 
                          alt="${escapeAttr(m.displayName || m.username)}" 
                          class="ks-channel-avatar" 
                          style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--ks-gold-hairline); background: var(--ks-lacquer-deep);"
                          onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'"
                        />
                        <div>
                          <div style="font-weight: 600; color: var(--ks-text-primary); font-size: 0.9rem;">
                            ${escapeAttr(m.displayName || m.username)}
                          </div>
                          <div style="font-size: 0.78rem; color: var(--ks-text-muted);">
                            twitch.tv/${escapeAttr(m.username)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td><span class="ks-tag">Manager</span></td>
                    <td style="text-align: right;">
                      ${isOwner ? `
                        <form action="/api/managers/remove" method="POST" style="display: inline;" onsubmit="return confirm('Remove @${escapeAttr(m.displayName || m.username)} as manager?');">
                          <input type="hidden" name="channelId" value="${channel.id}">
                          <input type="hidden" name="username" value="${escapeAttr(m.username)}">
                          <button type="submit" class="ks-button ks-button-danger" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">Remove</button>
                        </form>
                      ` : `
                        <span style="color: var(--ks-text-faint); font-size: 0.8rem;">Protected</span>
                      `}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- 5. LIVE TEST MESSAGE TAB -->
      <div id="tab-test" class="ks-tab-content ${activeTab === 'test' ? 'active' : ''}">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Send Test Message</h2>
              <p class="ks-card-desc">Verify real-time chat output directly into #${channel.login}.</p>
            </div>
          </div>

          <form action="/api/send-test" method="POST">
            <input type="hidden" name="channelId" value="${channel.id}">
            <div class="ks-form-group">
              <label class="ks-label" for="test-message">Message Content</label>
              <input 
                type="text" 
                id="test-message" 
                name="message" 
                class="ks-input-text" 
                value="Testing channel connection: ${config.botName} is active and listening." 
                required 
              />
            </div>
            <button type="submit" class="ks-button ks-button-primary">
              <span>Dispatch to Chat</span>
              <span class="ks-button-arrow">
                <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </button>
          </form>
        </section>
      </div>

        </main>
      </div>
    </div>

    <script>
      (function() {
        window.insertRaidTag = function(tag) {
          var textarea = document.getElementById('raid-message');
          if (!textarea) return;
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || 0;
          var val = textarea.value;
          textarea.value = val.substring(0, start) + tag + val.substring(end);
          textarea.focus();
          var newPos = start + tag.length;
          textarea.setSelectionRange(newPos, newPos);
        };

        window.insertShoutoutTag = function(tag) {
          var textarea = document.getElementById('shoutout-message');
          if (!textarea) return;
          var start = textarea.selectionStart || 0;
          var end = textarea.selectionEnd || 0;
          var val = textarea.value;
          textarea.value = val.substring(0, start) + tag + val.substring(end);
          textarea.focus();
          var newPos = start + tag.length;
          textarea.setSelectionRange(newPos, newPos);
        };

        function switchTab(tabId) {
          if (!tabId) return;
          // Set cookie so full page refreshes / POST redirects stay on this tab
          document.cookie = 'active_dashboard_tab=' + encodeURIComponent(tabId) + '; path=/; max-age=2592000; SameSite=Lax';
          try {
            localStorage.setItem('active_dashboard_tab', tabId);
          } catch (e) {}

          var buttons = document.querySelectorAll('[data-tab]');
          var contents = document.querySelectorAll('.ks-tab-content');
          
          buttons.forEach(function(btn) {
            if (btn.getAttribute('data-tab') === tabId) {
              btn.classList.add('active');
              var group = btn.closest('.ks-sidebar-group');
              if (group) {
                group.classList.remove('is-collapsed');
                var headerBtn = group.querySelector('.ks-sidebar-group-header');
                if (headerBtn) headerBtn.setAttribute('aria-expanded', 'true');
              }
            } else {
              btn.classList.remove('active');
            }
          });

          contents.forEach(function(c) {
            if (c.id === 'tab-' + tabId) {
              c.classList.add('active');
            } else {
              c.classList.remove('active');
            }
          });

          // Update mobile navigation badge
          var mobileBadge = document.getElementById('ksSidebarActiveBadge');
          if (mobileBadge) {
            var titles = {
              commands: 'Custom Commands',
              builtins: 'Built-in Commands',
              timers: 'Chat Timers',
              raids: 'Raid Welcomes',
              shoutouts: 'Shoutouts',
              prefix: 'Command Prefix',
              moderation: 'Auto-Moderation',
              managers: 'Managers & Access',
              test: 'Live Test Message',
            };
            mobileBadge.textContent = titles[tabId] || tabId;
          }

          // Close mobile menu when a tab is selected
          var sidebarEl = document.querySelector('.ks-sidebar');
          if (sidebarEl) {
            sidebarEl.classList.remove('mobile-open');
            var mToggle = document.getElementById('ksSidebarMobileToggle');
            if (mToggle) mToggle.setAttribute('aria-expanded', 'false');
          }

          // Zero URL pollution: strip any ?tab= query from browser address bar
          if (window.location.search && window.history && window.history.replaceState) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }

        // Enable smooth accordion transitions only after initial page paint to prevent refresh flicker
        requestAnimationFrame(function() {
          var sidebar = document.querySelector('.ks-sidebar');
          if (sidebar) sidebar.classList.add('is-ready');
        });

        // Restore user-collapsed groups from localStorage (do not collapse if group has active tab)
        try {
          var savedCollapsed = JSON.parse(localStorage.getItem('fuxy_collapsed_groups') || '[]');
          if (Array.isArray(savedCollapsed)) {
            savedCollapsed.forEach(function(groupId) {
              var group = document.querySelector('.ks-sidebar-group[data-group="' + groupId + '"]');
              if (group && !group.querySelector('.ks-sidebar-item.active')) {
                group.classList.add('is-collapsed');
                var header = group.querySelector('.ks-sidebar-group-header');
                if (header) header.setAttribute('aria-expanded', 'false');
              }
            });
          }
        } catch (e) {}

        // Strip any query parameter if present on load
        if (window.location.search && window.history && window.history.replaceState) {
          window.history.replaceState({}, '', window.location.pathname);
        }

        // Tab and group click delegation
        document.addEventListener('click', function(e) {
          var mobileToggle = e.target.closest('#ksSidebarMobileToggle');
          if (mobileToggle) {
            e.preventDefault();
            var sidebar = document.querySelector('.ks-sidebar');
            if (sidebar) {
              var isOpen = sidebar.classList.toggle('mobile-open');
              mobileToggle.setAttribute('aria-expanded', String(isOpen));
            }
            return;
          }

          // If clicked outside the mobile sidebar while it is open, close it
          if (!e.target.closest('.ks-sidebar')) {
            var openSidebar = document.querySelector('.ks-sidebar.mobile-open');
            if (openSidebar) {
              openSidebar.classList.remove('mobile-open');
              var mToggle = document.getElementById('ksSidebarMobileToggle');
              if (mToggle) mToggle.setAttribute('aria-expanded', 'false');
            }
          }

          var groupHeader = e.target.closest('.ks-sidebar-group-header');
          if (groupHeader) {
            e.preventDefault();
            var group = groupHeader.closest('.ks-sidebar-group');
            if (group) {
              var isCollapsed = group.classList.toggle('is-collapsed');
              groupHeader.setAttribute('aria-expanded', String(!isCollapsed));
              try {
                var collapsedList = [];
                document.querySelectorAll('.ks-sidebar-group.is-collapsed').forEach(function(g) {
                  var gid = g.getAttribute('data-group');
                  if (gid) collapsedList.push(gid);
                });
                localStorage.setItem('fuxy_collapsed_groups', JSON.stringify(collapsedList));
              } catch (err) {}
            }
            return;
          }

          var tabBtn = e.target.closest('[data-tab]');
          if (tabBtn) {
            e.preventDefault();
            var tab = tabBtn.getAttribute('data-tab');
            switchTab(tab);
            return;
          }

          var addBtn = e.target.closest('#openAddCommandBtn');
          if (addBtn) {
            e.preventDefault();
            var card = document.getElementById('addCommandCard');
            var title = document.getElementById('commandFormTitle');
            var desc = document.getElementById('commandFormDesc');
            var submitLabel = document.getElementById('cmd-submit-label');

            if (title) title.textContent = 'New Custom Command';
            if (desc) desc.textContent = 'Define a command trigger, access level, and automated response.';
            if (submitLabel) submitLabel.textContent = 'Save Command';

            var idInput = document.getElementById('cmd-id');
            var triggerInput = document.getElementById('cmd-trigger');
            var responseInput = document.getElementById('cmd-response');
            var userlevelSelect = document.getElementById('cmd-userlevel');
            var cooldownInput = document.getElementById('cmd-cooldown');

            if (idInput) idInput.value = '';
            if (triggerInput) triggerInput.value = '';
            if (responseInput) responseInput.value = '';
            if (userlevelSelect) userlevelSelect.value = 'everyone';
            if (cooldownInput) cooldownInput.value = '5';

            if (card) {
              card.style.display = 'block';
              card.scrollIntoView({ behavior: 'smooth' });
            }
            if (triggerInput) triggerInput.focus();
            return;
          }

          var editBtn = e.target.closest('.edit-command-btn');
          if (editBtn) {
            e.preventDefault();
            var card = document.getElementById('addCommandCard');
            var id = editBtn.getAttribute('data-cmd-id');
            var trigger = editBtn.getAttribute('data-cmd-trigger');
            var response = editBtn.getAttribute('data-cmd-response');
            var userlevel = editBtn.getAttribute('data-cmd-userlevel') || 'everyone';
            var cooldown = editBtn.getAttribute('data-cmd-cooldown') || '5';

            var title = document.getElementById('commandFormTitle');
            var desc = document.getElementById('commandFormDesc');
            var submitLabel = document.getElementById('cmd-submit-label');

            if (title) title.textContent = 'Edit Command: ' + ${JSON.stringify(currentPrefix)} + trigger;
            if (desc) desc.textContent = 'Modify trigger, automated response, permissions, or cooldown.';
            if (submitLabel) submitLabel.textContent = 'Update Command';

            var idInput = document.getElementById('cmd-id');
            var triggerInput = document.getElementById('cmd-trigger');
            var responseInput = document.getElementById('cmd-response');
            var userlevelSelect = document.getElementById('cmd-userlevel');
            var cooldownInput = document.getElementById('cmd-cooldown');

            if (idInput) idInput.value = id;
            if (triggerInput) triggerInput.value = trigger;
            if (responseInput) responseInput.value = response;
            if (userlevelSelect) userlevelSelect.value = userlevel;
            if (cooldownInput) cooldownInput.value = cooldown;

            if (card) {
              card.style.display = 'block';
              card.scrollIntoView({ behavior: 'smooth' });
            }
            if (responseInput) responseInput.focus();
            return;
          }

          var cancelBtn = e.target.closest('#cancelAddCommandBtn');
          if (cancelBtn) {
            e.preventDefault();
            var card = document.getElementById('addCommandCard');
            if (card) {
              card.style.display = 'none';
            }
            var idInput = document.getElementById('cmd-id');
            var triggerInput = document.getElementById('cmd-trigger');
            var responseInput = document.getElementById('cmd-response');
            if (idInput) idInput.value = '';
            if (triggerInput) triggerInput.value = '';
            if (responseInput) responseInput.value = '';
            return;
          }

          var addTimerBtn = e.target.closest('#openAddTimerBtn');
          if (addTimerBtn) {
            e.preventDefault();
            var card = document.getElementById('addTimerCard');
            var title = document.getElementById('timerFormTitle');
            var desc = document.getElementById('timerFormDesc');
            var submitLabel = document.getElementById('timer-submit-label');

            if (title) title.textContent = 'New Scheduled Timer';
            if (desc) desc.textContent = 'Configure recurring message content, posting interval, and chat activity requirements.';
            if (submitLabel) submitLabel.textContent = 'Save Timer';

            var idInput = document.getElementById('timer-id');
            var nameInput = document.getElementById('timer-name');
            var messageInput = document.getElementById('timer-message');
            var intervalSelect = document.getElementById('timer-interval');
            var linesSelect = document.getElementById('timer-lines');

            if (idInput) idInput.value = '';
            if (nameInput) nameInput.value = '';
            if (messageInput) messageInput.value = '';
            if (intervalSelect) intervalSelect.value = '15';
            if (linesSelect) linesSelect.value = '3';

            if (card) {
              card.style.display = 'block';
              card.scrollIntoView({ behavior: 'smooth' });
            }
            if (nameInput) nameInput.focus();
            return;
          }

          var editTimerBtn = e.target.closest('.edit-timer-btn');
          if (editTimerBtn) {
            e.preventDefault();
            var card = document.getElementById('addTimerCard');
            var id = editTimerBtn.getAttribute('data-timer-id');
            var name = editTimerBtn.getAttribute('data-timer-name');
            var message = editTimerBtn.getAttribute('data-timer-message');
            var interval = editTimerBtn.getAttribute('data-timer-interval') || '15';
            var lines = editTimerBtn.getAttribute('data-timer-lines') || '3';

            var title = document.getElementById('timerFormTitle');
            var desc = document.getElementById('timerFormDesc');
            var submitLabel = document.getElementById('timer-submit-label');

            if (title) title.textContent = 'Edit Timer: ' + name;
            if (desc) desc.textContent = 'Modify timer message, interval, or chat line requirement.';
            if (submitLabel) submitLabel.textContent = 'Update Timer';

            var idInput = document.getElementById('timer-id');
            var nameInput = document.getElementById('timer-name');
            var messageInput = document.getElementById('timer-message');
            var intervalSelect = document.getElementById('timer-interval');
            var linesSelect = document.getElementById('timer-lines');

            if (idInput) idInput.value = id;
            if (nameInput) nameInput.value = name;
            if (messageInput) messageInput.value = message;
            if (intervalSelect) intervalSelect.value = interval;
            if (linesSelect) linesSelect.value = lines;

            if (card) {
              card.style.display = 'block';
              card.scrollIntoView({ behavior: 'smooth' });
            }
            if (messageInput) messageInput.focus();
            return;
          }

          var cancelTimerBtn = e.target.closest('#cancelAddTimerBtn');
          if (cancelTimerBtn) {
            e.preventDefault();
            var card = document.getElementById('addTimerCard');
            if (card) {
              card.style.display = 'none';
            }
            var idInput = document.getElementById('timer-id');
            var nameInput = document.getElementById('timer-name');
            var messageInput = document.getElementById('timer-message');
            if (idInput) idInput.value = '';
            if (nameInput) nameInput.value = '';
            if (messageInput) messageInput.value = '';
            return;
          }
        });

        // --- Scroll Position Preservation Across Updates & Page Refreshes ---
        document.addEventListener('submit', function() {
          try {
            sessionStorage.setItem('fuxy_dashboard_scroll', String(window.scrollY || window.pageYOffset || 0));
          } catch (_) {}
        }, true);

        window.addEventListener('beforeunload', function() {
          try {
            sessionStorage.setItem('fuxy_dashboard_scroll', String(window.scrollY || window.pageYOffset || 0));
          } catch (_) {}
        });

        (function restoreScrollPosition() {
          try {
            var saved = sessionStorage.getItem('fuxy_dashboard_scroll');
            if (saved !== null) {
              sessionStorage.removeItem('fuxy_dashboard_scroll');
              var top = parseInt(saved, 10);
              if (!isNaN(top) && top > 0) {
                window.scrollTo({ top: top, behavior: 'instant' });
                requestAnimationFrame(function() {
                  window.scrollTo({ top: top, behavior: 'instant' });
                });
                setTimeout(function() {
                  window.scrollTo({ top: top, behavior: 'instant' });
                }, 60);
              }
            }
          } catch (_) {}
        })();
      })();
    </script>
  `;

  return renderLayout({
    title: `${channel.displayName} Dashboard`,
    content,
    user,
    activeChannel: channel,
  });
}
