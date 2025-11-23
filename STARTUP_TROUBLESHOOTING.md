# Dashboard Startup Troubleshooting Guide

## Issue: Bootstrap Fails with "HTTP 000000"

### Root Cause
The dashboard container is **immediately exiting on startup** because critical environment variables are missing or contain placeholder values in your `.env` file.

### Symptoms
```
[8/8] Validating Service Functionality
  Testing Dashboard... ✗ (HTTP 000000)
⚠️  DEPLOYMENT FAILED - INITIATING ROLLBACK
```

When you run `./homelab logs`, no logs appear because the dashboard crashed before it could output anything.

---

## Quick Fix (Automated)

Run the automated fix script on your Ubuntu server:

```bash
cd /home/evin/contain/HomeLabHub

# 1. Run the diagnostic to see what's missing
./diagnose-startup.sh

# 2. Auto-fix missing environment variables
./quick-fix-env.sh

# 3. Bootstrap again
./bootstrap-homelab.sh
```

---

## Manual Fix

If you prefer to fix manually:

### Step 1: Check Environment Variables

```bash
cd /home/evin/contain/HomeLabHub

# Check critical variables
grep -E "^(WEB_USERNAME|WEB_PASSWORD|SESSION_SECRET|DASHBOARD_API_KEY)=" .env
```

### Step 2: Generate Missing Secrets

```bash
# Generate all required secrets
SESSION_SECRET=$(openssl rand -hex 32)
DASHBOARD_API_KEY=$(openssl rand -hex 32)
SECRET_KEY=$(openssl rand -hex 32)

echo "SESSION_SECRET=$SESSION_SECRET"
echo "DASHBOARD_API_KEY=$DASHBOARD_API_KEY"
echo "SECRET_KEY=$SECRET_KEY"
```

### Step 3: Update .env File

Edit your `.env` file:

```bash
nano .env
```

Update these critical variables (replace YOUR_* placeholders):

```bash
# Core Authentication
WEB_USERNAME=admin
WEB_PASSWORD=Brs=2729    # Your actual password
SESSION_SECRET=<generated_secret_from_step_2>
DASHBOARD_API_KEY=<generated_secret_from_step_2>
SECRET_KEY=<generated_secret_from_step_2>

# Database Passwords (generate with: openssl rand -base64 24)
POSTGRES_PASSWORD=<your_postgres_password>
DISCORD_DB_PASSWORD=<your_discord_db_password>
STREAMBOT_DB_PASSWORD=<your_streambot_db_password>
JARVIS_DB_PASSWORD=<your_jarvis_db_password>
```

### Step 4: Update Database URLs

**IMPORTANT:** After changing database passwords, update the connection strings in `.env`:

```bash
DISCORD_DATABASE_URL=postgresql://ticketbot:YOUR_ACTUAL_DISCORD_PASSWORD@homelab-postgres:5432/ticketbot
STREAMBOT_DATABASE_URL=postgresql://streambot:YOUR_ACTUAL_STREAMBOT_PASSWORD@homelab-postgres:5432/streambot
JARVIS_DATABASE_URL=postgresql://jarvis:YOUR_ACTUAL_JARVIS_PASSWORD@homelab-postgres:5432/homelab_jarvis
```

Replace `YOUR_ACTUAL_*_PASSWORD` with the actual passwords you set above.

### Step 5: Bootstrap Again

```bash
./bootstrap-homelab.sh
```

---

## Required Environment Variables

The dashboard will **immediately exit** if any of these are missing:

### Critical (App Won't Start)
- ✅ `WEB_USERNAME` - Dashboard login username
- ✅ `WEB_PASSWORD` - Dashboard login password
- ✅ `SESSION_SECRET` - Flask session encryption key
- ✅ `DASHBOARD_API_KEY` - API authentication key
- ✅ `POSTGRES_PASSWORD` - PostgreSQL root password

### Database Passwords
- ✅ `DISCORD_DB_PASSWORD` - Discord bot database password
- ✅ `STREAMBOT_DB_PASSWORD` - Stream bot database password
- ✅ `JARVIS_DB_PASSWORD` - Dashboard database password

### Optional (Features Won't Work)
- ⚠️ `OPENAI_API_KEY` - Required for AI features (Jarvis, Agent Swarm)
- ⚠️ `TWITCH_CLIENT_ID` - Required for Twitch integration
- ⚠️ `YOUTUBE_CLIENT_ID` - Required for YouTube integration

---

## Debugging Dashboard Startup

### Check Dashboard Logs

```bash
# If container exists but crashed
docker logs homelab-dashboard

# If container is restarting
docker logs -f homelab-dashboard
```

### Common Error Messages

#### "CRITICAL: Missing required environment variables!"
```
CRITICAL: Missing required environment variables!
Missing: WEB_USERNAME, WEB_PASSWORD
```
**Solution:** Follow the Quick Fix or Manual Fix above.

#### "Target database is not up to date"
```
Target database is not up to date
```
**Solution:** Migrations failed. Check PostgreSQL:
```bash
docker logs homelab-postgres
docker exec homelab-postgres pg_isready -U postgres
```

#### "Connection refused" or "HTTP 000000"
**Cause:** Dashboard container isn't running.

**Check:**
```bash
docker ps | grep homelab-dashboard
```

**Solution:** Start the dashboard:
```bash
docker compose up -d homelab-dashboard
docker logs -f homelab-dashboard
```

---

## Validation Checklist

Before running `./bootstrap-homelab.sh`, ensure:

- [ ] `.env` file exists (copy from `.env.example` if missing)
- [ ] `WEB_USERNAME` and `WEB_PASSWORD` are set
- [ ] `SESSION_SECRET` is a 64-character hex string (not "YOUR_*")
- [ ] `DASHBOARD_API_KEY` is a 64-character hex string (not "YOUR_*")
- [ ] All database passwords are set (not "YOUR_*")
- [ ] Database URLs contain actual passwords (not "PASSWORD_HERE")
- [ ] PostgreSQL is healthy: `docker exec homelab-postgres pg_isready`
- [ ] Redis is healthy: `docker exec homelab-redis redis-cli ping`

---

## Emergency Recovery

If bootstrap keeps failing:

### 1. Stop All Containers
```bash
docker compose down
```

### 2. Clean Up
```bash
# Remove orphaned containers
docker container prune -f

# Remove unused networks
docker network prune -f
```

### 3. Validate Environment
```bash
./diagnose-startup.sh
```

### 4. Fix Any Issues
```bash
./quick-fix-env.sh
```

### 5. Fresh Bootstrap
```bash
./bootstrap-homelab.sh
```

---

## Getting Help

If you're still having issues:

1. **Run diagnostics:**
   ```bash
   ./diagnose-startup.sh > diagnostics.txt
   docker logs homelab-dashboard >> diagnostics.txt 2>&1
   docker logs homelab-postgres >> diagnostics.txt 2>&1
   ```

2. **Check the diagnostics output** for specific error messages

3. **Common fixes:**
   - Missing `.env` → Run `./quick-fix-env.sh`
   - PostgreSQL won't start → Check disk space: `df -h`
   - Port conflicts → Check: `sudo netstat -tulpn | grep -E ':(8080|5432|6379)'`

---

## Success Indicators

A successful bootstrap looks like this:

```
[8/8] Validating Service Functionality
  Testing Dashboard... ✓ (HTTP 200)
  Testing PostgreSQL... ✓
  Testing Redis... ✓

════════════════════════════════════════════════════════════════
  ✅ DEPLOYMENT SUCCESSFUL
════════════════════════════════════════════════════════════════

Dashboard: http://host.evindrake.net:8080
```
