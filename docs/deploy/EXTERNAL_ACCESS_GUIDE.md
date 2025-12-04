# External Access Guide - Friends Without VPN

This guide explains how to make your homelab services accessible to friends from anywhere, without requiring them to use a VPN.

---

## Quick Decision Guide

| Service | Recommended Method | Why |
|---------|-------------------|-----|
| **Plex** | Router Port Forward OR Cloudflare Tunnel | Best streaming performance with port forward; Tunnel works too |
| **Home Assistant** | Cloudflare Tunnel + Access | Security-sensitive, needs Zero Trust |
| **MinIO** | Cloudflare Tunnel + Access | Storage access needs authentication |
| **Sunshine/GameStream** | VPN Only | Low-latency gaming requires direct connection |

---

## Option 1: Cloudflare Tunnel (Recommended for Most Services)

### Why Cloudflare Tunnel?
- No router ports to open (more secure)
- Automatic SSL certificates
- DDoS protection included
- Zero Trust authentication for sensitive services
- Works even if ISP blocks ports

### Setup on Ubuntu Host

#### Step 1: Install cloudflared
```bash
# Download and install
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Verify installation
cloudflared --version
```

#### Step 2: Authenticate with Cloudflare
```bash
cloudflared tunnel login
# This opens a browser to authenticate with your Cloudflare account
# Select the domain you want to use (evindrake.net)
```

#### Step 3: Create the Tunnel
```bash
# Create a named tunnel
cloudflared tunnel create homelab

# Note the Tunnel ID and credentials file path shown
# Example: /home/evin/.cloudflared/<tunnel-id>.json
```

#### Step 4: Configure Tunnel Routes
Create the config file at `~/.cloudflared/config.yml`:

```yaml
tunnel: homelab
credentials-file: /home/evin/.cloudflared/<tunnel-id>.json

ingress:
  # Plex Media Server
  - hostname: plex.evindrake.net
    service: http://127.0.0.1:32400
  
  # Home Assistant (add Cloudflare Access for security)
  - hostname: home.evindrake.net
    service: http://127.0.0.1:8123
  
  # MinIO Console (add Cloudflare Access for security)
  - hostname: minio.evindrake.net
    service: http://127.0.0.1:9001
  
  # MinIO S3 API
  - hostname: s3.evindrake.net
    service: http://127.0.0.1:9000
  
  # Catch-all (required)
  - service: http_status:404
```

#### Step 5: Add DNS Records
```bash
# Create DNS records for each hostname
cloudflared tunnel route dns homelab plex.evindrake.net
cloudflared tunnel route dns homelab home.evindrake.net
cloudflared tunnel route dns homelab minio.evindrake.net
cloudflared tunnel route dns homelab s3.evindrake.net
```

#### Step 6: Run as a Service
```bash
# Install as systemd service
sudo cloudflared service install

# Start the service
sudo systemctl start cloudflared
sudo systemctl enable cloudflared

# Check status
sudo systemctl status cloudflared
```

### Adding Cloudflare Access (Zero Trust)

For Home Assistant and MinIO, add authentication:

1. Go to https://one.dash.cloudflare.com/
2. Navigate to **Access** → **Applications**
3. Click **Add an application** → **Self-hosted**
4. Configure:
   - Application name: `Home Assistant`
   - Subdomain: `home`
   - Domain: `evindrake.net`
5. Add a policy:
   - Policy name: `Friends Only`
   - Action: `Allow`
   - Include: Add email addresses of allowed friends
6. Save and repeat for MinIO

---

## Option 2: Router Port Forwarding (Best for Plex)

For optimal Plex streaming quality with minimal latency:

### Step 1: Configure Port Forwarding on BE9300

1. Open router admin: http://192.168.0.1
2. Go to **Advanced** → **NAT Forwarding** → **Port Forwarding**
3. Add a new rule:
   - **Name**: Plex
   - **External Port**: 32400
   - **Internal IP**: 192.168.0.228
   - **Internal Port**: 32400
   - **Protocol**: TCP
4. Save and apply

### Step 2: Enable Plex Remote Access

1. Open Plex Web: http://192.168.0.228:32400/web
2. Go to **Settings** → **Remote Access**
3. Enable **Manually specify public port**
4. Set port to **32400**
5. Click **Apply** and verify it shows "Fully accessible outside your network"

### Step 3: Invite Friends

1. Go to https://app.plex.tv
2. **Settings** → **Users & Sharing** → **Invite Friend**
3. Enter their email address
4. Select which libraries to share
5. They'll receive an email to create a Plex account

---

## Security Best Practices

### DO:
- Use Cloudflare Access for Home Assistant and MinIO
- Keep Plex authentication enabled
- Use strong passwords for all services
- Keep services updated

### DON'T:
- Never expose Sunshine/GameStream externally (use VPN only)
- Never disable Plex authentication
- Never port forward SSH (22) publicly
- Never expose database ports (5432, 6379) publicly

---

## Troubleshooting

### Cloudflare Tunnel Not Working
```bash
# Check tunnel status
cloudflared tunnel info homelab

# Check service logs
sudo journalctl -u cloudflared -f

# Test locally first
curl http://127.0.0.1:32400/identity
```

### Plex Remote Access Not Working
```bash
# Check if port is open
sudo ss -tlnp | grep 32400

# Check from external (use phone data, not WiFi)
curl -s https://plex.evindrake.net/identity

# Verify router port forward
# Use https://canyouseeme.org with port 32400
```

### Friends Can't Connect
1. Verify they created a Plex account with the invited email
2. Check they accepted the library share invitation
3. Ensure they're using the Plex app (not direct IP)
4. Verify your server is online at https://app.plex.tv

---

## Quick Reference

### Service URLs (After Setup)

| Service | External URL | Authentication |
|---------|--------------|----------------|
| Plex | https://plex.evindrake.net OR app.plex.tv | Plex account |
| Home Assistant | https://home.evindrake.net | Cloudflare Access + HA login |
| MinIO Console | https://minio.evindrake.net | Cloudflare Access + MinIO login |

### Commands Cheat Sheet
```bash
# Cloudflare Tunnel
cloudflared tunnel list                    # List tunnels
cloudflared tunnel info homelab            # Tunnel info
sudo systemctl status cloudflared          # Service status
sudo systemctl restart cloudflared         # Restart tunnel

# Plex
docker logs plex --tail 50                 # Plex logs
curl http://127.0.0.1:32400/identity       # Test Plex locally

# General
sudo netfilter-persistent save             # Save iptables
sudo ss -tlnp                              # List listening ports
```
