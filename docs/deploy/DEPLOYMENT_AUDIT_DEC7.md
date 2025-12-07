# Deployment Audit Report - December 7, 2025

## Executive Summary

| Environment | Status | Notes |
|-------------|--------|-------|
| **Replit Dev** | ✓ Running | All 3 workflows healthy |
| **Linode Cloud** | ⚠ Partial | Dashboard works, Plex 502 |
| **Local Ubuntu** | ❓ Unknown | Need to verify WireGuard/Plex |

---

## 1. Replit Development Environment

### Workflows Status

| Workflow | Port | Status | Notes |
|----------|------|--------|-------|
| Dashboard | 5000 | ✓ Running | Flask app, database connected |
| Discord Bot | 4000 | ✓ Running | Connected to 2 servers (Rig City + Joker's HQ) |
| Stream Bot | 3000 | ✓ Running | OAuth configured for Twitch/YouTube/Spotify/Kick |

### Database

| Item | Status |
|------|--------|
| Provider | Neon PostgreSQL (cloud) |
| Migrations | ✓ Complete |
| Connection | ✓ Healthy |

### Secrets Status

| Secret | Status | Notes |
|--------|--------|-------|
| CLOUDFLARE_API_TOKEN | ✓ Set | 4 zones accessible |
| DATABASE_URL | ✓ Set | Neon PostgreSQL |
| DISCORD_BOT_TOKEN | ✓ Set | Bot online |
| TWITCH_CLIENT_ID/SECRET | ✓ Set | OAuth working |
| YOUTUBE_CLIENT_ID/SECRET | ✓ Set | OAuth working |
| SPOTIFY_CLIENT_ID/SECRET | ✓ Set | OAuth working |
| KICK_CLIENT_SECRET | ✓ Set | OAuth working |
| PLEX_TOKEN | ✓ Set | Ready for production |
| HOME_ASSISTANT_TOKEN | ✗ Not Set | Integration disabled |
| YOUTUBE_API_KEY | ✗ Not Set | Discord notifications disabled |

---

## 2. Linode Cloud Production

### Public Endpoints

| Domain | Expected | Actual | Status |
|--------|----------|--------|--------|
| dashboard.evindrake.net | Login page | Redirect to /login | ✓ Working |
| plex.evindrake.net | Plex server | 502 Bad Gateway | ✗ Broken |
| bot.rig-city.com | Discord bot UI | Not tested | ❓ |
| stream.rig-city.com | Stream bot UI | Not tested | ❓ |
| n8n.evindrake.net | n8n workflows | Not tested | ❓ |

### Plex Issue Analysis

**Problem:** 502 Bad Gateway on plex.evindrake.net

**Architecture:**
```
plex.evindrake.net → Linode:443 → Caddy → WireGuard (10.200.0.2:32400) → Local Plex
```

**Root Cause:** Caddy on Linode cannot reach Plex on local Ubuntu at 10.200.0.2:32400

**Possible Fixes:**
1. **Verify WireGuard** - Check tunnel is up on both hosts
2. **Use Cloudflare Tunnel** - More reliable than WireGuard for HTTP traffic
3. **Direct Port Forward** - Best streaming performance, router config

See [PLEX_FIX_GUIDE.md](./PLEX_FIX_GUIDE.md) for detailed instructions.

---

## 3. Cloudflare DNS Status

### Zones Confirmed

| Zone | Zone ID | Status |
|------|---------|--------|
| evindrake.com | 472b22852e6b5c22bf014b3ef9d86955 | Active |
| evindrake.net | 04172ef20635e7419c20ea28c2cd77a4 | Active |
| rig-city.com | 3b3b81eb7c45049cd3667cff121dbc2d | Active |
| scarletredjoker.com | 1286c8b2f23f80444f06808e5215230c | Active |

### evindrake.net DNS Records

| Subdomain | Type | Target | Proxied |
|-----------|------|--------|---------|
| plex | A | 69.164.211.205 | No |
| dashboard | A | 69.164.211.205 | No |
| host | A | 69.164.211.205 | Yes |
| home | A | 69.164.211.205 | No |
| n8n | A | 69.164.211.205 | No |
| code | A | 69.164.211.205 | No |
| game | A | 69.164.211.205 | No |
| vnc | A | 69.164.211.205 | No |
| minio | A | 69.164.211.205 | No |
| local | A | 74.76.32.151 | No |

---

## 4. Action Items

### Immediate (High Priority)

| # | Task | Owner | Status |
|---|------|-------|--------|
| 1 | Fix Plex 502 - verify WireGuard tunnel | Evin | Pending |
| 2 | Test WireGuard connectivity Linode ↔ Local | Evin | Pending |
| 3 | Verify Plex is running on local Ubuntu | Evin | Pending |

### Short-term (Quality of Life)

| # | Task | Status |
|---|------|--------|
| 4 | Consider Cloudflare Tunnel for local services | Recommended |
| 5 | Set HOME_ASSISTANT_TOKEN in production | Optional |
| 6 | Set YOUTUBE_API_KEY for Discord notifications | Optional |
| 7 | Test all production endpoints | Pending |

### Commands to Run on Servers

**On Linode (via SSH):**
```bash
# Check WireGuard
sudo wg show

# Test local host connectivity
ping -c 3 10.200.0.2
curl -s http://10.200.0.2:32400/identity

# Check Caddy logs
docker logs caddy --tail 50
```

**On Local Ubuntu (via SSH):**
```bash
# Check WireGuard
sudo wg show

# Check Plex
docker ps | grep plex
curl -s http://localhost:32400/identity

# Check firewall
sudo ufw status
```

---

## 5. Recommended Architecture Improvements

### Option A: Cloudflare Tunnel (Recommended)

Replace WireGuard reverse proxy with Cloudflare Tunnel for HTTP services:

**Benefits:**
- More reliable than WireGuard for web traffic
- No port forwarding needed
- DDoS protection
- Zero Trust authentication option

**Implementation:**
1. Install `cloudflared` on local Ubuntu
2. Create tunnel and configure ingress
3. Update DNS to use tunnel routing
4. Remove WireGuard reverse proxy from Caddy

### Option B: Keep Current Architecture

If WireGuard is preferred:
- Ensure WireGuard is set to auto-reconnect
- Add health checks and alerting
- Consider backup route via Tailscale

---

## Summary

Your Replit development environment is fully functional. The main issue is **Plex external access** - the WireGuard tunnel between Linode and your local Ubuntu host appears to be down or Plex isn't responding.

**Next step:** SSH into your Linode and local Ubuntu to diagnose the WireGuard tunnel.
