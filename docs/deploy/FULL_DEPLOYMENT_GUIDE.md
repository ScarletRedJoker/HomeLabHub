# HomeLabHub Deployment Guide

> **One document. Zero to production.**

---

## Quick Links

| I need to... | Go to... |
|-------------|----------|
| Deploy from scratch | [Start Here](#phase-1-accounts--prerequisites) |
| Set up OAuth apps | [Phase 4: OAuth Configuration](#phase-4-oauth-configuration) |
| Fix something | [Troubleshooting](#troubleshooting) |
| Daily management | [Operations](#daily-operations) |

---

## Executive Summary

**What you're building:**
- A split-architecture homelab with cloud services (always-on) and local services (GPU-intensive)
- Cloud (Linode $24/mo): Dashboard, Discord Bot, Stream Bot, Database, n8n, Code-Server
- Local (Your Ubuntu PC): Plex, Home Assistant, MinIO Storage, Sunshine GameStream

**Time to deploy:** ~2 hours from scratch

**Architecture:**
```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   LINODE CLOUD      │◄═══════►│   LOCAL UBUNTU      │
│   $24/month         │ Tailscale│   (Your PC)         │
│                     │   VPN    │                     │
│ • Dashboard         │         │ • Plex Media        │
│ • Discord Bot       │         │ • Home Assistant    │
│ • Stream Bot        │         │ • MinIO Storage     │
│ • PostgreSQL        │         │ • Sunshine Games    │
│ • Redis/n8n/Caddy   │         │                     │
└─────────────────────┘         └─────────────────────┘
```

---

## Credential Matrix

Before you start, know what you need. **Get accounts for the green rows first.**

### Required Credentials

| Credential | What It's For | Where to Get It | When Needed |
|------------|---------------|-----------------|-------------|
| **OpenAI API Key** | Jarvis AI, Discord bot AI | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Before Phase 3 |
| **Discord Bot Token** | Discord bot authentication | [discord.com/developers](https://discord.com/developers/applications) | Phase 4.1 |
| **Discord Client ID/Secret** | OAuth login | Same as above | Phase 4.1 |
| **Cloudflare Account** | DNS management | [cloudflare.com](https://cloudflare.com) | Phase 2 |
| **Tailscale Auth Key** | VPN between servers | [tailscale.com](https://login.tailscale.com/admin/settings/keys) | Phase 2 |
| **Linode Account** | Cloud server | [linode.com](https://cloud.linode.com) | Phase 3 |

### Optional Credentials (Add Later)

| Credential | What It Enables | Where to Get It |
|------------|-----------------|-----------------|
| Twitch Client ID/Secret | Stream bot Twitch integration | [dev.twitch.tv/console](https://dev.twitch.tv/console/apps) |
| YouTube OAuth | Stream bot YouTube integration | [console.cloud.google.com](https://console.cloud.google.com) |
| Spotify Client ID/Secret | Now playing in streams | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| SendGrid API Key | Email notifications | [sendgrid.com](https://sendgrid.com) |
| Cloudflare API Token | Auto DNS management | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) |
| Plex Token | Plex API access | [plex.tv/claim](https://plex.tv/claim) |

### Auto-Generated (Don't Worry About These)

The bootstrap script generates these automatically:
- Database passwords (POSTGRES_PASSWORD, DISCORD_DB_PASSWORD, etc.)
- Session secrets (SESSION_SECRET, SECRET_KEY)
- Service tokens (SERVICE_AUTH_TOKEN, DASHBOARD_API_KEY)

---

## Phase 1: Accounts & Prerequisites

**Time: 15 minutes**

### 1.1 Create Required Accounts

Do this now if you haven't already:

1. **Cloudflare** (free) - https://cloudflare.com
   - Transfer your domains here or add them
   
2. **Linode** ($24/mo) - https://cloud.linode.com
   - Just create account, we'll create server later
   
3. **Tailscale** (free) - https://tailscale.com
   - Sign up with Google/GitHub
   
4. **OpenAI** (pay-as-you-go) - https://platform.openai.com
   - Add payment method, create API key
   - Save the key somewhere safe!

5. **Discord Developer** (free) - https://discord.com/developers
   - Just need an account for now

### 1.2 Your Domains

You have these domains in Cloudflare:
- `evindrake.net` - Dashboard, n8n, Code-Server, Plex
- `rig-city.com` - Discord Bot, Stream Bot
- `scarletredjoker.com` - Static portfolio site

---

## Phase 2: Infrastructure Setup

**Time: 30 minutes**

### 2.1 Create Linode Server

1. Go to [cloud.linode.com](https://cloud.linode.com) → **Create Linode**
2. Select:
   - **Image**: Ubuntu 22.04 LTS
   - **Region**: Closest to you (Newark, Atlanta, etc.)
   - **Plan**: Shared CPU - Linode 4GB ($24/month)
   - **Label**: `homelab-cloud`
   - **Root Password**: Create a strong password
3. Click **Create Linode**
4. **Write down the public IP address** (you'll need it for DNS)

### 2.2 Configure DNS in Cloudflare

Go to Cloudflare → Select domain → **DNS** → Add these records:

**IMPORTANT:** Set Proxy status to **DNS only** (gray cloud) for ALL records!

#### evindrake.net
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | YOUR_LINODE_IP | DNS only |
| A | `dash` | YOUR_LINODE_IP | DNS only |
| A | `n8n` | YOUR_LINODE_IP | DNS only |
| A | `code` | YOUR_LINODE_IP | DNS only |
| A | `plex` | YOUR_LINODE_IP | DNS only |
| A | `home` | YOUR_LINODE_IP | DNS only |

#### rig-city.com
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | YOUR_LINODE_IP | DNS only |
| A | `bot` | YOUR_LINODE_IP | DNS only |
| A | `stream` | YOUR_LINODE_IP | DNS only |

#### scarletredjoker.com
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | YOUR_LINODE_IP | DNS only |
| A | `www` | YOUR_LINODE_IP | DNS only |

### 2.3 Set Up Tailscale VPN

**Get an auth key first:**
1. Go to [Tailscale Admin](https://login.tailscale.com/admin/settings/keys)
2. Click **Generate auth key**
3. Settings: Reusable=Yes, Ephemeral=No, Expiry=90 days
4. Copy the key (starts with `tskey-auth-`)

**Install on Linode:**
```bash
ssh root@YOUR_LINODE_IP

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Connect (use your auth key)
sudo tailscale up --authkey=tskey-auth-XXXXX --hostname=homelab-linode

# Get and save your Tailscale IP
tailscale ip -4
# Example output: 100.66.61.51
```

**Install on Local Ubuntu:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-XXXXX --hostname=homelab-local
tailscale ip -4
# Example output: 100.110.227.25
```

**Test connection:**
```bash
# From Linode, ping local
ping 100.110.227.25

# From local, ping Linode
ping 100.66.61.51
```

**Write down both IPs!**
- Linode Tailscale IP: `100.66.61.51`
- Local Tailscale IP: `100.110.227.25`

---

## Phase 3: Cloud Deployment (Linode)

**Time: 20 minutes**

### 3.1 Prepare the Server

```bash
ssh root@YOUR_LINODE_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Verify
docker --version
docker compose version
```

### 3.2 Clone and Configure

```bash
# Create directory and clone
mkdir -p /opt/homelab
cd /opt/homelab
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub

# Create environment file
cp .env.example .env
chmod 600 .env
```

### 3.3 Edit .env File

```bash
nano .env
```

**Set these values (the rest will be auto-generated):**

```bash
# ═══════════════════════════════════════════════════════════════════
# REQUIRED - Set these before deploying
# ═══════════════════════════════════════════════════════════════════

# Dashboard login
WEB_USERNAME=admin
WEB_PASSWORD=your_secure_password_here

# AI (from Phase 1)
OPENAI_API_KEY=sk-proj-your-key-here

# Cross-host routing (your LOCAL Ubuntu's Tailscale IP)
LOCAL_TAILSCALE_IP=100.110.227.25

# Code Server password
CODE_SERVER_PASSWORD=your_code_password

# ═══════════════════════════════════════════════════════════════════
# DISCORD - Add after Phase 4.1
# ═══════════════════════════════════════════════════════════════════
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
```

Save with `Ctrl+X`, then `Y`, then `Enter`.

### 3.4 Deploy

```bash
chmod +x deploy/scripts/bootstrap.sh
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

This will:
- Generate all missing passwords automatically
- Create database initialization scripts
- Start all services with Docker Compose

### 3.5 Verify Deployment

```bash
# Check all containers are running
docker compose ps

# You should see all services as "Up":
# caddy, homelab-postgres, homelab-redis, homelab-dashboard,
# discord-bot, stream-bot, n8n, code-server

# Check for errors
docker compose logs --tail=50
```

**Test access (may take 5 min for SSL certificates):**
- Dashboard: https://dash.evindrake.net
- Code Server: https://code.evindrake.net

---

## Phase 4: OAuth Configuration

**Time: 30 minutes**

### 4.1 Discord Bot (REQUIRED)

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → Name: "HomeLabHub"
3. **Bot section:**
   - Click **Add Bot** → **Yes, do it!**
   - Under Token, click **Reset Token** → Copy it
   - Enable these intents:
     - ✅ Presence Intent
     - ✅ Server Members Intent
     - ✅ Message Content Intent
4. **OAuth2 → General:**
   - Copy **Client ID**
   - Copy **Client Secret** (click Reset Secret if needed)
   - Add Redirect URL: `https://bot.rig-city.com/auth/discord/callback`

**Update .env on Linode:**
```bash
nano /opt/homelab/HomeLabHub/.env

# Add:
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

**Restart services:**
```bash
cd /opt/homelab/HomeLabHub
docker compose restart discord-bot
```

**Invite bot to your server:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

### 4.2 Twitch (Optional - for Stream Bot)

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)
2. Click **Register Your Application**
3. Fill in:
   - Name: HomeLabHub Stream Bot
   - OAuth Redirect URL: `https://stream.rig-city.com/api/auth/twitch/callback`
   - Category: Chat Bot
4. Copy **Client ID** and generate **Client Secret**

**Add to .env:**
```bash
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_secret
```

### 4.3 Google Cloud (YouTube, Calendar, Gmail)

**One project, multiple APIs:**

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project: "HomeLabHub"
3. **Enable APIs** (APIs & Services → Library):
   - YouTube Data API v3
   - Google Calendar API
   - Gmail API
4. **OAuth Consent Screen** (APIs & Services → OAuth consent screen):
   - User Type: External
   - App name: HomeLabHub
   - Support email: Your email
   - Add scopes: YouTube, Calendar, Gmail (just click through)
   - Add yourself as test user
5. **Create Credentials** (APIs & Services → Credentials):
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: Web application
   - Name: HomeLabHub
   - Authorized redirect URIs:
     - `https://stream.rig-city.com/api/auth/youtube/callback`
     - `https://dash.evindrake.net/api/google/callback`
6. Copy **Client ID** and **Client Secret**

**Add to .env:**
```bash
YOUTUBE_CLIENT_ID=your_google_client_id
YOUTUBE_CLIENT_SECRET=your_google_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_secret
```

### 4.4 Spotify (Optional - for Now Playing)

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Fill in:
   - App name: HomeLabHub Stream Bot
   - Redirect URI: `https://stream.rig-city.com/api/auth/spotify/callback`
   - APIs: Web API
4. Go to Settings → Copy **Client ID** and **Client Secret**

**Add to .env:**
```bash
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
```

### 4.5 Apply OAuth Changes

```bash
cd /opt/homelab/HomeLabHub
docker compose down
docker compose up -d
```

---

## Phase 5: Local Deployment (Ubuntu Host)

**Time: 20 minutes**

### 5.1 Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

### 5.2 Clone and Configure

```bash
cd ~
mkdir -p contain
cd contain
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub

cp .env.example .env
chmod 600 .env
nano .env
```

**Set these values:**
```bash
# MinIO Storage
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=your_minio_password

# Plex (get fresh claim at https://plex.tv/claim - expires in 4 min!)
PLEX_CLAIM=claim-XXXXX
PLEX_MEDIA_PATH=/path/to/your/media

# Sunshine GameStream (optional)
SUNSHINE_USER=admin
SUNSHINE_PASS=your_sunshine_password

# Linode's Tailscale IP
TAILSCALE_LINODE_HOST=100.66.61.51
```

### 5.3 Deploy

```bash
./deploy/scripts/bootstrap.sh --role local
```

### 5.4 Verify

```bash
docker compose -f compose.local.yml ps

# Should show: homelab-minio, plex-server, homeassistant, sunshine-gamestream
```

---

## Phase 6: Verification Checklist

### Test All Services

| Service | URL | Expected |
|---------|-----|----------|
| Dashboard | https://dash.evindrake.net | Login page |
| Discord Bot | https://bot.rig-city.com | Bot dashboard |
| Stream Bot | https://stream.rig-city.com | Stream dashboard |
| n8n | https://n8n.evindrake.net | n8n login |
| Code Server | https://code.evindrake.net | VS Code |
| Plex | https://plex.evindrake.net | Plex Web |

### Test Cross-Host Routing

From Linode:
```bash
curl -I http://100.110.227.25:32400   # Plex
curl -I http://100.110.227.25:8123    # Home Assistant
```

### Test Discord Bot

In your Discord server, try:
- `/ping`
- `/ticket create`

---

## Daily Operations

### Quick Commands

**On Linode:**
```bash
cd /opt/homelab/HomeLabHub

./homelab status        # Check all services
./homelab logs          # View logs
./homelab restart       # Restart all
./homelab db backup     # Backup database
```

**On Local:**
```bash
cd ~/contain/HomeLabHub
docker compose -f compose.local.yml ps
docker compose -f compose.local.yml logs -f
```

### Update Deployment

```bash
git pull origin main
docker compose down
docker compose up -d --build
```

---

## Troubleshooting

### SSL Certificate Not Working

```bash
# Check Caddy logs
docker logs caddy

# Common fixes:
# 1. Wait 5 minutes for cert generation
# 2. Verify DNS points to Linode IP (not proxied)
# 3. Restart Caddy
docker compose restart caddy
```

### Container Won't Start

```bash
# Check specific container logs
docker logs container-name

# Common fixes:
# 1. Check .env has required values
# 2. Check port isn't already in use
docker compose down && docker compose up -d
```

### Cross-Host Not Working

```bash
# 1. Verify Tailscale
tailscale status

# 2. Check .env has correct IPs
grep TAILSCALE .env

# 3. Test connectivity
ping 100.110.227.25
```

### Discord Bot Not Responding

```bash
# Check bot logs
docker logs discord-bot

# Common fixes:
# 1. Verify DISCORD_BOT_TOKEN is set
# 2. Check bot intents are enabled in Discord Developer Portal
# 3. Restart
docker compose restart discord-bot
```

### Database Connection Failed

```bash
# Check PostgreSQL
docker logs homelab-postgres

# Verify databases exist
docker exec homelab-postgres psql -U postgres -c "\l"
```

### Reset Everything (Nuclear Option)

```bash
# WARNING: Deletes all data!
docker compose down -v
docker system prune -a
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets
```

---

## Appendix A: Complete .env Reference

All environment variables in one place. The bootstrap script generates most secrets automatically with `--generate-secrets`.

### Core Configuration (Required)

| Variable | Description | Where to Get | Auto-Generated? |
|----------|-------------|--------------|-----------------|
| `WEB_USERNAME` | Dashboard login username | You choose | No |
| `WEB_PASSWORD` | Dashboard login password | You choose | Yes |
| `SERVICE_USER` | Linux username | Your username (e.g., evin) | No |
| `TZ` | Timezone | e.g., America/New_York | No |
| `PUID` | User ID | Run `id -u` | No |
| `PGID` | Group ID | Run `id -g` | No |

### AI Configuration (Required)

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_BASE_URL` | API endpoint | https://api.openai.com/v1 |
| `AI_PROVIDER` | AI provider name | openai |
| `AI_MODEL` | Model to use | gpt-4o |

### Database Passwords (Auto-Generated)

| Variable | Description | Auto-Generated? |
|----------|-------------|-----------------|
| `POSTGRES_PASSWORD` | Main PostgreSQL superuser | Yes |
| `DISCORD_DB_PASSWORD` | Discord bot database | Yes |
| `STREAMBOT_DB_PASSWORD` | Stream bot database | Yes |
| `JARVIS_DB_PASSWORD` | Jarvis AI database | Yes |

### Session Secrets (Auto-Generated)

| Variable | Description | Auto-Generated? |
|----------|-------------|-----------------|
| `SESSION_SECRET` | Flask session encryption | Yes |
| `SECRET_KEY` | Flask secret key | Yes |
| `SERVICE_AUTH_TOKEN` | Inter-service auth | Yes |
| `DASHBOARD_API_KEY` | External API access | Yes |
| `DISCORD_SESSION_SECRET` | Discord bot sessions | Yes |
| `STREAMBOT_SESSION_SECRET` | Stream bot sessions | Yes |

### Discord Bot (Required)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `DISCORD_BOT_TOKEN` | Bot authentication | Discord Developer Portal → Bot → Token |
| `DISCORD_CLIENT_ID` | OAuth client ID | Discord Developer Portal → OAuth2 |
| `DISCORD_CLIENT_SECRET` | OAuth secret | Discord Developer Portal → OAuth2 |
| `DISCORD_APP_ID` | Application ID | Same as Client ID |
| `VITE_DISCORD_CLIENT_ID` | Frontend client ID | Same as Client ID |
| `VITE_CUSTOM_WS_URL` | Custom WebSocket URL | Leave empty for default |

### Stream Bot - Core Configuration (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `STREAMBOT_PORT` | Stream bot port | 5000 |
| `STREAMBOT_NODE_ENV` | Node environment | production |
| `STREAMBOT_OPENAI_API_KEY` | Stream bot AI key | Uses main OPENAI_API_KEY if empty |
| `STREAMBOT_OPENAI_BASE_URL` | Stream bot AI endpoint | https://api.openai.com/v1 |
| `STREAMBOT_FACT_MODEL` | Model for fact generation | gpt-4o |

### Stream Bot - Twitch (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `TWITCH_CLIENT_ID` | Twitch app client ID | [dev.twitch.tv/console](https://dev.twitch.tv/console/apps) |
| `TWITCH_CLIENT_SECRET` | Twitch app secret | Same as above |
| `TWITCH_CHANNEL` | Your channel name | Your Twitch username |
| `TWITCH_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/twitch/callback` |

### Stream Bot - YouTube (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `YOUTUBE_CLIENT_ID` | Google OAuth client ID | [Google Cloud Console](https://console.cloud.google.com) |
| `YOUTUBE_CLIENT_SECRET` | Google OAuth secret | Same as above |
| `YOUTUBE_REFRESH_TOKEN` | OAuth refresh token | Generated after first OAuth flow |
| `YOUTUBE_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/youtube/callback` |

### Stream Bot - Spotify (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `SPOTIFY_CLIENT_ID` | Spotify app client ID | [developer.spotify.com](https://developer.spotify.com/dashboard) |
| `SPOTIFY_CLIENT_SECRET` | Spotify app secret | Same as above |
| `SPOTIFY_REFRESH_TOKEN` | OAuth refresh token | Generated after first OAuth flow |
| `SPOTIFY_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/spotify/callback` |

### Stream Bot - Kick (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `KICK_CLIENT_ID` | Kick app client ID | Kick Developer Portal |
| `KICK_CLIENT_SECRET` | Kick app secret | Same as above |
| `KICK_REDIRECT_URI` | OAuth callback | `https://stream.rig-city.com/api/auth/kick/callback` |

### n8n Automation (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `N8N_HOST` | n8n hostname | n8n.evindrake.net |
| `N8N_WEBHOOK_URL` | Webhook base URL | https://n8n.evindrake.net/ |
| `N8N_BASIC_AUTH_USER` | n8n login user | admin |
| `N8N_BASIC_AUTH_PASSWORD` | n8n login password | You choose |

### Code Server (Optional)

| Variable | Description | Auto-Generated? |
|----------|-------------|-----------------|
| `CODE_SERVER_PASSWORD` | VS Code web login | Yes |

### Cross-Host Configuration

| Variable | Description | Role | Notes |
|----------|-------------|------|-------|
| `LOCAL_TAILSCALE_IP` | Ubuntu host's Tailscale IP | Cloud | Get with `tailscale ip -4` on Ubuntu |
| `TAILSCALE_LINODE_HOST` | Linode's Tailscale IP | Local | Get with `tailscale ip -4` on Linode |

### Local Services - Plex (Local Role)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `PLEX_TOKEN` | Plex API token | [Get Plex Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/) |
| `PLEX_CLAIM` | Initial setup claim | [plex.tv/claim](https://plex.tv/claim) (expires in 4 min!) |
| `PLEX_URL` | Plex server URL | http://LOCAL_TAILSCALE_IP:32400 |
| `PLEX_MEDIA_PATH` | Media directory | /data/plex/media |

### Local Services - Home Assistant (Local Role)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `HOME_ASSISTANT_URL` | HA server URL | http://LOCAL_TAILSCALE_IP:8123 |
| `HOME_ASSISTANT_TOKEN` | Long-lived access token | HA → Profile → Long-Lived Access Tokens |

### Local Services - MinIO (Local Role)

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIO_ROOT_USER` | MinIO admin user | admin |
| `MINIO_ROOT_PASSWORD` | MinIO admin password | You choose |
| `MINIO_ENDPOINT` | MinIO endpoint | minio:9000 |
| `MINIO_BUCKET_NAME` | Default bucket | homelab-uploads |

### Local Services - Sunshine GameStream (Local Role)

| Variable | Description | Default |
|----------|-------------|---------|
| `SUNSHINE_USER` | Sunshine web UI user | admin |
| `SUNSHINE_PASS` | Sunshine web UI password | You choose |

### Local Services - VNC (Local Role)

| Variable | Description |
|----------|-------------|
| `VNC_PASSWORD` | VNC connection password |
| `VNC_USER` | VNC user (your Linux user) |
| `VNC_USER_PASSWORD` | Your Linux password |

### NAS Storage (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `NAS_IP` | NAS IP address | 192.168.1.100 |
| `NAS_HOSTNAME` | NAS hostname | zyxel-nas326 |
| `NAS_USER` | NAS admin user | admin |
| `NAS_PASSWORD` | NAS admin password | - |
| `NAS_MOUNT_BASE` | Mount point | /mnt/nas |

### Google Services (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_TOKEN_CACHE_TTL` | Token cache duration (seconds) | 300 |
| `CALENDAR_POLL_INTERVAL_MINUTES` | Calendar poll interval | 5 |
| `CALENDAR_LEAD_TIME_MINUTES` | Event reminder lead time | 10 |
| `GMAIL_FROM_NAME` | Gmail sender name | Homelab Dashboard |
| `GMAIL_DEFAULT_RECIPIENT` | Default email recipient | - |
| `DRIVE_BACKUP_FOLDER_NAME` | Google Drive backup folder | Homelab Backups |
| `DRIVE_BACKUP_RETENTION_DAYS` | Backup retention period | 30 |
| `DRIVE_AUTO_BACKUP_ENABLED` | Enable auto backup | false |
| `DRIVE_AUTO_BACKUP_SCHEDULE` | Cron schedule | 0 2 * * * |

### Email Service (Optional - Pick One)

| Variable | Description | Default |
|----------|-------------|---------|
| `EMAIL_PROVIDER` | Email service | sendgrid, mailgun, smtp, or webhook |
| `EMAIL_FROM` | From address | noreply@evindrake.net |
| `EMAIL_FROM_NAME` | Sender display name | HomeLabHub |
| `ADMIN_EMAIL` | Admin notification email | - |
| `SENDGRID_API_KEY` | SendGrid API key | [sendgrid.com](https://sendgrid.com) |
| `MAILGUN_API_KEY` | Mailgun API key | [mailgun.com](https://mailgun.com) |
| `MAILGUN_DOMAIN` | Mailgun domain | mg.evindrake.net |
| `SMTP_HOST` | SMTP server | smtp.gmail.com |
| `SMTP_PORT` | SMTP port | 587 |
| `SMTP_USER` | SMTP username | Your email |
| `SMTP_PASSWORD` | SMTP password | App password |
| `SMTP_USE_TLS` | Use TLS encryption | true |
| `EMAIL_WEBHOOK_URL` | Webhook for email (n8n, Zapier) | - |

### DNS Automation (Optional)

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ZONE_ID_EVINDRAKE` | Zone ID for evindrake.net | Cloudflare → Domain → Overview |
| `CLOUDFLARE_ZONE_ID_RIGCITY` | Zone ID for rig-city.com | Same |
| `CLOUDFLARE_ZONE_ID_SCARLETREDJOKER` | Zone ID for scarletredjoker.com | Same |

Token permissions required: Zone.Zone (Read), Zone.DNS (Edit), Zone.Cache Purge (Write)

### Service URLs (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_BOT_URL` | Discord bot public URL | https://bot.rig-city.com |
| `N8N_URL` | n8n public URL | https://n8n.evindrake.net |
| `STATIC_SITE_URL` | Static site URL | https://scarletredjoker.com |
| `LETSENCRYPT_EMAIL` | SSL certificate email | your_email@example.com |

### Operational Toggles

| Variable | Description | Default |
|----------|-------------|---------|
| `FLASK_ENV` | Flask environment | production |
| `FLASK_DEBUG` | Flask debug mode | false |
| `NODE_ENV` | Node.js environment | production |
| `RESET_DB` | Reset Discord bot database | false |
| `HOME_ASSISTANT_VERIFY_SSL` | Verify HA SSL certificate | False |
| `MINIO_USE_SSL` | Use SSL for MinIO | false |
| `N8N_BASIC_AUTH_ACTIVE` | Enable n8n auth | true |

### Path Configuration (Usually Don't Change)

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST_STATIC_SITE_PATH` | Host static site directory | ./static-sites |

---

## Appendix B: Secret Management

### How Bootstrap Generates Secrets

When you run `./deploy/scripts/bootstrap.sh --generate-secrets`:

1. **Checks each secret variable** in .env
2. **If empty or missing**, generates a secure random value:
   - Passwords: 32-char alphanumeric (via `openssl rand -base64`)
   - Session secrets: 64-char hex (via `openssl rand -hex 32`)
3. **Writes to .env** and reports what was generated
4. **Never overwrites** existing values

### Manual Secret Generation

If you need to generate secrets yourself:

```bash
# 32-character password
openssl rand -base64 24 | tr -d '/+=' | head -c 32

# 64-character hex secret
openssl rand -hex 32
```

### Secret Rotation

To rotate a secret:

```bash
# 1. Generate new value
NEW_SECRET=$(openssl rand -hex 32)

# 2. Update .env
sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$NEW_SECRET/" .env

# 3. Restart services
docker compose down && docker compose up -d
```

### Backup Strategy

Always backup .env before making changes:

```bash
cp .env .env.backup.$(date +%Y%m%d)
```

---

## Summary Checklist

- [ ] Cloudflare account with domains
- [ ] Linode server created
- [ ] DNS records added (gray cloud!)
- [ ] Tailscale installed on both servers
- [ ] Tailscale IPs noted
- [ ] OpenAI API key obtained
- [ ] Cloud .env configured
- [ ] Cloud deployed with bootstrap
- [ ] Discord OAuth app created
- [ ] Bot invited to server
- [ ] Local .env configured
- [ ] Local deployed with bootstrap
- [ ] All services accessible via HTTPS
- [ ] Discord bot responding

**Your homelab is now live at https://dash.evindrake.net**
