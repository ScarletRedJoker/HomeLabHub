# Deployment Guide - Service Fixes (November 18, 2025)

## Summary of Fixes

All critical service issues have been resolved:

1. **Stream-Bot** - Fixed migration failures (drizzle-kit now in production dependencies)
2. **Code-Server** - Fixed permission errors (volume path corrected for linuxserver image)  
3. **Home Assistant** - Fixed reverse proxy errors (Docker subnet added to trusted proxies)

## Deployment Steps

### Step 1: Rebuild Stream-Bot (Required)
The stream-bot service needs to be rebuilt because we moved drizzle-kit to production dependencies.

```bash
# Stop and rebuild stream-bot
cd /home/evin/contain/HomeLabHub
docker-compose -f docker-compose.unified.yml stop stream-bot
docker-compose -f docker-compose.unified.yml build --no-cache stream-bot
docker-compose -f docker-compose.unified.yml up -d stream-bot

# Verify migrations ran successfully
docker logs stream-bot --tail 30
```

**Expected output:**
```
✓ Database URL configured
Running database migrations...
  Using drizzle-kit to sync schema...
✓ Database schema synchronized
Starting Stream-Bot Application...
```

### Step 2: Restart Code-Server (Required)
Code-server needs to restart with the new volume mount path.

```bash
docker-compose -f docker-compose.unified.yml restart code-server

# Verify startup (should have no more EACCES errors)
docker logs code-server --tail 20
```

### Step 3: Update Home Assistant Configuration (Required)
Copy the updated configuration with reverse proxy settings.

```bash
# Option A: Use the automated script (recommended)
./config/homeassistant/copy-config.sh

# Option B: Manual copy
docker exec homeassistant sh -c "cp /config-templates/configuration.yaml /config/"
docker restart homeassistant
```

**Verify:**
```bash
# Check logs - should have NO reverse proxy errors
docker logs homeassistant --tail 30 | grep -i "reverse proxy"
```

### Step 4: Verify All Services

```bash
# Check all service status
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "stream-bot|code-server|homeassistant"

# Expected: All should show "Up" with healthy status
```

## Service URLs

After deployment, verify access to:

- **Stream-Bot Dashboard:** https://stream.rig-city.com
- **Code-Server (VSCode):** https://code.evindrake.net  
- **Home Assistant:** https://home.evindrake.net

## Troubleshooting

### Stream-Bot Still Crashing?
```bash
# Check if drizzle-kit is installed in the container
docker exec stream-bot ls -la node_modules/.bin/drizzle-kit

# Check package.json was updated
docker exec stream-bot cat package.json | grep drizzle-kit
```

### Code-Server Permission Errors?
```bash
# Check volume mount
docker inspect code-server | grep -A 10 Mounts

# Should show: /home/evin/contain:/config/workspace
```

### Home Assistant Reverse Proxy Errors?
```bash
# Verify configuration was copied
docker exec homeassistant cat /config/configuration.yaml | grep -A 5 trusted_proxies

# Should include: 172.18.0.0/16
```

## Rollback (if needed)

If any issues occur:

```bash
# Stop affected service
docker-compose -f docker-compose.unified.yml stop <service-name>

# View this deployment's git changes
git diff HEAD~1

# Revert if needed
git revert HEAD

# Restart services
docker-compose -f docker-compose.unified.yml up -d
```
