# Nebula Command - Split Deployment Guide

> **See Full Guide**: For complete step-by-step instructions, see:
> **[docs/deploy/FULL_DEPLOYMENT_GUIDE.md](../docs/deploy/FULL_DEPLOYMENT_GUIDE.md)**

---

This guide explains how to split your homelab between your local Ubuntu gaming machine and a Linode cloud server for optimal game streaming performance.

## Architecture Overview

```
                    INTERNET
                       │
        ┌──────────────┴──────────────┐
        │                             │
        ▼                             ▼
┌───────────────────┐    ┌───────────────────────┐
│   LINODE SERVER   │    │   LOCAL UBUNTU HOST   │
│   ($20-40/month)  │◄───│   (Gaming Priority)   │
│                   │ T  │                       │
│ • Discord Bot     │ A  │ • Plex Media Server   │
│ • Stream Bot      │ I  │ • Home Assistant      │
│ • Dashboard       │ L  │ • MinIO (NAS)         │
│ • PostgreSQL      │ S  │ • VNC Desktop         │
│ • Redis           │ C  │                       │
│ • n8n             │ A  │ Resources freed:      │
│ • Code-Server     │ L  │ ~6-8 GB RAM           │
│ • Static Sites    │ E  │ 4-6 CPU cores         │
│ • Caddy           │    │                       │
└───────────────────┘    └───────────────────────┘
```

## Quick Start

### 1. Provision Linode Server

```bash
# Recommended: Linode 4GB Nanode ($20/mo) or 8GB ($40/mo)
# OS: Ubuntu 22.04 LTS
# Region: Choose closest to you for low latency
```

### 2. Run Bootstrap on Linode

```bash
# SSH into your new Linode
ssh root@your-linode-ip

# Download and run bootstrap
curl -fsSL https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/scripts/bootstrap-linode.sh | bash
```

### 3. Set Up Tailscale VPN (Both Machines)

```bash
# On BOTH Linode and Local:
./deploy/scripts/setup-tailscale.sh

# Note down the Tailscale IPs for each machine
tailscale ip -4
```

### 4. Migrate Database

```bash
# On your LOCAL machine:
LINODE_HOST=<linode-tailscale-ip> \
LINODE_PG_PASSWORD=<password> \
./deploy/scripts/migrate-database.sh
```

### 5. Configure Local Machine

```bash
# On LOCAL machine:
./deploy/scripts/bootstrap-local.sh

# Stop cloud services from running locally
cd ~/contain/HomeLabHub
docker compose stop discord-bot stream-bot homelab-dashboard \
    homelab-celery-worker homelab-postgres redis n8n \
    code-server code-server-proxy scarletredjoker-web rig-city-site
```

### 6. Update DNS Records

In Cloudflare (or your DNS provider), update these A records:

**Point to Linode IP:**
- `bot.rig-city.com`
- `stream.rig-city.com`
- `rig-city.com`
- `www.rig-city.com`
- `dashboard.evindrake.net`
- `host.evindrake.net`
- `n8n.evindrake.net`
- `code.evindrake.net`
- `scarletredjoker.com`
- `www.scarletredjoker.com`

**Keep pointing to Local IP:**
- `plex.evindrake.net`
- `vnc.evindrake.net`
- `home.evindrake.net`
- `game.evindrake.net`

### 7. Start Services

```bash
# On LINODE:
cd /opt/homelab
docker compose up -d

# On LOCAL:
cd ~/contain/HomeLabLocal
docker compose up -d
```

## Directory Structure

```
deploy/
├── linode/
│   ├── docker-compose.yml    # Cloud services
│   └── Caddyfile             # Cloud reverse proxy
├── local/
│   ├── docker-compose.yml    # Local services
│   └── Caddyfile             # Local reverse proxy
├── scripts/
│   ├── bootstrap-linode.sh   # Linode server setup
│   ├── bootstrap-local.sh    # Local host setup
│   ├── migrate-database.sh   # DB migration helper
│   └── setup-tailscale.sh    # VPN mesh setup
└── README.md                 # This file
```

## Service Distribution

### Linode Cloud Services
| Service | Domain | Port |
|---------|--------|------|
| Discord Bot | bot.rig-city.com | 4000 |
| Stream Bot | stream.rig-city.com | 5000 |
| Dashboard | dashboard.evindrake.net | 5000 |
| n8n | n8n.evindrake.net | 5678 |
| Code Server | code.evindrake.net | 8443 |
| PostgreSQL | (internal) | 5432 |
| Redis | (internal) | 6379 |
| Static Sites | rig-city.com, scarletredjoker.com | 80 |

### Local Services
| Service | Domain | Port |
|---------|--------|------|
| Plex | plex.evindrake.net | 32400 |
| Home Assistant | home.evindrake.net | 8123 |
| VNC | vnc.evindrake.net | 6080 |
| MinIO | (internal) | 9000/9001 |

## Tailscale Configuration

Tailscale creates a secure mesh VPN between your machines:

1. **Install on both machines**: `curl -fsSL https://tailscale.com/install.sh | sh`
2. **Authenticate**: `sudo tailscale up`
3. **Get IPs**: `tailscale ip -4`
4. **Tag machines**: In Tailscale admin, tag both as `homelab`

The Linode dashboard can manage local Docker containers via the Tailscale connection.

## Monitoring

### Check Service Health

```bash
# On Linode:
docker compose ps
docker compose logs --tail 50 discord-bot

# On Local:
docker compose ps
docker compose logs --tail 50 plex
```

### Resource Monitoring

```bash
# Check freed resources on local machine
free -h
htop
```

## Rollback Plan

If something goes wrong:

1. **Stop Linode services**: `docker compose down`
2. **Restore local services**: 
   ```bash
   cd ~/contain/HomeLabHub
   docker compose up -d
   ```
3. **Revert DNS** to local IP

## Cost Estimate

| Resource | Monthly Cost |
|----------|--------------|
| Linode 4GB Nanode | $20 |
| Linode 8GB (recommended) | $40 |
| Bandwidth (included) | $0 |
| **Total** | **$20-40/mo** |

## Benefits

- **~6-8 GB RAM freed** on local machine
- **4-6 CPU cores** no longer running background services  
- **Lower Discord/Twitch latency** (cloud-to-cloud)
- **Better OBS performance** for game streaming
- **Separate blast radius** - cloud issues don't affect local
