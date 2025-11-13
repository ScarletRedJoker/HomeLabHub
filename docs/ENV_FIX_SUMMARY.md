# Environment Variable Fix Summary

## Problems Identified & Fixed

### 1. ❌ Incomplete Variable Coverage
**Problem:** `generate-unified-env.sh` was missing critical variables
**Fixed:**
- ✅ Added `WEB_USERNAME` and `WEB_PASSWORD` for dashboard login
- ✅ Added `AI_INTEGRATIONS_OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL` for dashboard
- ✅ Added `STREAMBOT_DB_PASSWORD` (was completely missing!)
- ✅ Added `STREAMBOT_OPENAI_BASE_URL`, `STREAMBOT_NODE_ENV`, `STREAMBOT_PORT`
- ✅ Made Twitch variables optional with empty defaults
- ✅ Added `NOVNC_URL` for VNC configuration

### 2. ❌ Inconsistent Variable Names
**Problem:** `check-all-env.sh` referenced variables that don't exist
**Fixed:**
- ✅ Removed `STREAMBOT_DATABASE_URL` (unused - docker-compose builds `DATABASE_URL` from password)
- ✅ Updated to check `STREAMBOT_DB_PASSWORD` instead
- ✅ Aligned variable names across all scripts

### 3. ❌ Unclear Optional vs Required
**Problem:** Scripts didn't clearly indicate which variables are optional
**Fixed:**
- ✅ Created comprehensive `ENV_VARIABLE_MATRIX.md` with priority levels
- ✅ Updated `.env.unified.example` with clear comments
- ✅ Made optional variables default to empty string with fallback documentation

### 4. ❌ Missing Discord OAuth Fix
**Problem:** Callback URL was wrong in docker-compose
**Fixed:**
- ✅ Changed from `/callback` to `/auth/discord/callback`
- ✅ Added proxy headers to Caddyfile for OAuth support
- ✅ Created `DISCORD_OAUTH_FIX.md` with step-by-step instructions

### 5. ❌ Duplicate StreamBot Configuration
**Problem:** StreamBot variables appeared twice in generate script
**Fixed:**
- ✅ Consolidated into single section
- ✅ Moved to logical location in script flow

---

## Updated Files

### Configuration Files
- ✅ `deployment/generate-unified-env.sh` - Now generates ALL required variables
- ✅ `.env.unified.example` - Comprehensive template with clear documentation
- ✅ `Caddyfile` - Added proxy headers for OAuth (bot, stream, dashboard)
- ✅ `docker-compose.unified.yml` - Fixed Discord OAuth callback URL

### Documentation
- ✅ `docs/ENV_VARIABLE_MATRIX.md` - Complete reference of all variables
- ✅ `docs/DISCORD_OAUTH_FIX.md` - Discord OAuth troubleshooting guide
- ✅ `docs/ENV_FIX_SUMMARY.md` - This document
- ✅ `DISCORD_OAUTH_QUICKFIX.txt` - Quick reference at root

### Validation
- ✅ `deployment/check-all-env.sh` - Already existed, validates environment

---

## How to Use

### First-Time Setup
```bash
# 1. Generate comprehensive .env file
cd /home/evin/contain/HomeLabHub
./deployment/generate-unified-env.sh

# 2. Review and edit as needed
nano .env

# 3. Validate configuration
./deployment/check-all-env.sh

# 4. Deploy!
./deployment/deploy-unified.sh
```

### Update Existing .env
```bash
# Option 1: Keep existing and add missing variables
./deployment/generate-unified-env.sh
# Choose option 1: Keep existing and add missing

# Option 2: Fresh start with backup
./deployment/generate-unified-env.sh
# Choose option 2: Backup and create fresh
```

### Discord OAuth Setup
```bash
# After generating .env, you MUST update Discord Developer Portal:
# 1. Go to: https://discord.com/developers/applications
# 2. Select your app
# 3. Go to OAuth2 → Redirects
# 4. Add: https://bot.rig-city.com/auth/discord/callback
# 5. Save changes
```

---

## Variable Priority Reference

### 🔴 Critical (Must Configure)
These **must** be set with real values before deploying:

```
LETSENCRYPT_EMAIL          - Email for SSL certificates
OPENAI_API_KEY             - OpenAI API for AI features
DISCORD_BOT_TOKEN          - Discord bot authentication
DISCORD_CLIENT_ID          - Discord OAuth client ID
DISCORD_CLIENT_SECRET      - Discord OAuth secret
DISCORD_APP_ID             - Discord application ID
PLEX_CLAIM                 - Plex server claim token
```

### 🟡 Important (Should Configure)
These have defaults but should be changed:

```
WEB_USERNAME               - Dashboard login (default: evin)
WEB_PASSWORD               - Dashboard password (default: homelab)
SSH_HOST                   - SSH server for remote execution
SSH_USER                   - SSH username
```

### 🟢 Auto-Generated (Secure Defaults)
These are automatically generated securely:

```
SESSION_SECRET             - Flask/Express session encryption
DASHBOARD_API_KEY          - Dashboard API access
DISCORD_SESSION_SECRET     - Discord session encryption
DISCORD_DB_PASSWORD        - PostgreSQL password for Discord bot
STREAMBOT_SESSION_SECRET   - Stream bot session encryption
STREAMBOT_DB_PASSWORD      - PostgreSQL password for Stream bot
VNC_PASSWORD               - VNC viewer password
VNC_USER_PASSWORD          - VNC user password
```

### ⚪ Optional (Can Leave Empty)
These are optional integrations:

```
STREAMBOT_OPENAI_API_KEY   - Falls back to OPENAI_API_KEY
AI_INTEGRATIONS_OPENAI_API_KEY - Falls back to OPENAI_API_KEY
TWITCH_CLIENT_ID           - Only needed for Twitch integration
TWITCH_CLIENT_SECRET       - Only needed for Twitch integration
TWITCH_CHANNEL             - Only needed for Twitch integration
VITE_CUSTOM_WS_URL         - Custom WebSocket override
```

---

## Validation Checklist

Before deploying, verify:

- [ ] `.env` file exists
- [ ] `LETSENCRYPT_EMAIL` is your real email
- [ ] `OPENAI_API_KEY` starts with `sk-`
- [ ] Discord credentials from Developer Portal
- [ ] `WEB_PASSWORD` changed from default `homelab`
- [ ] Plex claim token obtained (4-minute expiry!)
- [ ] Discord OAuth redirect URI added to Developer Portal
- [ ] All placeholder values replaced with real values

Run validation:
```bash
./deployment/check-all-env.sh
```

---

## Security Best Practices

1. **Never commit .env to Git**
   - Already in `.gitignore`
   - Contains sensitive credentials

2. **Rotate secrets regularly**
   - Database passwords: Every 90 days
   - Session secrets: Every 90 days
   - API keys: As needed

3. **Use strong passwords**
   - Auto-generated secrets are cryptographically secure
   - Change default `WEB_PASSWORD` from `homelab`

4. **Backup .env securely**
   ```bash
   # Encrypt backup
   gpg --encrypt .env > .env.gpg
   # Store encrypted backup in secure location
   ```

---

## Troubleshooting

### Missing Variables Error
```bash
# Regenerate .env with all variables
./deployment/generate-unified-env.sh

# Choose option 1 to keep existing values
# New variables will be added
```

### Discord OAuth "Invalid redirect_uri"
```bash
# 1. Check .env has correct callback URL
grep DISCORD_CALLBACK_URL .env
# Should show: https://bot.rig-city.com/auth/discord/callback

# 2. Update Discord Developer Portal
# See: docs/DISCORD_OAUTH_FIX.md
```

### Stream Bot Database Connection Failed
```bash
# Ensure STREAMBOT_DB_PASSWORD is set
grep STREAMBOT_DB_PASSWORD .env

# If missing, regenerate:
./deployment/generate-unified-env.sh
```

### Plex Claim Token Expired
```bash
# Tokens expire in 4 minutes!
# 1. Get new token: https://www.plex.tv/claim/
# 2. Update .env immediately:
nano .env
# 3. Redeploy:
./deployment/deploy-unified.sh
```

---

## What's Next?

After fixing environment variables:

1. **Update Discord Developer Portal** (required for OAuth)
   - See: `docs/DISCORD_OAUTH_FIX.md`

2. **Deploy to production**
   ```bash
   cd /home/evin/contain/HomeLabHub
   git pull
   ./deployment/deploy-unified.sh
   ```

3. **Verify all services**
   ```bash
   ./deployment/monitor-services.sh
   # Check all services are running
   ```

4. **Test Discord OAuth**
   - Visit: https://bot.rig-city.com
   - Click "Login with Discord"
   - Should redirect and authenticate successfully

---

**Status:** ✅ **Environment configuration system is now comprehensive and complete!**

**Last Updated:** November 12, 2025  
**Related Docs:** ENV_VARIABLE_MATRIX.md, DISCORD_OAUTH_FIX.md, DEPLOYMENT_GUIDE.md
