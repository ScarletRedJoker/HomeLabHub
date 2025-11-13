# 🔧 Discord OAuth Fix - Redirect URI Configuration

## Problem Identified

Your Discord bot was failing OAuth with "Invalid OAuth2 redirect_uri" error due to two issues:

1. **❌ Wrong callback URL** in docker-compose: `/callback` instead of `/auth/discord/callback`
2. **❌ Missing proxy headers** in Caddyfile for proper OAuth through reverse proxy

---

## ✅ What Was Fixed

### 1. Updated docker-compose.unified.yml

**Before:**
```yaml
DISCORD_CALLBACK_URL: https://bot.rig-city.com/callback
```

**After:**
```yaml
DISCORD_CALLBACK_URL: https://bot.rig-city.com/auth/discord/callback
```

### 2. Updated Caddyfile with Proper Headers

**Before:**
```caddyfile
bot.rig-city.com {
    reverse_proxy discord-bot:5000
}
```

**After:**
```caddyfile
bot.rig-city.com {
    reverse_proxy discord-bot:5000 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
        header_up X-Forwarded-Host {host}
    }
}
```

**Why these headers matter:**
- `X-Forwarded-Proto`: Tells the app it's being accessed via HTTPS
- `X-Forwarded-Host`: Preserves the original domain name
- `Host`: Ensures the correct hostname is seen by the app
- These allow Express/Passport to construct the correct callback URL

---

## 🔑 Update Discord Developer Portal

You **must** update the redirect URI in Discord's developer portal to match the fixed URL.

### Step-by-Step Instructions:

1. **Go to Discord Developer Portal**
   - Visit: https://discord.com/developers/applications
   - Log in with your Discord account

2. **Select Your Application**
   - Find your Discord Ticket Bot application
   - Click on it to open settings

3. **Navigate to OAuth2**
   - In the left sidebar, click **"OAuth2"**
   - Scroll down to **"Redirects"** section

4. **Update Redirect URI**
   - Remove old redirect (if exists): `https://bot.rig-city.com/callback`
   - Add new redirect: **`https://bot.rig-city.com/auth/discord/callback`**
   - Click **"Add Redirect"**
   - Click **"Save Changes"** at the bottom

5. **Verify Configuration**
   - The redirect list should show:
     ```
     https://bot.rig-city.com/auth/discord/callback
     ```

---

## 🚀 Deploy the Fix

**On your Ubuntu server:**

```bash
# 1. Navigate to workspace
cd /home/evin/contain/HomeLabHub

# 2. Pull latest changes
git pull

# 3. Restart services to apply config changes
docker compose -f docker-compose.unified.yml down
docker compose -f docker-compose.unified.yml up -d

# 4. Verify Caddy picked up new config
docker logs caddy --tail=20

# 5. Verify Discord bot started correctly
docker logs discord-bot --tail=50
```

---

## 🧪 Test OAuth Flow

1. **Open your Discord bot web dashboard:**
   ```
   https://bot.rig-city.com
   ```

2. **Click "Login with Discord"**
   - You should be redirected to Discord's OAuth page
   - Discord will show your bot's permissions request
   - Click "Authorize"

3. **You should be redirected back to:**
   ```
   https://bot.rig-city.com/auth/discord/callback
   ```
   - Then automatically redirected to the dashboard
   - You should be logged in

4. **If it works:**
   - ✅ You'll see your Discord username in the dashboard
   - ✅ You can manage tickets
   - ✅ OAuth is working correctly!

---

## 🔍 Troubleshooting

### Still Getting "Invalid OAuth2 redirect_uri"?

**Check these:**

1. **Discord Developer Portal:**
   ```
   Redirect URI: https://bot.rig-city.com/auth/discord/callback
   ```
   - Make sure it's EXACTLY this (no trailing slash, correct path)

2. **Environment Variable:**
   ```bash
   # On Ubuntu server
   cd /home/evin/contain/HomeLabHub
   grep DISCORD_CALLBACK_URL .env
   ```
   - Should show: `DISCORD_CALLBACK_URL=https://bot.rig-city.com/auth/discord/callback`

3. **Container Logs:**
   ```bash
   docker logs discord-bot | grep -i "oauth\|callback"
   ```
   - Look for: "Discord OAuth callback URL: https://bot.rig-city.com/auth/discord/callback"

### Headers Not Being Passed?

**Check Caddy logs:**
```bash
docker logs caddy --tail=50 | grep -i "bot.rig-city"
```

**Reload Caddy config:**
```bash
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## 📝 Other Services Updated

I also added proper proxy headers to:
- ✅ **stream.rig-city.com** (Stream Bot) - for future OAuth if needed
- ✅ **host.evindrake.net** (Dashboard) - for proper HTTPS detection

---

## 🎯 Summary

**Problem:** Discord OAuth redirect mismatch  
**Cause:** Wrong callback path + missing proxy headers  
**Fix:** Updated callback URL to `/auth/discord/callback` + added Caddy headers  
**Action Required:** Update Discord Developer Portal redirect URI  
**Deploy:** `git pull && docker compose up -d`  

Once you update the Discord Developer Portal and redeploy, OAuth will work! 🎉

---

**Need Help?**
- Check Discord bot logs: `docker logs discord-bot --tail=100`
- Check Caddy logs: `docker logs caddy --tail=50`
- Verify environment: `grep DISCORD .env`
