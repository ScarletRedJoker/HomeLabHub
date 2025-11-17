# Network Architecture & Configuration

Complete networking documentation for the Homelab deployment system.

## Table of Contents
1. [Service Port Map](#service-port-map)
2. [Domain Routing Table](#domain-routing-table)
3. [Network Architecture](#network-architecture)
4. [Port Conflict Resolution](#port-conflict-resolution)
5. [Troubleshooting](#troubleshooting)

---

## Service Port Map

Complete mapping of all services and their port configurations.

| Service | Internal Port | External Port | Protocol | Type | Notes |
|---------|--------------|---------------|----------|------|-------|
| **Caddy** | 80, 443 | 80, 443 | HTTP/HTTPS | Reverse Proxy | Auto SSL with Let's Encrypt |
| **Dashboard** | 5000 | - | HTTP | Web App | Flask application |
| **Stream Bot** | 5000 | - | HTTP | Web App | Node.js + React |
| **Discord Bot** | 5000 | - | HTTP | Web App | Node.js + React |
| **PostgreSQL** | 5432 | 5432 | TCP | Database | Shared by all services |
| **Redis** | 6379 | - | TCP | Cache | Message broker & cache |
| **MinIO** | 9000, 9001 | 9000, 9001 | HTTP | Object Storage | S3-compatible storage |
| **PowerDNS** | 53, 8081 | 53, 8081 | UDP/TCP | DNS Server | Local DNS nameserver |
| **Plex** | 32400 | - | HTTP | Media Server | Media streaming |
| **n8n** | 5678 | - | HTTP | Automation | Workflow automation |
| **VNC Desktop** | 80, 5900 | - | HTTP/VNC | Remote Desktop | noVNC web interface |
| **Code Server** | 8080 | - | HTTP | IDE | VS Code in browser |
| **Home Assistant** | 8123 | - | HTTP | Smart Home | Home automation |
| **Rig City Site** | 80 | - | HTTP | Static Site | Community website |
| **ScarletRedJoker** | 80 | - | HTTP | Static Site | Personal website |

### Port Usage Notes

- **External Ports**: Only Caddy (80, 443) and infrastructure services (PostgreSQL, MinIO, PowerDNS) expose ports to the host
- **Internal Ports**: Application services communicate via the `homelab` Docker network
- **Conflicts**: All services use unique internal ports to avoid conflicts

---

## Domain Routing Table

Caddy reverse proxy configuration mapping domains to backend services.

| Domain | Backend Service | Internal Port | SSL | Purpose |
|--------|----------------|---------------|-----|---------|
| **bot.rig-city.com** | discord-bot | 5000 | ✅ Auto | Discord ticket management system |
| **stream.rig-city.com** | stream-bot | 5000 | ✅ Auto | Stream automation & alerts |
| **rig-city.com** | rig-city-site | 80 | ✅ Auto | Community website |
| **plex.evindrake.net** | plex-server | 32400 | ✅ Auto | Media server |
| **n8n.evindrake.net** | n8n | 5678 | ✅ Auto | Workflow automation |
| **host.evindrake.net** | homelab-dashboard | 5000 | ✅ Auto | Main control panel |
| **vnc.evindrake.net** | vnc-desktop | 80 | ✅ Auto | Remote desktop access |
| **code.evindrake.net** | code-server | 8080 | ✅ Auto | VS Code IDE |
| **game.evindrake.net** | homelab-dashboard | 5000 | ✅ Auto | Game streaming launcher |
| **scarletredjoker.com** | scarletredjoker-web | 80 | ✅ Auto | Personal website |
| **home.evindrake.net** | homeassistant | 8123 | ✅ Auto | Smart home control |

### Redirect Rules

- `www.rig-city.com` → `rig-city.com` (301 permanent)
- `www.scarletredjoker.com` → `scarletredjoker.com` (301 permanent)
- `game.evindrake.net/` → `game.evindrake.net/game-connect` (301 permanent)

### SSL Certificate Management

- **Provider**: Let's Encrypt (via Caddy's automatic HTTPS)
- **Contact Email**: evin@evindrake.net
- **Renewal**: Automatic (Caddy handles renewals)
- **Storage**: `/data/caddy` volume in Caddy container
- **Protocols**: TLS 1.2+, HTTP/2, HTTP/3 (QUIC)

---

## Network Architecture

### High-Level Architecture

```
                           INTERNET
                              │
                              ▼
                    ┌─────────────────┐
                    │  Caddy (80/443) │
                    │  Reverse Proxy  │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │     Docker Network: homelab     │
            │                                  │
  ┌─────────┼─────────┬──────────┬───────────┼─────────┐
  │         │         │          │           │         │
  ▼         ▼         ▼          ▼           ▼         ▼
┌───┐    ┌───┐    ┌─────┐   ┌─────┐     ┌────┐    ┌────┐
│DB │    │Web│    │Media│   │Auto │     │IDE │    │IoT │
│   │    │Apps│   │Srvr │   │mtn  │     │    │    │    │
└───┘    └───┘    └─────┘   └─────┘     └────┘    └────┘
PostgreSQL Dashboard  Plex     n8n      Code-    Home
Redis    Stream-Bot          Server    Assist
         Discord-Bot
```

### Detailed Service Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         CADDY (Port 80/443)                    │
│                      Automatic SSL/TLS Proxy                   │
└───────────────┬───────────────────────────────┬────────────────┘
                │                               │
    ┌───────────┴──────────┐        ┌──────────┴───────────┐
    │   rig-city.com       │        │  evindrake.net       │
    │   Domains            │        │  Domains             │
    └──────┬───────────────┘        └──────┬───────────────┘
           │                               │
    ┌──────┴─────────┐              ┌──────┴──────────────┐
    │                │              │                     │
    ▼                ▼              ▼                     ▼
┌────────┐      ┌────────┐    ┌────────┐           ┌──────────┐
│Stream  │      │Discord │    │Dashboard│          │Plex Media│
│Bot     │      │Bot     │    │:5000   │          │:32400    │
│:5000   │      │:5000   │    └────────┘          └──────────┘
└────────┘      └────────┘         │                    
                                   │                    
                            ┌──────┴──────┐
                            │             │
                            ▼             ▼
                       ┌────────┐    ┌────────┐
                       │n8n     │    │Home    │
                       │:5678   │    │Assist  │
                       └────────┘    │:8123   │
                                     └────────┘
```

### Network Isolation & Security

```
┌─────────────────────────────────────────────────────┐
│              homelab (bridge network)               │
│  All services can communicate internally            │
└──────────────┬──────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │                │
       ▼                ▼
   ┌───────┐        ┌────────┐
   │ Public│        │Internal│
   │Facing │        │Services│
   └───────┘        └────────┘
   
   • Dashboard       • PostgreSQL
   • Stream Bot      • Redis
   • Discord Bot     • MinIO
   • Plex            (No external access)
   • n8n
```

---

## Port Conflict Resolution

### Common Port Conflicts

#### Conflict: Multiple services on port 5000

**Symptoms:**
- Container fails to start
- Error: "port is already allocated"

**Resolution:**
```bash
# Check what's using port 5000
docker ps | grep 5000

# Option 1: Change internal port in docker-compose.yml
services:
  my-service:
    ports:
      - "5001:5000"  # Map to different host port

# Option 2: Use Caddy routing (recommended)
# Remove port mapping, use only internal network
services:
  my-service:
    networks:
      - homelab
    # No ports section - access via Caddy only
```

#### Conflict: PostgreSQL port already in use

**Symptoms:**
- PostgreSQL container fails to start
- Error: "bind: address already in use"

**Resolution:**
```bash
# Check if PostgreSQL is running on host
sudo systemctl status postgresql
sudo systemctl stop postgresql    # Stop system PostgreSQL
sudo systemctl disable postgresql # Prevent auto-start

# Or change Docker port
services:
  postgres:
    ports:
      - "5433:5432"  # Use different host port
```

### Port Allocation Strategy

1. **Caddy (80, 443)**: Always exposed to internet
2. **Infrastructure (5432, 6379, 9000)**: Exposed to host for admin access
3. **Applications**: No host port exposure, access via Caddy
4. **Development**: Use Replit workflows (no Docker port mapping needed)

---

## Troubleshooting

### Issue: Service not accessible via domain

**Diagnosis:**
```bash
# 1. Check if Caddy is running
docker ps | grep caddy
docker logs caddy

# 2. Verify DNS resolution
dig +short your-domain.com

# 3. Test internal service
docker exec caddy wget -O- http://service-name:port

# 4. Check Caddyfile syntax
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
```

**Common Causes:**
- DNS not pointing to server IP
- Firewall blocking ports 80/443
- Service container not running
- Incorrect Caddyfile configuration

**Solutions:**
```bash
# Restart Caddy
docker-compose restart caddy

# Check firewall
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Verify service is up
docker-compose ps
docker logs service-name
```

### Issue: SSL certificate not generating

**Diagnosis:**
```bash
# Check Caddy logs for certificate errors
docker logs caddy 2>&1 | grep -i "certificate\|acme\|error"

# Verify domain DNS
dig +short your-domain.com @8.8.8.8

# Test ACME HTTP challenge
curl -I http://your-domain.com/.well-known/acme-challenge/test
```

**Common Causes:**
- Domain DNS not propagated
- Port 80/443 blocked
- Invalid email in Caddyfile
- Rate limit reached (Let's Encrypt)

**Solutions:**
```bash
# Wait for DNS propagation (up to 48 hours)
# Check DNS: https://dnschecker.org

# Verify ports are open
sudo netstat -tlnp | grep -E ':80|:443'

# Clear Caddy's ACME storage and retry
docker-compose down caddy
docker volume rm homelab_caddy_data
docker-compose up -d caddy
```

### Issue: Database connection refused

**Diagnosis:**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection from another container
docker run --rm --network homelab postgres:16-alpine \
  psql -h discord-bot-db -U ticketbot -d ticketbot

# Check PostgreSQL logs
docker logs discord-bot-db
```

**Solutions:**
```bash
# Restart PostgreSQL
docker-compose restart discord-bot-db

# Verify network connectivity
docker exec dashboard ping discord-bot-db

# Check environment variables
docker exec dashboard env | grep DATABASE_URL
```

### Issue: Network performance/connectivity

**Diagnosis:**
```bash
# Test network latency between containers
docker exec dashboard ping -c 4 redis

# Check network configuration
docker network inspect homelab

# Monitor network traffic
docker stats --no-stream
```

**Solutions:**
```bash
# Recreate network
docker-compose down
docker network rm homelab
docker network create homelab
docker-compose up -d

# Check for DNS issues
docker exec dashboard cat /etc/resolv.conf
```

---

## Validation Commands

### Quick Health Check
```bash
# Run full network validation
python3 scripts/validation/check_network.py

# Check service health
python3 scripts/validation/check_services.py

# Generate deployment report
python3 scripts/validation/readiness_report.py
```

### Manual Verification
```bash
# Check all port mappings
docker-compose -f docker-compose.unified.yml config | grep -A 2 "ports:"

# Verify all services are on homelab network
docker network inspect homelab -f '{{range .Containers}}{{.Name}} {{end}}'

# Test all domain routes
for domain in bot.rig-city.com stream.rig-city.com host.evindrake.net; do
  echo "Testing $domain..."
  curl -sI "https://$domain" | head -1
done
```

---

## Best Practices

1. **Always use Caddy for external access** - Don't expose application ports directly
2. **Keep infrastructure ports minimal** - Only PostgreSQL, Redis, MinIO need host ports
3. **Use Docker networks** - Keep services isolated on the homelab network
4. **Monitor port usage** - Run validation scripts before deploying
5. **Document changes** - Update this file when adding new services

---

## Related Documentation

- [Deployment Guide](DEPLOYMENT.md)
- [Security Configuration](SECURITY.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Architecture Overview](ARCHITECTURE.md)

---

*Last Updated: November 17, 2025*
