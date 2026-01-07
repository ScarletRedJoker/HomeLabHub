# Public Access Setup Runbook

This guide covers setting up secure public access to all Nebula Command homelab services via custom domains.

## Architecture Overview

```
Internet → Cloudflare (DNS + DDoS) → Caddy (Reverse Proxy) → Services
                                          ↓
                                     Authelia (SSO)
```

### Service Categories

| Category | Services | Auth |
|----------|----------|------|
| **Public** | Plex, Jellyfin, Home Assistant, Dashboard | Native auth (bypass Authelia) |
| **Protected** | qBittorrent, VNC, SSH, VMs, Sunshine, MinIO | Authelia 2FA required |

## Prerequisites

1. **Domain** registered and pointed to Cloudflare nameservers
2. **Cloudflare API Token** with Zone:Edit permissions
3. **Public IP** or Tailscale accessible server
4. **Router port forwarding** configured (see below)

## Router Port Forwarding (REQUIRED for full bandwidth)

Media services use DNS-only mode to bypass Cloudflare bandwidth limits. You MUST configure your router:

| External Port | Internal IP | Internal Port | Protocol | Purpose |
|--------------|-------------|---------------|----------|---------|
| 80 | YOUR_SERVER_IP | 80 | TCP | HTTP redirect |
| 443 | YOUR_SERVER_IP | 443 | TCP | HTTPS/TLS |
| 32400 | YOUR_SERVER_IP | 32400 | TCP | Plex direct (optional) |

### Why This Matters
- **With Cloudflare proxy**: Limited to ~15-20 Mbps for video (throttled)
- **With DNS-only + port forward**: Full upload bandwidth (50+ Mbps typical)

Media services (Plex, Jellyfin, Sunshine) use DNS-only for streaming performance.
Protected services (torrent, VNC, SSH) use Cloudflare proxy for DDoS protection.

## Quick Start

```bash
cd /opt/homelab/HomeLabHub
git pull origin main
cd deploy/local

# 1. Configure environment
cp .env.example .env
nano .env  # Set DOMAIN, CLOUDFLARE_API_TOKEN, etc.

# 2. Deploy everything
./deploy.sh

# 3. Install systemd service (auto-start on boot)
./deploy.sh install

# 4. Create Authelia user
./deploy.sh authelia  # Generate password hash
nano services/authelia/users_database.yml  # Add user
docker compose restart authelia
```

## Configuration Files

### 1. Environment (.env)

Required variables:
```bash
DOMAIN=yourdomain.com
ADMIN_EMAIL=you@email.com
CLOUDFLARE_API_TOKEN=cf_xxx
MULLVAD_PRIVATE_KEY=xxx  # For VPN torrents
```

### 2. DNS Records (config/domains.yml)

Edit to match your domain:
```yaml
domain: yourdomain.com
server_ip: auto  # or your public IP
subdomains:
  - name: plex
  - name: jellyfin
  - name: vnc
  # ... etc
```

Sync DNS: `./deploy.sh dns-sync`

### 3. Authelia Users (services/authelia/users_database.yml)

Add users with password hashes:
```yaml
users:
  yourname:
    displayname: "Your Name"
    password: "$argon2id$v=19$m=65536,t=3,p=4$..."
    email: you@email.com
    groups:
      - admins
```

Generate hash: `./deploy.sh authelia`

### 4. Caddy Routes (services/caddy/Caddyfile)

Already configured for all services. Customize if needed.

## Service URLs

After deployment, access services at:

| Service | URL | Auth |
|---------|-----|------|
| Dashboard | `https://dashboard.DOMAIN` | Native |
| Plex | `https://plex.DOMAIN` | Native |
| Jellyfin | `https://jellyfin.DOMAIN` | Native |
| Home Assistant | `https://home.DOMAIN` | Native |
| Auth Portal | `https://auth.DOMAIN` | - |
| Torrents | `https://torrent.DOMAIN` | Authelia |
| VNC Desktop | `https://vnc.DOMAIN` | Authelia |
| SSH Terminal | `https://ssh.DOMAIN` | Authelia |
| VM Manager | `https://vms.DOMAIN` | Authelia |
| Game Stream | `https://gamestream.DOMAIN` | Authelia |
| Object Storage | `https://storage.DOMAIN` | Authelia |

## Host Requirements

Install these on the host Ubuntu system:

```bash
# Cockpit for VM management
sudo apt install cockpit cockpit-machines
sudo systemctl enable --now cockpit.socket

# x11vnc for desktop sharing (if using VNC)
sudo apt install x11vnc
# Then run: x11vnc -display :0 -forever -shared -rfbport 5900
```

## Sunshine/Moonlight Setup

Sunshine (game streaming) exposes these ports directly:
- TCP: 47984, 47989, 47990, 48010
- UDP: 47998, 47999, 48000, 48002, 48010

Configure your firewall to allow these for Moonlight clients.

## Troubleshooting

### DNS not resolving
```bash
# Check Cloudflare records
./deploy.sh dns-sync

# Verify DNS propagation
dig +short plex.yourdomain.com
```

### Authelia login failing
```bash
# Check Authelia logs
docker compose logs authelia

# Regenerate secrets
openssl rand -hex 32  # Update configuration.yml
docker compose restart authelia
```

### Service not accessible
```bash
# Check Caddy logs
docker compose logs caddy

# Verify service is running
docker compose ps

# Test internal connectivity
docker compose exec caddy wget -qO- http://jellyfin:8096/health
```

### SSL certificate errors
```bash
# Check Caddy certificate status
docker compose exec caddy caddy list-certificates

# Force certificate renewal
docker compose restart caddy
```

## Security Notes

1. **Authelia 2FA**: Strongly recommended for protected services
2. **Fail2ban**: Consider adding for brute-force protection
3. **Cloudflare Proxy**: Enabled by default for DDoS protection
4. **VPN Torrents**: All torrent traffic routes through Mullvad
5. **Gluetun Firewall**: 
   - `FIREWALL_VPN_INPUT_PORTS=6881` - Allows torrent peer connections through VPN
   - `FIREWALL_INPUT_PORTS=8080` - Allows Caddy to reach qBittorrent WebUI on internal Docker network (not exposed to host)

## Backup

Important files to backup:
- `.env` - Environment configuration
- `services/authelia/` - User database and config
- Docker volumes (use `docker compose down` then backup `/var/lib/docker/volumes/`)

## Updating

```bash
cd /opt/homelab/HomeLabHub
./deploy/local/deploy.sh  # Pulls latest + redeploys
```
