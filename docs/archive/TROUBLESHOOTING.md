# Troubleshooting Guide

Common issues and solutions for HomeLabHub services.

## Stream Bot Issues

### Issue: "Too many login attempts"
**Cause**: Rate limiting triggered (5 attempts/15min)  
**Solution**: Wait 15 minutes or clear rate limit cache
```bash
docker exec homelab-redis redis-cli FLUSHDB
```

### Issue: OAuth redirect fails
**Cause**: Incorrect redirect URL configuration  
**Solution**: Verify redirect URLs match:
- Twitch Dev Console: `https://stream.evindrake.net/auth/twitch/callback`
- Google Console: `https://stream.evindrake.net/auth/google/callback`

### Issue: "SESSION_SECRET required"
**Cause**: Missing SESSION_SECRET environment variable  
**Solution**: Add to .env:
```env
STREAMBOT_SESSION_SECRET=$(openssl rand -base64 32)
```

### Issue: Database connection failed
**Cause**: PostgreSQL not ready or wrong credentials  
**Solution**: Check health:
```bash
docker exec discord-bot-db psql -U streambot -c "SELECT 1"
```

### Issue: Health check failing
**Cause**: Service not started or port not listening  
**Solution**: Check if service is running and listening on port 5000:
```bash
docker logs stream-bot --tail=50
docker exec stream-bot netstat -tulpn | grep 5000
```

## Discord Bot Issues

### Issue: Bot doesn't respond
**Cause**: Bot token invalid or permissions missing  
**Solution**: 
1. Verify token in Discord Developer Portal
2. Re-invite bot with admin permissions

### Issue: Stream notifications not working
**Cause**: Twitch webhook not configured  
**Solution**: Check webhook logs:
```bash
docker-compose -f docker-compose.unified.yml logs discord-bot | grep webhook
```

### Issue: Database connection error
**Cause**: Wrong database credentials or database not ready  
**Solution**: 
```bash
# Check database status
docker exec discord-bot-db psql -U ticketbot -c "SELECT 1"

# Verify environment variables
docker exec discord-bot printenv | grep DATABASE_URL
```

### Issue: OAuth callback fails
**Cause**: Incorrect callback URL in Discord Developer Portal  
**Solution**: Ensure callback URL is exactly: `https://bot.evindrake.net/auth/discord/callback`

## Dashboard Issues

### Issue: "MinIO unavailable"
**Cause**: MinIO container not started  
**Solution**: 
```bash
docker-compose -f docker-compose.unified.yml up -d minio
docker-compose -f docker-compose.unified.yml logs minio
```

### Issue: File upload fails
**Cause**: File too large (>500MB) or invalid type  
**Solution**: Check file meets requirements:
- Max size: 500MB
- Allowed: .zip, .tar.gz, .html, .js, .css, .py, .ts, .tsx

### Issue: Deployment analyzer stuck
**Cause**: Celery worker not running  
**Solution**:
```bash
docker exec homelab-dashboard celery -A celery_app.celery_app inspect active
docker-compose -f docker-compose.unified.yml restart homelab-celery-worker
```

### Issue: Dashboard not loading
**Cause**: Flask application error or database connection issue  
**Solution**:
```bash
# Check dashboard logs
docker logs homelab-dashboard --tail=100

# Verify database connection
docker exec homelab-dashboard python -c "from app import db; print(db.engine.url)"
```

### Issue: Cache not updating
**Cause**: Browser cache or Caddy caching headers  
**Solution**: Hard refresh (Ctrl+Shift+R) or check Caddyfile for cache control headers

## SSL/HTTPS Issues

### Issue: "Certificate error"
**Cause**: Let's Encrypt rate limit or DNS not propagated  
**Solution**:
1. Check DNS: `nslookup stream.evindrake.net`
2. Check Caddy logs: `docker-compose -f docker-compose.unified.yml logs caddy`
3. Wait for DNS propagation (up to 48 hours)

### Issue: HTTP not redirecting to HTTPS
**Cause**: Caddy misconfiguration  
**Solution**: Verify Caddyfile syntax:
```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

### Issue: SSL certificate renewal fails
**Cause**: Let's Encrypt rate limit or port 80/443 blocked  
**Solution**:
```bash
# Check if ports are open
sudo netstat -tulpn | grep -E ':(80|443)'

# Restart Caddy
docker-compose -f docker-compose.unified.yml restart caddy
```

## Database Issues

### Issue: "Too many connections"
**Cause**: Connection pool exhausted  
**Solution**: Increase pool size or restart services:
```bash
docker-compose -f docker-compose.unified.yml restart stream-bot discord-bot
```

### Issue: Migration failed
**Cause**: Schema mismatch or syntax error  
**Solution**: Check migration logs:
```bash
docker logs stream-bot | grep migration
docker logs discord-bot | grep migration
```

### Issue: Database not initialized
**Cause**: Init scripts not executed  
**Solution**: Recreate database container:
```bash
docker-compose -f docker-compose.unified.yml down discord-bot-db
docker volume rm homelab_postgres_data
docker-compose -f docker-compose.unified.yml up -d discord-bot-db
```

### Issue: Connection timeout
**Cause**: Database taking too long to start  
**Solution**: Increase healthcheck start_period or wait longer:
```bash
# Wait for database to be ready
docker exec discord-bot-db pg_isready -U ticketbot
```

## Performance Issues

### Issue: High memory usage
**Cause**: Memory leak or insufficient limits  
**Solution**: Check stats and restart:
```bash
docker stats
docker-compose -f docker-compose.unified.yml restart <service>
```

### Issue: Slow response times
**Cause**: Database queries or CPU saturation  
**Solution**: 
1. Check logs for slow queries
2. Add database indexes
3. Scale horizontally (multiple containers)

### Issue: Container keeps restarting
**Cause**: Application crash or health check failing  
**Solution**:
```bash
# Check logs for errors
docker logs <container-name> --tail=100

# Check health status
docker inspect <container-name> | grep -A 10 Health
```

## Network Issues

### Issue: "Connection refused"
**Cause**: Service not listening or firewall blocking  
**Solution**:
```bash
# Check service is listening
docker exec stream-bot netstat -tulpn | grep 5000

# Check firewall
sudo ufw status
```

### Issue: Can't access from outside network
**Cause**: Port forwarding not configured  
**Solution**: 
1. Configure router: Forward 80/443 to server IP
2. Verify: `curl http://<public-ip>`

### Issue: DNS resolution fails inside containers
**Cause**: DNS not configured  
**Solution**: Add DNS servers to docker-compose.yml:
```yaml
dns:
  - 8.8.8.8
  - 8.8.4.4
```

### Issue: Services can't communicate
**Cause**: Not on same Docker network  
**Solution**: Verify all services use `homelab` network:
```bash
docker network inspect homelab
```

## Docker Issues

### Issue: "Cannot connect to Docker daemon"
**Cause**: Docker service not running  
**Solution**:
```bash
sudo systemctl start docker
sudo systemctl enable docker
```

### Issue: "No space left on device"
**Cause**: Docker disk usage too high  
**Solution**: Clean up:
```bash
docker system prune -a
docker volume prune
```

### Issue: Build fails with dependency error
**Cause**: Package version incompatibility  
**Solution**: Clear build cache and rebuild:
```bash
docker-compose -f docker-compose.unified.yml build --no-cache <service>
```

### Issue: Volume mount permission denied
**Cause**: Wrong file permissions or ownership  
**Solution**:
```bash
# Fix permissions
sudo chown -R 1000:1000 ./services/<service-name>
```

## Redis Issues

### Issue: Redis connection refused
**Cause**: Redis not started or wrong host  
**Solution**:
```bash
# Check Redis status
docker exec homelab-redis redis-cli ping

# Should return: PONG
```

### Issue: Redis out of memory
**Cause**: Too much data cached  
**Solution**: Clear cache or increase memory limit:
```bash
docker exec homelab-redis redis-cli FLUSHALL
```

## VNC Desktop Issues

### Issue: VNC not accessible
**Cause**: Container not started or port not exposed  
**Solution**:
```bash
# Check container status
docker logs vnc-desktop --tail=50

# Verify healthcheck
docker inspect vnc-desktop | grep -A 10 Health
```

### Issue: Black screen on VNC
**Cause**: Desktop environment not started  
**Solution**: Restart container:
```bash
docker-compose -f docker-compose.unified.yml restart vnc-desktop
```

### Issue: VNC password not working
**Cause**: Password not set or incorrect  
**Solution**: Verify VNC_PASSWORD in .env and restart:
```bash
docker-compose -f docker-compose.unified.yml restart vnc-desktop
```

## Code-Server Issues

### Issue: Can't login to Code-Server
**Cause**: Wrong password or not set  
**Solution**: Check CODE_SERVER_PASSWORD in .env:
```bash
grep CODE_SERVER_PASSWORD .env
docker-compose -f docker-compose.unified.yml restart code-server
```

### Issue: Extensions not loading
**Cause**: Extension directory permissions  
**Solution**: Fix permissions:
```bash
docker exec code-server chown -R 1000:1000 /home/coder/.local
```

## Celery Worker Issues

### Issue: Tasks not processing
**Cause**: Celery worker not running  
**Solution**:
```bash
# Check worker status
docker logs homelab-celery-worker --tail=50

# Restart worker
docker-compose -f docker-compose.unified.yml restart homelab-celery-worker
```

### Issue: Tasks stuck in queue
**Cause**: Worker crashed or Redis connection lost  
**Solution**:
```bash
# Clear Redis queue
docker exec homelab-redis redis-cli FLUSHDB

# Restart worker
docker-compose -f docker-compose.unified.yml restart homelab-celery-worker
```

## Rate Limiting

### Issue: "Too many requests"
**Cause**: API rate limit exceeded (100/15min)  
**Solution**: Wait or increase limits in server code:
```typescript
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // Increased from 100
});
```

## Getting Help

If issues persist:

1. **Check Logs**:
   ```bash
   docker-compose -f docker-compose.unified.yml logs --tail=200 <service>
   ```

2. **Verify Health**:
   ```bash
   curl https://<domain>/health
   curl https://<domain>/ready
   ```

3. **Restart Services**:
   ```bash
   docker-compose -f docker-compose.unified.yml restart <service>
   ```

4. **Full Reset** (last resort):
   ```bash
   docker-compose -f docker-compose.unified.yml down -v
   docker-compose -f docker-compose.unified.yml up -d --build
   ```

## Emergency Procedures

### Complete System Failure

1. **Stop all services**:
   ```bash
   docker-compose -f docker-compose.unified.yml down
   ```

2. **Check system resources**:
   ```bash
   df -h
   free -h
   docker system df
   ```

3. **Clean up if needed**:
   ```bash
   docker system prune -a
   ```

4. **Restart services one by one**:
   ```bash
   docker-compose -f docker-compose.unified.yml up -d discord-bot-db
   docker-compose -f docker-compose.unified.yml up -d redis
   docker-compose -f docker-compose.unified.yml up -d minio
   docker-compose -f docker-compose.unified.yml up -d
   ```

### Data Recovery

If you need to recover from backups:

```bash
# Stop affected services
docker-compose -f docker-compose.unified.yml down

# Restore database
docker-compose -f docker-compose.unified.yml up -d discord-bot-db
sleep 10
docker exec -i discord-bot-db psql -U streambot streambot < backup-streambot.sql

# Restart all services
docker-compose -f docker-compose.unified.yml up -d
```
