# Complete Network Audit - December 4, 2025
**Post-Router Migration: BE9300 WiFi 7**

---

## Executive Summary

### What's Working ✅
| Component | Status | Details |
|-----------|--------|---------|
| **BE9300 Router** | ✅ Working | Ubuntu: 192.168.0.228 |
| **WireGuard Tunnel** | ✅ Working | 10.200.0.2 ↔ 10.200.0.1, ~34ms |
| **Local Docker** | ✅ Working | 5 containers running |
| **Windows VM** | ✅ Working | 192.168.122.250, Sunshine active |
| **GameStream** | ✅ Working | iptables forwarding configured |
| **Replit Dev** | ✅ Working | Dashboard, Discord Bot, Stream Bot |

### What Needs Configuration 🔧
| Component | Status | Action Required |
|-----------|--------|-----------------|
| **YouTube API** | ❌ Not Set | Add YOUTUBE_API_KEY secret |
| **Home Assistant** | ❌ Not Configured | Set HOME_ASSISTANT_URL + TOKEN |
| **Cloudflare API** | ❌ Not Set | Add CLOUDFLARE_API_TOKEN |

---

## Section 1: Local Ubuntu Host (192.168.0.228)

### Network Configuration
```
Interface: wlp6s0
  IP: 192.168.0.228/24
  Gateway: 192.168.0.1 (BE9300 router)
  
Interface: virbr0 (KVM NAT)
  IP: 192.168.122.1/24
  
Interface: wg0 (WireGuard)
  IP: 10.200.0.2/24
  Peer: 10.200.0.1 (Linode)
```

### Docker Containers
| Container | Status | Ports |
|-----------|--------|-------|
| homeassistant | ✅ Healthy | 8123 |
| homelab-minio | ✅ Healthy | 9000, 9001 |
| caddy-local | ✅ Running | 80, 443 |
| plex | ✅ Running | 32400 |
| cloudflare-ddns | ✅ Running | - |

### iptables GameStream Forwarding
Configured to forward from Ubuntu (192.168.0.228) to VM (192.168.122.250):
- TCP: 47984, 47989, 47990, 48010
- UDP: 47998, 47999, 48000, 48002, 48010
- Rules saved via netfilter-persistent

### Verification Commands
```bash
# Check all services
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check WireGuard
sudo wg show

# Check iptables rules
sudo iptables -t nat -L PREROUTING -n | grep -E "4798|4800"

# Check VM connectivity
ping -c 1 192.168.122.250

# Check Linode connectivity
ping -c 1 10.200.0.1

# Test Sunshine
curl -sk https://192.168.122.250:47990 | head -c 50
```

---

## Section 2: Windows 11 VM (192.168.122.250)

### Current Status: ✅ WORKING
| Component | Status | Details |
|-----------|--------|---------|
| GPU Passthrough | ✅ | RTX 3060 (12GB VRAM) |
| Sunshine | ✅ | v1.11.4, NVENC H.264/HEVC |
| Network | ✅ | NAT via virbr0 |
| Moonlight Pairing | ✅ | Connected |

### Display Configuration
- Desktop: 1920x1080 @ 165Hz
- Streaming: Configurable in Moonlight (set to 1080p)
- Encoders: H.264, HEVC (AV1 not supported on RTX 3060)

### Disk Resized
- Previous: 200GB
- New: 500GB (+300GB added)
- Action: Extend partition in Windows Disk Management

---

## Section 3: Linode Cloud Server (69.164.211.205)

### Expected Services
| Service | Container | Port | Domain |
|---------|-----------|------|--------|
| Caddy | caddy | 80, 443 | - |
| Dashboard | homelab-dashboard | 5000 | host.evindrake.net |
| Discord Bot | discord-bot | 4000 | bot.rig-city.com |
| Stream Bot | stream-bot | 5000 | stream.rig-city.com |
| PostgreSQL | homelab-postgres | 5432 | internal |
| Redis | homelab-redis | 6379 | internal |
| n8n | n8n | 5678 | n8n.evindrake.net |
| Code Server | code-server | 8443 | code.evindrake.net |

### Verification Commands (Run on Linode)
```bash
# SSH to Linode
ssh root@host.evindrake.net

# Check all containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Check WireGuard
sudo wg show

# Test connectivity to local
ping -c 2 10.200.0.2

# Check Caddy logs
docker logs caddy --tail 20

# Check Dashboard health
curl -s http://localhost:5000/health || curl -s http://localhost:5000/
```

---

## Section 4: Replit Development Environment

### Workflows Running
| Workflow | Port | Status | Database |
|----------|------|--------|----------|
| Dashboard | 5000 | ✅ Running | Neon PostgreSQL |
| Discord Bot | 4000 | ✅ Running | Neon PostgreSQL |
| Stream Bot | 3000 | ✅ Running | Neon PostgreSQL |

### Discord Bot Status
- Connected to: **Rig City** (440 members), **Joker's Evil Headquarters** (14 members)
- Commands registered: ticket, ping, heartbeat, stream-setup, etc.
- Twitch API: Configured
- YouTube API: **NOT CONFIGURED** (needs YOUTUBE_API_KEY)

### Stream Bot Status
- OAuth configured: Twitch ✅, YouTube ✅, Spotify ✅, Kick ✅
- OpenAI: Configured via Replit integration
- Fact generation: Available

### Expected Warnings (Not Issues)
These are normal for Replit dev environment:
- Redis connection refused (runs on Linode, not Replit)
- Docker not available (runs on Linode, not Replit)
- Ollama not available (optional local LLM)

---

## Section 5: Required API Keys/Secrets

### Missing (Needs Setup)
| Secret | Purpose | How to Get |
|--------|---------|------------|
| YOUTUBE_API_KEY | Discord Bot YouTube notifications | https://console.cloud.google.com/apis |
| HOME_ASSISTANT_TOKEN | Home Assistant integration | HA → Profile → Long-Lived Access Tokens |
| CLOUDFLARE_API_TOKEN | DNS automation | https://dash.cloudflare.com/profile/api-tokens |

### Already Configured ✅
| Secret | Status |
|--------|--------|
| DISCORD_BOT_TOKEN | ✅ Working (bot online) |
| TWITCH_CLIENT_ID/SECRET | ✅ Working |
| OPENAI_API_KEY | ✅ Working (via Replit) |
| SPOTIFY credentials | ✅ Working |
| KICK credentials | ✅ Working |

---

## Section 6: Domain/SSL Status

### To Verify on Linode
```bash
# Test all domains
curl -sI https://host.evindrake.net | head -2
curl -sI https://dashboard.evindrake.net | head -2
curl -sI https://bot.rig-city.com | head -2
curl -sI https://stream.rig-city.com | head -2
curl -sI https://n8n.evindrake.net | head -2
curl -sI https://rig-city.com | head -2
curl -sI https://scarletredjoker.com | head -2

# Via WireGuard (local services)
curl -sI https://plex.evindrake.net | head -2
curl -sI https://home.evindrake.net | head -2
```

---

## Section 7: Action Items

### Immediate (Do Now)
1. [x] ~~Network migration to BE9300~~ ✅ Complete
2. [x] ~~WireGuard tunnel verification~~ ✅ Working
3. [x] ~~iptables GameStream forwarding~~ ✅ Configured
4. [x] ~~Windows VM disk resize~~ ✅ Done (500GB)
5. [ ] Extend Windows partition in Disk Management
6. [ ] Set Moonlight to 1080p resolution

### Short-term (This Week)
1. [ ] Add YOUTUBE_API_KEY for Discord Bot
2. [ ] Configure Home Assistant URL and TOKEN
3. [ ] Add CLOUDFLARE_API_TOKEN for DNS automation
4. [ ] Verify all Linode services are running
5. [ ] Test all domain SSL certificates

### Long-term
1. [ ] Set up monitoring (Prometheus/Grafana)
2. [ ] Configure automated backups
3. [ ] Test WinApps productivity mode

---

## Section 8: External Access (Friends Without VPN)

### Recommended: Cloudflare Tunnel
No router ports to open, automatic SSL, DDoS protection included.

| Service | External URL | Security |
|---------|--------------|----------|
| Plex | plex.evindrake.net | Plex authentication |
| Home Assistant | home.evindrake.net | Cloudflare Access (Zero Trust) |
| MinIO | minio.evindrake.net | Cloudflare Access (Zero Trust) |

### Alternative: Router Port Forward (Plex Only)
For best streaming performance:
1. BE9300 Router → Port Forwarding → Add Rule
2. External Port: 32400 → Internal: 192.168.0.228:32400 (TCP)
3. Enable Plex Remote Access in Settings

### Setup Guide
See [`EXTERNAL_ACCESS_GUIDE.md`](EXTERNAL_ACCESS_GUIDE.md) for full instructions.

---

## Quick Reference

### Connection IPs
| Service | IP/Hostname | Port |
|---------|-------------|------|
| Ubuntu Host (LAN) | 192.168.0.228 | - |
| Ubuntu Host (WireGuard) | 10.200.0.2 | - |
| Windows VM (NAT) | 192.168.122.250 | - |
| Linode (Public) | 69.164.211.205 | - |
| Linode (WireGuard) | 10.200.0.1 | - |

### Moonlight Connection
Connect to: **192.168.0.228** (Ubuntu host, forwards to VM)

### SSH Access
```bash
ssh evin@192.168.0.228        # Local Ubuntu
ssh root@69.164.211.205       # Linode
ssh root@host.evindrake.net   # Linode (domain)
```
