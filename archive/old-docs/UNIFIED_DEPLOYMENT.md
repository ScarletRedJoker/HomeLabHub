# Unified Homelab Deployment Guide

This guide covers deploying **all your homelab services** in one unified Docker Compose stack with automatic SSL certificates via Traefik.

## 🎯 What This Deploys

One command deploys **everything**:

1. **🎛️ Homelab Dashboard** → `host.evindrake.net` - Manage all services, system monitoring, AI assistant
2. **🎫 Discord Ticket Bot** → `bot.rig-city.com` - Customer support bot with PostgreSQL database
3. **🎬 Stream Bot (Snapple AI)** → `stream.rig-city.com` - AI-powered chat bot for Twitch streaming
4. **📺 Plex Media Server** → `plex.evindrake.net` - Media streaming with hardware acceleration
5. **🤖 n8n Automation** → `n8n.evindrake.net` - Workflow automation platform
6. **🌐 Static Website** → `scarletredjoker.com` - Your static website content
7. **🖥️ VNC Desktop** → `vnc.evindrake.net` - Remote desktop access with authentication
8. **🔧 Traefik Proxy** → Automatic HTTPS for all services

## ✅ Prerequisites

### 1. Server Setup

- Ubuntu server (25.10 or similar)
- Docker and Docker Compose installed
- User added to docker group: `sudo usermod -aG docker evin`

### 2. Network Configuration

**Router Port Forwarding** (REQUIRED for SSL):
- Forward **port 80** (HTTP) → Your Ubuntu server
- Forward **port 443** (HTTPS) → Your Ubuntu server

**DNS Configuration** (ZoneEdit):
Create A records pointing to your router's public IP:
- `host.evindrake.net`
- `bot.rig-city.com`
- `stream.rig-city.com`
- `plex.evindrake.net`
- `n8n.evindrake.net`
- `scarletredjoker.com`
- `vnc.evindrake.net`
- `traefik.evindrake.net` (optional - for Traefik dashboard)

### 3. Project Files

All your projects should be in `/home/evin/contain/`:
```
/home/evin/contain/
├── HomeLabHub/          (this dashboard)
├── DiscordTicketBot/    (Discord bot code)
├── SnappleBotAI/        (Stream bot code)
├── plex-server/         (Plex config/media)
│   ├── config/
│   ├── media/
│   └── transcode/
└── n8n/                 (n8n data - created automatically)
```

## 🚀 Quick Deploy

### Step 1: Navigate to HomeLabHub

```bash
cd /home/evin/contain/HomeLabHub
```

### Step 2: Run the Deployment Script

```bash
./deploy-unified.sh
```

The script will:
1. ✅ Check system requirements
2. ✅ Verify all project directories exist
3. ✅ Create necessary folders
4. ✅ Generate `.env` file with random secrets
5. ✅ Build all custom containers
6. ✅ Start all services
7. ✅ Configure Traefik for automatic SSL

### Step 3: Configure Environment Variables

Edit the `.env` file and add your credentials:

```bash
nano .env
```

**Required for Discord Bot:**
```bash
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
DISCORD_APP_ID=your-app-id
```

**Required for Dashboard AI:**
```bash
OPENAI_API_KEY=sk-proj-your-api-key
```

**Required for Plex:**
```bash
PLEX_CLAIM=claim-token-from-plex.tv
```

**Required for Stream Bot:**
```bash
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
TWITCH_CHANNEL=your-channel-name
```

### Step 4: Restart Services

After updating `.env`:

```bash
docker compose -f docker-compose.unified.yml restart
```

### Step 5: Upload Static Website

Extract your website files to `/var/www/scarletredjoker/`:

```bash
# If you have a zip file:
unzip your-website.zip -d /var/www/scarletredjoker/

# Or copy files:
cp -r /path/to/website/* /var/www/scarletredjoker/
```

## 🌐 Accessing Your Services

Once deployed and SSL certificates are issued (takes 1-2 minutes):

| Service | URL | Description |
|---------|-----|-------------|
| Dashboard | https://host.evindrake.net | System management & monitoring |
| Discord Bot | https://bot.rig-city.com | Ticket support bot interface |
| Stream Bot | https://stream.rig-city.com | Snapple facts AI chat |
| Plex | https://plex.evindrake.net | Media server |
| n8n | https://n8n.evindrake.net | Automation workflows |
| Static Site | https://scarletredjoker.com | Your website |
| VNC Desktop | https://vnc.evindrake.net | Remote desktop (user: evin, pass: changeme) |
| Traefik | https://traefik.evindrake.net | Reverse proxy dashboard |

**Login to Dashboard:**
- Username: (not required)
- API Key: Find in `.env` under `DASHBOARD_API_KEY`

## 📊 Managing Your Homelab

### View Running Services

```bash
docker compose -f docker-compose.unified.yml ps
```

### View Logs

```bash
# All services
docker compose -f docker-compose.unified.yml logs -f

# Specific service
docker compose -f docker-compose.unified.yml logs -f homelab-dashboard
docker compose -f docker-compose.unified.yml logs -f discord-bot
docker compose -f docker-compose.unified.yml logs -f stream-bot
```

### Restart Services

```bash
# Restart one service
docker compose -f docker-compose.unified.yml restart homelab-dashboard

# Restart all
docker compose -f docker-compose.unified.yml restart
```

### Stop All Services

```bash
docker compose -f docker-compose.unified.yml down
```

### Update a Service

```bash
# Rebuild and restart a specific service
docker compose -f docker-compose.unified.yml build discord-bot
docker compose -f docker-compose.unified.yml up -d discord-bot
```

### Pull Latest Code and Redeploy

```bash
cd /home/evin/contain/HomeLabHub
git pull
./deploy-unified.sh
```

## 🔧 Troubleshooting

### SSL Certificates Not Working

**Check DNS resolution:**
```bash
nslookup host.evindrake.net
# Should show your router's public IP
```

**Check port forwarding:**
```bash
# From outside your network (use your phone with WiFi off):
curl -I http://host.evindrake.net
# Should connect successfully
```

**View Traefik logs:**
```bash
docker compose -f docker-compose.unified.yml logs traefik | grep -i acme
# Look for certificate request status
```

### Service Not Accessible

**Check if container is running:**
```bash
docker compose -f docker-compose.unified.yml ps
```

**Check container logs:**
```bash
docker compose -f docker-compose.unified.yml logs [service-name]
```

**Verify Traefik routing:**
```bash
# Access Traefik dashboard
https://traefik.evindrake.net
# Check if routers and services are configured
```

### Discord Bot Database Issues

**Reset the database:**
```bash
# Edit .env and set:
RESET_DB=true

# Restart the bot
docker compose -f docker-compose.unified.yml restart discord-bot

# Change back to false after reset
RESET_DB=false
```

### Port Conflicts

If you see "port already in use" errors:

```bash
# Check what's using ports 80/443
sudo ss -tlnp | grep -E ':(80|443)'

# Stop conflicting services
sudo systemctl stop nginx  # if you have nginx
sudo systemctl stop apache2  # if you have apache
```

### Plex Hardware Acceleration Not Working

```bash
# Verify /dev/dri is accessible
ls -la /dev/dri

# Check container has access
docker exec plex-server ls -la /dev/dri
```

## 🔒 Security Notes

### Automatic SSL/TLS

- All services use HTTPS with Let's Encrypt certificates
- HTTP automatically redirects to HTTPS
- Certificates auto-renew every 60 days

### Network Isolation

- All services run on isolated `homelab` Docker network
- Only Traefik exposes ports 80/443 to the internet
- Services communicate internally via service names

### Authentication

- **Dashboard:** API key authentication
- **Discord Bot:** Discord OAuth
- **n8n:** Basic auth (configure in container)
- **Plex:** Plex account authentication

### Recommended Additional Security

1. **Use Twingate VPN** for additional access control
2. **Configure fail2ban** to prevent brute force attacks
3. **Regular updates:** Pull latest Docker images weekly
4. **Firewall:** Use UFW to limit access

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 📝 Environment Variables Reference

See `.env.unified.example` for complete list. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `LETSENCRYPT_EMAIL` | Yes | Email for SSL certificates |
| `OPENAI_API_KEY` | Yes | For dashboard AI & stream bot |
| `DASHBOARD_API_KEY` | Auto | Generated during deployment |
| `DISCORD_BOT_TOKEN` | Yes | Discord bot authentication |
| `DISCORD_DB_PASSWORD` | Auto | PostgreSQL password |
| `PLEX_CLAIM` | Yes | Plex server claim token |
| `TWITCH_CLIENT_ID` | Yes | For stream bot Twitch integration |
| `TWITCH_CLIENT_SECRET` | Yes | For stream bot Twitch integration |
| `TWITCH_CHANNEL` | Yes | Your Twitch channel name |
| `VNC_PASSWORD` | Auto | VNC session password |
| `VNC_USER_PASSWORD` | Auto | VNC container user password |
| `VNC_BASIC_AUTH` | Optional | Web access authentication |

## 🎉 What's Next?

After deployment:

1. **Access the dashboard** at https://host.evindrake.net
2. **Monitor all services** from one place
3. **View logs** with AI-powered analysis
4. **Manage files** for your static website
5. **Set up automation** with n8n
6. **Configure your bots** with proper credentials

Enjoy your unified homelab! 🚀
