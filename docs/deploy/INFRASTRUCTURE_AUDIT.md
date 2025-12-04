# Infrastructure Audit Report
**Date:** December 4, 2025
**Status:** Phase 3 Complete - Full Audit

## Executive Summary

The Nebula Command Dashboard homelab deployment consists of:
- **Linode Cloud Server**: Stateful services (Dashboard, Discord Bot, Stream Bot, PostgreSQL, n8n, Caddy)
- **Local Ubuntu Host**: Docker services (Plex, MinIO, Home Assistant) + Windows 11 KVM VM
- **Windows 11 VM**: RTX 3060 GPU passthrough with Sunshine GameStream (NOW WORKING)

---

## 1. Sunshine GameStream Status

### Status: WORKING ✅
- **Resolution**: 1920x1080 @ 60Hz (FIXED)
- **Streaming Quality**: High quality achieved
- **Moonlight Pairing**: Complete
- **Port Forwarding**: Configured via iptables on Ubuntu host

### Fix: Configure SudoVDA for 1080p@60Hz

**On Windows VM, run as Administrator:**

```powershell
# Option 1: Use VDD Control Panel (if installed)
# Open the SudoMaker VDD Control application and add a 1920x1080@60Hz display

# Option 2: Configure via Registry
$regPath = "HKLM:\SOFTWARE\SudoMaker\VirtualDisplayDriver"
New-ItemProperty -Path $regPath -Name "Width" -Value 1920 -PropertyType DWORD -Force
New-ItemProperty -Path $regPath -Name "Height" -Value 1080 -PropertyType DWORD -Force
New-ItemProperty -Path $regPath -Name "RefreshRate" -Value 60 -PropertyType DWORD -Force

# Option 3: Use Parsec VDD Control
# Run ParsecVDD.exe from Start Menu and add 1920x1080@60Hz display

# After configuration, restart the display driver:
pnputil /restart-device "ROOT\DISPLAY\0000"

# Restart Sunshine
Stop-Process -Name "sunshine" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
cd "C:\Program Files\Sunshine"
.\sunshine.exe
```

### Sunshine Configuration (sunshine.conf)
```ini
adapter_name = NVIDIA GeForce RTX 3060
capture = nvfbc
nvenc_spatial_aq = enabled
address_family = both
audio_sink = Audio Sink
virtual_sink = Steam Virtual Audio Sink
key_rightalt_to_key_win = enabled
min_log_level = 1
origin_web_ui_allowed = wan
sunshine_name = RDPWindows
```

---

## 2. Linode Cloud Services Audit

### Services Status

| Service | Container | Port | Domain | Status |
|---------|-----------|------|--------|--------|
| Caddy (Reverse Proxy) | caddy | 80, 443 | - | CONFIGURED |
| Dashboard | homelab-dashboard | 5000 | host.evindrake.net, dashboard.evindrake.net | CONFIGURED |
| Discord Bot | discord-bot | 4000 | bot.rig-city.com | RUNNING |
| Stream Bot | stream-bot | 5000 | stream.rig-city.com | RUNNING |
| PostgreSQL | homelab-postgres | 5432 | internal | CONFIGURED |
| Redis | homelab-redis | 6379 | internal | CONFIGURED |
| n8n | n8n | 5678 | n8n.evindrake.net | CONFIGURED |
| Code Server | code-server | 8443 | code.evindrake.net | CONFIGURED |
| Rig City Website | rig-city-site | 80 | rig-city.com | CONFIGURED |
| ScarletRedJoker Website | scarletredjoker-web | 80 | scarletredjoker.com | CONFIGURED |

### Issues Found

#### Critical
- None

#### Medium
| Issue | Current State | Required Action |
|-------|---------------|-----------------|
| YouTube API | Not configured | Set YOUTUBE_API_KEY secret |
| Home Assistant Token | Not configured | Set HOME_ASSISTANT_TOKEN secret |
| Cloudflare API Token | Not set in env | Set CLOUDFLARE_API_TOKEN for DNS automation |

#### Low
| Issue | Current State | Notes |
|-------|---------------|-------|
| Redis (Replit env) | Connection refused | Expected - Redis runs in Docker on Linode, not in Replit dev env |
| Docker (Replit env) | Not available | Expected - Docker runs on Linode, not in Replit |
| Ollama | Not available | Optional - local LLM fallback |

---

## 3. Local Ubuntu Services Audit

### Configured Services (deploy/local/docker-compose.yml)

| Service | Container | Port | Domain | Notes |
|---------|-----------|------|--------|-------|
| Caddy (Local) | caddy-local | 80, 443 | - | Local reverse proxy |
| Plex | plex-server | 32400 | plex.evindrake.net | Media server |
| MinIO | homelab-minio | 9000, 9001 | - | S3-compatible storage |
| Home Assistant | homeassistant | 8123 | home.evindrake.net | Smart home hub |

### Additional Subdomains
- vnc.evindrake.net → 172.17.0.1:6080 (noVNC for Windows VM)
- game.evindrake.net → Redirects to dashboard game-connect

### Requirements
- `/mnt/nas` mount point for Plex media
- `/dev/dri` for Plex hardware transcoding
- USB passthrough for Home Assistant (Zigbee/Z-Wave)

---

## 4. Windows 11 VM Configuration

### Current State: WORKING

| Component | Status | Details |
|-----------|--------|---------|
| GPU Passthrough | Working | RTX 3060 (12GB VRAM) |
| Sunshine/Vibeshine | Working | v1.11.4, NVENC H.264/HEVC encoders |
| Virtual Display | Working | SudoMaker VDA + Parsec VDD installed |
| Network | Working | NAT: 192.168.122.250, Tailscale: 100.118.44.102 |
| WinApps | Setup Complete | RDP integration ready |

### Display Adapters Installed
1. NVIDIA GeForce RTX 3060 (primary)
2. Microsoft Remote Display Adapter (RDP)
3. Parsec Virtual Display Adapter
4. SudoMaker Virtual Display Adapter
5. Virtual Display Driver

### Mode Switching Scripts (Installed)
- `gaming-mode.sh` - Switch to Sunshine for Moonlight streaming
- `productivity-mode.sh` - Switch to RDP for WinApps
- `moonlight-wrapper.sh` - Auto-switch + launch Moonlight
- `winapps-wrapper.sh` - Auto-switch + launch WinApps

---

## 5. Network Configuration

### WireGuard VPN Tunnel
| Host | WireGuard IP | Status |
|------|--------------|--------|
| Linode | 10.200.0.1 | Active |
| Local Ubuntu | 10.200.0.2 | Active |

### Tailscale (Fallback)
| Device | Tailscale IP | Status |
|--------|--------------|--------|
| Windows VM | 100.118.44.102 | Active |
| Ubuntu Host | Check `tailscale ip` | Active |

---

## 6. Domain Configuration

### rig-city.com
| Subdomain | Target | SSL |
|-----------|--------|-----|
| rig-city.com | Static site | Auto (Caddy) |
| www.rig-city.com | Redirect to rig-city.com | Auto |
| bot.rig-city.com | Discord Bot (port 4000) | Auto |
| stream.rig-city.com | Stream Bot (port 5000) | Auto |

### evindrake.net
| Subdomain | Target | SSL |
|-----------|--------|-----|
| host.evindrake.net | Dashboard | Auto |
| dashboard.evindrake.net | Dashboard | Auto |
| n8n.evindrake.net | n8n Workflows | Auto |
| code.evindrake.net | Code Server | Auto |
| plex.evindrake.net | Plex (local) | Auto |
| home.evindrake.net | Home Assistant (local) | Auto |
| vnc.evindrake.net | noVNC (local) | Auto |
| game.evindrake.net | Redirect to dashboard | Auto |

### scarletredjoker.com
| Subdomain | Target | SSL |
|-----------|--------|-----|
| scarletredjoker.com | Static site | Auto |
| www.scarletredjoker.com | Redirect | Auto |

---

## 7. Database Configuration

### Replit Development (Current)
- **Provider**: Neon PostgreSQL (Cloud)
- **URL**: `postgresql://neondb_owner:***@ep-divine-rain-aeqzxqlv.c-2.us-east-2.aws.neon.tech/neondb`
- **Status**: Connected and working

### Linode Production
- **Container**: homelab-postgres (PostgreSQL 16 Alpine)
- **Databases**:
  - `homelab_jarvis` (Dashboard)
  - `ticketbot` (Discord Bot)
  - `streambot` (Stream Bot)

---

## 8. Action Items

### Immediate (Before Production)
1. [x] Fix Sunshine virtual display resolution to 1080p@60Hz ✅ (December 4, 2025)
2. [x] Verify WireGuard tunnel connectivity between hosts ✅ (~34ms latency)
3. [x] Configure iptables port forwarding for Sunshine ✅
4. [x] Pair Moonlight with Sunshine ✅
5. [ ] Set YOUTUBE_API_KEY for Discord Bot YouTube notifications
6. [ ] Set CLOUDFLARE_API_TOKEN for DNS automation
7. [ ] Make iptables rules persistent on Ubuntu host

### Short-term
1. [ ] Configure Home Assistant integration (set URL and TOKEN)
2. [ ] Test all domain SSL certificates on Linode
3. [ ] Verify Plex transcoding with hardware acceleration
4. [ ] Test WinApps + productivity mode switching

### Long-term
1. [ ] Set up monitoring with Prometheus/Grafana
2. [ ] Configure automated backups for PostgreSQL
3. [ ] Implement Ollama for local LLM fallback
4. [ ] Set up notification webhooks (Discord, Email)

---

## 9. Deployment Commands

### Linode Deployment
```bash
cd /opt/homelab/HomeLabHub/deploy/linode
docker compose pull
docker compose up -d
docker compose logs -f
```

### Local Ubuntu Deployment
```bash
cd /opt/homelab/HomeLabHub/deploy/local
docker compose pull
docker compose up -d
docker compose logs -f
```

### Check All Services
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## 10. Quick Reference

### SSH Access
```bash
# Linode
ssh root@host.evindrake.net

# Local Ubuntu
ssh evin@<local-ip>

# Windows VM (via Tailscale)
ssh evin@100.118.44.102  # or use RDP
```

### Service URLs
| Service | URL |
|---------|-----|
| Dashboard | https://dashboard.evindrake.net |
| Discord Bot | https://bot.rig-city.com |
| Stream Bot | https://stream.rig-city.com |
| n8n | https://n8n.evindrake.net |
| Code Server | https://code.evindrake.net |
| Plex | https://plex.evindrake.net |
| Home Assistant | https://home.evindrake.net |

### Moonlight Connection
```bash
# From Ubuntu host
moonlight stream 192.168.122.250  # or 100.118.44.102 via Tailscale
```
