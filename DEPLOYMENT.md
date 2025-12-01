# Homelab Deployment Guide

> **DEPRECATED**: This guide is outdated. Please use the comprehensive guide at:
> **[docs/deploy/FULL_DEPLOYMENT_GUIDE.md](docs/deploy/FULL_DEPLOYMENT_GUIDE.md)**

---

*Legacy content below for reference only*

Complete guide to deploy all 15 services to your Ubuntu 25.10 server at host.evindrake.net.

---

## Prerequisites

### On Your Ubuntu Server
- Ubuntu 25.10 installed
- Docker and Docker Compose installed
- Git installed
- Ports 80, 443 open for Caddy reverse proxy
- Domain DNS configured (*.evindrake.net, *.rig-city.com, scarletredjoker.com)

### Required Credentials
You'll need API keys/tokens for:
- OpenAI API key
- Discord bot token + client ID + client secret
- Twitch OAuth credentials
- YouTube OAuth credentials (optional)
- Spotify OAuth credentials (optional)
- Plex token (optional)
- Home Assistant long-lived access token

---

## Step 1: Initial Server Setup

SSH into your Ubuntu server:
```bash
ssh evin@host.evindrake.net
```

Install Docker (if not already installed):
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify installation
docker --version
docker compose version
```

---

## Step 2: Clone Repository

```bash
# Create project directory
mkdir -p /home/evin/contain
cd /home/evin/contain

# Clone your repository
git clone https://github.com/YOUR_USERNAME/HomeLabHub.git
cd HomeLabHub
```

---

## Step 3: Configure Environment Variables

Copy the example env file:
```bash
cp .env.example .env
nano .env
```

### Required Variables:

See `.env.example` for all available variables. Key ones to configure:

```bash
# Generate secure passwords with: openssl rand -hex 16
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

# Get from platform.openai.com
OPENAI_API_KEY=sk-proj-YOUR_KEY

# Get from discord.com/developers
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN
DISCORD_CLIENT_ID=YOUR_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_SECRET

# For cross-host routing (your local host's Tailscale IP)
LOCAL_TAILSCALE_IP=100.x.x.x
```

Save the file (Ctrl+O, Enter, Ctrl+X).

---

## Step 4: Configure Domain DNS

Make sure these DNS records point to your server IP:

### A Records (evindrake.net):
```
host.evindrake.net     → YOUR_SERVER_IP
vnc.evindrake.net      → YOUR_SERVER_IP
code.evindrake.net     → YOUR_SERVER_IP
plex.evindrake.net     → YOUR_SERVER_IP
n8n.evindrake.net      → YOUR_SERVER_IP
home.evindrake.net     → YOUR_SERVER_IP
```

### A Records (rig-city.com):
```
bot.rig-city.com       → YOUR_SERVER_IP
stream.rig-city.com    → YOUR_SERVER_IP
rig-city.com           → YOUR_SERVER_IP
```

### A Record (scarletredjoker.com):
```
scarletredjoker.com    → YOUR_SERVER_IP
```

---

## Step 5: Deploy All Services

Make the homelab script executable:
```bash
chmod +x homelab
```

Deploy everything:
```bash
./homelab fix
```

This will:
1. Rebuild Discord and Stream bots without cache (ensures fresh builds)
2. Start all 15 services with correct environment variables
3. Wait for PostgreSQL to be ready
4. Create the 3 required databases (ticketbot, streambot, homelab_jarvis)
5. Verify all services are running

Expected output:
```
═══ FIXING HOMELAB ═══

[1/4] Rebuilding bots without cache...
[2/4] Force recreating all services...
[3/4] Waiting for stability...
[4/4] Setting up databases...
✓ Databases ready

✅ SUCCESS! All 15/15 services running!
```

---

## Step 6: Verify Deployment

### Check Service Status
```bash
./homelab status
```

You should see all 15 services running:
```
✅ All 15/15 services running
```

### Check Individual Services
```bash
# Check Discord bot logs
./homelab logs discord-bot

# Check Stream bot logs
./homelab logs stream-bot

# Check Dashboard logs
./homelab logs homelab-dashboard
```

### Test Web Access

Visit these URLs in your browser (Caddy will auto-generate SSL certificates):

1. **Dashboard**: https://host.evindrake.net
   - Login: Use credentials from your .env file (WEB_USERNAME / WEB_PASSWORD)
   - Should show Jarvis AI assistant

2. **Discord Bot**: https://bot.rig-city.com
   - Should show ticket management interface

3. **Stream Bot**: https://stream.rig-city.com
   - Should show SnappleBotAI dashboard

4. **n8n**: https://n8n.evindrake.net
5. **Home Assistant**: https://home.evindrake.net
6. **Plex**: https://plex.evindrake.net
7. **VNC Desktop**: https://vnc.evindrake.net
8. **Code Server**: https://code.evindrake.net
9. **Static Sites**: https://rig-city.com, https://scarletredjoker.com

---

## Step 7: Initial Configuration

### Discord Bot Setup
1. Go to https://discord.com/developers/applications
2. Create new application or use existing
3. Copy Bot Token, Client ID, Client Secret, Application ID to .env
4. Enable necessary intents (Server Members, Message Content, Presence)
5. Invite bot to your Discord server

### Stream Bot Setup
1. Connect Twitch account at https://stream.rig-city.com
2. Connect YouTube account (optional)
3. Connect Spotify account (optional)
4. Configure bot settings, commands, and chatbot personality

### Home Assistant Setup
1. Access https://home.evindrake.net
2. Create account on first login
3. Go to Profile → Security → Long-Lived Access Tokens
4. Create token and add to .env as HOME_ASSISTANT_TOKEN

### Plex Setup
1. Get Plex token:
```bash
docker exec plex-server cat "/config/Library/Application Support/Plex Media Server/Preferences.xml" | grep -o 'PlexOnlineToken="[^"]*"' | cut -d'"' -f2
```
2. Add token to .env as PLEX_TOKEN
3. Restart dashboard: `docker compose --env-file .env restart homelab-dashboard`

---

## Maintenance Commands

### Check Status
```bash
./homelab status        # Show which services are running
./homelab debug         # Show detailed debugging info
```

### View Logs
```bash
./homelab logs                    # All services
./homelab logs discord-bot        # Specific service
./homelab logs homelab-dashboard  # Dashboard logs
```

### Restart Services
```bash
./homelab restart       # Restart all services
./homelab stop          # Stop all services
./homelab fix           # Fix issues and restart
```

### Update Deployment
```bash
cd /home/evin/contain/HomeLabHub
git pull origin main
./homelab fix
```

---

## Troubleshooting

### Services Not Starting
```bash
./homelab debug
./homelab logs
```

### Password Authentication Errors
If you see password authentication failures after running `./homelab fix`:
```bash
# Passwords are already standardized, just rebuild:
docker compose --env-file .env build --no-cache discord-bot stream-bot
docker compose --env-file .env up -d discord-bot stream-bot
```

### SSL Certificate Issues
Caddy automatically generates SSL certificates. If you see certificate errors:
```bash
# Check Caddy logs
docker logs caddy --tail 50

# Verify DNS is pointing to your server
dig host.evindrake.net
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker logs homelab-postgres --tail 30

# Verify databases exist
docker exec homelab-postgres psql -U postgres -c "\l"
```

### Reset Everything (Nuclear Option)
```bash
# Stop all services
./homelab stop

# Remove all containers and volumes
docker compose down -v

# Start fresh
./homelab fix
```

---

## Security Checklist

- ✅ Change default passwords in .env
- ✅ Use strong session secrets (generated with `openssl rand -hex 32`)
- ✅ Keep OpenAI API key secure (rotate if exposed)
- ✅ Enable SSL via Caddy (automatic with Let's Encrypt)
- ✅ Restrict SSH access (use SSH keys, disable password auth)
- ✅ Keep Docker and system packages updated
- ✅ Regular backups of PostgreSQL databases

### Backup Databases
```bash
# Backup all databases
docker exec homelab-postgres pg_dumpall -U postgres > backup_$(date +%Y%m%d).sql

# Restore from backup
docker exec -i homelab-postgres psql -U postgres < backup_20251122.sql
```

---

## Service URLs Reference

| Service | URL | Port | Notes |
|---------|-----|------|-------|
| Dashboard (Jarvis) | https://host.evindrake.net | 5000 | Main control panel |
| Discord Bot | https://bot.rig-city.com | 4000 | Ticket system |
| Stream Bot | https://stream.rig-city.com | 5000 | Multi-platform bot |
| n8n | https://n8n.evindrake.net | 5678 | Workflow automation |
| Home Assistant | https://home.evindrake.net | 8123 | Smart home |
| Plex | https://plex.evindrake.net | 32400 | Media server |
| VNC Desktop | https://vnc.evindrake.net | 6080 | Remote desktop |
| Code Server | https://code.evindrake.net | 8443 | VS Code in browser |
| MinIO | http://localhost:9001 | 9001 | S3 storage (internal) |
| PostgreSQL | localhost:5432 | 5432 | Database (internal) |
| Redis | localhost:6379 | 6379 | Cache (internal) |

---

## Architecture Overview

```
                    ┌─────────────────────┐
                    │   Caddy Proxy       │
                    │   (SSL/HTTPS)       │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐
    │Dashboard│          │Discord  │          │ Stream  │
    │(Jarvis) │          │  Bot    │          │  Bot    │
    └────┬────┘          └────┬────┘          └────┬────┘
         │                    │                     │
         └────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │   PostgreSQL      │
                    │   (3 databases)   │
                    │  - ticketbot      │
                    │  - streambot      │
                    │  - homelab_jarvis │
                    └───────────────────┘
```

---

## Support

If you encounter issues:
1. Check logs: `./homelab logs`
2. Check debug info: `./homelab debug`
3. Verify environment variables are set correctly in `.env`
4. Ensure all DNS records are configured
5. Check Docker is running: `docker ps`

---

## Success Criteria

You've successfully deployed when:
- ✅ All 15 services show as running (`./homelab status`)
- ✅ Dashboard accessible at https://host.evindrake.net
- ✅ Jarvis AI responds to chat messages
- ✅ Discord bot is online in your server
- ✅ Stream bot dashboard is accessible
- ✅ SSL certificates are auto-generated (no browser warnings)
- ✅ No errors in logs (`./homelab logs`)

**Your homelab is now production-ready!** 🚀
