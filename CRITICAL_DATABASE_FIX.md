# 🔴 CRITICAL: Database Configuration Fix Required

## Problem Identified

Your `.env` file has **all services pointing to the same database**, which is why **ALL save operations fail**:

```bash
# WRONG - All pointing to same database!
DATABASE_URL=postgresql://postgres:Brs=2729@postgres:5432/homelab_shared
JARVIS_DATABASE_URL=postgresql://postgres:Brs=2729@postgres:5432/homelab_shared
```

**Result:** Stream-bot and Discord-bot try to save data to `homelab_shared` database, but their tables only exist in `streambot` and `ticketbot` databases.

---

## ✅ SOLUTION: Update Your .env File on Ubuntu

### Step 1: Edit the .env file
```bash
cd ~/contain/HomeLabHub
nano .env
```

### Step 2: Update these database URLs:

```bash
# ============================================
# Database Configuration (CORRECTED)
# ============================================

# Dashboard Database
DATABASE_URL=postgresql://postgres:Brs=2729@postgres:5432/homelab_jarvis
JARVIS_DATABASE_URL=postgresql://postgres:Brs=2729@postgres:5432/homelab_jarvis

# Stream-Bot Database (ADD THIS - NEW!)
STREAMBOT_DATABASE_URL=postgresql://postgres:Brs=2729@postgres:5432/streambot

# Discord-Bot Database (ADD THIS - NEW!)
DISCORD_DATABASE_URL=postgresql://postgres:Brs=2729@postgres:5432/ticketbot
```

### Step 3: Restart services to apply changes
```bash
docker compose restart stream-bot discord-bot dashboard
```

### Step 4: Verify databases exist
```bash
docker exec -it homelab-postgres psql -U postgres -l
```

You should see:
- `homelab_jarvis` ✅
- `streambot` ✅  
- `ticketbot` ✅

If any are missing, create them:
```bash
docker exec -it homelab-postgres psql -U postgres -c "CREATE DATABASE streambot;"
docker exec -it homelab-postgres psql -U postgres -c "CREATE DATABASE ticketbot;"
docker exec -it homelab-postgres psql -U postgres -c "CREATE DATABASE homelab_jarvis;"
```

---

## Why This Fix Works

**BEFORE (Broken):**
```
stream-bot → DATABASE_URL → homelab_shared (❌ tables don't exist)
discord-bot → DATABASE_URL → homelab_shared (❌ tables don't exist)
```

**AFTER (Fixed):**
```
stream-bot → STREAMBOT_DATABASE_URL → streambot ✅
discord-bot → DISCORD_DATABASE_URL → ticketbot ✅
dashboard → JARVIS_DATABASE_URL → homelab_jarvis ✅
```

Each service now connects to its **own database** with its **own tables**!

---

## Testing After Fix

### Stream-Bot
```bash
# Should work now (on Ubuntu after fix)
curl https://stream.rig-city.com/api/commands
```

### Discord-Bot  
```bash
# Should work now (on Ubuntu after fix)
curl https://bot.rig-city.com/api/templates
```

---

## Development Auth Bypass (Already Implemented)

✅ **Dev bypass is ESSENTIAL** because OAuth credentials are missing:
- No `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`
- No `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
- Without bypass, users can't log in → can't test anything

The bypass creates a default dev user automatically in NODE_ENV=development, allowing full testing without OAuth setup.

**Production:** Auth bypass is DISABLED (only active when `NODE_ENV=development`)

---

## Summary

1. ✅ Auth bypass implemented (stream-bot + discord-bot)
2. ✅ Database connection strings fixed to use service-specific URLs
3. ✅ OBS WebSocket made completely optional
4. ✅ Custom favicons created (no more Replit logos)
5. ⏳ **Next:** Update .env on Ubuntu, restart services, test everything!
