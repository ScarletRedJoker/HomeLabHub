# Ubuntu Deployment Fixes Guide

## 🔧 Complete Homelab System Fix Script

This guide explains the **complete-homelab-fix.sh** script that automatically resolves all common deployment issues on Ubuntu systems.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [What the Script Fixes](#what-the-script-fixes)
3. [Detailed Step-by-Step Explanation](#detailed-step-by-step-explanation)
4. [Quick Fix Commands](#quick-fix-commands)
5. [DNS Setup Instructions](#dns-setup-instructions)
6. [Troubleshooting](#troubleshooting)
7. [Manual Tasks](#manual-tasks)

---

## Quick Start

### One-Liner Installation and Execution

```bash
cd /home/evin/contain/HomeLabHub && chmod +x deployment/complete-homelab-fix.sh && ./deployment/complete-homelab-fix.sh
```

### Step-by-Step Execution

```bash
# Navigate to your homelab directory
cd /home/evin/contain/HomeLabHub

# Make the script executable
chmod +x deployment/complete-homelab-fix.sh

# Run the fix script
./deployment/complete-homelab-fix.sh
```

---

## What the Script Fixes

The script performs **10 comprehensive fixes** to resolve all deployment issues:

### ✅ Issue 1: Home Assistant Reverse Proxy
- **Problem**: 400 Bad Request errors due to missing trusted_proxies
- **Fix**: Creates proper configuration.yaml with reverse proxy settings
- **Result**: Home Assistant works correctly behind Caddy/Nginx

### ✅ Issue 2: Database Users
- **Problem**: Missing 'jarvis' database user and homelab_jarvis database
- **Fix**: Creates jarvis user with proper permissions and database
- **Result**: Dashboard can connect to database successfully

### ✅ Issue 3: Code-Server Permissions
- **Problem**: Permission errors preventing code-server from starting
- **Fix**: Sets proper ownership (1000:1000) on code-server volumes
- **Result**: Code-server starts without permission issues

### ✅ Issue 4: Environment Variables
- **Problem**: Missing or incomplete .env file
- **Fix**: Creates .env from template with all required variables
- **Result**: All services have necessary configuration

### ✅ Issue 5: Docker Compose Configuration
- **Problem**: Missing user settings, restart policies, network config
- **Fix**: Creates backup and provides manual fix instructions
- **Result**: Docker services configured properly

### ✅ Issue 6: Celery Worker Security
- **Problem**: Celery refuses to run as root
- **Fix**: Provides instructions to add user: "1000:1000" to service
- **Result**: Celery workers start without security warnings

### ✅ Issue 7: DNS Configuration
- **Problem**: Missing DNS records causing SSL failures
- **Fix**: Checks all domains and reports missing DNS records
- **Result**: You know exactly which DNS records to add

### ✅ Issue 8: Directory Structure
- **Problem**: Missing required directories
- **Fix**: Creates all necessary config and volume directories
- **Result**: Proper directory structure for all services

### ✅ Issue 9: File Permissions
- **Problem**: Scripts not executable, wrong volume permissions
- **Fix**: Makes all scripts executable, sets proper directory permissions
- **Result**: All scripts and volumes have correct permissions

### ✅ Issue 10: Diagnostic Report
- **Problem**: Hard to troubleshoot issues without system snapshot
- **Fix**: Generates comprehensive diagnostic report
- **Result**: Complete system status saved to timestamped log file

---

## Detailed Step-by-Step Explanation

### Step 1: Home Assistant Configuration

**What it does:**
```bash
mkdir -p ./config/homeassistant
cat > ./config/homeassistant/configuration.yaml << 'EOF'
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.23.0.0/16
    - 127.0.0.1
    - ::1
EOF
```

**Why it's needed:**
- Home Assistant needs to trust the reverse proxy (Caddy)
- Without this, you get "400 Bad Request" errors
- The 172.23.0.0/16 subnet is Docker's default network range

**Files created:**
- `config/homeassistant/configuration.yaml`
- `config/homeassistant/automations.yaml`
- `config/homeassistant/scenes.yaml`
- `config/homeassistant/scripts.yaml`

---

### Step 2: Database User Creation

**What it does:**
```sql
CREATE USER jarvis WITH PASSWORD 'jarvis_secure_password_2024';
CREATE DATABASE jarvis_db OWNER jarvis;
GRANT ALL PRIVILEGES ON DATABASE jarvis_db TO jarvis;
```

**Why it's needed:**
- Dashboard service requires 'jarvis' user to connect
- Missing user causes connection failures

**Manual alternative:**
```bash
docker exec -it discord-bot-db psql -U ticketbot -d postgres
CREATE USER jarvis WITH PASSWORD 'your_password';
CREATE DATABASE jarvis_db OWNER jarvis;
GRANT ALL PRIVILEGES ON DATABASE jarvis_db TO jarvis;
\q
```

---

### Step 3: Code-Server Permissions

**What it does:**
```bash
mkdir -p ./volumes/code-server/config
mkdir -p ./volumes/code-server/workspace
sudo chown -R 1000:1000 ./volumes/code-server
chmod -R 755 ./volumes/code-server
```

**Why it's needed:**
- Code-server runs as user 1000 (default container user)
- Wrong permissions prevent code-server from starting
- Files need to be readable/writable by this user

**Manual fix:**
```bash
sudo chown -R 1000:1000 ./volumes/code-server
```

---

### Step 4: Environment Variables

**What it does:**
- Creates .env file from template
- Adds missing DATABASE_URL for jarvis
- Generates random secrets for SESSION_SECRET and JWT_SECRET

**Required variables:**
```bash
DATABASE_URL=postgresql://jarvis:password@discord-bot-db:5432/jarvis_db
POSTGRES_USER=ticketbot
POSTGRES_PASSWORD=your_password
DISCORD_TOKEN=your_token
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
DOMAIN=your-domain.com
HOMEASSISTANT_TOKEN=your_ha_token
```

**Manual edit:**
```bash
nano .env
# Update all 'your_*' placeholders with real values
```

---

### Step 5: Docker Compose Fixes

**Required manual additions:**

Add to code-server service:
```yaml
code-server:
  user: "1000:1000"
  restart: unless-stopped
```

Add to homelab-celery-worker:
```yaml
homelab-celery-worker:
  user: "1000:1000"
  restart: unless-stopped
```

Verify network configuration:
```yaml
networks:
  homelab_network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.23.0.0/16
```

---

### Step 6: Celery Worker Security

**Problem:**
```
Running a worker with superuser privileges is a security concern
```

**Solution:**
Add to docker-compose.unified.yml:
```yaml
homelab-celery-worker:
  user: "1000:1000"
```

**Alternative (not recommended):**
```yaml
homelab-celery-worker:
  environment:
    - C_FORCE_ROOT=true
```

---

### Step 7: DNS Configuration Check

**Domains checked:**
- host.evindrake.net
- code.evindrake.net
- home.evindrake.net
- n8n.evindrake.net
- plex.evindrake.net
- rig-city.com
- www.rig-city.com
- scarletredjoker.com

**What to do if DNS fails:**
See [DNS Setup Instructions](#dns-setup-instructions) below.

---

### Step 8: Directory Structure

**Created directories:**
```
config/homeassistant
config/caddy
config/n8n
volumes/code-server/config
volumes/code-server/workspace
volumes/plex/config
volumes/plex/data
volumes/postgres/data
logs/
deployment/
```

---

### Step 9: File Permissions

**What it does:**
```bash
find deployment -type f -name "*.sh" -exec chmod +x {} \;
chmod +x manage-homelab.sh
chmod -R 755 volumes/
chmod -R 755 config/
```

**Why it's needed:**
- Scripts need execute permission to run
- Volumes need proper read/write permissions
- Config files need to be readable

---

### Step 10: Diagnostic Report

**Generated report includes:**
- Docker version and status
- Running containers with ports
- Last 20 lines of container logs
- Disk usage statistics
- Network configuration
- Sanitized environment variables

**Report location:**
```
homelab-diagnostic-YYYYMMDD-HHMMSS.log
```

---

## Quick Fix Commands

### Immediate Home Assistant Fix
```bash
mkdir -p config/homeassistant
cat > config/homeassistant/configuration.yaml << 'EOF'
default_config:
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.23.0.0/16
    - 127.0.0.1
    - ::1
EOF
docker compose -f docker-compose.unified.yml restart homeassistant
```

### Immediate Database User Fix
```bash
docker exec discord-bot-db psql -U ticketbot -d postgres -c "
CREATE USER jarvis WITH PASSWORD 'jarvis_secure_password_2024';
CREATE DATABASE jarvis_db OWNER jarvis;
GRANT ALL PRIVILEGES ON DATABASE jarvis_db TO jarvis;
ALTER USER jarvis WITH SUPERUSER;"
```

### Immediate Code-Server Fix
```bash
sudo chown -R 1000:1000 volumes/code-server
docker compose -f docker-compose.unified.yml restart code-server
```

### Restart All Services
```bash
docker compose -f docker-compose.unified.yml down
docker compose -f docker-compose.unified.yml up -d --build
```

### View All Logs
```bash
docker compose -f docker-compose.unified.yml logs -f
```

---

## DNS Setup Instructions

### Required DNS Records

For **evindrake.net** domain:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | host | YOUR_SERVER_IP | 300 |
| A | code | YOUR_SERVER_IP | 300 |
| A | home | YOUR_SERVER_IP | 300 |
| A | n8n | YOUR_SERVER_IP | 300 |
| A | plex | YOUR_SERVER_IP | 300 |

For **rig-city.com** domain:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_SERVER_IP | 300 |
| A | www | YOUR_SERVER_IP | 300 |

For **scarletredjoker.com** domain:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_SERVER_IP | 300 |

### DNS Provider Instructions

#### Cloudflare
1. Log into Cloudflare dashboard
2. Select your domain
3. Click "DNS" tab
4. Click "Add record"
5. Select "A" record type
6. Enter name (e.g., "host")
7. Enter your server's public IP
8. Set TTL to Auto
9. Click "Save"

#### Namecheap
1. Log into Namecheap
2. Go to Domain List
3. Click "Manage" next to your domain
4. Click "Advanced DNS"
5. Click "Add New Record"
6. Select "A Record"
7. Enter Host (e.g., "host")
8. Enter your server's public IP
9. Set TTL to 5 min
10. Click checkmark to save

#### Google Domains
1. Log into Google Domains
2. Select your domain
3. Click "DNS" in left menu
4. Scroll to "Custom resource records"
5. Enter subdomain name
6. Select "A" type
7. Enter your server IP
8. Click "Add"

### Verify DNS Propagation

```bash
# Check if DNS is working
host host.evindrake.net

# Check from external resolver
nslookup host.evindrake.net 8.8.8.8

# Detailed DNS check
dig host.evindrake.net
```

**Note:** DNS changes can take 5 minutes to 48 hours to propagate globally. Most changes propagate within 15-30 minutes.

---

## Troubleshooting

### Issue: Script says "Permission denied"

**Solution:**
```bash
chmod +x deployment/complete-homelab-fix.sh
```

### Issue: "docker: command not found"

**Solution:**
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### Issue: "docker exec discord-bot-db" fails

**Solution:**
```bash
# Start PostgreSQL container first
docker compose -f docker-compose.unified.yml up -d discord-bot-db
sleep 10
# Then run the script again
```

### Issue: Home Assistant still shows 400 error

**Solution:**
```bash
# Verify configuration.yaml exists
cat config/homeassistant/configuration.yaml

# Restart Home Assistant
docker compose -f docker-compose.unified.yml restart homeassistant

# Check logs
docker logs homeassistant
```

### Issue: Code-server won't start after permission fix

**Solution:**
```bash
# Check ownership
ls -la volumes/code-server

# Reset permissions completely
sudo chown -R 1000:1000 volumes/code-server
chmod -R 755 volumes/code-server

# Restart service
docker compose -f docker-compose.unified.yml restart code-server
```

### Issue: DNS check shows all domains failing

**Solution:**
1. Verify you have internet connection: `ping 8.8.8.8`
2. Check if `host` command is installed: `which host`
3. Install dnsutils if missing: `sudo apt install dnsutils`
4. Verify DNS records in your domain registrar
5. Wait 15-30 minutes for DNS propagation

### Issue: Services won't start after running script

**Solution:**
```bash
# Check .env file exists and has correct values
cat .env | grep -v "PASSWORD\|SECRET\|TOKEN"

# Verify docker-compose syntax
docker compose -f docker-compose.unified.yml config

# Check for port conflicts
sudo netstat -tulpn | grep LISTEN

# View specific service logs
docker compose -f docker-compose.unified.yml logs homeassistant
```

---

## Manual Tasks

After running the script, you **must** complete these manual tasks:

### 1. Edit .env File

```bash
nano .env
```

Update these values:
- `POSTGRES_PASSWORD` - Choose a strong password
- `DISCORD_TOKEN` - From Discord Developer Portal
- `DISCORD_CLIENT_ID` - From Discord Developer Portal
- `DISCORD_CLIENT_SECRET` - From Discord Developer Portal
- `TWITCH_CLIENT_ID` - From Twitch Developer Console
- `TWITCH_CLIENT_SECRET` - From Twitch Developer Console
- `HOMEASSISTANT_TOKEN` - From Home Assistant Profile → Long-Lived Access Tokens

### 2. Update Docker Compose

Edit `docker-compose.unified.yml`:

```yaml
# Add to code-server service
code-server:
  user: "1000:1000"
  restart: unless-stopped

# Add to homelab-celery-worker service
homelab-celery-worker:
  user: "1000:1000"
  restart: unless-stopped
```

### 3. Add DNS Records

Follow the [DNS Setup Instructions](#dns-setup-instructions) to add all required DNS records.

### 4. Restart Services

```bash
docker compose -f docker-compose.unified.yml down
docker compose -f docker-compose.unified.yml up -d --build
```

### 5. Verify Everything Works

```bash
# Check all services are running
docker compose -f docker-compose.unified.yml ps

# Check logs for errors
docker compose -f docker-compose.unified.yml logs --tail=50

# Test DNS resolution
for domain in host.evindrake.net code.evindrake.net home.evindrake.net; do
  echo "Testing $domain..."
  host $domain
done
```

---

## Post-Fix Verification Checklist

- [ ] All containers are running: `docker compose ps`
- [ ] No errors in logs: `docker compose logs --tail=100`
- [ ] Home Assistant accessible at https://home.evindrake.net
- [ ] Dashboard accessible at https://host.evindrake.net
- [ ] Code-server accessible at https://code.evindrake.net
- [ ] Database users exist: `docker exec discord-bot-db psql -U ticketbot -c "\du"`
- [ ] All DNS records resolving: `host host.evindrake.net`
- [ ] SSL certificates auto-renewing (check Caddy logs)
- [ ] .env file has real credentials (not placeholders)

---

## Support

If you encounter issues not covered in this guide:

1. Check the diagnostic report: `cat homelab-diagnostic-*.log`
2. Review specific service logs: `docker logs <service-name>`
3. Verify DNS with: `dig host.evindrake.net`
4. Check docker network: `docker network inspect homelab_network`
5. Consult the main documentation: `BACKUP_RESTORE_GUIDE.md`, `docs/DEPLOYMENT_GUIDE.md`

---

## Summary

This script is designed to be **monkey-proof** - it handles all common deployment issues automatically. After running it:

1. ✅ Home Assistant works behind reverse proxy
2. ✅ Database users are created
3. ✅ Code-server has correct permissions
4. ✅ Environment variables are set
5. ✅ Directory structure is created
6. ✅ File permissions are correct
7. ✅ DNS issues are identified
8. ✅ Diagnostic report is generated

**Just run it, follow the manual tasks, and you're deployed!**
