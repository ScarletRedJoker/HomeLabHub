# Homelab Setup - Simple & Complete

## Fresh Installation (5-Year-Old Mode)

### On Your Ubuntu Server

**Step 1: Clone the repository**
```bash
cd /home/evin/contain
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub
```

**Step 2: Create your .env file**
```bash
cp .env.example .env
nano .env
```

Fill in your passwords and API keys. The required ones are clearly marked in the file.

**Step 3: Run the bootstrap**
```bash
chmod +x bootstrap-homelab.sh
./bootstrap-homelab.sh
```

That's it! The script will:
- ✅ Validate your environment
- ✅ Build all Docker images
- ✅ Create databases
- ✅ Run migrations
- ✅ Start all 15 services
- ✅ Test everything works

**Time:** ~10-15 minutes

---

## What You Get

### 15 Services Running:

**Core Infrastructure:**
- PostgreSQL database
- Redis cache
- MinIO object storage
- Caddy reverse proxy (automatic SSL)

**Web Interfaces:**
- Dashboard (host.evindrake.net) - Jarvis AI assistant
- Discord Bot (bot.rig-city.com) - Ticket system
- Stream Bot (stream.rig-city.com) - Multi-platform streaming
- n8n (n8n.evindrake.net) - Workflow automation
- Home Assistant (home.evindrake.net) - Smart home
- Plex (plex.evindrake.net) - Media server
- VNC Desktop (vnc.evindrake.net) - Remote desktop
- Code Server (code.evindrake.net) - VS Code in browser

**Static Sites:**
- rig-city.com
- scarletredjoker.com

---

## Common Tasks

### Check Status
```bash
./homelab status
```

### View Logs
```bash
./homelab logs              # All services
./homelab logs discord-bot  # Specific service
```

### Restart Everything
```bash
./homelab restart
```

### Fix Issues
```bash
./bootstrap-homelab.sh  # Re-run bootstrap (safe, idempotent)
```

---

## Troubleshooting

**Services unhealthy?**
- Wait 60 seconds after startup (health checks take time)
- Check logs: `./homelab logs [service-name]`
- Re-run bootstrap: `./bootstrap-homelab.sh`

**Dashboard not working?**
- Bootstrap script fixes database migrations automatically
- If still broken, check: `./homelab logs homelab-dashboard`

**Can't access websites?**
- Check Caddy is running: `docker ps | grep caddy`
- DNS configured? (Your domains should point to this server)
- SSL certificates: Caddy handles automatically

---

## Development Workflow

1. **Edit code** in Replit or local editor
2. **Commit & push** to GitHub
3. **On server:**
   ```bash
   cd /home/evin/contain/HomeLabHub
   git pull origin main
   ./bootstrap-homelab.sh  # Or just `./homelab restart` if no DB changes
   ```

---

## Database Access

**Connect to PostgreSQL:**
```bash
docker exec -it homelab-postgres psql -U postgres
```

**Databases:**
- `ticketbot` - Discord bot data
- `streambot` - Stream bot data
- `homelab_jarvis` - Dashboard data

---

## Key Files

- `.env` - All configuration (never commit this!)
- `docker-compose.yml` - Service definitions
- `bootstrap-homelab.sh` - Complete setup script
- `homelab` - Quick management commands
- `Caddyfile` - Reverse proxy configuration

---

## Help

**Everything is broken?**
```bash
./bootstrap-homelab.sh
```

This script is idempotent (safe to run many times) and fixes most issues.

**Still broken?**
Check the logs and look for ERROR or FATAL messages:
```bash
./homelab logs | grep -i error
```
