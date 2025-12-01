# Troubleshooting Guide

Common issues and solutions for HomeLabHub deployment.

## Quick Diagnostics

### Run Health Check
```bash
# Overall system health
./homelab health

# Check service status
./homelab status

# View all logs
./homelab logs
```

### Service Status Overview
```bash
# List all containers
docker compose ps

# Check container health
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## Tailscale Connection Issues

### Tailscale Not Connected

**Symptoms:**
- `tailscale status` shows "Stopped" or no peers
- Cannot ping Tailscale IPs

**Solutions:**

```bash
# Check Tailscale daemon status
sudo systemctl status tailscaled

# Restart Tailscale
sudo systemctl restart tailscaled

# Re-authenticate
sudo tailscale up

# Check for network conflicts
sudo tailscale netcheck
```

### Cannot Reach Other Tailscale Nodes

**Symptoms:**
- `ping 100.x.x.x` fails
- Services can't communicate between servers

**Solutions:**

```bash
# Check ACLs in Tailscale admin console
# Ensure "tag:homelab" is applied to both machines

# Verify both machines are online
tailscale status

# Check for firewall blocks
sudo ufw status
sudo iptables -L -n | grep tailscale

# Allow Tailscale traffic
sudo ufw allow in on tailscale0
```

### Tailscale IP Changed

```bash
# Get current IP
tailscale ip -4

# Update .env on both servers
nano .env  # Update LOCAL_TAILSCALE_IP or LINODE_TAILSCALE_IP

# Restart services
./homelab restart
```

## Docker Service Failures

### Container Won't Start

**Symptoms:**
- Container status shows "Restarting" or "Exited"

**Diagnosis:**
```bash
# Check container logs
docker compose logs <service-name>

# View detailed container info
docker inspect <container-name>

# Check exit code
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

**Common Causes:**

1. **Missing environment variables**
   ```bash
   # Check required vars
   docker compose config
   ```

2. **Port conflicts**
   ```bash
   # Check what's using a port
   sudo lsof -i :5000
   sudo netstat -tlnp | grep 5000
   ```

3. **Volume permission issues**
   ```bash
   # Fix log directory permissions
   sudo chown -R 1000:1000 ./services/dashboard/logs
   sudo chmod 755 ./services/dashboard/logs
   ```

### Out of Memory

**Symptoms:**
- Container killed with exit code 137
- `docker stats` shows high memory usage

**Solutions:**
```bash
# Check memory usage
docker stats --no-stream

# Limit container memory in docker-compose.yml
services:
  homelab-dashboard:
    deploy:
      resources:
        limits:
          memory: 2G

# Or add swap space
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Docker Daemon Issues

```bash
# Restart Docker
sudo systemctl restart docker

# Check Docker logs
sudo journalctl -u docker -f

# Clean up Docker resources
docker system prune -a
docker volume prune
```

## Database Migration Errors

### Migration Failed on Startup

**Symptoms:**
- Dashboard container exits with migration errors
- Log shows "relation already exists" or "column not found"

**Solutions:**

```bash
# View migration logs
docker compose logs homelab-dashboard | grep -i "alembic\|migration"

# Connect to database directly
docker exec -it homelab-postgres psql -U jarvis -d homelab_jarvis

# Check current migration version
SELECT * FROM alembic_version;

# Force run migrations manually
docker exec homelab-dashboard flask db upgrade
```

### Database Connection Refused

**Symptoms:**
- `could not connect to server: Connection refused`

**Solutions:**
```bash
# Verify PostgreSQL is running
docker compose ps homelab-postgres

# Check PostgreSQL logs
docker compose logs homelab-postgres

# Verify password matches
grep JARVIS_DB_PASSWORD .env
docker exec -it homelab-postgres psql -U jarvis -d homelab_jarvis -W

# Recreate database users if needed
docker exec -it homelab-postgres psql -U postgres
\du  -- List users
ALTER USER jarvis WITH PASSWORD 'new_password';
```

### Database User Not Found

```bash
# Check if users exist
docker exec -it homelab-postgres psql -U postgres -c "\du"

# Recreate using init script
docker exec -it homelab-postgres bash
export DISCORD_DB_PASSWORD=xxx STREAMBOT_DB_PASSWORD=xxx JARVIS_DB_PASSWORD=xxx
/docker-entrypoint-initdb.d/00-init-all-databases.sh
```

## SSL Certificate Issues

### Certificate Not Obtained

**Symptoms:**
- Browser shows "connection not secure"
- Caddy logs show ACME errors

**Solutions:**
```bash
# Check Caddy logs
docker compose logs caddy | grep -i "error\|certificate\|acme"

# Verify DNS is resolving correctly
dig host.evindrake.net +short

# Ensure ports 80/443 are accessible
sudo ufw status
curl -I http://host.evindrake.net

# Force certificate renewal
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### Rate Limited by Let's Encrypt

**Symptoms:**
- "too many requests" or "rate limit exceeded"

**Solutions:**
```bash
# Wait and retry (rate limit resets after 1 week)
# Or use staging environment temporarily:
# Add to Caddyfile under global options:
{
    acme_ca https://acme-staging-v02.api.letsencrypt.org/directory
}
```

### Mixed Content Errors

**Symptoms:**
- Page loads but resources blocked
- Console shows mixed content warnings

**Solutions:**
```bash
# Ensure all URLs in application use HTTPS
# Check .env URLs
grep "_URL" .env | grep "http://"
# Change any http:// to https://
```

## Service-Specific Issues

### Dashboard Not Accessible

```bash
# Check if running
docker compose ps homelab-dashboard

# Check health endpoint
curl http://localhost:5000/health

# View logs
docker compose logs homelab-dashboard --tail 100

# Restart
docker compose restart homelab-dashboard
```

### Discord Bot Offline

```bash
# Check bot logs
docker compose logs discord-bot --tail 100

# Verify token is valid
grep DISCORD_BOT_TOKEN .env

# Check Discord API status
curl -s https://discordstatus.com/api/v2/status.json

# Restart bot
docker compose restart discord-bot
```

### Stream Bot Issues

```bash
# Check bot status
docker compose logs stream-bot --tail 100

# Verify database connection
docker exec stream-bot npm run db:check

# Check OAuth tokens
curl https://stream.rig-city.com/api/auth/status
```

### Plex Not Accessible

```bash
# Check if running (on local host)
docker ps | grep plex

# Verify network mode
docker inspect plex-server | grep NetworkMode

# Check port binding
ss -tlnp | grep 32400

# Test locally
curl http://localhost:32400/identity

# Check token
grep PLEX_TOKEN .env
```

### Home Assistant Connection Failed

```bash
# Check if running
docker ps | grep homeassistant

# View logs
docker logs homeassistant --tail 100

# Test API
curl -H "Authorization: Bearer $HOME_ASSISTANT_TOKEN" \
     http://localhost:8123/api/

# Verify trusted proxies in configuration.yaml
```

## Network Issues

### Cannot Access External Services

```bash
# Check DNS resolution
docker exec homelab-dashboard nslookup api.openai.com

# If DNS fails, add explicit DNS to compose
services:
  discord-bot:
    dns:
      - 8.8.8.8
      - 8.8.4.4
```

### Ports Not Accessible

```bash
# Check firewall
sudo ufw status verbose

# Allow required ports
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check if container is binding correctly
docker port <container-name>
```

## Log Analysis

### Finding Errors

```bash
# Search for errors in all logs
docker compose logs 2>&1 | grep -i error

# Search specific service
docker compose logs homelab-dashboard 2>&1 | grep -i "error\|exception\|traceback"

# Tail logs in real-time
docker compose logs -f --tail 50
```

### Log Rotation

If logs are filling disk:

```bash
# Check log sizes
docker system df -v

# Add log rotation to docker daemon
sudo tee /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

sudo systemctl restart docker
```

## Recovery Procedures

### Full Stack Restart

```bash
# Stop all services
./homelab stop

# Clean up (preserves volumes)
docker compose down

# Pull latest images
docker compose pull

# Rebuild and start
./homelab restart
```

### Database Recovery

```bash
# Backup current database
docker exec homelab-postgres pg_dump -U postgres postgres > backup.sql

# Restore from backup
docker exec -i homelab-postgres psql -U postgres postgres < backup.sql
```

### Factory Reset (Last Resort)

⚠️ **Warning: This destroys all data**

```bash
# Stop everything
docker compose down

# Remove volumes
docker volume rm $(docker volume ls -q | grep homelab)

# Rebuild
./deploy/scripts/bootstrap.sh
```

## Getting Help

### Collect Diagnostic Information

```bash
# Create diagnostic report
./homelab logs > homelab-logs.txt 2>&1
docker compose ps >> homelab-logs.txt
docker system df >> homelab-logs.txt
tailscale status >> homelab-logs.txt
```

### Support Resources

- **GitHub Issues**: [github.com/ScarletRedJoker/HomeLabHub/issues](https://github.com/ScarletRedJoker/HomeLabHub/issues)
- **Docker Documentation**: [docs.docker.com](https://docs.docker.com/)
- **Tailscale Documentation**: [tailscale.com/kb](https://tailscale.com/kb/)
- **Caddy Documentation**: [caddyserver.com/docs](https://caddyserver.com/docs/)
