# Multi-Platform Deployment Guide

> **See Full Guide**: For the latest step-by-step instructions, see:
> **[docs/deploy/FULL_DEPLOYMENT_GUIDE.md](../docs/deploy/FULL_DEPLOYMENT_GUIDE.md)**

---

## Nebula Command - Split Architecture Deployment

This comprehensive guide covers deploying your homelab across two hosts: a Linode cloud server for always-on services and your local Ubuntu machine optimized for gaming and streaming.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Service Distribution](#service-distribution)
4. [Step-by-Step Deployment](#step-by-step-deployment)
5. [Domain Mapping](#domain-mapping)
6. [Networking Setup](#networking-setup)
7. [Remote Access](#remote-access)
8. [Troubleshooting](#troubleshooting)
9. [Cost Optimization](#cost-optimization)

---

## Architecture Overview

### Split Architecture Benefits

By distributing services between cloud and local infrastructure, you gain:

- **6-8 GB RAM freed** on your local gaming machine
- **4-6 CPU cores** no longer consumed by background services
- **Lower latency** for Discord/Twitch webhooks (cloud-to-cloud)
- **Better OBS performance** for game streaming
- **Separate blast radius** - cloud issues don't affect local gaming

```
                         INTERNET
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
          ▼                                   ▼
┌─────────────────────┐        ┌─────────────────────────┐
│   LINODE SERVER     │        │   LOCAL UBUNTU HOST     │
│   ($20-40/month)    │◄──────►│   (Gaming Priority)     │
│                     │   T    │                         │
│ ┌─────────────────┐ │   A    │ ┌─────────────────────┐ │
│ │ Discord Bot     │ │   I    │ │ Plex Media Server   │ │
│ │ Stream Bot      │ │   L    │ │ (HW transcoding)    │ │
│ │ Dashboard       │ │   S    │ └─────────────────────┘ │
│ │ PostgreSQL      │ │   C    │                         │
│ │ Redis           │ │   A    │ ┌─────────────────────┐ │
│ │ n8n             │ │   L    │ │ Home Assistant      │ │
│ │ Code-Server     │ │   E    │ │ (Smart Home)        │ │
│ │ Static Sites    │ │        │ └─────────────────────┘ │
│ │ Caddy           │ │   V    │                         │
│ └─────────────────┘ │   P    │ ┌─────────────────────┐ │
│                     │   N    │ │ MinIO Storage       │ │
│ Resources used:     │        │ │ VNC Desktop         │ │
│ • 4GB RAM           │        │ └─────────────────────┘ │
│ • 2 vCPUs           │        │                         │
│ • 80GB SSD          │        │ Resources freed:        │
│                     │        │ • ~6-8 GB RAM           │
│                     │        │ • 4-6 CPU cores         │
└─────────────────────┘        └─────────────────────────┘
```

---

## Prerequisites

Before starting the deployment, ensure you have:

### Accounts Required

| Service | Purpose | Est. Cost |
|---------|---------|-----------|
| **Linode** | Cloud hosting | $20-40/month |
| **Cloudflare** | DNS & CDN | Free tier |
| **Tailscale** | VPN mesh | Free for personal |
| **GitHub** | Repository hosting | Free |

### Local Requirements

- **Ubuntu 25.10** (or 22.04/24.04 LTS) on local machine
- **Docker & Docker Compose** v2.x installed
- **Minimum 16GB RAM** on local machine
- **GPU** with hardware transcoding support (for Plex)
- **SSH keys** generated (`ssh-keygen -t ed25519`)

### Domain Requirements

You'll need control over at least one domain. This guide uses:
- `evindrake.net` - Primary services domain
- `rig-city.com` - Bot and streaming domain

---

## Service Distribution

### Linode Cloud Services

These services run 24/7 in the cloud for reliability and low-latency API access:

| Service | Domain | Port | Purpose |
|---------|--------|------|---------|
| **Discord Bot** | bot.evindrake.net | 4000 | Discord slash commands, tickets |
| **Stream Bot** | stream.evindrake.net | 5000 | Twitch/YouTube integration |
| **Dashboard** | dashboard.evindrake.net | 5000 | Nebula Command control panel |
| **n8n** | n8n.evindrake.net | 5678 | Workflow automation |
| **Code-Server** | code.evindrake.net | 8443 | VS Code in browser |
| **PostgreSQL** | (internal) | 5432 | Shared database |
| **Redis** | (internal) | 6379 | Caching & queues |
| **Caddy** | All domains | 80/443 | Reverse proxy & SSL |
| **Static Sites** | rig-city.com, scarletredjoker.com | 80 | Portfolio websites |

### Local Ubuntu Services

These services require local resources or hardware access:

| Service | Domain | Port | Purpose |
|---------|--------|------|---------|
| **Plex** | plex.evindrake.net | 32400 | Media streaming (GPU transcoding) |
| **Home Assistant** | home.evindrake.net | 8123 | Smart home control |
| **MinIO** | (internal) | 9000/9001 | Object storage / NAS |
| **VNC Desktop** | vnc.evindrake.net | 6080 | Remote desktop access |
| **Caddy** | Local domains | 80/443 | Local reverse proxy |

---

## Step-by-Step Deployment

### Phase 1: Provision Linode Server

1. **Create Linode Instance**
   ```bash
   # Recommended specs:
   # - Linode 4GB Nanode ($20/mo) for light usage
   # - Linode 8GB ($40/mo) for production workloads
   # - Ubuntu 22.04 LTS
   # - Region: Choose closest to your location
   ```

2. **Initial Server Setup**
   ```bash
   # SSH into your new Linode
   ssh root@YOUR_LINODE_IP
   
   # Update system
   apt update && apt upgrade -y
   
   # Set hostname
   hostnamectl set-hostname linode-homelab
   ```

3. **Create Deploy User**
   ```bash
   # Create non-root user
   adduser deploy
   usermod -aG sudo deploy
   
   # Copy SSH keys
   rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
   ```

### Phase 2: Run Bootstrap Script (Linode)

```bash
# As root or deploy user with sudo
curl -fsSL https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/scripts/bootstrap-linode.sh | bash
```

This script will:
- Install Docker and Docker Compose
- Install Tailscale
- Configure UFW firewall
- Clone the repository
- Set up directory structure
- Create environment template

After running, configure your environment:
```bash
cd /opt/homelab
cp .env.template .env
nano .env  # Fill in your secrets
```

### Phase 3: Configure Tailscale on Both Hosts

#### On Linode:
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate and connect
sudo tailscale up

# Note your Tailscale IP
tailscale ip -4
# Example output: 100.x.x.x
```

#### On Local Ubuntu:
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate and connect
sudo tailscale up

# Note your Tailscale IP
tailscale ip -4
# Example output: 100.y.y.y
```

#### Verify Connectivity:
```bash
# From Linode, ping local machine
ping 100.y.y.y

# From local, ping Linode
ping 100.x.x.x
```

### Phase 4: Configure DNS in Cloudflare

1. **Log into Cloudflare Dashboard**

2. **Add A Records for Linode Services:**

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | dashboard | YOUR_LINODE_IP | Proxied |
| A | code | YOUR_LINODE_IP | Proxied |
| A | n8n | YOUR_LINODE_IP | Proxied |
| A | bot.evindrake.net | YOUR_LINODE_IP | DNS Only |
| A | stream.evindrake.net | YOUR_LINODE_IP | DNS Only |

3. **Add A Records for Local Services:**

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | plex | YOUR_LOCAL_PUBLIC_IP | DNS Only |
| A | home | YOUR_LOCAL_PUBLIC_IP | DNS Only |
| A | vnc | YOUR_LOCAL_PUBLIC_IP | DNS Only |

4. **Configure SSL/TLS:**
   - Set SSL mode to "Full (strict)" for Cloudflare proxied domains
   - Ensure local Caddy has valid certificates

### Phase 5: Configure Local Ubuntu Host

```bash
# Clone repository if not already present
cd ~/contain
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub

# Run local bootstrap
./deploy/scripts/bootstrap-local.sh

# Stop services that will run on Linode
docker compose stop discord-bot stream-bot homelab-dashboard \
    homelab-celery-worker homelab-postgres redis n8n \
    code-server code-server-proxy scarletredjoker-web rig-city-site
```

Configure local environment:
```bash
cd ~/contain/HomeLabLocal
cp .env.template .env
nano .env  # Configure PLEX_TOKEN, HOME_ASSISTANT_TOKEN, etc.
```

### Phase 6: Migrate Database

If you have existing data to migrate:

```bash
# From LOCAL machine:
export LINODE_HOST=100.x.x.x  # Linode Tailscale IP
export LINODE_PG_PASSWORD=your_postgres_password

./deploy/scripts/migrate-database.sh
```

This will:
- Dump local PostgreSQL databases
- Transfer to Linode server
- Restore on remote PostgreSQL

### Phase 7: Start Services and Verify

#### On Linode:
```bash
cd /opt/homelab
docker compose up -d

# Check all services are running
docker compose ps

# Check logs for errors
docker compose logs --tail 50
```

#### On Local:
```bash
cd ~/contain/HomeLabLocal
docker compose up -d

# Verify services
docker compose ps
```

#### Health Checks:
```bash
# Test Dashboard
curl -I https://dashboard.evindrake.net/health

# Test Discord Bot
curl -I https://bot.evindrake.net/health

# Test Plex (local)
curl -I http://localhost:32400/identity
```

---

## Domain Mapping

### Complete Domain Reference

| Domain | Host | Service | Notes |
|--------|------|---------|-------|
| `dashboard.evindrake.net` | Linode | Dashboard | Main control panel |
| `code.evindrake.net` | Linode | Code-Server | VS Code in browser |
| `bot.evindrake.net` | Linode | Discord Bot | Webhook endpoint |
| `stream.evindrake.net` | Linode | Stream Bot | Twitch/YouTube |
| `n8n.evindrake.net` | Linode | n8n | Automation workflows |
| `rig-city.com` | Linode | Static Site | Gaming portal |
| `scarletredjoker.com` | Linode | Static Site | Portfolio |
| `plex.evindrake.net` | Local | Plex | Media streaming |
| `home.evindrake.net` | Local | Home Assistant | Smart home |
| `vnc.evindrake.net` | Local | noVNC | Remote desktop |
| `game.evindrake.net` | Local | Sunshine | Game streaming |

---

## Networking Setup

### Tailscale Mesh Configuration

#### Tailscale Admin Console Settings:
1. **Access Controls (ACLs):**
   ```json
   {
     "tagOwners": {
       "tag:homelab": ["autogroup:admin"]
     },
     "acls": [
       {
         "action": "accept",
         "src": ["tag:homelab"],
         "dst": ["tag:homelab:*"]
       }
     ]
   }
   ```

2. **Tag Both Machines:**
   - In Tailscale admin panel, add `homelab` tag to both machines

3. **Enable MagicDNS:**
   - Allows accessing machines by hostname (e.g., `linode-homelab`)

### Firewall Rules

#### Linode (UFW):
```bash
# Reset to defaults
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (important!)
sudo ufw allow ssh

# Allow HTTP/HTTPS for web services
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow Tailscale interface
sudo ufw allow in on tailscale0

# Enable firewall
sudo ufw enable

# Verify rules
sudo ufw status verbose
```

#### Local Ubuntu:
```bash
# Allow essential ports
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 32400/tcp    # Plex
sudo ufw allow 8123/tcp     # Home Assistant

# Allow Tailscale
sudo ufw allow in on tailscale0

sudo ufw enable
```

### SSH Key Management

1. **Generate Keys (if not already done):**
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. **Copy to Linode:**
   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@YOUR_LINODE_IP
   ```

3. **Disable Password Auth on Linode:**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Set: PasswordAuthentication no
   sudo systemctl restart sshd
   ```

### Caddy Reverse Proxy Configuration

#### Linode Caddyfile (`/opt/homelab/Caddyfile`):
```caddyfile
{
    email your-email@example.com
}

dashboard.evindrake.net {
    reverse_proxy homelab-dashboard:5000
}

bot.evindrake.net {
    reverse_proxy discord-bot:4000
}

stream.evindrake.net {
    reverse_proxy stream-bot:5000
}

n8n.evindrake.net {
    reverse_proxy n8n:5678
}

code.evindrake.net {
    reverse_proxy code-server-proxy:8080
}

rig-city.com {
    root * /srv/rig-city-site
    file_server
}
```

#### Local Caddyfile:
```caddyfile
plex.evindrake.net {
    reverse_proxy plex-server:32400
}

home.evindrake.net {
    reverse_proxy homeassistant:8123
}

vnc.evindrake.net {
    reverse_proxy novnc:6080
}
```

---

## Remote Access

### Accessing Local Services via Tailscale

When connected to Tailscale, you can access local services directly:

```bash
# SSH to local machine from anywhere
ssh user@100.y.y.y

# Access Plex directly
http://100.y.y.y:32400

# Access Home Assistant
http://100.y.y.y:8123
```

### Dashboard Fleet Manager

The Dashboard includes a Fleet Manager for remote control:

1. Navigate to `https://dashboard.evindrake.net/fleet-management`
2. Add your hosts with their Tailscale IPs
3. Execute commands, view containers, and deploy services remotely

### Emergency Access Procedures

If Tailscale is down:

1. **Physical Access:** Connect keyboard/monitor to local machine
2. **Backup SSH:** Keep a non-Tailscale SSH port open (with fail2ban)
3. **Console Access:** Use Linode's LISH console for cloud server

If Linode is unreachable:

```bash
# On local machine, start critical services locally
cd ~/contain/HomeLabHub
docker compose up -d homelab-postgres redis homelab-dashboard
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. Container Won't Start
```bash
# Check container logs
docker logs container-name --tail 100

# Check for port conflicts
sudo netstat -tlnp | grep PORT_NUMBER

# Verify environment variables
docker compose config
```

#### 2. Database Connection Failed
```bash
# Test PostgreSQL connection
docker exec -it homelab-postgres psql -U postgres -c '\l'

# Verify DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host:5432/dbname
```

#### 3. Tailscale Not Connecting
```bash
# Check Tailscale status
tailscale status

# Re-authenticate
sudo tailscale up --reset

# Check for firewall blocking
sudo ufw status
```

#### 4. SSL Certificate Issues
```bash
# Check Caddy logs
docker logs caddy --tail 50

# Force certificate renewal
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Verify DNS is pointing correctly
dig +short domain.com
```

#### 5. Services Unreachable
```bash
# Check if container is running
docker ps | grep service-name

# Check network connectivity
docker network inspect homelab

# Test internal DNS
docker exec container-name ping other-container
```

### Log Locations

| Service | Log Location |
|---------|--------------|
| Dashboard | `/opt/homelab/services/dashboard/logs/` |
| Discord Bot | `docker logs discord-bot` |
| Stream Bot | `docker logs stream-bot` |
| Caddy | `docker logs caddy` |
| PostgreSQL | `docker logs homelab-postgres` |

---

## Cost Optimization

### Monthly Cost Breakdown

| Resource | Provider | Cost |
|----------|----------|------|
| Linode 4GB Nanode | Linode | $20 |
| Domain (.net) | Cloudflare | ~$10/year |
| Domain (.com) | Cloudflare | ~$10/year |
| Cloudflare DNS | Cloudflare | Free |
| Tailscale | Tailscale | Free |
| **Total** | | **~$22/month** |

### Upgrade Path

If you need more resources:

| Tier | Linode Plan | Monthly Cost | When to Upgrade |
|------|-------------|--------------|-----------------|
| Basic | 4GB Nanode | $20 | Default |
| Standard | 8GB | $40 | Heavy bot usage |
| Premium | 16GB | $80 | Multiple databases |

### Cost Savings Tips

1. **Use Linode Block Storage** instead of larger instances
2. **Enable Cloudflare caching** for static sites
3. **Schedule n8n workflows** during off-peak hours
4. **Monitor resource usage** with `docker stats`
5. **Clean up unused Docker images** monthly:
   ```bash
   docker system prune -a
   ```

---

## Quick Reference

### Essential Commands

```bash
# Start all services
docker compose up -d

# Stop all services
docker compose down

# View running containers
docker compose ps

# View logs
docker compose logs -f service-name

# Restart a service
docker compose restart service-name

# Rebuild and restart
docker compose up -d --build service-name

# Check Tailscale status
tailscale status

# Get Tailscale IP
tailscale ip -4
```

### Service URLs

| Service | URL |
|---------|-----|
| Dashboard | https://dashboard.evindrake.net |
| Discord Bot | https://bot.evindrake.net |
| Stream Bot | https://stream.evindrake.net |
| n8n | https://n8n.evindrake.net |
| Code-Server | https://code.evindrake.net |
| Plex | https://plex.evindrake.net |
| Home Assistant | https://home.evindrake.net |

---

## Related Documentation

- [Deploy Scripts README](./README.md)
- [Linode Docker Compose](./linode/docker-compose.yml)
- [Local Docker Compose](./local/docker-compose.yml)
- [Bootstrap Scripts](./scripts/)

---

*Last Updated: November 2024*
*Nebula Command - Split Deployment Architecture v1.0*
