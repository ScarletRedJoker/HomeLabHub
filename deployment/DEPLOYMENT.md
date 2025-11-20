# HomeLabHub Deployment Guide

## Table of Contents
1. [Overview](#overview)
2. [Dual-Environment Architecture](#dual-environment-architecture)
3. [Prerequisites](#prerequisites)
4. [Replit Deployment (Development/Testing)](#replit-deployment)
5. [Ubuntu Production Deployment](#ubuntu-production-deployment)
6. [Obtaining Credentials](#obtaining-credentials)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)

---

## Overview

HomeLabHub is designed to work in two environments:
- **Replit**: Development and testing with automatic credential management
- **Ubuntu Server**: Production deployment with self-managed credentials

Both environments use the same codebase but detect their runtime environment automatically.

---

## Dual-Environment Architecture

### Environment Detection

The system automatically detects its environment by checking for:
- `REPL_ID` environment variable (Replit-specific)
- `REPLIT_CONNECTORS_HOSTNAME` environment variable (Replit Connectors)

### Configuration Files

| File | Purpose | Commit to Git? |
|------|---------|----------------|
| `.env.example` | Template with documentation | ✅ Yes |
| `.env.replit` | Replit-specific configuration | ❌ No |
| `.env.production` | Ubuntu production configuration | ❌ No |

### Key Differences

| Feature | Replit | Production (Ubuntu) |
|---------|--------|---------------------|
| OpenAI API | AI Integrations (automatic) | Self-managed API key |
| YouTube OAuth | Manual OAuth credentials | Manual OAuth credentials |
| Google Services | Replit Connectors | Optional manual setup |
| Database URLs | `${VAR}` expansion allowed | Fully resolved (no `${VAR}`) |
| Domain | `*.replit.dev` | Custom domains |

---

## Prerequisites

### For Replit Deployment
- Replit account with appropriate plan
- Access to Replit AI Integrations
- Access to Replit Connectors (for YouTube, Google services)

### For Ubuntu Production Deployment
- Ubuntu 22.04 LTS or newer
- Minimum 4GB RAM (8GB+ recommended)
- Docker and Docker Compose installed
- Domain names configured
- SSL certificates (via Caddy or Let's Encrypt)
- API keys and credentials (see [Obtaining Credentials](#obtaining-credentials))

---

## Replit Deployment

### Step 1: Setup Replit Integrations

1. **OpenAI Integration** (Required for AI features):
   ```
   Click "Tools" → "AI Integrations" → "Setup OpenAI"
   ```
   This automatically provides `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`

2. **YouTube OAuth** (Required for user YouTube connections):
   - Get OAuth credentials from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Note: YouTube Connector is for DEVELOPER API access, not for app USERS to connect their accounts
   - Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in `.env.replit`

3. **Google Services Connectors** (Optional):
   - Google Calendar
   - Gmail
   - Google Drive

### Step 2: Create .env.replit

Copy the template:
```bash
cp .env.example .env.replit
```

Edit `.env.replit` with Replit-specific values:
```bash
# Core Configuration
SERVICE_USER=runner
POSTGRES_PASSWORD=your_secure_password_here
WEB_USERNAME=admin
WEB_PASSWORD=your_dashboard_password_here

# AI Integration (automatically provided by Replit)
AI_INTEGRATIONS_OPENAI_API_KEY=  # Leave empty, auto-filled
AI_INTEGRATIONS_OPENAI_BASE_URL=  # Leave empty, auto-filled

# YouTube OAuth (required for user connections)
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
YOUTUBE_REDIRECT_URI=https://${REPLIT_DEV_DOMAIN}/api/auth/youtube/callback
```

### Step 3: Start Workflows

The following workflows should already be configured:
- `stream-bot`: Stream-bot service on port 5000
- `discord-bot`: Discord bot service

Click "Run" to start all workflows.

### Step 4: Test Features

Run the test script:
```bash
./deployment/test-all-features.sh
```

This tests:
- Environment detection
- OpenAI API connectivity
- Database configuration
- Python and TypeScript services
- YouTube OAuth setup
- VNC Desktop configuration

---

## Ubuntu Production Deployment

### Step 1: Install Prerequisites

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose -y

# Install Git
sudo apt install git -y

# Reboot to apply docker group changes
sudo reboot
```

### Step 2: Clone Repository

```bash
# Clone to /opt/homelabhub
sudo mkdir -p /opt
cd /opt
sudo git clone https://github.com/yourusername/homelabhub.git
cd homelabhub
```

### Step 3: Create .env.production

**IMPORTANT**: Do NOT copy `.env.production` from Replit. Create it fresh on your Ubuntu server.

```bash
# Copy template
cp .env.example .env.production

# Edit with your production values
nano .env.production
```

**Critical Requirements**:
1. All `DATABASE_URL` values must be fully resolved (NO `${VAR}` expansion)
2. Use your own OpenAI API key (not Replit integration)
3. Use your own YouTube OAuth credentials (not Replit connector)
4. Update all domain names to your actual domains

Example `.env.production`:
```bash
# Database URLs - FULLY RESOLVED (no ${VAR})
JARVIS_DATABASE_URL=postgresql://jarvis:your_jarvis_password@homelab-postgres:5432/homelab_jarvis
STREAMBOT_DATABASE_URL=postgresql://streambot:your_streambot_password@homelab-postgres:5432/streambot
DISCORD_DATABASE_URL=postgresql://ticketbot:your_discord_password@homelab-postgres:5432/ticketbot

# OpenAI - Your own API key
OPENAI_API_KEY=sk-proj-your_actual_openai_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# YouTube - Your OAuth credentials
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your-client-secret
YOUTUBE_SIGNIN_CALLBACK_URL=https://stream.yourdomain.com/api/auth/youtube/callback

# Service URLs - Your actual domains
DISCORD_BOT_URL=https://bot.yourdomain.com
PLEX_URL=https://plex.yourdomain.com
STATIC_SITE_URL=https://yourdomain.com
```

### Step 4: Set Secure Permissions

```bash
# Secure the .env file
sudo chmod 600 .env.production
sudo chown $USER:$USER .env.production

# Set ownership
sudo chown -R $USER:$USER /opt/homelabhub
```

### Step 5: Deploy Services

Use the automated deployment script:
```bash
cd /opt/homelabhub
./deployment/deploy-to-ubuntu.sh
```

Or manually:
```bash
# Pull images
docker-compose pull

# Start services
docker-compose --env-file .env.production up -d --build

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Step 6: Configure Reverse Proxy (Caddy)

The included `docker-compose.yml` uses Caddy for HTTPS. Update `Caddyfile`:

```caddy
# Dashboard
yourdomain.com {
    reverse_proxy dashboard:5000
}

# Stream-bot
stream.yourdomain.com {
    reverse_proxy stream-bot:5000
}

# Discord Bot
bot.yourdomain.com {
    reverse_proxy discord-bot:3000
}

# Plex
plex.yourdomain.com {
    reverse_proxy plex:32400
}

# VNC
vnc.yourdomain.com {
    reverse_proxy vnc-desktop:6080
}
```

### Step 7: Configure Firewall

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable
```

### Step 8: Verify Deployment

```bash
# Check all services are running
docker-compose ps

# Test dashboard
curl -I https://yourdomain.com

# Test stream-bot
curl -I https://stream.yourdomain.com

# Check logs for errors
docker-compose logs --tail=100
```

---

## Obtaining Credentials

### OpenAI API Key

**For Production (Ubuntu)**:
1. Go to https://platform.openai.com/api-keys
2. Sign in or create an account
3. Click "Create new secret key"
4. Copy the key (starts with `sk-proj-`)
5. Add to `.env.production`: `OPENAI_API_KEY=sk-proj-...`

**For Replit**:
- Automatically provided via AI Integrations (no manual setup needed)

### YouTube OAuth Credentials

**For Production (Ubuntu)**:
1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable "YouTube Data API v3"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Application type: "Web application"
6. Authorized redirect URIs: `https://stream.yourdomain.com/api/auth/youtube/callback`
7. Copy Client ID and Client Secret
8. Add to `.env.production`:
   ```
   YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=your-client-secret
   YOUTUBE_REDIRECT_URI=https://stream.yourdomain.com/api/auth/youtube/callback
   ```

**For Replit**:
1. Follow same steps as production above
2. Set redirect URI to: `https://your-replit-domain.replit.dev/api/auth/youtube/callback`
3. Add to `.env.replit`:
   ```
   YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   YOUTUBE_CLIENT_SECRET=your-client-secret
   YOUTUBE_REDIRECT_URI=https://${REPLIT_DEV_DOMAIN}/api/auth/youtube/callback
   ```
Note: YouTube Connector is for DEVELOPER API access, not for user OAuth

### Plex Token

**For Both Environments**:
1. Log in to Plex Web App: https://app.plex.tv
2. Browse to any library item
3. Click "..." → "Get Info" → "View XML"
4. Look for `X-Plex-Token` in the URL
5. Copy the token value
6. Add to `.env`: `PLEX_TOKEN=your_plex_token_here`

### Discord Bot Token

**For Both Environments**:
1. Go to https://discord.com/developers/applications
2. Click "New Application"
3. Go to "Bot" → "Add Bot"
4. Click "Reset Token" → Copy the token
5. Add to `.env`: `DISCORD_BOT_TOKEN=your_discord_token_here`
6. Enable required intents: Message Content, Server Members, Presence

---

## Testing

### Automated Testing

Run the comprehensive test suite:
```bash
./deployment/test-all-features.sh
```

This validates:
- Environment detection
- Critical environment variables
- OpenAI API connectivity
- Database URL resolution
- Python and TypeScript services
- YouTube OAuth configuration
- VNC Desktop setup
- Docker Compose syntax

### Manual Testing

#### Test Jarvis AI (Dashboard)
1. Open dashboard: `https://yourdomain.com` (or Replit URL)
2. Log in with credentials from `.env`
3. Go to "AI Chat" section
4. Send a message: "Hello, can you help me?"
5. Verify AI responds correctly

#### Test Stream-bot Fact Generation
1. Open stream-bot: `https://stream.yourdomain.com`
2. Log in to the dashboard
3. Navigate to "Snapple Facts"
4. Click "Generate New Fact"
5. Verify AI generates a custom fact

#### Test YouTube OAuth
1. Open stream-bot settings
2. Click "Connect YouTube"
3. Authorize with Google account
4. Verify successful connection
5. Check "Connected Accounts" shows YouTube

#### Test VNC Desktop
1. Open VNC: `https://vnc.yourdomain.com`
2. Enter VNC password from `.env`
3. Verify desktop loads in browser
4. Test window manager functionality

---

## Troubleshooting

### Common Issues

#### 1. OpenAI API Not Working

**Symptoms**: AI features return errors or "API not configured"

**Solutions**:
- **Replit**: Ensure AI Integrations are set up correctly
- **Production**: Verify `OPENAI_API_KEY` is set and valid
- Check logs: `docker-compose logs dashboard` or `docker-compose logs stream-bot`
- Test API key manually:
  ```bash
  curl https://api.openai.com/v1/models \
    -H "Authorization: Bearer $OPENAI_API_KEY"
  ```

#### 2. Database Connection Errors

**Symptoms**: "could not connect to database" or "authentication failed"

**Replit**:
- Database URLs can use `${VAR}` expansion
- Example: `postgresql://user:${PASSWORD}@db:5432/dbname`

**Production**:
- Database URLs must be FULLY RESOLVED (no `${VAR}`)
- Example: `postgresql://user:actual_password@homelab-postgres:5432/dbname`
- Verify password matches in all places
- Check PostgreSQL is running: `docker-compose ps`

#### 3. YouTube OAuth Not Working

**Symptoms**: "YouTube not configured" or OAuth redirect fails

**Replit**:
- Set `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in `.env.replit`
- Ensure `YOUTUBE_REDIRECT_URI` uses `${REPLIT_DEV_DOMAIN}` (automatically set in workflow)
- Note: YouTube Connector is for DEVELOPER API access, not for user OAuth

**Production**:
- Verify `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` are set
- Check redirect URI matches Google Cloud Console configuration
- Ensure callback URL uses HTTPS (not HTTP)

#### 4. VNC Desktop Won't Start

**Symptoms**: noVNC shows connection error or blank screen

**Solutions**:
- Check `NOVNC_ENABLE=true` in `.env`
- Verify entrypoint script is executable:
  ```bash
  chmod +x services/vnc-desktop/docker-entrypoint.sh
  ```
- Check logs: `docker-compose logs vnc-desktop`
- Ensure websockify is running on port 6080

#### 5. Services Not Starting

**Symptoms**: `docker-compose ps` shows services as "Exited"

**Solutions**:
- Check logs for specific error: `docker-compose logs service-name`
- Verify `.env.production` exists and has correct permissions (600)
- Ensure all required environment variables are set
- Check for port conflicts: `sudo netstat -tulpn | grep LISTEN`
- Restart services: `docker-compose restart`

#### 6. SSL/HTTPS Issues

**Symptoms**: "Certificate error" or "Connection not secure"

**Solutions**:
- Verify Caddy is running: `docker-compose ps caddy`
- Check Caddy logs: `docker-compose logs caddy`
- Ensure DNS records point to your server
- Wait for Let's Encrypt certificate generation (can take 1-2 minutes)
- Verify `LETSENCRYPT_EMAIL` is set in `.env`

### Debugging Commands

```bash
# View all running containers
docker-compose ps

# View logs for specific service
docker-compose logs -f service-name

# View last 100 lines of all logs
docker-compose logs --tail=100

# Restart specific service
docker-compose restart service-name

# Rebuild and restart all services
docker-compose down && docker-compose up -d --build

# Access service shell
docker-compose exec service-name /bin/bash

# Check environment variables in container
docker-compose exec service-name env

# Test database connection
docker-compose exec homelab-postgres psql -U postgres -c "\\l"
```

### Getting Help

If you encounter issues:
1. Check logs: `docker-compose logs -f`
2. Run test suite: `./deployment/test-all-features.sh`
3. Verify `.env` configuration matches requirements
4. Check this troubleshooting guide
5. Review service-specific README files in `services/` directories

---

## Maintenance

### Backups

#### Automated Backups
The system includes backup functionality via Google Drive (optional):
```bash
# Enable in .env
DRIVE_AUTO_BACKUP_ENABLED=true
DRIVE_AUTO_BACKUP_SCHEDULE=0 2 * * *  # Daily at 2 AM
```

#### Manual Backups
```bash
# Backup databases
docker-compose exec homelab-postgres pg_dumpall -U postgres > backup.sql

# Backup .env file
cp .env.production /secure/location/.env.production.backup

# Backup uploaded files
tar -czf uploads-backup.tar.gz ./data/uploads/
```

### Updates

```bash
# Pull latest code
cd /opt/homelabhub
git pull

# Rebuild and restart services
docker-compose down
docker-compose up -d --build

# Check for errors
docker-compose logs --tail=100
```

### Monitoring

```bash
# Monitor resource usage
docker stats

# Check service health
docker-compose ps

# View real-time logs
docker-compose logs -f

# Check disk usage
df -h
du -sh /opt/homelabhub/*
```

---

## Security Best Practices

1. **Secure .env files**: Always use `chmod 600` on `.env.production`
2. **Never commit secrets**: Ensure `.env.production` is in `.gitignore`
3. **Use strong passwords**: Generate with `openssl rand -base64 32`
4. **Enable firewall**: Use `ufw` to restrict ports
5. **Keep updated**: Regularly update Docker images and system packages
6. **Use HTTPS**: Always use SSL/TLS in production (Caddy handles this)
7. **Limit access**: Use VPN or IP whitelisting for admin interfaces
8. **Monitor logs**: Regularly check for suspicious activity
9. **Backup regularly**: Automate database and file backups
10. **Rotate secrets**: Periodically update API keys and passwords

---

## Additional Resources

- **Replit Docs**: https://docs.replit.com
- **Docker Docs**: https://docs.docker.com
- **OpenAI API**: https://platform.openai.com/docs
- **YouTube API**: https://developers.google.com/youtube/v3
- **Discord Developer**: https://discord.com/developers/docs
- **Plex Support**: https://support.plex.tv

---

## License

See LICENSE file in repository root.

## Contributing

See CONTRIBUTING.md for contribution guidelines.

---

**Last Updated**: November 20, 2025
