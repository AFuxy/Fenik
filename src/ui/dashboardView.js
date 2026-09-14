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
  activeTab = 'overview',
  setupState = null,
}) {
  const bot = setupState?.bot || null;
  const isBotMod = setupState?.isBotMod !== undefined ? setupState.isBotMod : null;
  const allScopesGranted = setupState?.allScopesGranted ?? true;
  const missingScopes = setupState?.missingScopes || [];
  const requiredScopes = setupState?.requiredScopes || [
    { id: 'channel:bot', name: 'Twitch Chatbot Integration', desc: 'Allows the bot to join and speak in your stream chat room.', required: true },
    { id: 'channel:manage:moderators', name: 'Moderator Management', desc: 'Enables 1-click automatic bot modding and moderator status detection.', required: true },
    { id: 'moderator:read:followers', name: 'Follower Verification', desc: 'Powers dynamic follow duration ({followage}) in chat commands.', required: true },
    { id: 'channel:read:redemptions', name: 'Channel Points & Rewards', desc: 'Allows the bot to detect and interact with custom channel point redemptions.', required: false },
  ];
  const grantedScopesSet = new Set(setupState?.grantedScopes || ['channel:bot', 'channel:manage:moderators', 'moderator:read:followers', 'channel:read:redemptions']);
  const completedTasks = setupState?.completedTasks ?? 3;
  const totalTasks = setupState?.totalTasks ?? 4;
  const percentReady = setupState?.percentReady ?? Math.round((completedTasks / totalTasks) * 100);

  const currentPrefix = channel.prefix || '!';
  const disabledSet = new Set(channel.disabledBuiltins || []);
  const activeBuiltinCount = BUILTIN_COMMANDS.filter((b) => !disabledSet.has(b.id)).length;
  const timers = channel.timers || [];
  const activeTimerCount = timers.filter((t) => t.enabled).length;

  const chatGroupTabs = ['commands', 'builtins', 'timers', 'raids', 'shoutouts'];
  const eventsGroupTabs = ['alerts', 'rewards'];
  const safetyGroupTabs = ['moderation'];
  const settingsGroupTabs = ['prefix', 'managers', 'test'];

  const streamAlerts = channel.streamAlerts || {
    followEnabled: true,
    followMessage: 'Thank you for following, @{user}! Welcome to the stream! 💜',
    subEnabled: true,
    subMessage: 'Thank you @{user} for subscribing at {tier}! Welcome to the family! 🎉',
    resubMessage: 'Welcome back @{user} for resubscribing at {tier} for {months} months! {streak} {message}',
    giftSubMessage: 'Thank you @{user} for gifting a {tier} sub! 🎁',
    communityGiftMessage: 'WOW! Huge thanks to @{user} for gifting {count} subs to the community! 🌟',
  };

  const channelPointTriggers = channel.channelPointTriggers || [];
  const activeRewardCount = channelPointTriggers.filter((t) => t.enabled).length;

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
    overview: 'Getting Started & Setup',
    commands: 'Custom Commands',
    builtins: 'Built-in Commands',
    timers: 'Chat Timers',
    raids: 'Raid Welcomes',
    shoutouts: 'Shoutouts',
    alerts: 'Stream Alerts',
    rewards: 'Channel Points',
    prefix: 'Command Prefix',
    moderation: 'Auto-Moderation',
    managers: 'Managers & Access',
    test: 'Live Test Message',
  };
  const currentTabTitle = tabTitleMap[activeTab] || 'Getting Started & Setup';

  // Keep groups expanded by default so dropdowns never retract unexpectedly on refresh
  const isChatOpen = true;
  const isEventsOpen = true;
  const isSafetyOpen = true;
  const isSettingsOpen = true;

  const content = `
    <div class="ks-container">
    <!-- Floating Toast Notifications Container (Fixed overlay: never pushes content down) -->
    <div class="ks-toast-container" id="ks-toast-container" aria-live="polite" aria-atomic="true">
      ${success ? `
        <div class="ks-toast ks-toast-success" role="status">
          <div class="ks-toast-body">
            <svg class="ks-toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <div class="ks-toast-text">${escapeAttr(success)}</div>
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
            <div class="ks-toast-text">${escapeAttr(error)}</div>
          </div>
          <button type="button" class="ks-toast-close" aria-label="Dismiss notification">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>
          </button>
        </div>
      ` : ''}
    </div>

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
              Bot: <strong style="color: ${channel.joined ? 'var(--ks-kinpaku)' : 'var(--ks-text-muted)'};">${channel.joined ? 'Active' : 'Paused'}</strong>
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

          <div class="ks-sidebar-inner" role="tablist" aria-orientation="vertical" aria-label="Dashboard navigation">

            <!-- 0. Getting Started & Setup Item -->
            <div style="margin-bottom: 10px;">
              <button 
                type="button" 
                role="tab" 
                id="tab-btn-overview" 
                aria-controls="tab-overview" 
                aria-selected="${activeTab === 'overview' ? 'true' : 'false'}" 
                data-tab="overview" 
                class="ks-sidebar-item ${activeTab === 'overview' ? 'active' : ''}" 
                style="border-radius: var(--ks-radius-sm); padding: 8px 12px; font-weight: 600;"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                  <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                  <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
                  <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
                  <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
                </svg>
                <span class="ks-sidebar-item-label">Getting Started</span>
                <span class="ks-tag ${percentReady === 100 ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">
                  ${percentReady === 100 ? 'Ready' : `${completedTasks}/${totalTasks}`}
                </span>
              </button>
            </div>

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
                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-commands" 
                  aria-controls="tab-commands" 
                  aria-selected="${activeTab === 'commands' ? 'true' : 'false'}" 
                  data-tab="commands" 
                  class="ks-sidebar-item ${activeTab === 'commands' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"></polyline>
                    <line x1="12" y1="19" x2="20" y2="19"></line>
                  </svg>
                  <span class="ks-sidebar-item-label">Custom Commands</span>
                  <span class="ks-tag ks-tag-gold" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${channel.commands?.length || 0}</span>
                </button>

                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-builtins" 
                  aria-controls="tab-builtins" 
                  aria-selected="${activeTab === 'builtins' ? 'true' : 'false'}" 
                  data-tab="builtins" 
                  class="ks-sidebar-item ${activeTab === 'builtins' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Built-in Commands</span>
                  <span class="ks-tag ${activeBuiltinCount > 0 ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${activeBuiltinCount}/${BUILTIN_COMMANDS.length}</span>
                </button>

                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-timers" 
                  aria-controls="tab-timers" 
                  aria-selected="${activeTab === 'timers' ? 'true' : 'false'}" 
                  data-tab="timers" 
                  class="ks-sidebar-item ${activeTab === 'timers' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  <span class="ks-sidebar-item-label">Chat Timers</span>
                  <span class="ks-tag ${activeTimerCount > 0 ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${activeTimerCount}/${timers.length}</span>
                </button>

                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-raids" 
                  aria-controls="tab-raids" 
                  aria-selected="${activeTab === 'raids' ? 'true' : 'false'}" 
                  data-tab="raids" 
                  class="ks-sidebar-item ${activeTab === 'raids' ? 'active' : ''}"
                >
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

                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-shoutouts" 
                  aria-controls="tab-shoutouts" 
                  aria-selected="${activeTab === 'shoutouts' ? 'true' : 'false'}" 
                  data-tab="shoutouts" 
                  class="ks-sidebar-item ${activeTab === 'shoutouts' ? 'active' : ''}"
                >
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

            <!-- Events & Rewards Group (Collapsible Dropdown) -->
            <div class="ks-sidebar-group ${isEventsOpen ? '' : 'is-collapsed'}" data-group="events">
              <button type="button" class="ks-sidebar-group-header" aria-expanded="${isEventsOpen ? 'true' : 'false'}">
                <div class="ks-sidebar-group-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                  </svg>
                  <span>Events & Rewards</span>
                </div>
                <svg class="ks-sidebar-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>

              <div class="ks-sidebar-items">
                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-alerts" 
                  aria-controls="tab-alerts" 
                  aria-selected="${activeTab === 'alerts' ? 'true' : 'false'}" 
                  data-tab="alerts" 
                  class="ks-sidebar-item ${activeTab === 'alerts' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Stream Alerts</span>
                  <span class="ks-tag ${(streamAlerts.followEnabled || streamAlerts.subEnabled) ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">
                    ${(streamAlerts.followEnabled || streamAlerts.subEnabled) ? 'On' : 'Off'}
                  </span>
                </button>

                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-rewards" 
                  aria-controls="tab-rewards" 
                  aria-selected="${activeTab === 'rewards' ? 'true' : 'false'}" 
                  data-tab="rewards" 
                  class="ks-sidebar-item ${activeTab === 'rewards' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7v10M9 10h6"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Channel Points</span>
                  <span class="ks-tag ${activeRewardCount > 0 ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">
                    ${activeRewardCount}/${channelPointTriggers.length}
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
                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-moderation" 
                  aria-controls="tab-moderation" 
                  aria-selected="${activeTab === 'moderation' ? 'true' : 'false'}" 
                  data-tab="moderation" 
                  class="ks-sidebar-item ${activeTab === 'moderation' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                  </svg>
                  <span class="ks-sidebar-item-label">Auto-Moderation</span>
                  ${(channel.moderation?.filterLinks || channel.moderation?.filterCaps || channel.moderation?.filterEmotes || channel.moderation?.filterRepetition || (channel.moderation?.bannedWords && channel.moderation?.bannedWords.length > 0)) ? `
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
                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-prefix" 
                  aria-controls="tab-prefix" 
                  aria-selected="${activeTab === 'prefix' ? 'true' : 'false'}" 
                  data-tab="prefix" 
                  class="ks-sidebar-item ${activeTab === 'prefix' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="4" y1="9" x2="20" y2="9"></line>
                    <line x1="4" y1="15" x2="20" y2="15"></line>
                    <line x1="10" y1="3" x2="8" y2="21"></line>
                    <line x1="16" y1="3" x2="14" y2="21"></line>
                  </svg>
                  <span class="ks-sidebar-item-label">Command Prefix</span>
                  <span class="ks-tag ks-tag-gold" style="font-family: var(--ks-mono); font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${currentPrefix}</span>
                </button>

                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-managers" 
                  aria-controls="tab-managers" 
                  aria-selected="${activeTab === 'managers' ? 'true' : 'false'}" 
                  data-tab="managers" 
                  class="ks-sidebar-item ${activeTab === 'managers' ? 'active' : ''}"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  <span class="ks-sidebar-item-label">Managers & Access</span>
                  <span class="ks-tag" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">${channel.managers?.length || 0}</span>
                </button>

                <button 
                  type="button" 
                  role="tab" 
                  id="tab-btn-test" 
                  aria-controls="tab-test" 
                  aria-selected="${activeTab === 'test' ? 'true' : 'false'}" 
                  data-tab="test" 
                  class="ks-sidebar-item ${activeTab === 'test' ? 'active' : ''}"
                >
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

      <!-- 0. GETTING STARTED & SETUP OVERVIEW TAB -->
      <div id="tab-overview" class="ks-tab-content ${activeTab === 'overview' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-overview" tabindex="0">
        
        <!-- Welcome Hero & Readiness Bar -->
        <section class="ks-card" style="border-color: ${percentReady === 100 ? 'var(--ks-gold-hairline)' : 'var(--ks-rule)'}; margin-bottom: 24px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 18px;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap;">
                <h2 class="ks-card-title" style="font-size: 1.35rem; margin: 0;">Getting Started with ${escapeAttr(config.botName)}</h2>
                <span class="ks-tag ${percentReady === 100 ? 'ks-tag-gold' : ''}" style="font-size: 0.76rem;">
                  ${percentReady === 100 ? '✓ Setup Complete' : `${completedTasks} of ${totalTasks} Steps Done`}
                </span>
              </div>
              <p class="ks-card-desc" style="font-size: 0.88rem; max-width: 650px;">
                Welcome to your channel dashboard! Follow this checklist to verify your permissions, moderator status, and bot connectivity so your chat commands and features run flawlessly.
              </p>
            </div>

            <div style="text-align: right; min-width: 140px;">
              <div style="font-size: 1.8rem; font-weight: 700; font-family: var(--ks-mono); color: ${percentReady === 100 ? 'var(--ks-kinpaku)' : 'var(--ks-champagne)'};">
                ${percentReady}%
              </div>
              <div style="font-size: 0.76rem; color: var(--ks-text-muted);">Platform Readiness</div>
            </div>
          </div>

          <!-- Progress Bar Track -->
          <div 
            role="progressbar" 
            aria-valuenow="${percentReady}" 
            aria-valuemin="0" 
            aria-valuemax="100" 
            aria-label="Platform Readiness" 
            style="width: 100%; height: 8px; background: var(--ks-lacquer-deep); border-radius: 99px; overflow: hidden; border: 1px solid var(--ks-rule);"
          >
            <div style="width: 100%; height: 100%; transform: scaleX(${percentReady / 100}); transform-origin: left; background: ${percentReady === 100 ? 'linear-gradient(90deg, var(--ks-kinpaku-rich), var(--ks-kinpaku))' : 'linear-gradient(90deg, var(--ks-patina-deep), var(--ks-patina))'}; transition: transform 0.4s var(--ks-ease); will-change: transform;"></div>
          </div>
        </section>

        <!-- 4 Essential Setup Cards Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin-bottom: 24px;">

          <!-- 1. Twitch Scopes & Permissions Card -->
          <div class="ks-card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 32px; height: 32px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); display: flex; align-items: center; justify-content: center; border: 1px solid var(--ks-rule);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                  </div>
                  <h3 style="font-size: 1.02rem; font-weight: 600; color: var(--ks-champagne); margin: 0;">1. Twitch Permissions</h3>
                </div>
                ${allScopesGranted ? `
                  <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Verified</span>
                ` : `
                  <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;">Action Required</span>
                `}
              </div>

              <p style="font-size: 0.84rem; color: var(--ks-text-muted); line-height: 1.45; margin-bottom: 14px;">
                Twitch permissions grant the bot access to join chat under official chatbot terms, verify followers for <code>{followage}</code>, and manage moderators.
              </p>

              <!-- Scopes List -->
              <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                ${requiredScopes.map((scope) => {
                  const isGranted = grantedScopesSet.has(scope.id);
                  return `
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 6px 10px; background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-xs);">
                      <div>
                        <div style="font-size: 0.8rem; font-weight: 600; color: var(--ks-champagne);">${escapeAttr(scope.name)}</div>
                        <div style="font-size: 0.72rem; color: var(--ks-text-muted);">${escapeAttr(scope.desc)}</div>
                      </div>
                      ${isGranted ? `
                        <span style="color: var(--ks-patina); font-size: 0.82rem; font-weight: 700; white-space: nowrap;">✓ OK</span>
                      ` : scope.required ? `
                        <span style="color: var(--ks-vermilion); font-size: 0.75rem; font-weight: 600; white-space: nowrap;">Missing</span>
                      ` : `
                        <span style="color: var(--ks-text-muted); font-size: 0.75rem; font-weight: 500; white-space: nowrap;">Optional</span>
                      `}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>

            <div>
              ${!allScopesGranted ? `
                <a href="/auth/login" class="ks-button ks-button-primary" style="width: 100%; justify-content: center;">
                  <span>Update Twitch Permissions</span>
                  <span class="ks-button-arrow"><svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                </a>
              ` : `
                <div style="font-size: 0.78rem; color: var(--ks-patina); display: flex; align-items: center; gap: 6px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <span>All requested scopes are authorized and valid.</span>
                </div>
              `}
            </div>
          </div>

          <!-- 2. Bot Moderator Status Card -->
          <div class="ks-card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 32px; height: 32px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); display: flex; align-items: center; justify-content: center; border: 1px solid var(--ks-rule);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    </svg>
                  </div>
                  <h3 style="font-size: 1.02rem; font-weight: 600; color: var(--ks-champagne); margin: 0;">2. Channel Moderator</h3>
                </div>
                ${isBotMod === true ? `
                  <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Modded</span>
                ` : `
                  <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;">Not Modded</span>
                `}
              </div>

              <p style="font-size: 0.84rem; color: var(--ks-text-muted); line-height: 1.45; margin-bottom: 14px;">
                Mod status allows @<strong>${escapeAttr(bot?.displayName || bot?.login || config.botName)}</strong> to speak freely without Twitch slow-mode limits, timeout offenders in auto-mod, and deliver fast responses.
              </p>

              ${isBotMod === true ? `
                <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-patina-deep); margin-bottom: 16px;">
                  <div style="font-size: 0.82rem; font-weight: 600; color: var(--ks-patina); display: flex; align-items: center; gap: 6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Bot is a verified Moderator in ${channel.displayName}</span>
                  </div>
                  <div style="font-size: 0.74rem; color: var(--ks-text-muted); margin-top: 4px;">Rate-limit protection and auto-moderation permissions are active.</div>
                </div>
              ` : `
                <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); margin-bottom: 16px;">
                  <div style="font-size: 0.8rem; color: var(--ks-text-muted); margin-bottom: 8px;">
                    Click below to automatically grant moderator status, or paste into Twitch chat:
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                    <code style="flex: 1; font-family: var(--ks-mono); font-size: 0.82rem; color: var(--ks-kinpaku); padding: 4px 8px; background: var(--ks-lacquer-deep); border-radius: 4px; border: 1px solid var(--ks-rule);">/mod @${escapeAttr(bot?.login || 'bot')}</code>
                    <button type="button" class="ks-button ks-button-secondary copy-mod-btn" data-copy="/mod @${escapeAttr(bot?.login || 'bot')}" style="min-height: 28px; padding: 0 10px; font-size: 0.76rem;">Copy</button>
                    <a href="https://twitch.tv/popout/${channel.login}/chat" target="_blank" rel="noopener noreferrer" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 10px; font-size: 0.76rem;" title="Open Twitch Chat in Popout">Open Chat</a>
                  </div>
                </div>
              `}
            </div>

            <div>
              ${isBotMod !== true ? `
                <form action="/api/setup/mod-bot" method="POST">
                  <input type="hidden" name="channelId" value="${channel.id}" />
                  <button type="submit" class="ks-button ks-button-primary" style="width: 100%; justify-content: center;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <span>Mod Bot Automatically (1-Click)</span>
                  </button>
                </form>
              ` : `
                <div style="font-size: 0.78rem; color: var(--ks-text-muted);">
                  Moderator status confirmed via Twitch API.
                </div>
              `}
            </div>
          </div>

          <!-- 3. Bot Chat Room Connection Card -->
          <div class="ks-card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 32px; height: 32px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); display: flex; align-items: center; justify-content: center; border: 1px solid var(--ks-rule);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <h3 style="font-size: 1.02rem; font-weight: 600; color: var(--ks-champagne); margin: 0;">3. Chat Presence</h3>
                </div>
                ${channel.joined ? `
                  <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem;">✓ Connected</span>
                ` : `
                  <span class="ks-tag ks-tag-vermilion" style="font-size: 0.72rem;">Disconnected</span>
                `}
              </div>

              <p style="font-size: 0.84rem; color: var(--ks-text-muted); line-height: 1.45; margin-bottom: 14px;">
                Controls whether the central bot is actively listening in your stream chat room (<code>#${channel.login}</code>) and reacting to commands.
              </p>

              <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); margin-bottom: 16px;">
                <div style="font-size: 0.8rem; color: var(--ks-text-muted);">Current Channel:</div>
                <div style="font-weight: 600; color: var(--ks-champagne); font-size: 0.95rem; margin-top: 2px;">twitch.tv/${channel.login}</div>
                <div style="font-size: 0.74rem; color: ${channel.joined ? 'var(--ks-patina)' : 'var(--ks-text-faint)'}; margin-top: 4px;">
                  ${channel.joined ? '● Bot is listening to incoming chat and events' : '○ Bot is idle and not connected'}
                </div>
              </div>
            </div>

            <div>
              <form action="/api/channel/join" method="POST">
                <input type="hidden" name="channelId" value="${channel.id}" />
                <input type="hidden" name="joined" value="${channel.joined ? 'false' : 'true'}" />
                <button type="submit" class="ks-button ${channel.joined ? 'ks-button-secondary' : 'ks-button-primary'}" style="width: 100%; justify-content: center;">
                  ${channel.joined ? 'Disconnect Bot from Chat' : 'Connect Bot to Chat (Join)'}
                </button>
              </form>
            </div>
          </div>

          <!-- 4. Live Test Message Card -->
          <div class="ks-card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="width: 32px; height: 32px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); display: flex; align-items: center; justify-content: center; border: 1px solid var(--ks-rule);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                      <line x1="22" y1="2" x2="11" y2="13"></line>
                      <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                  </div>
                  <h3 style="font-size: 1.02rem; font-weight: 600; color: var(--ks-champagne); margin: 0;">4. Send Test Message</h3>
                </div>
                <span class="ks-tag ks-tag-gold" style="font-size: 0.72rem;">Live Test</span>
              </div>

              <p style="font-size: 0.84rem; color: var(--ks-text-muted); line-height: 1.45; margin-bottom: 14px;">
                Broadcast an instant test message from the bot into #${channel.login} to confirm live message delivery.
              </p>

              <form action="/api/send-test" method="POST" id="overviewTestForm" class="ks-async-test-form">
                <input type="hidden" name="channelId" value="${channel.id}" />
                <div class="ks-form-group" style="margin-bottom: 12px;">
                  <input type="text" id="overviewTestMsg" aria-label="Broadcast test chat message" name="message" class="ks-input-text" value="Hello chat! @${escapeAttr(bot?.displayName || bot?.login || config.botName)} is active and ready." required maxlength="200" style="font-size: 0.85rem;" />
                </div>
                <button type="submit" class="ks-button ks-button-primary" style="width: 100%; justify-content: center;">
                  <span>Dispatch Message to Chat</span>
                  <span class="ks-button-arrow"><svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
                </button>
              </form>
            </div>

            <div style="font-size: 0.75rem; color: var(--ks-text-faint); margin-top: 10px;">
              Requires bot to be connected and registered.
            </div>
          </div>

        </div>

        <!-- Live Bot Activity Stream Section -->
        <section class="ks-card" style="margin-bottom: 24px;">
          <div class="ks-card-header" style="margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <h3 class="ks-card-title" style="margin: 0;">Live Bot Activity Stream</h3>
              <span class="ks-tag ks-tag-patina" style="font-size: 0.72rem; display: inline-flex; align-items: center; gap: 5px;">
                <span class="ks-dot-live" style="width: 6px; height: 6px; display: inline-block;"></span>
                <span>Live Feed</span>
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span id="activityFeedStatus" style="font-size: 0.76rem; color: var(--ks-text-muted);">Auto-refreshing (6s)</span>
              <button type="button" id="refreshActivityBtn" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 10px; font-size: 0.78rem;" title="Refresh activity stream">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <!-- Activity List Feed Container -->
          <div id="liveActivityList" style="display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow-y: auto; padding-right: 4px;">
            <div style="text-align: center; padding: 32px 14px; color: var(--ks-text-muted); font-size: 0.85rem; border: 1px dashed var(--ks-rule); border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep);">
              <div style="color: var(--ks-champagne); margin-bottom: 6px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <div style="font-weight: 500; color: var(--ks-text-primary);">No bot activities recorded in this session yet.</div>
              <div style="font-size: 0.76rem; color: var(--ks-text-faint); margin-top: 4px;">Commands, automod actions, stream alerts, and timers will stream here in real time.</div>
            </div>
          </div>
        </section>

        <!-- Starter Pack & Quick Features Guide -->
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h3 class="ks-card-title">Essential Stream Commands to Try</h3>
              <p class="ks-card-desc">Your channel prefix is currently set to <code>${currentPrefix}</code>. Type any of these in your stream chat:</p>
            </div>
            <button type="button" data-tab="commands" class="ks-button ks-button-secondary">
              Open Commands Studio (${channel.commands?.length || 0})
            </button>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 20px;">
            <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule);">
              <div style="font-family: var(--ks-mono); font-size: 0.9rem; font-weight: 600; color: var(--ks-kinpaku);">${currentPrefix}uptime</div>
              <div style="font-size: 0.78rem; color: var(--ks-text-muted); margin-top: 4px;">Reports how long your stream has been live via Twitch Streams API.</div>
            </div>
            <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule);">
              <div style="font-family: var(--ks-mono); font-size: 0.9rem; font-weight: 600; color: var(--ks-kinpaku);">${currentPrefix}game</div>
              <div style="font-size: 0.78rem; color: var(--ks-text-muted); margin-top: 4px;">Outputs the current Twitch game or category being streamed.</div>
            </div>
            <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule);">
              <div style="font-family: var(--ks-mono); font-size: 0.9rem; font-weight: 600; color: var(--ks-kinpaku);">${currentPrefix}title</div>
              <div style="font-size: 0.78rem; color: var(--ks-text-muted); margin-top: 4px;">Outputs your current stream title and broadcast description.</div>
            </div>
            <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule);">
              <div style="font-family: var(--ks-mono); font-size: 0.9rem; font-weight: 600; color: var(--ks-kinpaku);">${currentPrefix}followage</div>
              <div style="font-size: 0.78rem; color: var(--ks-text-muted); margin-top: 4px;">Reports how long the chatter or target has followed your channel.</div>
            </div>
            <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule);">
              <div style="font-family: var(--ks-mono); font-size: 0.9rem; font-weight: 600; color: var(--ks-kinpaku);">${currentPrefix}ping</div>
              <div style="font-size: 0.78rem; color: var(--ks-text-muted); margin-top: 4px;">Responds with pong to verify bot responsiveness in chat.</div>
            </div>
            <div style="padding: 12px 14px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule);">
              <div style="font-family: var(--ks-mono); font-size: 0.9rem; font-weight: 600; color: var(--ks-kinpaku);">${currentPrefix}so @creator</div>
              <div style="font-size: 0.78rem; color: var(--ks-text-muted); margin-top: 4px;">Triggers Twitch native shoutout banner and formatted chat promotion.</div>
            </div>
          </div>

          <!-- Quick Navigation Shortcuts Bar -->
          <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding-top: 14px; border-top: 1px solid var(--ks-rule);">
            <div style="font-size: 0.82rem; color: var(--ks-text-muted);">Quick Feature Setup:</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              <button type="button" data-tab="timers" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 12px; font-size: 0.8rem;">Chat Timers</button>
              <button type="button" data-tab="shoutouts" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 12px; font-size: 0.8rem;">Shoutout Directory</button>
              <button type="button" data-tab="raids" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 12px; font-size: 0.8rem;">Raid Welcomes</button>
              <button type="button" data-tab="moderation" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 12px; font-size: 0.8rem;">Auto-Moderation</button>
              <button type="button" data-tab="managers" class="ks-button ks-button-secondary" style="min-height: 28px; padding: 0 12px; font-size: 0.8rem;">Add Managers</button>
            </div>
          </div>
        </section>

      </div>

      <!-- 1. CUSTOM COMMANDS TAB -->
      <div id="tab-commands" class="ks-tab-content ${activeTab === 'commands' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-commands" tabindex="0">
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Channel Commands</h2>
              <p class="ks-card-desc">Commands respond instantly in stream chat using prefix <code>${currentPrefix}</code>.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <a 
                href="/api/commands/export?channelId=${channel.id}" 
                class="ks-button ks-button-secondary" 
                style="min-height: 32px; padding: 0 12px; font-size: 0.8rem;" 
                title="Download all custom commands as a JSON backup file"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Export JSON</span>
              </a>
              <button 
                type="button" 
                id="openImportCommandsBtn" 
                class="ks-button ks-button-secondary" 
                style="min-height: 32px; padding: 0 12px; font-size: 0.8rem;" 
                title="Import commands from JSON file or pasted text"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <span>Import JSON</span>
              </button>
              <button type="button" id="openAddCommandBtn" class="ks-button ks-button-primary">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                  <path d="M8 2v12M2 8h12"/>
                </svg>
                <span>Add Command</span>
              </button>
            </div>
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
                    <td>
                      <span class="ks-tag ks-tag-gold">${currentPrefix}${escapeAttr(cmd.trigger)}</span>
                      ${cmd.aliases ? `
                        <div style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;">
                          ${cmd.aliases.split(',').map((a) => a.trim()).filter(Boolean).map((a) => `
                            <span class="ks-tag" style="font-size: 0.72rem; padding: 1px 5px; opacity: 0.85;" title="Alias for ${currentPrefix}${escapeAttr(cmd.trigger)}">${currentPrefix}${escapeAttr(a)}</span>
                          `).join('')}
                        </div>
                      ` : ''}
                    </td>
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
                        data-cmd-aliases="${escapeAttr(cmd.aliases || '')}"
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

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
              <div class="ks-form-group">
                <label class="ks-label" for="cmd-trigger">Command Trigger (without prefix: ${currentPrefix})</label>
                <input type="text" id="cmd-trigger" name="trigger" class="ks-input-text" placeholder="discord, specs, socials" required pattern="[a-zA-Z0-9_]+" />
              </div>
              <div class="ks-form-group">
                <label class="ks-label" for="cmd-aliases">Aliases (optional, comma-separated)</label>
                <input type="text" id="cmd-aliases" name="aliases" class="ks-input-text" placeholder="e.g. dc, disc, chatcord" />
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
              </label>
              <input type="text" id="cmd-response" name="response" class="ks-input-text" placeholder="Join our Discord community at https://discord.gg/..." required maxlength="500" />
              <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.78rem;">
                <span style="color: var(--ks-text-muted); font-size: 0.74rem; margin-right: 2px;">Click to insert:</span>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{user}" title="Chatter username (@username)">{user}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{target}" title="Target user from command argument (@target or chatter)">{target}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{channel}" title="Channel display name">{channel}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{uptime}" title="Stream live duration (e.g. 2h 15m) or offline">{uptime}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{game}" title="Current category/game being played">{game}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{title}" title="Current stream title">{title}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{followage}" title="How long chatter/target has followed channel">{followage}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{count}" title="Command usage counter">{count}</button>
                <button type="button" class="ks-var-pill" data-target-input="cmd-response" data-insert="{random.1-100}" title="Random integer between 1 and 100">{random.1-100}</button>
              </div>
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

        <!-- Import Commands Modal -->
        <div 
          id="importCommandsModal" 
          class="ks-modal-backdrop" 
          role="dialog" 
          aria-modal="true" 
          aria-labelledby="importModalTitle" 
          aria-describedby="importModalDesc" 
          style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.78); backdrop-filter: blur(4px); z-index: 9999; align-items: center; justify-content: center; padding: 16px;"
        >
          <div class="ks-card" style="max-width: 540px; width: 100%; border-color: var(--ks-gold-hairline); box-shadow: 0 20px 40px rgba(0,0,0,0.8); background: var(--ks-raised-lacquer); padding: 24px;">
            
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 36px; height: 36px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); border: 1px solid var(--ks-gold-hairline); display: flex; align-items: center; justify-content: center; color: var(--ks-kinpaku);">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                </div>
                <div>
                  <h3 id="importModalTitle" style="font-size: 1.15rem; font-weight: 700; color: var(--ks-champagne); margin: 0;">Import Custom Commands</h3>
                  <div id="importModalDesc" style="font-size: 0.78rem; color: var(--ks-text-muted);">Restore commands from a JSON backup file or pasted text</div>
                </div>
              </div>
              
              <button type="button" id="closeImportModalBtn" aria-label="Close import dialog" style="background: none; border: none; color: var(--ks-text-muted); cursor: pointer; padding: 4px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <form action="/api/commands/import" method="POST" id="importCommandsForm">
              <input type="hidden" name="channelId" value="${channel.id}" />

              <div class="ks-form-group" style="margin-bottom: 14px;">
                <label class="ks-label" for="importJsonFile">Choose JSON File to Upload</label>
                <input type="file" id="importJsonFile" accept=".json,application/json" class="ks-input-text" style="padding: 6px 10px; font-size: 0.85rem;" />
              </div>

              <div class="ks-form-group" style="margin-bottom: 14px;">
                <label class="ks-label" for="importJsonContent">Or Paste JSON Data Directly</label>
                <textarea 
                  id="importJsonContent" 
                  name="commandsJson" 
                  class="ks-textarea" 
                  rows="5" 
                  placeholder='[&#10;  { "trigger": "discord", "response": "Join us at https://...", "aliases": "dc" }&#10;]' 
                  style="font-family: var(--ks-mono); font-size: 0.82rem;"
                ></textarea>
              </div>

              <div class="ks-form-group" style="margin-bottom: 20px;">
                <label class="ks-label">Import Mode</label>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                  <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 0.86rem; color: var(--ks-text-primary);">
                    <input type="radio" name="mode" value="merge" checked style="margin-top: 2px; accent-color: var(--ks-kinpaku);" />
                    <div>
                      <strong>Merge (Recommended)</strong>
                      <div style="font-size: 0.78rem; color: var(--ks-text-muted);">Updates matching command triggers and inserts new commands without deleting other existing commands.</div>
                    </div>
                  </label>
                  <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer; font-size: 0.86rem; color: var(--ks-text-primary);">
                    <input type="radio" name="mode" value="replace" style="margin-top: 2px; accent-color: var(--ks-kinpaku);" />
                    <div>
                      <strong style="color: var(--ks-vermilion);">Replace (Overwrite All)</strong>
                      <div style="font-size: 0.78rem; color: var(--ks-text-muted);">Erases all current custom commands for this channel and replaces them completely with the imported dataset.</div>
                    </div>
                  </label>
                </div>
              </div>

              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                <button type="button" id="cancelImportBtn" class="ks-button ks-button-secondary">
                  Cancel
                </button>
                <button type="submit" class="ks-button ks-button-primary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                  <span>Execute Import</span>
                </button>
              </div>
            </form>

          </div>
        </div>
      </div>

      <!-- 2. BUILT-IN COMMANDS TAB -->
      <div id="tab-builtins" class="ks-tab-content ${activeTab === 'builtins' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-builtins" tabindex="0">
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
                              aria-label="${isDisabled ? 'Enable' : 'Disable'} built-in command ${currentPrefix}${b.trigger}"
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
      <div id="tab-timers" class="ks-tab-content ${activeTab === 'timers' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-timers" tabindex="0">
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
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--ks-kinpaku)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.85; margin-bottom: 4px;">
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
              <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: 0.78rem;">
                <span style="color: var(--ks-text-muted); font-size: 0.74rem; margin-right: 2px;">Click to insert:</span>
                <button type="button" class="ks-var-pill" data-target-input="timer-message" data-insert="{channel}" title="Channel display name">{channel}</button>
                <button type="button" class="ks-var-pill" data-target-input="timer-message" data-insert="{uptime}" title="Stream live duration (e.g. 2h 15m) or offline">{uptime}</button>
                <button type="button" class="ks-var-pill" data-target-input="timer-message" data-insert="{game}" title="Current category/game being played">{game}</button>
                <button type="button" class="ks-var-pill" data-target-input="timer-message" data-insert="{title}" title="Current stream title">{title}</button>
                <button type="button" class="ks-var-pill" data-target-input="timer-message" data-insert="{random.1-100}" title="Random integer between 1 and 100">{random.1-100}</button>
              </div>
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
      <div id="tab-raids" class="ks-tab-content ${activeTab === 'raids' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-raids" tabindex="0">
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
                <input type="checkbox" name="enabled" value="true" aria-label="Enable Automated Raid Welcomes" ${raidSettings.enabled ? 'checked' : ''}>
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
                  <button type="button" class="ks-var-pill" data-target-input="raid-message" data-insert="{raider}" title="Click to insert {raider}">{raider}</button>
                  <button type="button" class="ks-var-pill" data-target-input="raid-message" data-insert="{viewers}" title="Click to insert {viewers}">{viewers}</button>
                  <button type="button" class="ks-var-pill" data-target-input="raid-message" data-insert="{game}" title="Click to insert {game}">{game}</button>
                  <button type="button" class="ks-var-pill" data-target-input="raid-message" data-insert="{url}" title="Click to insert {url}">{url}</button>
                  <button type="button" class="ks-var-pill" data-target-input="raid-message" data-insert="{channel}" title="Click to insert {channel}">{channel}</button>
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
      <div id="tab-shoutouts" class="ks-tab-content ${activeTab === 'shoutouts' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-shoutouts" tabindex="0">
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
                <input type="checkbox" name="enabled" value="true" aria-label="Enable Shoutout System" ${shoutoutSettings.enabled ? 'checked' : ''}>
                <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
              </label>
            </div>

            <div class="ks-form-group">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 8px;">
                <label class="ks-label" for="shoutout-message" style="margin-bottom: 0;">Shoutout Message Template</label>
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-size: 0.76rem; color: var(--ks-text-muted);">Variables:</span>
                  <button type="button" class="ks-var-pill" data-target-input="shoutout-message" data-insert="{target}" title="Click to insert {target}">{target}</button>
                  <button type="button" class="ks-var-pill" data-target-input="shoutout-message" data-insert="{game}" title="Click to insert {game}">{game}</button>
                  <button type="button" class="ks-var-pill" data-target-input="shoutout-message" data-insert="{url}" title="Click to insert {url}">{url}</button>
                  <button type="button" class="ks-var-pill" data-target-input="shoutout-message" data-insert="{channel}" title="Click to insert {channel}">{channel}</button>
                  <button type="button" class="ks-var-pill" data-target-input="shoutout-message" data-insert="{user}" title="Click to insert {user}">{user}</button>
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
                    style="margin-top: 3px; accent-color: var(--ks-kinpaku);"
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
                    style="margin-top: 3px; accent-color: var(--ks-kinpaku);"
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
                id="autoShoutoutInput"
                name="targetLogin" 
                class="ks-input-text" 
                aria-label="Twitch username to add for auto-shoutouts"
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
                            style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--ks-gold-hairline); background: var(--ks-lacquer-deep);"
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
                            aria-label="Toggle auto-shoutout for @${escapeAttr(item.targetLogin)}"
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
      <div id="tab-prefix" class="ks-tab-content ${activeTab === 'prefix' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-prefix" tabindex="0">
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
      <div id="tab-moderation" class="ks-tab-content ${activeTab === 'moderation' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-moderation" tabindex="0">
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
                  <input type="checkbox" name="filterLinks" aria-label="Block Unpermitted Links" ${channel.moderation?.filterLinks ? 'checked' : ''}>
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
                  <input type="checkbox" name="filterCaps" aria-label="Block Excessive Caps" ${channel.moderation?.filterCaps ? 'checked' : ''}>
                  <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
                </label>
              </div>

              <div class="ks-toggle-row" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--ks-rule);">
                <div style="max-width: 600px;">
                  <div style="font-weight: 600; color: var(--ks-champagne);">Emote &amp; Unicode Limit Filter</div>
                  <div style="color: var(--ks-text-muted); font-size: 0.85rem; margin-top: 2px;">
                    Deletes chat messages exceeding a maximum threshold of native Twitch emotes and Unicode emojis.
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                    <label for="max-emotes" class="ks-label" style="margin-bottom: 0; font-size: 0.78rem;">Max Allowed Emotes:</label>
                    <input 
                      type="number" 
                      id="max-emotes" 
                      name="maxEmotes" 
                      class="ks-input-text" 
                      value="${channel.moderation?.maxEmotes ?? 8}" 
                      min="1" 
                      max="100" 
                      style="max-width: 90px; min-height: 30px; padding: 4px 8px; font-family: var(--ks-mono); font-size: 0.85rem;" 
                    />
                  </div>
                </div>
                <label class="ks-toggle" title="Toggle emote limit filter">
                  <input type="checkbox" name="filterEmotes" aria-label="Emote and Unicode Limit Filter" ${channel.moderation?.filterEmotes ? 'checked' : ''}>
                  <span class="ks-toggle-track"><span class="ks-toggle-knob"></span></span>
                </label>
              </div>

              <div class="ks-toggle-row" style="display: flex; align-items: center; justify-content: space-between; padding: 16px 0; border-bottom: 1px solid var(--ks-rule);">
                <div style="max-width: 600px;">
                  <div style="font-weight: 600; color: var(--ks-champagne);">Repeated Text &amp; Word Spam Filter</div>
                  <div style="color: var(--ks-text-muted); font-size: 0.85rem; margin-top: 2px;">
                    Detects and removes copy-paste spam where phrases or words are repeated in a single chat message.
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                    <label for="max-repetition" class="ks-label" style="margin-bottom: 0; font-size: 0.78rem;">Max Word Repetitions:</label>
                    <input 
                      type="number" 
                      id="max-repetition" 
                      name="maxRepetition" 
                      class="ks-input-text" 
                      value="${channel.moderation?.maxRepetition ?? 3}" 
                      min="2" 
                      max="20" 
                      style="max-width: 90px; min-height: 30px; padding: 4px 8px; font-family: var(--ks-mono); font-size: 0.85rem;" 
                    />
                  </div>
                </div>
                <label class="ks-toggle" title="Toggle repetition filter">
                  <input type="checkbox" name="filterRepetition" aria-label="Repeated Text and Word Spam Filter" ${channel.moderation?.filterRepetition ? 'checked' : ''}>
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
      <div id="tab-managers" class="ks-tab-content ${activeTab === 'managers' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-managers" tabindex="0">
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
                id="managerUsernameInput"
                name="username" 
                class="ks-input-text" 
                aria-label="Twitch username for new channel manager"
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
      <div id="tab-test" class="ks-tab-content ${activeTab === 'test' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-test" tabindex="0">
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

      <!-- 6. STREAM ALERTS TAB -->
      <div id="tab-alerts" class="ks-tab-content ${activeTab === 'alerts' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-alerts" tabindex="0">
        <section class="ks-card" style="margin-bottom: 24px;">
          <div class="ks-card-header">
            <div>
              <h2 class="ks-card-title">Stream Events & Chat Alerts</h2>
              <p class="ks-card-desc">
                Automatically welcome new followers and thank subscribers directly in your Twitch chat with real-time EventSub alerts.
              </p>
            </div>
          </div>

          <form action="/api/alerts/settings" method="POST">
            <input type="hidden" name="channelId" value="${channel.id}">

            <!-- 1. Follower Alerts Section -->
            <div style="background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-md); padding: 18px; margin-bottom: 20px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 32px; height: 32px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); display: flex; align-items: center; justify-content: center; border: 1px solid var(--ks-rule);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                  </div>
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--ks-champagne); margin: 0;">💜 Follower Chat Alerts</h3>
                    <p style="font-size: 0.8rem; color: var(--ks-text-muted); margin: 0;">Announce new followers when someone hits the follow button on your stream.</p>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 12px;">
                  <label class="ks-switch">
                    <input type="checkbox" name="followEnabled" aria-label="Enable Follower Chat Alerts" ${streamAlerts.followEnabled ? 'checked' : ''}>
                    <span class="ks-slider"></span>
                  </label>
                </div>
              </div>

              <div class="ks-form-group" style="margin-bottom: 12px;">
                <label class="ks-label" for="alert-follow-message">Follower Welcome Message</label>
                <textarea 
                  id="alert-follow-message" 
                  name="followMessage" 
                  class="ks-textarea" 
                  rows="2"
                  placeholder="Thank you for following, @{user}! Welcome to the stream! 💜"
                >${escapeAttr(streamAlerts.followMessage)}</textarea>
              </div>

              <!-- Pill Buttons for Follower Message -->
              <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-size: 0.75rem; color: var(--ks-text-faint); margin-right: 4px;">Insert tag:</span>
                  <button type="button" class="ks-var-pill" data-target-input="alert-follow-message" data-insert="{user}">{user}</button>
                  <button type="button" class="ks-var-pill" data-target-input="alert-follow-message" data-insert="{channel}">{channel}</button>
                </div>

                <!-- Test Follower Alert -->
                <button 
                  type="submit" 
                  formaction="/api/alerts/test" 
                  formmethod="POST" 
                  name="type" 
                  value="follow" 
                  class="ks-button ks-button-secondary" 
                  style="min-height: 28px; padding: 0 12px; font-size: 0.8rem;"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                  Test Follow Alert
                </button>
              </div>
            </div>

            <!-- 2. Subscriber Alerts Section -->
            <div style="background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule); border-radius: var(--ks-radius-md); padding: 18px; margin-bottom: 24px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <div style="width: 32px; height: 32px; border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep); display: flex; align-items: center; justify-content: center; border: 1px solid var(--ks-rule);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                  </div>
                  <div>
                    <h3 style="font-size: 1.05rem; font-weight: 600; color: var(--ks-champagne); margin: 0;">🎉 Subscriber & Gift Chat Alerts</h3>
                    <p style="font-size: 0.8rem; color: var(--ks-text-muted); margin: 0;">Celebrate new subscribers, resub streaks, individual gift subs, and community sub bombs.</p>
                  </div>
                </div>

                <div style="display: flex; align-items: center; gap: 12px;">
                  <label class="ks-switch">
                    <input type="checkbox" name="subEnabled" aria-label="Enable Subscriber & Gift Chat Alerts" ${streamAlerts.subEnabled ? 'checked' : ''}>
                    <span class="ks-slider"></span>
                  </label>
                </div>
              </div>

              <!-- 2a. New Subscriber Message -->
              <div class="ks-form-group" style="margin-bottom: 14px;">
                <label class="ks-label" for="alert-sub-message">New Subscriber Message</label>
                <textarea 
                  id="alert-sub-message" 
                  name="subMessage" 
                  class="ks-textarea" 
                  rows="2"
                  placeholder="Thank you @{user} for subscribing at {tier}! Welcome to the family! 🎉"
                >${escapeAttr(streamAlerts.subMessage)}</textarea>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; color: var(--ks-text-faint);">Insert tag:</span>
                    <button type="button" class="ks-var-pill" data-target-input="alert-sub-message" data-insert="{user}">{user}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-sub-message" data-insert="{tier}">{tier}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-sub-message" data-insert="{channel}">{channel}</button>
                  </div>
                  <button type="submit" formaction="/api/alerts/test" formmethod="POST" name="type" value="sub" class="ks-button ks-button-secondary" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">Test Sub</button>
                </div>
              </div>

              <!-- 2b. Resubscriber Message -->
              <div class="ks-form-group" style="margin-bottom: 14px;">
                <label class="ks-label" for="alert-resub-message">Resubscriber & Streak Message</label>
                <textarea 
                  id="alert-resub-message" 
                  name="resubMessage" 
                  class="ks-textarea" 
                  rows="2"
                  placeholder="Welcome back @{user} for resubscribing at {tier} for {months} months! {streak} {message}"
                >${escapeAttr(streamAlerts.resubMessage)}</textarea>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; color: var(--ks-text-faint);">Insert tag:</span>
                    <button type="button" class="ks-var-pill" data-target-input="alert-resub-message" data-insert="{user}">{user}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-resub-message" data-insert="{tier}">{tier}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-resub-message" data-insert="{months}">{months}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-resub-message" data-insert="{streak}">{streak}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-resub-message" data-insert="{message}">{message}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-resub-message" data-insert="{channel}">{channel}</button>
                  </div>
                  <button type="submit" formaction="/api/alerts/test" formmethod="POST" name="type" value="resub" class="ks-button ks-button-secondary" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">Test Resub</button>
                </div>
              </div>

              <!-- 2c. Single Gift Sub Message -->
              <div class="ks-form-group" style="margin-bottom: 14px;">
                <label class="ks-label" for="alert-gift-message">Individual Gift Sub Message</label>
                <textarea 
                  id="alert-gift-message" 
                  name="giftSubMessage" 
                  class="ks-textarea" 
                  rows="2"
                  placeholder="Thank you @{user} for gifting a {tier} sub to @{recipient}! 🎁"
                >${escapeAttr(streamAlerts.giftSubMessage)}</textarea>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; color: var(--ks-text-faint);">Insert tag:</span>
                    <button type="button" class="ks-var-pill" data-target-input="alert-gift-message" data-insert="{user}">{user}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-gift-message" data-insert="{tier}">{tier}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-gift-message" data-insert="{recipient}">{recipient}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-gift-message" data-insert="{channel}">{channel}</button>
                  </div>
                  <button type="submit" formaction="/api/alerts/test" formmethod="POST" name="type" value="gift" class="ks-button ks-button-secondary" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">Test Gift</button>
                </div>
              </div>

              <!-- 2d. Community Sub Bomb Message -->
              <div class="ks-form-group" style="margin-bottom: 14px;">
                <label class="ks-label" for="alert-community-message">Community Sub Bomb Message (Multiple Gifts)</label>
                <textarea 
                  id="alert-community-message" 
                  name="communityGiftMessage" 
                  class="ks-textarea" 
                  rows="2"
                  placeholder="WOW! Huge thanks to @{user} for gifting {count} subs to the community! 🌟"
                >${escapeAttr(streamAlerts.communityGiftMessage)}</textarea>
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 6px;">
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span style="font-size: 0.75rem; color: var(--ks-text-faint);">Insert tag:</span>
                    <button type="button" class="ks-var-pill" data-target-input="alert-community-message" data-insert="{user}">{user}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-community-message" data-insert="{count}">{count}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-community-message" data-insert="{tier}">{tier}</button>
                    <button type="button" class="ks-var-pill" data-target-input="alert-community-message" data-insert="{channel}">{channel}</button>
                  </div>
                  <button type="submit" formaction="/api/alerts/test" formmethod="POST" name="type" value="community_gift" class="ks-button ks-button-secondary" style="min-height: 26px; padding: 0 10px; font-size: 0.78rem;">Test Sub Bomb</button>
                </div>
              </div>

            </div>

            <!-- Save Alert Settings Button -->
            <button type="submit" class="ks-button ks-button-primary">
              <span>Save Alert Settings</span>
              <span class="ks-button-arrow">
                <svg viewBox="0 0 14 8" fill="none"><path d="M1 4h12m0 0L9.5 1M13 4L9.5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </span>
            </button>
          </form>
        </section>
      </div>

      <!-- 7. CHANNEL POINT REWARDS TAB -->
      <div id="tab-rewards" class="ks-tab-content ${activeTab === 'rewards' ? 'active' : ''}" role="tabpanel" aria-labelledby="tab-btn-rewards" tabindex="0">
        <section class="ks-card" style="margin-bottom: 24px;">
          <div class="ks-card-header" style="margin-bottom: 0;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <h2 class="ks-card-title" style="margin: 0;">Channel Point Reward Triggers</h2>
                <span class="ks-tag ks-tag-gold" style="font-size: 0.72rem;">${channelPointTriggers.length} Triggers</span>
              </div>
              <p class="ks-card-desc">
                Trigger automated bot chat responses when viewers redeem custom channel points rewards on your stream.
              </p>
            </div>
            <button type="button" id="openAddRewardBtn" class="ks-button ks-button-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add Reward Trigger</span>
            </button>
          </div>
        </section>

        <!-- Create / Edit Reward Trigger Form Card (Hidden by default) -->
        <div id="addRewardCard" class="ks-card" style="display: none; border-color: var(--ks-gold-hairline); margin-bottom: 24px;">
          <div class="ks-card-header">
            <div>
              <h3 class="ks-card-title" id="rewardFormTitle">New Reward Trigger</h3>
              <p class="ks-card-desc" id="rewardFormDesc">Link a Twitch channel points reward to an automated bot chat response.</p>
            </div>
          </div>

          <form action="/api/redemptions/save" method="POST">
            <input type="hidden" name="channelId" value="${channel.id}">
            <input type="hidden" name="id" id="reward-id" value="">

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 16px;">
              <div class="ks-form-group" style="margin: 0;">
                <label class="ks-label" for="reward-title">Twitch Reward Title <span style="color: var(--ks-vermilion);">*</span></label>
                <input 
                  type="text" 
                  id="reward-title" 
                  name="rewardTitle" 
                  class="ks-input-text" 
                  placeholder="e.g. Hydrate, Posture Check, Ask the Bot" 
                  required 
                />
                <span style="font-size: 0.76rem; color: var(--ks-text-muted); margin-top: 4px; display: block;">
                  Must match the exact title of your reward in Twitch Creator Dashboard.
                </span>
              </div>

              <div class="ks-form-group" style="margin: 0;">
                <label class="ks-label" for="reward-cooldown">Cooldown (Seconds)</label>
                <input 
                  type="number" 
                  id="reward-cooldown" 
                  name="cooldownSeconds" 
                  class="ks-input-text" 
                  min="0" 
                  max="3600" 
                  value="5" 
                />
                <span style="font-size: 0.76rem; color: var(--ks-text-muted); margin-top: 4px; display: block;">
                  Prevents chat flooding if multiple viewers redeem rapidly.
                </span>
              </div>
            </div>

            <div class="ks-form-group" style="margin-bottom: 14px;">
              <label class="ks-label" for="reward-response">Bot Chat Response <span style="color: var(--ks-vermilion);">*</span></label>
              <textarea 
                id="reward-response" 
                name="responseMessage" 
                class="ks-textarea" 
                rows="3" 
                placeholder="🥤 Drink some water @{channel}! Reminder courtesy of @{user}! (Total drinks: {count})" 
                required
              ></textarea>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 8px;">
                <span style="font-size: 0.75rem; color: var(--ks-text-faint); margin-right: 4px;">Insert tag:</span>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{user}">{user}</button>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{reward}">{reward}</button>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{input}">{input}</button>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{channel}">{channel}</button>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{count}">{count}</button>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{uptime}">{uptime}</button>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{game}">{game}</button>
                <button type="button" class="ks-var-pill" data-target-input="reward-response" data-insert="{title}">{title}</button>
              </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px; margin-top: 18px;">
              <button type="submit" class="ks-button ks-button-primary">
                <span id="reward-submit-label">Save Trigger</span>
              </button>
              <button type="button" id="cancelAddRewardBtn" class="ks-button ks-button-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>

        <!-- Triggers List Table Card -->
        <section class="ks-card">
          <div class="ks-card-header">
            <div>
              <h3 class="ks-card-title">Configured Reward Triggers</h3>
              <p class="ks-card-desc">Active rewards will immediately trigger their response when redeemed in chat.</p>
            </div>
          </div>

          ${channelPointTriggers.length === 0 ? `
            <div style="text-align: center; padding: 48px 16px; background: var(--ks-raised-lacquer); border-radius: var(--ks-radius-md); border: 1px dashed var(--ks-rule);">
              <div style="width: 48px; height: 48px; margin: 0 auto 12px; border-radius: var(--ks-radius-sm); background: var(--ks-lacquer-deep); display: flex; align-items: center; justify-content: center; border: 1px solid var(--ks-rule);">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7v10M9 10h6"></path>
                </svg>
              </div>
              <h4 style="font-size: 1.05rem; font-weight: 600; color: var(--ks-champagne); margin-bottom: 4px;">No Reward Triggers Configured</h4>
              <p style="font-size: 0.84rem; color: var(--ks-text-muted); max-width: 420px; margin: 0 auto 16px;">
                Create your first trigger above to make your Twitch channel points interactive with automated bot messages!
              </p>
              <button type="button" onclick="document.getElementById('openAddRewardBtn').click()" class="ks-button ks-button-secondary">
                Add Your First Trigger
              </button>
            </div>
          ` : `
            <div style="overflow-x: auto;">
              <table class="ks-table">
                <thead>
                  <tr>
                    <th>Twitch Reward</th>
                    <th>Bot Response Message</th>
                    <th>Cooldown</th>
                    <th>Redemptions</th>
                    <th>Status</th>
                    <th style="text-align: right;">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${channelPointTriggers.map((trig) => `
                    <tr>
                      <td style="font-weight: 600; color: var(--ks-champagne); white-space: nowrap;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--ks-kinpaku);">
                            <circle cx="12" cy="12" r="9"></circle>
                            <path d="M12 7v10M9 10h6"></path>
                          </svg>
                          <span>${escapeAttr(trig.rewardTitle)}</span>
                        </div>
                      </td>
                      <td style="max-width: 320px;">
                        <div style="font-size: 0.84rem; color: var(--ks-text-warm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                          ${escapeAttr(trig.responseMessage)}
                        </div>
                      </td>
                      <td>
                        <span class="ks-tag" style="font-family: var(--ks-mono); font-size: 0.74rem;">${trig.cooldownSeconds}s</span>
                      </td>
                      <td>
                        <span class="ks-tag ks-tag-gold" style="font-family: var(--ks-mono); font-size: 0.74rem;">${trig.counter}</span>
                      </td>
                      <td>
                        <form action="/api/redemptions/toggle" method="POST" style="margin: 0; display: inline-block;">
                          <input type="hidden" name="channelId" value="${channel.id}">
                          <input type="hidden" name="id" value="${trig.id}">
                          <label class="ks-switch" style="vertical-align: middle;">
                            <input type="checkbox" name="enabled" aria-label="Toggle ${escapeAttr(trig.rewardTitle)} reward trigger" ${trig.enabled ? 'checked' : ''} onchange="this.form.submit()">
                            <span class="ks-slider"></span>
                          </label>
                        </form>
                      </td>
                      <td style="text-align: right; white-space: nowrap;">
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px;">
                          <form action="/api/redemptions/test" method="POST" style="display: inline; margin: 0;">
                            <input type="hidden" name="channelId" value="${channel.id}">
                            <input type="hidden" name="id" value="${trig.id}">
                            <button type="submit" class="ks-button ks-button-secondary" style="min-height: 26px; padding: 0 8px; font-size: 0.76rem;" title="Test in Chat">
                              Test
                            </button>
                          </form>

                          <button 
                            type="button" 
                            class="ks-button ks-button-secondary edit-reward-btn" 
                            data-reward-id="${escapeAttr(trig.id)}"
                            data-reward-title="${escapeAttr(trig.rewardTitle)}"
                            data-reward-response="${escapeAttr(trig.responseMessage)}"
                            data-reward-cooldown="${trig.cooldownSeconds}"
                            style="min-height: 26px; padding: 0 8px; font-size: 0.76rem;"
                          >
                            Edit
                          </button>

                          <form action="/api/redemptions/delete" method="POST" style="display: inline; margin: 0;" onsubmit="return confirm('Delete trigger for &quot;${escapeAttr(trig.rewardTitle)}&quot;?');">
                            <input type="hidden" name="channelId" value="${channel.id}">
                            <input type="hidden" name="id" value="${trig.id}">
                            <button type="submit" class="ks-button ks-button-danger" style="min-height: 26px; padding: 0 8px; font-size: 0.76rem;">
                              Delete
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
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

        function dismissAllToasts() {
          var container = document.getElementById('ks-toast-container');
          if (!container) return;
          var toasts = container.querySelectorAll('.ks-toast');
          toasts.forEach(function(toast) {
            dismissToast(toast);
          });
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

        function switchTab(tabId) {
          if (!tabId) return;
          // Disappear any notifications immediately on tab change
          dismissAllToasts();

          // Set cookie so full page refreshes / POST redirects stay on this tab
          document.cookie = 'active_dashboard_tab=' + encodeURIComponent(tabId) + '; path=/; max-age=2592000; SameSite=Lax';
          try {
            localStorage.setItem('active_dashboard_tab', tabId);
          } catch (e) {}

          var buttons = document.querySelectorAll('[data-tab]');
          var contents = document.querySelectorAll('.ks-tab-content');
          
          buttons.forEach(function(btn) {
            var isTarget = btn.getAttribute('data-tab') === tabId;
            btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
            if (isTarget) {
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
              overview: 'Getting Started & Setup',
              commands: 'Custom Commands',
              builtins: 'Built-in Commands',
              timers: 'Chat Timers',
              raids: 'Raid Welcomes',
              shoutouts: 'Shoutouts',
              alerts: 'Stream Alerts',
              rewards: 'Channel Points',
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

          if (tabId === 'overview' && typeof fetchActivityFeed === 'function') {
            fetchActivityFeed();
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

          var copyModBtn = e.target.closest('.copy-mod-btn');
          if (copyModBtn) {
            e.preventDefault();
            var textToCopy = copyModBtn.getAttribute('data-copy');
            if (textToCopy) {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textToCopy).then(function() {
                  var origText = copyModBtn.textContent;
                  copyModBtn.textContent = 'Copied!';
                  copyModBtn.style.color = 'var(--ks-patina)';
                  setTimeout(function() {
                    copyModBtn.textContent = origText;
                    copyModBtn.style.color = '';
                  }, 2000);
                }).catch(function() {
                  window.prompt('Copy command:', textToCopy);
                });
              } else {
                window.prompt('Copy command:', textToCopy);
              }
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

          var varPill = e.target.closest('.ks-var-pill');
          if (varPill) {
            e.preventDefault();
            var targetInputId = varPill.getAttribute('data-target-input');
            var insertText = varPill.getAttribute('data-insert');
            var input = targetInputId ? document.getElementById(targetInputId) : null;
            if (input && insertText) {
              var start = input.selectionStart !== undefined ? input.selectionStart : input.value.length;
              var end = input.selectionEnd !== undefined ? input.selectionEnd : input.value.length;
              var before = input.value.substring(0, start);
              var after = input.value.substring(end);
              var prefixSpace = (before.length > 0 && !before.endsWith(' ')) ? ' ' : '';
              var suffixSpace = (after.length > 0 && !after.startsWith(' ')) ? ' ' : (after.length === 0 ? ' ' : '');
              var toInsert = prefixSpace + insertText + suffixSpace;
              input.value = before + toInsert + after;
              var newPos = start + toInsert.length;
              input.focus();
              if (input.setSelectionRange) {
                input.setSelectionRange(newPos, newPos);
              }
            }
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
            var aliasesInput = document.getElementById('cmd-aliases');
            var responseInput = document.getElementById('cmd-response');
            var userlevelSelect = document.getElementById('cmd-userlevel');
            var cooldownInput = document.getElementById('cmd-cooldown');

            if (idInput) idInput.value = '';
            if (triggerInput) triggerInput.value = '';
            if (aliasesInput) aliasesInput.value = '';
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
            var aliases = editBtn.getAttribute('data-cmd-aliases') || '';
            var response = editBtn.getAttribute('data-cmd-response');
            var userlevel = editBtn.getAttribute('data-cmd-userlevel') || 'everyone';
            var cooldown = editBtn.getAttribute('data-cmd-cooldown') || '5';

            var title = document.getElementById('commandFormTitle');
            var desc = document.getElementById('commandFormDesc');
            var submitLabel = document.getElementById('cmd-submit-label');

            if (title) title.textContent = 'Edit Command: ' + ${JSON.stringify(currentPrefix)} + trigger;
            if (desc) desc.textContent = 'Modify trigger, aliases, response, permissions, or cooldown.';
            if (submitLabel) submitLabel.textContent = 'Update Command';

            var idInput = document.getElementById('cmd-id');
            var triggerInput = document.getElementById('cmd-trigger');
            var aliasesInput = document.getElementById('cmd-aliases');
            var responseInput = document.getElementById('cmd-response');
            var userlevelSelect = document.getElementById('cmd-userlevel');
            var cooldownInput = document.getElementById('cmd-cooldown');

            if (idInput) idInput.value = id;
            if (triggerInput) triggerInput.value = trigger;
            if (aliasesInput) aliasesInput.value = aliases;
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
            var aliasesInput = document.getElementById('cmd-aliases');
            var responseInput = document.getElementById('cmd-response');
            if (idInput) idInput.value = '';
            if (triggerInput) triggerInput.value = '';
            if (aliasesInput) aliasesInput.value = '';
            if (responseInput) responseInput.value = '';
            return;
          }

          var openImportBtn = e.target.closest('#openImportCommandsBtn');
          if (openImportBtn) {
            e.preventDefault();
            var modal = document.getElementById('importCommandsModal');
            if (modal) {
              modal.style.display = 'flex';
              var fileInput = document.getElementById('importJsonFile');
              var textarea = document.getElementById('importJsonContent');
              if (fileInput) fileInput.value = '';
              if (textarea) textarea.value = '';
            }
            return;
          }

          var closeImportBtn = e.target.closest('#closeImportModalBtn') || e.target.closest('#cancelImportBtn');
          if (closeImportBtn) {
            e.preventDefault();
            var modal = document.getElementById('importCommandsModal');
            if (modal) modal.style.display = 'none';
            return;
          }

          if (e.target && e.target.id === 'importCommandsModal') {
            e.target.style.display = 'none';
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

          var addRewardBtn = e.target.closest('#openAddRewardBtn');
          if (addRewardBtn) {
            e.preventDefault();
            var card = document.getElementById('addRewardCard');
            var title = document.getElementById('rewardFormTitle');
            var desc = document.getElementById('rewardFormDesc');
            var submitLabel = document.getElementById('reward-submit-label');

            if (title) title.textContent = 'New Reward Trigger';
            if (desc) desc.textContent = 'Link a Twitch channel points reward to an automated bot chat response.';
            if (submitLabel) submitLabel.textContent = 'Save Trigger';

            var idInput = document.getElementById('reward-id');
            var titleInput = document.getElementById('reward-title');
            var respInput = document.getElementById('reward-response');
            var cdInput = document.getElementById('reward-cooldown');

            if (idInput) idInput.value = '';
            if (titleInput) titleInput.value = '';
            if (respInput) respInput.value = '';
            if (cdInput) cdInput.value = '5';

            if (card) {
              card.style.display = 'block';
              card.scrollIntoView({ behavior: 'smooth' });
            }
            if (titleInput) titleInput.focus();
            return;
          }

          var editRewardBtn = e.target.closest('.edit-reward-btn');
          if (editRewardBtn) {
            e.preventDefault();
            var card = document.getElementById('addRewardCard');
            var id = editRewardBtn.getAttribute('data-reward-id');
            var rTitle = editRewardBtn.getAttribute('data-reward-title');
            var rResp = editRewardBtn.getAttribute('data-reward-response');
            var rCd = editRewardBtn.getAttribute('data-reward-cooldown') || '5';

            var formTitle = document.getElementById('rewardFormTitle');
            var formDesc = document.getElementById('rewardFormDesc');
            var submitLabel = document.getElementById('reward-submit-label');

            if (formTitle) formTitle.textContent = 'Edit Trigger: ' + rTitle;
            if (formDesc) formDesc.textContent = 'Modify reward title, automated chat response, or cooldown.';
            if (submitLabel) submitLabel.textContent = 'Update Trigger';

            var idInput = document.getElementById('reward-id');
            var titleInput = document.getElementById('reward-title');
            var respInput = document.getElementById('reward-response');
            var cdInput = document.getElementById('reward-cooldown');

            if (idInput) idInput.value = id;
            if (titleInput) titleInput.value = rTitle;
            if (respInput) respInput.value = rResp;
            if (cdInput) cdInput.value = rCd;

            if (card) {
              card.style.display = 'block';
              card.scrollIntoView({ behavior: 'smooth' });
            }
            if (respInput) respInput.focus();
            return;
          }

          var cancelRewardBtn = e.target.closest('#cancelAddRewardBtn');
          if (cancelRewardBtn) {
            e.preventDefault();
            var card = document.getElementById('addRewardCard');
            if (card) card.style.display = 'none';
            var idInput = document.getElementById('reward-id');
            var titleInput = document.getElementById('reward-title');
            var respInput = document.getElementById('reward-response');
            if (idInput) idInput.value = '';
            if (titleInput) titleInput.value = '';
            if (respInput) respInput.value = '';
            return;
          }
        });

        // --- Floating Toast Notifications ---
        function showToast(message, type) {
          type = type || 'success';
          var container = document.getElementById('ks-toast-container');
          if (!container) {
            container = document.createElement('div');
            container.id = 'ks-toast-container';
            container.className = 'ks-toast-container';
            container.setAttribute('aria-live', 'polite');
            container.setAttribute('aria-atomic', 'true');
            document.body.appendChild(container);
          }
          var toast = document.createElement('div');
          toast.className = 'ks-toast ' + (type === 'error' ? 'ks-toast-error' : 'ks-toast-success');
          toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
          var iconSvg = type === 'error'
            ? '<svg class="ks-toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
            : '<svg class="ks-toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
          
          toast.innerHTML = '<div class="ks-toast-body">' +
            iconSvg +
            '<div class="ks-toast-text">' + (message || '') + '</div>' +
            '</div>' +
            '<button type="button" class="ks-toast-close" aria-label="Dismiss notification">' +
            '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 2l10 10M12 2L2 12"/></svg>' +
            '</button>';

          container.appendChild(toast);
          setupToast(toast, type === 'error' ? 6000 : 4500);
        }

        // Auto-dismiss any server-rendered initial toasts on page load
        document.querySelectorAll('.ks-toast').forEach(function(toast) {
          var isError = toast.classList.contains('ks-toast-error');
          setupToast(toast, isError ? 6000 : 4500);
        });

        // --- Non-Blocking Asynchronous Test Dispatches ---
        // Intercept test triggers (/api/alerts/test, /api/send-test, /api/redemptions/test, /api/shoutout/test)
        // so streamers do not experience abrupt full-page reloads during live broadcasts
        var testUrls = ['/api/alerts/test', '/api/send-test', '/api/redemptions/test', '/api/shoutout/test'];

        document.addEventListener('submit', function(e) {
          var form = e.target;
          var submitter = e.submitter;
          var targetAction = (submitter && submitter.getAttribute('formaction')) || form.getAttribute('action') || '';
          
          var isTest = testUrls.some(function(u) { return targetAction.indexOf(u) !== -1; });
          if (!isTest) return;

          e.preventDefault();

          var formData = new FormData(form);
          if (submitter && submitter.name && submitter.value) {
            formData.set(submitter.name, submitter.value);
          }
          var searchParams = new URLSearchParams();
          formData.forEach(function(val, key) {
            searchParams.append(key, val);
          });

          var origBtnText = submitter ? submitter.innerHTML : '';
          if (submitter) {
            submitter.disabled = true;
            submitter.style.opacity = '0.7';
          }

          fetch(targetAction, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: searchParams.toString()
          })
          .then(function(res) {
            return res.json().then(function(data) {
              return { status: res.status, ok: res.ok, data: data };
            }).catch(function() {
              return { status: res.status, ok: res.ok, data: null };
            });
          })
          .then(function(result) {
            if (result.ok && result.data && result.data.message) {
              showToast(result.data.message, 'success');
            } else if (result.data && result.data.error) {
              showToast(result.data.error, 'error');
            } else if (result.ok) {
              showToast('Test action dispatched successfully!', 'success');
            } else {
              showToast('Failed to dispatch test action.', 'error');
            }
          })
          .catch(function(err) {
            showToast('Network error dispatching test: ' + (err.message || 'Unknown error'), 'error');
          })
          .finally(function() {
            if (submitter) {
              submitter.disabled = false;
              submitter.style.opacity = '';
              submitter.innerHTML = origBtnText;
            }
          });
        });

        // --- Custom Commands JSON File Import Reader ---
        var importFileInput = document.getElementById('importJsonFile');
        if (importFileInput) {
          importFileInput.addEventListener('change', function(e) {
            var file = e.target.files && e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function(evt) {
              var content = evt.target.result;
              var textarea = document.getElementById('importJsonContent');
              if (textarea) textarea.value = content;
            };
            reader.readAsText(file);
          });
        }

        // --- Live Activity Stream Polling & Rendering ---
        function safeHtml(str) {
          if (!str) return '';
          return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function formatTimeAgo(ts) {
          if (!ts || ts === 0) return 'Just now';
          var diff = Date.now() - ts;
          if (diff < 0) return 'Just now';
          var secs = Math.floor(diff / 1000);
          if (secs < 30) return 'Just now';
          if (secs < 60) return secs + 's ago';
          var mins = Math.floor(secs / 60);
          if (mins < 60) return mins + 'm ago';
          var hrs = Math.floor(mins / 60);
          if (hrs < 24) return hrs + 'h ago';
          return Math.floor(hrs / 24) + 'd ago';
        }

        function renderActivities(activities) {
          var container = document.getElementById('liveActivityList');
          if (!container) return;

          if (!activities || activities.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 32px 14px; color: var(--ks-text-muted); font-size: 0.85rem; border: 1px dashed var(--ks-rule); border-radius: var(--ks-radius-xs); background: var(--ks-lacquer-deep);">' +
              '<div style="color: var(--ks-champagne); margin-bottom: 6px;">' +
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
              '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>' +
              '</svg>' +
              '</div>' +
              '<div style="font-weight: 500; color: var(--ks-text-primary);">No bot activities recorded in this session yet.</div>' +
              '<div style="font-size: 0.76rem; color: var(--ks-text-faint); margin-top: 4px;">Commands, automod actions, stream alerts, and timers will stream here in real time.</div>' +
              '</div>';
            return;
          }

          var typeClassMap = {
            command: 'ks-tag-gold',
            moderation: 'ks-tag-vermilion',
            alert: 'ks-tag-patina',
            timer: '',
            shoutout: 'ks-tag-gold',
            redemption: 'ks-tag-patina'
          };

          var html = activities.map(function(act) {
            var badgeClass = typeClassMap[act.type] || '';
            var typeLabel = safeHtml(act.type || 'bot');
            var title = safeHtml(act.title || 'Activity');
            var detail = safeHtml(act.detail || '');
            var timeStr = formatTimeAgo(act.timestamp);

            return '<div class="ks-activity-item" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: var(--ks-radius-xs); background: var(--ks-raised-lacquer); border: 1px solid var(--ks-rule);">' +
              '<div style="display: flex; align-items: center; gap: 10px; min-width: 0;">' +
              '<span class="ks-tag ' + badgeClass + '" style="font-size: 0.7rem; padding: 1px 6px; text-transform: uppercase; letter-spacing: 0.03em; white-space: nowrap;">' + typeLabel + '</span>' +
              '<div style="min-width: 0;">' +
              '<div style="font-size: 0.85rem; font-weight: 600; color: var(--ks-champagne); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + title + '</div>' +
              (detail ? '<div style="font-size: 0.78rem; color: var(--ks-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + detail + '</div>' : '') +
              '</div>' +
              '</div>' +
              '<div style="font-size: 0.74rem; color: var(--ks-text-faint); white-space: nowrap; font-family: var(--ks-mono);">' + timeStr + '</div>' +
              '</div>';
          }).join('');

          container.innerHTML = html;
        }

        var isFetchingActivity = false;
        function fetchActivityFeed() {
          if (isFetchingActivity) return;
          var container = document.getElementById('liveActivityList');
          if (!container) return;
          var statusEl = document.getElementById('activityFeedStatus');

          isFetchingActivity = true;
          fetch('/api/activity?channelId=' + encodeURIComponent(${JSON.stringify(channel.id)}) + '&limit=25', {
            headers: { 'Accept': 'application/json' }
          })
          .then(function(res) { return res.json(); })
          .then(function(data) {
            if (data && data.ok && Array.isArray(data.activities)) {
              renderActivities(data.activities);
              if (statusEl) {
                var now = new Date();
                var timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                statusEl.textContent = 'Updated ' + timeStr;
              }
            }
          })
          .catch(function(err) {
            if (statusEl) statusEl.textContent = 'Auto-refresh paused';
          })
          .finally(function() {
            isFetchingActivity = false;
          });
        }

        var refreshBtn = document.getElementById('refreshActivityBtn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', function(e) {
            e.preventDefault();
            fetchActivityFeed();
          });
        }

        // Poll every 6s when overview tab is visible and page is active
        setInterval(function() {
          var overviewTab = document.getElementById('tab-overview');
          if (overviewTab && overviewTab.classList.contains('active') && !document.hidden) {
            fetchActivityFeed();
          }
        }, 6000);

        // Initial fetch on page load if overview tab is active
        var initOverviewTab = document.getElementById('tab-overview');
        if (initOverviewTab && initOverviewTab.classList.contains('active')) {
          fetchActivityFeed();
        }

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
