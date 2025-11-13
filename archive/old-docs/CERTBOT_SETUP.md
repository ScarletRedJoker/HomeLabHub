# Homelab Dashboard - Nginx + Certbot Setup

This guide covers deploying the Homelab Dashboard using **Nginx reverse proxy** and **certbot** for SSL certificates - a traditional, familiar setup.

## Why This Setup?

- ✅ **Familiar Tools** - Standard Nginx + certbot (no Traefik learning curve)
- ✅ **Simple Configuration** - Clear nginx config files
- ✅ **Proven Reliability** - Battle-tested stack used everywhere
- ✅ **Easy SSL** - Certbot handles Let's Encrypt automatically
- ✅ **No Extra Requirements** - No Cloudflare DNS needed

## Prerequisites

1. **DNS Records Configured** (A records in ZoneEdit pointing to your server IP):
   - `host.evindrake.net`
   - `bot.rig-city.com`
   - `plex.evindrake.net`
   - `n8n.evindrake.net`
   - `scarletredjoker.com`

2. **Ports Open** (if firewall enabled):
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw allow 32400/tcp  # For Plex
   sudo ufw enable
   ```

3. **Docker & Docker Compose** installed

## Quick Deploy

```bash
# On your Ubuntu server
cd /home/evin/homelab-dashboard

# Run deployment script
./deploy-certbot.sh
```

The script will:
1. ✅ Check system requirements (installs nginx/certbot if needed)
2. ✅ Create all directories
3. ✅ Set up Docker network
4. ✅ Configure Nginx reverse proxy
5. ✅ Build and start containers
6. ✅ **Ask to generate SSL certificates** (interactive)

## What Gets Installed

### Services Running on These Ports:
- **Dashboard** → `http://localhost:8001` (proxied to host.evindrake.net)
- **Discord Bot** → `http://localhost:8002` (proxied to bot.rig-city.com)
- **Plex** → `http://localhost:8003` (proxied to plex.evindrake.net)
- **n8n** → `http://localhost:8004` (proxied to n8n.evindrake.net)
- **Static Site** → `http://localhost:8005` (proxied to scarletredjoker.com)

### Nginx Configuration:
Located at: `/etc/nginx/sites-available/homelab`

Each domain is configured with:
- Reverse proxy to local container port
- WebSocket support (for Plex, n8n)
- Proper headers for forwarding

## SSL Certificate Setup

### During Deployment (Recommended):
The script will ask if you want to set up SSL. If you answer "yes":
- Certbot will request certificates for all configured domains
- Nginx config will be automatically updated with SSL settings
- HTTP → HTTPS redirect will be enabled
- Auto-renewal is configured

### Manual SSL Setup (Later):
If you skip SSL during deployment, run certbot manually:

```bash
# For all domains at once
sudo certbot --nginx -d host.evindrake.net -d bot.rig-city.com -d plex.evindrake.net -d n8n.evindrake.net -d scarletredjoker.com

# Or one domain at a time
sudo certbot --nginx -d host.evindrake.net
sudo certbot --nginx -d bot.rig-city.com
```

### Test Auto-Renewal:
```bash
sudo certbot renew --dry-run
```

Certbot automatically sets up a systemd timer for renewal. Check it:
```bash
sudo systemctl status certbot.timer
```

## Managing Your Homelab

### View Running Containers:
```bash
docker compose -f docker-compose.nginx.yml ps
```

### View Logs:
```bash
# All services
docker compose -f docker-compose.nginx.yml logs -f

# Specific service
docker compose -f docker-compose.nginx.yml logs -f homelab-dashboard
docker compose -f docker-compose.nginx.yml logs -f plex
```

### Restart Services:
```bash
# Restart one service
docker compose -f docker-compose.nginx.yml restart homelab-dashboard

# Restart all
docker compose -f docker-compose.nginx.yml restart
```

### Stop Services:
```bash
# Stop all
docker compose -f docker-compose.nginx.yml down

# Stop but keep network
docker compose -f docker-compose.nginx.yml stop
```

### Update Services:
```bash
cd /home/evin/homelab-dashboard
git pull  # Get latest code
docker compose -f docker-compose.nginx.yml build homelab-dashboard
docker compose -f docker-compose.nginx.yml up -d
```

## Configuration

### Enable/Disable Services:

Edit `.env` and change `COMPOSE_PROFILES`:

```bash
# Start everything
COMPOSE_PROFILES=all

# Or pick specific services
COMPOSE_PROFILES=plex,n8n,web

# Just dashboard (no optional services)
COMPOSE_PROFILES=
```

Then restart:
```bash
docker compose -f docker-compose.nginx.yml up -d
```

### Add OpenAI API Key:

For AI features (log analysis, assistant):

```bash
nano .env
# Add: OPENAI_API_KEY=sk-proj-your-new-key-here

docker compose -f docker-compose.nginx.yml restart homelab-dashboard
```

### Configure Plex:

Get claim token from https://www.plex.tv/claim/

```bash
nano .env
# Add: PLEX_CLAIM=claim-token-here

docker compose -f docker-compose.nginx.yml restart plex
```

## Nginx Management

### View Nginx Logs:
```bash
# Access logs
sudo tail -f /var/log/nginx/access.log

# Error logs
sudo tail -f /var/log/nginx/error.log
```

### Test Nginx Config:
```bash
sudo nginx -t
```

### Reload Nginx (after config changes):
```bash
sudo systemctl reload nginx
```

### Edit Nginx Config:
```bash
sudo nano /etc/nginx/sites-available/homelab
sudo nginx -t
sudo systemctl reload nginx
```

## Troubleshooting

### Containers Not Starting:
```bash
# Check container status
docker compose -f docker-compose.nginx.yml ps

# View detailed logs
docker compose -f docker-compose.nginx.yml logs homelab-dashboard

# Check if ports are in use
sudo ss -tlnp | grep -E ':(8001|8002|8003|8004|8005)'
```

### Nginx 502 Bad Gateway:
```bash
# Check if container is running
docker ps | grep homelab

# Check nginx error log
sudo tail -f /var/log/nginx/error.log

# Verify container port is accessible
curl http://localhost:8001
```

### SSL Certificate Issues:
```bash
# Check certificate status
sudo certbot certificates

# Test renewal
sudo certbot renew --dry-run

# Force renewal (if cert is about to expire)
sudo certbot renew --force-renewal
```

### DNS Not Resolving:
```bash
# Test DNS from your server
nslookup host.evindrake.net

# Test from external
dig host.evindrake.net @8.8.8.8

# Check if domain points to your server
curl -I http://host.evindrake.net
```

## Comparison: Nginx vs Traefik

| Feature | Nginx + Certbot | Traefik |
|---------|----------------|---------|
| **Learning Curve** | Low (familiar) | Higher (new concept) |
| **SSL Setup** | Manual certbot | Automatic |
| **Configuration** | Clear files | Docker labels |
| **New Services** | Edit nginx config | Auto-discovered |
| **Renewal** | Systemd timer | Built-in |
| **Debugging** | Standard logs | Dashboard UI |
| **Dependencies** | None (Cloudflare optional) | None |

Both work great! This setup uses what you already know.

## Security Notes

- ✅ All services run behind Nginx reverse proxy
- ✅ Containers only expose ports to localhost
- ✅ SSL/TLS encryption via Let's Encrypt
- ✅ Works great with Twingate VPN for additional security
- ✅ API key authentication on dashboard
- ✅ Script execution disabled by default

## Next Steps

After deployment:

1. **Access Dashboard**: https://host.evindrake.net
2. **Login** with the API key from `.env`
3. **Configure Services**:
   - Add OpenAI API key for AI features
   - Set up Plex claim token
   - Configure n8n workflows
   - Upload content to `/var/www/scarletredjoker/`

Enjoy your homelab! 🎉
