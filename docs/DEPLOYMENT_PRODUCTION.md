# Production Deployment Guide

Complete guide for deploying all HomeLabHub services to production on Ubuntu 25.10.

## Prerequisites

- Ubuntu 25.10 server
- Docker & Docker Compose installed
- Domain names configured with DNS
- Port forwarding (80, 443) configured on router
- Twingate VPN (optional)

## Environment Variables

### Required Secrets

Create `.env` file in repository root:

```env
# Database
DISCORD_DB_PASSWORD=your-secure-password
STREAMBOT_DB_PASSWORD=your-secure-password
JARVIS_DB_PASSWORD=your-secure-password

# Stream Bot
STREAMBOT_SESSION_SECRET=your-session-secret-32-chars
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
STREAMBOT_OPENAI_API_KEY=your-openai-api-key
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret

# Discord Bot
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_APP_ID=your-discord-app-id
VITE_DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_SESSION_SECRET=your-session-secret-32-chars

# Dashboard
CODE_SERVER_PASSWORD=your-dashboard-password
DASHBOARD_API_KEY=your-api-key
SECRET_KEY=your-flask-secret-key
VNC_PASSWORD=your-vnc-password
VNC_USER_PASSWORD=your-vnc-user-password

# MinIO
MINIO_ROOT_USER=your-minio-username
MINIO_ROOT_PASSWORD=your-minio-password-min-8-chars

# Plex (optional)
PLEX_CLAIM=your-plex-claim-token

# Service User
SERVICE_USER=evin
```

Generate secure secrets:
```bash
openssl rand -base64 32  # For SESSION_SECRET, DASHBOARD_API_KEY
openssl rand -hex 16     # For passwords
```

## Deployment Steps

### 1. Clone Repository

```bash
cd /home/evin/contain/
git clone <repository-url> HomeLabHub
cd HomeLabHub
```

### 2. Configure Environment

```bash
cp .env.example .env
nano .env  # Fill in all required secrets
```

### 3. Update Domain Configuration

Edit `Caddyfile` with your domains:
```caddyfile
bot.rig-city.com {
    reverse_proxy discord-bot:5000
}

stream.rig-city.com {
    reverse_proxy stream-bot:5000
}

host.evindrake.net {
    reverse_proxy homelab-dashboard:5000
}

# ... other domains
```

### 4. Build and Deploy

```bash
# Build all services
docker-compose -f docker-compose.unified.yml build

# Start services
docker-compose -f docker-compose.unified.yml up -d

# View logs
docker-compose -f docker-compose.unified.yml logs -f
```

### 5. Health Checks

Verify all services are healthy:

```bash
# Stream Bot
curl https://stream.rig-city.com/health
curl https://stream.rig-city.com/ready

# Discord Bot
curl https://bot.rig-city.com/health
curl https://bot.rig-city.com/ready

# Dashboard
curl https://host.evindrake.net/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-14T...",
  "uptime": 123.45,
  "service": "stream-bot"
}
```

### 6. Database Migrations

Migrations run automatically on container startup. To verify:

```bash
# Stream Bot
docker exec stream-bot npm run db:migrate

# Discord Bot
docker exec discord-bot npm run db:migrate

# Dashboard
docker exec homelab-dashboard flask db upgrade
```

### 7. SSL Verification

Caddy auto-provisions SSL certificates via Let's Encrypt. Verify:

```bash
# Check certificate
curl -vI https://stream.rig-city.com 2>&1 | grep "SSL certificate verify"

# Check HTTPS redirect
curl -I http://stream.rig-city.com  # Should redirect to HTTPS
```

## Post-Deployment

### Configure Stream Bot OAuth

1. Visit Twitch Developers Console
2. Add redirect URL: `https://stream.rig-city.com/auth/twitch/callback`
3. Repeat for Google OAuth Console

### Configure Discord Bot

1. Visit Discord Developer Portal
2. Add redirect URL: `https://bot.rig-city.com/auth/discord/callback`
3. Update bot invite link with proper permissions

### Test Features

- [ ] Stream Bot: Login with Twitch/Google
- [ ] Stream Bot: Connect platform (Twitch/Kick)
- [ ] Stream Bot: Test AI chat command
- [ ] Discord Bot: Login with Discord
- [ ] Discord Bot: Create support ticket
- [ ] Dashboard: Login with credentials
- [ ] Dashboard: View service status

## Automated Sync (Development → Production)

Setup automatic code synchronization from Replit:

```bash
cd /home/evin/contain/HomeLabHub
./deployment/install-auto-sync.sh
```

This creates a cron job that runs every 5 minutes:
```cron
*/5 * * * * /home/evin/contain/HomeLabHub/deployment/sync-from-replit.sh
```

## Rollback

If issues occur, rollback to previous version:

```bash
# Stop services
docker-compose -f docker-compose.unified.yml down

# Revert code
git log --oneline  # Find previous commit
git checkout <commit-hash>

# Rebuild and restart
docker-compose -f docker-compose.unified.yml up -d --build
```

## Monitoring

### Log Locations

- Stream Bot: `services/stream-bot/logs/`
- Discord Bot: `services/discord-bot/logs/`
- Dashboard: `services/dashboard/logs/`

### View Live Logs

```bash
# All services
docker-compose -f docker-compose.unified.yml logs -f

# Specific service
docker-compose -f docker-compose.unified.yml logs -f stream-bot

# Last 100 lines
docker-compose -f docker-compose.unified.yml logs --tail=100 stream-bot
```

### Resource Usage

```bash
# Container stats
docker stats

# Disk usage
docker system df
```

## Backup

### Database Backup

```bash
# PostgreSQL backup
docker exec discord-bot-db pg_dump -U streambot streambot > backup-streambot.sql
docker exec discord-bot-db pg_dump -U ticketbot ticketbot > backup-ticketbot.sql
docker exec discord-bot-db pg_dump -U jarvis homelab_jarvis > backup-jarvis.sql

# Restore
docker exec -i discord-bot-db psql -U streambot streambot < backup-streambot.sql
docker exec -i discord-bot-db psql -U ticketbot ticketbot < backup-ticketbot.sql
docker exec -i discord-bot-db psql -U jarvis homelab_jarvis < backup-jarvis.sql
```

### Configuration Backup

```bash
# Backup .env and configs
tar -czf config-backup-$(date +%Y%m%d).tar.gz .env Caddyfile docker-compose.unified.yml
```

## Security Hardening

1. **Firewall**: Enable UFW and allow only 80/443
   ```bash
   sudo ufw enable
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

2. **Fail2ban**: Install for brute-force protection
   ```bash
   sudo apt install fail2ban
   ```

3. **Updates**: Keep system and Docker updated
   ```bash
   sudo apt update && sudo apt upgrade
   docker-compose -f docker-compose.unified.yml pull
   ```

4. **Secrets Rotation**: Rotate secrets every 90 days

## Performance Tuning

### Database Connection Pooling

Already configured in both Stream Bot and Discord Bot:
```typescript
max: 20,  // Maximum pool size
idleTimeoutMillis: 30000,
connectionTimeoutMillis: 2000,
```

### Resource Limits

Edit `docker-compose.unified.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 2G
    reservations:
      cpus: '0.5'
      memory: 512M
```

## Troubleshooting

See `docs/TROUBLESHOOTING.md` for common issues and solutions.
