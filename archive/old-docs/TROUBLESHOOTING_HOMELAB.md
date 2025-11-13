# Homelab Troubleshooting Guide

## Issue: All Services Show Blank Pages

Your domains (stream.rig-city.com, bot.rig-city.com, plex.evindrake.net, n8n.evindrake.net, scarletredjoker.com) are all loading blank pages. Here's how to diagnose and fix this:

---

## Quick Diagnostic Commands

Run these on your **Ubuntu homelab server** (SSH in or use local terminal):

```bash
# 1. Check if Docker containers are running
docker ps -a

# 2. Check Traefik status specifically
docker logs traefik --tail 50

# 3. Check if Traefik is running and healthy
docker inspect traefik | grep Status

# 4. Check if ports 80 and 443 are accessible
sudo netstat -tlnp | grep -E ':(80|443)'

# 5. Check if services are in the correct network
docker network inspect homelab
```

---

## Common Issues and Fixes

### Issue 1: Containers Not Running

**Check:**
```bash
cd /home/evin/contain/HomeLabHub
docker compose -f docker-compose.unified.yml ps
```

**If containers are stopped, restart:**
```bash
cd /home/evin/contain/HomeLabHub
docker compose -f docker-compose.unified.yml up -d
```

---

### Issue 2: Traefik Not Working

**Check Traefik logs:**
```bash
docker logs traefik -f
```

Look for errors like:
- "Unable to obtain ACME certificate" → DNS or port forwarding issue
- "no configuration found" → Traefik can't see Docker containers
- "connection refused" → Backend services not responding

**Restart Traefik:**
```bash
docker restart traefik
```

---

### Issue 3: SSL Certificate Issues

**Check certificate status:**
```bash
docker exec traefik ls -la /letsencrypt/
docker exec traefik cat /letsencrypt/acme.json
```

**If acme.json is empty or has errors:**
```bash
# Stop everything
cd /home/evin/contain/HomeLabHub
docker compose -f docker-compose.unified.yml down

# Remove old certificates
docker volume rm homelabhub_traefik_data

# Restart (will request new certs)
docker compose -f docker-compose.unified.yml up -d
```

---

### Issue 4: Port Forwarding Not Working

**Verify your router has these port forwards:**
- **Port 80** → Your Ubuntu server IP
- **Port 443** → Your Ubuntu server IP

**Test from outside your network:**
```bash
# From another computer (not on your home network)
curl -I http://bot.rig-city.com
curl -I https://bot.rig-city.com
```

**Check UFW firewall:**
```bash
sudo ufw status
# Should show ports 80 and 443 as ALLOW
```

**If not open:**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
```

---

### Issue 5: DNS Not Updated

**Check if domains resolve to your public IP:**
```bash
# Get your public IP
curl -4 ifconfig.me

# Check each domain
nslookup bot.rig-city.com
nslookup stream.rig-city.com
nslookup plex.evindrake.net
nslookup n8n.evindrake.net
nslookup scarletredjoker.com
```

**If DNS doesn't match your IP:**
- Log into ZoneEdit (your DNS provider)
- Update A records to point to your current public IP
- Wait 5-15 minutes for propagation

---

### Issue 6: Services Crashed

**Check individual service logs:**
```bash
# Discord Bot
docker logs discord-bot --tail 100

# Stream Bot
docker logs stream-bot --tail 100

# Plex
docker logs plex-server --tail 100

# n8n
docker logs n8n --tail 100

# Static site (nginx)
docker logs static-site --tail 100
```

Look for error messages and fix accordingly.

---

## Complete Reset Procedure

If nothing above works, do a complete restart:

```bash
cd /home/evin/contain/HomeLabHub

# 1. Stop all services
docker compose -f docker-compose.unified.yml down

# 2. Check for conflicting containers
docker ps -a | grep -E "(traefik|discord|stream|plex|n8n)"

# 3. Remove any orphaned containers
docker container prune -f

# 4. Restart everything
docker compose -f docker-compose.unified.yml up -d

# 5. Watch logs for errors
docker compose -f docker-compose.unified.yml logs -f
```

---

## Verify Services Are Working

After fixes, test each service:

```bash
# Test from your Ubuntu server
curl -I http://localhost:80
curl -I https://bot.rig-city.com
curl -I https://stream.rig-city.com
curl -I https://plex.evindrake.net
curl -I https://n8n.evindrake.net
curl -I https://scarletredjoker.com

# Check Traefik dashboard
# Visit: https://traefik.evindrake.net
```

---

## Monitor Script

Use the monitoring script I created:

```bash
cd /home/evin/contain/HomeLabHub
./monitor-homelab.sh
```

Select option 1 to see all service statuses.

---

## Most Likely Causes (in order):

1. **Docker containers stopped** - Run `docker compose up -d`
2. **Port forwarding broke** - Check router settings for ports 80/443
3. **Dynamic IP changed** - Update DNS records on ZoneEdit
4. **Traefik crashed** - Check `docker logs traefik`
5. **SSL certs expired/failed** - Reset Traefik volume
6. **Services crashed** - Check individual container logs

---

## Emergency Contact Info

If you need to temporarily bypass Traefik and access services directly:

```bash
# Find internal ports
docker compose -f docker-compose.unified.yml ps

# Access directly via IP:PORT
# Example: http://YOUR_SERVER_IP:5000 for Discord bot
```

**Note:** This only works from inside your local network.

---

## Next Steps After Fix

1. Set up monitoring alerts
2. Configure automatic service restart
3. Add health checks to all services
4. Set up backup DNS provider
5. Document your public IP for quick reference
