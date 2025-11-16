# Production Deployment Guide

## Prerequisites

### System Requirements
- **OS**: Ubuntu 25.10+ Desktop or Server
- **Docker**: 24.0+
- **Docker Compose**: 2.0+
- **RAM**: 4GB minimum (8GB recommended)
- **Disk Space**: 20GB minimum (50GB recommended for media)
- **Network**: Public IP with port forwarding (80, 443)

### Domain Requirements
- Registered domains with DNS access
- ZoneEdit account (or similar DNS provider)
- Cloudflare/Let's Encrypt for SSL (handled automatically by Caddy)

### Access Requirements
- SSH access to Ubuntu server
- Git installed
- Root or sudo access

---

## Quick Deploy

### Option 1: Automated Deployment (Recommended)

```bash
# 1. Clone repository
cd /home/evin/contain
git clone https://github.com/your-org/HomeLabHub.git
cd HomeLabHub

# 2. Run initial setup
./deploy.sh setup

# 3. Edit environment variables
nano .env
# Configure all required variables (see ENVIRONMENT_VARIABLES.md)

# 4. Deploy all services
./deploy.sh deploy
```

### Option 2: Interactive Manager

```bash
# Launch interactive menu
./homelab-manager.sh

# Select: 1) Full Deploy
# Follow on-screen prompts
```

### Option 3: Manual Deployment

```bash
# 1. Generate .env file
./deployment/generate-unified-env.sh

# 2. Edit configuration
nano .env

# 3. Ensure databases are set up
./deployment/ensure-databases.sh

# 4. Deploy services
./deployment/deploy-unified.sh

# 5. Check status
docker-compose -f docker-compose.unified.yml ps
```

---

## Deployment Workflow

The `deploy.sh` script provides a comprehensive deployment workflow:

### 1. Pre-Deployment
- **Pre-flight checks**: Verifies Docker, Docker Compose, and .env file
- **Automatic backup**: Creates timestamped backup of database and configs
- **Code update**: Pulls latest code from git repository (if using update command)

### 2. Deployment
- **Container rebuild**: Rebuilds all containers with latest code
- **Service restart**: Uses `docker-compose down` then `docker-compose up -d`
- **Brief downtime**: Approximately 10-30 seconds while containers restart

### 3. Post-Deployment
- **Health checks**: Verifies all containers are running and healthy
- **Database verification**: Checks Postgres connectivity
- **Status report**: Shows status of all services

### 4. Rollback (Manual)
If health checks fail or issues are detected:
```bash
./deploy.sh stop
./deploy.sh restore  # Restore from latest backup
./deploy.sh start
```

**Note:** Rollback is currently manual, not automatic. The operator must identify issues and trigger rollback manually using the backup/restore commands.

### Deployment Characteristics
- **Downtime**: 10-30 seconds during container restart (not zero-downtime)
- **Method**: Rolling restart (not blue-green deployment)
- **Rollback**: Manual process via backup restore
- **Health Checks**: Automatic after deployment
- **Backups**: Automatic before each deployment

### Future Enhancements
- **Zero-downtime deployments**: Blue-green or canary deployment strategy
- **Automatic rollback**: Health-check-triggered automatic rollback
- **Progressive rollout**: Gradual deployment with traffic shifting

---

## Configuration

### Environment Variables

See **[ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)** for complete reference.

**Critical variables to configure:**

```bash
# Service User
SERVICE_USER=evin

# Database Passwords
DISCORD_DB_PASSWORD=<generate-strong-password>
STREAMBOT_DB_PASSWORD=<generate-strong-password>
JARVIS_DB_PASSWORD=<generate-strong-password>

# Discord Bot
DISCORD_BOT_TOKEN=<your-discord-bot-token>
DISCORD_CLIENT_ID=<your-client-id>
DISCORD_CLIENT_SECRET=<your-client-secret>

# Twitch Integration
TWITCH_CLIENT_ID=<your-twitch-client-id>
TWITCH_CLIENT_SECRET=<your-twitch-secret>

# OpenAI (for Jarvis & Stream Bot)
OPENAI_API_KEY=<your-openai-api-key>

# VNC Desktop
VNC_PASSWORD=<strong-vnc-password>
VNC_USER_PASSWORD=<user-password>

# Code Server
CODE_SERVER_PASSWORD=<code-server-password>

# MinIO Object Storage
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=<strong-minio-password>

# Home Assistant
HOME_ASSISTANT_API_KEY=<ha-api-key>

# Plex
PLEX_CLAIM=<claim-token-from-plex.tv/claim>
```

### DNS Configuration

**For ZoneEdit:**

1. Log into ZoneEdit dashboard
2. Add A records for each subdomain:
   ```
   host.evindrake.net → <your-public-ip>
   plex.evindrake.net → <your-public-ip>
   n8n.evindrake.net → <your-public-ip>
   vnc.evindrake.net → <your-public-ip>
   code.evindrake.net → <your-public-ip>
   home.evindrake.net → <your-public-ip>
   bot.rig-city.com → <your-public-ip>
   stream.rig-city.com → <your-public-ip>
   scarletredjoker.com → <your-public-ip>
   ```

3. Wait for DNS propagation (5-60 minutes)

**Verify DNS:**
```bash
dig host.evindrake.net
nslookup bot.rig-city.com
```

### Port Forwarding

Configure your router to forward these ports to your Ubuntu server:

| Port | Protocol | Service |
|------|----------|---------|
| 80 | TCP | HTTP (Caddy - auto-redirects to HTTPS) |
| 443 | TCP | HTTPS (Caddy reverse proxy) |
| 443 | UDP | HTTP/3 QUIC (optional but recommended) |
| 32400 | TCP | Plex Media Server |

---

## Health Monitoring

### Check Service Status

```bash
# Quick status check
./deploy.sh status

# OR
docker-compose -f docker-compose.unified.yml ps
```

### View Logs

```bash
# All services
./deploy.sh logs

# Follow logs in real-time
./deploy.sh logs -f

# Specific service
./deploy.sh logs -f --service discord-bot

# OR manually
docker-compose -f docker-compose.unified.yml logs -f homelab-dashboard
```

### Health Checks

```bash
# Run automated health checks
./deploy.sh health

# Manual health verification
curl https://host.evindrake.net/health
curl https://bot.rig-city.com/health
curl https://stream.rig-city.com/health
```

### Monitor Resources

```bash
# Docker stats
docker stats

# System resources
htop

# Disk usage
df -h
du -sh /var/lib/docker
```

---

## Backup & Restore

### Creating Backups

```bash
# Automated backup (all databases + configs)
./deploy.sh backup

# Backup location: backups/YYYYMMDD_HHMMSS/
```

**What gets backed up:**
- PostgreSQL databases (all 3)
- Configuration files
- Environment variables (.env)
- Caddy configuration
- Docker Compose file

### Manual Database Backup

```bash
# Backup all PostgreSQL databases
docker-compose -f docker-compose.unified.yml exec -T discord-bot-db \
  pg_dumpall -U postgres > backup_$(date +%Y%m%d).sql

# Backup specific database
docker-compose -f docker-compose.unified.yml exec -T discord-bot-db \
  pg_dump -U ticketbot ticketbot > ticketbot_$(date +%Y%m%d).sql
```

### Restoring from Backup

```bash
# Restore all databases
cat backups/20231115_120000/database.sql | \
  docker-compose -f docker-compose.unified.yml exec -T discord-bot-db \
  psql -U postgres

# Restore configs
cp -r backups/20231115_120000/config ./config
cp backups/20231115_120000/.env.backup .env
```

### Automated Backup Schedule

Set up a cron job for automatic backups:

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd /home/evin/contain/HomeLabHub && ./deploy.sh backup >> /var/log/homelab-backup.log 2>&1

# Add weekly cleanup (keep last 4 weeks)
0 3 * * 0 find /home/evin/contain/HomeLabHub/backups -type d -mtime +28 -exec rm -rf {} +
```

---

## Troubleshooting

### Common Issues

#### Issue: Containers won't start

```bash
# Check logs
./deploy.sh logs

# Check Docker daemon
sudo systemctl status docker

# Restart Docker
sudo systemctl restart docker

# Rebuild and restart
./deploy.sh deploy
```

#### Issue: SSL Certificates not generating

```bash
# Check Caddy logs
docker logs caddy

# Verify DNS is pointing to server
dig host.evindrake.net

# Check port 80/443 are accessible
sudo netstat -tlnp | grep ':80\|:443'

# Restart Caddy
docker-compose -f docker-compose.unified.yml restart caddy
```

#### Issue: Database connection errors

```bash
# Ensure databases exist
./deployment/ensure-databases.sh

# Check database health
docker-compose -f docker-compose.unified.yml exec discord-bot-db pg_isready -U postgres

# View database logs
docker logs discord-bot-db

# Reset database (WARNING: destroys data)
docker-compose -f docker-compose.unified.yml down -v
./deploy.sh deploy
```

#### Issue: Permission denied errors

```bash
# Fix all script permissions
./scripts/fix-permissions.sh

# Fix ownership
sudo chown -R evin:evin /home/evin/contain/HomeLabHub

# Fix Docker socket permissions
sudo chmod 666 /var/run/docker.sock
```

#### Issue: Port already in use

```bash
# Find what's using the port
sudo lsof -i :80
sudo lsof -i :443

# Kill process if safe
sudo kill <PID>

# OR change port in docker-compose.unified.yml
```

#### Issue: Out of disk space

```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune -a --volumes

# Clean old logs
./deploy.sh clean

# Remove old backups
find backups/ -type d -mtime +30 -exec rm -rf {} +
```

### Advanced Troubleshooting

#### Full System Diagnosis

```bash
# Run comprehensive diagnostics
./deployment/diagnose-all.sh

# Check all environment variables
./deployment/check-all-env.sh

# Validate deployment configuration
./deployment/validate-deployment.sh
```

#### Reset Specific Service

```bash
# Stop service
docker-compose -f docker-compose.unified.yml stop discord-bot

# Remove container
docker-compose -f docker-compose.unified.yml rm -f discord-bot

# Rebuild and start
docker-compose -f docker-compose.unified.yml up -d --build discord-bot
```

#### Complete Reset (Nuclear Option)

**WARNING: This destroys all data!**

```bash
# Backup first!
./deploy.sh backup

# Stop and remove everything
docker-compose -f docker-compose.unified.yml down -v

# Remove all images
docker rmi $(docker images -q)

# Full redeploy
./deploy.sh deploy
```

---

## Updating Services

### Pull Latest Code

```bash
# Update from Git
git pull origin main

# Update and restart
./deploy.sh update
```

### Update Specific Service

```bash
# Rebuild service
docker-compose -f docker-compose.unified.yml build homelab-dashboard

# Restart service
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard
```

### Update Docker Images

```bash
# Pull latest base images
docker-compose -f docker-compose.unified.yml pull

# Rebuild with latest
docker-compose -f docker-compose.unified.yml up -d --build
```

---

## Performance Optimization

### Docker Optimization

```bash
# Limit container resources in docker-compose.unified.yml
deploy:
  resources:
    limits:
      cpus: '2.0'
      memory: 4G
```

### Database Optimization

```bash
# PostgreSQL tuning
docker-compose -f docker-compose.unified.yml exec discord-bot-db psql -U postgres

# Vacuum databases
VACUUM ANALYZE;

# Reindex
REINDEX DATABASE ticketbot;
```

### Caddy Optimization

Enable HTTP/3 and compression in Caddyfile:

```caddyfile
{
    servers {
        protocol {
            experimental_http3
        }
    }
}
```

---

## Security Best Practices

1. **Never commit `.env` to Git**
2. **Use strong passwords** (20+ characters, random)
3. **Keep services updated** regularly
4. **Enable UFW firewall**:
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 32400/tcp
   sudo ufw enable
   ```
5. **Regular backups** (automated)
6. **Monitor logs** for suspicious activity
7. **Use fail2ban** for SSH protection

---

## Production Checklist

Before going live:

- [ ] All environment variables configured
- [ ] DNS records properly set
- [ ] Port forwarding configured
- [ ] SSL certificates obtained (automatic via Caddy)
- [ ] Backups configured and tested
- [ ] Health checks passing
- [ ] Logs reviewed for errors
- [ ] Resource limits set appropriately
- [ ] Firewall configured
- [ ] Services accessible via HTTPS
- [ ] Database passwords strong and unique
- [ ] Admin credentials changed from defaults

---

## Support

For issues:
1. Check logs: `./deploy.sh logs`
2. Run diagnostics: `./deployment/diagnose-all.sh`
3. Review troubleshooting section above
4. Check GitHub Issues
5. Contact: Evin (maintainer)

---

**Last Updated**: November 2025  
**Version**: 2.0.0
