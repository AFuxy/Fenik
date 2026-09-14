import { config, isAdmin } from '../config.js';
import { getActiveChannels, getAccessibleChannels } from '../db/index.js';
import { impeccableCss } from './styles.js';

export const DEFAULT_AVATAR_URL = '/default-avatar.svg';

export function renderLayout({
  title,
  content,
  user = null,
  activeChannel = null,
  extraCss = '',
}) {
  const activeChannels = getActiveChannels();
  const userIsAdmin = isAdmin(user);

  let accessibleChannels = [];
  let ownChannel = null;
  let managedChannels = [];
  let currentChannel = null;
  let isCurrentOwner = true;

  if (user) {
    accessibleChannels = getAccessibleChannels(user);
    ownChannel = accessibleChannels.find((c) => c.role === 'owner') || {
      id: user.userId,
      login: user.login,
      displayName: user.displayName,
      avatar: user.avatar,
      role: 'owner',
    };
    managedChannels = accessibleChannels.filter((c) => c.role === 'manager');
    currentChannel = activeChannel || ownChannel;
    isCurrentOwner = currentChannel && user && String(currentChannel.id) === String(user.userId);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, viewport-fit=cover">
  <title>${title ? `${title} | ` : ''}${config.platformName || 'Fenik'}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="alternate icon" href="/favicon.ico">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>
    ${impeccableCss}
    ${extraCss}
  </style>
</head>
<body>

  <!-- Navigation -->
  <header class="ks-nav">
    <div class="ks-nav-inner">
      <a href="/" class="ks-brand" aria-label="${config.platformName || 'Fenik'} home">
        <span class="ks-mark" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-3 3v-3H3a1 1 0 0 1-1-1V3z"/>
          </svg>
        </span>
        <span class="ks-wordmark">${config.platformName || 'Fenik'}</span>
      </a>

      <div class="ks-nav-links">
        <div class="ks-live-pill">
          <span class="ks-dot-live"></span>
          <span>${activeChannels.length} active channel${activeChannels.length === 1 ? '' : 's'}</span>
        </div>

        ${user ? `
          <!-- Channel Switcher Dropdown in Navbar -->
          <div class="ks-dropdown" id="channelDropdown">
            <button 
              type="button" 
              class="ks-dropdown-trigger" 
              id="channelDropdownBtn" 
              aria-haspopup="true" 
              aria-expanded="false"
              aria-label="Switch channel"
            >
              <img 
                src="${currentChannel?.avatar || DEFAULT_AVATAR_URL}" 
                class="ks-dropdown-trigger-avatar" 
                alt=""
                onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'"
              />
              <span class="ks-dropdown-trigger-name">#${currentChannel?.login || user.login}</span>
              <span class="ks-tag ${isCurrentOwner ? 'ks-tag-gold' : ''}" style="font-size: 0.68rem; padding: 1px 6px;">
                ${isCurrentOwner ? 'Owner' : 'Managed'}
              </span>
              <svg class="ks-dropdown-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
                <path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <div class="ks-dropdown-menu" id="channelDropdownMenu" role="menu" aria-labelledby="channelDropdownBtn">
              <!-- User's Own Channel -->
              ${ownChannel ? `
                <div class="ks-dropdown-section-title">Your Channel</div>
                <a href="/api/channel/switch/${encodeURIComponent(ownChannel.login)}" class="ks-dropdown-item ${currentChannel?.id === ownChannel.id ? 'active' : ''}" role="menuitem">
                  <img src="${ownChannel.avatar || DEFAULT_AVATAR_URL}" class="ks-dropdown-item-avatar" alt="" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'">
                  <div class="ks-dropdown-item-meta">
                    <span class="ks-dropdown-item-name">${ownChannel.displayName}</span>
                    <span class="ks-dropdown-item-login">twitch.tv/${ownChannel.login}</span>
                  </div>
                  <span class="ks-tag ks-tag-gold" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">Owner</span>
                </a>
              ` : ''}

              <!-- Managed Divider -->
              <div class="ks-dropdown-divider">
                <span>Managed</span>
              </div>

              <!-- Managed Channels -->
              ${managedChannels.length > 0 ? managedChannels.map((m) => `
                <a href="/api/channel/switch/${encodeURIComponent(m.login)}" class="ks-dropdown-item ${currentChannel?.id === m.id ? 'active' : ''}" role="menuitem">
                  <img src="${m.avatar || DEFAULT_AVATAR_URL}" class="ks-dropdown-item-avatar" alt="" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR_URL}'">
                  <div class="ks-dropdown-item-meta">
                    <span class="ks-dropdown-item-name">${m.displayName}</span>
                    <span class="ks-dropdown-item-login">twitch.tv/${m.login}</span>
                  </div>
                  <span class="ks-tag" style="font-size: 0.68rem; padding: 1px 6px; margin-left: auto;">Manager</span>
                </a>
              `).join('') : `
                <div class="ks-dropdown-empty">
                  <span>No other managed channels</span>
                </div>
              `}
            </div>
          </div>

          ${userIsAdmin ? `
            <a href="/admin" class="ks-button ks-button-ghost">Host Control</a>
          ` : ''}
          <a href="/auth/logout" class="ks-button ks-button-ghost">Sign Out</a>
        ` : `
          <a href="/auth/login" class="ks-button ks-button-primary">
            <span>Add to Twitch</span>
            <span class="ks-button-arrow" aria-hidden="true">
              <svg viewBox="0 0 14 8" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M0 4h12M8 0l4 4-4 4"/>
              </svg>
            </span>
          </a>
        `}
      </div>
    </div>
  </header>

  <!-- Page Main Content -->
  ${content}

  <!-- Footer -->
  <footer class="ks-footer">
    <div class="ks-footer-inner">
      <div style="display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;">
        <span class="ks-wordmark" style="font-size: 1.05rem; color: var(--ks-champagne);">${config.platformName || 'Fenik'}</span>
        <span style="font-size: 0.8rem; color: var(--ks-text-muted); font-family: var(--ks-mono);">&copy; ${new Date().getFullYear()}</span>
        <a href="https://${config.productionDomain}" target="_blank" rel="noreferrer" class="ks-footer-link" style="color: var(--ks-kinpaku); font-size: 0.82rem; font-family: var(--ks-mono);">${config.productionDomain}</a>
      </div>
      <div style="display: flex; align-items: center; gap: 6px; color: var(--ks-text-muted); font-size: 0.84rem;">
        <span>Bot Worker:</span>
        <span style="color: var(--ks-patina); font-family: var(--ks-mono);">@${config.botName || 'FenikBot'}</span>
        <span>•</span>
        <span>Crafted with</span>
        <span style="color: #f43f5e;">❤</span>
        <span>by</span>
        <a href="https://github.com/AFuxy" target="_blank" rel="noreferrer" class="ks-footer-link">AFuxy</a>
      </div>
    </div>
  </footer>

  <script>
    (function() {
      var dropdown = document.getElementById('channelDropdown');
      var trigger = document.getElementById('channelDropdownBtn');
      if (dropdown && trigger) {
        trigger.addEventListener('click', function(e) {
          e.stopPropagation();
          var isOpen = dropdown.classList.contains('open');
          if (isOpen) {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
          } else {
            dropdown.classList.add('open');
            trigger.setAttribute('aria-expanded', 'true');
          }
        });

        document.addEventListener('click', function(e) {
          if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
          }
        });

        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape' && dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
            trigger.setAttribute('aria-expanded', 'false');
            trigger.focus();
          }
        });
      }
    })();
  </script>

</body>
</html>`;
}
