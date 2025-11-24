# Complete Service Separation Fix - Production Deployment

## Overview
This document provides step-by-step instructions to fix both Stream-Bot fact generation and Dashboard Jarvis chatbot on production, ensuring proper service separation.

## Critical Service Separation Principle

**Each service MUST own its own:**
- ✅ Database schema (separate PostgreSQL schemas)
- ✅ API endpoints (no cross-service API calls except as read-only proxy)
- ✅ Frontend UI (React for bots, Flask templates for dashboard)  
- ✅ Data generation and storage (generate and store your own data)

## Issues Fixed

### 1. Stream-Bot Fact Generation ✅
**Problem:** Using non-existent AI model `gpt-5-mini`  
**Root Cause:** Old migration had wrong default value  
**Solution:** Updated all 15 files to use `gpt-4o` as default  
**Files Changed:** migrations, schema, server code, client code

### 2. Dashboard Jarvis Chatbot 🔧
**Problem:** May not have OpenAI API key in production environment  
**Root Cause:** Production `.env` file might be missing `OPENAI_API_KEY`  
**Solution:** Verify and set environment variable correctly

## Production Deployment Steps

### Pre-Flight Checklist

```bash
# SSH to production server
cd /home/evin/contain/HomeLabHub

# Verify you're on the latest code
git pull origin main

# Check .env file has required keys
grep -E "OPENAI_API_KEY|STREAMBOT_OPENAI_API_KEY" .env
```

### Step 1: Fix Stream-Bot AI Model

```bash
# Apply data migration to update existing records
docker exec -i homelab-postgres psql -U streambot -d streambot <<'EOF'
-- Update bot_config records
UPDATE bot_config 
SET ai_model = 'gpt-4o' 
WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini', 'gpt-3.5-turbo');

-- Update users records  
UPDATE users 
SET ai_model = 'gpt-4o' 
WHERE ai_model IN ('gpt-5-mini', 'gpt-4o-mini', 'gpt-3.5-turbo');

-- Verify changes
SELECT 'bot_config' as table_name, ai_model, COUNT(*) 
FROM bot_config 
GROUP BY ai_model
UNION ALL
SELECT 'users' as table_name, ai_model, COUNT(*) 
FROM users 
GROUP BY ai_model;
EOF

# Rebuild and restart stream-bot with new code
docker-compose up -d --build stream-bot

# Wait for container to start
sleep 10

# Verify fact generation is working
docker-compose logs stream-bot | tail -50
```

**Expected Output:**
```
[Facts] ✓ Snapple Fact generation service configured (immediate + 1 fact/hour)
[Facts] Generating fact...
[OpenAI] Generating fact with model: gpt-4o
[OpenAI] Response received, choices: 1
[Facts] ✓ Stored fact in stream-bot database
```

### Step 2: Fix Dashboard Jarvis Chatbot

```bash
# Check if OPENAI_API_KEY is available in dashboard container
docker exec homelab-dashboard printenv | grep -E "OPENAI|AI_INTEGRATIONS"

# If not shown, edit .env file and add (if missing):
# OPENAI_API_KEY=sk-your-actual-key-here

# Restart dashboard to pick up environment changes
docker-compose restart homelab-dashboard

# Restart celery worker too (it also needs the key)
docker-compose restart homelab-celery-worker

# Wait for services to start
sleep 10

# Verify AI service initialized
docker-compose logs homelab-dashboard | grep "AI Service"
```

**Expected Output:**
```
AI Service initialized with Production OpenAI credentials
  Base URL: https://api.openai.com/v1
```

### Step 3: Verify Service Separation

**Stream-Bot Service (stream.rig-city.com):**
```bash
# Check stream-bot owns facts
docker exec -i homelab-postgres psql -U streambot -d streambot <<'EOF'
SELECT COUNT(*) as total_facts FROM facts;
SELECT created_at, LEFT(fact_text, 50) as preview 
FROM facts 
ORDER BY created_at DESC 
LIMIT 5;
EOF
```

**Dashboard Service (host.evindrake.net):**
```bash
# Check dashboard owns Jarvis sessions
docker exec -i homelab-postgres psql -U homelab -d homelab_jarvis <<'EOF'
\dt ai_sessions
SELECT COUNT(*) FROM ai_sessions WHERE session_type = 'chat';
EOF
```

**Discord-Bot Service (bot.rig-city.com):**
```bash
# Check discord-bot owns tickets
docker exec -i homelab-postgres psql -U discord -d discord <<'EOF'
\dt tickets
SELECT COUNT(*) FROM tickets;
EOF
```

## Verification Tests

### Test 1: Stream-Bot Fact Generation

```bash
# Visit web UI
# https://stream.rig-city.com/trigger
# Click "Generate Preview" button
# Should see a new fact immediately

# Or test via API
curl -X GET https://stream.rig-city.com/api/facts/random
# Should return: {"fact": {"id": "...", "text": "..."}}
```

### Test 2: Dashboard Jarvis Chat

```bash
# Visit web UI  
# https://host.evindrake.net/assistant
# Type: "Hello Jarvis, what's the server status?"
# Should get intelligent response

# Check logs for errors
docker-compose logs homelab-dashboard | grep -i error | tail -20
```

### Test 3: Discord Bot

```bash
# Check bot is running
docker-compose logs discord-bot | tail -30

# Should see "Discord bot connected successfully"
```

## Service Independence Validation

Each service should work independently:

```bash
# Restart stream-bot - should NOT affect dashboard or discord-bot
docker-compose restart stream-bot

# Restart dashboard - should NOT affect stream-bot or discord-bot  
docker-compose restart homelab-dashboard

# Restart discord-bot - should NOT affect stream-bot or dashboard
docker-compose restart discord-bot
```

## Troubleshooting

### Stream-Bot Facts Not Generating

```bash
# Check OpenAI API key
docker exec stream-bot printenv | grep OPENAI_API_KEY

# Check database connection
docker exec -i homelab-postgres psql -U streambot -d streambot -c "\dt facts"

# Check logs for errors
docker-compose logs stream-bot | grep -i error
```

### Dashboard Jarvis Not Responding

```bash
# Check OpenAI API key
docker exec homelab-dashboard printenv | grep OPENAI

# If missing, edit docker-compose.yml and add under homelab-dashboard environment:
#   - OPENAI_API_KEY=${OPENAI_API_KEY}
#   - AI_INTEGRATIONS_OPENAI_API_KEY=${OPENAI_API_KEY}

# Then restart
docker-compose up -d homelab-dashboard
```

### Database Connection Issues

```bash
# Check PostgreSQL is healthy
docker-compose ps homelab-postgres

# Test connections for each service
docker exec homelab-postgres psql -U streambot -d streambot -c "SELECT 1"
docker exec homelab-postgres psql -U homelab -d homelab_jarvis -c "SELECT 1"
docker exec homelab-postgres psql -U discord -d discord -c "SELECT 1"
```

## Environment Variables Reference

### Required in `.env` file:

```env
# OpenAI API Key (shared across services that need it)
OPENAI_API_KEY=sk-proj-...

# Stream-Bot specific (optional, falls back to OPENAI_API_KEY)
STREAMBOT_OPENAI_API_KEY=sk-proj-...

# Database URLs (auto-generated from components)
DATABASE_URL=postgresql://homelab:Brs=2729@homelab-postgres:5432/homelab_jarvis
STREAMBOT_DATABASE_URL=postgresql://streambot:Brs=2729@homelab-postgres:5432/streambot  
DISCORD_DATABASE_URL=postgresql://discord:Brs=2729@homelab-postgres:5432/discord

# Web Authentication
WEB_USERNAME=admin
WEB_PASSWORD=Brs=2729
```

## Success Criteria

- ✅ Stream-bot generates facts every hour automatically
- ✅ "Generate Preview" button works on stream.rig-city.com/trigger
- ✅ Jarvis chatbot responds at host.evindrake.net/assistant
- ✅ All three services use gpt-4o model
- ✅ Each service has its own database schema
- ✅ Services can restart independently without affecting each other
- ✅ No cross-service data storage (dashboard doesn't store stream-bot facts)

## Rollback Plan

If anything breaks:

```bash
# Stop all services
docker-compose down

# Pull previous code
git checkout HEAD~1

# Restart services
docker-compose up -d

# Check health
./homelab status
```

## Post-Deployment Monitoring

```bash
# Watch logs for 5 minutes
docker-compose logs -f --tail=100 stream-bot homelab-dashboard discord-bot

# Check for automatic fact generation (happens hourly)
# Should see log entry like: "[Facts] Generating fact..." every hour
```
