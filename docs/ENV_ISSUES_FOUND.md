# Environment Variable Issues Found

## Problems Identified

### 1. **Outdated .env.example**
- The `.env.example` file is for standalone dashboard only
- Doesn't include variables for Discord bot, Stream bot, Plex, VNC, etc.
- Should be replaced with `.env.unified.example` as the primary template

### 2. **Missing Variables in generate-unified-env.sh**
- ❌ `STREAMBOT_OPENAI_API_KEY` - Stream bot expects this specifically
- ❌ `HOMELABHUB_API_KEY` - Used for HomeLabHub → Discord bot API communication
- ❌ Various Docker-specific variables referenced in services

### 3. **Variable Naming Inconsistencies**
- generate-unified-env.sh uses `STREAMBOT_DB_PASSWORD`
- But doesn't use it to build `DATABASE_URL` with the password
- Stream bot expects full `DATABASE_URL` or separate password variable

### 4. **Missing Stream Bot Variables**
- Script asks for Twitch credentials but not all required stream bot vars
- Missing explicit `STREAMBOT_OPENAI_API_KEY` fallback explanation

## Fixes Applied

1. Created comprehensive `.env.unified.example` ✅
2. Updated `generate-unified-env.sh` to include all required variables ✅
3. Added proper variable documentation ✅
4. Created validation script to check for missing vars ✅
