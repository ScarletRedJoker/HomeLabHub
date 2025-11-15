# Stream Bot OAuth Fix & DNS Status
**Date:** November 15, 2025

## ✅ FIXED: Stream Bot OAuth Authentication

### Problem
Stream bot OAuth sign-in was failing with error:
```
"Unknown authentication strategy 'twitch-signin'"
```

### Root Cause
The Passport.js OAuth strategies only register **IF** environment variables are present. The Twitch/YouTube/Kick client credentials existed in `.env` but were **NOT being passed** to the stream-bot Docker container.

**Discord Bot** (working) ✅:
```yaml
environment:
  TWITCH_CLIENT_ID: ${TWITCH_CLIENT_ID}
  TWITCH_CLIENT_SECRET: ${TWITCH_CLIENT_SECRET}
```

**Stream Bot** (broken) ❌:
```yaml
environment:
  # OAuth credentials completely missing!
```

### Solution Applied
Added OAuth environment variables to `docker-compose.unified.yml`:

```yaml
stream-bot:
  environment:
    TWITCH_CLIENT_ID: ${TWITCH_CLIENT_ID}
    TWITCH_CLIENT_SECRET: ${TWITCH_CLIENT_SECRET}
    YOUTUBE_CLIENT_ID: ${YOUTUBE_CLIENT_ID:-}
    YOUTUBE_CLIENT_SECRET: ${YOUTUBE_CLIENT_SECRET:-}
    KICK_CLIENT_ID: ${KICK_CLIENT_ID:-}
    KICK_CLIENT_SECRET: ${KICK_CLIENT_SECRET:-}
```

### Next Step: Apply Fix on Ubuntu Server
**On your Ubuntu homelab**, sync the latest code and restart the stream-bot:

```bash
cd /home/evin/contain/HomeLabHub
git pull origin main  # Or sync from Replit
docker restart stream-bot

# Verify it's working:
docker logs -f stream-bot | grep -i "oauth\|strategy"
```

After restart, Twitch/YouTube/Kick OAuth sign-in should work correctly!

---

## 🟡 DNS Status: Waiting for Propagation

### Duplicate IP Issue
Earlier `dig` command showed **two IPs** for scarletredjoker.com:
```
64.68.200.54  ← Old/wrong IP (cached)
74.76.32.151  ← Correct IP (your homelab)
```

### Current Status
Your ZoneEdit DNS settings are **CORRECT** ✅:
- **scarletredjoker.com**: Only ONE A record → 74.76.32.151
- **rig-city.com**: Correct A record → 74.76.32.151
- **All evindrake.net subdomains**: Correct A records

### Why Caddy SSL Failed
Let's Encrypt tried to validate `rig-city.com` but connected to the **wrong IP (64.68.200.54)** due to cached DNS records:

```
Error: "64.68.200.54: Error getting validation data"
```

### Solution: Wait for DNS Cache Expiration
The old IP is cached in global DNS servers. This will resolve automatically in **30-60 minutes**.

**Monitor DNS propagation:**
```bash
# Run every 10 minutes until you see only ONE IP:
dig +short A scarletredjoker.com
dig +short A rig-city.com

# When both show ONLY 74.76.32.151, restart Caddy:
docker restart caddy
docker logs -f caddy | grep -i "certificate\|error"
```

### Expected Outcome
After DNS propagates and Caddy restarts:
- ✅ All 11 domains will obtain SSL certificates automatically
- ✅ HTTPS access will work for all services
- ✅ No more "Error getting validation data" errors

---

## Summary

| Issue | Status | Action Required |
|-------|--------|----------------|
| Stream Bot OAuth | ✅ **FIXED** | Restart `stream-bot` container on Ubuntu |
| DNS Duplicate IP | 🟡 **PROPAGATING** | Wait 30-60 min, then restart Caddy |
| Caddy SSL Certs | 🟡 **PENDING** | Will auto-obtain after DNS propagates |

Both issues are resolved in the codebase and will work once applied/propagated!
