# Traefik Reverse Proxy Setup Guide

This guide will help you set up Traefik as a reverse proxy to route your domains to the homelab dashboard and other Docker containers.

## Overview

**Traefik** will handle:
- ✅ Automatic SSL certificates (Let's Encrypt)
- ✅ Routing subdomains to containers
- ✅ Both public and VPN-protected routes
- ✅ Multiple domains (*.evindrake.net, *.rig-city.com)

## Architecture

```
Internet/Twingate
      ↓
   Traefik (ports 80, 443)
      ↓
   Docker Network "homelab"
      ├→ host.evindrake.net → Homelab Dashboard
      ├→ bot.rig-city.com → Discord Bot Container
      ├→ plex.evindrake.net → Plex Container
      ├→ n8n.evindrake.net → n8n Container
      └→ scarletredjoker.com → Static Site Container
```

## Prerequisites

1. ✅ Ubuntu server with Docker and Docker Compose installed
2. ✅ Domain names pointing to your server:
   - `host.evindrake.net`
   - `bot.rig-city.com`
   - `plex.evindrake.net`
   - `n8n.evindrake.net`
   - `scarletredjoker.com`
3. ✅ Ports 80 and 443 accessible (for Let's Encrypt HTTP challenge)
4. ✅ (Optional) Twingate VPN configured

## Step 1: DNS Configuration

In your ZoneEdit dashboard, create A records pointing to your server's public IP:

```
host.evindrake.net        A    your-public-ip
bot.rig-city.com          A    your-public-ip
plex.evindrake.net        A    your-public-ip
n8n.evindrake.net         A    your-public-ip
scarletredjoker.com       A    your-public-ip
traefik.evindrake.net     A    your-public-ip  (optional - for Traefik dashboard)
```

If using dynamic DNS, configure ZoneEdit to auto-update when your IP changes.

## Step 2: Prepare Traefik Configuration

```bash
# On your Ubuntu server
cd ~/HomeLabHub

# Create Traefik directories
mkdir -p traefik/config

# Create empty acme.json for SSL certificates
touch traefik/acme.json
chmod 600 traefik/acme.json

# Edit traefik.yml and update your email
nano traefik/traefik.yml
# Change: email: your-email@example.com
```

## Step 3: Configure Email for Let's Encrypt

Edit `traefik/traefik.yml`:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: your-actual-email@example.com  # ← CHANGE THIS
      storage: /acme.json
      httpChallenge:
        entryPoint: web
```

## Step 4: Start Traefik and Dashboard

```bash
# Create Docker network
docker network create homelab

# Start Traefik
docker-compose -f docker-compose.traefik.yml up -d traefik

# Check logs
docker logs traefik -f
```

You should see Traefik start and register the Let's Encrypt certificates.

## Step 5: Deploy Dashboard Behind Traefik

```bash
# Build and start the dashboard
docker-compose -f docker-compose.traefik.yml up -d homelab-dashboard

# Check it's running
docker ps | grep homelab-dashboard
```

Now visit **https://host.evindrake.net** - you should see your dashboard with a valid SSL certificate!

## Step 6: Add Your Other Containers

Update your existing containers to join the `homelab` network and add Traefik labels.

### Example: Discord Bot Container

```yaml
version: '3.8'

services:
  discord-bot:
    image: your-discord-bot-image
    container_name: discordticketbot
    networks:
      - homelab
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.discordbot.rule=Host(`bot.rig-city.com`)"
      - "traefik.http.routers.discordbot.entrypoints=websecure"
      - "traefik.http.routers.discordbot.tls.certresolver=letsencrypt"
      - "traefik.http.services.discordbot.loadbalancer.server.port=80"

networks:
  homelab:
    external: true
```

### Example: Plex Server

```yaml
version: '3.8'

services:
  plex:
    image: plexinc/pms-docker
    container_name: plex-server
    networks:
      - homelab
    ports:
      - "32400:32400"  # Keep for Plex apps
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.plex.rule=Host(`plex.evindrake.net`)"
      - "traefik.http.routers.plex.entrypoints=websecure"
      - "traefik.http.routers.plex.tls.certresolver=letsencrypt"
      - "traefik.http.services.plex.loadbalancer.server.port=32400"

networks:
  homelab:
    external: true
```

### Example: n8n Automation

```yaml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n
    container_name: n8n
    networks:
      - homelab
    environment:
      - N8N_HOST=n8n.evindrake.net
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://n8n.evindrake.net/
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.n8n.rule=Host(`n8n.evindrake.net`)"
      - "traefik.http.routers.n8n.entrypoints=websecure"
      - "traefik.http.routers.n8n.tls.certresolver=letsencrypt"
      - "traefik.http.services.n8n.loadbalancer.server.port=5678"

networks:
  homelab:
    external: true
```

## Security: Protecting Routes with Twingate

To restrict access to certain routes (dashboard, Traefik UI) to only Twingate VPN:

### Method 1: IP Allowlist Middleware

```yaml
labels:
  - "traefik.http.routers.dashboard.middlewares=twingate-only"
  - "traefik.http.middlewares.twingate-only.ipwhitelist.sourcerange=100.64.0.0/10"
```

Twingate uses the `100.64.0.0/10` CGNAT range by default.

### Method 2: Keep Dashboard Authentication

The dashboard already has API key authentication, so you can:
1. Access it publicly via HTTPS
2. Require API key login
3. Optionally add Twingate restriction for extra security

## Firewall Configuration

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## Useful Commands

```bash
# View Traefik logs
docker logs traefik -f

# View dashboard logs
docker logs homelab-dashboard -f

# Restart Traefik
docker-compose -f docker-compose.traefik.yml restart traefik

# Restart dashboard
docker-compose -f docker-compose.traefik.yml restart homelab-dashboard

# View all containers on homelab network
docker network inspect homelab

# Force SSL certificate renewal (if needed)
docker exec traefik rm /acme.json
docker-compose -f docker-compose.traefik.yml restart traefik
```

## Troubleshooting

### SSL Certificate Issues

**Problem**: Can't get SSL certificate

**Solutions**:
1. Check DNS is pointing to your server: `dig host.evindrake.net`
2. Ensure ports 80 and 443 are open: `sudo ufw status`
3. Check Traefik logs: `docker logs traefik`
4. Verify acme.json permissions: `ls -la traefik/acme.json` (should be 600)

### Container Not Accessible

**Problem**: Can't reach container at subdomain

**Solutions**:
1. Check container is on homelab network: `docker network inspect homelab`
2. Verify labels are correct: `docker inspect container-name`
3. Check Traefik recognizes the route: Visit Traefik dashboard at `traefik.evindrake.net`
4. Ensure the port in labels matches container's exposed port

### Twingate Access Issues

**Problem**: Can't access from Twingate

**Solutions**:
1. Verify Twingate connector is running
2. Check IP allowlist includes Twingate's CGNAT range
3. Test without IP restriction first, then add it back

## Alternative: DNS Challenge (Behind NAT/Firewall)

If ports 80/443 aren't accessible from the internet, use DNS challenge with Cloudflare:

1. Move your DNS to Cloudflare (free)
2. Get Cloudflare API token
3. Update `traefik.yml`:

```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: your-email@example.com
      storage: /acme.json
      dnsChallenge:
        provider: cloudflare
        delayBeforeCheck: 0
```

4. Add to docker-compose:

```yaml
environment:
  - CF_API_EMAIL=your-cloudflare-email
  - CF_API_KEY=your-cloudflare-api-key
```

## Next Steps

1. ✅ Set up Traefik with your email
2. ✅ Configure DNS records
3. ✅ Deploy dashboard to `host.evindrake.net`
4. ✅ Add other containers with Traefik labels
5. ✅ Configure Twingate restrictions for sensitive services
6. ✅ Set up monitoring/alerts (optional)

## Complete Example: All Services

Create `docker-compose.production.yml`:

```yaml
version: '3.8'

networks:
  homelab:
    name: homelab
    driver: bridge

services:
  traefik:
    # ... (see docker-compose.traefik.yml)

  homelab-dashboard:
    # ... (see docker-compose.traefik.yml)

  discord-bot:
    # ... (your config + Traefik labels)

  plex:
    # ... (your config + Traefik labels)

  n8n:
    # ... (your config + Traefik labels)

  scarletredjoker-web:
    # ... (your config + Traefik labels)
```

Then deploy everything:

```bash
docker-compose -f docker-compose.production.yml up -d
```

Your entire homelab is now accessible via subdomains with automatic SSL! 🎉
