# Environment Variable Complete Matrix

## Overview
This document lists ALL environment variables used across the homelab deployment, categorized by service and priority.

---

## 🔑 Shared Variables (Used by Multiple Services)

| Variable | Required? | Default | Description | Used By |
|----------|-----------|---------|-------------|---------|
| `SERVICE_USER` | Optional | `evin` | System user for file permissions | VNC, Deploy scripts |
| `LETSENCRYPT_EMAIL` | **Required** | - | Email for SSL certificate notifications | Caddy |
| `OPENAI_API_KEY` | **Required** | - | OpenAI API key (fallback for all services) | Dashboard, Stream Bot |
| `DOCKER_HOST` | Optional | `unix:///var/run/docker.sock` | Docker socket path | Dashboard |
| `SSH_HOST` | Optional | `localhost` | SSH host for remote execution | Dashboard |
| `SSH_PORT` | Optional | `22` | SSH port | Dashboard |
| `SSH_USER` | Optional | `evin` | SSH username | Dashboard |
| `SSH_KEY_PATH` | Optional | `/home/evin/.ssh/id_rsa` | SSH private key path | Dashboard |
| `ENABLE_SCRIPT_EXECUTION` | Optional | `true` | Allow remote script execution | Dashboard |

---

## 🖥️ Homelab Dashboard (host.evindrake.net)

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `SESSION_SECRET` | **Required** | - | Flask session encryption key |
| `DASHBOARD_API_KEY` | **Required** | - | API key for programmatic access |
| `WEB_USERNAME` | Optional | `evin` | Web login username |
| `WEB_PASSWORD` | Optional | - | Web login password |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Optional | Uses `OPENAI_API_KEY` | Dashboard-specific OpenAI override |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Optional | `https://api.openai.com/v1` | OpenAI API base URL |

**Notes:**
- Shares `DOCKER_HOST`, `SSH_*`, `ENABLE_SCRIPT_EXECUTION` from shared variables
- Uses `OPENAI_API_KEY` as fallback if `AI_INTEGRATIONS_OPENAI_API_KEY` not set

---

## 🤖 Discord Ticket Bot (bot.rig-city.com)

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `DISCORD_DB_PASSWORD` | **Required** | - | PostgreSQL database password |
| `DISCORD_BOT_TOKEN` | **Required** | - | Discord bot token |
| `DISCORD_CLIENT_ID` | **Required** | - | Discord OAuth2 client ID |
| `DISCORD_CLIENT_SECRET` | **Required** | - | Discord OAuth2 client secret |
| `DISCORD_APP_ID` | **Required** | - | Discord application ID |
| `VITE_DISCORD_CLIENT_ID` | **Required** | Same as `DISCORD_CLIENT_ID` | Frontend build variable |
| `DISCORD_SESSION_SECRET` | **Required** | - | Session encryption secret |
| `DISCORD_CALLBACK_URL` | Optional | Auto-derived from Replit domain | OAuth2 callback URL |
| `APP_URL` | Optional | Derived from `DISCORD_CALLBACK_URL` | Application base URL |
| `PUBLIC_DOMAIN` | Optional | - | Public domain for webhooks |
| `VITE_CUSTOM_WS_URL` | Optional | - | Custom WebSocket URL |
| `RESET_DB` | Optional | `false` | Reset database on startup |
| `NODE_ENV` | Optional | `production` | Node environment |
| `PORT` | Optional | `5000` | Server port |

**Docker Compose Auto-Injected:**
- `DATABASE_URL`: Built from `postgresql://ticketbot:${DISCORD_DB_PASSWORD}@discord-bot-db:5432/ticketbot`

**Security Notes:**
- OAuth redirect must be added to Discord Developer Portal: `https://bot.rig-city.com/auth/discord/callback`
- Get credentials from: https://discord.com/developers/applications

---

## 📺 Stream Bot (stream.rig-city.com)

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `STREAMBOT_DB_PASSWORD` | **Required** | - | PostgreSQL database password |
| `STREAMBOT_SESSION_SECRET` | **Required** | - | Session encryption secret |
| `STREAMBOT_OPENAI_API_KEY` | Optional | Falls back to `OPENAI_API_KEY` | Stream bot-specific OpenAI key |
| `STREAMBOT_OPENAI_BASE_URL` | Optional | `https://api.openai.com/v1` | OpenAI API base URL |
| `STREAMBOT_NODE_ENV` | Optional | `production` | Node environment |
| `STREAMBOT_PORT` | Optional | `5000` | Server port |
| `TWITCH_CLIENT_ID` | Optional | - | Twitch integration client ID |
| `TWITCH_CLIENT_SECRET` | Optional | - | Twitch integration secret |
| `TWITCH_CHANNEL` | Optional | - | Twitch channel name |

**Docker Compose Auto-Injected:**
- `DATABASE_URL`: Built from `postgresql://streambot:${STREAMBOT_DB_PASSWORD}@discord-bot-db:5432/streambot`
- `OPENAI_API_KEY`: Uses `${STREAMBOT_OPENAI_API_KEY:-${OPENAI_API_KEY}}` (fallback pattern)

**Notes:**
- If `STREAMBOT_OPENAI_API_KEY` not set, uses shared `OPENAI_API_KEY`
- Twitch variables are optional (only needed if using Twitch integration)
- Get Twitch credentials from: https://dev.twitch.tv/console/apps

---

## 🎬 Plex Media Server (plex.evindrake.net)

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `PLEX_CLAIM` | **Required** | - | Plex claim token (4-minute expiry) |
| `PUID` | Optional | `1000` | User ID for file permissions |
| `PGID` | Optional | `1000` | Group ID for file permissions |
| `TZ` | Optional | `America/New_York` | Timezone |
| `VERSION` | Optional | `docker` | Plex version to use |
| `ADVERTISE_IP` | Optional | `https://plex.evindrake.net:443` | Advertised IP/domain |

**Notes:**
- Get claim token from: https://www.plex.tv/claim/ (expires in 4 minutes!)
- Token only needed for initial setup, can be removed after

---

## 🖼️ VNC Remote Desktop (vnc.evindrake.net)

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `VNC_PASSWORD` | **Required** | - | VNC viewer password |
| `VNC_USER` | **Required** | `evin` | VNC desktop username |
| `VNC_USER_PASSWORD` | **Required** | - | VNC user password |
| `NOVNC_URL` | Optional | `https://vnc.evindrake.net` | NoVNC web access URL |
| `SERVICE_USER` | Optional | `evin` | Host user for volume mounts |

**Docker Defaults:**
- Resolution: `1920x1080`
- Shared memory: `2gb`

---

## 🔄 n8n Automation (n8n.evindrake.net)

| Variable | Required? | Default | Description |
|----------|-----------|---------|-------------|
| `N8N_HOST` | Optional | `n8n.evindrake.net` | n8n hostname |
| `N8N_PORT` | Optional | `5678` | n8n port |
| `N8N_PROTOCOL` | Optional | `https` | Protocol (http/https) |
| `NODE_ENV` | Optional | `production` | Node environment |
| `WEBHOOK_URL` | Optional | `https://n8n.evindrake.net/` | Webhook base URL |
| `GENERIC_TIMEZONE` | Optional | `America/New_York` | Timezone |
| `TZ` | Optional | `America/New_York` | System timezone |
| `N8N_ENCRYPTION_KEY` | Optional | Auto-generated | Encryption key for credentials |
| `N8N_BASIC_AUTH_USER` | Optional | - | Basic auth username |
| `N8N_BASIC_AUTH_PASSWORD` | Optional | - | Basic auth password |

**Notes:**
- Most variables have sensible defaults
- Currently configured without authentication (consider adding)
- Encryption key auto-generated by n8n on first start

---

## 🌐 Static Website (scarletredjoker.com)

**No environment variables required** - uses Nginx static file serving

---

## 🔒 PostgreSQL Database (Shared)

| Variable | Required? | Used By | Description |
|----------|-----------|---------|-------------|
| `DISCORD_DB_PASSWORD` | **Required** | Discord Bot | Password for `ticketbot` database |
| `STREAMBOT_DB_PASSWORD` | **Required** | Stream Bot | Password for `streambot` database |

**Notes:**
- Single PostgreSQL container hosts both databases
- Passwords used by init scripts to create users/databases
- Auto-injected into `DATABASE_URL` for each service

---

## 📊 Variable Priority Summary

### 🔴 Critical (Must Set Before Deploy)

```
LETSENCRYPT_EMAIL
OPENAI_API_KEY
SESSION_SECRET
DASHBOARD_API_KEY
DISCORD_DB_PASSWORD
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
DISCORD_APP_ID
VITE_DISCORD_CLIENT_ID
DISCORD_SESSION_SECRET
STREAMBOT_DB_PASSWORD
STREAMBOT_SESSION_SECRET
PLEX_CLAIM
VNC_PASSWORD
VNC_USER
VNC_USER_PASSWORD
```

### 🟡 Important (Should Configure)

```
WEB_USERNAME
WEB_PASSWORD
SSH_HOST
SSH_USER
SSH_KEY_PATH
```

### 🟢 Optional (Can Use Defaults)

```
SERVICE_USER (default: evin)
DOCKER_HOST (default: unix:///var/run/docker.sock)
SSH_PORT (default: 22)
ENABLE_SCRIPT_EXECUTION (default: true)
TWITCH_CLIENT_ID (only if using Twitch)
TWITCH_CLIENT_SECRET (only if using Twitch)
TWITCH_CHANNEL (only if using Twitch)
All service-specific overrides (ports, URLs, etc.)
```

---

## 🛠️ Management Tools

### Generate New .env File
```bash
./deployment/generate-unified-env.sh
```

### Validate Environment
```bash
./deployment/check-all-env.sh
```

### View Environment Documentation
```bash
cat docs/ENV_QUICK_GUIDE.md
```

---

## 🔐 Security Best Practices

1. **Never commit .env to Git**
   - Added to `.gitignore`
   - Contains sensitive credentials

2. **Generate Strong Secrets**
   ```bash
   # Session secrets (hex)
   python3 -c 'import secrets; print(secrets.token_hex(32))'
   
   # API keys (URL-safe)
   python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
   
   # Passwords
   python3 -c 'import secrets; print(secrets.token_urlsafe(16))'
   ```

3. **Rotate Credentials Regularly**
   - Database passwords: Every 90 days
   - Session secrets: Every 90 days
   - API keys: As needed

4. **Backup .env File Securely**
   ```bash
   # Encrypt backup
   gpg --encrypt .env > .env.gpg
   
   # Store .env.gpg in secure location
   ```

---

**Last Updated:** November 12, 2025  
**Maintained By:** Homelab Dashboard Team  
**Related Docs:** ENV_QUICK_GUIDE.md, DEPLOYMENT_GUIDE.md
