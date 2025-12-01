# HomeLabHub Complete Deployment Guide

A step-by-step walkthrough to deploy your homelab from zero to production across Linode cloud and local Ubuntu host.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Accounts](#2-prerequisites--accounts)
3. [Cloudflare DNS Configuration](#3-cloudflare-dns-configuration)
4. [Tailscale VPN Setup](#4-tailscale-vpn-setup)
5. [Linode Cloud Deployment](#5-linode-cloud-deployment)
6. [Local Ubuntu Deployment](#6-local-ubuntu-deployment)
7. [OAuth App Configuration](#7-oauth-app-configuration)
8. [Email Setup (SendGrid)](#8-email-setup-sendgrid)
9. [Database Initialization](#9-database-initialization)
10. [Post-Deployment Verification](#10-post-deployment-verification)
11. [Daily Management](#11-daily-management)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Architecture Overview

```
                         INTERNET
                            |
          +-----------------+------------------+
          |                                    |
          v                                    v
+---------------------+        +---------------------------+
|   LINODE SERVER     |        |   LOCAL UBUNTU HOST       |
|   ($24/month)       |<======>|   (Gaming Priority)       |
|                     | TAIL-  |                           |
| - Dashboard         | SCALE  | - Plex Media Server       |
| - Discord Bot       |  VPN   | - Home Assistant          |
| - Stream Bot        |        | - MinIO Storage           |
| - PostgreSQL        |        | - Sunshine GameStream     |
| - Redis             |        |                           |
| - n8n Automation    |        | Resources freed:          |
| - Code-Server       |        | ~6-8 GB RAM               |
| - Caddy (SSL)       |        | 4-6 CPU cores             |
+---------------------+        +---------------------------+
```

**Why Split Architecture?**
- Discord/Twitch webhooks need 24/7 cloud availability
- Plex/GameStream need local GPU access
- Your gaming PC stays fast (no background services)
- Separate failure domains

---

## 2. Prerequisites & Accounts

### Required Accounts

| Account | Purpose | URL | Cost |
|---------|---------|-----|------|
| Cloudflare | DNS management | https://cloudflare.com | Free |
| Linode | Cloud server | https://linode.com | $24/mo |
| Tailscale | VPN mesh | https://tailscale.com | Free |
| OpenAI | Jarvis AI | https://platform.openai.com | Pay-as-you-go |
| Discord | Bot hosting | https://discord.com/developers | Free |
| Twitch | Stream bot | https://dev.twitch.tv | Free |
| Google Cloud | YouTube/Calendar | https://console.cloud.google.com | Free |
| Spotify | Music integration | https://developer.spotify.com | Free |
| GitHub | Repository | https://github.com | Free |

### Hardware Requirements

**Linode Server** (Shared CPU - Linode 4GB recommended)
- 2 vCPU cores
- 4 GB RAM
- 80 GB SSD
- Ubuntu 22.04 LTS

**Local Ubuntu Host**
- Ubuntu 22.04+ (or 24.04/25.10)
- 16+ GB RAM recommended
- NVIDIA GPU (for Plex transcoding & Sunshine)
- Sufficient storage for media

### Your Domains

Based on your Cloudflare setup, you have:
- `evindrake.com` - General use
- `evindrake.net` - Infrastructure services
- `rig-city.com` - Bot and streaming services
- `scarletredjoker.com` - Static website

---

## 3. Cloudflare DNS Configuration

### 3.1 Domain Overview

| Domain | Primary Use |
|--------|-------------|
| `evindrake.net` | Dashboard, n8n, Code-Server, Plex, Home Assistant |
| `rig-city.com` | Discord Bot, Stream Bot |
| `scarletredjoker.com` | Static portfolio site |
| `evindrake.com` | Email/SendGrid, general |

### 3.2 Required DNS Records

Go to **Cloudflare > DNS > Records** for each domain.

**IMPORTANT**: Set Proxy to **DNS only** (gray cloud) for all records - Caddy handles SSL directly.

#### evindrake.net (Infrastructure)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `YOUR_LINODE_IP` | DNS only |
| A | `dash` | `YOUR_LINODE_IP` | DNS only |
| A | `n8n` | `YOUR_LINODE_IP` | DNS only |
| A | `code` | `YOUR_LINODE_IP` | DNS only |
| A | `plex` | `YOUR_LINODE_IP` | DNS only |
| A | `home` | `YOUR_LINODE_IP` | DNS only |
| A | `vnc` | `YOUR_LINODE_IP` | DNS only |

#### rig-city.com (Bots)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `YOUR_LINODE_IP` | DNS only |
| A | `bot` | `YOUR_LINODE_IP` | DNS only |
| A | `stream` | `YOUR_LINODE_IP` | DNS only |

#### scarletredjoker.com (Static Site)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `YOUR_LINODE_IP` | DNS only |
| A | `www` | `YOUR_LINODE_IP` | DNS only |

### 3.3 SSL/TLS Settings (All Domains)

1. Go to **SSL/TLS > Overview**
2. Set encryption mode to **Full** (not Full Strict, since Caddy generates its own certs)
3. Go to **SSL/TLS > Edge Certificates**
4. Enable **Always Use HTTPS**

### 3.4 Verify DNS Propagation

```bash
# Test from any computer
nslookup dash.evindrake.net
nslookup bot.rig-city.com
nslookup scarletredjoker.com

# All should return your Linode IP
```

---

## 4. Tailscale VPN Setup

Tailscale creates a secure mesh VPN between your Linode and local host.

### 4.1 Create Tailscale Account

1. Go to https://login.tailscale.com
2. Sign up (Google, GitHub, or email)
3. Go to **Settings > Keys**
4. Click **Generate auth key**
   - Reusable: Yes
   - Ephemeral: No
   - Expiration: 90 days
5. **Copy and save this key** - you'll need it on both servers

### 4.2 Install on Linode

```bash
ssh root@YOUR_LINODE_IP

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect (replace with your auth key)
sudo tailscale up --authkey=tskey-auth-XXXXX --hostname=homelab-linode

# Get your Tailscale IP
tailscale ip -4
# Example: 100.64.0.1
```

### 4.3 Install on Local Ubuntu

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect
sudo tailscale up --authkey=tskey-auth-XXXXX --hostname=homelab-local

# Get your Tailscale IP
tailscale ip -4
# Example: 100.64.0.2
```

### 4.4 Verify Connection

```bash
# From Linode, ping local host
ping 100.64.0.2

# From local, ping Linode
ping 100.64.0.1

# Check status
tailscale status
```

**Note these IPs!**
- Linode Tailscale IP: `100.64.0.1` (example)
- Local Tailscale IP: `100.64.0.2` (example)

---

## 5. Linode Cloud Deployment

### 5.1 Create Linode Server

1. Log into https://cloud.linode.com
2. Click **Create Linode**
3. Select:
   - **Image**: Ubuntu 22.04 LTS
   - **Region**: Closest to you (e.g., Newark, Atlanta)
   - **Plan**: Shared CPU - Linode 4GB ($24/month)
   - **Label**: `homelab-cloud`
   - **Root Password**: Strong password (save it!)
4. Click **Create Linode**
5. Note the **public IP address**

### 5.2 Initial Server Setup

```bash
# SSH into Linode
ssh root@YOUR_LINODE_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Verify
docker --version
docker compose version
```

### 5.3 Clone Repository

```bash
mkdir -p /opt/homelab
cd /opt/homelab
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub
```

### 5.4 Configure Environment

```bash
# Create .env from template
cp .env.example .env
chmod 600 .env

# Edit with your values
nano .env
```

**Required .env values for Linode:**

```bash
# Core (generate with: openssl rand -hex 16)
POSTGRES_PASSWORD=YOUR_GENERATED_PASSWORD
DISCORD_DB_PASSWORD=YOUR_GENERATED_PASSWORD
STREAMBOT_DB_PASSWORD=YOUR_GENERATED_PASSWORD
JARVIS_DB_PASSWORD=YOUR_GENERATED_PASSWORD

# Dashboard login
WEB_USERNAME=admin
WEB_PASSWORD=YOUR_SECURE_PASSWORD

# Session secrets (generate with: openssl rand -hex 32)
SESSION_SECRET=YOUR_64_CHAR_HEX
SECRET_KEY=YOUR_64_CHAR_HEX

# AI (required for Jarvis)
OPENAI_API_KEY=sk-proj-YOUR_KEY

# Discord Bot (from Discord Developer Portal)
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_SECRET

# Cross-host routing (YOUR LOCAL HOST's Tailscale IP)
LOCAL_TAILSCALE_IP=100.64.0.2

# Code Server
CODE_SERVER_PASSWORD=YOUR_PASSWORD
```

**Quick secret generation:**
```bash
# Generate 16-char password
openssl rand -hex 16

# Generate 32-char session secret
openssl rand -hex 32
```

### 5.5 Run Bootstrap

```bash
# Make executable and run
chmod +x deploy/scripts/bootstrap.sh
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

Or deploy manually:
```bash
docker compose up -d
```

### 5.6 Verify Deployment

```bash
# Check all containers are running
docker compose ps

# Should show healthy:
# - caddy
# - homelab-postgres
# - homelab-redis
# - homelab-dashboard
# - discord-bot
# - stream-bot
# - n8n
# - code-server

# Check logs for errors
docker compose logs -f --tail=100
```

---

## 6. Local Ubuntu Deployment

### 6.1 Install Prerequisites

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker compose version
```

### 6.2 Clone Repository

```bash
cd /home/$USER/contain
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub
```

### 6.3 Configure Environment

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

**Required .env values for Local:**

```bash
# MinIO Storage
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=YOUR_MINIO_PASSWORD

# Plex (get claim from https://plex.tv/claim - expires in 4 minutes!)
PLEX_CLAIM=claim-XXXXX
PLEX_MEDIA_PATH=/path/to/your/media

# Sunshine GameStream
SUNSHINE_USER=admin
SUNSHINE_PASS=YOUR_SUNSHINE_PASSWORD

# Linode's Tailscale IP (for cross-host connections)
LINODE_TAILSCALE_IP=100.64.0.1
```

### 6.4 Prepare Directories

```bash
# Create media directories
sudo mkdir -p /data/plex/media
sudo chown -R $USER:$USER /data/plex

# NAS mount point (if using)
sudo mkdir -p /mnt/nas
```

### 6.5 Run Bootstrap

```bash
./deploy/scripts/bootstrap.sh --role local
```

Or deploy manually:
```bash
docker compose -f compose.local.yml up -d
```

### 6.6 Verify Deployment

```bash
docker compose -f compose.local.yml ps

# Should show:
# - homelab-minio
# - plex-server
# - homeassistant
# - sunshine-gamestream
```

---

## 7. OAuth App Configuration

### 7.1 Discord Application

1. Go to https://discord.com/developers/applications
2. Click **New Application** → Name: "HomeLabHub Bot"
3. Go to **Bot** section:
   - Click **Add Bot**
   - Copy **Token** → `DISCORD_BOT_TOKEN`
   - Enable intents: Presence, Server Members, Message Content
4. Go to **OAuth2 > General**:
   - Copy **Client ID** → `DISCORD_CLIENT_ID`
   - Copy **Client Secret** → `DISCORD_CLIENT_SECRET`
   - Add Redirect URL: `https://bot.rig-city.com/auth/discord/callback`

### 7.2 Twitch Application

1. Go to https://dev.twitch.tv/console/apps
2. Click **Register Your Application**
3. Fill in:
   - **Name**: HomeLabHub Stream Bot
   - **OAuth Redirect URL**: `https://stream.rig-city.com/api/auth/twitch/callback`
   - **Category**: Chat Bot
4. Copy **Client ID** → `TWITCH_CLIENT_ID`
5. Generate **Client Secret** → `TWITCH_CLIENT_SECRET`

### 7.3 Google Cloud (YouTube/Calendar/Gmail)

1. Go to https://console.cloud.google.com
2. Create new project: "HomeLabHub"
3. **APIs & Services > Library** - Enable:
   - YouTube Data API v3
   - Google Calendar API
   - Gmail API
4. **APIs & Services > OAuth consent screen**:
   - User Type: External
   - App name: HomeLabHub
   - Add scopes for YouTube, Calendar, Gmail
5. **APIs & Services > Credentials**:
   - Create OAuth 2.0 Client ID
   - Type: Web application
   - Redirect URIs:
     - `https://stream.rig-city.com/api/auth/youtube/callback`
     - `https://dash.evindrake.net/api/google/callback`
6. Copy **Client ID** → `YOUTUBE_CLIENT_ID`
7. Copy **Client Secret** → `YOUTUBE_CLIENT_SECRET`

### 7.4 Spotify Application

1. Go to https://developer.spotify.com/dashboard
2. Click **Create App**
3. Fill in:
   - **App name**: HomeLabHub Stream Bot
   - **Redirect URI**: `https://stream.rig-city.com/api/auth/spotify/callback`
4. Copy **Client ID** → `SPOTIFY_CLIENT_ID`
5. Copy **Client Secret** → `SPOTIFY_CLIENT_SECRET`

### 7.5 Update .env and Restart

After creating all OAuth apps:
```bash
nano /opt/homelab/HomeLabHub/.env
# Add all OAuth credentials

docker compose down
docker compose up -d
```

---

## 8. Email Setup (SendGrid)

If you want to send emails from the dashboard (notifications, alerts):

### 8.1 Create SendGrid Account

1. Go to https://sendgrid.com and sign up
2. Verify your email address

### 8.2 Authenticate Your Domain

1. Go to **Settings > Sender Authentication**
2. Click **Authenticate Your Domain**
3. Select DNS host: Cloudflare
4. Enter domain: `evindrake.com`

### 8.3 Add DNS Records in Cloudflare

SendGrid will provide CNAME records. Add them to Cloudflare:

**CRITICAL**: Set Proxy to **DNS only** (gray cloud) - SendGrid validation fails with proxied records!

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | `em2867` | `u57667222.wl223.sendgrid.net` | **DNS only** |
| CNAME | `s1._domainkey` | `s1.domainkey.u57667222.wl223.sendgrid.net` | **DNS only** |
| CNAME | `s2._domainkey` | `s2.domainkey.u57667222.wl223.sendgrid.net` | **DNS only** |
| CNAME | `url3286` | `sendgrid.net` | **DNS only** |
| CNAME | `57667222` | `sendgrid.net` | **DNS only** |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DNS only |

### 8.4 Wait for Verification

DNS propagation can take up to 48 hours. Check status in SendGrid dashboard.

### 8.5 Get API Key

1. Go to **Settings > API Keys**
2. Click **Create API Key**
3. Name: "HomeLabHub"
4. Permissions: Full Access (or restricted to Mail Send)
5. Copy the key → `SENDGRID_API_KEY`

### 8.6 Update .env

```bash
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxx
EMAIL_FROM=noreply@evindrake.com
```

---

## 9. Database Initialization

### 9.1 Automatic Initialization

The bootstrap script creates databases automatically via `config/postgres-init/` scripts.

### 9.2 Verify Databases

```bash
docker exec -it homelab-postgres psql -U postgres

# List databases
\l

# Expected databases:
# - postgres (default)
# - ticketbot (Discord bot)
# - streambot (Stream bot)
# - homelab_jarvis (Jarvis AI)

# Exit
\q
```

### 9.3 Run Migrations

```bash
# Dashboard migrations
docker exec homelab-dashboard flask db upgrade

# Or use homelab script
./homelab db migrate
```

---

## 10. Post-Deployment Verification

### 10.1 Service Access Checklist

Open each URL in your browser:

| Service | URL | Expected |
|---------|-----|----------|
| Dashboard | https://dash.evindrake.net | Login page |
| Discord Bot | https://bot.rig-city.com | Bot dashboard |
| Stream Bot | https://stream.rig-city.com | Stream dashboard |
| n8n | https://n8n.evindrake.net | n8n login |
| Code Server | https://code.evindrake.net | VS Code |
| Plex | https://plex.evindrake.net | Plex Web |
| Home Assistant | https://home.evindrake.net | HA dashboard |
| Static Site | https://scarletredjoker.com | Website |

### 10.2 Cross-Host Routing Test

From Linode, verify local services are reachable:
```bash
curl -I http://100.64.0.2:32400   # Plex
curl -I http://100.64.0.2:8123    # Home Assistant
curl -I http://100.64.0.2:47990   # Sunshine
```

### 10.3 Discord Bot Test

1. Generate invite URL:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
   ```
2. Invite to your server
3. Test commands: `/ping`, `/ticket`

### 10.4 Health Check

```bash
cd /opt/homelab/HomeLabHub
./homelab health
./homelab status
```

---

## 11. Daily Management

### Linode Commands

```bash
cd /opt/homelab/HomeLabHub

./homelab status          # Check all services
./homelab health          # Health check
./homelab logs            # View all logs
./homelab logs dashboard  # Specific service logs
./homelab restart         # Restart all
./homelab restart caddy   # Restart one service
./homelab db backup       # Backup database
```

### Local Ubuntu Commands

```bash
cd /home/$USER/contain/HomeLabHub

docker compose -f compose.local.yml ps        # Status
docker compose -f compose.local.yml logs -f   # Follow logs
docker compose -f compose.local.yml restart   # Restart
```

### Update Deployment

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

---

## 12. Troubleshooting

### Container Not Starting

```bash
# Check container logs
docker logs container-name

# Check if port is in use
netstat -tlnp | grep PORT

# Restart specific container
docker compose restart container-name
```

### SSL Certificate Issues

```bash
# Check Caddy logs
docker logs caddy

# Common fixes:
# 1. Verify DNS points to Linode IP
# 2. Ensure ports 80/443 are open
# 3. Wait for DNS propagation

# Force renewal
docker compose restart caddy
```

### Cross-Host Routing Not Working

```bash
# 1. Verify Tailscale connection
tailscale status

# 2. Check LOCAL_TAILSCALE_IP in .env
grep LOCAL_TAILSCALE_IP .env

# 3. Test connectivity
ping 100.64.0.2

# 4. Restart Caddy
docker compose restart caddy
```

### Database Connection Errors

```bash
# Check PostgreSQL status
docker logs homelab-postgres

# Verify databases exist
docker exec homelab-postgres psql -U postgres -c "\l"

# Check connection string
grep DATABASE_URL .env
```

### Empty Logs

```bash
# Ensure containers are running
docker compose ps

# View recent logs
docker compose logs --tail=100
```

### SendGrid DNS Validation Failing

1. In Cloudflare, ensure all SendGrid CNAME records have **Proxy: DNS only** (gray cloud)
2. Wait up to 48 hours for propagation
3. Re-verify in SendGrid dashboard

### Reset Everything

```bash
# Nuclear option - removes all data!
docker compose down -v
docker system prune -a

# Re-deploy
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

---

## Quick Reference

### Generate Secrets
```bash
openssl rand -hex 16   # 16-char password
openssl rand -hex 32   # 32-char session secret
```

### Tailscale
```bash
tailscale status       # Check connections
tailscale ip -4        # Get Tailscale IP
sudo tailscale up      # Reconnect
```

### Service URLs

| Service | URL |
|---------|-----|
| Dashboard | https://dash.evindrake.net |
| Discord Bot | https://bot.rig-city.com |
| Stream Bot | https://stream.rig-city.com |
| n8n | https://n8n.evindrake.net |
| Code Server | https://code.evindrake.net |
| Plex | https://plex.evindrake.net |
| Home Assistant | https://home.evindrake.net |

---

## Summary Checklist

- [ ] Linode server created with Ubuntu 22.04
- [ ] Cloudflare DNS configured (all 4 domains)
- [ ] DNS proxy OFF (gray cloud) for all records
- [ ] Tailscale installed and connected on both servers
- [ ] Tailscale IPs noted and added to .env
- [ ] Linode .env configured with all secrets
- [ ] Cloud services deployed and healthy
- [ ] Local .env configured  
- [ ] Local services deployed and healthy
- [ ] Discord OAuth app created
- [ ] Twitch OAuth app created
- [ ] Google Cloud project with APIs enabled
- [ ] Spotify OAuth app created
- [ ] SendGrid domain verified (if using email)
- [ ] All services accessible via HTTPS
- [ ] Cross-host routing working
- [ ] Discord bot responding

**Your homelab is now fully operational!**

Dashboard: https://dash.evindrake.net
