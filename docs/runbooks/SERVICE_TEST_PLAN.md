# Service Functional Test Plan
**Purpose:** Systematically verify each service is FUNCTIONAL, not just responding.

---

## Pre-Flight Checks

### 1. Infrastructure Foundation
```bash
# On Linode - Check all containers
docker compose ps

# Check WireGuard tunnel
wg show
# Expected: Latest handshake < 2 minutes, transfer counters > 0

# If WireGuard down:
systemctl restart wg-quick@wg0
```

### 2. Database Health
```bash
# PostgreSQL
docker exec homelab-postgres pg_isready -U postgres
# Expected: "accepting connections"

# Redis
docker exec homelab-redis redis-cli ping
# Expected: PONG
```

---

## Linode Services

### Dashboard (dashboard.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Health | `curl -I https://dashboard.evindrake.net` | 302 to /login | Check container logs |
| Login | Open browser, login with WEB_USERNAME/WEB_PASSWORD | Dashboard loads | Check .env credentials |
| DB Connection | Check logs for errors | No DB errors | Run migrations |

```bash
# Functional test
curl -I https://dashboard.evindrake.net
docker logs homelab-dashboard --tail 50 | grep -i error
```

### Discord Bot (bot.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Health | `curl -I https://bot.evindrake.net/health` | 200 OK | Check container logs |
| Bot Online | Check Discord server | Bot shows online | Check DISCORD_BOT_TOKEN |
| Commands | Type `!ping` in Discord | Bot replies | Check DB/permissions |

```bash
# Functional test
curl -I https://bot.evindrake.net/health
docker logs discord-bot --tail 50 | grep -i error
```

### Stream Bot (stream.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Health | `curl -I https://stream.evindrake.net/health` | 200 OK | Check container logs |
| OAuth | Visit site, try Twitch login | OAuth flow works | Check TWITCH_CLIENT_ID/SECRET |
| Dashboard | Login and view dashboard | Loads correctly | Check DB migrations |

```bash
# Functional test
curl -I https://stream.evindrake.net/health
docker logs stream-bot --tail 50 | grep -i error
```

### n8n (n8n.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Access | `curl -I https://n8n.evindrake.net` | 401 (auth required) | Check Caddy route |
| Login | Open browser, login | n8n UI loads | Check N8N_BASIC_AUTH creds |
| Workflow | Create test workflow | Executes successfully | Check container logs |

```bash
# Functional test
curl -I https://n8n.evindrake.net
docker logs n8n --tail 50 | grep -i error
```

### Code Server (code.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Access | `curl -I https://code.evindrake.net` | 302 to login | Check Caddy/proxy |
| Login | Enter CODE_SERVER_PASSWORD | VS Code loads | Check .env password |
| Terminal | Open terminal in VS Code | Works | Check container health |

```bash
# Functional test
curl -I https://code.evindrake.net
docker logs code-server --tail 50 | grep -i error
```

### Static Sites
| Site | Command | Expected |
|------|---------|----------|
| rig-city.com | `curl -I https://rig-city.com` | 200 OK |
| scarletredjoker.com | `curl -I https://scarletredjoker.com` | 200 OK |

```bash
curl -I https://rig-city.com
curl -I https://scarletredjoker.com
```

---

## Local Services (via WireGuard)

### Plex (plex.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| Identity | `curl https://plex.evindrake.net/identity` | XML with machineId | Check WireGuard |
| Web UI | Open browser, login | Plex loads | Check PLEX_TOKEN |
| Playback | Play a media file | Streams smoothly | Check transcoding |

```bash
# From Linode - test WireGuard path
curl -s https://plex.evindrake.net/identity | head -5

# From local Ubuntu
curl -s http://localhost:32400/identity | head -5
```

### Home Assistant (home.evindrake.net)
| Test | Command | Expected | Fix |
|------|---------|----------|-----|
| API | `curl https://home.evindrake.net/api/` | API root response | Check WireGuard |
| Web UI | Open browser, login | HA dashboard | Check trusted_proxies |
| Devices | Check device states | Devices visible | Check integrations |

```bash
# From Linode - test WireGuard path
curl -I https://home.evindrake.net

# From local Ubuntu
docker logs homeassistant --tail 50 | grep -i error
```

### MinIO (local only)
```bash
# From local Ubuntu
curl -I http://localhost:9000/minio/health/ready
# Expected: 200 OK

# Check console
curl -I http://localhost:9001
# Expected: 200 OK
```

---

## Windows VM / GameStream

### Sunshine (game.evindrake.net)
| Test | Method | Expected | Fix |
|------|--------|----------|-----|
| Web UI | https://192.168.122.250:47990 | Sunshine admin | Check Windows firewall |
| Port Forward | Test from Linode via WireGuard | Connection succeeds | Check iptables rules |
| Moonlight Pair | Connect from Moonlight client | Pairing succeeds | Check Sunshine PIN |
| Stream Quality | 1080p@60Hz test | Smooth video, <50ms latency | Adjust encoder/bitrate |

#### Functional Verification Steps

```bash
# 1. From Ubuntu host - verify VM is running
virsh list --all | grep win11
# Expected: win11 running

# 2. Test direct VM connectivity (from Ubuntu host)
nc -zv 192.168.122.250 47984  # Control port
nc -zv 192.168.122.250 47989  # HTTPS web
nc -zv 192.168.122.250 47990  # HTTP web
# Expected: All connections succeeded

# 3. Test port forwarding via WireGuard (from Linode)
nc -zv 10.200.0.2 47984
nc -zv 10.200.0.2 47989
# Expected: Connection succeeded (forwarded through iptables)

# 4. Verify iptables rules are persistent (on Ubuntu host)
sudo iptables -t nat -L PREROUTING -n | grep 47984
# Expected: DNAT rule for 47984->192.168.122.250:47984

# 5. Check GPU passthrough (from Ubuntu host)
virsh dumpxml win11 | grep -A10 "hostdev mode='subsystem' type='pci'"
# Expected: RTX 3060 PCI device attached
```

#### Moonlight Functional Test
1. Open Moonlight on client device (PC, phone, or Steam Deck)
2. Add host: `game.evindrake.net` or local IP `192.168.122.250`
3. Enter PIN shown on Sunshine web UI (https://192.168.122.250:47990)
4. Select "Desktop" application
5. **Verify:** Stream starts within 5 seconds
6. **Verify:** Resolution is 1920x1080 @ 60fps
7. **Verify:** Input latency is acceptable (<50ms for local, <100ms for remote)
8. **Verify:** Audio streams correctly

#### Common GameStream Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Black screen | Virtual display not configured | Set Sunshine to use virtual display (1920x1080) |
| "Host not found" | Port forwarding not working | Check iptables PREROUTING rules |
| Pairing fails | Firewall blocking | Open ports 47984-47990 UDP/TCP on VM |
| Choppy video | Encoder issues | Use NVENC, reduce bitrate to 20Mbps |
| High latency | Network path | Use WireGuard (faster) over Tailscale |
| No GPU detected | Passthrough failed | Check VFIO driver binding, IOMMU enabled |

---

## Quick Full Test Script

Run this on Linode after deployment:

```bash
#!/bin/bash
echo "=== Infrastructure Test ==="

echo -e "\n[1] Docker Services"
docker compose ps --format "table {{.Name}}\t{{.Status}}"

echo -e "\n[2] WireGuard"
wg show | head -10

echo -e "\n[3] PostgreSQL"
docker exec homelab-postgres pg_isready -U postgres

echo -e "\n[4] Redis"
docker exec homelab-redis redis-cli ping

echo -e "\n[5] Dashboard"
curl -s -o /dev/null -w "%{http_code}" https://dashboard.evindrake.net

echo -e "\n[6] Discord Bot"
curl -s -o /dev/null -w "%{http_code}" https://bot.evindrake.net/health

echo -e "\n[7] Stream Bot"
curl -s -o /dev/null -w "%{http_code}" https://stream.evindrake.net/health

echo -e "\n[8] n8n"
curl -s -o /dev/null -w "%{http_code}" https://n8n.evindrake.net

echo -e "\n[9] Code Server"
curl -s -o /dev/null -w "%{http_code}" https://code.evindrake.net

echo -e "\n[10] Plex (via WireGuard)"
curl -s -o /dev/null -w "%{http_code}" https://plex.evindrake.net/identity

echo -e "\n[11] Home Assistant (via WireGuard)"
curl -s -o /dev/null -w "%{http_code}" https://home.evindrake.net

echo -e "\n[12] Static Sites"
curl -s -o /dev/null -w "%{http_code}" https://rig-city.com
curl -s -o /dev/null -w "%{http_code}" https://scarletredjoker.com

echo -e "\n[13] GameStream (via WireGuard)"
nc -zv 10.200.0.2 47984 2>&1 | grep -q "succeeded" && echo "47984: OK" || echo "47984: FAIL"

echo -e "\n=== Test Complete ==="
```

### Full Test Script (Local Ubuntu)

Run this on the local Ubuntu host:

```bash
#!/bin/bash
echo "=== Local Services Test ==="

echo -e "\n[1] Plex"
curl -s -o /dev/null -w "%{http_code}" http://localhost:32400/identity

echo -e "\n[2] Home Assistant"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8123

echo -e "\n[3] MinIO"
curl -s -o /dev/null -w "%{http_code}" http://localhost:9000/minio/health/ready

echo -e "\n[4] WireGuard"
wg show | head -10

echo -e "\n[5] Windows VM"
virsh list --all | grep win11

echo -e "\n[6] Sunshine Ports"
nc -zv 192.168.122.250 47984 2>&1 | grep -q "succeeded" && echo "47984: OK" || echo "47984: FAIL"
nc -zv 192.168.122.250 47989 2>&1 | grep -q "succeeded" && echo "47989: OK" || echo "47989: FAIL"
nc -zv 192.168.122.250 47990 2>&1 | grep -q "succeeded" && echo "47990: OK" || echo "47990: FAIL"

echo -e "\n[7] iptables Persistence"
sudo iptables -t nat -L PREROUTING -n | grep -c 47984 && echo "Rules: OK" || echo "Rules: MISSING"

echo -e "\n=== Test Complete ==="
```

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| 502 Bad Gateway | Container not running or wrong network | `docker compose up -d --no-build` |
| 401 Unauthorized | Missing/wrong credentials | Check .env file |
| Connection timeout | WireGuard down or firewall | `wg show`, check iptables |
| SSL errors | DNS misconfigured | Check Cloudflare A records |
| Database errors | Migrations not run | Check service logs |
