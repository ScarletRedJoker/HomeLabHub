# Home Assistant Setup Guide

> **Last Updated:** November 15, 2025  
> **Status:** Production Ready  
> **Integration:** Jarvis Homelab Dashboard

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Architecture](#architecture)
4. [Bootstrap Process](#bootstrap-process)
5. [Configuration](#configuration)
6. [Troubleshooting](#troubleshooting)
7. [Integration with Jarvis](#integration-with-jarvis)
8. [Advanced Configuration](#advanced-configuration)
9. [Maintenance](#maintenance)
10. [Security](#security)

---

## Overview

Home Assistant is integrated into the Jarvis Homelab infrastructure with **zero-touch provisioning**. The automated bootstrap script handles all configuration, secret management, and reverse proxy setup.

### Key Features

✅ **Automated Configuration** - Bootstrap script handles all setup  
✅ **Reverse Proxy Ready** - Pre-configured for Caddy with proper headers  
✅ **Jarvis Integration** - Health monitoring and autonomous diagnostics  
✅ **Secure by Default** - Proper permissions, trusted proxies, secret management  
✅ **Idempotent Setup** - Safe to run bootstrap multiple times  
✅ **Docker Network Auto-Detection** - Automatically detects and configures trusted proxies  

### URLs

- **Production:** https://home.evindrake.net
- **Internal:** http://homeassistant:8123 (within Docker network)
- **Local Port:** http://localhost:8123 (mapped host port)

---

## Quick Start

### First-Time Setup

```bash
# 1. Navigate to project directory
cd /path/to/HomeLabHub

# 2. Run bootstrap script (creates configs, secrets, directories)
./scripts/bootstrap-homeassistant.sh

# 3. Deploy Home Assistant
docker-compose -f docker-compose.unified.yml up -d homeassistant

# 4. Access the web interface
open https://home.evindrake.net

# 5. Complete the onboarding wizard (first-time only)
# - Create admin account
# - Set location
# - Configure integrations
```

### Using Homelab Manager

```bash
# Interactive deployment with all services
./homelab-manager.sh

# Select option 1: Full Deploy (includes automatic bootstrap)
# Or option 27: Bootstrap Home Assistant (manual bootstrap)
```

---

## Architecture

### Directory Structure

```
HomeLabHub/
├── volumes/
│   └── homeassistant/          # Persistent configuration (auto-created)
│       ├── configuration.yaml  # Main config (auto-generated)
│       ├── secrets.yaml        # API keys, tokens (auto-generated, gitignored)
│       ├── automations.yaml    # Automation rules
│       ├── scripts.yaml        # Scripts
│       ├── scenes.yaml         # Scenes
│       ├── .gitignore          # Protects secrets
│       ├── custom_components/  # Custom integrations
│       ├── themes/             # UI themes
│       ├── www/                # Static files
│       └── blueprints/         # Automation blueprints
├── scripts/
│   └── bootstrap-homeassistant.sh  # Bootstrap script
├── docker-compose.unified.yml      # Container definition
└── Caddyfile                       # Reverse proxy config
```

### Container Configuration

- **Image:** `ghcr.io/home-assistant/home-assistant:stable`
- **Container Name:** `homeassistant`
- **User:** `1000:1000` (matches host user)
- **Network:** `homelab` (shared with dashboard)
- **Volumes:**
  - `./volumes/homeassistant:/config` - Persistent configuration
  - `./scripts/bootstrap-homeassistant.sh:/scripts/bootstrap-homeassistant.sh:ro` - Bootstrap script
  - `/run/dbus:/run/dbus:ro` - D-Bus for system integration

### Network Configuration

```yaml
Environment Variables:
  - TZ=America/New_York
  - HOMEASSISTANT_EXTERNAL_URL=https://home.evindrake.net
  - HOMEASSISTANT_INTERNAL_URL=http://homeassistant:8123
  - JARVIS_DASHBOARD_URL=http://homelab-dashboard:5000
  - JARVIS_API_KEY=${HOME_ASSISTANT_API_KEY}

Ports:
  - 8123:8123 (HTTP API & Web UI)

Health Check:
  - Endpoint: http://localhost:8123/api/
  - Interval: 30s
  - Timeout: 10s
  - Start Period: 90s
```

---

## Bootstrap Process

The `bootstrap-homeassistant.sh` script performs the following automated setup:

### 1. Docker Network Detection

```bash
# Automatically detects Docker network CIDR
# Falls back to default ranges if network not found
CIDR=$(docker network inspect homelab -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}')
```

### 2. Directory Structure Creation

Creates all required directories:
- `/config/custom_components`
- `/config/themes`
- `/config/www`
- `/config/blueprints/automation`
- `/config/blueprints/script`
- `/config/tts`
- `/config/deps`

### 3. Configuration Generation

Generates `configuration.yaml` with:

```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - <detected_docker_cidr>
    - 172.16.0.0/12
    - 192.168.0.0/16
    - 10.0.0.0/8
  ip_ban_enabled: false
  login_attempts_threshold: 10

recorder:
  purge_keep_days: 7
  commit_interval: 1

# Jarvis integration endpoints
rest_command:
  jarvis_health_check: ...
  jarvis_deploy_request: ...

sensor:
  - platform: rest
    name: "Jarvis Homelab Status"
    resource: "http://homelab-dashboard:5000/api/jarvis/status"
```

### 4. Secrets Provisioning

Generates `secrets.yaml` with:

```yaml
jarvis_api_key: <auto-generated-64-char-key>
db_url: sqlite:////config/home-assistant_v2.db
home_latitude: 0.0
home_longitude: 0.0
time_zone: America/New_York
```

**⚠️ Important:** Update latitude, longitude, and elevation after first run!

### 5. Permission Setting

- **Ownership:** `1000:1000` (matches container user)
- **Directories:** `755` (drwxr-xr-x)
- **Files:** `644` (-rw-r--r--)
- **Secrets:** `600` (-rw-------)

### 6. Jarvis Registration

Attempts to register with Jarvis dashboard for health monitoring:

```json
{
  "service": "homeassistant",
  "url": "http://homeassistant:8123",
  "health_endpoint": "/api/",
  "description": "Smart Home Automation Hub"
}
```

### Running Bootstrap Manually

```bash
# From project root
./scripts/bootstrap-homeassistant.sh

# With sudo for permission setting
sudo ./scripts/bootstrap-homeassistant.sh

# From homelab manager (option 27)
./homelab-manager.sh
# Select: 27) Bootstrap Home Assistant
```

---

## Configuration

### Reverse Proxy (Caddy)

The Caddyfile is pre-configured with all required headers:

```caddy
home.evindrake.net {
    reverse_proxy homeassistant:8123 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
        
        # WebSocket support (required for real-time updates)
        header_up Upgrade {>Upgrade}
        header_up Connection {>Connection}
    }
}
```

### Trusted Proxies

Home Assistant is configured to trust the following CIDR ranges:

- **Detected Docker Network** (auto-detected by bootstrap script)
- `172.16.0.0/12` (Docker default range)
- `192.168.0.0/16` (Private network range)
- `10.0.0.0/8` (Private network range)

This ensures the `X-Forwarded-For` header is properly processed.

### Environment Variables

Set in `.env` file (auto-generated by bootstrap):

```bash
# Home Assistant Jarvis API Key
HOME_ASSISTANT_API_KEY=<auto-generated-key>
```

This key is used for:
- Dashboard → Home Assistant API calls
- Health check authentication
- REST command integration

---

## Troubleshooting

### 400 Bad Request Error

**Symptom:** Accessing https://home.evindrake.net shows "400: Bad Request"

**Causes & Solutions:**

1. **Trusted Proxies Not Configured**
   ```bash
   # Re-run bootstrap to regenerate config with correct CIDR
   ./scripts/bootstrap-homeassistant.sh
   
   # Restart Home Assistant
   docker restart homeassistant
   ```

2. **Missing Reverse Proxy Headers**
   ```bash
   # Verify Caddyfile has correct headers
   grep -A 10 "home.evindrake.net" Caddyfile
   
   # Restart Caddy
   docker restart caddy
   ```

3. **Docker Network Not Detected**
   ```bash
   # Check if homelab network exists
   docker network inspect homelab
   
   # Recreate network if needed
   docker-compose -f docker-compose.unified.yml down
   docker-compose -f docker-compose.unified.yml up -d
   ```

### Logs and Diagnostics

```bash
# View Home Assistant logs
docker logs homeassistant

# Follow logs in real-time
docker logs -f homeassistant

# Check configuration validity
docker exec homeassistant hass --script check_config

# View last 100 lines
docker logs homeassistant --tail 100

# Check health status
docker inspect homeassistant | grep -A 10 Health
```

### Configuration File Errors

```bash
# Check configuration syntax
docker exec homeassistant hass --script check_config -c /config

# View full configuration (resolves includes)
docker exec homeassistant hass --script check_config -c /config --files

# Validate specific file
docker exec homeassistant python3 -m yaml /config/configuration.yaml
```

### Permission Issues

```bash
# Check file ownership
ls -la volumes/homeassistant/

# Fix permissions (run from project root)
sudo chown -R 1000:1000 volumes/homeassistant/
sudo find volumes/homeassistant/ -type d -exec chmod 755 {} \;
sudo find volumes/homeassistant/ -type f -exec chmod 644 {} \;
sudo chmod 600 volumes/homeassistant/secrets.yaml

# Re-run bootstrap to fix all permissions
sudo ./scripts/bootstrap-homeassistant.sh
```

### Container Won't Start

```bash
# Check container status
docker ps -a | grep homeassistant

# View startup errors
docker logs homeassistant

# Restart with fresh logs
docker restart homeassistant && docker logs -f homeassistant

# Full rebuild
docker-compose -f docker-compose.unified.yml up -d --force-recreate homeassistant
```

### Network Connectivity Issues

```bash
# Test internal connectivity
docker exec homeassistant ping -c 3 homelab-dashboard

# Test external connectivity
docker exec homeassistant ping -c 3 8.8.8.8

# Check DNS resolution
docker exec homeassistant nslookup homelab-dashboard

# Verify network configuration
docker network inspect homelab | grep -A 20 homeassistant
```

---

## Integration with Jarvis

### Health Monitoring

Jarvis Dashboard monitors Home Assistant health via:

- **Health Endpoint:** `http://homeassistant:8123/api/`
- **Check Interval:** 60 seconds
- **Metrics Tracked:**
  - Container status
  - API availability
  - Response time
  - Error rates

### REST Commands

Home Assistant can trigger Jarvis actions via REST commands:

```yaml
# Example: Trigger deployment via voice command in Home Assistant
automation:
  - alias: "Deploy website on command"
    trigger:
      - platform: event
        event_type: call_service
        event_data:
          domain: rest_command
          service: jarvis_deploy_request
    action:
      - service: rest_command.jarvis_deploy_request
        data:
          command: "deploy_website"
          params:
            website: "example.com"
```

### Sensor Integration

Monitor Jarvis status from Home Assistant:

```yaml
# Automatically configured by bootstrap
sensor:
  - platform: rest
    name: "Jarvis Homelab Status"
    resource: "http://homelab-dashboard:5000/api/jarvis/status"
    scan_interval: 60
    headers:
      X-API-Key: "!secret jarvis_api_key"
```

Access in automations:

```yaml
automation:
  - alias: "Alert on failed deployment"
    trigger:
      - platform: state
        entity_id: sensor.jarvis_homelab_status
        to: "error"
    action:
      - service: notify.mobile_app
        data:
          message: "Jarvis deployment failed!"
```

---

## Advanced Configuration

### Custom Integrations

Install custom integrations in `volumes/homeassistant/custom_components/`:

```bash
# Example: HACS (Home Assistant Community Store)
cd volumes/homeassistant/
git clone https://github.com/hacs/integration.git custom_components/hacs

# Restart Home Assistant
docker restart homeassistant
```

### Themes

Add custom themes in `volumes/homeassistant/themes/`:

```yaml
# volumes/homeassistant/themes/custom.yaml
custom_theme:
  primary-color: "#5294E2"
  accent-color: "#E45E65"
  dark-primary-color: "#2E3440"
```

Enable in configuration:

```yaml
frontend:
  themes: !include_dir_merge_named themes
```

### External Database

Switch from SQLite to PostgreSQL:

1. Update `secrets.yaml`:
   ```yaml
   db_url: postgresql://homeassistant:password@discord-bot-db:5432/homeassistant
   ```

2. Create database:
   ```bash
   docker exec discord-bot-db psql -U postgres -c "CREATE DATABASE homeassistant;"
   docker exec discord-bot-db psql -U postgres -c "CREATE USER homeassistant WITH PASSWORD 'password';"
   docker exec discord-bot-db psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE homeassistant TO homeassistant;"
   ```

3. Restart Home Assistant to migrate data

### Backups

```bash
# Create backup
tar -czf homeassistant-backup-$(date +%Y%m%d).tar.gz volumes/homeassistant/

# Restore backup
tar -xzf homeassistant-backup-20251115.tar.gz

# Automated backup (add to cron)
0 2 * * * cd /path/to/HomeLabHub && tar -czf backups/ha-$(date +\%Y\%m\%d).tar.gz volumes/homeassistant/
```

---

## Maintenance

### Updates

```bash
# Update to latest stable version
docker-compose -f docker-compose.unified.yml pull homeassistant
docker-compose -f docker-compose.unified.yml up -d homeassistant

# Or use homelab manager
./homelab-manager.sh
# Select: 16) Update Service → homeassistant
```

### Database Maintenance

```bash
# Purge old data (keeps last 7 days by default)
docker exec homeassistant hass --script purge_db

# Repack database (reduces size)
docker exec homeassistant sqlite3 /config/home-assistant_v2.db "VACUUM;"

# Check database size
docker exec homeassistant du -sh /config/home-assistant_v2.db
```

### Log Rotation

Home Assistant automatically rotates logs, but you can manage them:

```bash
# View log location
docker exec homeassistant ls -lh /config/home-assistant.log*

# Clear old logs
docker exec homeassistant rm /config/home-assistant.log.*

# Restart to create fresh log
docker restart homeassistant
```

---

## Security

### Best Practices

✅ **Secrets Management**
- Never commit `secrets.yaml` to version control
- Rotate API keys regularly
- Use strong passwords

✅ **Network Security**
- Home Assistant only accessible via HTTPS (Caddy)
- Internal Docker network isolation
- Trusted proxy configuration prevents IP spoofing

✅ **File Permissions**
- `secrets.yaml`: 600 (owner read/write only)
- Config files: 644 (owner read/write, others read)
- Directories: 755 (standard directory permissions)

✅ **Container Security**
- Runs as non-root user (1000:1000)
- Privileged mode required for hardware access only
- Read-only mounts where possible

### API Key Rotation

```bash
# 1. Generate new API key
NEW_KEY=$(openssl rand -base64 48)

# 2. Update secrets.yaml
sed -i "s/jarvis_api_key:.*/jarvis_api_key: $NEW_KEY/" volumes/homeassistant/secrets.yaml

# 3. Update .env
sed -i "s/HOME_ASSISTANT_API_KEY=.*/HOME_ASSISTANT_API_KEY=$NEW_KEY/" .env

# 4. Restart services
docker restart homeassistant homelab-dashboard
```

### Firewall Rules

```bash
# Allow only from Caddy (if using host firewall)
sudo ufw allow from 172.16.0.0/12 to any port 8123
sudo ufw deny 8123

# Or block external access entirely
sudo ufw deny from any to any port 8123
```

---

## Additional Resources

- [Home Assistant Documentation](https://www.home-assistant.io/docs/)
- [Home Assistant Community](https://community.home-assistant.io/)
- [Jarvis Dashboard Documentation](../README.md)
- [Deployment Guide](DEPLOYMENT_GUIDE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)

---

## Support

For issues specific to Jarvis Homelab integration:

1. Check logs: `docker logs homeassistant`
2. Re-run bootstrap: `./scripts/bootstrap-homeassistant.sh`
3. Verify Caddy config: `docker logs caddy`
4. Test health endpoint: `curl http://localhost:8123/api/`
5. Check Jarvis dashboard: https://host.evindrake.net

For Home Assistant issues:
- [Home Assistant Discord](https://discord.gg/home-assistant)
- [Community Forums](https://community.home-assistant.io/)
- [GitHub Issues](https://github.com/home-assistant/core/issues)

---

**Last Updated:** 2025-11-15  
**Maintainer:** Jarvis Homelab Team  
**Version:** 1.0.0
