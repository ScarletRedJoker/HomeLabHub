# AI Model Configuration Fix - Deployment Guide

**Date:** November 24, 2025  
**Issue:** Production stream-bot was using non-existent AI model references (gpt-5-mini, gpt-4o-mini)  
**Solution:** Standardize on gpt-4o across the entire codebase

---

## Problem Summary

The stream-bot service had inconsistent AI model configuration:
- Initial migration used `gpt-5-mini` as default (model doesn't exist)
- Some code used `gpt-4o-mini` (not our production standard)
- This caused fact generation to fail in production

## Changes Made

### 1. Database Migration (Schema)
**File:** `services/stream-bot/migrations/0000_broad_speedball.sql`
- Changed default AI model from `gpt-5-mini` to `gpt-4o`

### 2. Shared Schema
**File:** `services/stream-bot/shared/schema.ts`
- Updated default value from `gpt-4o-mini` to `gpt-4o`

### 3. Server-Side Code (11 files)
All server files now default to `gpt-4o`:
- `server/seed-admin.ts` - Seed data
- `server/auth/passport-oauth-config.ts` - User registration defaults
- `server/storage.ts` - Config creation
- `server/routes.ts` - Settings endpoint defaults
- `server/bot-service.ts` - Fact generation
- `server/bot-worker.ts` - Background worker
- `server/chatbot-service.ts` - Chatbot responses
- `server/analytics-service.ts` - Sentiment analysis
- `server/games-service.ts` - 8-ball and trivia (2 locations)
- `server/openai.ts` - Fallback model

### 4. Client-Side Code (2 files)
**Files:**
- `client/src/pages/settings.tsx` - Form defaults and model selector
- `src/config/environment.ts` - Production environment default

### 5. Data Migration Script
**File:** `services/stream-bot/migrations/fix-ai-model-config.sql`
- Updates existing bot_configs records to use `gpt-4o`

---

## Deployment Steps

### Prerequisites
- Access to production database
- Database backup completed
- Code deployed to production server

### Step-by-Step Deployment

#### 1. Backup Production Database
```bash
pg_dump $DATABASE_URL > backup_before_ai_model_fix_$(date +%Y%m%d_%H%M%S).sql
```

#### 2. Deploy Code Changes
```bash
# Pull latest code
git pull origin main

# Install dependencies (if needed)
cd services/stream-bot
npm install

# Build production assets
npm run build
```

#### 3. Run Data Migration
```bash
# Option A: Using psql directly
psql $DATABASE_URL -f migrations/fix-ai-model-config.sql

# Option B: Using execute_sql_tool (in Replit)
# Run the contents of fix-ai-model-config.sql via the database tool
```

#### 4. Verify Migration
```bash
# Check for any remaining invalid models
psql $DATABASE_URL -c "SELECT ai_model, COUNT(*) FROM bot_configs GROUP BY ai_model;"

# Expected output: Only valid models (gpt-4o, gpt-4o-mini, gpt-4-turbo)
```

#### 5. Restart Services
```bash
# Restart the stream-bot service
pm2 restart stream-bot
# OR
systemctl restart stream-bot
```

#### 6. Verify Fact Generation Works
```bash
# Test fact generation endpoint (requires authentication)
curl -X POST https://your-domain.com/api/facts/generate \
  -H "Cookie: your-session-cookie" \
  -H "Content-Type: application/json"

# Should return a generated fact without errors
```

---

## Verification Checklist

- [ ] Database backup created
- [ ] Code deployed successfully
- [ ] Data migration executed without errors
- [ ] No bot_configs have invalid AI models
- [ ] Services restarted
- [ ] Fact generation endpoint works
- [ ] Settings page displays correct model options
- [ ] No errors in application logs

---

## Rollback Plan

If issues occur after deployment:

### 1. Restore Database
```bash
# Stop services
pm2 stop stream-bot

# Restore backup
psql $DATABASE_URL < backup_before_ai_model_fix_YYYYMMDD_HHMMSS.sql

# Restart services
pm2 start stream-bot
```

### 2. Revert Code
```bash
git revert <commit-hash>
git push origin main
# Then redeploy
```

---

## Testing in Development

Before deploying to production, test locally:

### 1. Reset Development Database
```bash
cd services/stream-bot
npm run db:push  # Apply schema changes
```

### 2. Test Fact Generation
- Log in to the app
- Go to Dashboard
- Click "Generate Fact Now"
- Verify fact is generated successfully
- Check browser console for errors

### 3. Test Settings Page
- Go to Settings
- Verify AI Model dropdown shows: gpt-4o, gpt-4o-mini, gpt-4-turbo
- Change model and save
- Verify settings persist correctly

---

## Notes

- **Model Selection:** Users can still choose `gpt-4o-mini` or `gpt-4-turbo` if they prefer, but `gpt-4o` is now the recommended default
- **Cost Impact:** gpt-4o may be more expensive than gpt-4o-mini, but provides better quality outputs
- **Environment Variable:** Set `STREAMBOT_FACT_MODEL=gpt-4o` in production to override the default
- **Future Changes:** If OpenAI releases gpt-5, update these files to add it as an option

---

## Support

If you encounter issues during deployment:
1. Check application logs for errors
2. Verify OpenAI API key is valid
3. Test with a simpler model (gpt-4o-mini) temporarily
4. Contact the development team with error logs
