# Plex External Access Fix Guide

**Date:** December 7, 2025
**Issue:** plex.evindrake.net returning 502 Bad Gateway

## Current Architecture

```
Internet → plex.evindrake.net (DNS) → Linode (69.164.211.205:443)
                                       ↓
                                    Caddy reverse proxy
                                       ↓
                               WireGuard tunnel (10.200.0.2:32400)
                                       ↓
                               Local Ubuntu Plex Server
```

## Diagnosis

| Component | Status | Notes |
|-----------|--------|-------|
| DNS (plex.evindrake.net) | ✓ Working | Points to 69.164.211.205 |
| SSL Certificate | ✓ Valid | Let's Encrypt, expires Mar 4, 2026 |
| Caddy on Linode | ✓ Running | Configured for 10.200.0.2:32400 |
| HTTP Response | ✗ 502 | Bad Gateway - backend unreachable |

## Root Cause

The Linode server cannot reach your local Plex at `10.200.0.2:32400`. This is the WireGuard tunnel IP.

## Fix Options

### Option 1: Verify WireGuard Tunnel (Recommended)

**On Linode:**
```bash
# Check WireGuard status
sudo wg show

# Ping local host through tunnel
ping -c 3 10.200.0.2

# Test Plex directly
curl -s http://10.200.0.2:32400/identity
```

**On Local Ubuntu:**
```bash
# Check WireGuard status
sudo wg show

# Check Plex is running
docker ps | grep plex
# OR (if native)
systemctl status plexmediaserver

# Test Plex locally
curl -s http://localhost:32400/identity
```

**If WireGuard is down:**
```bash
# On both servers
sudo wg-quick up wg0
```

### Option 2: Use Cloudflare Tunnel (Alternative)

If WireGuard is unreliable, use Cloudflare Tunnel from your local Ubuntu host:

```bash
# On Local Ubuntu
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create homelab

# Configure
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: homelab
credentials-file: /home/evin/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: plex.evindrake.net
    service: http://127.0.0.1:32400
  - hostname: home.evindrake.net
    service: http://127.0.0.1:8123
  - service: http_status:404
EOF

# Add DNS route
cloudflared tunnel route dns homelab plex.evindrake.net

# Run as service
sudo cloudflared service install
sudo systemctl start cloudflared
```

### Option 3: Direct Port Forward (For Best Plex Performance)

Configure router port forwarding:

1. On BE9300 router (192.168.0.1):
   - Forward TCP 32400 → 192.168.0.228:32400

2. In Plex settings:
   - Enable Remote Access
   - Set public port to 32400
   - Verify "Fully accessible outside your network"

3. Update DNS to point directly:
```bash
# Point plex.evindrake.net to your public IP (or use Plex's built-in URL)
```

## Verification

After fixing, test with:
```bash
curl -s https://plex.evindrake.net/identity
```

Should return:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer size="0" machineIdentifier="..." version="...">
</MediaContainer>
```

## Next Steps

1. SSH to Linode and check WireGuard tunnel
2. SSH to local Ubuntu and verify Plex is running
3. Test connectivity between hosts
4. Consider Cloudflare Tunnel for reliability
