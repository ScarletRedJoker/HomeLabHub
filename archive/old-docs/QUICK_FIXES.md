# Quick Fixes for Common Issues

## 🚨 Current Issues & Solutions

### 1. Static Site (scarletredjoker.com) - 403 Forbidden

**Problem:** Nginx can't read files in `/var/www/scarletredjoker`

**Fix:**
```bash
./fix-static-site.sh
```

This will:
- Fix file permissions (755 for directories, 644 for files)
- Create placeholder index.html if missing
- Restart the container

---

### 2. Discord Bot OAuth - Invalid redirect_uri

**Problem:** Discord Developer Portal doesn't have the redirect URI configured

**Fix:**
1. Run validation to see what's needed:
   ```bash
   ./validate-env.sh
   ```

2. Go to Discord Developer Portal:
   - https://discord.com/developers/applications/YOUR_CLIENT_ID
   - OAuth2 → Redirects
   - Add: `https://bot.rig-city.com/callback`
   - **Click "Save Changes"** (important!)

3. Verify all Discord env vars are set:
   ```bash
   nano .env
   ```
   Required:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_APP_ID`
   - `VITE_DISCORD_CLIENT_ID` (same as CLIENT_ID)

---

### 3. Stream Bot - Not Starting

**Problem:** Missing vite dependency or no database configured

**Check logs:**
```bash
docker logs stream-bot --tail 50
```

**Fix:**
```bash
# Add missing env vars to .env:
STREAMBOT_DATABASE_URL=postgresql://...  # If needed
STREAMBOT_SESSION_SECRET=random-secret-here
STREAMBOT_OPENAI_API_KEY=sk-...  # Or uses OPENAI_API_KEY as fallback
```

Then restart:
```bash
docker compose -f docker-compose.unified.yml restart stream-bot
```

---

### 4. Plex - Not Accessible

**Problem:** Needs Plex claim token for initial setup

**Fix:**
1. Get claim token: https://www.plex.tv/claim/
2. Add to .env:
   ```bash
   PLEX_CLAIM=claim-xxxxxxxxxxxxx
   ```
3. Restart Plex:
   ```bash
   docker compose -f docker-compose.unified.yml restart plex-server
   ```

---

### 5. n8n - Using Old Script

**Problem:** You have a separate n8n.sh script instead of using the unified deployment

**Current Status:**
- n8n is running in docker-compose.unified.yml
- Your old n8n.sh script is not needed
- Access: https://n8n.evindrake.net

**Check if working:**
```bash
docker logs n8n --tail 20
curl -I https://n8n.evindrake.net
```

---

## 🛠️ Diagnostic Tools

### Run All Diagnostics
```bash
./diagnose-all.sh
```

Shows:
- Container status
- Last 10 log lines from each service
- URL accessibility tests
- Resource usage
- Recommendations

### Validate Environment Variables
```bash
./validate-env.sh
```

Checks:
- All required variables are set
- No placeholder values remain
- Passwords are not default
- OAuth URLs are correct
- Shows actionable next steps

### Validate Ports
```bash
./validate-ports.sh
```

Tests:
- All internal container ports
- Caddyfile routing configuration
- Port isolation (confirms no conflicts)

---

## 📋 Complete Health Check Workflow

```bash
# 1. Validate environment first
./validate-env.sh

# 2. Fix any errors shown, then:
nano .env  # Make required changes

# 3. Run diagnostics
./diagnose-all.sh

# 4. Fix specific issues:

# Static site
./fix-static-site.sh

# Discord OAuth - add redirect in Discord portal

# Stream bot - check logs and add missing env vars
docker logs stream-bot --tail 50

# 5. Restart affected services
docker compose -f docker-compose.unified.yml restart

# 6. Test all URLs
curl -I https://host.evindrake.net
curl -I https://bot.rig-city.com
curl -I https://stream.rig-city.com
curl -I https://plex.evindrake.net
curl -I https://n8n.evindrake.net
curl -I https://scarletredjoker.com
```

---

## 🔧 Service-Specific Commands

### View Logs
```bash
docker logs caddy -f              # SSL/routing
docker logs homelab-dashboard -f  # Dashboard
docker logs discord-bot -f        # Discord bot
docker logs stream-bot -f         # Stream bot
docker logs plex-server -f        # Plex
docker logs n8n -f                # n8n
docker logs scarletredjoker-web -f # Static site
```

### Restart Individual Services
```bash
docker compose -f docker-compose.unified.yml restart <service-name>
```

### Restart Everything
```bash
docker compose -f docker-compose.unified.yml restart
```

### Rebuild Containers (after code changes)
```bash
docker compose -f docker-compose.unified.yml build
docker compose -f docker-compose.unified.yml up -d
```

---

## 🎯 Priority Actions for You

Based on your current issues:

1. **Fix Static Site (5 min)**
   ```bash
   ./fix-static-site.sh
   ```

2. **Validate Environment (2 min)**
   ```bash
   ./validate-env.sh
   ```

3. **Add Discord OAuth Redirect (5 min)**
   - Go to Discord Developer Portal
   - Add redirect URI: `https://bot.rig-city.com/callback`

4. **Check Stream Bot Logs (2 min)**
   ```bash
   docker logs stream-bot --tail 50
   ```
   - If vite error: need to fix Dockerfile
   - If database error: add STREAMBOT_DATABASE_URL to .env

5. **Run Full Diagnostics (1 min)**
   ```bash
   ./diagnose-all.sh
   ```

---

## ⚡ Quick Reference

| Issue | Command |
|-------|---------|
| Check all services | `./diagnose-all.sh` |
| Validate env vars | `./validate-env.sh` |
| Fix static site | `./fix-static-site.sh` |
| View service logs | `docker logs <name> -f` |
| Restart service | `docker compose -f docker-compose.unified.yml restart <name>` |
| Restart all | `docker compose -f docker-compose.unified.yml restart` |
