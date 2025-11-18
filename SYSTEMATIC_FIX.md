# Systematic Service Fix Guide

This guide will fix ALL remaining service issues in the correct order with dependencies.

## 📋 Issues to Fix (Priority Order)

1. ✅ **PostgreSQL Init Scripts** - Made idempotent (FIXED IN CODE)
2. 🔄 **Stream-Bot Database Migration** - Switch from push to migration mode  
3. 🔑 **Missing Secrets** - Twitch/YouTube authentication
4. 🔧 **Home Assistant** - Verify accessibility

## 🚀 Step-by-Step Fix (Run on Ubuntu Server)

### Step 1: Pull Latest Code (PostgreSQL Fix)

```bash
cd /home/evin/contain/HomeLabHub

# Pull latest changes (includes PostgreSQL idempotent fix)
git pull

# Verify the fix is present
grep -A 3 "duplicate_object" services/dashboard/alembic/versions/005_add_google_integration_models.py
```

**Expected:** You should see the idempotent DO blocks with exception handling.

---

### Step 2: Restart PostgreSQL and Dashboard

```bash
# Restart PostgreSQL to clear any stuck transactions
docker-compose -f docker-compose.unified.yml restart discord-bot-db

# Wait for PostgreSQL to be ready
sleep 5

# Restart dashboard with fresh migrations
docker-compose -f docker-compose.unified.yml restart homelab-dashboard homelab-celery-worker

# Check logs - should have NO "already exists" errors
docker logs homelab-dashboard --tail 30
```

**Expected Output:**
```
✓ Database migrations completed successfully
```

---

### Step 3: Fix Stream-Bot (Rebuild with Latest OpenAI Fixes)

```bash
# Rebuild stream-bot to get OpenAI API fixes
docker-compose -f docker-compose.unified.yml stop stream-bot
docker-compose -f docker-compose.unified.yml build --no-cache stream-bot
docker-compose -f docker-compose.unified.yml up -d stream-bot

# Check logs - should have NO parameter errors
docker logs stream-bot --tail 50 | grep -i openai
```

**Expected Output:**
```
[OpenAI] Generating fact with model: gpt-5-mini
[OpenAI] Response received
✓ Database schema synchronized
```

---

### Step 4: Audit Stream-Bot Environment Variables

Check if Twitch/YouTube/Spotify credentials are configured:

```bash
# Check environment variables
docker exec stream-bot env | grep -E "TWITCH|YOUTUBE|SPOTIFY|KICK"
```

**What to check:**

**Required (Twitch):**
- `TWITCH_CLIENT_ID` - **Must be set**
- `TWITCH_CLIENT_SECRET` - **Must be set**

**Optional Integrations:**
- `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN` - For YouTube streaming
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` - For Spotify integration
- `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` - For Kick streaming

**If Twitch credentials are missing or invalid:**

1. Go to https://dev.twitch.tv/console/apps
2. Click on your app (or create a new one)
3. Under "OAuth Redirect URLs", make sure you have:
   ```
   https://stream.rig-city.com/api/auth/twitch/callback
   ```
4. Get your Client ID and generate a new Client Secret
5. Update `.env` file:
   ```bash
   nano .env
   # Add/update these lines:
   TWITCH_CLIENT_ID=your_client_id_here
   TWITCH_CLIENT_SECRET=your_client_secret_here
   ```
6. Restart stream-bot:
   ```bash
   docker-compose -f docker-compose.unified.yml restart stream-bot
   ```

**To enable YouTube/Spotify (optional):**

These integrations are now **optional**. If not configured, the features will be gracefully disabled.

Leave empty in `.env` to disable:
```bash
# YouTube (optional - leave empty to disable)
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=

# Spotify (optional - leave empty to disable)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
```

---

### Step 5: Verify Home Assistant

```bash
# Check if Home Assistant is running
docker ps | grep homeassistant

# Check logs
docker logs homeassistant --tail 30

# Test accessibility
curl -k https://home.evindrake.net
```

**Expected:**
- Container is `Up` and healthy
- Logs show "Home Assistant started" or similar
- Curl returns HTML (not an error)

**If you see errors:**
1. Go to https://home.evindrake.net
2. Create your first user account (if not done already)
3. Verify you can log in

---

### Step 6: Full Service Health Check

```bash
# Check all services
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check for any error logs
docker-compose -f docker-compose.unified.yml logs --tail=50 | grep -i error
```

**Expected:** All services showing "Up" with no critical errors.

---

### Step 7: Verify Service URLs

Test each service is accessible:

```bash
# Quick accessibility test
echo "Testing service URLs..."
curl -I https://host.evindrake.net | head -1
curl -I https://stream.rig-city.com | head -1
curl -I https://bot.rig-city.com | head -1
curl -I https://code.evindrake.net | head -1
curl -I https://home.evindrake.net | head -1
curl -I https://n8n.evindrake.net | head -1
curl -I https://plex.evindrake.net | head -1
curl -I https://vnc.evindrake.net | head -1
```

**Expected:** All should return `HTTP/2 200` or `HTTP/2 302` (not 502 or 503)

---

## 🎯 Quick Fix Command (All at Once)

If you want to run all fixes automatically:

```bash
cd /home/evin/contain/HomeLabHub

# Pull latest code
git pull

# Restart PostgreSQL and dependent services
docker-compose -f docker-compose.unified.yml restart discord-bot-db
sleep 5
docker-compose -f docker-compose.unified.yml restart homelab-dashboard homelab-celery-worker

# Rebuild stream-bot with fixes
docker-compose -f docker-compose.unified.yml stop stream-bot
docker-compose -f docker-compose.unified.yml build --no-cache stream-bot
docker-compose -f docker-compose.unified.yml up -d stream-bot

# Quick health check
echo "=== Service Health Check ==="
docker ps --format "table {{.Names}}\t{{.Status}}"

echo ""
echo "=== Recent Errors (if any) ==="
docker-compose -f docker-compose.unified.yml logs --tail=100 | grep -i "error" | grep -v "ERROR_COUNT\|error_count\|last_error" | tail -10

echo ""
echo "=== Service URLs to Test ==="
echo "Dashboard: https://host.evindrake.net"
echo "Stream-Bot: https://stream.rig-city.com"
echo "Discord-Bot: https://bot.rig-city.com"
echo "Code-Server: https://code.evindrake.net"
echo "Home Assistant: https://home.evindrake.net"
echo "n8n: https://n8n.evindrake.net"
echo "Plex: https://plex.evindrake.net"
```

---

## 🔍 Troubleshooting Specific Issues

### Issue: Stream-Bot Still Shows Twitch Auth Failure

**Solution:**
1. Go to https://dev.twitch.tv/console/apps
2. Click on your app
3. Under "OAuth Redirect URLs", make sure you have:
   ```
   https://stream.rig-city.com/api/auth/twitch/callback
   ```
4. Generate a new Client Secret
5. Update your `.env` file with the new secret
6. Restart stream-bot

### Issue: Home Assistant Won't Load

**Solutions:**
1. **First time setup:** Create your admin account at https://home.evindrake.net
2. **Check config:** Verify trusted_proxies includes Docker subnet (172.18.0.0/16)
3. **Restart:** `docker-compose -f docker-compose.unified.yml restart homeassistant`

### Issue: Code-Server Still Not Working

**Check:** Is it using the linuxserver image?
```bash
docker inspect code-server | grep Image
```

**Expected:** `lscr.io/linuxserver/code-server`

**If not:**
```bash
docker-compose -f docker-compose.unified.yml stop code-server
docker-compose -f docker-compose.unified.yml rm -f code-server
docker-compose -f docker-compose.unified.yml pull code-server
docker-compose -f docker-compose.unified.yml up -d code-server
```

---

## ✅ Success Criteria

Your deployment is successful when:

1. ✅ No "type already exists" errors in PostgreSQL logs
2. ✅ Stream-bot generates AI Snapple facts without fallback errors
3. ✅ Code-server accessible at https://code.evindrake.net
4. ✅ Home Assistant accessible at https://home.evindrake.net  
5. ✅ All 15 services showing "Up" in `docker ps`
6. ✅ All service URLs return 200/302 (not 502/503)

---

## 📊 After Deployment Checklist

- [ ] All services start without errors
- [ ] Stream-bot AI features work (test /snapple command)
- [ ] Code-server loads VS Code interface
- [ ] Home Assistant dashboard accessible
- [ ] Plex can see NAS media (if mounted)
- [ ] Discord bot responds to commands
- [ ] n8n workflows execute
- [ ] All HTTPS certificates valid

---

## 🆘 Still Having Issues?

Run the deployment manager health check:

```bash
cd /home/evin/contain/HomeLabHub
./homelab-manager.sh
# Choose option 12: Full Health Check
```

This will diagnose all services and show detailed error information.
