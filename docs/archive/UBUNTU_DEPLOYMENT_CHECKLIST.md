# Ubuntu Server Deployment Checklist

## Post-Replit Development Tasks

After making changes on Replit, follow this checklist to deploy to your Ubuntu 25.10 homelab server.

---

## 1. Verify DNS Configuration ✅

All domains are configured and pointing to `74.76.32.151`:

### evindrake.net Domain
- ✅ `host.evindrake.net` - Dashboard
- ✅ `n8n.evindrake.net` - n8n Automation
- ✅ `plex.evindrake.net` - Plex Media Server
- ✅ `vnc.evindrake.net` - VNC Remote Desktop
- ✅ `game.evindrake.net` - Game Streaming
- ✅ `www.evindrake.net` - Redirect to apex

### rig-city.com Domain
- ✅ `rig-city.com` (apex) - Main site
- ✅ `bot.rig-city.com` - Discord Ticket Bot
- ✅ `stream.rig-city.com` - Stream Bot (SnappleBotAI)
- ✅ `www.rig-city.com` - Redirect to apex

### scarletredjoker.com Domain
- ✅ `scarletredjoker.com` (apex) - Personal portfolio
- ✅ `www.scarletredjoker.com` - Redirect to apex

**DNS Provider**: ZoneEdit (https://cp.zoneedit.com)
**Dynamic DNS**: Configured for IP updates

---

## 2. Pull Latest Code from Replit

```bash
# On Ubuntu server
cd /home/evin/contain/HomeLabHub
git pull origin main
```

**Auto-Sync**: This runs automatically every 5 minutes via cron job.

---

## 3. Fix docker-compose.unified.yml (One-Time Fix)

The current `docker-compose.unified.yml` on Ubuntu has a duplicate `APP_URL` environment variable in the stream-bot service. This needs to be fixed manually.

### Current State (BROKEN):
```yaml
stream-bot:
  environment:
    - APP_URL=${APP_URL:-http://localhost:3000}
    - APP_URL=https://stream.rig-city.com  # DUPLICATE - REMOVE THIS LINE
```

### Fixed State:
```yaml
stream-bot:
  environment:
    - APP_URL=https://stream.rig-city.com
```

**Action Required**:
```bash
# On Ubuntu server
cd /home/evin/contain/HomeLabHub
nano docker-compose.unified.yml

# Find the stream-bot service section
# Remove the duplicate APP_URL line
# Save and exit (Ctrl+X, Y, Enter)
```

---

## 4. Update Caddyfile (Completed ✅)

The Caddyfile has been updated to include all domains:

```bash
# Verify Caddyfile on Ubuntu matches Replit
cd /home/evin/contain/HomeLabHub
cat Caddyfile

# Should include:
# - rig-city.com (apex domain)
# - scarletredjoker.com (apex domain)
# - All evindrake.net subdomains
# - All rig-city.com subdomains
```

**Note**: DNS propagation can take 15-60 minutes. Caddy will automatically obtain SSL certificates once DNS resolves.

---

## 5. Run Database Migrations

The stream-bot database needs a migration to add the `primary_platform` column to the `users` table.

### Option A: Using Drizzle Push (Recommended)
```bash
# On Ubuntu server
cd /home/evin/contain/HomeLabHub/services/stream-bot
docker exec stream-bot npm run db:push
```

### Option B: Rebuild Container
```bash
# On Ubuntu server
cd /home/evin/contain/HomeLabHub
docker-compose -f docker-compose.unified.yml up -d --build stream-bot
```

**Migration Details**:
- Adds `primary_platform` enum column to `users` table
- Adds `connected_platforms` text array column
- Adds `platform_usernames` JSON column
- Allows NULL values (won't break existing users)

---

## 6. Rebuild and Restart Services

### Rebuild All Services
```bash
# On Ubuntu server
cd /home/evin/contain/HomeLabHub
docker-compose -f docker-compose.unified.yml up -d --build
```

### Restart Specific Service
```bash
# Stream Bot only
docker-compose -f docker-compose.unified.yml up -d --build stream-bot

# Discord Bot only
docker-compose -f docker-compose.unified.yml up -d --build discord-bot

# Dashboard only
docker-compose -f docker-compose.unified.yml up -d --build dashboard
```

### Restart Caddy (for SSL certificate refresh)
```bash
docker-compose -f docker-compose.unified.yml restart caddy
```

---

## 7. Verify Services are Running

```bash
# Check all container statuses
docker ps

# Expected output should show:
# - caddy (reverse proxy)
# - postgres (database)
# - dashboard (Flask app)
# - discord-bot (TypeScript/React)
# - stream-bot (TypeScript/React)
# - n8n (automation platform)
# - plex (media server)
# - vnc-desktop (remote desktop)
# - static-site (portfolio)
```

### Check Service Logs
```bash
# Stream Bot logs
docker logs stream-bot --tail 50

# Discord Bot logs
docker logs discord-bot --tail 50

# Dashboard logs
docker logs dashboard --tail 50

# Caddy logs (SSL certificate status)
docker logs caddy --tail 100
```

---

## 8. Test OAuth Flows

### Twitch OAuth
1. Visit https://stream.rig-city.com
2. Click "Connect Twitch"
3. Authorize the app
4. Should redirect back with "Twitch connected successfully"

### YouTube OAuth
1. Visit https://stream.rig-city.com
2. Click "Connect YouTube"
3. Authorize the app (may show verification warning if in Testing mode)
4. Should redirect back with "YouTube connected successfully"

### Kick OAuth
1. Visit https://stream.rig-city.com
2. Click "Connect Kick"
3. Authorize the app
4. Should redirect back with "Kick connected successfully"

---

## 9. Verify SSL Certificates

```bash
# Check Caddy logs for certificate acquisition
docker logs caddy | grep -i certificate

# Test HTTPS connection
curl -I https://stream.rig-city.com
curl -I https://bot.rig-city.com
curl -I https://host.evindrake.net
curl -I https://rig-city.com
curl -I https://scarletredjoker.com
```

**Expected**: All should return `200 OK` with valid SSL certificate.

---

## 10. Monitor System Resources

```bash
# Check disk space
df -h

# Check memory usage
free -h

# Check Docker stats
docker stats

# Check network connectivity
ping -c 4 google.com
```

---

## 11. Backup Configuration

Before making major changes, create backups:

```bash
# Backup current docker-compose.yml
cp docker-compose.unified.yml docker-compose.unified.yml.backup

# Backup Caddyfile
cp Caddyfile Caddyfile.backup

# Backup environment file
cp .env .env.backup

# Backup PostgreSQL databases
docker exec postgres pg_dumpall -U postgres > /home/evin/backups/postgres_$(date +%Y%m%d).sql
```

---

## Common Issues and Solutions

### Issue: SSL Certificate Errors
**Symptom**: Caddy logs show "failed to obtain certificate"

**Solution**:
1. Verify DNS records are correct in ZoneEdit
2. Wait 30-60 minutes for DNS propagation
3. Restart Caddy: `docker-compose restart caddy`
4. Check port forwarding: ports 80 and 443 must be open

### Issue: OAuth Redirect Mismatch
**Symptom**: "redirect_uri_mismatch" error during OAuth flow

**Solution**:
1. Verify callback URLs in developer consoles match exactly:
   - Twitch: https://stream.rig-city.com/api/auth/twitch/callback
   - YouTube: https://stream.rig-city.com/api/auth/youtube/callback
   - Kick: https://stream.rig-city.com/api/auth/kick/callback
2. No trailing slashes, must be HTTPS

### Issue: Database Connection Errors
**Symptom**: Stream bot logs show "connection refused" to PostgreSQL

**Solution**:
1. Verify PostgreSQL container is running: `docker ps | grep postgres`
2. Check database credentials in `.env` file
3. Run migrations: `docker exec stream-bot npm run db:push`

### Issue: Container Won't Start
**Symptom**: Container exits immediately after `docker-compose up`

**Solution**:
1. Check logs: `docker logs [container-name]`
2. Verify environment variables in `.env` file
3. Check for port conflicts: `sudo netstat -tulpn | grep [port]`
4. Rebuild container: `docker-compose up -d --build [service-name]`

---

## Next Steps After Deployment

1. **Monitor Logs**: Watch for errors in the first 24 hours
2. **Test All Features**: Verify each service is accessible via HTTPS
3. **Performance Tuning**: Adjust resource limits in docker-compose if needed
4. **Backup Schedule**: Set up automated daily backups
5. **Security Audit**: Review Caddy access logs for suspicious activity

---

**Last Updated**: November 15, 2025
**Server**: Ubuntu 25.10 (74.76.32.151)
**Location**: /home/evin/contain/HomeLabHub
