# Homelab Fixes Summary - November 15, 2025

## ✅ Issues Fixed

### 1. Game Streaming Page Scrolling Issue

**Problem**: The game-streaming page at https://host.evindrake.net/game-streaming had scrolling issues.

**Root Cause**: HTML syntax error on line 168 of `services/dashboard/templates/game_streaming.html` - closing tag was `</card>` instead of `</div>`.

**Fix**: Corrected the HTML tag to properly close the Bootstrap card component.

**Status**: ✅ **FIXED** - Page should now scroll properly.

---

### 2. Caddyfile SSL Certificate Errors

**Problem**: Caddy was attempting to obtain Let's Encrypt SSL certificates for domains that don't have DNS records configured, causing errors:
- `rig-city.com` (apex domain) - Missing A record
- `www.rig-city.com` - Redirects to apex domain (which is missing)
- `scarletredjoker.com` - No DNS records configured
- `www.scarletredjoker.com` - No DNS records configured

**Root Cause**: 
1. Caddyfile configured for domains without DNS records
2. DNS NXDOMAIN errors occur when Let's Encrypt tries to validate domains
3. rig-city.com only has subdomains (bot, stream) but not the apex domain

**Fix**: 
- Created backup of original Caddyfile → `Caddyfile.backup`
- Updated Caddyfile to **comment out** domains without DNS records:
  - ✅ `bot.rig-city.com` and `stream.rig-city.com` - Active (have DNS)
  - ⚠️ `rig-city.com` and `www.rig-city.com` - **COMMENTED OUT** (need apex A record)
  - ⚠️ `scarletredjoker.com` and `www.scarletredjoker.com` - **COMMENTED OUT** (no DNS)
- Added clear documentation in Caddyfile explaining why domains are disabled
- All other domains remain active (evindrake.net subdomains all have proper DNS)

**Status**: ✅ **FIXED** - Caddy will no longer attempt SSL for unconfigured domains.

---

## 📋 DNS Configuration Summary

### ✅ Properly Configured (No Action Needed)

**evindrake.net** - All 9 subdomains working:
- code.evindrake.net → 74.76.32.151 (VS Code Server)
- game.evindrake.net → 74.76.32.151 (Game Streaming)
- home.evindrake.net → 74.76.32.151 (Home Assistant)
- host.evindrake.net → 74.76.32.151 (Dashboard)
- n8n.evindrake.net → 74.76.32.151 (Automation)
- plex.evindrake.net → 74.76.32.151 (Media Server)
- vnc.evindrake.net → 74.76.32.151 (Remote Desktop)
- www.evindrake.net → CNAME to evindrake.net

**rig-city.com** - Partially configured:
- bot.rig-city.com → 74.76.32.151 ✅ (Discord Bot)
- stream.rig-city.com → 74.76.32.151 ✅ (Stream Bot)
- www.rig-city.com → CNAME to rig-city.com ✅

---

### ⚠️ Missing DNS Records (Action Required)

#### 1. rig-city.com (Apex Domain)
**Status**: Not configured in ZoneEdit  
**Impact**: rig-city.com community website cannot be accessed  
**Service Waiting**: `rig-city-site` Docker container (nginx)

**To Fix**:
1. Go to ZoneEdit DNS Manager: https://cp.zoneedit.com/manage/domains/dns/
2. Select `rig-city.com` domain
3. Add A record:
   - Type: **A**
   - Host: **@** (or blank for apex)
   - Content: **74.76.32.151**
   - TTL: **3600**

#### 2. scarletredjoker.com (Entire Domain)
**Status**: Not configured in ZoneEdit  
**Impact**: Personal website cannot be accessed  
**Service Waiting**: `scarletredjoker-web` Docker container (nginx)

**To Fix**:
1. Go to ZoneEdit DNS Manager
2. Add domain to account if not present
3. Add A records:
   - **Apex domain**: scarletredjoker.com → 74.76.32.151
   - **WWW subdomain**: www.scarletredjoker.com → 74.76.32.151 (or CNAME to scarletredjoker.com)

---

## 🔧 Next Steps

### Immediate (No Action Required)
- ✅ Game streaming page scrolling is fixed
- ✅ Caddy will stop attempting SSL for unconfigured domains
- ✅ All evindrake.net services continue working normally
- ✅ Discord bot and stream bot on rig-city.com continue working

### When Ready to Enable Additional Domains

**For rig-city.com community website**:
1. Add DNS A record (see above)
2. Wait 15-30 minutes for DNS propagation
3. Test: `dig +short A rig-city.com`
4. Edit `Caddyfile` and uncomment lines 35-42 (rig-city.com blocks)
5. Restart Caddy: `docker restart caddy`

**For scarletredjoker.com personal website**:
1. Add DNS records (see above)
2. Wait 15-30 minutes for DNS propagation
3. Test: `dig +short A scarletredjoker.com`
4. Edit `Caddyfile` and uncomment lines 171-180 (scarletredjoker.com blocks)
5. Restart Caddy: `docker restart caddy`

---

## 📚 Documentation Created

1. **DNS_SETUP_GUIDE.md** - Comprehensive guide for configuring missing DNS records
2. **Caddyfile.backup** - Backup of original Caddyfile before changes
3. **FIXES_SUMMARY.md** (this file) - Summary of all fixes and next steps

---

## 🔍 Verification

To verify the fixes:

```bash
# Test game streaming page
curl -I https://host.evindrake.net/game-streaming

# Check Caddy status (should show no errors for missing domains)
docker logs caddy --tail 50

# Verify DNS resolution for working domains
dig +short A host.evindrake.net
dig +short A bot.rig-city.com
dig +short A stream.rig-city.com

# Check what domains need DNS (should return NXDOMAIN)
dig +short A rig-city.com
dig +short A scarletredjoker.com
```

---

## 🎯 Summary

**Fixed**: 
- ✅ Game streaming page scrolling issue
- ✅ Caddy SSL errors for unconfigured domains
- ✅ Documented all missing DNS records

**Working Services** (11 total):
1. Homelab Dashboard (host.evindrake.net)
2. Discord Bot (bot.rig-city.com)
3. Stream Bot (stream.rig-city.com)
4. Plex (plex.evindrake.net)
5. n8n (n8n.evindrake.net)
6. VNC Desktop (vnc.evindrake.net)
7. Code Server (code.evindrake.net)
8. Game Streaming (game.evindrake.net)
9. Home Assistant (home.evindrake.net)

**Waiting for DNS** (2 services):
1. Rig City Community Website (rig-city.com)
2. Scarlet Red Joker Personal Site (scarletredjoker.com)

---

**All critical issues resolved!** The homelab is operational with 9 working services. The 2 disabled services can be enabled anytime by adding DNS records following the DNS_SETUP_GUIDE.md instructions.
