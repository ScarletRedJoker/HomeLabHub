# Nebula Command

## Overview
Nebula Command is a comprehensive platform for homelab management, AI-powered content creation, Discord community integration, and multi-platform streaming. The vision is to create a custom development and automation engine - like Replit but optimized for homelab enthusiasts - supporting distributed deployment across cloud (Linode) and local (Ubuntu homelab with RTX 3060 GPU) infrastructure.

**Core Pillars:**
1. **Dashboard** - Web interface for homelab control, AI tools, remote operations
2. **Discord Bot** - Community management, tickets, notifications, music
3. **Stream Bot** - Multi-platform streaming management (Twitch/YouTube/Kick)
4. **AI Services** - Hybrid cloud/local AI (OpenAI + Ollama on GPU)

**Distributed Architecture:**
- Cloud services (Dashboard, Discord Bot, Stream Bot) run on Linode
- Local services (Ollama, Stable Diffusion, Plex, MinIO) run on Ubuntu homelab
- Tailscale mesh network connects everything securely

## User Preferences
- **User:** Evin
- **Managed Domains:** rig-city.com, evindrake.net, scarletredjoker.com
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on Ubuntu servers
- **Database:** Shared PostgreSQL (Neon in dev, homelab-postgres in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

### Deployment Preference
When Evin asks to "deploy", this means:
1. **Linode**: `ssh root@linode.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/linode && ./deploy.sh`
2. **Local Ubuntu**: `ssh evin@host.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/local && ./deploy.sh`

Each server deploys ONLY its own services. They are separate and independent.

## System Architecture

### Core Services
The platform consists of three main services:

#### Dashboard (Next.js 14) - `services/dashboard-next/`
Modern web interface for homelab management built with TypeScript, shadcn/ui, and Tailwind CSS.

**Real-Time Features (All Functional):**
- **Dashboard Home**: Live stats from Docker/SSH APIs - container counts, server status, CPU/RAM metrics, quick deploy actions
- **Services Page**: Real Docker container list with start/stop/restart controls via Docker socket
- **Servers Page**: Live SSH-based metrics from Linode and Home servers (CPU, RAM, disk usage)
- **Deploy Page**: One-click deployments to Linode/Home with live log streaming via SSH
- **Editor Page**: Monaco code editor with file tree navigation, multi-file tabs, syntax highlighting, save to server
- **Designer Page**: Visual drag-drop website builder with 14 component types, export to HTML, save/load projects
- **Websites Page**: CRUD API for managing websites (create, update, publish/unpublish, delete)
- **Jarvis AI**: OpenAI-powered chat assistant (uses Replit AI Integration or direct API key)
- **Settings Page**: Server connection testing, API integration status, profile/appearance/notification preferences

**API Routes (All Real Integrations):**
- `/api/docker` - Docker container management via socket
- `/api/servers` - SSH-based server metrics collection
- `/api/deploy` - SSH-based deployment execution
- `/api/files` - File system read/write for editor
- `/api/designer` - Design project CRUD (file-based storage)
- `/api/websites` - Website management CRUD (file-based storage)
- `/api/ai/chat` - OpenAI chat integration
- `/api/health` - Health check endpoint

**Security:**
- JWT-signed sessions (HMAC-SHA256)
- All API routes require authentication
- SSH keys accessed server-side only
- File system restricted to allowed base paths

#### Discord Bot (Node.js/React) - `services/discord-bot/`
Handles Discord community management, including ticket system, music bot, stream notifications, and analytics. Integrates with Stream Bot for go-live alerts.

#### Stream Bot (Node.js/React/Vite) - `services/stream-bot/`
Manages multi-platform content posting and interaction across Twitch, YouTube, and Kick. Supports OAuth, token encryption, rate limiting, and OBS overlay editor.

### Cross-Service Integration
Services share a PostgreSQL database and Redis for caching. The Stream Bot uses webhooks for Discord go-live notifications. The Dashboard and Discord Bot communicate via APIs. The Discord Bot integrates with Plex for "Now Playing" status and Lanyard for rich presence.

### Deployment and Hosting
The system is deployed on two independent servers:
- **Linode Cloud**: Hosts Dashboard, Discord Bot, Stream Bot
- **Local Ubuntu**: Hosts Plex, MinIO, Home Assistant

Docker configuration: `deploy/linode/docker-compose.yml` and `deploy/local/docker-compose.yml`

### Dashboard File Structure
```
services/dashboard-next/
├── app/
│   ├── (dashboard)/        # Protected dashboard routes
│   │   ├── page.tsx        # Home with live stats
│   │   ├── services/       # Docker container management
│   │   ├── servers/        # SSH server metrics
│   │   ├── deploy/         # Deployment pipeline
│   │   ├── editor/         # Monaco code editor
│   │   ├── designer/       # Visual website builder
│   │   ├── websites/       # Website management
│   │   ├── ai/             # Jarvis chat
│   │   └── settings/       # Configuration
│   ├── api/                # API routes
│   └── login/              # Authentication
├── components/             # UI components (shadcn/ui)
├── lib/                    # Utilities and session management
└── Dockerfile              # Multi-stage production build
```

### Tailscale Connectivity
Linode utilizes a Tailscale sidecar container to access local services on the Ubuntu homelab, including Plex, Home Assistant, MinIO, and KVM gaming VM. The `tailscale` container operates in `network_mode: host` to route all Linode container traffic through the Tailscale network.

### Database Schema
A shared PostgreSQL instance organizes data into distinct databases:
- `homelab_jarvis`: Dashboard data (AI conversations, Docker, audit logs)
- `discord_bot`: Discord Bot data (tickets, messages, server configs, stream notifications)
- `stream_bot`: Stream Bot data (configurations, platform connections, message history)

### KVM Gaming VM (Sunshine/Moonlight)
A KVM VM named `RDPWindows` is configured with GPU passthrough (NVIDIA RTX 3060) and a Tailscale IP (`100.118.44.102`). Moonlight can connect via Tailscale or local LAN.

### Recent Changes (January 2026)

**AI Creative Platform (January 6, 2026):**
- NEW: Creative Studio - AI-powered content creation dashboard at `/creative`
- NEW: AI Orchestrator (`lib/ai-orchestrator.ts`) - Unified interface for multiple AI providers
- NEW: Multi-model support - OpenAI GPT-4o, Ollama (local LLM), auto-switching
- NEW: Image Generation API - DALL-E 3 integration with local save support
- NEW: AI Status endpoint - Health checks for all AI providers at `/api/ai/status`
- NEW: Model listing endpoint - Available models at `/api/ai/models`
- READY: Ollama integration for local LLM on RTX 3060 (set OLLAMA_URL env var)
- READY: Stable Diffusion integration (set STABLE_DIFFUSION_URL env var)
- PLANNED: Video generation with Runway/Luma APIs

**Remote Operations & Security Hardening (January 6, 2026):**
- NEW: SSH Terminal with xterm.js - Full shell access to Linode/Home servers via WebSocket on port 3001
- NEW: SFTP File Browser - Upload/download files, navigate directories with path security
- NEW: Power Controls - Restart/shutdown for both servers via SSH
- NEW: Wake-on-LAN - Magic packet support for waking Home server (requires HOME_SERVER_MAC env var)
- NEW: Command Palette (Cmd+K/Ctrl+K) - Quick navigation and server actions
- NEW: Status Overview Page - Health checks for all 6 services with 30s auto-refresh
- NEW: Mobile Responsive Layout - Hamburger menu and sheet drawer at 768px breakpoint
- SECURITY: Terminal WebSocket now requires 5-minute JWT token with purpose validation
- SECURITY: SFTP uses posixPath resolution to prevent path traversal attacks
- SECURITY: Dev login only shows when NEXT_PUBLIC_DEV_MODE=true

**Testing & UX Refinements (January 5, 2026):**
- Fixed dev login security: Now uses NEXT_PUBLIC_DEV_MODE env var (only shows button when explicitly enabled)
- Fixed Replit compatibility: File-based APIs (websites, settings, designer, files) now detect REPL_ID and use ./data/ instead of /opt/homelab
- All 56 automated tests passing: 18 overlay API, 20 OAuth flows, 3 E2E, 15 Discord Bot API
- All three services verified healthy: Discord Bot (connected, tickets initialized), Stream Bot (Twitch connected), Dashboard (all pages functional)

**Discord Bot Dashboard Improvements (January 5, 2026):**
- Fixed QuickSetupWizard channel selection (filters "none" values before API calls)
- Enhanced OnboardingChecklist tab navigation (streams→stream-notifications, panels→panels, etc.)
- Added error handling to OnboardingWizard with toast notifications and loading spinners
- Fixed StreamNotificationsTab field names (channelId→notificationChannelId, enabled→isEnabled)
- All 7 dashboard features verified: Tickets, Welcome Cards, Stream Notifications, AutoMod, Starboard, XP/Leveling, Economy

**Stream Bot Full Feature Audit (January 5, 2026):**
- NEW: Unified Stream Info Editor - Edit title/game/tags across Twitch/YouTube/Kick from one page (`/stream-info`)
- NEW: Full Kick OAuth 2.1 integration with PKCE (kick-client.ts, oauth-kick.ts)
- Fixed AI Content Service to use Replit AI integration environment variables
- Fixed clips DB missing columns (status, tags, social_caption)
- Created missing stream_alerts, stream_alert_history, alert_queue database tables
- Removed ~260 lines of duplicate poll/prediction route handlers
- Fixed currency settings endpoint to auto-create defaults
- Fixed chatbot presets endpoint to return fallback presets when DB query fails
- All features verified: Platform Connections, AI Content, OBS Overlays, Restream, Schedule, Clips, Announcements, Alerts, Moderation, Currency, Games, Polls, Giveaways

**Next.js Dashboard Rewrite:**
- Replaced Flask dashboard with Next.js 14 App Router
- Full TypeScript implementation with shadcn/ui components
- Real API integrations for Docker, SSH, deployments, files
- Visual website designer with drag-drop components
- Monaco code editor with file tree and syntax highlighting
- Jarvis AI using Replit's OpenAI integration
- Settings page for server connections and preferences

**Security Fixes:**
- Jarvis AI no longer auto-executes actions (prevents prompt injection)
- All API routes require JWT authentication
- SSH keys never exposed to client

**Stream Bot Fixes:**
- Rate limiter increased from 5 to 50 requests for OAuth
- Legacy route handler for OAuth success URLs
- Production config corrected

**Discord Bot Fixes:**
- Dashboard simplified to 5 core tabs
- CORS fixed for dashboard access

## Security & Secret Management

### Critical Security Incident (January 4, 2026)
The Discord bot token was accidentally exposed when the GitHub repository was briefly made public. Token was immediately regenerated and rotated across all environments.

### Implemented Protections
1. **Git Pre-commit Hooks**: Run `./scripts/setup-git-secrets.sh` on any new machine
2. **Protected Patterns**: Discord tokens, OpenAI keys, Tailscale keys, Cloudflare tokens, OAuth secrets, AWS credentials, private keys
3. **Environment Files**: All `.env` files in `.gitignore`, use `.env.template` for documentation

### Secret Rotation Procedure
1. Regenerate the secret in provider's dashboard
2. Update Replit Secrets (development)
3. Update `.env` on Linode: `/opt/homelab/HomeLabHub/deploy/linode/.env`
4. Update `.env` on Local Ubuntu: `/opt/homelab/HomeLabHub/deploy/local/.env`
5. Restart affected services

## External Dependencies
- **PostgreSQL**: Primary database (Neon dev, homelab-postgres prod)
- **Redis**: Caching and session management
- **OpenAI API**: Jarvis AI assistant
- **Discord API (discord.js)**: Discord Bot functionality
- **Twitch/YouTube/Kick APIs**: Stream Bot integrations
- **Spotify API**: Music bot features
- **Plex API**: "Now Playing" integration
- **Home Assistant API**: Homelab automation
- **Cloudflare API**: DNS management
- **Tailscale**: Secure network access
- **Caddy**: Reverse proxy

## Testing Infrastructure

### Test Commands
**Stream Bot (41 tests):**
```bash
cd services/stream-bot
npm run test:overlay  # 18 overlay API tests
npm run test:oauth    # 20 OAuth flow tests
npm run test -- tests/e2e-overlay-flow.test.ts  # 3 E2E tests
```

**Discord Bot (15 tests):**
```bash
cd services/discord-bot
npm run test:api  # 15 API route tests
```

### Pre-commit Hooks
Run `./scripts/setup-git-hooks.sh` to install git hooks that run all 56 tests before each commit.
To skip tests: `git commit --no-verify`

### CI/CD
GitHub Actions workflow at `.github/workflows/test.yml` runs on push/PR to main branch.

### Test Coverage
- **Overlay API**: Token generation, OBS compatibility, URL format validation, data endpoints
- **OAuth Flows**: Spotify, Twitch, YouTube, Kick redirect URLs and callback handling
- **E2E**: Complete Spotify overlay workflow (connect → generate token → access overlay)
- **Discord Bot**: Health, bot settings, server settings, tickets, stream notifications

## Development Notes
- Dashboard runs on port 5000
- Discord Bot runs on port 4000
- Stream Bot runs on port 3000 (internal), 5000 (production)
- Use `npm run dev` in services/dashboard-next for development
- Docker socket required for container management
- SSH keys required for server metrics and deployments
