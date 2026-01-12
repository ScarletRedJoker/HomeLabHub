# Complete Credentials Setup Guide

This guide walks you through obtaining EVERY credential needed for your homelab. Follow these steps IN ORDER before running any deployment scripts.

---

## BEFORE YOU START

**BACKUP YOUR CURRENT .ENV FIRST:**
```bash
cp /opt/homelab/HomeLabHub/.env /opt/homelab/HomeLabHub/.env.backup.$(date +%Y%m%d)
```

**NEVER run `cp .env.example .env`** - this overwrites your existing secrets. Instead use:
```bash
./deploy/scripts/bootstrap.sh --merge-env --generate-secrets
```

---

## CREDENTIAL CHECKLIST

Check off each one as you obtain it:

| Credential | Required For | Status |
|------------|--------------|--------|
| DISCORD_BOT_TOKEN | Discord Bot | [ ] |
| DISCORD_CLIENT_ID | Discord Bot | [ ] |
| DISCORD_CLIENT_SECRET | Discord Bot | [ ] |
| OPENAI_API_KEY | Jarvis AI, Stream Bot Facts | [ ] |
| TWITCH_CLIENT_ID | Stream Bot | [ ] |
| TWITCH_CLIENT_SECRET | Stream Bot | [ ] |
| YOUTUBE_CLIENT_ID | Stream Bot | [ ] |
| YOUTUBE_CLIENT_SECRET | Stream Bot | [ ] |
| YOUTUBE_REFRESH_TOKEN | Stream Bot | [ ] |
| SPOTIFY_CLIENT_ID | Stream Bot | [ ] |
| SPOTIFY_CLIENT_SECRET | Stream Bot | [ ] |
| SPOTIFY_REFRESH_TOKEN | Stream Bot | [ ] |
| CLOUDFLARE_API_TOKEN | DNS Automation | [ ] |
| CLOUDFLARE_ZONE_ID_EVINDRAKE | DNS for evindrake.net | [ ] |
| CLOUDFLARE_ZONE_ID_RIGCITY | DNS for rig-city.com | [ ] |
| CLOUDFLARE_ZONE_ID_SCARLETREDJOKER | DNS for scarletredjoker.com | [ ] |
| KICK_CLIENT_ID | Stream Bot (Kick) | [ ] |
| KICK_CLIENT_SECRET | Stream Bot (Kick) | [ ] |

---

## 1. DISCORD CREDENTIALS

### Where to get them:
https://discord.com/developers/applications

### Steps:
1. Go to Discord Developer Portal
2. Select your existing application (or create new)
3. Copy these values:

**From "General Information" tab:**
- `DISCORD_CLIENT_ID` = Application ID

**From "Bot" tab:**
- `DISCORD_BOT_TOKEN` = Click "Reset Token" to see it (save immediately, shown only once)

**From "OAuth2" tab:**
- `DISCORD_CLIENT_SECRET` = Client Secret (click "Reset Secret" if needed)

**Add Redirect URI:**
Under OAuth2 → Redirects, add:
```
https://bot.evindrake.net/auth/discord/callback
```

---

## 2. OPENAI CREDENTIALS

### Where to get them:
https://platform.openai.com/api-keys

### Steps:
1. Log in to OpenAI
2. Go to API Keys
3. Click "Create new secret key"
4. Name it "HomeLabHub"
5. Copy the key immediately (shown only once)

**Add to .env:**
```ini
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
```

---

## 3. TWITCH CREDENTIALS

### Where to get them:
https://dev.twitch.tv/console/apps

### Steps:
1. Log in with your Twitch account
2. Click "Register Your Application"
3. Fill in:
   - Name: `SnappleBotAI` (or your bot name)
   - OAuth Redirect URLs: `https://stream.evindrake.net/api/auth/twitch/callback`
   - Category: Chat Bot
4. Click "Create"
5. Click "Manage" on your new app
6. Copy:
   - `TWITCH_CLIENT_ID` = Client ID
   - `TWITCH_CLIENT_SECRET` = Click "New Secret"

---

## 4. YOUTUBE CREDENTIALS (Including Refresh Token)

This is more complex because you need a refresh token.

### Step 4.1: Create OAuth Credentials

**Where:** https://console.cloud.google.com/apis/credentials

1. Select or create a project
2. Click "Create Credentials" → "OAuth client ID"
3. Application type: "Web application"
4. Name: "StreamBot YouTube"
5. Authorized redirect URIs: Add `https://stream.evindrake.net/api/auth/youtube/callback`
6. Click "Create"
7. Copy:
   - `YOUTUBE_CLIENT_ID` = Client ID
   - `YOUTUBE_CLIENT_SECRET` = Client Secret

### Step 4.2: Enable YouTube Data API

1. Go to: https://console.cloud.google.com/apis/library/youtube.googleapis.com
2. Click "Enable"

### Step 4.3: Get Refresh Token

**Option A: Use the Stream Bot OAuth Flow**
1. Start Stream Bot with your client ID/secret configured
2. Go to https://stream.evindrake.net
3. Click "Connect YouTube"
4. Authorize your YouTube channel
5. The refresh token will be saved automatically in your database

**Option B: Manual Token Generation (if stream bot isn't running)**

1. Open this URL in your browser (replace YOUR_CLIENT_ID):
```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=https://stream.evindrake.net/api/auth/youtube/callback&response_type=code&scope=https://www.googleapis.com/auth/youtube.readonly&access_type=offline&prompt=consent
```

2. Authorize with your Google account
3. You'll be redirected to a URL like:
   `https://stream.evindrake.net/api/auth/youtube/callback?code=XXXXXXX`
4. Copy the `code` parameter
5. Exchange it for tokens using curl:

```bash
curl -X POST https://oauth2.googleapis.com/token \
  -d "code=YOUR_CODE" \
  -d "client_id=YOUR_CLIENT_ID" \
  -d "client_secret=YOUR_CLIENT_SECRET" \
  -d "redirect_uri=https://stream.evindrake.net/api/auth/youtube/callback" \
  -d "grant_type=authorization_code"
```

6. Copy the `refresh_token` from the response

---

## 5. SPOTIFY CREDENTIALS (Including Refresh Token)

### Step 5.1: Create Spotify App

**Where:** https://developer.spotify.com/dashboard

1. Log in to Spotify Developer Dashboard
2. Click "Create app"
3. Fill in:
   - App name: "StreamBot"
   - App description: "Stream overlay integration"
   - Redirect URIs: `https://stream.evindrake.net/api/auth/spotify/callback`
   - APIs: Check "Web API"
4. Click "Create"
5. Go to Settings and copy:
   - `SPOTIFY_CLIENT_ID` = Client ID
   - `SPOTIFY_CLIENT_SECRET` = Client Secret

### Step 5.2: Get Refresh Token

**Option A: Use Stream Bot OAuth Flow**
1. Start Stream Bot
2. Go to https://stream.evindrake.net
3. Click "Connect Spotify"
4. Authorize with your Spotify account
5. Token saved automatically

**Option B: Manual Generation**

1. Open this URL (replace YOUR_CLIENT_ID):
```
https://accounts.spotify.com/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://stream.evindrake.net/api/auth/spotify/callback&scope=user-read-currently-playing%20user-read-playback-state
```

2. Authorize with Spotify
3. Copy the `code` from the redirect URL
4. Exchange for tokens:

```bash
# First, create base64 of client_id:client_secret
AUTH=$(echo -n "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" | base64)

curl -X POST https://accounts.spotify.com/api/token \
  -H "Authorization: Basic $AUTH" \
  -d "grant_type=authorization_code" \
  -d "code=YOUR_CODE" \
  -d "redirect_uri=https://stream.evindrake.net/api/auth/spotify/callback"
```

5. Copy `refresh_token` from response

---

## 6. CLOUDFLARE CREDENTIALS

### Step 6.1: Create API Token

**Where:** https://dash.cloudflare.com/profile/api-tokens

1. Click "Create Token"
2. Use "Edit zone DNS" template
3. Permissions (keep these):
   - Zone - Zone - Read
   - Zone - DNS - Edit
4. Zone Resources:
   - Include - Specific zone - (select each domain)
   - Add all three: evindrake.net, rig-city.com, scarletredjoker.com
5. Click "Continue to summary" → "Create Token"
6. Copy the token immediately (shown only once)

**Add to .env:**
```ini
CLOUDFLARE_API_TOKEN=your_token_here
```

### Step 6.2: Get Zone IDs

For each domain:
1. Go to https://dash.cloudflare.com
2. Click on the domain
3. Scroll down on the right sidebar to find "Zone ID"
4. Copy each one:

```ini
CLOUDFLARE_ZONE_ID_EVINDRAKE=xxxxxxxxxxxxx       # for evindrake.net
CLOUDFLARE_ZONE_ID_RIGCITY=xxxxxxxxxxxxx         # for rig-city.com
CLOUDFLARE_ZONE_ID_SCARLETREDJOKER=xxxxxxxxxxxxx # for scarletredjoker.com
```

---

## 7. KICK CREDENTIALS (Optional)

You already have `KICK_CLIENT_ID` as a secret. 

**Where:** https://kick.com/developers (if available)

Note: Kick's API is currently in limited access. If you have credentials, add:
```ini
KICK_CLIENT_ID=your_id
KICK_CLIENT_SECRET=your_secret
KICK_REDIRECT_URI=https://stream.evindrake.net/api/auth/kick/callback
```

---

## 8. AUTO-GENERATED CREDENTIALS

These are generated automatically by the bootstrap script. You don't need to set them manually:

- POSTGRES_PASSWORD
- DISCORD_DB_PASSWORD
- STREAMBOT_DB_PASSWORD
- JARVIS_DB_PASSWORD
- WEB_PASSWORD (unless you want a specific one)
- SESSION_SECRET
- SECRET_KEY
- DISCORD_SESSION_SECRET
- STREAMBOT_SESSION_SECRET
- SERVICE_AUTH_TOKEN
- DASHBOARD_API_KEY
- CODE_SERVER_PASSWORD

---

## FINAL .ENV TEMPLATE

After gathering all credentials, your .env should have these filled in:

```ini
# === YOU MUST SET THESE ===
WEB_USERNAME=admin

# Discord
DISCORD_BOT_TOKEN=your_token
DISCORD_CLIENT_ID=your_id
DISCORD_CLIENT_SECRET=your_secret

# OpenAI
OPENAI_API_KEY=sk-proj-your_key

# Twitch
TWITCH_CLIENT_ID=your_id
TWITCH_CLIENT_SECRET=your_secret

# YouTube
YOUTUBE_CLIENT_ID=your_id
YOUTUBE_CLIENT_SECRET=your_secret
YOUTUBE_REFRESH_TOKEN=your_token

# Spotify
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
SPOTIFY_REFRESH_TOKEN=your_token

# Cloudflare
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ZONE_ID_EVINDRAKE=your_zone_id
CLOUDFLARE_ZONE_ID_RIGCITY=your_zone_id
CLOUDFLARE_ZONE_ID_SCARLETREDJOKER=your_zone_id

# Local host IP (run `tailscale ip -4` on your Ubuntu host)
LOCAL_TAILSCALE_IP=100.x.x.x

# === AUTO-GENERATED (don't set manually) ===
# POSTGRES_PASSWORD, SESSION_SECRET, etc. - handled by bootstrap
```

---

## DEPLOYMENT COMMAND

After filling in ALL required values:

```bash
cd /opt/homelab/HomeLabHub

# Backup first!
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Run bootstrap (this MERGES, doesn't overwrite)
./deploy/scripts/bootstrap.sh --role cloud --merge-env --generate-secrets

# Start services
docker compose up -d

# Verify
docker compose ps
```

---

## TROUBLESHOOTING

### "OAuth refresh token invalid"
- Re-run the OAuth flow for that service
- Make sure redirect URI matches exactly

### "API key invalid"
- Check for extra spaces or newlines in .env
- Regenerate the key from the provider

### ".env got overwritten"
- NEVER use `cp .env.example .env`
- Always use `--merge-env` flag with bootstrap
- Keep backups!
