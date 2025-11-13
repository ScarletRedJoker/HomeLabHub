# Homelab Deployment Guide

## Quick Start

Deploy your entire homelab with **one command**:

```bash
cd /home/evin/contain/HomeLabHub
./deploy-unified.sh
```

This automated script will:
1. ✅ Check system requirements
2. ✅ Auto-generate Caddyfile with your email from `.env`
3. ✅ Build all Docker containers
4. ✅ Start all services with automatic HTTPS
5. ✅ Configure SSL certificates via Let's Encrypt

---

## Services Deployed

After deployment, all services are accessible via HTTPS:

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | https://host.evindrake.net | Homelab management interface |
| **Discord Bot** | https://bot.rig-city.com | Custom ticket bot with PostgreSQL |
| **Stream Bot** | https://stream.rig-city.com | AI Snapple facts for Twitch |
| **Plex** | https://plex.evindrake.net | Media streaming server |
| **n8n** | https://n8n.evindrake.net | Workflow automation |
| **VNC Desktop** | https://vnc.evindrake.net | Remote desktop access |
| **Static Site** | https://scarletredjoker.com | Personal website |

---

## Prerequisites

1. **Port Forwarding** configured on your router:
   - Port 80 (HTTP) → Your server
   - Port 443 (HTTPS) → Your server

2. **Environment Variables** set in `.env`:
   - `LETSENCRYPT_EMAIL` - Your email for SSL certificates
   - API keys and tokens for various services

3. **Domain DNS** pointing to your public IP:
   - bot.rig-city.com
   - stream.rig-city.com
   - plex.evindrake.net
   - n8n.evindrake.net
   - host.evindrake.net
   - vnc.evindrake.net
   - scarletredjoker.com

---

## Architecture

### Reverse Proxy: Caddy

**Why Caddy?**
- Automatic HTTPS with Let's Encrypt
- Simple configuration (Caddyfile)
- No Docker API compatibility issues (unlike Traefik v3.x with Docker 29.0.0)
- Automatic HTTP → HTTPS redirects

The `deploy-unified.sh` script automatically generates the Caddyfile from your `.env`:

```caddy
{
    email your-email@example.com  # From LETSENCRYPT_EMAIL
}

bot.rig-city.com {
    reverse_proxy discord-bot:5000
}

# ... all other domains
```

### Container Network

All services run on a shared Docker network (`homelab`) allowing:
- Container-to-container communication by name
- Simplified routing through Caddy
- Database access via PostgreSQL container name

---

## Post-Deployment

### 1. Monitor SSL Certificate Acquisition

```bash
docker logs caddy -f
```

Look for messages like:
```json
{"level":"info","msg":"certificate obtained successfully"}
```

### 2. Check Service Status

```bash
docker compose -f docker-compose.unified.yml ps
```

All services should show "Up" status.

### 3. View All Logs

```bash
docker compose -f docker-compose.unified.yml logs -f
```

### 4. Test HTTPS Access

```bash
curl -I https://host.evindrake.net
curl -I https://bot.rig-city.com
```

Should return `HTTP/2 200` or `HTTP/2 302`.

---

## Troubleshooting

### Caddy Won't Start

Check Caddyfile syntax:
```bash
docker run --rm -v $(pwd)/Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile
```

### SSL Certificates Not Issuing

1. Verify port forwarding (80 & 443)
2. Check DNS is pointing to your public IP
3. View Caddy logs: `docker logs caddy -f`

### Service Can't Connect to Database

Check PostgreSQL is running:
```bash
docker logs discord-bot-db --tail 20
```

Verify network aliases:
```bash
docker exec discord-bot ping discord-bot-db
docker exec discord-bot ping postgres  # Should also work via alias
```

---

## Updating Services

### Rebuild and Restart All Services

```bash
cd /home/evin/contain/HomeLabHub
docker compose -f docker-compose.unified.yml build
docker compose -f docker-compose.unified.yml up -d
```

### Restart Single Service

```bash
docker compose -f docker-compose.unified.yml restart discord-bot
```

### Update Environment Variables

1. Edit `.env`
2. Restart affected services:
   ```bash
   docker compose -f docker-compose.unified.yml restart
   ```

---

## File Structure

```
/home/evin/contain/HomeLabHub/
├── deploy-unified.sh          # Main deployment script
├── docker-compose.unified.yml # All services configuration
├── Caddyfile                  # Auto-generated reverse proxy config
├── .env                       # Environment variables & secrets
├── src/                       # Dashboard Python code
├── logs/                      # Application logs
└── static/                    # Dashboard frontend assets
```

---

## Maintenance

### Backup Database

```bash
docker exec discord-bot-db pg_dump -U ticketbot ticketbot > backup.sql
```

### View Resource Usage

```bash
docker stats
```

### Clean Up Old Images

```bash
docker system prune -a
```

---

## Security Notes

1. **Change default credentials** in `.env`:
   - `WEB_USERNAME` and `WEB_PASSWORD` for dashboard
   - `VNC_PASSWORD` for VNC access

2. **Firewall**: Only ports 80 and 443 should be exposed to internet

3. **SSL Certificates**: Automatically renewed by Caddy every 60 days

4. **Database**: PostgreSQL is only accessible within Docker network (not exposed to internet)

---

## Need Help?

Check these docs:
- [FIX_TRAEFIK.md](./FIX_TRAEFIK.md) - Historical Traefik issues (now using Caddy)
- [USE_CADDY_INSTEAD.md](./USE_CADDY_INSTEAD.md) - Why we switched to Caddy
- [TROUBLESHOOTING_HOMELAB.md](./TROUBLESHOOTING_HOMELAB.md) - General troubleshooting

Monitor logs:
```bash
docker compose -f docker-compose.unified.yml logs -f
```
