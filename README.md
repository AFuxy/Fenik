# Fenik — Universal Twitch Bot Platform

A high-performance, multi-tenant Twitch bot platform built with Node.js, secure SQLite, and [Impeccable](https://impeccable.style/) design principles. Designed for any streamer to connect with one click and configure custom commands, auto-moderation, EventSub alerts, and 24/7 product livestream showcases via `@FenikBot`.

---

## Highlights

- **One-Click Streamer Onboarding**: Broadcasters authorize once via Twitch OAuth (`channel:bot`) and the central bot instantly joins their channel.
- **Custom Commands Studio**: Create and edit triggers with dynamic tags (`{user}`, `{target}`, `{count}`, `{channel}`, `{random.X-Y}`) and per-command cooldowns.
- **Auto-Moderation Engine**: Built-in link protection, excessive caps suppression, and phrase blacklisting, plus `!permit <user>` for moderators.
- **Granular Permissions & Managers**: Restrict commands to Subscribers, VIPs, or Moderators. Authorize trusted staff to manage channel commands without sharing your Twitch account.
- **Secure Embedded SQLite (`local.db`)**: Powered by `better-sqlite3` with WAL mode and **AES-256-GCM token encryption** for OAuth credentials at rest.
- **Crafted Impeccable UI**: Restrained dark-mode surfaces, strict typographic hierarchy, responsive layouts, and zero AI-slop visual clutter.
- **Helix API & EventSub Architecture**: Messages are sent via Twitch Helix with App Access Tokens, maintaining official Chat Bot Badge qualification silently under the hood.

---

## Modular Codebase Architecture

```
src/
├── config.js               # Central configuration, env parsing, encryption key derivation
├── index.js                # App entry point, bootstrap, graceful shutdown
├── db/                     # Secure Database Layer (better-sqlite3 + AES-256-GCM)
│   ├── connection.js       # SQLite connection, WAL mode, relational schema
│   ├── crypto.js           # AES-256-GCM token encryption and decryption
│   ├── botRepo.js          # Central bot account store
│   ├── channelRepo.js      # Channels & streamers store
│   ├── commandRepo.js      # Custom commands store
│   ├── moderationRepo.js   # Link filter, caps, phrase blacklist
│   ├── managerRepo.js      # Channel managers store
│   ├── sessionRepo.js      # Web sessions store
│   └── index.js            # Barrel export & JSON migrator
├── services/               # Core Domain & Integrations
│   ├── twitchApi.js        # Twitch Helix API (App token, messages, timeouts)
│   ├── eventSub.js         # EventSub WebSocket manager (dynamic channel sync)
│   ├── commandService.js   # Chat command parsing, user levels, cooldowns
│   └── moderationService.js# Link filtering, permits, caps, phrase filters
├── routes/                 # Express Router Endpoints
│   ├── home.js             # Public landing page (/)
│   ├── auth.js             # OAuth login, bot setup, callback, logout
│   ├── dashboard.js        # Streamer dashboard (/dashboard)
│   ├── admin.js            # Host setup & platform overview (/admin)
│   └── api.js              # REST API for commands, moderation, managers, test msgs
├── ui/                     # Impeccable Design System & Views
│   ├── styles.js           # Impeccable CSS system
│   ├── layout.js           # Navigation bar, footer, base layout
│   ├── homeView.js         # Homepage view
│   ├── dashboardView.js    # Streamer dashboard view
│   └── adminView.js        # Host admin view
└── server.js               # Express application builder (registers routers)
```

---

## Getting Started

### 1. Requirements
- **Node.js** v20 or higher (Node v22 recommended)
- A registered [Twitch Developer Application](https://dev.twitch.tv/console/apps)

### 2. Configuration (`.env`)
Copy `.env.example` to `.env`:

```env
# Bot Platform Identity
PLATFORM_NAME=Fenik
BOT_NAME=FenikBot

# Server & Network Configuration
PORT=3000
BASE_URL=http://localhost:3000
REDIRECT_URI=http://localhost:3000/auth/callback
# For production:
# BASE_URL=https://fenik.live
# REDIRECT_URI=https://fenik.live/auth/callback

# Twitch Application Credentials
TWITCH_CLIENT_ID=your_twitch_client_id_here
TWITCH_CLIENT_SECRET=your_twitch_client_secret_here

# Default Chat Command Prefix
COMMAND_PREFIX=!

# Secret key for sessions & AES-256 token encryption
SESSION_SECRET=your_long_random_secret_here
```

### 3. Run
```bash
npm install
npm start
```

- Open `http://localhost:3000` to view the public landing page.
- Open `http://localhost:3000/admin` to connect the central bot Twitch account.
- Streamers click **"Add to Twitch"** to connect their channels and access their dashboard!
