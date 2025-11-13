# Database Troubleshooting Guide

## Quick Fix: Ensure All Databases Exist

If your Discord Bot or Stream Bot are failing with database errors, run this command:

```bash
cd /home/evin/contain/HomeLabHub/
./deployment/ensure-databases.sh
```

This script will:
- ✅ Check if PostgreSQL is running
- ✅ Create missing databases (`ticketbot`, `streambot`)
- ✅ Create missing users with correct passwords
- ✅ Update passwords if they changed in `.env`
- ✅ Restart affected services automatically
- ✅ **Never** delete existing data

## Common Issues

### 1. "password authentication failed for user 'ticketbot'" or "user 'streambot'"

**Cause**: Database password in `.env` doesn't match what's in PostgreSQL.

**Fix**:
```bash
# Edit .env and verify passwords
nano .env

# Run the database fixer
./deployment/ensure-databases.sh
```

### 2. "database 'streambot' does not exist"

**Cause**: PostgreSQL was created before Stream Bot was added to the project.

**Fix**:
```bash
./deployment/ensure-databases.sh
```

### 3. Services Keep Restarting

**Symptom**: `docker ps` shows services constantly restarting.

**Fix**:
```bash
# Check what's wrong
docker logs discord-bot --tail 50
docker logs stream-bot --tail 50

# If it's database-related, run:
./deployment/ensure-databases.sh

# If containers still fail, check .env has all required variables:
cat .env.unified.example  # See what's needed
nano .env                 # Add missing variables
```

### 4. PostgreSQL Container Won't Start

**Symptoms**:
- `docker-bot-db` shows as "Unhealthy" or "Restarting"
- Services can't connect to database

**Diagnosis**:
```bash
# Check PostgreSQL logs
docker logs discord-bot-db --tail 100

# Common issues:
# - Corrupted data volume
# - Permission errors
# - Port already in use
```

**Fix**:
```bash
# If data volume is corrupted (WARNING: This deletes all data!)
docker-compose -f docker-compose.unified.yml down
docker volume rm homelabhub_postgres_data
docker-compose -f docker-compose.unified.yml up -d discord-bot-db

# Wait for PostgreSQL to initialize
sleep 30

# Recreate databases
./deployment/ensure-databases.sh
```

## Manual Database Commands

### Connect to PostgreSQL
```bash
# Connect as ticketbot user
docker exec -it discord-bot-db psql -U ticketbot -d ticketbot

# Connect as postgres superuser
docker exec -it discord-bot-db psql -U postgres
```

### List All Databases
```sql
\l
```

### List All Users
```sql
\du
```

### Check If Database Exists
```bash
docker exec discord-bot-db psql -U ticketbot -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='streambot'"
```

### Manually Create Database
```bash
docker exec discord-bot-db psql -U ticketbot -d postgres <<EOF
CREATE DATABASE streambot OWNER ticketbot;
GRANT ALL PRIVILEGES ON DATABASE streambot TO ticketbot;
EOF
```

### Reset User Password
```bash
docker exec discord-bot-db psql -U ticketbot -d postgres <<EOF
ALTER ROLE streambot WITH PASSWORD 'your-new-password';
EOF
```

## Environment Variable Reference

Required in `.env`:

```bash
# Discord Bot Database
DISCORD_DB_PASSWORD=generate-random-password

# Stream Bot Database
STREAMBOT_DB_PASSWORD=generate-random-password
```

Generate secure passwords:
```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(16))'
```

## Database Architecture

The homelab uses a **single PostgreSQL container** that hosts multiple databases:

```
┌─────────────────────────────────────┐
│  discord-bot-db (Container)         │
│  Image: postgres:16-alpine          │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Database: ticketbot           │ │
│  │ User: ticketbot               │ │
│  │ Used by: Discord Bot          │ │
│  └───────────────────────────────┘ │
│                                     │
│  ┌───────────────────────────────┐ │
│  │ Database: streambot           │ │
│  │ User: streambot               │ │
│  │ Used by: Stream Bot           │ │
│  └───────────────────────────────┘ │
│                                     │
│  Volume: postgres_data              │
└─────────────────────────────────────┘
```

## Maintenance Scripts

### `ensure-databases.sh` (Recommended)
Safe, idempotent script that creates missing databases without deleting data.
```bash
./deployment/ensure-databases.sh
```

### `fix-existing-deployment.sh` (Legacy)
Older script focused on adding Stream Bot database. Use `ensure-databases.sh` instead.

## Health Checks

### Check Container Health
```bash
docker ps --filter name=discord-bot-db --format "{{.Status}}"
```

### Check Database Connectivity
```bash
# From host
docker exec discord-bot-db pg_isready -U ticketbot -d ticketbot

# From another container
docker exec discord-bot sh -c \
  'pg_isready -h discord-bot-db -U ticketbot -d ticketbot'
```

### Verify Service Can Connect
```bash
# Check Discord Bot connection
docker logs discord-bot 2>&1 | grep -i "database\|postgres"

# Check Stream Bot connection
docker logs stream-bot 2>&1 | grep -i "database\|postgres"
```

## When to Use Each Tool

| Problem | Solution |
|---------|----------|
| Fresh deployment | Databases auto-created via init scripts |
| Database doesn't exist | `./deployment/ensure-databases.sh` |
| Wrong password | Edit `.env`, then `./deployment/ensure-databases.sh` |
| Corrupted database | Backup data → delete volume → redeploy → restore |
| Multiple issues | `./deployment/ensure-databases.sh` (fixes most things) |

## Getting Help

If problems persist after running `ensure-databases.sh`:

1. **Check PostgreSQL logs**:
   ```bash
   docker logs discord-bot-db --tail 200
   ```

2. **Check service logs**:
   ```bash
   docker logs discord-bot --tail 200
   docker logs stream-bot --tail 200
   ```

3. **Verify .env file**:
   ```bash
   grep -E "DISCORD_DB_PASSWORD|STREAMBOT_DB_PASSWORD" .env
   ```

4. **Check network connectivity**:
   ```bash
   docker exec discord-bot ping -c 3 discord-bot-db
   docker exec stream-bot ping -c 3 discord-bot-db
   ```
