# HomeLabHub - Nebula Command Platform

A comprehensive homelab management suite featuring a modern dashboard, Discord community bot, and multi-platform streaming tools.

## Overview

HomeLabHub is a single-tenant platform for homelab enthusiasts, providing:

- **Dashboard** - Next.js 14 control panel with real-time Docker/SSH management, visual website builder, and AI assistant
- **Discord Bot** - Community management with tickets, welcome cards, stream notifications, XP/leveling, and economy systems
- **Stream Bot** - Unified streaming platform for Twitch, YouTube, and Kick with OBS overlays, AI content, and chat moderation

## Architecture

```
HomeLabHub/
├── services/
│   ├── dashboard-next/     # Next.js 14 Dashboard (TypeScript, shadcn/ui)
│   ├── discord-bot/        # Discord.js Bot (Node.js, React dashboard)
│   └── stream-bot/         # Streaming Platform (Node.js, Vite, React)
├── deploy/
│   ├── linode/             # Cloud deployment (docker-compose)
│   └── local/              # Local Ubuntu deployment
└── scripts/                # Utility scripts
```

## Services

### Dashboard (Next.js 14)
Port: 5000 | URL: `host.evindrake.net`

| Feature | Description |
|---------|-------------|
| Home | Live stats - container counts, server metrics, quick actions |
| Services | Docker container management (start/stop/restart) |
| Servers | SSH-based metrics from remote servers |
| Deploy | One-click deployments with live log streaming |
| Editor | Monaco code editor with file tree navigation |
| Designer | Visual drag-drop website builder (14 component types) |
| Websites | Website management CRUD |
| Jarvis AI | OpenAI-powered chat assistant |
| Settings | Server connections, integrations, preferences |

### Discord Bot
Port: 4000 | URL: `bot.rig-city.com`

| Feature | Description |
|---------|-------------|
| Tickets | Support ticket system with transcripts |
| Welcome Cards | Custom welcome images with @napi-rs/canvas |
| Stream Notifications | Go-live alerts for Twitch/YouTube/Kick |
| AutoMod | Automated content moderation |
| Starboard | Highlight popular messages |
| XP/Leveling | Member engagement tracking |
| Economy | Virtual currency system |
| Music Bot | Play music with discord-player |

### Stream Bot
Port: 3000 | URL: `stream.rig-city.com`

| Feature | Description |
|---------|-------------|
| Platform Connections | OAuth for Twitch, YouTube, Kick, Spotify |
| Stream Info Editor | Edit title/game/tags across all platforms |
| OBS Overlays | Now Playing, alerts, chat overlays |
| AI Content | Generate titles, descriptions, social posts |
| Restream | Multi-platform streaming management |
| Schedule | Stream schedule with calendar |
| Clips | Clip management with social sharing |
| Alerts | Customizable stream alerts |
| Chat Moderation | AutoMod, banned words, slow mode |
| Currency & Games | Viewer engagement features |
| Polls & Predictions | Interactive viewer features |

## Quick Start

### Development (Replit)

All three services run automatically:
- Dashboard: Port 5000 (webview)
- Discord Bot: Port 4000
- Stream Bot: Port 3000

### Production Deployment

**Linode Cloud:**
```bash
ssh root@linode.evindrake.net
cd /opt/homelab/HomeLabHub/deploy/linode
./deploy.sh
```

**Local Ubuntu:**
```bash
ssh evin@host.evindrake.net
cd /opt/homelab/HomeLabHub/deploy/local
./deploy.sh
```

## Environment Variables

### Required Secrets
```env
# Discord
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# Streaming Platforms
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
YOUTUBE_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
KICK_CLIENT_ID=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Infrastructure
DATABASE_URL=postgresql://...
OPENAI_API_KEY=
CLOUDFLARE_API_TOKEN=
```

## Database

PostgreSQL with three logical databases:
- `homelab_jarvis` - Dashboard data
- `discord_bot` - Discord Bot data
- `stream_bot` - Stream Bot data

## Testing

```bash
# Stream Bot (41 tests)
cd services/stream-bot
npm run test:overlay   # 18 overlay API tests
npm run test:oauth     # 20 OAuth flow tests
npm run test           # All tests

# Discord Bot (15 tests)
cd services/discord-bot
npm run test:api       # 15 API route tests
```

Pre-commit hooks run all 56 tests automatically.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React, Vite, TypeScript |
| UI | shadcn/ui, Tailwind CSS, Radix UI |
| Backend | Node.js, Express |
| Database | PostgreSQL (Neon/self-hosted), Drizzle ORM |
| Cache | Redis |
| Auth | JWT sessions, OAuth 2.0/2.1 (PKCE) |
| AI | OpenAI GPT-4 |
| Deployment | Docker, Docker Compose |
| Reverse Proxy | Caddy (auto-SSL) |
| Network | Tailscale (secure mesh) |

## Security

- JWT-signed sessions (HMAC-SHA256)
- All API routes require authentication
- SSH keys accessed server-side only
- OAuth tokens encrypted at rest
- Git pre-commit hooks prevent secret leaks
- Rate limiting on all endpoints

## Monitoring

Production includes:
- Grafana dashboards
- Prometheus metrics
- Loki log aggregation
- cAdvisor container metrics
- Node Exporter system metrics

## Development Workflow

1. Edit code in Replit
2. Push to GitHub
3. Pull on Ubuntu servers
4. Run deploy script

## License

Private repository - All rights reserved.

---

**HomeLabHub** - Unified Homelab Management
