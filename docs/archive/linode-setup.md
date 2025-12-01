# Linode Server Setup

Step-by-step guide to deploy HomeLabHub cloud services on Linode.

## Step 1: Create Linode VM

### Via Linode Cloud Manager

1. Log in to [Linode Cloud Manager](https://cloud.linode.com/)
2. Click **Create Linode**
3. Configure:
   - **Image**: Ubuntu 24.04 LTS (or 22.04 LTS)
   - **Region**: Choose closest to you (e.g., us-east)
   - **Plan**: Shared CPU → Linode 4GB ($24/mo) or 8GB ($48/mo)
   - **Label**: `homelab-cloud`
   - **Root Password**: Generate and save securely
   - **SSH Keys**: Add your public key (recommended)

4. Click **Create Linode**
5. Note the IP address once provisioned

### Via Linode CLI (Optional)

```bash
# Install Linode CLI
pip install linode-cli

# Configure
linode-cli configure

# Create Linode
linode-cli linodes create \
  --label homelab-cloud \
  --image linode/ubuntu24.04 \
  --region us-east \
  --type g6-standard-2 \
  --root_pass "YOUR_SECURE_PASSWORD" \
  --authorized_keys "$(cat ~/.ssh/id_rsa.pub)"
```

## Step 2: Initial Server Access

```bash
# SSH into the new server
ssh root@<linode-ip>

# Update system packages
apt update && apt upgrade -y

# Install essential tools
apt install -y git curl wget vim htop
```

## Step 3: Clone Repository

```bash
# Create deployment directory
mkdir -p /opt/homelab
cd /opt/homelab

# Clone HomeLabHub
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub
```

## Step 4: Install Docker & Tailscale

**Important**: Do NOT use rootless Docker. Regular Docker with root privileges is the correct approach for a server deployment.

```bash
# Install Docker (as root)
curl -fsSL https://get.docker.com | sh

# Verify Docker is running
docker version

# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
```

### Optional: Create Non-Root User for Docker (More Secure)

If you want to run Docker commands as a non-root user:

```bash
# Create homelab user
useradd -m -s /bin/bash homelab

# Add to docker group
usermod -aG docker homelab

# Switch to homelab user for remaining steps
su - homelab
```

### Alternative: Run Bootstrap Script

The bootstrap script does all of the above automatically:

```bash
chmod +x deploy/scripts/bootstrap-linode.sh
sudo ./deploy/scripts/bootstrap-linode.sh
```

What the script does:
1. Installs Docker and Docker Compose
2. Installs Tailscale VPN
3. Configures UFW firewall
4. Creates directory structure
5. Sets up PostgreSQL init scripts
6. Creates environment template

## Step 5: Authenticate Tailscale

```bash
# Start Tailscale authentication
sudo tailscale up

# This will output a URL - open it in your browser to authenticate
# Example: https://login.tailscale.com/a/abc123xyz

# Verify connection
tailscale status
tailscale ip -4  # Note this IP for local host configuration
```

**Important**: Save the Tailscale IP (100.x.x.x) - you'll need it for local host setup.

### Optional: Set Hostname
```bash
sudo tailscale up --hostname=homelab-cloud
```

## Step 6: Configure Environment

```bash
# Create .env from template
cp .env.example .env

# Set secure permissions
chmod 600 .env

# Edit with your credentials
nano .env
```

### Required Variables
```bash
# Database passwords (generate with: openssl rand -base64 24)
POSTGRES_PASSWORD=your_postgres_password
DISCORD_DB_PASSWORD=your_discord_db_password
STREAMBOT_DB_PASSWORD=your_streambot_db_password
JARVIS_DB_PASSWORD=your_jarvis_db_password

# Dashboard login
WEB_USERNAME=admin
WEB_PASSWORD=your_dashboard_password

# Discord Bot (from Discord Developer Portal)
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret

# OpenAI (from platform.openai.com)
OPENAI_API_KEY=sk-your_api_key

# Session secrets (generate with: openssl rand -hex 32)
SESSION_SECRET=generated_session_secret
SECRET_KEY=generated_secret_key
DISCORD_SESSION_SECRET=generated_discord_secret
```

### Optional Variables
```bash
# Twitch integration
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

# YouTube integration
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=

# Code Server password
CODE_SERVER_PASSWORD=your_code_password

# n8n authentication
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=your_n8n_password

# Local host Tailscale IP (after local setup)
LOCAL_TAILSCALE_IP=100.x.x.x
```

## Step 7: Deploy Services

```bash
# Run the main bootstrap
./deploy/scripts/bootstrap.sh
```

### Expected Output
```
═══════════════════════════════════════════════════════════════
  HOMELAB BOOTSTRAP
  Project: /opt/homelab/HomeLabHub
═══════════════════════════════════════════════════════════════

[1/6] Checking Docker...
✓ Docker ready

[2/6] Setting up environment...
✓ Generated SERVICE_AUTH_TOKEN
✓ Environment ready

[2b/6] Creating required directories...
✓ Directories ready

[3/6] Pulling Docker images...
✓ Images ready

[4/6] Building custom images...
✓ Images built

[5/6] Starting services...
Waiting for PostgreSQL... ready
✓ Services started

[6/6] Setting up self-healing cron...
✓ Self-healing cron installed (every 5 minutes)

═══════════════════════════════════════════════════════════════
✅ BOOTSTRAP COMPLETE

Services: 12/12 running
```

## Step 8: Verify Services

```bash
# Check service status
./homelab status

# View running containers
docker compose ps

# Check service health
./homelab health

# View logs if issues
./homelab logs
```

### Expected Services

| Container | Status | Health |
|-----------|--------|--------|
| caddy | Running | Healthy |
| homelab-postgres | Running | Healthy |
| homelab-redis | Running | Healthy |
| homelab-dashboard | Running | Healthy |
| homelab-celery-worker | Running | - |
| discord-bot | Running | Healthy |
| stream-bot | Running | Healthy |
| n8n | Running | - |
| code-server | Running | - |
| code-server-proxy | Running | - |
| scarletredjoker-web | Running | - |
| rig-city-site | Running | - |

## Step 9: Configure Cloudflare DNS

Log into Cloudflare and add these DNS records pointing to your Linode IP:

### Primary Domain (evindrake.net)
```
Type  Name                Value            Proxy
A     host                <linode-ip>      ✓
A     dashboard           <linode-ip>      ✓
A     code                <linode-ip>      ✓
A     n8n                 <linode-ip>      ✓
A     vnc                 <linode-ip>      ✓
A     plex                <linode-ip>      ✓
A     home                <linode-ip>      ✓
A     game                <linode-ip>      ✓
```

### Secondary Domain (rig-city.com)
```
Type  Name                Value            Proxy
A     @                   <linode-ip>      ✓
A     www                 <linode-ip>      ✓
A     bot                 <linode-ip>      ✓
A     stream              <linode-ip>      ✓
```

### Personal Site (scarletredjoker.com)
```
Type  Name                Value            Proxy
A     @                   <linode-ip>      ✓
A     www                 <linode-ip>      ✓
```

### DNS Propagation
Wait 5-10 minutes for DNS propagation, then verify:

```bash
# Check DNS resolution
dig host.evindrake.net +short
dig bot.rig-city.com +short

# Test HTTPS access
curl -I https://host.evindrake.net/health
```

## Step 10: Verify SSL Certificates

Caddy automatically provisions SSL certificates via Let's Encrypt.

```bash
# Check Caddy logs for certificate status
docker compose logs caddy | grep -i "certificate"

# Verify HTTPS is working
curl -I https://host.evindrake.net
```

Expected response:
```
HTTP/2 200
server: Caddy
strict-transport-security: max-age=31536000; includeSubDomains; preload
```

## Post-Deployment Tasks

### Set Up Backups
```bash
# Create backup directory
mkdir -p /opt/homelab/backups

# Add to crontab (daily backups at 3am)
crontab -e
# Add: 0 3 * * * /opt/homelab/HomeLabHub/scripts/backup.sh
```

### Enable Monitoring
```bash
# Check self-healing cron is active
crontab -l | grep homelab-heal
```

### Test Dashboard Login
1. Open https://host.evindrake.net
2. Login with `WEB_USERNAME` and `WEB_PASSWORD`
3. Verify dashboard loads correctly

## Troubleshooting

### Services Not Starting
```bash
# Check Docker logs
docker compose logs --tail 50

# Check specific service
docker compose logs homelab-dashboard

# Restart services
./homelab restart
```

### Database Connection Issues
```bash
# Verify PostgreSQL is healthy
docker compose logs homelab-postgres

# Check database users were created
docker exec -it homelab-postgres psql -U postgres -c "\du"

# Manually run init script if needed
docker exec -it homelab-postgres bash -c "
  export DISCORD_DB_PASSWORD=your_password
  export STREAMBOT_DB_PASSWORD=your_password
  export JARVIS_DB_PASSWORD=your_password
  /docker-entrypoint-initdb.d/00-init-all-databases.sh
"
```

### SSL Certificate Issues
```bash
# Check Caddy logs
docker compose logs caddy | tail -50

# Force certificate renewal
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Next Steps

1. [Set up local host](local-setup.md) to run Plex, Home Assistant, etc.
2. [Configure secrets](secrets.md) for secure credential management
3. [Set up email](email.md) for notifications
