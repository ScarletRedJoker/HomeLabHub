# HomeLabHub - Quick Start Guide

## 🚀 One-Command Deployment

The easiest way to deploy everything:

```bash
cd ~/contain/HomeLabHub
./homelab-manager.sh
# Press 1 for Auto-Deploy
```

**Or directly:**
```bash
cd ~/contain/HomeLabHub
./deployment/auto-deploy.sh
```

---

## What Auto-Deploy Does

The auto-deploy system validates, provisions, fixes, and deploys everything automatically:

### ✅ Phase 1: Pre-Flight Validation
- Checks Docker is running
- Validates Docker Compose is available
- Verifies `.env` file exists and has critical variables
- Ensures `docker-compose.unified.yml` exists

### ✅ Phase 2: Graceful Shutdown & Cleanup
- Stops existing services gracefully (60s timeout)
- Removes orphaned containers

### ✅ Phase 3: Service Startup
- Starts all services in dependency order
- Waits for initialization

### ✅ Phase 4: Database Auto-Healing
- Auto-detects PostgreSQL superuser (postgres or ticketbot)
- Creates `postgres` superuser if missing
- Auto-provisions databases: `ticketbot`, `streambot`, `homelab_jarvis`
- Fixes "role 'postgres' does not exist" errors

### ✅ Phase 5: VNC/Code-Server Auto-Fix
- Configures VNC password from `.env` file
- Uses correct `x11vnc` command (not vncpasswd)
- Sets proper permissions

### ✅ Phase 6: Service Health Verification
- Checks all critical services are running
- Reports container count
- Identifies any services that failed to start

### ✅ Phase 7: Database Migration Check
- Verifies Dashboard migrations are current
- Checks for migration errors

### ✅ Deployment Summary
- Shows all checks passed/failed
- Lists auto-fixes applied
- Provides service URLs
- Creates deployment log file

---

## Features

### 🔧 Comprehensive Error Checking
Every step validates success before proceeding. If something fails, you get:
- Clear error messages
- Troubleshooting tips
- Log file location

### 🩹 Auto-Healing
Common issues are fixed automatically:
- PostgreSQL user mismatches
- Missing databases
- VNC password configuration
- Permission issues

### 📊 Full Visibility
- Real-time progress updates
- Color-coded status (✓ green, ⚠ yellow, ✗ red)
- Detailed logs saved to file

### 🔄 Idempotent & Safe
- Safe to run multiple times
- Won't break existing data
- Graceful shutdown before startup

---

## Expected Output

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        🚀 AUTOMATED DEPLOYMENT WITH SELF-HEALING 🚀      ║
║                                                              ║
║  Validates → Provisions → Fixes → Deploys → Verifies        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 1: PRE-FLIGHT VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking Docker... ✓ OK
Checking Docker Compose... ✓ OK
Checking .env file... ✓ OK
Checking critical environment variables... ✓ OK
Checking docker-compose.unified.yml... ✓ OK

✓ All pre-flight checks passed (5/5)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 2: GRACEFUL SHUTDOWN & CLEANUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Stopping existing services gracefully (60s timeout)...
✓ Services stopped

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 3: SERVICE STARTUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Starting all services in dependency order...
✓ Services started

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 4: DATABASE AUTO-HEALING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking PostgreSQL container... ✓ Running

Auto-detecting PostgreSQL superuser...
✓ Found: postgres user

Provisioning databases...
  → ticketbot: exists
  → streambot: exists
  → homelab_jarvis: exists

✓ Database auto-healing complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 5: VNC/CODE-SERVER AUTO-FIX
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking VNC desktop... running
Configuring VNC password...
✓ VNC password configured

✓ VNC/Code-Server auto-fix complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  PHASE 6: SERVICE HEALTH VERIFICATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Checking critical services:
  → PostgreSQL Database: ✓ running
  → Redis Cache: ✓ running
  → MinIO Storage: ✓ running
  → Caddy Reverse Proxy: ✓ running
  → Dashboard: ✓ running
  → Stream Bot: ✓ running
  → Discord Bot: ✓ running

✓ All critical services running (7/7)

Total containers running: 15/15

✓ Health verification complete

╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║        ✅ DEPLOYMENT COMPLETE                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝

SUMMARY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pre-flight checks passed: 5
Auto-fixes applied: 1
Critical services running: 7/7
Total containers: 15/15

SERVICE URLS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Dashboard:  https://host.evindrake.net
  Stream Bot: https://stream.rig-city.com
  Discord:    https://bot.rig-city.com
  VNC:        https://vnc.evindrake.net
  n8n:        https://n8n.evindrake.net
  Plex:       https://plex.evindrake.net

LOG FILE: deployment-20251120-123456.log

✓ Deployment completed successfully!
```

---

## Troubleshooting

### If Auto-Deploy Fails

1. **Check the log file:**
   ```bash
   cat deployment-*.log | tail -50
   ```

2. **Verify Docker is running:**
   ```bash
   docker info
   ```

3. **Check .env file exists:**
   ```bash
   ls -la .env
   ```

4. **View service logs:**
   ```bash
   docker compose -f docker-compose.unified.yml logs [service-name]
   ```

5. **Run manual health check:**
   ```bash
   ./homelab-manager.sh
   # Select: 12) Health Check
   ```

### Common Issues

**"Docker is not running"**
- Start Docker: `sudo systemctl start docker`

**"Missing critical variables"**
- Generate .env: `./homelab-manager.sh` → Option 9

**"PostgreSQL user detection failed"**
- This is OK, deployment continues
- Fix manually: `./homelab-manager.sh` → Option 22b

**"VNC password configuration failed"**
- Non-critical, VNC may not require password
- Fix manually: See DEPLOYMENT_STATUS.md

---

## Manual Deployment (Alternative)

If you prefer step-by-step control:

```bash
./homelab-manager.sh

# Then select:
# 1a) Full Deploy - Build and start all services
# 22b) Fix PostgreSQL User - Fix user issues
# 12) Health Check - Verify everything is running
# 23) Run Full Deployment Verification - Complete check
```

---

## After Deployment

### Verify Everything Works

```bash
# Run full verification
./homelab-manager.sh → Option 23

# Check service URLs
./homelab-manager.sh → Option 16

# View logs
./homelab-manager.sh → Option 11
```

### Access Your Services

- **Dashboard:** https://host.evindrake.net
- **Stream Bot:** https://stream.rig-city.com
- **Discord Bot:** https://bot.rig-city.com
- **VNC Desktop:** https://vnc.evindrake.net
- **n8n:** https://n8n.evindrake.net
- **Plex:** https://plex.evindrake.net
- **Home Assistant:** https://home.evindrake.net

---

## Need Help?

See:
- `DEPLOYMENT_STATUS.md` - Current deployment state
- `deployment-*.log` - Deployment logs
- `homelab-manager.sh` → Option 13 - Full troubleshoot mode
