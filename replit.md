# Nebula Command - HomeLabHub Platform

## Quick Reference

| Environment | Dashboard | Discord Bot | Stream Bot |
|------------|-----------|-------------|------------|
| **Replit (Dev)** | Port 5000 | Port 4000 | Port 3000 |
| **Production** | dashboard.rig-city.com | discord.rig-city.com | stream.rig-city.com |
| **Local Ubuntu** | 100.110.227.25 | 100.110.227.25 | 100.110.227.25 |
| **Linode Cloud** | 100.66.61.51 | 100.66.61.51 | 100.66.61.51 |

---

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

---

## Architecture

### Three Core Services

```
┌─────────────────────────────────────────────────────────────┐
│                    NEBULA COMMAND PLATFORM                   │
├─────────────────┬─────────────────┬─────────────────────────┤
│   Dashboard     │   Discord Bot   │      Stream Bot         │
│   (Flask/Py)    │   (Node/React)  │    (Node/React/Vite)    │
│   Port 5000     │   Port 4000     │      Port 3000          │
├─────────────────┴─────────────────┴─────────────────────────┤
│              Shared PostgreSQL + Redis                       │
└─────────────────────────────────────────────────────────────┘
```

| Service | Tech Stack | Database | Purpose |
|---------|-----------|----------|---------|
| **Dashboard** | Flask, Bootstrap 5, Chart.js | homelab_jarvis | Homelab management, Jarvis AI, Docker control |
| **Discord Bot** | Node.js, React, discord.js v14 | discord_bot | Ticket system, music bot, stream notifications |
| **Stream Bot** | Node.js, React, Vite, Tailwind | stream_bot | Multi-platform fact posting (Twitch/YouTube/Kick) |

### Cross-Service Integration

```
Stream Bot ──webhook──> Discord Bot (go-live notifications)
Dashboard  ──API────> Discord Bot (ticket management)
All Services ────────> Shared PostgreSQL
```

**Webhook Contract (Stream → Discord):**
```
POST /api/stream-notifications/external
Headers: X-Stream-Bot-Secret: <STREAM_BOT_WEBHOOK_SECRET>
Body: { userId, platform, streamUrl, streamTitle, game?, thumbnailUrl?, viewerCount? }
```

---

## Deployment Runbook

### IMPORTANT: Two Separate Servers

Each server deploys **only its own services**. They do NOT deploy each other.

| Server | Services | Deploy Directory |
|--------|----------|------------------|
| **Local Ubuntu** | Plex, MinIO, Home Assistant | `deploy/local/` |
| **Linode Cloud** | Dashboard, Discord Bot, Stream Bot | `deploy/linode/` |

---

### Deploy Linode (Dashboard, Discord Bot, Stream Bot)

```bash
ssh root@100.66.61.51
cd /opt/homelab/HomeLabHub/deploy/linode
./deploy.sh
```

### Deploy Local Ubuntu (Plex, MinIO, Home Assistant)

```bash
ssh evin@100.110.227.25
cd /opt/homelab/HomeLabHub/deploy/local
./deploy.sh
```

### Deploy Both (Run from Local Ubuntu)

```bash
ssh evin@100.110.227.25
cd /opt/homelab/HomeLabHub/deploy/local && ./deploy.sh
ssh root@100.66.61.51 "cd /opt/homelab/HomeLabHub/deploy/linode && ./deploy.sh"
```

### Rollback
```bash
# On Linode:
cd /opt/homelab/HomeLabHub/deploy/linode
./scripts/deploy.sh --rollback

# On Local:
cd /opt/homelab/HomeLabHub/deploy/local
docker compose down && docker compose up -d
```

---

## Network Configuration

| Host | Tailscale IP | Hostname | SSH User | Role |
|------|--------------|----------|----------|------|
| Local Ubuntu | 100.110.227.25 | host.evindrake.net | evin | Primary services, KVM gaming |
| Linode Cloud | 100.66.61.51 | linode.evindrake.net | root | Cloud services, redundancy |
| Windows KVM | 100.110.227.25:47984 | - | - | GPU passthrough gaming |
| ZyXEL NAS | 192.168.0.198 | - | - | Media storage |

---

## Required Environment Variables

### All Services (Shared)
```bash
DATABASE_URL=postgresql://...            # Neon (dev) or homelab-postgres (prod)
REDIS_URL=redis://redis:6379/0
SERVICE_AUTH_TOKEN=<random-32-chars>     # Inter-service auth
OPENAI_API_KEY=<key>                     # AI features
```

### Dashboard Specific
```bash
FLASK_ENV=production
WEB_USERNAME=admin
WEB_PASSWORD=<secure-password>
JARVIS_DATABASE_URL=postgresql://jarvis:...
PLEX_URL=http://100.64.0.1:32400
PLEX_TOKEN=<token>
HOME_ASSISTANT_URL=http://100.64.0.1:8123
HOME_ASSISTANT_TOKEN=<token>
CLOUDFLARE_API_TOKEN=<token>
```

### Discord Bot Specific
```bash
DISCORD_BOT_TOKEN=<token>
DISCORD_CLIENT_ID=<id>
DISCORD_CLIENT_SECRET=<secret>
TWITCH_CLIENT_ID=<id>
TWITCH_CLIENT_SECRET=<secret>
SESSION_SECRET=<random-64-chars>
STREAM_BOT_WEBHOOK_SECRET=<random-32-chars>
```

### Stream Bot Specific
```bash
TWITCH_CLIENT_ID=<id>
TWITCH_CLIENT_SECRET=<secret>
YOUTUBE_CLIENT_ID=<id>
YOUTUBE_CLIENT_SECRET=<secret>
YOUTUBE_REDIRECT_URI=https://stream.rig-city.com/auth/youtube/callback
KICK_CLIENT_ID=<id>
SPOTIFY_CLIENT_ID=<id>
SPOTIFY_CLIENT_SECRET=<secret>
DISCORD_BOT_URL=https://discord.rig-city.com
STREAM_BOT_WEBHOOK_SECRET=<same-as-discord-bot>
SESSION_SECRET=<random-64-chars>
TOKEN_ENCRYPTION_KEY=<random-32-chars>
```

---

## Replit Workflows

| Workflow | Command | Port | Output |
|----------|---------|------|--------|
| dashboard | `cd services/dashboard && python main.py` | 5000 | webview |
| discord-bot | `cd services/discord-bot && npm run dev` | 4000 | console |
| stream-bot | `cd services/stream-bot && PORT=3000 npm run dev` | 3000 | console |

---

## Database Schema

### Shared PostgreSQL Databases
- `homelab_jarvis` - Dashboard, Jarvis AI, Docker management
- `discord_bot` - Tickets, music, stream notifications
- `stream_bot` - Bot configs, platform connections, message history

### Key Tables per Service
**Dashboard:** users, docker_containers, jarvis_conversations, audit_logs
**Discord Bot:** tickets, ticket_messages, servers, bot_settings, stream_notifications
**Stream Bot:** users, bot_configs, platform_connections, message_history

---

## Feature Status (Dec 2025)

### Stream Bot
- [x] Twitch OAuth + chat posting
- [x] YouTube OAuth + live chat (force-ssl scope)
- [x] Kick connection with exponential backoff reconnection
- [x] Per-user fact personalization with rolling topics
- [x] Token encryption for all platforms
- [x] Rate limiting (ToS-compliant per platform)
- [x] Anti-spam: cooldowns, deduplication, message pacing
- [x] Cross-service webhook to Discord for go-live notifications

### Discord Bot
- [x] Ticket system with SLA automation
- [x] Music bot with Spotify/YouTube
- [x] Stream notifications (presence detection)
- [x] Analytics dashboard (staff performance, trends, satisfaction)
- [x] External webhook for stream-bot integration
- [x] Multi-tenant security with server access validation

### Dashboard
- [x] Jarvis AI assistant (GPT-4o)
- [x] Docker container management
- [x] NAS mount manager
- [x] Fleet control center
- [x] KVM gaming mode switching
- [x] DNS management (Cloudflare)

---

## Troubleshooting

### Stream Bot "No platforms connected"
Users need to OAuth connect platforms in the Stream Bot UI. Production requires:
1. YouTube: Disconnect and reconnect to grant `youtube.force-ssl` scope
2. Kick: Provide bearer token + cookies from browser dev tools
3. Twitch: Standard OAuth flow

### Discord Bot not responding
1. Check `DISCORD_BOT_TOKEN` is valid
2. Verify bot is in the server with proper permissions
3. Check `/api/bot/health` endpoint

### Cross-service webhooks failing
1. Verify `STREAM_BOT_WEBHOOK_SECRET` matches in both services
2. Check `DISCORD_BOT_URL` is reachable from stream-bot
3. Test: `curl -X POST $DISCORD_BOT_URL/api/stream-notifications/external -H "X-Stream-Bot-Secret: $SECRET"`

---

## File Structure

```
/
├── services/
│   ├── dashboard/          # Flask dashboard (Python)
│   ├── discord-bot/        # Discord bot (Node.js/React)
│   └── stream-bot/         # Stream bot (Node.js/React/Vite)
├── scripts/
│   ├── deploy.sh           # Production deployment
│   ├── health-check.sh     # Service health checks
│   ├── rollback.sh         # Rollback to backup
│   └── secrets-manager.sh  # Age-encrypted secrets
├── deployment/
│   ├── deploy-to-ubuntu.sh # Full server deployment
│   └── generate-unified-env.sh
├── docker-compose.yml      # Production orchestration
├── Caddyfile              # Reverse proxy config
└── .env                   # Environment variables (gitignored)
```

---

## Recent Changes Log

**2025-12-18:**
- Fixed YouTube OAuth: Added `youtube.force-ssl` scope for live chat posting
- Fixed Kick reconnection: Exponential backoff, error handlers
- Added per-user fact personalization with rolling topic rotation
- Encrypted Kick bearer tokens in database
- Added platform-specific rate limiting (Twitch 20/30s, YouTube 200/min, Kick 5/min)
- Added fact deduplication and cooldowns
- Added Stream-Bot → Discord go-live webhook integration
- Added Analytics dashboard (staff performance, ticket trends, satisfaction)
- Fixed analytics security: server access validation on all endpoints
- **Discord Rich Presence**: Bot presence shows homelab status, Plex Rich Presence container, personal presence client
- **Cross-Service Health API**: Dashboard `/api/services/cross-health` fetches live status from all services
- **Dashboard Status Widgets**: Real-time Stream Bot and Discord Bot status with active bots, WebSocket clients, latency
- **Caddy Fixes**: Added X-Forwarded-Proto header for all services (needed for secure cookies)
- **WebSocket Auth Debug**: Added detailed logging for troubleshooting session issues in production
