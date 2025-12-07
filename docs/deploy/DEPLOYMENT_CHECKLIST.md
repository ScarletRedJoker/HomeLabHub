# HomeLabHub Deployment Checklist

**Last Updated:** December 7, 2025

This is your step-by-step guide to deploy the complete HomeLabHub infrastructure across Linode (cloud) and your Ubuntu server (local).

---

## Pre-Deployment Requirements

### 1. API Keys & Credentials Ready

Before deploying, ensure you have these credentials:

| Service | Where to Get | Required For |
|---------|--------------|--------------|
| OpenAI API Key | https://platform.openai.com/api-keys | Jarvis AI, Stream Bot facts |
| Discord App | https://discord.com/developers/applications | Discord Bot |
| Twitch App | https://dev.twitch.tv/console/apps | Stream Bot |
| Cloudflare API Token | https://dash.cloudflare.com/profile/api-tokens | DNS Manager |
| Plex Claim Token | https://www.plex.tv/claim/ | Plex Media Server |

### 2. Infrastructure Ready

- [ ] Linode server provisioned (4GB+ RAM recommended)
- [ ] Ubuntu 25.10 server running at home
- [ ] WireGuard VPN tunnel configured between Linode and Ubuntu
- [ ] Domains pointing to Linode IP in Cloudflare

---

## Phase 1: Linode Cloud Deployment

### Step 1: SSH to Linode
```bash
ssh root@host.evindrake.net
```

### Step 2: Clone Repository (First Time Only)
```bash
mkdir -p /opt/homelab
cd /opt/homelab
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub
```

### Step 3: Update Repository (Subsequent Deployments)
```bash
cd /opt/homelab/HomeLabHub
git pull origin main
```

### Step 4: Configure Environment
```bash
cd deploy/linode

# Smart merge - adds new vars without overwriting existing values
../scripts/sync-env.sh

# Or manual setup:
cp .env.example .env
nano .env  # Fill in all required values
```

### Step 5: Validate Environment
```bash
./scripts/validate-env.sh
```

**Expected output:** All green checkmarks for required variables.

### Step 6: Deploy Services
```bash
# Full deployment with all checks
./scripts/deploy.sh

# Or dry-run first to preview:
./scripts/deploy.sh --dry-run
```

### Step 7: Verify Deployment
```bash
# Run smoke test
./scripts/smoke-test.sh

# Check all container status
docker compose ps

# View logs if needed
docker compose logs -f --tail=50
```

### Step 8: Test Endpoints
```bash
curl -I https://dashboard.evindrake.net/health
curl -I https://bot.rig-city.com/health
curl -I https://stream.rig-city.com/health
curl -I https://grafana.evindrake.net/api/health
```

---

## Phase 2: Local Ubuntu Deployment

### Step 1: SSH to Ubuntu Server
```bash
ssh evin@host.evindrake.net  # Or via Tailscale
```

### Step 2: Update Repository
```bash
cd /home/evin/contain/HomeLabHub
git pull origin main
```

### Step 3: Configure Environment
```bash
cd deploy/local

# Use env-doctor for smart configuration
./scripts/env-doctor.sh --fix

# Or manual setup:
cp .env.example .env
nano .env
```

### Step 4: Setup NAS Mounts (If Needed)
```bash
sudo ./scripts/setup-nas-mounts.sh
# Or with specific NAS IP:
sudo ./scripts/setup-nas-mounts.sh --nas-ip=192.168.0.176
```

### Step 5: Start Local Services
```bash
./start-local-services.sh

# Or with specific profiles:
docker compose up -d                    # Core services only
docker compose --profile vnc up -d      # Include VNC desktop
```

### Step 6: Verify Local Services
```bash
# Check service status
docker compose ps

# Test endpoints
curl http://localhost:9000/minio/health/live  # MinIO
curl http://localhost:32400/identity           # Plex
curl http://localhost:8123                      # Home Assistant
```

### Step 7: Start Windows VM (For GameStream)
```bash
./scripts/start-sunshine-vm.sh

# Check VM status
virsh list --all

# Verify Sunshine is accessible
./scripts/check-gamestream.sh
```

---

## Phase 3: Post-Deployment Verification

### Full Domain Check
Run from Linode:
```bash
#!/bin/bash
DOMAINS=(
    "https://dashboard.evindrake.net/health"
    "https://bot.rig-city.com/health"
    "https://stream.rig-city.com/health"
    "https://rig-city.com"
    "https://scarletredjoker.com"
    "https://n8n.evindrake.net"
    "https://code.evindrake.net"
    "https://grafana.evindrake.net/api/health"
    "https://dns.evindrake.net/health"
)

echo "Testing all domains..."
for url in "${DOMAINS[@]}"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10)
    if [[ "$status" == "200" || "$status" == "302" || "$status" == "401" ]]; then
        echo "✓ $url ($status)"
    else
        echo "✗ $url ($status)"
    fi
done
```

### WireGuard Tunnel Check
```bash
# From Linode - ping Ubuntu
ping -c 3 10.200.0.2

# From Ubuntu - ping Linode
ping -c 3 10.200.0.1
```

### Local Services via Tunnel
```bash
# From Linode - test Plex through tunnel
curl -s http://10.200.0.2:32400/identity

# From Linode - test Home Assistant through tunnel
curl -s http://10.200.0.2:8123
```

---

## Quick Reference Commands

### Unified Management (from project root)
```bash
./homelab status      # Show all service status
./homelab health      # Run health checks
./homelab fix         # Rebuild and restart everything
./homelab logs        # View logs (auto-saves)
./homelab backup      # Create database backup
./homelab pipeline    # Full deployment pipeline
```

### Emergency Recovery
```bash
# Rollback to previous deployment
./deploy/linode/scripts/deploy.sh --rollback

# Force rebuild everything
./homelab fix

# Restart individual service
docker compose restart discord-bot
```

---

## Troubleshooting

### Service Won't Start
```bash
docker compose logs <service-name> --tail=100
docker compose restart <service-name>
```

### Database Issues
```bash
# Check database connectivity
docker exec homelab-postgres pg_isready -U postgres

# List databases
docker exec homelab-postgres psql -U postgres -l

# Re-initialize databases
docker exec homelab-postgres bash /docker-entrypoint-initdb.d/init-databases.sh
```

### Domain Not Resolving
```bash
# Check DNS propagation
dig +short dashboard.evindrake.net

# Check Caddy certificates
docker exec caddy caddy list-certificates
```

### WireGuard Issues
```bash
# Check WireGuard status
sudo wg show

# Restart WireGuard
sudo systemctl restart wg-quick@wg0
```

---

## Success Criteria

After deployment, verify:

- [ ] Dashboard accessible at https://dashboard.evindrake.net
- [ ] Discord Bot responds at https://bot.rig-city.com/health
- [ ] Stream Bot responds at https://stream.rig-city.com/health
- [ ] Grafana accessible at https://grafana.evindrake.net
- [ ] Static sites load (rig-city.com, scarletredjoker.com)
- [ ] Code Server accessible at https://code.evindrake.net
- [ ] n8n accessible at https://n8n.evindrake.net
- [ ] DNS Manager at https://dns.evindrake.net/health
- [ ] WireGuard tunnel working (ping 10.200.0.2 from Linode)
- [ ] Plex accessible (locally or via tunnel)
- [ ] MinIO health check passes
- [ ] Home Assistant accessible

---

## Next Deployment

After initial setup, subsequent deployments are simple:

```bash
# On Linode:
cd /opt/homelab/HomeLabHub
git pull && ./deploy/linode/scripts/deploy.sh

# On Ubuntu:
cd /home/evin/contain/HomeLabHub
git pull && ./deploy/local/start-local-services.sh
```

Or use the unified pipeline:
```bash
./homelab pipeline
```
