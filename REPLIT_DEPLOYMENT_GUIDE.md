# Replit Deployment Guide - Stream Bot & Dashboard

## Overview
This guide covers deploying the Homelab Dashboard and Stream Bot on Replit for development and testing. Replit provides a cloud-based development environment with automatic SSL, environment secrets management, and easy collaboration.

## Current Deployment Status ✅

### Active Services on Replit
- **Dashboard**: Running on port 5000 (`services/dashboard/`)
- **Stream Bot**: Running on port 3000 (`services/stream-bot/`)

### Configured Workflows
1. **dashboard**: Flask app serving the homelab management interface
2. **stream-bot**: Express.js app with React frontend for multi-platform streaming bot

---

## OAuth Configuration

### Replit Secrets (Secure Credential Storage)
The following OAuth credentials are stored in Replit Secrets (not in `.env` file):

```bash
# Twitch OAuth
TWITCH_CLIENT_ID=5guyyrv237i9v7jk5xod68ce9aeg6i
TWITCH_CLIENT_SECRET=vjpqvcv19d1hjui87asfa152mf0xsm

# YouTube OAuth (Google Cloud Console)
YOUTUBE_CLIENT_ID=[stored in Replit Secrets]
YOUTUBE_CLIENT_SECRET=[stored in Replit Secrets]

# Kick OAuth (Kick Developer Portal)
KICK_CLIENT_ID=[stored in Replit Secrets]
KICK_CLIENT_SECRET=[stored in Replit Secrets]
```

### OAuth Redirect URLs
**IMPORTANT**: These must match EXACTLY in your platform developer consoles:

```
Twitch:  https://stream.rig-city.com/api/auth/twitch/callback
YouTube: https://stream.rig-city.com/api/auth/youtube/callback
Kick:    https://stream.rig-city.com/api/auth/kick/callback
```

### Platform Developer Console URLs
- **Twitch**: https://dev.twitch.tv/console/apps
- **YouTube**: https://console.cloud.google.com/apis/credentials
- **Kick**: https://kick.com/settings/developer

---

## Environment Variables

### Stream Bot Environment Variables
These are set in the `stream-bot` workflow configuration:

```bash
APP_URL="https://${REPLIT_DEV_DOMAIN}"
TWITCH_SIGNIN_CALLBACK_URL="https://${REPLIT_DEV_DOMAIN}/api/auth/twitch/callback"
YOUTUBE_SIGNIN_CALLBACK_URL="https://${REPLIT_DEV_DOMAIN}/api/auth/youtube/callback"
KICK_SIGNIN_CALLBACK_URL="https://${REPLIT_DEV_DOMAIN}/api/auth/kick/callback"
PORT=3000
```

### Dashboard Environment Variables
These are loaded from Replit Secrets and `.env` file:

```bash
# OpenAI API (for Jarvis AI Assistant)
OPENAI_API_KEY=[stored in Replit Secrets]

# Session Management
SESSION_SECRET=[generated securely]
DASHBOARD_API_KEY=[for API access]

# Optional Services (disabled in Replit)
# - Docker management (no Docker daemon on Replit)
# - Redis/Celery (no background tasks on Replit)
# - PostgreSQL (using Neon database on Ubuntu)
```

---

## Database Configuration

### Stream Bot Database
The Stream Bot uses **Drizzle ORM** with PostgreSQL. On Replit, it connects to your Ubuntu server's database:

```typescript
// services/stream-bot/drizzle.config.ts
export default {
  schema: "./shared/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || 
         "postgresql://streambot:streambot123@localhost:5433/streambot"
  }
}
```

**Important**: The `primary_platform` column migration needs to be run on Ubuntu:
```bash
# On Ubuntu server
cd /home/evin/contain/HomeLabHub/services/stream-bot
docker exec stream-bot npm run db:push
```

### Dashboard Database
The dashboard can optionally use PostgreSQL for features like activity logging and workflow management. On Replit, these features are disabled (no `JARVIS_DATABASE_URL` set).

---

## Workflow Management

### Starting Services
Replit automatically runs both workflows when the project starts:

1. **Dashboard** (port 5000): Flask development server
2. **Stream Bot** (port 3000): Vite dev server + Express API

### Restarting Workflows
After changing environment secrets or configuration:

```bash
# Restart dashboard
replit workflows restart dashboard

# Restart stream-bot
replit workflows restart stream-bot
```

### Viewing Logs
Check the Replit console or workflow output for logs:

```bash
# Dashboard logs show:
- Flask server startup
- WebSocket initialization
- Docker/Redis connection status (disabled on Replit)

# Stream Bot logs show:
- Express server on port 3000
- BotManager bootstrap status
- Active bot instances
```

---

## Development Workflow

### Replit → Ubuntu Auto-Sync
Code changes made on Replit automatically sync to your Ubuntu server every 5 minutes:

```bash
# Ubuntu cron job (every 5 minutes)
*/5 * * * * cd /home/evin/contain/HomeLabHub && git pull origin main
```

### Testing OAuth Locally
1. Make changes on Replit
2. Test OAuth flows using Replit's preview URL
3. Once satisfied, changes auto-sync to Ubuntu
4. Rebuild containers on Ubuntu: `docker-compose up -d --build stream-bot`

---

## YouTube OAuth Testing Mode

**IMPORTANT**: Your YouTube OAuth app is currently in "Testing" mode in Google Cloud Console.

### For Test Users
Users added to the "Test users" list in Google Cloud Console can authenticate normally.

### For Non-Test Users
Users will see a verification warning with two options:
1. **Advanced** → **Go to [App Name] (unsafe)** - Allows them to proceed
2. Contact you to be added as a test user

### Publishing Your App
To remove the verification warning for all users, publish your YouTube OAuth app in Google Cloud Console:
1. Go to https://console.cloud.google.com/apis/credentials/consent
2. Complete the OAuth consent screen questionnaire
3. Submit for verification (may take 1-6 weeks)

---

## Security Best Practices ✅

### What's Secured
- ✅ OAuth credentials stored in Replit Secrets (not in `.env` or git)
- ✅ Session secrets use cryptographically secure random values
- ✅ HTTPS enforced on production (Caddy auto-SSL via Let's Encrypt)
- ✅ CORS configured to allow specific origins only
- ✅ Rate limiting enabled on API endpoints

### What to Avoid
- ❌ Never commit `.env` files to git
- ❌ Never share OAuth client secrets publicly
- ❌ Never use the same secrets for development and production
- ❌ Never hardcode API keys in source code

---

## Troubleshooting

### OAuth Callback Errors
**Error**: `redirect_uri_mismatch`

**Solution**: Ensure callback URLs match exactly in developer console:
- Twitch: https://stream.rig-city.com/api/auth/twitch/callback
- YouTube: https://stream.rig-city.com/api/auth/youtube/callback
- Kick: https://stream.rig-city.com/api/auth/kick/callback

### Database Migration Errors
**Error**: `column "primary_platform" does not exist`

**Solution**: Run database migration on Ubuntu server:
```bash
cd /home/evin/contain/HomeLabHub/services/stream-bot
docker exec stream-bot npm run db:push
```

### Environment Variables Not Loading
**Error**: `YOUTUBE_CLIENT_ID is undefined`

**Solution**: 
1. Check Replit Secrets panel - ensure all secrets are added
2. Restart workflows to reload environment variables
3. Verify workflow command includes environment variable exports

### Port Conflicts
**Error**: `Port 3000 already in use`

**Solution**: Only one workflow should bind to each port:
- Dashboard: port 5000 (Flask)
- Stream Bot: port 3000 (Express + Vite)

---

## Next Steps

### For Full Production Deployment on Ubuntu
See `DEPLOYMENT_GUIDE.md` for comprehensive instructions including:
- Docker Compose setup with all services
- Caddy reverse proxy with automatic SSL
- PostgreSQL multi-database configuration
- Systemd service management
- Backup and monitoring setup

### For OAuth App Publishing
1. **YouTube**: Submit OAuth app for verification in Google Cloud Console
2. **Twitch**: No verification needed (automatically approved)
3. **Kick**: Ensure app settings are correct in Kick Developer Portal

### For Database Migrations
Run pending migrations on Ubuntu server:
```bash
cd /home/evin/contain/HomeLabHub/services/stream-bot
docker exec stream-bot npm run db:push
```

---

## Support Resources

- **Replit Docs**: https://docs.replit.com
- **OAuth Platform Docs**:
  - Twitch: https://dev.twitch.tv/docs/authentication
  - YouTube: https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps
  - Kick: https://kick.com/developer/docs
- **Homelab Documentation**: See `replit.md` for project architecture

---

**Last Updated**: November 15, 2025
