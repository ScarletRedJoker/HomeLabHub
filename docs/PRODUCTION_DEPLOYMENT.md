# Nebula Command - Production Deployment Guide

This guide walks you through deploying Nebula Command to production on your Linode server with connection to your homelab.

## Prerequisites

- Linode server with Ubuntu 22.04+ or Debian 12+
- SSH access to both Linode and homelab servers
- Domain names pointed to your Linode IP (via Cloudflare or similar)
- Tailscale account for secure homelab connectivity

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         LINODE SERVER                           │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Docker Compose Stack                                         ││
│  │  ├─ Caddy (Reverse Proxy + TLS)                             ││
│  │  ├─ PostgreSQL (Database)                                    ││
│  │  ├─ Redis (Cache)                                            ││
│  │  ├─ Dashboard (Next.js - Port 5000)                         ││
│  │  ├─ Discord Bot (Node.js - Port 4000)                       ││
│  │  ├─ Stream Bot (Node.js - Port 5000)                        ││
│  │  ├─ Prometheus + Grafana + Loki (Monitoring)                ││
│  │  └─ Tailscale (VPN to Homelab)                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                              │                                   │
│                    Tailscale VPN Mesh                           │
│                              │                                   │
└─────────────────────────────│───────────────────────────────────┘
                              │
┌─────────────────────────────│───────────────────────────────────┐
│                         HOMELAB SERVER                          │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  ├─ Plex (Media Server)                                     ││
│  │  ├─ Home Assistant (Automation)                             ││
│  │  ├─ Ollama (Local AI)                                       ││
│  │  ├─ Stable Diffusion (Image Generation)                     ││
│  │  └─ MinIO (Object Storage)                                  ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Initial Server Setup

### On Your Linode Server

```bash
# SSH into your Linode
ssh root@your-linode-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
apt install docker-compose-plugin -y

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --authkey=tskey-YOUR_AUTH_KEY
```

## Step 2: Clone Repository

```bash
# Create deployment directory
mkdir -p /opt/homelab
cd /opt/homelab

# Clone the repository
git clone https://github.com/yourusername/HomeLabHub.git
cd HomeLabHub/deploy/linode
```

## Step 3: Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_BOT_TOKEN` | Discord bot token from developer portal |
| `POSTGRES_PASSWORD` | PostgreSQL master password (auto-generated) |
| `SESSION_SECRET` | Session encryption key (auto-generated) |
| `SERVICE_AUTH_TOKEN` | Inter-service auth token (auto-generated) |

### Optional but Recommended

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | For AI features (Jarvis assistant) |
| `TAILSCALE_AUTHKEY` | Tailscale auth key for homelab connection |
| `TWITCH_CLIENT_ID/SECRET` | Twitch integration |
| `YOUTUBE_CLIENT_ID/SECRET` | YouTube integration |
| `CLOUDFLARE_API_TOKEN` | Automatic DNS management |

## Step 4: Configure Domains

Edit the Caddyfile to match your domains:

```bash
nano Caddyfile
```

Default domains:
- `evindrake.net` - Main dashboard
- `bot.evindrake.net` - Discord bot dashboard
- `stream.evindrake.net` - Stream bot dashboard
- `grafana.evindrake.net` - Monitoring dashboard

## Step 5: Verify Production Readiness

```bash
# Run production readiness check
./scripts/verify-production-ready.sh

# Run pre-flight checks
./scripts/preflight.sh
```

## Step 6: Deploy

```bash
# Dry run first
./scripts/deploy.sh --dry-run

# Full deployment
./scripts/deploy.sh
```

The deployment script will:
1. Create database backups
2. Pull and build Docker images
3. Start infrastructure (Caddy, PostgreSQL, Redis)
4. Initialize databases
5. Start application services
6. Run health checks
7. Execute smoke tests

## Step 7: Verify Deployment

```bash
# Check all containers
docker compose ps

# Check service health
./scripts/health-check.sh

# View logs
docker compose logs -f discord-bot
docker compose logs -f stream-bot
docker compose logs -f homelab-dashboard
```

## Step 8: Configure Discord Bot

1. Go to Discord Developer Portal
2. Ensure bot has required intents enabled:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent
3. Invite bot to your servers using OAuth2 URL generator
4. Set up slash commands: The bot auto-registers on startup

## Step 9: Configure Stream Bot

1. Navigate to `https://stream.evindrake.net`
2. Log in with Twitch/YouTube OAuth
3. Connect your streaming platforms
4. Configure fact posting intervals and triggers

## Maintenance Commands

```bash
# Update deployment
cd /opt/homelab/HomeLabHub && git pull
cd deploy/linode && ./scripts/deploy.sh

# Rollback to previous deployment
./scripts/rollback.sh

# View real-time logs
docker compose logs -f

# Restart specific service
docker compose restart discord-bot

# Database backup
docker exec homelab-postgres pg_dumpall -U postgres > backup.sql

# Check disk usage
docker system df
```

## Monitoring

- **Grafana**: `https://grafana.evindrake.net`
  - Pre-configured dashboards for all services
  - Log aggregation via Loki
  - Alerting rules for critical failures

- **Health Endpoints**:
  - Dashboard: `https://evindrake.net/api/health`
  - Discord Bot: `https://bot.evindrake.net/health`
  - Stream Bot: `https://stream.evindrake.net/health`

## Troubleshooting

### Service Won't Start

```bash
# Check container logs
docker compose logs service-name

# Check if ports are available
ss -tlnp | grep PORT

# Restart the service
docker compose restart service-name
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
docker compose ps homelab-postgres

# Test database connection
docker exec homelab-postgres psql -U postgres -l

# Re-run database initialization
docker exec homelab-postgres bash /docker-entrypoint-initdb.d/init-databases.sh
```

### SSL/TLS Certificate Issues

```bash
# Check Caddy logs
docker compose logs caddy

# Force certificate renewal
docker compose restart caddy
```

## Security Checklist

- [ ] All secrets are unique and strong (32+ characters)
- [ ] `.env` file is not committed to git
- [ ] SSH keys are properly secured (chmod 600)
- [ ] Firewall allows only ports 80, 443, and SSH
- [ ] Tailscale is configured for homelab access
- [ ] Regular backups are scheduled
- [ ] Monitoring alerts are configured

## Support

For issues or questions:
1. Check the logs first
2. Review this documentation
3. Check GitHub Issues
4. Contact the development team
