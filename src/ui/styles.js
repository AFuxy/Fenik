export const impeccableCss = `
  @import url('https://fonts.googleapis.com/css2?family=Albert+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Alumni+Sans:ital,wght@0,200;0,300;0,400;0,500;0,600;0,700;1,300&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    color-scheme: dark;

    /* Brand Anchors: Neo Kinpaku */
    --ks-kinpaku: oklch(84% 0.19 80.46);
    --ks-kinpaku-pale: oklch(86% 0.07 84);
    --ks-kinpaku-rich: oklch(77% 0.13 82);
    --ks-kinpaku-deep: oklch(61% 0.085 78);
    --ks-on-gold: oklch(14% 0.018 95);

    /* Verdigris Patina */
    --ks-patina: oklch(70% 0.12 188);
    --ks-patina-pale: oklch(82% 0.07 188);
    --ks-patina-deep: oklch(49% 0.08 188);

    /* Urushi Lacquer Surfaces */
    --ks-lacquer-black: oklch(7% 0.006 95);
    --ks-lacquer-deep: oklch(4% 0.004 95);
    --ks-raised-lacquer: oklch(11% 0.006 95);
    --ks-graphite: oklch(15% 0.008 95);
    --ks-graphite-2: oklch(19% 0.008 95);

    /* Text */
    --ks-champagne: oklch(91% 0 0);
    --ks-text-warm: oklch(88% 0 0);
    --ks-text-muted: oklch(72% 0 0);
    --ks-text-faint: oklch(52% 0 0);

    /* Rules & Borders */
    --ks-rule: oklch(100% 0 0 / 0.08);
    --ks-edge: oklch(100% 0 0 / 0.16);
    --ks-gold-hairline: oklch(78% 0.12 82 / 0.22);
    --ks-gold-hairline-strong: oklch(74% 0.09 82 / 0.6);

    /* State */
    --ks-vermilion: oklch(58% 0.15 35);
    --ks-vermilion-soft: oklch(58% 0.15 35 / 0.15);
    --ks-success: oklch(45% 0.18 145);
    --ks-success-soft: oklch(45% 0.18 145 / 0.16);

    /* Typography */
    --ks-font: "Albert Sans", -apple-system, BlinkMacSystemFont, sans-serif;
    --ks-font-display: "Alumni Sans", "Albert Sans", sans-serif;
    --ks-font-wordmark: "Alumni Sans", sans-serif;
    --ks-mono: "JetBrains Mono", ui-monospace, monospace;

    /* Radii */
    --ks-radius-xs: 2px;
    --ks-radius-sm: 4px;
    --ks-radius-md: 6px;
    --ks-radius-lg: 8px;
    --ks-radius-pill: 999px;

    /* Controls */
    --ks-control-sm: 28px;
    --ks-control-md: 36px;
    --ks-control-lg: 44px;

    --ks-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
    --ks-quick: 0.12s;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    overflow-x: hidden;
    max-width: 100vw;
    width: 100%;
  }

  body {
    background-color: var(--ks-lacquer-black);
    color: var(--ks-text-warm);
    font-family: var(--ks-font);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    -webkit-tap-highlight-color: transparent;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  a { color: inherit; text-decoration: none; }

  ::selection {
    background: var(--ks-kinpaku);
    color: var(--ks-on-gold);
  }

  :focus-visible {
    outline: 2px solid var(--ks-kinpaku);
    outline-offset: 2px;
  }

  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  ::-webkit-scrollbar-track {
    background: var(--ks-lacquer-deep);
  }
  ::-webkit-scrollbar-thumb {
    background: var(--ks-graphite);
    border-radius: var(--ks-radius-xs);
  }
  ::-webkit-scrollbar-thumb:hover {
    background: var(--ks-graphite-2);
  }

  /* Brand Lockup */
  .ks-brand {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }
  .ks-mark {
    width: 32px;
    height: 32px;
    background: var(--ks-kinpaku);
    color: var(--ks-on-gold);
    border-radius: var(--ks-radius-xs);
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 15px;
    flex-shrink: 0;
  }
  .ks-wordmark {
    color: var(--ks-champagne);
    font-family: var(--ks-font-wordmark);
    font-size: 1.35rem;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    line-height: 1;
  }

  /* Navigation Bar */
  .ks-nav {
    border-bottom: 1px solid var(--ks-rule);
    background: oklch(7% 0.006 95 / 0.88);
    backdrop-filter: blur(16px);
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .ks-nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 14px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .ks-nav-links {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .ks-live-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--ks-mono);
    font-size: 0.75rem;
    color: var(--ks-text-muted);
    background: var(--ks-raised-lacquer);
    border: 1px solid var(--ks-rule);
    padding: 4px 11px;
    border-radius: var(--ks-radius-pill);
    letter-spacing: 0.02em;
  }
  .ks-dot-live {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ks-patina);
    box-shadow: 0 0 6px var(--ks-patina);
  }

  /* Navbar Channel Dropdown */
  .ks-dropdown {
    position: relative;
    display: inline-block;
  }
  .ks-dropdown-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--ks-lacquer-deep);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-xs);
    padding: 4px 10px 4px 6px;
    color: var(--ks-champagne);
    font-family: var(--ks-font);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
    line-height: 1;
    min-height: 34px;
  }
  .ks-dropdown-trigger:hover,
  .ks-dropdown.open .ks-dropdown-trigger {
    background: var(--ks-surface);
    border-color: var(--ks-gold-hairline);
  }
  .ks-dropdown-trigger-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--ks-rule);
  }
  .ks-dropdown-trigger-name {
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .ks-dropdown-chevron {
    color: var(--ks-text-muted);
    transition: transform 0.2s ease;
  }
  .ks-dropdown.open .ks-dropdown-chevron {
    transform: rotate(180deg);
  }
  .ks-dropdown-menu {
    display: none;
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 270px;
    background: var(--ks-lacquer-black);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-xs);
    box-shadow: 0 16px 36px -8px oklch(0% 0 0 / 0.7);
    padding: 8px;
    z-index: 100;
  }
  .ks-dropdown.open .ks-dropdown-menu {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .ks-dropdown-section-title {
    font-family: var(--ks-mono);
    font-size: 0.68rem;
    color: var(--ks-text-faint);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 6px 10px 3px;
  }
  .ks-dropdown-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 10px;
    border-radius: var(--ks-radius-xs);
    text-decoration: none;
    color: var(--ks-champagne);
    font-size: 0.86rem;
    transition: background 0.12s ease;
  }
  .ks-dropdown-item:hover {
    background: var(--ks-raised-lacquer);
  }
  .ks-dropdown-item.active {
    background: var(--ks-surface);
    border: 1px solid var(--ks-gold-hairline);
  }
  .ks-dropdown-item-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
    border: 1px solid var(--ks-rule);
    flex-shrink: 0;
  }
  .ks-dropdown-item-meta {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    line-height: 1.25;
  }
  .ks-dropdown-item-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ks-dropdown-item-login {
    font-size: 0.72rem;
    color: var(--ks-text-muted);
  }
  .ks-dropdown-divider {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 4px;
    font-family: var(--ks-mono);
    font-size: 0.68rem;
    color: var(--ks-text-faint);
    text-transform: uppercase;
    letter-spacing: 0.09em;
  }
  .ks-dropdown-divider::before,
  .ks-dropdown-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--ks-rule);
  }
  .ks-dropdown-empty {
    padding: 10px;
    font-size: 0.78rem;
    color: var(--ks-text-muted);
    text-align: center;
    font-style: italic;
  }

  /* Impeccable Buttons */
  .ks-button {
    min-height: var(--ks-control-md);
    border-radius: var(--ks-radius-xs);
    font-family: var(--ks-font);
    font-size: 0.92rem;
    font-weight: 500;
    letter-spacing: -0.005em;
    cursor: pointer;
    transition: background-color var(--ks-quick) var(--ks-ease), border-color var(--ks-quick) var(--ks-ease), color var(--ks-quick) var(--ks-ease);
    border: 1px solid transparent;
    justify-content: center;
    align-items: center;
    gap: 10px;
    padding: 0 20px;
    line-height: 1;
    text-decoration: none;
    display: inline-flex;
    position: relative;
    white-space: nowrap;
  }
  .ks-button-arrow {
    flex: none;
    width: 14px;
    height: 8px;
    display: inline-block;
  }
  .ks-button-arrow svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  .ks-button-arrow path {
    transition: transform 0.2s var(--ks-ease);
  }
  .ks-button:hover .ks-button-arrow path {
    transform: translateX(2px);
  }

  .ks-button-primary {
    background: var(--ks-kinpaku);
    color: var(--ks-on-gold);
    border-color: var(--ks-kinpaku);
    font-weight: 600;
  }
  .ks-button-primary:hover {
    background: var(--ks-kinpaku-pale);
    border-color: var(--ks-kinpaku-pale);
  }
  .ks-button-primary:active {
    background: var(--ks-kinpaku-rich);
  }

  .ks-button-secondary {
    background: var(--ks-raised-lacquer);
    color: var(--ks-champagne);
    border-color: var(--ks-rule);
  }
  .ks-button-secondary:hover {
    background: var(--ks-graphite);
    border-color: var(--ks-edge);
    color: #fff;
  }

  .ks-button-ghost {
    background: transparent;
    color: var(--ks-text-muted);
    border-color: transparent;
  }
  .ks-button-ghost:hover {
    color: var(--ks-champagne);
    background: var(--ks-raised-lacquer);
  }

  .ks-button-danger {
    background: var(--ks-vermilion-soft);
    color: var(--ks-vermilion);
    border-color: oklch(58% 0.15 35 / 0.35);
  }
  .ks-button-danger:hover {
    background: var(--ks-vermilion);
    color: #fff;
  }

  .ks-button-lg {
    min-height: var(--ks-control-lg);
    font-size: 1.05rem;
    padding: 0 28px;
  }

  /* Bento Layout Primitive */
  .ks-bento {
    background: var(--ks-rule);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-sm);
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: 1px;
    display: grid;
    margin: 40px 0;
    overflow: hidden;
  }
  .ks-bento-tile {
    background: var(--ks-lacquer-black);
    flex-direction: column;
    gap: 12px;
    padding: 36px 32px;
    display: flex;
    position: relative;
  }
  .ks-bento-tile:hover {
    background: var(--ks-raised-lacquer);
  }
  .ks-bento-tile--span-4 { grid-column: span 4; }
  .ks-bento-tile--span-6 { grid-column: span 6; }
  .ks-bento-tile--span-12 { grid-column: span 12; }

  @media (max-width: 860px) {
    .ks-bento-tile--span-4,
    .ks-bento-tile--span-6 {
      grid-column: 1 / -1;
    }
  }

  .ks-tile-num {
    font-family: var(--ks-mono);
    font-size: 0.72rem;
    color: var(--ks-patina);
    letter-spacing: 0.15em;
    text-transform: uppercase;
  }
  .ks-tile-h {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--ks-champagne);
    letter-spacing: -0.01em;
  }
  .ks-tile-p {
    font-size: 0.94rem;
    color: var(--ks-text-muted);
    line-height: 1.55;
  }

  /* Containers & Scaffolding */
  .ks-container {
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    padding: 40px 28px;
    flex: 1;
  }

  /* Cards */
  .ks-card {
    background: var(--ks-raised-lacquer);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-sm);
    padding: 28px;
    margin-bottom: 24px;
  }
  .ks-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .ks-card-title {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--ks-champagne);
    letter-spacing: -0.01em;
  }
  .ks-card-desc {
    font-size: 0.9rem;
    color: var(--ks-text-muted);
    margin-top: 2px;
  }

  /* Form Controls */
  .ks-input-text, .ks-select {
    width: 100%;
    min-height: var(--ks-control-md);
    background: var(--ks-lacquer-deep);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-xs);
    color: var(--ks-champagne);
    padding: 8px 14px;
    font-family: var(--ks-font);
    font-size: 0.92rem;
    outline: none;
    transition: border-color var(--ks-quick) var(--ks-ease);
  }
  .ks-input-text:focus, .ks-select:focus {
    border-color: var(--ks-kinpaku);
  }
  .ks-form-group {
    margin-bottom: 18px;
  }
  .ks-label {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ks-text-muted);
    margin-bottom: 6px;
    letter-spacing: 0.02em;
  }

  /* Tactile Urushi Switch */
  .ks-toggle {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }
  .ks-toggle input { opacity: 0; width: 0; height: 0; }
  .ks-toggle-track {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: var(--ks-graphite);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-pill);
    transition: background-color var(--ks-quick) var(--ks-ease), border-color var(--ks-quick) var(--ks-ease);
  }
  .ks-toggle-knob {
    position: absolute;
    height: 16px;
    width: 16px;
    left: 3px;
    bottom: 3px;
    background: var(--ks-champagne);
    border-radius: 50%;
    transition: transform 0.2s var(--ks-ease), background-color 0.2s var(--ks-ease);
  }
  .ks-toggle input:checked + .ks-toggle-track {
    background: oklch(70% 0.12 188 / 0.22);
    border-color: var(--ks-patina);
  }
  .ks-toggle input:checked + .ks-toggle-track .ks-toggle-knob {
    transform: translateX(20px);
    background: var(--ks-patina);
    box-shadow: 0 0 6px var(--ks-patina);
  }

  /* Tables */
  .ks-table-wrap {
    overflow-x: auto;
  }
  table.ks-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    text-align: left;
  }
  table.ks-table th {
    padding: 10px 14px;
    font-family: var(--ks-mono);
    font-size: 0.72rem;
    color: var(--ks-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border-bottom: 1px solid var(--ks-rule);
    font-weight: 500;
  }
  table.ks-table td {
    padding: 14px;
    border-bottom: 1px solid var(--ks-rule);
    color: var(--ks-text-warm);
  }
  table.ks-table tr:last-child td {
    border-bottom: none;
  }
  table.ks-table tr:hover td {
    background: rgba(255, 255, 255, 0.015);
  }

  /* Tags & Badges */
  .ks-tag {
    display: inline-flex;
    align-items: center;
    font-family: var(--ks-mono);
    font-size: 0.76rem;
    font-weight: 500;
    padding: 2px 7px;
    border-radius: var(--ks-radius-xs);
    background: var(--ks-graphite);
    border: 1px solid var(--ks-rule);
    color: var(--ks-text-warm);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .ks-tag-gold {
    background: oklch(84% 0.19 80.46 / 0.12);
    border-color: var(--ks-gold-hairline);
    color: var(--ks-kinpaku);
  }
  .ks-tag-patina {
    background: oklch(70% 0.12 188 / 0.14);
    border-color: var(--ks-patina);
    color: var(--ks-patina);
  }

  /* Channel Profile Banner */
  .ks-channel-header {
    background: var(--ks-raised-lacquer);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-sm);
    padding: 24px 28px;
    margin-bottom: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
  }
  .ks-channel-profile {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .ks-channel-avatar {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 1px solid var(--ks-gold-hairline);
    background: var(--ks-lacquer-deep);
  }
  .ks-channel-name {
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--ks-champagne);
    letter-spacing: -0.01em;
  }
  .ks-channel-sub {
    color: var(--ks-text-muted);
    font-family: var(--ks-mono);
    font-size: 0.8rem;
    letter-spacing: 0.02em;
  }

  /* Tabs & Navigation System */
  .ks-dashboard-shell {
    display: grid;
    grid-template-columns: 260px 1fr;
    gap: 28px;
    align-items: start;
  }

  /* Left Navigation Sidebar */
  .ks-sidebar {
    background: var(--ks-raised-lacquer);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-sm);
    padding: 14px 10px;
    position: sticky;
    top: 84px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  }

  .ks-sidebar-mobile-bar {
    display: none;
  }

  @media (max-width: 880px) {
    .ks-dashboard-shell {
      grid-template-columns: 1fr;
      gap: 16px;
      width: 100%;
      min-width: 0;
    }

    .ks-sidebar {
      position: static;
      top: auto;
      box-shadow: none;
      width: 100%;
      padding: 6px 14px;
      z-index: 10;
    }

    .ks-sidebar-mobile-bar {
      display: block;
    }

    .ks-sidebar-mobile-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: transparent;
      border: none;
      padding: 10px 2px;
      min-height: 44px;
      color: var(--ks-text-primary);
      cursor: pointer;
      font-family: inherit;
    }

    .ks-sidebar-mobile-badge {
      font-size: 0.74rem;
      padding: 2px 8px;
      background: var(--ks-lacquer-deep);
      border: 1px solid var(--ks-gold-hairline);
      border-radius: var(--ks-radius-pill);
      color: var(--ks-champagne);
      font-weight: 600;
    }

    .ks-sidebar-mobile-arrow {
      transition: transform var(--ks-quick) var(--ks-ease);
      color: var(--ks-text-muted);
    }

    .ks-sidebar.mobile-open .ks-sidebar-mobile-arrow {
      transform: rotate(180deg);
    }

    .ks-sidebar-inner {
      display: none;
      padding-top: 10px;
      border-top: 1px solid var(--ks-rule);
      margin-top: 4px;
    }

    .ks-sidebar.mobile-open .ks-sidebar-inner {
      display: flex;
    }
  }

  .ks-sidebar-inner {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* Collapsible Group */
  .ks-sidebar-group {
    display: flex;
    flex-direction: column;
  }

  .ks-sidebar-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: var(--ks-radius-xs);
    cursor: pointer;
    font-family: var(--ks-font);
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--ks-text-faint);
    transition: color var(--ks-quick) var(--ks-ease), background var(--ks-quick) var(--ks-ease);
  }

  .ks-sidebar-group-header:hover {
    color: var(--ks-champagne);
    background: rgba(255, 255, 255, 0.03);
  }

  .ks-sidebar-group-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .ks-sidebar-group-title svg {
    color: var(--ks-text-muted);
    flex-shrink: 0;
  }

  .ks-sidebar-chevron {
    color: var(--ks-text-faint);
    flex-shrink: 0;
  }

  .ks-sidebar.is-ready .ks-sidebar-chevron {
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .ks-sidebar-group.is-collapsed .ks-sidebar-chevron {
    transform: rotate(-90deg);
  }

  .ks-sidebar-items {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 4px;
    max-height: 500px;
    opacity: 1;
    overflow: hidden;
  }

  /* Only animate accordion transitions after initial page paint */
  .ks-sidebar.is-ready .ks-sidebar-items {
    transition: max-height 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, margin 0.2s ease;
  }

  .ks-sidebar-group.is-collapsed .ks-sidebar-items {
    max-height: 0;
    opacity: 0;
    margin-top: 0;
    pointer-events: none;
  }

  /* Navigation Item */
  .ks-sidebar-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--ks-radius-xs);
    color: var(--ks-text-secondary);
    font-family: var(--ks-font);
    font-size: 0.88rem;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: all var(--ks-quick) var(--ks-ease);
  }

  .ks-sidebar-item svg {
    color: var(--ks-text-muted);
    flex-shrink: 0;
    transition: color var(--ks-quick) var(--ks-ease);
  }

  .ks-sidebar-item:hover {
    color: var(--ks-text-primary);
    background: rgba(255, 255, 255, 0.035);
  }

  .ks-sidebar-item:hover svg {
    color: var(--ks-champagne);
  }

  .ks-sidebar-item.active {
    color: var(--ks-champagne);
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.24);
    font-weight: 600;
  }

  .ks-sidebar-item.active svg {
    color: var(--ks-kinpaku);
  }

  .ks-sidebar-item-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Main Content Area */
  .ks-dashboard-main {
    flex: 1;
    min-width: 0;
  }

  .ks-tab-content { display: none; }
  .ks-tab-content.active { display: block; }

  /* Alerts */
  .ks-alert {
    padding: 12px 18px;
    border-radius: var(--ks-radius-xs);
    font-size: 0.9rem;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ks-alert-success {
    background: var(--ks-success-soft);
    border: 1px solid oklch(45% 0.18 145 / 0.3);
    color: oklch(80% 0.14 145);
  }
  .ks-alert-danger {
    background: var(--ks-vermilion-soft);
    border: 1px solid oklch(58% 0.15 35 / 0.3);
    color: oklch(78% 0.14 35);
  }

  /* Footer */
  .ks-footer {
    border-top: 1px solid var(--ks-rule);
    padding: 32px 28px;
    margin-top: auto;
    font-size: 0.85rem;
    color: var(--ks-text-muted);
  }
  .ks-footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .ks-footer-link {
    color: var(--ks-champagne);
    text-decoration: underline;
    font-weight: 600;
    transition: color 0.15s ease;
  }
  .ks-footer-link:hover {
    color: #ffffff;
  }

  /* Toggle Row Helper */
  .ks-toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  /* ==========================================================================
     Responsive System: Mobile & Tablet Adaptations
     ========================================================================== */

  @media (max-width: 768px) {
    /* Navbar compact & leak-free */
    .ks-nav-inner {
      padding: 10px 14px;
      gap: 10px;
    }

    .ks-live-pill {
      display: none;
    }

    .ks-nav-links {
      gap: 8px;
    }

    .ks-dropdown-trigger {
      padding: 4px 8px 4px 6px;
      gap: 6px;
      font-size: 0.82rem;
      min-height: 32px;
      max-width: 160px;
    }

    .ks-dropdown-trigger-name {
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ks-dropdown-trigger .ks-tag {
      display: none;
    }

    .ks-dropdown-menu {
      width: calc(100vw - 28px);
      max-width: 320px;
      right: 0;
      left: auto;
    }

    .ks-nav-links .ks-button {
      padding: 0 10px;
      font-size: 0.8rem;
      min-height: 32px;
    }

    /* Container & Layout */
    .ks-container {
      padding: 16px 12px;
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
    }

    .ks-card {
      padding: 18px 14px;
      margin-bottom: 16px;
      border-radius: var(--ks-radius-sm);
    }

    .ks-channel-header {
      padding: 16px 14px;
      margin-bottom: 16px;
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
    }

    .ks-channel-header > div:last-child {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }

    .ks-channel-name {
      font-size: 1.15rem;
    }

    /* Form Controls: prevent iOS Safari auto-zoom by enforcing 16px */
    .ks-input-text,
    .ks-select,
    textarea.ks-input-text {
      font-size: 16px !important;
    }

    /* Data Tables Horizontal Swiping on Mobile */
    .ks-table-wrap {
      width: 100%;
      max-width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      margin-bottom: 12px;
      padding-bottom: 4px;
    }

    table.ks-table {
      min-width: 480px;
      font-size: 0.84rem;
    }

    table.ks-table th {
      padding: 8px 10px;
      font-size: 0.7rem;
    }

    table.ks-table td {
      padding: 10px;
    }

    table.ks-table td .ks-button {
      min-height: 32px;
      padding: 0 10px;
      font-size: 0.78rem;
    }

    /* Footer */
    .ks-footer {
      padding: 24px 14px;
    }

    .ks-footer-inner {
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 12px;
    }
  }

  @media (max-width: 640px) {
    /* Form fields and grids stack vertically for thumb ergonomics */
    .ks-card form div[style*="grid-template-columns"] {
      grid-template-columns: 1fr !important;
      gap: 12px !important;
    }

    /* Form inputs and buttons expand to full available width */
    .ks-card form div[style*="max-width"],
    .ks-card form input[style*="max-width"],
    .ks-card form input[type="text"],
    .ks-card form input[type="number"],
    .ks-card form select,
    .ks-card form textarea {
      max-width: 100% !important;
      width: 100% !important;
    }

    .ks-card form button[type="submit"] {
      width: 100% !important;
      justify-content: center !important;
      min-height: 42px !important;
    }

    /* Card headers stack action button beneath title */
    .ks-card-header {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .ks-card-header > .ks-button,
    .ks-card-header > button {
      width: 100%;
      justify-content: center;
      min-height: 40px;
    }

    /* Keep toggle rows side-by-side */
    .ks-toggle-row {
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: space-between !important;
      gap: 12px !important;
    }

    .ks-toggle-row > div:first-child {
      flex: 1;
      padding-right: 8px;
    }
  }

  @media (max-width: 440px) {
    .ks-brand .ks-wordmark {
      display: none;
    }

    .ks-dropdown-trigger-name {
      max-width: 65px;
    }

    .ks-nav-links .ks-button {
      padding: 0 8px;
      font-size: 0.74rem;
    }

    .ks-container {
      padding: 12px 8px;
    }

    .ks-card {
      padding: 14px 10px;
      margin-bottom: 12px;
    }

    .ks-hero-title {
      font-size: 2.2rem !important;
    }
  }

  .ks-var-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 8px;
    background: var(--ks-raised-lacquer);
    border: 1px solid var(--ks-rule);
    border-radius: var(--ks-radius-xs);
    color: var(--ks-champagne);
    font-family: var(--ks-mono);
    font-size: 0.74rem;
    cursor: pointer;
    line-height: 1.2;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.1s ease;
  }
  .ks-var-pill:hover {
    background: var(--ks-graphite);
    border-color: var(--ks-gold-hairline);
    color: #fff;
    transform: translateY(-1px);
  }
  .ks-var-pill:active {
    transform: translateY(0);
  }
`;
