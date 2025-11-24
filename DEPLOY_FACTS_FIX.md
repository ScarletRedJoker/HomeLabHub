# Facts Architecture Fix - Deployment Guide

## What Was Fixed (CRITICAL SERVICE SEPARATION)

**Problem:** Facts were incorrectly implemented with stream-bot data stored in dashboard service.

**Solution:** Complete architectural refactor - stream-bot now owns facts end-to-end.

### Before (WRONG):
- ❌ Stream-bot POSTed facts to dashboard
- ❌ Dashboard stored facts in its Artifact table (service mixing)

### After (CORRECT):
- ✅ Stream-bot generates AND stores facts in its own database
- ✅ Stream-bot has its own `facts` table
- ✅ Stream-bot serves facts via its own API

## Deploy to Production

### Step 1: Pull latest code
```bash
cd /home/evin/contain/HomeLabHub
git pull origin main
```

### Step 2: Apply database migration (CRITICAL)
```bash
# Create facts table in stream-bot database
docker exec -i homelab-postgres psql -U streambot -d streambot < services/stream-bot/migrations/0006_add_facts_table.sql
```

### Step 3: Restart stream-bot
```bash
docker-compose restart stream-bot
```

## Verify It Works

```bash
# Check logs - should see fact generation service started
docker-compose logs stream-bot | grep -i facts

# Expected output:
# [Facts] ✓ Snapple Fact generation service started (1 fact/hour)
# [Facts] ✓ Generated and stored fact in stream-bot database
```

**Test API (after 1 hour or restart):**
```bash
curl http://localhost:5000/api/facts/latest
curl http://localhost:5000/api/facts/random
```

## Files Changed
- `services/stream-bot/shared/schema.ts` - Added facts table
- `services/stream-bot/migrations/0006_add_facts_table.sql` - Migration
- `services/stream-bot/server/routes.ts` - Added facts API
- `services/stream-bot/server/index.ts` - Posts to localhost
- `services/dashboard/routes/facts_routes.py` - Reverted to proxy only

## Service Separation Principle
Each service owns its own data, UI, and API completely. Stream-bot facts belong to stream-bot, not dashboard.
