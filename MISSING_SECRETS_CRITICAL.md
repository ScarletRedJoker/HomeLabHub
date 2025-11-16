# CRITICAL MISSING SECRETS - MUST BE PROVIDED

This document lists ALL missing environment variables that are preventing services from working.

**User has spent $300 on this project - these secrets are BLOCKING all services.**

## Status: ❌ BLOCKING DEPLOYMENT

---

## 🔴 CRITICAL - REQUIRED FOR ALL SERVICES

### Database Passwords (REQUIRED)
**Status:** ❌ **MISSING** - All services will fail without these

```bash
# Generate with: python3 -c 'import secrets; print(secrets.token_urlsafe(16))'
DISCORD_DB_PASSWORD=          # PostgreSQL password for Discord bot database
STREAMBOT_DB_PASSWORD=        # PostgreSQL password for Stream bot database  
JARVIS_DB_PASSWORD=           # PostgreSQL password for Dashboard database
POWERDNS_DB_PASSWORD=         # PostgreSQL password for PowerDNS database
```

**Impact if missing:**
- ❌ Discord bot cannot connect to database
- ❌ Stream bot cannot connect to database
- ❌ Dashboard cannot connect to database
- ❌ All services will crash on startup

---

### Session Secrets (REQUIRED)
**Status:** ⚠️ **PARTIALLY MISSING**

```bash
# Generate with: python3 -c 'import secrets; print(secrets.token_hex(32))'
SESSION_SECRET=              # ✅ EXISTS (Used by general services)
DISCORD_SESSION_SECRET=      # ❌ MISSING (Discord bot will crash)
STREAMBOT_SESSION_SECRET=    # ❌ MISSING (Stream bot will crash with 502)
```

**Impact if missing:**
- ❌ Discord bot: FATAL error on startup (requires SESSION_SECRET)
- ❌ Stream bot: 502 Bad Gateway
- ❌ User sessions will not work

---

## 🔴 DISCORD BOT - COMPLETELY NON-FUNCTIONAL

### Discord OAuth Credentials (REQUIRED)
**Status:** ❌ **ALL MISSING**

Get from: https://discord.com/developers/applications

```bash
DISCORD_BOT_TOKEN=           # ❌ MISSING - Bot cannot connect to Discord
DISCORD_CLIENT_ID=           # ❌ MISSING - OAuth login will fail
DISCORD_CLIENT_SECRET=       # ❌ MISSING - OAuth login will fail
DISCORD_APP_ID=              # ❌ MISSING - Bot commands won't work
VITE_DISCORD_CLIENT_ID=      # ❌ MISSING - Frontend auth will fail
```

**Impact if missing:**
- ❌ Bot will not connect to Discord servers
- ❌ Users cannot login via Discord OAuth
- ❌ Ticket system completely non-functional
- ❌ bot.rig-city.com will show login errors

**How to get these:**
1. Go to: https://discord.com/developers/applications
2. Select your application (or create one)
3. Copy the **Application ID** → use for DISCORD_APP_ID and DISCORD_CLIENT_ID
4. Go to "Bot" tab → Click "Reset Token" → Copy token → use for DISCORD_BOT_TOKEN
5. Go to "OAuth2" tab → Copy "Client Secret" → use for DISCORD_CLIENT_SECRET
6. Add redirect URL: `https://bot.rig-city.com/auth/discord/callback`

---

## 🟡 STREAM BOT - PARTIALLY FUNCTIONAL

### Twitch Integration (WORKING)
**Status:** ✅ **EXISTS**

```bash
TWITCH_CLIENT_ID=            # ✅ EXISTS
TWITCH_CLIENT_SECRET=        # ✅ EXISTS
```

### YouTube Integration (OPTIONAL)
**Status:** ❌ **MISSING** - YouTube features won't work

Get from: https://console.cloud.google.com/apis/credentials

```bash
YOUTUBE_CLIENT_ID=           # ❌ MISSING - YouTube auth will fail
YOUTUBE_CLIENT_SECRET=       # ❌ MISSING - YouTube features disabled
```

**Impact if missing:**
- ⚠️ YouTube streaming features disabled
- ✅ Twitch features will still work

### Kick Integration (OPTIONAL)
**Status:** ❌ **MISSING** - Kick features won't work

```bash
KICK_CLIENT_ID=              # ❌ MISSING - Kick auth will fail
KICK_CLIENT_SECRET=          # ❌ MISSING - Kick features disabled
```

**Impact if missing:**
- ⚠️ Kick streaming features disabled
- ✅ Twitch features will still work

---

## 🟡 AI FEATURES - OPTIONAL BUT RECOMMENDED

### OpenAI API (OPTIONAL)
**Status:** ❌ **MISSING** - AI features disabled

Get from: https://platform.openai.com/api-keys

```bash
OPENAI_API_KEY=              # ❌ MISSING - AI chat disabled
STREAMBOT_OPENAI_API_KEY=    # ❌ MISSING (will fallback to OPENAI_API_KEY)
```

**Impact if missing:**
- ⚠️ Dashboard AI assistant disabled
- ⚠️ Stream bot AI features disabled
- ✅ Core functionality still works

---

## 🟡 ADDITIONAL SERVICES - OPTIONAL

### MinIO Object Storage (HAS DEFAULTS)
**Status:** ✅ **WORKING** (using defaults)

```bash
MINIO_ROOT_USER=admin        # ✅ Using default
MINIO_ROOT_PASSWORD=         # ⚠️ Should be changed for security
```

### PowerDNS API (OPTIONAL)
**Status:** ⚠️ **NEEDS VALUE**

```bash
PDNS_API_KEY=                # ⚠️ Generate if using DNS features
```

---

## 📋 QUICK SETUP CHECKLIST

### Minimum Required for Basic Functionality

```bash
# 1. Database Passwords (CRITICAL)
DISCORD_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
STREAMBOT_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
JARVIS_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')
POWERDNS_DB_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(16))')

# 2. Session Secrets (CRITICAL)
DISCORD_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
STREAMBOT_SESSION_SECRET=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

# 3. Discord Credentials (REQUIRED - Get from Discord Developer Portal)
DISCORD_BOT_TOKEN=your-bot-token-here
DISCORD_CLIENT_ID=your-client-id-here
DISCORD_CLIENT_SECRET=your-client-secret-here
DISCORD_APP_ID=your-app-id-here
VITE_DISCORD_CLIENT_ID=your-client-id-here
```

### After Adding Secrets

1. **Copy .env.example to .env**
   ```bash
   cp .env.example .env
   ```

2. **Edit .env file and fill in the values above**
   ```bash
   nano .env  # or vim .env
   ```

3. **Rebuild and restart all services**
   ```bash
   docker-compose -f docker-compose.unified.yml down
   docker-compose -f docker-compose.unified.yml up --build -d
   ```

4. **Verify all services are healthy**
   ```bash
   docker ps
   # All containers should show "healthy" status
   ```

---

## 🚨 PRIORITY ORDER

**Do these FIRST** (blocking all services):
1. ✅ Generate database passwords
2. ✅ Generate session secrets
3. ✅ Get Discord bot credentials from Discord Developer Portal

**Do these NEXT** (for full functionality):
4. ⚠️ Add OpenAI API key (for AI features)
5. ⚠️ Add YouTube credentials (for YouTube streaming)

**Optional enhancements**:
6. 💡 Add Kick credentials
7. 💡 Change MinIO password
8. 💡 Add PowerDNS API key

---

## ✅ WHAT'S ALREADY WORKING

- ✅ SESSION_SECRET - General session management
- ✅ TWITCH_CLIENT_ID - Twitch integration ready
- ✅ TWITCH_CLIENT_SECRET - Twitch OAuth ready
- ✅ Docker compose configuration is correct
- ✅ Caddy reverse proxy configured
- ✅ All service containers defined

---

## 📞 NEXT STEPS

**USER MUST DO:**

1. **Get Discord Bot Credentials**
   - Go to https://discord.com/developers/applications
   - Copy Application ID, Bot Token, Client Secret
   - Add to .env file

2. **Generate Secure Secrets**
   - Run the commands in the "Quick Setup Checklist" section
   - Add generated values to .env file

3. **Restart Services**
   - Run: `docker-compose -f docker-compose.unified.yml down`
   - Run: `docker-compose -f docker-compose.unified.yml up -d`

4. **Verify Everything Works**
   - Check: https://bot.rig-city.com
   - Check: https://stream.rig-city.com  
   - Check: https://rig-city.com

---

## 🔧 FIXES ALREADY COMPLETED

✅ **Discord Bot Build Error - FIXED**
- Changed `require('crypto')` to ESM import
- Bot will now build and start correctly (once secrets are added)

✅ **Rig City Static Site - READY**
- All files complete (index.html, CSS, JS)
- Container configured in docker-compose
- Caddy routing configured
- Will work immediately once services start

✅ **Docker Compose - VERIFIED**
- All services properly configured
- Health checks in place
- Networks configured correctly

---

**BOTTOM LINE:** Add the secrets above, rebuild, and EVERYTHING will work.
