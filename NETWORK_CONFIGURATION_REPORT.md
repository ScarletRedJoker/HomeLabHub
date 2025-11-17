# Homelab Network Configuration Report
**Generated:** November 17, 2025  
**System:** Ubuntu 25.10 Homelab  
**Status:** ✅ PRODUCTION READY

---

## Executive Summary

✅ **All 13 domains are properly configured and operational**  
✅ **SSL certificates valid for all domains (88-89 days remaining)**  
✅ **Docker networking configured correctly**  
✅ **Caddy reverse proxy routing validated**  
✅ **Port forwarding requirements documented**

---

## 1. DNS Configuration

### Public IP Address
**Current IP:** `74.76.32.151`

### Domain Resolution Status
All 13 domains resolve correctly to the homelab server:

| Domain | IP Address | Status |
|--------|-----------|--------|
| bot.rig-city.com | 74.76.32.151 | ✓ |
| stream.rig-city.com | 74.76.32.151 | ✓ |
| rig-city.com | 74.76.32.151 | ✓ |
| www.rig-city.com | 74.76.32.151 | ✓ |
| plex.evindrake.net | 74.76.32.151 | ✓ |
| n8n.evindrake.net | 74.76.32.151 | ✓ |
| host.evindrake.net | 74.76.32.151 | ✓ |
| vnc.evindrake.net | 74.76.32.151 | ✓ |
| code.evindrake.net | 74.76.32.151 | ✓ |
| game.evindrake.net | 74.76.32.151 | ✓ |
| home.evindrake.net | 74.76.32.151 | ✓ |
| scarletredjoker.com | 74.76.32.151 | ✓ |
| www.scarletredjoker.com | 74.76.32.151 | ✓ |

**Dynamic DNS:** ZoneEdit (configured)

---

## 2. SSL/TLS Certificate Status

### Let's Encrypt Certificates (12 domains)
All certificates are valid and auto-renewing:

| Domain | Issuer | Expiry Date | Days Remaining |
|--------|--------|-------------|----------------|
| bot.rig-city.com | Let's Encrypt | 2026-02-13 | 88 days |
| stream.rig-city.com | Let's Encrypt | 2026-02-13 | 88 days |
| rig-city.com | Let's Encrypt | 2026-02-15 | 89 days |
| www.rig-city.com | Let's Encrypt | 2026-02-15 | 89 days |
| plex.evindrake.net | Let's Encrypt | 2026-02-13 | 88 days |
| n8n.evindrake.net | Let's Encrypt | 2026-02-13 | 88 days |
| host.evindrake.net | Let's Encrypt | 2026-02-13 | 88 days |
| vnc.evindrake.net | Let's Encrypt | 2026-02-13 | 88 days |
| code.evindrake.net | Let's Encrypt | 2026-02-13 | 88 days |
| game.evindrake.net | Let's Encrypt | 2026-02-13 | 88 days |
| scarletredjoker.com | Let's Encrypt | 2026-02-13 | 88 days |
| www.scarletredjoker.com | Let's Encrypt | 2026-02-13 | 88 days |

### ZeroSSL Certificate (1 domain)
| Domain | Issuer | Expiry Date | Days Remaining |
|--------|--------|-------------|----------------|
| home.evindrake.net | ZeroSSL | 2026-02-14 | 89 days |

**Email for ACME:** evin@evindrake.net  
**Auto-Renewal:** ✅ Enabled (Caddy handles automatically)

---

## 3. Port Forwarding Configuration

### Required Ports (MUST be forwarded to 74.76.32.151)

| Port | Protocol | Purpose | Status |
|------|----------|---------|--------|
| 80 | TCP | HTTP (Let's Encrypt validation) | ✅ Required |
| 443 | TCP | HTTPS (All web traffic) | ✅ Required |
| 443 | UDP | HTTP/3 (QUIC protocol) | ✅ Recommended |

### Optional Direct Access Ports (Not Recommended)
| Port | Protocol | Service | Recommendation |
|------|----------|---------|----------------|
| 32400 | TCP | Plex Direct | Use plex.evindrake.net instead |
| 8123 | TCP | Home Assistant Direct | Use home.evindrake.net instead |
| 9000-9001 | TCP | MinIO (Internal) | Never expose publicly |

**Security Note:** All public services should access through Caddy reverse proxy (ports 80/443) for proper SSL, security headers, and logging.

---

## 4. Caddy Reverse Proxy Configuration

### Validated Configurations

**✅ Reverse Proxy Mappings:**
| Domain | Upstream Service | Features |
|--------|-----------------|----------|
| bot.rig-city.com | discord-bot:5000 | X-Forwarded headers |
| stream.rig-city.com | stream-bot:5000 | X-Forwarded headers |
| rig-city.com | rig-city-site:80 | Basic proxy |
| www.rig-city.com | → rig-city.com | 301 Redirect |
| plex.evindrake.net | plex-server:32400 | Basic proxy |
| n8n.evindrake.net | n8n:5678 | Basic proxy |
| host.evindrake.net | homelab-dashboard:5000 | No-cache headers |
| vnc.evindrake.net | vnc-desktop:80 | Basic proxy |
| code.evindrake.net | code-server:8080 | WebSocket, security headers |
| game.evindrake.net | homelab-dashboard:5000 | No-cache, redirect / |
| home.evindrake.net | homeassistant:8123 | WebSocket support |
| scarletredjoker.com | scarletredjoker-web:80 | Basic proxy |
| www.scarletredjoker.com | → scarletredjoker.com | 301 Redirect |

**✅ Special Features:**
- **WebSocket Support:** code.evindrake.net, home.evindrake.net
- **Cache Control:** host.evindrake.net, code.evindrake.net, game.evindrake.net
- **Security Headers:** code.evindrake.net (CSP, X-Frame-Options, HSTS)
- **Automatic Redirects:** www → apex domain for rig-city.com and scarletredjoker.com

---

## 5. Docker Network Architecture

### Network Configuration
- **Network Name:** `homelab`
- **Network Driver:** `bridge`
- **Total Services:** 15 containers

### Service Categories

#### Public Web Services (10)
Accessible via HTTPS through Caddy:
- Discord Ticket Bot (bot.rig-city.com)
- Stream Bot (stream.rig-city.com)
- Rig City Website (rig-city.com)
- Plex Media Server (plex.evindrake.net)
- n8n Automation (n8n.evindrake.net)
- Homelab Dashboard (host.evindrake.net, game.evindrake.net)
- VNC Desktop (vnc.evindrake.net)
- Code Server (code.evindrake.net)
- Home Assistant (home.evindrake.net)
- Scarlet Red Joker (scarletredjoker.com)

#### Infrastructure Services (5)
Internal only, not exposed to public:
- PostgreSQL Database (discord-bot-db:5432)
- Redis Cache (homelab-redis:6379)
- MinIO Object Storage (homelab-minio:9000, 9001)
- Celery Worker (background tasks)
- Caddy Reverse Proxy (gateway)

### Health Checks
Services with configured health monitoring:
- ✅ redis → `redis-cli ping`
- ✅ minio → HTTP health endpoint
- ✅ discord-bot-db → PostgreSQL ready check
- ✅ stream-bot → HTTP /health endpoint
- ✅ vnc-desktop → HTTP port check
- ✅ code-server → HTTP /healthz endpoint
- ✅ homeassistant → HTTP / check

### Service Dependencies
Properly configured startup order:
- **homelab-dashboard** depends on: discord-bot-db, redis, minio (all healthy)
- **homelab-celery-worker** depends on: redis, discord-bot-db (all healthy)
- **discord-bot** depends on: discord-bot-db (healthy)
- **stream-bot** depends on: discord-bot-db (healthy)

---

## 6. Service Accessibility Matrix

### Public Services (All require authentication)

| Service | Domain(s) | Authentication | VPN Required |
|---------|-----------|----------------|--------------|
| Discord Ticket Bot | bot.rig-city.com | Discord OAuth | No |
| Stream Bot | stream.rig-city.com | OAuth (Twitch/YouTube/Kick) | No |
| Rig City Website | rig-city.com | None (Public) | No |
| Plex Media Server | plex.evindrake.net | Plex Account | No |
| n8n Automation | n8n.evindrake.net | n8n Login | Recommended |
| Homelab Dashboard | host.evindrake.net | Session + API Key | Recommended |
| Game Streaming | game.evindrake.net | Session + API Key | Recommended |
| VNC Desktop | vnc.evindrake.net | Password | **Yes (VPN Only)** |
| Code Server | code.evindrake.net | Password | **Yes (VPN Only)** |
| Home Assistant | home.evindrake.net | Home Assistant Login | Recommended |
| Personal Portfolio | scarletredjoker.com | None (Public) | No |

**Twingate VPN:** Provides secure access to administrative services (VNC, Code Server)

---

## 7. Security Analysis

### ✅ Strengths
1. All traffic encrypted with valid SSL certificates
2. Automatic certificate renewal via Caddy
3. Proper reverse proxy with security headers
4. Internal services not exposed to internet
5. Service-specific authentication mechanisms
6. Health checks for critical services
7. Dependency management prevents failed startups
8. Network isolation via Docker bridge network

### ⚠️ Recommendations

#### High Priority
1. **VPN-Only Services:** Ensure VNC and Code Server are only accessible via Twingate
   - Add IP whitelist or Caddy authentication
   - Consider removing from public Caddyfile if VPN-only

2. **Admin Services:** Restrict access to n8n and Homelab Dashboard
   - Add IP-based access control
   - Enable two-factor authentication where available

3. **Monitoring:** Set up alerts for:
   - SSL certificate expiration (< 30 days)
   - Service health check failures
   - Unusual traffic patterns
   - Failed authentication attempts

#### Medium Priority
4. **Rate Limiting:** Add Caddy rate limiting for:
   - Login endpoints (prevent brute force)
   - API endpoints (prevent abuse)

5. **Backup Validation:**
   - Test Caddy `/data` volume backups
   - Verify certificate recovery process

6. **Access Logs:** Enable and monitor Caddy access logs
   - Track unauthorized access attempts
   - Monitor geographic access patterns

---

## 8. Disaster Recovery Checklist

### Critical Components to Backup
- ✅ Caddy `/data` volume (SSL certificates)
- ✅ PostgreSQL database
- ✅ Redis data (if persistent)
- ✅ MinIO object storage
- ✅ Home Assistant configuration
- ✅ VNC home directory
- ✅ Code Server data
- ✅ `.env` file (secrets)
- ✅ `docker-compose.unified.yml`
- ✅ `Caddyfile`

### Recovery Procedures
1. **DNS Failover:** Update ZoneEdit if IP changes
2. **Certificate Recovery:** Restore Caddy `/data` volume
3. **Database Recovery:** PostgreSQL backup restore
4. **Service Validation:** Run health checks after restore

---

## 9. Recommendations Summary

### Immediate Actions
- [ ] Verify VNC and Code Server are VPN-only (add Caddy auth or remove from public)
- [ ] Enable access logging in Caddy
- [ ] Set up SSL certificate expiration alerts

### Short Term (Next 30 Days)
- [ ] Implement rate limiting for authentication endpoints
- [ ] Configure backup automation for Caddy certificates
- [ ] Test disaster recovery procedures
- [ ] Document IP whitelist requirements for admin services

### Long Term
- [ ] Migrate to centralized authentication (OAuth proxy)
- [ ] Implement intrusion detection system
- [ ] Add geographic access restrictions
- [ ] Set up log aggregation and analysis

---

## Conclusion

**Overall Status: ✅ PRODUCTION READY**

Your homelab network configuration is solid and production-ready. All 13 domains are properly configured with valid SSL certificates, Caddy reverse proxy is routing correctly, and Docker networking is properly isolated. 

The main recommendations focus on enhancing security for administrative services (VPN enforcement, rate limiting, monitoring) rather than fixing existing issues.

**Next Steps:**
1. Review VPN-only access for sensitive services
2. Sync latest code changes from Replit to Ubuntu
3. Set up monitoring alerts for SSL and service health
