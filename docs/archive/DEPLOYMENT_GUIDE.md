# 🚀 Nebula Command Deployment Guide

**Complete step-by-step guide for deploying the AI Homelab Management System on Ubuntu 25.10**

---

## 📑 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Server Setup](#initial-server-setup)
3. [Repository Setup](#repository-setup)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [First Deployment](#first-deployment)
7. [SSL/HTTPS Configuration](#ssl-https-configuration)
8. [Post-Deployment Verification](#post-deployment-verification)
9. [Auto-Sync Setup](#auto-sync-setup)
10. [Next Steps](#next-steps)

---

## 📋 Prerequisites

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 4 cores | 8+ cores |
| **RAM** | 8 GB | 16+ GB |
| **Storage** | 50 GB | 100+ GB SSD |
| **Network** | 100 Mbps | 1 Gbps |

### Software Requirements

- **Operating System:** Ubuntu 25.10 Server or Desktop
- **Network Access:** Static IP or Dynamic DNS
- **Domain Names:** At least 1 registered domain (multiple domains supported)
- **Internet Connection:** For downloading Docker images and obtaining SSL certificates

### Required Accounts & Credentials

Before starting, ensure you have:

✅ Domain registrar access (for DNS configuration)  
✅ GitHub/Replit account (for code repository access)  
✅ OpenAI API key (for Jarvis AI features)  
✅ Twitch Developer App credentials (optional, for Stream Bot)  
✅ YouTube API credentials (optional, for Stream Bot)  
✅ Discord Bot Token (optional, for Discord Bot)  
✅ Spotify API credentials (optional, for music integration)  

---

## 🖥️ Initial Server Setup

### Step 1: Update System Packages

```bash
# Update package lists
sudo apt update

# Upgrade installed packages
sudo apt upgrade -y

# Install essential utilities
sudo apt install -y curl wget git htop nano vim net-tools ufw
```

### Step 2: Install Docker & Docker Compose

```bash
# Install Docker prerequisites
sudo apt install -y ca-certificates gnupg lsb-release

# Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add your user to the docker group
sudo usermod -aG docker $USER

# Enable Docker to start on boot
sudo systemctl enable docker

# IMPORTANT: Log out and log back in for group changes to take effect
echo "✅ Docker installed. Please log out and log back in."
```

**Configure System for Redis (Optional but Recommended):**

```bash
# Enable memory overcommit for Redis
sudo sysctl vm.overcommit_memory=1

# Make it permanent
echo 'vm.overcommit_memory = 1' | sudo tee -a /etc/sysctl.conf

# Verify
sysctl vm.overcommit_memory
```

> **Note:** Without this setting, Redis may show warnings about memory overcommit. This setting improves Redis reliability during background saves and replication.

**Verify Docker Installation:**

```bash
docker --version
docker compose version
docker ps
```

Expected output:
```
Docker version 24.x.x
Docker Compose version v2.x.x
CONTAINER ID   IMAGE     COMMAND   CREATED   STATUS    PORTS     NAMES
```

### Step 3: Configure Firewall (UFW)

```bash
# Enable UFW
sudo ufw enable

# Allow SSH (IMPORTANT: Do this first!)
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp

# Allow additional service ports (optional)
sudo ufw allow 3000/tcp  # Stream Bot
sudo ufw allow 5000/tcp  # Dashboard (internal)
sudo ufw allow 8123/tcp  # Home Assistant (if direct access needed)

# Check firewall status
sudo ufw status verbose
```

### Step 4: Configure ZoneEdit Dynamic DNS (Optional)

If using dynamic IP addresses:

```bash
# Install ddclient
sudo apt install -y ddclient

# Configure ZoneEdit
sudo nano /etc/ddclient.conf
```

**ddclient.conf example:**
```
protocol=zoneedit
use=web
server=dynamic.zoneedit.com
login=your-zoneedit-username
password='your-zoneedit-password'
your-domain.com
```

```bash
# Restart ddclient
sudo systemctl restart ddclient
sudo systemctl enable ddclient

# Check status
sudo systemctl status ddclient
```

See [ZONEEDIT_SETUP.md](ZONEEDIT_SETUP.md) for detailed instructions.

### Step 5: Setup Twingate VPN (Optional)

For secure remote access:

1. Visit [Twingate Admin Console](https://app.twingate.com)
2. Create a new network
3. Deploy a connector on your Ubuntu server:

```bash
# Install Twingate connector (follow their documentation)
curl -s https://binaries.twingate.com/connector/setup.sh | sudo bash
```

---

## 📦 Repository Setup

### Step 1: Clone Repository

```bash
# Create directory structure
mkdir -p /home/$USER/contain
cd /home/$USER/contain

# Clone the repository
git clone <your-repository-url> HomeLabHub
cd HomeLabHub

# Verify structure
ls -la
```

Expected output:
```
services/
deployment/
docs/
docker-compose.unified.yml
Caddyfile
homelab-manager.sh
README.md
```

### Step 2: Make Scripts Executable

```bash
chmod +x homelab-manager.sh
chmod +x deployment/*.sh
chmod +x scripts/*.sh
```

### Step 3: Configure Git Credentials

```bash
# Set Git username and email
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"

# Test Git access
git pull
```

---

## ⚙️ Environment Configuration

### Step 1: Generate .env File

Run the homelab manager:

```bash
./homelab-manager.sh
```

Select **Option 9: Generate/Edit .env File**

The script will prompt you for:

### Critical Environment Variables

#### 🗄️ Database Configuration

```bash
# PostgreSQL Database URLs
DATABASE_URL=postgresql://username:password@host:5432/ticketbot
STREAMBOT_DATABASE_URL=postgresql://username:password@host:5432/streambot
JARVIS_DATABASE_URL=postgresql://username:password@host:5432/homelab_jarvis

# Database Credentials (auto-generated)
JARVIS_DB_PASSWORD=<secure-random-password>
```

💡 **Tip:** Use [Neon](https://neon.tech) for managed PostgreSQL or set up your own PostgreSQL instance.

#### 🤖 OpenAI Integration

```bash
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Get your API key from: [OpenAI Platform](https://platform.openai.com/api-keys)

#### 🎮 Stream Bot OAuth Credentials

**Twitch:**
```bash
TWITCH_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITCH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWITCH_SIGNIN_CALLBACK_URL=https://stream.yourdomain.com/api/auth/twitch/callback
```

Register at: [Twitch Developer Console](https://dev.twitch.tv/console/apps)

**YouTube:**
```bash
YOUTUBE_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
YOUTUBE_SIGNIN_CALLBACK_URL=https://stream.yourdomain.com/api/auth/youtube/callback
```

Register at: [Google Cloud Console](https://console.cloud.google.com/)

**Kick:**
```bash
KICK_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KICK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KICK_SIGNIN_CALLBACK_URL=https://stream.yourdomain.com/api/auth/kick/callback
```

Register at: [Kick Developer Portal](https://kick.com/developer)

**Spotify:**
```bash
SPOTIFY_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SPOTIFY_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Register at: [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)

#### 🎪 Discord Bot

```bash
DISCORD_BOT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DISCORD_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Register at: [Discord Developer Portal](https://discord.com/developers/applications)

#### 🏠 Home Assistant Integration

```bash
HOME_ASSISTANT_URL=http://homeassistant:8123
HOME_ASSISTANT_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
HOME_ASSISTANT_VERIFY_SSL=False
```

Get your token from: Home Assistant → Profile → Long-Lived Access Tokens

#### 🎥 OBS WebSocket

```bash
OBS_WEBSOCKET_PASSWORD=your-secure-password
OBS_WEBSOCKET_ENCRYPTION_KEY=base64-encoded-key
```

#### 🌐 Network & Domain Configuration

```bash
# Your primary domain
DOMAIN=yourdomain.com

# Service-specific domains
DASHBOARD_DOMAIN=host.yourdomain.com
STREAMBOT_DOMAIN=stream.yourdomain.com
DISCORD_BOT_DOMAIN=bot.yourdomain.com
PLEX_DOMAIN=plex.yourdomain.com
N8N_DOMAIN=n8n.yourdomain.com
VNC_DOMAIN=vnc.yourdomain.com
CODE_SERVER_DOMAIN=code.yourdomain.com

# User running services
SERVICE_USER=evin
```

#### 🔐 Storage & Security

```bash
# MinIO Object Storage
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=minio_admin_password_change_me

# Session Secret (auto-generated)
SESSION_SECRET=<random-64-char-string>

# Flask Secret Key (auto-generated)
SECRET_KEY=<random-64-char-string>
```

### Step 2: Verify .env File

```bash
# View generated configuration
cat .env

# Check for missing variables
./homelab-manager.sh
# Select Option 10: View Current Configuration
```

⚠️ **Security Warning:** Never commit `.env` to version control. It's already in `.gitignore`.

---

## 🗄️ Database Setup

### Option A: Using Neon (Recommended)

1. Visit [Neon Console](https://console.neon.tech)
2. Create a new project
3. Create 3 databases:
   - `ticketbot` (Discord Bot)
   - `streambot` (Stream Bot)
   - `homelab_jarvis` (Dashboard/Jarvis)
4. Copy connection strings to `.env`

### Option B: Local PostgreSQL

```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create databases
sudo -u postgres psql
```

```sql
-- Create databases
CREATE DATABASE ticketbot;
CREATE DATABASE streambot;
CREATE DATABASE homelab_jarvis;

-- Create users
CREATE USER discord_bot WITH PASSWORD 'secure_password';
CREATE USER stream_bot WITH PASSWORD 'secure_password';
CREATE USER jarvis WITH PASSWORD 'secure_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE ticketbot TO discord_bot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO stream_bot;
GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;

\q
```

Update `.env`:
```bash
DATABASE_URL=postgresql://discord_bot:secure_password@localhost:5432/ticketbot
STREAMBOT_DATABASE_URL=postgresql://stream_bot:secure_password@localhost:5432/streambot
JARVIS_DATABASE_URL=postgresql://jarvis:secure_password@localhost:5432/homelab_jarvis
```

### Step 2: Test Database Connectivity

```bash
# Install PostgreSQL client
sudo apt install -y postgresql-client

# Test connections
psql "postgresql://discord_bot:password@host:5432/ticketbot" -c "SELECT 1;"
psql "postgresql://stream_bot:password@host:5432/streambot" -c "SELECT 1;"
psql "postgresql://jarvis:password@host:5432/homelab_jarvis" -c "SELECT 1;"
```

Expected output: `1` for each query

---

## 🚀 First Deployment

### Step 1: Run Homelab Manager

```bash
cd /home/$USER/contain/HomeLabHub
./homelab-manager.sh
```

### Step 2: Select Full Deploy

```
━━━ What would you like to do? ━━━

Deployment:
  1) 🚀 Full Deploy (build and start all services)
  2) 🔄 Quick Restart (restart without rebuilding)
  3) ⚡ Rebuild & Deploy (force rebuild + restart)
```

Select **Option 1: Full Deploy**

### Step 3: Monitor Build Progress

The deployment script will:

1. ✅ Fix code-server permissions
2. ✅ Build Docker images (5-15 minutes)
3. ✅ Start 15 services
4. ✅ Initialize databases
5. ✅ Run migrations
6. ✅ Generate SSL certificates

**Expected output:**

```bash
Building with --no-cache to ensure fresh environment variables...
[+] Building 125.3s (45/45) FINISHED
...
✓ Container homelab-dashboard       Started
✓ Container homelab-celery-worker   Started
✓ Container stream-bot              Started
✓ Container discord-bot             Started
✓ Container caddy                   Started
✓ Container n8n                     Started
✓ Container plex-server             Started
✓ Container homelab-redis           Started
✓ Container homelab-minio           Started
✓ Container vnc-desktop             Started
✓ Container code-server             Started
✓ Container homeassistant           Started
...
✓ All services healthy (15/15)
```

### Step 4: Check Running Services

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Expected: 15 containers running

---

## 🔒 SSL/HTTPS Configuration

### Automatic SSL with Caddy

Caddy automatically obtains SSL certificates from Let's Encrypt for all configured domains.

### Step 1: Verify Caddyfile

```bash
cat Caddyfile
```

Example configuration:
```
host.yourdomain.com {
    reverse_proxy homelab-dashboard:5000
}

stream.yourdomain.com {
    reverse_proxy stream-bot:3000
}

# ... other domains
```

### Step 2: Configure DNS Records

For each domain, create an **A record** pointing to your server's IP:

| Domain | Type | Value |
|--------|------|-------|
| host.yourdomain.com | A | YOUR_SERVER_IP |
| stream.yourdomain.com | A | YOUR_SERVER_IP |
| bot.yourdomain.com | A | YOUR_SERVER_IP |

### Step 3: Wait for SSL Certificates

Caddy automatically requests certificates. Check logs:

```bash
docker logs caddy
```

Look for:
```
[INFO] Certificate obtained successfully
```

### Step 4: Test HTTPS

```bash
curl -I https://host.yourdomain.com
```

Expected: `HTTP/2 200` with valid SSL certificate

### Troubleshooting SSL

If certificates fail:

```bash
# Check Caddy logs
docker logs caddy

# Format Caddyfile
./homelab-manager.sh
# Select Option 13a: Format Caddyfile

# Restart Caddy
docker restart caddy
```

Common issues:
- ❌ DNS not propagated → Wait 5-15 minutes
- ❌ Port 80/443 blocked → Check firewall
- ❌ Domain validation failed → Verify DNS A records

---

## ✅ Post-Deployment Verification

### Step 1: Run Full Verification

```bash
./homelab-manager.sh
# Select Option 23: Run Full Deployment Verification
```

This checks:
- ✅ All containers running
- ✅ Database connectivity
- ✅ Redis connection
- ✅ MinIO access
- ✅ Service URLs accessible
- ✅ SSL certificates valid

### Step 2: Access Service URLs

| Service | URL | Expected |
|---------|-----|----------|
| **Dashboard** | https://host.yourdomain.com | Nebula Command login |
| **Stream Bot** | https://stream.yourdomain.com | Stream Bot dashboard |
| **Discord Bot** | https://bot.yourdomain.com | Discord Bot UI |
| **Plex** | https://plex.yourdomain.com | Plex login |
| **n8n** | https://n8n.yourdomain.com | n8n workflow editor |
| **VNC** | https://vnc.yourdomain.com | noVNC interface |
| **Code Server** | https://code.yourdomain.com | VS Code login |

### Step 3: Test OAuth Flows

**Stream Bot OAuth:**

1. Visit https://stream.yourdomain.com
2. Click "Connect Twitch"
3. Complete OAuth flow
4. Verify connection successful

Repeat for YouTube, Kick, Spotify

### Step 4: Verify Database Connectivity

```bash
# Check database migrations
./homelab-manager.sh
# Select Option 7: Check Database Status
```

Expected output:
```
✓ Discord Bot DB: Connected
✓ Stream Bot DB: Connected
✓ Jarvis DB: Connected
✓ All migrations applied
```

### Step 5: Test Jarvis AI

1. Login to Dashboard: https://host.yourdomain.com
2. Open Jarvis chat
3. Send message: "Hello Jarvis"
4. Verify AI response

---

## 🔄 Auto-Sync Setup (Replit → Ubuntu)

Automatically sync code changes from Replit to your Ubuntu server.

### Step 1: Generate SSH Key on Ubuntu

```bash
ssh-keygen -t ed25519 -C "homelab-autosync"
cat ~/.ssh/id_ed25519.pub
```

Copy the public key.

### Step 2: Add Deploy Key to Replit

1. Go to your Replit project
2. Navigate to Settings → Deploy keys
3. Add the public key

### Step 3: Install Auto-Sync

```bash
./homelab-manager.sh
# Select Option 18: Install Auto-Sync (every 5 minutes)
```

This creates a cron job that:
1. Pulls latest changes from Replit every 5 minutes
2. Automatically rebuilds and redeploys on changes
3. Logs all sync activity

### Step 4: Verify Auto-Sync Status

```bash
./homelab-manager.sh
# Select Option 19: Check Auto-Sync Status
```

### Step 5: Test Auto-Sync

1. Make a small change in Replit
2. Commit and push
3. Wait 5 minutes
4. Verify deployment on Ubuntu:

```bash
docker ps
git log -1
```

### Manual Sync

```bash
./homelab-manager.sh
# Select Option 17: Sync from Replit (pull latest code & auto-deploy)
```

---

## 🎉 Next Steps

Congratulations! Your Nebula Command AI Homelab is now deployed.

### Recommended Next Steps:

1. **📚 Read User Manual**
   - See [USER_MANUAL.md](USER_MANUAL.md) for detailed feature usage

2. **🔐 Configure Integrations**
   - Set up Home Assistant devices
   - Connect streaming platforms
   - Configure Discord bot

3. **🎨 Customize Services**
   - Customize Jarvis personality
   - Add custom commands to Stream Bot
   - Install apps from Marketplace

4. **📊 Monitor System**
   - Set up health monitoring
   - Configure alerts
   - Review logs regularly

5. **🔒 Enhance Security**
   - Review [SECURITY.md](SECURITY.md)
   - Enable 2FA on services
   - Regular security updates

### Useful Commands

```bash
# View all logs
./homelab-manager.sh → Option 11

# Health check
./homelab-manager.sh → Option 12

# Restart specific service
./homelab-manager.sh → Option 6

# Troubleshoot issues
./homelab-manager.sh → Option 13
```

---

## 📚 Additional Resources

- **[USER_MANUAL.md](USER_MANUAL.md)** - Complete feature guide
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** - API reference
- **[TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)** - Common issues and solutions
- **[WORKSPACE_STRUCTURE.md](WORKSPACE_STRUCTURE.md)** - Codebase overview

---

## 🆘 Getting Help

If you encounter issues:

1. Check [TROUBLESHOOTING_GUIDE.md](TROUBLESHOOTING_GUIDE.md)
2. Run diagnostics: `./homelab-manager.sh` → Option 12b
3. View logs: `./homelab-manager.sh` → Option 11
4. Check GitHub issues
5. Review service-specific logs: `docker logs <service-name>`

---

**Last Updated:** November 2025  
**Deployment Version:** 2.0  
**Ubuntu Version:** 25.10  
**Architecture:** Docker Compose + Caddy + PostgreSQL
