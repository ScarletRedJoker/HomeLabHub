# Full Infrastructure Status Report
**Updated:** December 7, 2025
**Status:** COMPREHENSIVE AUDIT - ALL SYSTEMS VERIFIED

---

## 1. SERVICE-TO-DOMAIN MATRIX

### Linode Cloud Services (Caddy-Managed)

| Domain | Container | Internal Port | Health Endpoint | Status |
|--------|-----------|---------------|-----------------|--------|
| bot.evindrake.net | discord-bot | 4000 | `/health` | ✅ Active |
| stream.evindrake.net | stream-bot | 5000 | `/health` | ✅ Active |
| rig-city.com | rig-city-site | 80 | - | ✅ Static |
| www.rig-city.com | → redirect | - | - | ✅ Redirect |
| dashboard.evindrake.net | homelab-dashboard | 5000 | `/health` | ✅ Active |
| host.evindrake.net | homelab-dashboard | 5000 | `/health` | ✅ Active |
| n8n.evindrake.net | n8n | 5678 | - | ✅ Active |
| code.evindrake.net | code-server-proxy | 8080 | `/healthz` | ✅ Active |
| grafana.evindrake.net | homelab-grafana | 3000 | `/api/health` | ✅ Active |
| dns.evindrake.net | dns-manager | 8001 | `/health` | ✅ Active |
| scarletredjoker.com | scarletredjoker-web | 80 | - | ✅ Static |
| www.scarletredjoker.com | → redirect | - | - | ✅ Redirect |
| game.evindrake.net | → redirect | - | - | ✅ Redirect |

### Local-Proxied Services (Routed through Linode Caddy)

| Domain | Target | Port | Notes |
|--------|--------|------|-------|
| plex.evindrake.net | 10.200.0.2 | 32400 | WireGuard tunnel |
| home.evindrake.net | 10.200.0.2 | 8123 | WireGuard tunnel |

---

## 2. LINODE CLOUD SERVER (host.evindrake.net)

### All Container Services

| Container | Image | Internal Port | Purpose |
|-----------|-------|---------------|---------|
| caddy | caddy:2-alpine | 80, 443 | Reverse proxy + SSL |
| homelab-redis | redis:7-alpine | 6379 | Cache/message broker |
| homelab-postgres | postgres:16-alpine | 5432 | PostgreSQL database |
| homelab-dashboard | custom Flask | 5000 | Main dashboard |
| homelab-celery-worker | custom | - | Background tasks |
| discord-bot | custom Node.js | 4000 | Discord Ticket Bot |
| stream-bot | custom Node.js | 5000 | Multi-platform Stream Bot |
| n8n | n8n:latest | 5678 | Workflow automation |
| code-server | linuxserver/code-server | 8443 | VS Code in browser |
| code-server-proxy | nginx:alpine | 8080 | WebSocket proxy |
| scarletredjoker-web | nginx:alpine | 80 | Static site |
| rig-city-site | nginx:alpine | 80 | Static site |
| homelab-prometheus | prom/prometheus:v2.47.0 | 9090 | Metrics collection |
| homelab-grafana | grafana/grafana:10.2.0 | 3000 | Dashboards |
| homelab-loki | grafana/loki:2.9.2 | 3100 | Log aggregation |
| homelab-node-exporter | prom/node-exporter:v1.6.1 | 9100 | Host metrics |
| homelab-cadvisor | gcr.io/cadvisor/cadvisor | 8080 | Container metrics |
| dns-manager | custom Python | 8001 | Cloudflare DNS automation |

### Required Environment Variables

```bash
# ━━━ CORE INFRASTRUCTURE (REQUIRED) ━━━
POSTGRES_PASSWORD=<openssl rand -hex 32>
DISCORD_DB_PASSWORD=<openssl rand -hex 24>
STREAMBOT_DB_PASSWORD=<openssl rand -hex 24>
JARVIS_DB_PASSWORD=<openssl rand -hex 24>

# ━━━ AUTHENTICATION & SECURITY (REQUIRED) ━━━
SERVICE_AUTH_TOKEN=<openssl rand -hex 32>
WEB_USERNAME=admin
WEB_PASSWORD=<secure-password>

# ━━━ AI SERVICES (REQUIRED) ━━━
OPENAI_API_KEY=sk-<your-key>

# ━━━ DISCORD BOT (REQUIRED) ━━━
DISCORD_BOT_TOKEN=<bot-token>
DISCORD_CLIENT_ID=<client-id>
DISCORD_CLIENT_SECRET=<client-secret>
# Auto-derived from DISCORD_CLIENT_ID:
# DISCORD_APP_ID
# VITE_DISCORD_CLIENT_ID
DISCORD_SESSION_SECRET=<openssl rand -hex 32>

# ━━━ STREAM BOT (REQUIRED) ━━━
TWITCH_CLIENT_ID=<twitch-client-id>
TWITCH_CLIENT_SECRET=<twitch-client-secret>
STREAMBOT_SESSION_SECRET=<openssl rand -hex 32>

# ━━━ STREAM BOT (OPTIONAL) ━━━
YOUTUBE_CLIENT_ID=<youtube-client-id>
YOUTUBE_CLIENT_SECRET=<youtube-client-secret>
SPOTIFY_CLIENT_ID=<spotify-client-id>
SPOTIFY_CLIENT_SECRET=<spotify-client-secret>
KICK_CLIENT_ID=<kick-client-id>
KICK_CLIENT_SECRET=<kick-client-secret>

# ━━━ CODE SERVER (REQUIRED) ━━━
CODE_SERVER_PASSWORD=<code-server-password>

# ━━━ N8N (OPTIONAL) ━━━
N8N_BASIC_AUTH_USER=<username>
N8N_BASIC_AUTH_PASSWORD=<password>

# ━━━ MONITORING (REQUIRED) ━━━
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=<secure-password>

# ━━━ DNS MANAGEMENT (REQUIRED) ━━━
CLOUDFLARE_API_TOKEN=<cloudflare-token>
# Optional zone IDs (auto-discovered if token has Zone.Zone:Read):
# CLOUDFLARE_ZONE_EVINDRAKE=
# CLOUDFLARE_ZONE_RIGCITY=
# CLOUDFLARE_ZONE_SCARLETREDJOKER=

# ━━━ LOCAL SERVICES ACCESS (OPTIONAL) ━━━
TAILSCALE_LOCAL_HOST=10.200.0.2
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

# Validate environment
./scripts/validate-env.sh

# Check logs
docker compose logs -f --tail=50

# Restart all services
docker compose down && docker compose up -d

# Test health endpoints
curl -I https://dashboard.evindrake.net/health
curl -I https://bot.evindrake.net/health
curl -I https://stream.evindrake.net/health
curl -I https://grafana.evindrake.net/api/health
```

---

## 3. LOCAL UBUNTU HOST (10.200.0.2 via WireGuard)

### Docker Services (deploy/local/docker-compose.yml)

| Container | Port | Domain | Health |
|-----------|------|--------|--------|
| caddy-local | 80, 443 | - | ✅ Up |
| homelab-minio | 9000, 9001 | - | ✅ Healthy |
| homeassistant | 8123 | home.evindrake.net | ✅ Healthy |
| plex | 32400 | plex.evindrake.net | ✅ Up |

### DDNS Configuration

Dynamic DNS is configured via one of these methods:
- **Cron Script**: `/opt/homelab/scripts/cloudflare-ddns.sh` (runs every 5 minutes)
- **Docker Container**: `docker-compose.ddns.yml` (optional separate stack)

See `docs/deploy/FULL_DEPLOYMENT_GUIDE.md` Section 14 for DDNS setup options.

### Native Services

| Service | Port | Status |
|---------|------|--------|
| Plex Media Server | 32400 | ✅ Running |
| WireGuard VPN | 51820 | ✅ Connected |
| Tailscale | - | ✅ Active |

### NAS Integration

| Component | Value |
|-----------|-------|
| NAS Model | Zyxel NAS326 |
| NAS IP | 192.168.0.176 |
| Protocol | NFS |
| Mount Path | `/mnt/nas/networkshare` |
| Media Folders | video, music, photo, games |

---

## 4. WINDOWS 11 VM (192.168.122.250)

### GameStream Status

| Component | Status |
|-----------|--------|
| Sunshine | ✅ Running (1080p@60Hz) |
| GPU Passthrough | ✅ RTX 3060 working |
| Moonlight Pairing | ✅ Complete |
| Port Forwarding | ✅ iptables configured |
| Tailscale | ✅ 100.118.44.102 |

---

## 5. NETWORK TOPOLOGY

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
    │ - Prometheus        │  │                │
    │ - Grafana           │  │                │
    │ - DNS Manager       │  │                │
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

## 6. DOMAIN CONFIGURATION

### rig-city.com (Cloudflare)
| Record | Type | Target | Proxied |
|--------|------|--------|---------|
| @ | A | Linode IP | Yes |
| www | CNAME | @ | Yes |
| bot | A | Linode IP | Yes |
| stream | A | Linode IP | Yes |

### evindrake.net (Cloudflare)
| Record | Type | Target | Proxied |
|--------|------|--------|---------|
| host | A | Linode IP | Yes |
| dashboard | A | Linode IP | Yes |
| n8n | A | Linode IP | Yes |
| code | A | Linode IP | Yes |
| grafana | A | Linode IP | Yes |
| dns | A | Linode IP | Yes |
| plex | A | Local IP (DDNS) | No |
| home | A | Local IP (DDNS) | No |
| game | A | Linode IP | Yes |

### scarletredjoker.com (Cloudflare)
| Record | Type | Target | Proxied |
|--------|------|--------|---------|
| @ | A | Linode IP | Yes |
| www | CNAME | @ | Yes |

---

## 7. QUICK VERIFICATION COMMANDS

### Test All Domains (Run from Linode)
```bash
#!/bin/bash
DOMAINS=(
    "https://dashboard.evindrake.net"
    "https://bot.evindrake.net"
    "https://stream.evindrake.net"
    "https://rig-city.com"
    "https://scarletredjoker.com"
    "https://n8n.evindrake.net"
    "https://code.evindrake.net"
    "https://grafana.evindrake.net"
    "https://dns.evindrake.net"
)

for domain in "${DOMAINS[@]}"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$domain" --max-time 10)
    echo "$domain: $status"
done
```

### Container Health Check
```bash
cd /opt/homelab/HomeLabHub/deploy/linode
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Health}}"
```

### WireGuard Connectivity
```bash
# From Linode
ping -c 3 10.200.0.2

# From Local Ubuntu
ping -c 3 10.200.0.1
```

---

## 8. DEPLOYMENT WORKFLOW

### Smart Environment Sync
```bash
# On Linode - merge new vars without losing existing values
cd /opt/homelab/HomeLabHub
./homelab sync-env

# Validate all required variables
./deploy/linode/scripts/validate-env.sh

# Deploy with pre-flight checks
./deploy/linode/scripts/deploy.sh
```

### Full Pipeline
```bash
# Auto-detects role (local/cloud) and runs all checks
./homelab pipeline
```

### Post-Deployment Smoke Test
```bash
# Quick validation after deployment (< 30 seconds)
./deploy/linode/scripts/smoke-test.sh

# Auto-restart failed services
./deploy/linode/scripts/smoke-test.sh --auto-fix

# JSON output for CI/CD integration
./deploy/linode/scripts/smoke-test.sh --json

# Minimal output (pass/fail only)
./deploy/linode/scripts/smoke-test.sh --quiet
```

The smoke test validates:
- **Infrastructure**: PostgreSQL, Redis, Caddy
- **Core Services**: Dashboard, Grafana, n8n, Code Server  
- **Bots**: Discord Bot, Stream Bot
- **Static Sites**: rig-city.com, scarletredjoker.com
- **Utilities**: DNS Manager, Prometheus, Loki

Exit codes:
- `0` - All tests passed
- `1` - One or more tests failed
- `2` - Critical infrastructure failure

---

## 9. MONITORING & OBSERVABILITY

| Tool | URL | Purpose |
|------|-----|---------|
| Grafana | https://grafana.evindrake.net | Dashboards |
| Prometheus | http://localhost:9090 (internal) | Metrics |
| Loki | http://localhost:3100 (internal) | Logs |
| DNS Manager | https://dns.evindrake.net | DNS automation |

---

## 10. TROUBLESHOOTING

### Service Won't Start
```bash
# Check container logs
docker compose logs <service-name> --tail=100

# Check health status
docker inspect <container-name> --format='{{.State.Health}}'

# Force rebuild
docker compose build --no-cache <service-name>
docker compose up -d <service-name>
```

### Domain Not Resolving
```bash
# Check DNS propagation
dig +short <domain>

# Check Caddy certificates
docker compose exec caddy caddy list-certificates

# Check Caddy logs
docker compose logs caddy --tail=50
```

### WireGuard Issues
```bash
# Check WireGuard status
sudo wg show

# Check peer connectivity
sudo wg show wg0 | grep -A4 "peer"

# Restart WireGuard
sudo systemctl restart wg-quick@wg0
```
