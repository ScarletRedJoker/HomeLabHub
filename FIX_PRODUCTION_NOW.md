# FIX PRODUCTION NOW - Stop Everything Else

## Your Services Are Down. Here's Why:

### 1. RIG-CITY.COM DOMAIN - DNS NOT CONFIGURED ❌

**Error from your logs:**
```
"no valid A records found for rig-city.com"
```

**What This Means:**
Your domain registrar (ZoneEdit) doesn't have DNS A records pointing to your server.

**How to Fix (5 minutes):**

1. Go to ZoneEdit.com and log in
2. Find your rig-city.com domain
3. Add these DNS records:

```
Type: A
Name: @
Value: YOUR_SERVER_IP_ADDRESS
TTL: 300

Type: A  
Name: www
Value: YOUR_SERVER_IP_ADDRESS
TTL: 300

Type: A
Name: bot
Value: YOUR_SERVER_IP_ADDRESS  
TTL: 300

Type: A
Name: stream
Value: YOUR_SERVER_IP_ADDRESS
TTL: 300
```

**Replace YOUR_SERVER_IP_ADDRESS with your actual server IP.**

To find your server IP:
```bash
curl -4 icanhazip.com
```

**Result:** rig-city.com will load in 5-15 minutes after DNS propagates.

---

### 2. STREAM-BOT CRASH-LOOPING ❌

**Error from your logs:**
```
Container is restarting, wait until the container is running
```

**Root Cause:** Missing environment variable `STREAMBOT_SESSION_SECRET`

**How to Fix (2 minutes):**

```bash
cd /home/evin/contain/HomeLabHub

# Add to .env file
echo "STREAMBOT_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')" >> .env

# Restart stream-bot
docker compose -f docker-compose.unified.yml restart stream-bot

# Verify it's running
docker logs stream-bot --tail 20
```

**Result:** Stream-bot will start and stream.rig-city.com will work.

---

### 3. CODE-SERVER WEBSOCKET ERROR

**Status:** Actually already configured correctly!

Your .env has: `CODE_SERVER_PASSWORD=Brs=2729`

**The WebSocket error might be transient. Try:**
```bash
# Restart code-server
docker compose -f docker-compose.unified.yml restart code-server

# Check logs
docker logs code-server --tail 20
```

If still broken, check that Caddy is running:
```bash
docker logs caddy --tail 50
```

---

## PRIORITY ORDER (Do This EXACTLY):

**1. Fix DNS (5 min)** → rig-city.com online
**2. Fix stream-bot secret (2 min)** → stream.rig-city.com online  
**3. Restart code-server (1 min)** → code.evindrake.net working
**4. Test all sites** → Verify everything loads

**TOTAL TIME: 10 minutes**

---

## After Production is Fixed, THEN We Can:

- Design Jarvis IDE integration **properly** (needs VS Code extension, not WebView)
- Build dashboard marketplace features
- Add AI features

**But production FIRST. Always.**

---

## Quick Verification Script

```bash
cd /home/evin/contain/HomeLabHub

echo "=== Checking DNS ==="
dig +short rig-city.com @8.8.8.8
dig +short www.rig-city.com @8.8.8.8
dig +short stream.rig-city.com @8.8.8.8

echo "=== Checking stream-bot ==="
docker ps | grep stream-bot
docker logs stream-bot --tail 5

echo "=== Checking code-server ==="
docker ps | grep code-server
docker logs code-server --tail 5

echo "=== Testing sites ==="
curl -I https://rig-city.com 2>&1 | head -5
curl -I https://stream.rig-city.com 2>&1 | head -5
curl -I https://code.evindrake.net 2>&1 | head -5
```

Run this to verify everything is working.
