# Full Infrastructure Status Report
**Generated:** December 4, 2025
**Status:** COMPREHENSIVE AUDIT

---

## 1. LINODE CLOUD SERVER (host.evindrake.net)

### Services That Should Be Running

| Container | Port | Domain | Status | Notes |
|-----------|------|--------|--------|-------|
| caddy | 80, 443 | - | CHECK | Reverse proxy + SSL |
| homelab-redis | 6379 | internal | CHECK | Cache/message broker |
| homelab-postgres | 5432 | internal | CHECK | PostgreSQL 16 |
| homelab-dashboard | 5000 | dashboard.evindrake.net | CHECK | Flask Dashboard |
| homelab-celery-worker | - | - | CHECK | Background tasks |
| discord-bot | 4000 | bot.rig-city.com | CHECK | Discord Ticket Bot |
| stream-bot | 5000 | stream.rig-city.com | CHECK | Multi-platform Stream Bot |
| n8n | 5678 | n8n.evindrake.net | CHECK | Workflow automation |
| code-server | 8443 | code.evindrake.net | CHECK | VS Code in browser |
| code-server-proxy | 8080 | - | CHECK | Nginx proxy for code-server |
| scarletredjoker-web | 80 | scarletredjoker.com | CHECK | Static site |
| rig-city-site | 80 | rig-city.com | CHECK | Static site |

### Required Environment Variables (.env on Linode)

```bash
# Database
POSTGRES_PASSWORD=<secure-password>
DISCORD_DB_PASSWORD=<secure-password>
STREAMBOT_DB_PASSWORD=<secure-password>
JARVIS_DB_PASSWORD=<secure-password>

# Authentication
WEB_USERNAME=<dashboard-username>
WEB_PASSWORD=<dashboard-password>
SERVICE_AUTH_TOKEN=<internal-api-token>

# OpenAI
OPENAI_API_KEY=<your-openai-key>

# Discord Bot
DISCORD_BOT_TOKEN=<bot-token>
DISCORD_CLIENT_ID=<client-id>
DISCORD_CLIENT_SECRET=<client-secret>
DISCORD_APP_ID=<app-id>
VITE_DISCORD_CLIENT_ID=<client-id>
DISCORD_SESSION_SECRET=<session-secret>

# Stream Bot OAuth
TWITCH_CLIENT_ID=<twitch-client-id>
TWITCH_CLIENT_SECRET=<twitch-client-secret>
YOUTUBE_CLIENT_ID=<youtube-client-id>
YOUTUBE_CLIENT_SECRET=<youtube-client-secret>
SPOTIFY_CLIENT_ID=<spotify-client-id>
SPOTIFY_CLIENT_SECRET=<spotify-client-secret>
KICK_CLIENT_ID=<kick-client-id>
KICK_CLIENT_SECRET=<kick-client-secret>

# n8n
N8N_BASIC_AUTH_USER=<n8n-username>
N8N_BASIC_AUTH_PASSWORD=<n8n-password>

# Code Server
CODE_SERVER_PASSWORD=<code-server-password>

# Local Host Integration (via Tailscale)
TAILSCALE_LOCAL_HOST=<tailscale-ip-of-local-ubuntu>
PLEX_TOKEN=<plex-token>
HOME_ASSISTANT_TOKEN=<ha-long-lived-token>
```

### Linode Verification Commands

```bash
# SSH to Linode
ssh root@host.evindrake.net

# Check all containers
cd /opt/homelab/HomeLabHub/deploy/linode
docker compose ps

# Check logs
docker compose logs -f --tail=50

# Restart all services
docker compose down && docker compose up -d
```

---

## 2. LOCAL UBUNTU HOST (10.200.0.2 via WireGuard)

### Services Running

| Container/Service | Port | Domain | Status |
|-------------------|------|--------|--------|
| caddy-local | 80, 443 | - | ✅ Up |
| homelab-minio | 9000, 9001 | - | ✅ Up (healthy) |
| homeassistant | 8123 | home.evindrake.net | ✅ Up (healthy) |
| plex (Docker) | 32400 | plex.evindrake.net | ✅ Up 17 hours |
| cloudflare-ddns | - | - | ✅ Up 17 hours |

### Native Services

| Service | Port | Status |
|---------|------|--------|
| Plex Media Server | 32400 | ✅ Running |
| WireGuard VPN | 51820 | ✅ Connected to Linode |
| Tailscale | - | ✅ Active |

---

## 3. WINDOWS 11 VM (192.168.122.250)

### GameStream Status

| Component | Status |
|-----------|--------|
| Sunshine | ✅ Running (1080p@60Hz) |
| GPU Passthrough | ✅ RTX 3060 working |
| Moonlight Pairing | ✅ Complete |
| Port Forwarding | ✅ iptables configured |
| Tailscale | ✅ 100.118.44.102 |

---

## 4. NETWORK TOPOLOGY

```
                    ┌─────────────────────────────────────┐
                    │        INTERNET                      │
                    └─────────────────┬───────────────────┘
                                      │
               ┌──────────────────────┼──────────────────────┐
               │                      │                      │
    ┌──────────▼──────────┐  ┌───────▼────────┐   ┌─────────▼─────────┐
    │   LINODE SERVER     │  │ HOME ROUTER    │   │ CLOUDFLARE DNS    │
    │   (Cloud)           │  │                │   │                   │
    │   10.200.0.1 (wg)   │  │                │   │ *.evindrake.net   │
    │                     │  │                │   │ *.rig-city.com    │
    │ Services:           │  │                │   │ *.scarletredjoker │
    │ - Dashboard         │  │                │   └───────────────────┘
    │ - Discord Bot       │  │                │
    │ - Stream Bot        │  │                │
    │ - n8n               │  │                │
    │ - Code Server       │  │                │
    │ - PostgreSQL        │  │                │
    │ - Redis             │  │                │
    │ - Static Sites      │  │                │
    └──────────┬──────────┘  └───────┬────────┘
               │                      │
               │     WireGuard VPN    │
               │     (~34ms latency)  │
               │                      │
    ┌──────────▼──────────────────────▼──────────┐
    │           LOCAL UBUNTU HOST                 │
    │           10.200.0.2 (wg)                   │
    │                                             │
    │ Docker Services:                            │
    │ - Caddy (local reverse proxy)               │
    │ - MinIO (S3 storage)                        │
    │ - Home Assistant                            │
    │ - Cloudflare DDNS                           │
    │                                             │
    │ Native:                                     │
    │ - Plex Media Server                         │
    │                                             │
    │  ┌─────────────────────────────────────┐    │
    │  │  WINDOWS 11 VM (KVM)                │    │
    │  │  192.168.122.250 (NAT)              │    │
    │  │  100.118.44.102 (Tailscale)         │    │
    │  │                                     │    │
    │  │  - RTX 3060 GPU Passthrough         │    │
    │  │  - Sunshine GameStream              │    │
    │  │  - WinApps (RDP)                    │    │
    │  └─────────────────────────────────────┘    │
    └─────────────────────────────────────────────┘
```

---

## 5. DOMAIN CONFIGURATION

### rig-city.com (Cloudflare)
| Record | Type | Target |
|--------|------|--------|
| @ | A | Linode IP |
| www | CNAME | @ |
| bot | A | Linode IP |
| stream | A | Linode IP |

### evindrake.net (Cloudflare)
| Record | Type | Target |
|--------|------|--------|
| host | A | Linode IP |
| dashboard | A | Linode IP |
| n8n | A | Linode IP |
| code | A | Linode IP |
| plex | A | Local IP (Cloudflare DDNS) |
| home | A | Local IP (Cloudflare DDNS) |
| vnc | A | Local IP |
| game | A | Linode IP (redirect) |

### scarletredjoker.com (Cloudflare)
| Record | Type | Target |
|--------|------|--------|
| @ | A | Linode IP |
| www | CNAME | @ |

---

## 6. SECRETS STATUS

### Currently Set in Replit (Development)
- [x] DATABASE_URL (Neon)
- [x] SESSION_SECRET
- [x] AI_INTEGRATIONS_OPENAI_API_KEY
- [x] KICK_CLIENT_ID
- [x] KICK_CLIENT_SECRET
- [x] PLEX_TOKEN
- [x] CODE_SERVER_PASSWORD

### Required for Linode Production
Check these are set in `/opt/homelab/HomeLabHub/deploy/linode/.env`:

| Secret | Required For | Status |
|--------|--------------|--------|
| POSTGRES_PASSWORD | PostgreSQL | CHECK |
| DISCORD_BOT_TOKEN | Discord Bot | CHECK |
| OPENAI_API_KEY | Dashboard AI, Stream Bot | CHECK |
| TWITCH_CLIENT_ID/SECRET | Stream Bot | CHECK |
| YOUTUBE_CLIENT_ID/SECRET | Stream Bot | CHECK |
| SPOTIFY_CLIENT_ID/SECRET | Stream Bot | CHECK |
| KICK_CLIENT_ID/SECRET | Stream Bot | CHECK |
| PLEX_TOKEN | Dashboard Plex integration | CHECK |
| HOME_ASSISTANT_TOKEN | Dashboard HA integration | CHECK |
| CODE_SERVER_PASSWORD | Code Server | CHECK |
| N8N_BASIC_AUTH_USER/PASSWORD | n8n | CHECK |

---

## 7. VERIFICATION CHECKLIST

### Linode (SSH to check)
```bash
# All services up?
docker compose ps

# Can reach local services via WireGuard?
ping 10.200.0.2

# SSL certs valid?
curl -I https://dashboard.evindrake.net
curl -I https://bot.rig-city.com
curl -I https://stream.rig-city.com
```

### Local Ubuntu
```bash
# All Docker services?
docker ps

# WireGuard connected?
sudo wg show

# Plex accessible?
curl http://localhost:32400/identity
```

### Windows VM
```powershell
# Sunshine running?
Get-Process sunshine

# GPU detected?
nvidia-smi
```

---

## 8. REMAINING ITEMS

### Critical (Must Fix)
- [ ] Verify Linode services are running (SSH and check)
- [ ] Confirm .env file exists on Linode with all secrets

### Optional Enhancements
- [ ] Set YOUTUBE_API_KEY for Discord Bot notifications
- [ ] Set CLOUDFLARE_API_TOKEN for DNS automation
- [ ] Set HOME_ASSISTANT_TOKEN for Dashboard integration
- [ ] Set up Prometheus/Grafana monitoring
- [ ] Configure automated PostgreSQL backups
