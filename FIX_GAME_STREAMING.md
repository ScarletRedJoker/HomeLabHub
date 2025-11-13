# Fix: game.evindrake.net SSL Error

## Problem
"Secure Connection Failed" error when accessing game.evindrake.net

## Root Causes
1. SSL certificate not issued yet (Let's Encrypt takes time)
2. DNS not propagated
3. Caddy hasn't requested certificate yet

---

## Solution 1: Wait for SSL Certificate (Recommended)

Let's Encrypt certificates can take **2-5 minutes** to issue on first request.

### Check Certificate Status
```bash
# On Ubuntu server
docker logs caddy --tail 100 | grep -i "game.evindrake.net\|certificate\|acme"
```

**Look for**:
- ✅ "certificate obtained successfully"
- ✅ "serving https://game.evindrake.net"
- ❌ "failed to obtain certificate" (indicates DNS issue)

### Force Certificate Request
```bash
# Restart Caddy to trigger certificate request
docker restart caddy

# Watch logs for certificate issuance
docker logs -f caddy
```

Wait 2-5 minutes, then test: https://game.evindrake.net

---

## Solution 2: Check DNS Configuration

### Verify DNS is pointing to your server
```bash
# Check DNS resolution
dig game.evindrake.net

# Or
nslookup game.evindrake.net
```

**Expected**: Should point to your server's public IP address

**If DNS is wrong**:
1. Update your DNS provider (ZoneEdit)
2. Add A record: `game.evindrake.net` → Your public IP
3. Wait 5-15 minutes for propagation
4. Restart Caddy: `docker restart caddy`

---

## Solution 3: Test HTTP First (Temporary)

If SSL is taking too long, test HTTP first:

```bash
# On Ubuntu server
curl -I http://game.evindrake.net
```

**Expected**: Should redirect to HTTPS or show connection

**If this fails**: DNS is not configured correctly

---

## Solution 4: Check Port Forwarding

Ensure ports are open:

```bash
# Check if ports 80 and 443 are listening
sudo netstat -tlnp | grep -E ':80|:443'
```

**Expected output**:
```
tcp6  0  0  :::80   :::*  LISTEN  <docker-proxy>
tcp6  0  0  :::443  :::*  LISTEN  <docker-proxy>
```

**If ports not listening**:
- Check Caddy is running: `docker ps | grep caddy`
- Check port forwarding on router (80, 443 → server IP)

---

## Solution 5: Manual Certificate via Certbot (Last Resort)

If Caddy can't obtain certificates:

```bash
# Install certbot
sudo apt install certbot

# Get certificate manually
sudo certbot certonly --standalone -d game.evindrake.net

# Stop Caddy first
docker stop caddy

# Run certbot
sudo certbot certonly --standalone -d game.evindrake.net

# Restart Caddy
docker start caddy
```

Then configure Caddy to use the manual certificate (advanced).

---

## Verify It's Working

### Test 1: Check Certificate
```bash
# Should show valid certificate
openssl s_client -connect game.evindrake.net:443 -servername game.evindrake.net
```

### Test 2: Access via Browser
Visit: https://game.evindrake.net

**Expected**: Game streaming connection guide page

**Not**: SSL error or 404

### Test 3: Check Caddy Logs
```bash
docker logs caddy --tail 50
```

**Look for**:
- ✅ "certificate obtained successfully"
- ✅ "serving https://game.evindrake.net"
- ❌ "acme: error" (certificate failed)

---

## Common Errors & Fixes

### Error: "acme: error: 400"
**Cause**: DNS not pointing to your server  
**Fix**: Update DNS, wait for propagation

### Error: "certificate obtained successfully" but still SSL error
**Cause**: Browser cache or DNS cache  
**Fix**: 
- Clear browser cache (Ctrl+Shift+Del)
- Clear DNS cache: `sudo systemd-resolve --flush-caches`
- Try incognito mode

### Error: "timeout during connect"
**Cause**: Firewall or port forwarding issue  
**Fix**: 
- Check firewall: `sudo ufw status`
- Allow ports: `sudo ufw allow 80,443/tcp`
- Check router port forwarding

---

## Expected Timeline

| Time | What Happens |
|------|--------------|
| 0 min | Restart Caddy |
| 1-2 min | Caddy requests certificate from Let's Encrypt |
| 2-5 min | Certificate issued and installed |
| 5 min | HTTPS working |

**If not working after 10 minutes**: DNS issue or port forwarding problem

---

## Quick Checklist

- [ ] DNS points to server IP (`dig game.evindrake.net`)
- [ ] Ports 80/443 open on router
- [ ] Firewall allows 80/443
- [ ] Caddy is running (`docker ps | grep caddy`)
- [ ] Waited 5 minutes after restart
- [ ] Cleared browser cache
- [ ] Tried incognito mode

---

## Still Not Working?

### Option 1: Use HTTP Temporarily
Add to Caddyfile:
```caddyfile
http://game.evindrake.net {
    redir /game-connect permanent
    reverse_proxy homelab-dashboard:5000
}
```

Then restart: `docker restart caddy`

### Option 2: Check Twingate VPN
If accessing via Twingate:
- Ensure game.evindrake.net is in allowed resources
- Try accessing from LAN directly (bypass VPN)

### Option 3: Contact Me
Provide:
```bash
# Collect diagnostic info
docker logs caddy --tail 200 > caddy-logs.txt
dig game.evindrake.net > dns-info.txt
sudo netstat -tlnp | grep -E ':80|:443' > ports.txt
```

Send these files for analysis.

---

*Created: Nov 13, 2025*
*Most SSL errors resolve in 5-10 minutes after DNS/Caddy restart*
