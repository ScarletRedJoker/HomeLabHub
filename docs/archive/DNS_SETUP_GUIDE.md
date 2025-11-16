# DNS Configuration Guide for Homelab

## Current DNS Status

### ✅ Properly Configured Domains

**evindrake.net** - All subdomains configured correctly:
- `bot.rig-city.com` → 74.76.32.151 (Discord Bot)
- `stream.rig-city.com` → 74.76.32.151 (Stream Bot)
- `code.evindrake.net` → 74.76.32.151 (VS Code Server)
- `game.evindrake.net` → 74.76.32.151 (Game Streaming)
- `home.evindrake.net` → 74.76.32.151 (Home Assistant)
- `host.evindrake.net` → 74.76.32.151 (Homelab Dashboard)
- `n8n.evindrake.net` → 74.76.32.151 (n8n Automation)
- `plex.evindrake.net` → 74.76.32.151 (Plex Media Server)
- `vnc.evindrake.net` → 74.76.32.151 (VNC Desktop)
- `www.evindrake.net` → CNAME to evindrake.net

**rig-city.com** - Partially configured:
- `bot.rig-city.com` → 74.76.32.151 ✅
- `stream.rig-city.com` → 74.76.32.151 ✅
- `www.rig-city.com` → CNAME to rig-city.com ✅

---

## ⚠️ Missing DNS Records

### 1. rig-city.com (Apex Domain)

**Issue**: The apex domain `rig-city.com` does not have an A record pointing to your server.

**Required Action**:
1. Log into ZoneEdit DNS Manager
2. Navigate to `rig-city.com` domain
3. Add new A record:
   - **Type**: A
   - **Host**: @ (or leave blank for apex)
   - **Content/IP**: 74.76.32.151
   - **TTL**: 3600 (1 hour)

**Purpose**: This will allow the main rig-city.com website to load (currently configured for a community website)

---

### 2. scarletredjoker.com (Not Configured)

**Issue**: This domain has no DNS records configured in ZoneEdit.

**Required Action**:
1. Log into ZoneEdit DNS Manager
2. If the domain is not listed, add it to your account first
3. Add the following records:
   - **A Record for apex domain**:
     - Type: A
     - Host: @ (or scarletredjoker.com)
     - Content: 74.76.32.151
     - TTL: 3600
   
   - **A Record for www subdomain**:
     - Type: A
     - Host: www
     - Content: 74.76.32.151
     - TTL: 3600
   
   OR alternatively use CNAME for www:
   - **CNAME Record for www**:
     - Type: CNAME
     - Host: www
     - Content: scarletredjoker.com.
     - TTL: 3600

**Purpose**: This will enable your personal website at scarletredjoker.com

---

## 🔧 Troubleshooting SSL Certificate Errors

The Caddy logs showed NXDOMAIN errors for domains that DO exist in DNS. This is usually caused by:

### 1. DNS Propagation Delay
- **Issue**: DNS changes can take 15 minutes to 48 hours to propagate globally
- **Solution**: Wait 1-2 hours after adding DNS records before testing SSL
- **Check propagation**: Use https://whatsmydns.net or https://dnschecker.org

### 2. Let's Encrypt Rate Limits
- **Issue**: Too many failed attempts trigger rate limits
- **Solution**: Wait 1 hour between attempts, or test with staging certificates first

### 3. Ports Not Open
- **Issue**: Ports 80/443 must be accessible for Let's Encrypt validation
- **Check**: Verify port forwarding on router and firewall rules

---

## 📋 DNS Checklist

After making DNS changes:

- [ ] rig-city.com apex A record added (74.76.32.151)
- [ ] scarletredjoker.com apex A record added (74.76.32.151)
- [ ] www.scarletredjoker.com CNAME or A record added
- [ ] Wait 15-30 minutes for DNS propagation
- [ ] Test DNS resolution: `dig +short A rig-city.com`
- [ ] Test DNS resolution: `dig +short A scarletredjoker.com`
- [ ] Restart Caddy container to retry SSL certificates
- [ ] Check Caddy logs for successful certificate issuance

---

## 🚀 Re-enabling Commented Domains in Caddyfile

Once DNS records are added and propagated:

1. Edit `Caddyfile`
2. Uncomment the domain blocks for:
   - `rig-city.com` and `www.rig-city.com` (after adding apex A record)
   - `scarletredjoker.com` and `www.scarletredjoker.com` (after adding DNS)
3. Restart Caddy: `docker restart caddy`
4. Monitor logs: `docker logs -f caddy`

---

## 🔍 Verification Commands

```bash
# Check DNS resolution
dig +short A rig-city.com
dig +short A scarletredjoker.com
dig +short A www.scarletredjoker.com

# Check global DNS propagation
nslookup rig-city.com 8.8.8.8
nslookup scarletredjoker.com 8.8.8.8

# Test Let's Encrypt validation
curl -I http://rig-city.com/.well-known/acme-challenge/test

# Check Caddy status
docker logs caddy --tail 50

# Restart Caddy to retry certificates
docker restart caddy
```

---

## 📞 Support Resources

- **ZoneEdit DNS Manager**: https://cp.zoneedit.com/manage/domains/dns/
- **Let's Encrypt Debug Tool**: https://letsdebug.net
- **DNS Propagation Checker**: https://whatsmydns.net
- **Caddy Documentation**: https://caddyserver.com/docs/
