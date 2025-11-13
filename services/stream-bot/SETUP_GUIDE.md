# StreamBot Setup Guide

Complete guide for deploying and configuring StreamBot on any platform.

## 📦 Deployment

### Replit (Easiest)
1. Click "Run" - everything is pre-configured
2. Access your app at your Replit URL
3. Skip to [Create Account](#create-account) below

### Docker/Self-hosted
```bash
# 1. Generate environment file
./scripts/generate-env.sh

# 2. Start the application
docker-compose up -d

# 3. Access at https://stream.rig-city.com (or your domain)
```

### Unified Homelab Deployment
**🚀 Fully automated deployment with STREAMBOT_ prefix support!**

StreamBot automatically detects STREAMBOT_-prefixed variables and handles database provisioning.

#### Quick Start
```bash
# 1. Add to your unified .env file with STREAMBOT_ prefix:
STREAMBOT_DATABASE_URL=postgresql://streambot:password@postgres:5432/streambot
STREAMBOT_SESSION_SECRET=$(openssl rand -hex 32)
STREAMBOT_OPENAI_API_KEY=sk-your-openai-key
STREAMBOT_PRODUCTION_DOMAIN=stream.rig-city.com
STREAMBOT_NODE_ENV=production
STREAMBOT_PORT=5000

# 2. Your unified docker-compose.yml:
services:
  streambot:
    build: ./SnappleBotAI
    container_name: streambot
    env_file:
      - .env  # StreamBot auto-detects STREAMBOT_* variables
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - homelab-network
    restart: unless-stopped
    ports:
      - "5000:5000"
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"]
      interval: 30s
      timeout: 10s
      retries: 3

# 3. Deploy
docker compose -f docker-compose.unified.yml up -d --build streambot
```

#### How Auto-Detection Works
- StreamBot checks for `STREAMBOT_` prefixed variables first, then unprefixed
- Priority: `STREAMBOT_DATABASE_URL` → `DATABASE_URL` → error
- No docker-compose variable mapping needed!

#### Database Setup
```bash
# Option 1: Run provisioning script on host (recommended)
cd SnappleBotAI
export DATABASE_URL="postgresql://streambot:password@localhost:5432/streambot"
./scripts/provision-db.sh

# Option 2: Run inside container (requires dev dependencies)
docker exec streambot npm run db:push
```

**Note:** The production Docker container only includes production dependencies. For automated migrations, run the provisioning script on the host before starting the container.

---

## 👤 Create Account

### 1. Access the App
Navigate to `https://stream.rig-city.com` (or your deployed URL)

### 2. Sign Up
1. Click "Sign Up"
2. Enter your email and password
3. You're automatically logged in!

## 🔌 Connect Streaming Platforms

StreamBot supports **Twitch**, **YouTube Live**, and **Kick**! Connect any or all platforms.

#### 🟣 Connect Twitch

##### Get Your Twitch OAuth Token
1. Visit [https://twitchapps.com/tmi/](https://twitchapps.com/tmi/)
2. Click "Connect" and authorize the application
3. **Copy the entire OAuth token** (it starts with `oauth:`)
   - Example: `oauth:a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
   - ⚠️ **Keep this secret!** Never share it publicly

##### Connect in Dashboard
1. Go to the **Dashboard** page
2. Find the **Twitch** card
3. Click **"Connect"**
4. In the dialog that appears, fill in:
   - **Channel Name**: Your Twitch username (e.g., `yourname`)
   - **OAuth Token**: Paste the token from step 3 above
   - **Bot Username**: (Optional) Leave empty to use your channel name
5. Click **"Connect Channel"**

✅ Your Twitch channel is now connected!

---

#### 🔴 Connect YouTube Live

YouTube uses Replit's secure integration - no manual OAuth tokens needed!

1. Go to the **Dashboard** page
2. Find the **YouTube** card
3. Click **"Connect"**
4. Click **"Connect Channel"** in the dialog
5. **Important**: Make sure you have an **active livestream** running
   - The bot will automatically post to your active livestream's chat
   - If no livestream is active, posting will fail

✅ Your YouTube channel is now connected!

**Note**: YouTube connector is already set up via Replit integrations. The bot will automatically detect your active livestream and post to its chat.

---

#### 🟢 Connect Kick

Kick supports both read-only (listen to chat) and full posting mode.

##### Read-Only Mode (No Credentials)
1. Go to the **Dashboard** page
2. Find the **Kick** card
3. Click **"Connect"**
4. Enter your **Kick channel name** (lowercase)
5. Leave **Bearer Token** and **Cookies** empty
6. Click **"Connect Channel"**

✅ Your Kick channel is connected in read-only mode!

##### Full Mode (With Posting)
To enable posting facts to Kick chat, you need authentication credentials:

1. Log in to Kick.com in your browser
2. Open Developer Tools (F12) → Application/Storage → Cookies
3. Find your Kick.com cookies (specifically look for session cookies)
4. In the Dashboard, click **"Connect"** on the Kick card
5. Enter:
   - **Channel Name**: Your Kick channel name (lowercase)
   - **Bearer Token**: Your Kick bearer token (optional)
   - **Cookies**: Session cookies from your browser (optional)
6. Click **"Connect Channel"**

✅ Your Kick channel is now connected with full posting capabilities!

---

### 3. Configure Your Bot

1. Go to the **Settings** page
2. Configure posting behavior:
   - **Posting Mode**: Choose how often to post facts
     - **Manual Only**: Post on-demand via the Quick Trigger button
     - **Fixed Interval**: Post every X minutes (1-1440)
     - **Random Range**: Post at random intervals (e.g., every 15-60 minutes)
   
3. Configure AI settings:
   - **AI Model**: Choose gpt-5, gpt-5-mini, or gpt-4.1-mini
   - **Custom Prompt**: (Optional) Customize the fact generation style
   - **Temperature**: Creativity level (0.1-2.0, default 1.0)

4. Configure chat triggers:
   - **Enable Chat Triggers**: Allow viewers to request facts
   - **Keywords**: Commands viewers can use (default: `!snapple`, `!fact`)

5. **Important**: Toggle **"Bot Active"** to ON
6. Click **"Save Settings"**

### 4. Test Your Bot!

#### Option 1: Manual Trigger
1. Go to **Quick Trigger** page
2. Click **"Generate Preview"** to test fact generation
3. Click **"Post Now"** to send a fact to your Twitch channel
4. Check your Twitch chat - you should see the bot post a fact!

#### Option 2: Automatic Posting
- If you enabled Fixed/Random interval mode, the bot will automatically post facts
- Check the **Activity** page to see live updates

#### Option 3: Chat Commands
- In your Twitch chat, type `!snapple` or `!fact`
- The bot will respond with a fresh fact!

---

## 📊 Monitoring Your Bot

### Dashboard
- See connection status for all platforms
- View statistics (total facts posted, this week, active platforms)

### Activity Page
- **Real-time** bot status
- Live feed of recent facts
- See when facts are posted and to which platform

### History Page
- Complete searchable history of all posted facts
- Filter by platform, trigger type, or status
- Export to CSV for analysis

---

## 🔧 Troubleshooting

### Bot Won't Connect
- ✅ **Check OAuth token**: Make sure you copied the entire token including `oauth:`
- ✅ **Token expired?**: Get a new token from [twitchapps.com/tmi](https://twitchapps.com/tmi/)
- ✅ **Channel name correct?**: Use your exact Twitch username (no @ symbol)

### Bot Not Posting
- ✅ **Is bot active?**: Check Settings → Toggle "Bot Active" to ON
- ✅ **Platform connected?**: Dashboard should show Twitch as "Connected"
- ✅ **Posting mode configured?**: Settings → Choose Fixed Interval or Random Range
- ✅ **Check Activity page**: See if there are any error messages

### Chat Commands Not Working
- ✅ **Chat triggers enabled?**: Settings → Enable Chat Triggers = ON
- ✅ **Correct keywords?**: Default is `!snapple` and `!fact` (case-sensitive)
- ✅ **Bot is active?**: Settings → Bot Active = ON

### Facts Look Wrong
- ✅ **Customize prompt**: Settings → AI Settings → Prompt Template
- ✅ **Adjust temperature**: Lower = more consistent, Higher = more creative
- ✅ **Try different model**: gpt-5-mini is faster, gpt-5 is more creative

---

## 🛡️ Security Best Practices

1. **Never share your OAuth token** - It's like a password for your Twitch account
2. **Change your password regularly** - Profile → Change Password
3. **Monitor Activity page** - Watch for unexpected posts
4. **Revoke tokens if compromised**: Get a new OAuth token from Twitch

---

## 🎯 Advanced Tips

### Multiple Platforms (Coming Soon)
- YouTube Live and Kick support is planned
- You'll be able to post to all platforms simultaneously

### Custom Fact Styles
Edit your **Prompt Template** in Settings to customize fact style:
```
Generate a fun dad joke in the style of Snapple facts. 
Keep it under 200 characters and make it family-friendly.
```

### Optimal Posting Intervals
- **High engagement**: 15-30 minute random range
- **Moderate**: 30-60 minute fixed interval
- **Low frequency**: 2-4 hour random range

---

## 📞 Need Help?

- **Check the Activity page** for real-time error messages
- **Review message history** for patterns in failed posts
- **Verify all settings** are configured correctly

---

## ⚡ Environment Variables (For Self-Hosting)

If you're deploying StreamBot yourself, you need these environment variables:

### Required
```bash
# Database
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Session Security (generate with: openssl rand -base64 32)
SESSION_SECRET=your-secure-random-32-char-string

# OpenAI API (for AI fact generation)
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1

# Application
NODE_ENV=production
PORT=5000
```

### Optional
```bash
# For future OAuth flows (not currently used)
TWITCH_CLIENT_ID=your-twitch-client-id
TWITCH_CLIENT_SECRET=your-twitch-client-secret
```

---

**You're all set! Enjoy your AI-powered Twitch bot! 🎉**
