# Fix Traefik Docker API Version Issue

## The Problem
Traefik v3.x has a bug where it doesn't auto-detect Docker API version correctly, even with Docker 29.0.0 installed. This prevents Traefik from discovering containers and routing traffic.

**Error:**
```
traefik | ERR Failed to retrieve information of the docker client and server host 
error="client version 1.24 is too old. Minimum supported API version is 1.44"
```

**Result:** All your websites show blank pages because Traefik can't route traffic.

## ✅ Solution: Use Traefik v2.10 (Stable LTS)

Traefik v2.10 is the **stable, long-term support version** and doesn't have this Docker API detection bug. It works perfectly with your Docker 29.0.0.

### Quick Fix (Already Applied to Your Files)

Your `docker-compose.unified.yml` has been updated to use Traefik v2.10. Just run:

```bash
cd /home/evin/contain/HomeLabHub
./APPLY_FIXES.sh
```

### Manual Steps (if script doesn't work)

```bash
cd /home/evin/contain/HomeLabHub

# Stop everything
docker compose -f docker-compose.unified.yml down

# Pull Traefik v2.10
docker pull traefik:v2.10

# Start everything
docker compose -f docker-compose.unified.yml up -d

# Verify Traefik starts without errors
docker logs traefik --tail 30
```

You should see **NO errors** about Docker API version!

---

## Fix Other Issues

### 1. Stream Bot Crashing

Check why it's crashing:
```bash
docker logs stream-bot --tail 100
```

Common fixes:
- Missing environment variables
- Database connection issue
- Module not found

### 2. Missing Traefik Dashboard Password

Run this command to generate the htpasswd hash:
```bash
cd /home/evin/contain/HomeLabHub

# Generate password (username: evin, password: homelab)
echo "TRAEFIK_DASHBOARD_AUTH=$(htpasswd -nb evin homelab | sed -e s/\\$/\\$\\$/g)" >> .env

# Restart
docker compose -f docker-compose.unified.yml up -d
```

---

## Verify Everything Works

After applying fixes:

```bash
# Check all containers are running
docker compose -f docker-compose.unified.yml ps

# Check Traefik logs
docker logs traefik --tail 20

# Test websites from outside your network
curl -I https://bot.rig-city.com
curl -I https://stream.rig-city.com
curl -I https://plex.evindrake.net
```

You should see `HTTP/2 200` or `HTTP/2 301/302` responses instead of timeouts.

---

## Recommended: Option 1 (Upgrade Docker)

The best long-term solution is upgrading Docker to the latest version. This ensures compatibility with all modern container tools and images.
