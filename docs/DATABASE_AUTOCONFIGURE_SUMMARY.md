# Database Autoconfiguration System

## Overview

The unified deployment system now includes **automatic database management** for both Discord Bot and Stream Bot services.

## What Was Fixed

### 1. Multi-Database PostgreSQL Initialization
- Created `config/postgres-init/01-init-databases.sh`
- Automatically creates both `ticketbot` and `streambot` databases
- Creates separate users with proper permissions
- Runs automatically on first PostgreSQL container startup

### 2. Docker Compose Configuration
**Changes to `docker-compose.unified.yml`:**
- Added init script mount: `./config/postgres-init:/docker-entrypoint-initdb.d:ro`
- Pass both `DISCORD_DB_PASSWORD` and `STREAMBOT_DB_PASSWORD` to PostgreSQL
- Updated healthcheck to verify both databases
- Fixed Stream Bot to use proper database URL format
- Added healthcheck for Stream Bot container
- Added DNS configuration for both bot containers

### 3. Environment Variable Management
**Changes to `generate-unified-env.sh`:**
- Changed from `STREAMBOT_DATABASE_URL` (embedded password) to `STREAMBOT_DB_PASSWORD` (separate variable)
- Uses `get_or_generate()` for idempotent password handling
- Preserves existing passwords when re-running the script

### 4. Caddy Reverse Proxy Fix
**Changes to `Caddyfile`:**
- Fixed VNC desktop port from 6080 to 80 (correct port for the container)

### 5. Database Migration Tool
**New script: `migrate-database.sh`:**
- Check database status
- Reset all databases
- Reset individual databases
- User-friendly interactive menu

## How It Works

1. **First Deployment:**
   - PostgreSQL container starts
   - Init script creates both databases and users
   - Discord Bot and Stream Bot connect to their respective databases

2. **Subsequent Deployments:**
   - Existing database volume is preserved
   - Init script is skipped (data persists)
   - Same credentials work automatically

3. **Database Reset (if needed):**
   - Run `./migrate-database.sh`
   - Select reset option
   - Fresh databases created automatically

## Key Benefits

✅ **No manual database setup required**
✅ **Idempotent environment generation** - safe to re-run
✅ **Separate databases** - Discord Bot and Stream Bot don't interfere
✅ **Automatic user/permission management**
✅ **Easy database reset** - via migration tool

## Files Changed

1. `config/postgres-init/01-init-databases.sh` (NEW)
2. `docker-compose.unified.yml` (UPDATED)
3. `generate-unified-env.sh` (UPDATED)
4. `Caddyfile` (UPDATED)
5. `migrate-database.sh` (NEW)
6. `ENV_QUICK_GUIDE.md` (UPDATED)

## Migration from Old System

**IMPORTANT**: If you have an existing deployment, the PostgreSQL init scripts only run on first database creation. For existing volumes, you must manually create the streambot database.

### For Existing Deployments (MOST USERS)

Run the fix script to add the streambot database without losing data:

```bash
./fix-existing-deployment.sh
```

This script will:
- ✅ Check if streambot database exists
- ✅ Create streambot database and user if missing
- ✅ Update streambot user password if it exists
- ✅ Restart stream-bot container
- ✅ **Preserve all existing Discord Bot data** (no data loss!)

### For Fresh Deployments

New deployments will automatically create both databases via the init scripts in `config/postgres-init/`.

## Testing

After deploying, verify databases:

```bash
# Check database status
./migrate-database.sh
# Select option 1: Check Database Status

# Should see:
# - ticketbot database with ticketbot user
# - streambot database with streambot user
```

## Troubleshooting

**Discord Bot auth failed:**
- Database may not be initialized yet
- Check: `docker logs discord-bot-db`
- Reset if needed: `./migrate-database.sh` → option 3

**Stream Bot crash loop:**
- Check database is created: `./migrate-database.sh` → option 1
- Check logs: `docker logs stream-bot`
- May need to rebuild container after database creation

**Caddy DNS errors:**
- If stream-bot is crash-looping, Caddy can't resolve it
- Fix stream-bot first, Caddy errors will resolve automatically
