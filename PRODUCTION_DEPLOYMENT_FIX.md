# Production Deployment - Service Separation Fix

## Issues Identified

### 1. Stream-Bot Fact Generation
**Problem:** Using wrong AI model (gpt-5-mini doesn't exist)
**Impact:** Facts fail to generate or use fallback model
**Status:** ✅ FIXED (subagent updated all defaults to gpt-4o)

### 2. Dashboard Jarvis Chatbot  
**Problem:** OpenAI API key may not be available in dashboard container
**Impact:** Chatbot returns "AI service not available"
**Status:** Needs verification

## Deployment Steps

### Step 1: Apply Stream-Bot AI Model Fix

```bash
cd /home/evin/contain/HomeLabHub

# Apply data migration to fix existing records
docker exec -i homelab-postgres psql -U streambot -d streambot < services/stream-bot/migrations/fix-ai-model-config.sql

# Rebuild stream-bot with updated defaults
docker-compose up -d --build stream-bot

# Verify fact generation works
docker-compose logs stream-bot | tail -50
# Should see:
# [Facts] ✓ Snapple Fact generation service configured (immediate + 1 fact/hour)
# [Facts] Generating fact...
# [OpenAI] Generating fact with model: gpt-4o
# [Facts] ✓ Stored fact in stream-bot database
```

### Step 2: Fix Dashboard OpenAI Environment

```bash
# Check if OPENAI_API_KEY is set in dashboard container
docker exec homelab-dashboard printenv | grep OPENAI

# If not set, add it to docker-compose.yml
# Edit docker-compose.yml and ensure homelab-dashboard service has:
# environment:
#   - OPENAI_API_KEY=${OPENAI_API_KEY}
#   - AI_INTEGRATIONS_OPENAI_API_KEY=${OPENAI_API_KEY}

# Restart dashboard
docker-compose restart homelab-dashboard

# Verify Jarvis works
docker-compose logs homelab-dashboard | grep -i "AI Service"
# Should see: "AI Service initialized with Production OpenAI credentials"
```

### Step 3: Verify Service Separation

**Each service should own its own:**
- ✅ **Stream-Bot:**
  - Database: `streambot` schema in PostgreSQL
  - API: POST/GET `/api/facts` for facts
  - UI: React frontend at stream.rig-city.com
  - Data: Generates and stores its own facts

- ✅ **Dashboard:**
  - Database: `homelab_jarvis` schema in PostgreSQL
  - API: POST `/api/ai/chat` for Jarvis chatbot
  - UI: Flask templates at host.evindrake.net
  - Data: Manages its own AI sessions

- ✅ **Discord-Bot:**
  - Database: `discord` schema in PostgreSQL
  - API: Discord bot commands
  - UI: React frontend at bot.rig-city.com
  - Data: Manages tickets and Discord interactions

## Verification Checklist

### Stream-Bot Facts
- [ ] Visit https://stream.rig-city.com/trigger
- [ ] Click "Generate Preview" button
- [ ] Fact appears using gpt-4o model
- [ ] Check logs: `docker-compose logs stream-bot | grep Facts`
- [ ] Should see automatic fact generation on startup

### Dashboard Jarvis
- [ ] Visit https://host.evindrake.net/assistant
- [ ] Type a message to Jarvis
- [ ] Receive response (not error)
- [ ] Check logs: `docker-compose logs homelab-dashboard | grep "AI Service"`
- [ ] Should see "AI Service initialized"

### Service Independence
- [ ] Stream-bot can restart without affecting dashboard
- [ ] Dashboard can restart without affecting stream-bot
- [ ] Each service has its own database schema
- [ ] No cross-service data storage

## Rollback Plan

If issues occur:
```bash
# Revert stream-bot
git checkout HEAD~1 services/stream-bot/
docker-compose up -d --build stream-bot

# Revert dashboard
docker-compose restart homelab-dashboard
```

## Environment Variables Required

### Stream-Bot
```env
DATABASE_URL=postgresql://streambot:password@homelab-postgres:5432/streambot
OPENAI_API_KEY=sk-...
NODE_ENV=production
```

### Dashboard
```env
DATABASE_URL=postgresql://homelab:password@homelab-postgres:5432/homelab_jarvis
OPENAI_API_KEY=sk-...
FLASK_ENV=production
```

Both services need their OWN `OPENAI_API_KEY` environment variable!
