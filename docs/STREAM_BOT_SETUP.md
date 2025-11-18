# Stream-Bot Setup Documentation

## Overview

Stream-Bot is a multi-platform AI-powered chatbot for Twitch, YouTube, and Kick streaming platforms. It provides automated facts/messages, custom commands, giveaways, moderation, currency systems, and analytics for streamers.

## Architecture

- **Multi-tenant**: Each streamer gets their own isolated bot instance and database storage
- **OAuth-first**: Users authenticate via Twitch/YouTube/Kick OAuth to connect their streaming accounts
- **Database-driven**: PostgreSQL stores user accounts, platform connections, bot configurations, and all historical data
- **Worker-based**: Bot Manager spawns individual worker processes for each active user's bot instance
- **Real-time**: WebSocket connections provide live updates to the dashboard

---

## Prerequisites

### 1. PostgreSQL Database

The `discord-bot-db` container must be running and healthy. This shared PostgreSQL instance hosts three separate databases:
- `ticketbot` (Discord bot)
- `streambot` (Stream-bot) ← **This is what we use**
- `homelab_jarvis` (Dashboard/Jarvis)

The database is automatically initialized via `/config/postgres-init/00-create-streambot.sh` which creates the `streambot` database and `streambot` user.

### 2. OAuth Application Registration

You **must** register OAuth applications with streaming platforms to enable user authentication and bot functionality.

#### **Twitch (Required)**

1. Go to [Twitch Developers Console](https://dev.twitch.tv/console)
2. Create a new application:
   - **Name**: Stream-Bot (or your custom name)
   - **OAuth Redirect URLs**: `https://stream.rig-city.com/api/auth/twitch/callback`
   - **Category**: Chat Bot
3. Copy the **Client ID** and **Client Secret**

#### **YouTube (Optional)**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or use existing
3. Enable **YouTube Data API v3**
4. Create OAuth 2.0 credentials:
   - **Application type**: Web application
   - **Authorized redirect URIs**: `https://stream.rig-city.com/api/auth/youtube/callback`
5. Copy the **Client ID** and **Client Secret**

#### **Kick (Optional)**

1. Go to [Kick Developers](https://kick.com/developer) (if available)
2. Register an application with:
   - **Redirect URI**: `https://stream.rig-city.com/api/auth/kick/callback`
3. Copy the **Client ID** and **Client Secret**

> **Note**: As of November 2025, Kick's official OAuth API may be in beta or limited availability. Check their developer documentation.

---

## Required Environment Variables

Add these to your `.env` file in the project root:

```bash
# Database Connection (REQUIRED)
STREAMBOT_DB_PASSWORD=<secure-password>
DATABASE_URL=postgresql://streambot:${STREAMBOT_DB_PASSWORD}@discord-bot-db:5432/streambot

# Session Management (REQUIRED)
STREAMBOT_SESSION_SECRET=<generate-with: openssl rand -base64 32>

# OpenAI API for AI Features (REQUIRED for facts generation)
STREAMBOT_OPENAI_API_KEY=<your-openai-api-key>
# OR use the shared OPENAI_API_KEY if already set
OPENAI_API_KEY=<your-openai-api-key>

# Twitch OAuth (REQUIRED - Primary authentication)
TWITCH_CLIENT_ID=<your-twitch-client-id>
TWITCH_CLIENT_SECRET=<your-twitch-client-secret>
TWITCH_SIGNIN_CALLBACK_URL=https://stream.rig-city.com/api/auth/twitch/callback

# Application URL (REQUIRED)
APP_URL=https://stream.rig-city.com
```

### Variable Explanations

| Variable | Purpose | Example |
|----------|---------|---------|
| `STREAMBOT_DB_PASSWORD` | PostgreSQL password for `streambot` user | `my-secure-db-password-123` |
| `DATABASE_URL` | Full connection string to streambot database | `postgresql://streambot:password@discord-bot-db:5432/streambot` |
| `STREAMBOT_SESSION_SECRET` | Secret key for session encryption (generate with `openssl rand -base64 32`) | `Kj8Hd9sL2mN4pQ6rT8vW0xYz...` |
| `STREAMBOT_OPENAI_API_KEY` | OpenAI API key for AI fact generation (OR use `OPENAI_API_KEY`) | `sk-proj-...` |
| `TWITCH_CLIENT_ID` | Twitch OAuth application client ID | `abc123xyz456...` |
| `TWITCH_CLIENT_SECRET` | Twitch OAuth application secret | `def789uvw012...` |
| `TWITCH_SIGNIN_CALLBACK_URL` | OAuth redirect URL (must match Twitch app settings) | `https://stream.rig-city.com/api/auth/twitch/callback` |
| `APP_URL` | Public URL where Stream-Bot is hosted | `https://stream.rig-city.com` |

---

## Optional Environment Variables

```bash
# YouTube OAuth (Optional)
YOUTUBE_CLIENT_ID=<your-youtube-client-id>
YOUTUBE_CLIENT_SECRET=<your-youtube-client-secret>
YOUTUBE_SIGNIN_CALLBACK_URL=https://stream.rig-city.com/api/auth/youtube/callback

# Kick OAuth (Optional)
KICK_CLIENT_ID=<your-kick-client-id>
KICK_CLIENT_SECRET=<your-kick-client-secret>
KICK_SIGNIN_CALLBACK_URL=https://stream.rig-city.com/api/auth/kick/callback

# Custom OpenAI Endpoint (Optional - for Azure OpenAI, LocalAI, etc.)
STREAMBOT_OPENAI_BASE_URL=https://your-custom-openai-endpoint.com/v1

# Node Environment (Optional - defaults to 'production')
STREAMBOT_NODE_ENV=production

# Port Override (Optional - defaults to 5000)
# WARNING: Only port 5000 is exposed through reverse proxy
STREAMBOT_PORT=5000
```

---

## Deployment Steps

### Step 1: Set Environment Variables

Create or update your `.env` file with all required variables:

```bash
cd /path/to/HomeLabHub
nano .env
```

Ensure you have:
- `STREAMBOT_DB_PASSWORD`
- `STREAMBOT_SESSION_SECRET`
- `OPENAI_API_KEY` or `STREAMBOT_OPENAI_API_KEY`
- `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`
- `TWITCH_SIGNIN_CALLBACK_URL`
- `APP_URL`

### Step 2: Database Migrations

Stream-Bot uses [Drizzle ORM](https://orm.drizzle.team/) for database schema management. The database schema is automatically pushed on container startup, but you can also run migrations manually:

**Automatic (Recommended):**
```bash
docker compose -f docker-compose.unified.yml up -d stream-bot
```

The container will automatically:
1. Connect to PostgreSQL
2. Run Drizzle schema migrations
3. Create all required tables
4. Start the server

**Manual Migration (Advanced):**
```bash
# Enter the running container
docker exec -it stream-bot sh

# Run migrations
npm run db:push

# Exit container
exit
```

### Step 3: Start Stream-Bot Container

```bash
cd /path/to/HomeLabHub
docker compose -f docker-compose.unified.yml up -d stream-bot
```

### Step 4: Verify Health

Wait 30-40 seconds for the service to fully start, then check health:

```bash
# Basic health check
curl http://localhost:5000/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-11-18T12:00:00.000Z",
#   "uptime": 42,
#   "service": "stream-bot"
# }

# Detailed health (includes bot stats)
curl http://localhost:5000/api/health
```

### Step 5: Check Logs

```bash
docker logs stream-bot --tail 50 -f
```

Look for:
- ✅ `[BotManager] Bootstrapping...`
- ✅ `[BotManager] Found N active bot instances`
- ✅ `serving on port 5000`
- ❌ Avoid: Connection errors, missing environment variables

---

## Initial Onboarding Flow

### User Perspective

1. **Navigate to Stream-Bot**
   - Go to `https://stream.rig-city.com` in your browser

2. **Sign In with Twitch/YouTube/Kick**
   - Click "Sign in with Twitch" (or other platform)
   - Authorize the OAuth application
   - You'll be redirected back to Stream-Bot dashboard

3. **Automatic Setup**
   - OAuth callback creates:
     - User account in `users` table
     - Platform connection in `platform_connections` table
     - Bot configuration in `bot_configs` table
     - Bot instance in `bot_instances` table with `status='running'`

4. **Bot Auto-Start**
   - Bot Manager detects the new `bot_instance` with `status='running'`
   - Automatically spawns a BotWorker for your user
   - Worker connects to your streaming platform chat
   - You can now configure and use the bot!

### Technical Flow

```
User clicks "Sign in with Twitch"
  ↓
OAuth redirect to Twitch
  ↓
User authorizes application
  ↓
Twitch redirects to /api/auth/twitch/callback
  ↓
Passport.js OAuth strategy validates tokens
  ↓
User record created/updated in database
  ↓
platform_connections record created with tokens
  ↓
bot_configs record created with defaults
  ↓
bot_instances record created with status='running'
  ↓
Bot Manager bootstrap detects new instance
  ↓
BotWorker spawned and connected to chat
  ↓
User redirected to dashboard
```

---

## Troubleshooting

### "Found 0 active bot instances" in logs

**Cause**: No users have signed in via OAuth yet, OR bot instances exist but are not marked `status='running'`.

**Solutions**:

1. **Check if any users exist**:
   ```bash
   docker exec -it discord-bot-db psql -U streambot -d streambot -c "SELECT id, email, primary_platform FROM users;"
   ```

2. **Check bot instances**:
   ```bash
   docker exec -it discord-bot-db psql -U streambot -d streambot -c "SELECT user_id, status, last_heartbeat FROM bot_instances;"
   ```

3. **If bot instances are 'stopped', manually update to 'running'**:
   ```bash
   docker exec -it discord-bot-db psql -U streambot -d streambot -c "UPDATE bot_instances SET status='running', updated_at=NOW() WHERE status='stopped';"
   ```

4. **Restart Stream-Bot to reload**:
   ```bash
   docker restart stream-bot
   ```

### Healthcheck Failing

**Symptoms**:
```bash
docker ps
# Shows stream-bot as "unhealthy"
```

**Causes & Solutions**:

1. **Wrong healthcheck syntax (CMD vs CMD-SHELL)**:
   - ✅ Correct: `test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1"]`
   - ❌ Wrong: `test: ["CMD", "wget", "...", "||", "exit", "1"]` (treats || as literal argument)

2. **Service not listening on port 5000**:
   ```bash
   docker exec -it stream-bot sh
   netstat -tuln | grep 5000
   # Should show: tcp        0      0 0.0.0.0:5000            0.0.0.0:*               LISTEN
   ```

3. **Service crashed on startup**:
   ```bash
   docker logs stream-bot
   # Look for startup errors, missing env vars, database connection failures
   ```

### Bot Not Connecting to Chat

**Symptoms**: Bot instance shows `status='running'` but doesn't respond in chat.

**Solutions**:

1. **Check OAuth tokens are valid**:
   ```bash
   docker exec -it discord-bot-db psql -U streambot -d streambot -c "SELECT platform, is_connected, last_connected_at FROM platform_connections;"
   ```

2. **Verify callback URLs match OAuth app settings**:
   - Twitch app redirect URL must EXACTLY match `TWITCH_SIGNIN_CALLBACK_URL`
   - Check for trailing slashes, http vs https, domain spelling

3. **Check bot worker logs**:
   ```bash
   docker logs stream-bot | grep -i "BotWorker\|twitch\|error"
   ```

4. **Restart user's bot instance**:
   - Via dashboard: Click "Restart Bot"
   - Via API: `POST /api/bot/restart` (requires auth)

### Session/Login Issues

**Symptoms**: Can't log in, session doesn't persist, logged out immediately.

**Causes & Solutions**:

1. **Missing SESSION_SECRET**:
   ```bash
   # Check .env file
   grep SESSION_SECRET .env
   
   # If missing, add it:
   echo "STREAMBOT_SESSION_SECRET=$(openssl rand -base64 32)" >> .env
   docker restart stream-bot
   ```

2. **Cookie domain mismatch**:
   - Ensure `APP_URL` matches your actual domain
   - Check browser dev tools → Application → Cookies

3. **Database session table not created**:
   ```bash
   docker exec -it discord-bot-db psql -U streambot -d streambot -c "\dt user_sessions"
   # Should show: user_sessions table
   ```

---

## Operational Checks

### Check Container Logs

```bash
# Last 100 lines
docker logs stream-bot --tail 100

# Follow live logs
docker logs stream-bot -f

# Search for errors
docker logs stream-bot | grep -i error

# Search for specific user's bot activity
docker logs stream-bot | grep "user-id-here"
```

### Verify Health Endpoint

```bash
# Basic health (always returns 200 if server is up)
curl http://localhost:5000/health

# Detailed health (includes database connectivity)
curl http://localhost:5000/ready

# Full diagnostics (WebSocket, bot stats, OpenAI config)
curl http://localhost:5000/api/diagnostics

# Enhanced health (platform connections, user counts)
curl http://localhost:5000/api/health
```

### Check Bot Instances in Database

```bash
# View all bot instances
docker exec -it discord-bot-db psql -U streambot -d streambot -c "
SELECT 
  bi.user_id, 
  u.email, 
  bi.status, 
  bi.last_heartbeat, 
  bi.started_at 
FROM bot_instances bi 
JOIN users u ON u.id = bi.user_id;"

# Count active instances
docker exec -it discord-bot-db psql -U streambot -d streambot -c "
SELECT status, COUNT(*) 
FROM bot_instances 
GROUP BY status;"
```

### Check Platform Connections

```bash
# View all platform connections
docker exec -it discord-bot-db psql -U streambot -d streambot -c "
SELECT 
  pc.user_id, 
  u.email, 
  pc.platform, 
  pc.platform_username, 
  pc.is_connected, 
  pc.last_connected_at 
FROM platform_connections pc 
JOIN users u ON u.id = pc.user_id 
ORDER BY pc.last_connected_at DESC;"
```

### Monitor Resource Usage

```bash
# Container stats (CPU, memory, network)
docker stats stream-bot

# Check memory usage
docker exec stream-bot sh -c "cat /proc/meminfo | grep -i memavailable"

# Check disk usage
docker exec stream-bot df -h
```

---

## Optional: Test Bot Instance SQL Seed

For staging/development environments, you can manually insert a test bot instance. **Note**: This requires valid OAuth tokens from a real user sign-in.

### Step 1: Create Test User

```sql
INSERT INTO users (id, email, primary_platform, role, is_active, onboarding_completed)
VALUES (
  gen_random_uuid(), 
  'test@example.com', 
  'twitch', 
  'user', 
  true, 
  true
)
RETURNING id;
-- Copy the returned ID for next steps
```

### Step 2: Create Platform Connection

```sql
-- Replace <user-id> with the ID from Step 1
-- Replace token values with REAL tokens from OAuth callback
INSERT INTO platform_connections (
  user_id, 
  platform, 
  platform_user_id, 
  platform_username, 
  access_token, 
  refresh_token, 
  token_expires_at, 
  is_connected
)
VALUES (
  '<user-id>', 
  'twitch', 
  '12345678', 
  'test_streamer', 
  'REAL_ACCESS_TOKEN_HERE',  -- ⚠️ Must be valid
  'REAL_REFRESH_TOKEN_HERE', -- ⚠️ Must be valid
  NOW() + INTERVAL '30 days', 
  true
);
```

### Step 3: Create Bot Config

```sql
INSERT INTO bot_configs (user_id, interval_mode, ai_model, is_active)
VALUES (
  '<user-id>', 
  'manual', 
  'gpt-4o-mini', 
  true
);
```

### Step 4: Create Bot Instance

```sql
INSERT INTO bot_instances (user_id, status, started_at, last_heartbeat)
VALUES (
  '<user-id>', 
  'running', 
  NOW(), 
  NOW()
);
```

### Step 5: Restart Stream-Bot

```bash
docker restart stream-bot
```

The Bot Manager will detect the new `running` instance and spawn a worker.

---

## Advanced Configuration

### Custom OpenAI Endpoint (Azure OpenAI, LocalAI, etc.)

If using a custom OpenAI-compatible endpoint:

```bash
# .env
STREAMBOT_OPENAI_BASE_URL=https://your-azure-openai.openai.azure.com/
STREAMBOT_OPENAI_API_KEY=<your-azure-key>
```

### Multiple Domains (Development + Production)

Update callback URLs to support multiple environments:

**Twitch OAuth App**:
- Add both callback URLs:
  - `https://stream.rig-city.com/api/auth/twitch/callback` (production)
  - `http://localhost:5000/api/auth/twitch/callback` (local dev)

**Environment Variables**:
```bash
# Production
APP_URL=https://stream.rig-city.com
TWITCH_SIGNIN_CALLBACK_URL=https://stream.rig-city.com/api/auth/twitch/callback

# Development (override in .env.local)
APP_URL=http://localhost:5000
TWITCH_SIGNIN_CALLBACK_URL=http://localhost:5000/api/auth/twitch/callback
```

---

## Database Schema Reference

### Key Tables

- **users**: User accounts (created via OAuth)
- **platform_connections**: OAuth tokens and platform metadata
- **bot_configs**: Per-user bot settings (interval, AI model, triggers)
- **bot_instances**: Running bot status and health tracking
- **message_history**: All posted facts/messages
- **custom_commands**: User-defined chat commands
- **giveaways**: Chat giveaway/raffle system
- **moderation_rules**: AI-powered auto-moderation settings
- **stream_sessions**: Stream analytics and viewer tracking
- **user_balances**: Currency/points system for viewers

### Schema Migrations

Schema is defined in `services/stream-bot/shared/schema.ts` using Drizzle ORM.

To view the current schema:
```bash
docker exec -it stream-bot sh
cat shared/schema.ts
```

To regenerate migrations:
```bash
docker exec -it stream-bot sh
npm run db:push
```

---

## Integration with Homelab Dashboard

Stream-Bot exposes health and diagnostics endpoints that can be consumed by the Homelab Dashboard:

- `GET /health` - Basic liveness check
- `GET /ready` - Readiness check (database connectivity)
- `GET /api/health` - Detailed bot health with platform stats
- `GET /api/diagnostics` - Full system diagnostics

Example integration in dashboard:
```python
# services/dashboard/services/streambot_monitor.py
import requests

def check_streambot_health():
    try:
        response = requests.get('http://stream-bot:5000/api/health', timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        return {'status': 'error', 'message': str(e)}
```

---

## Security Considerations

1. **Never commit secrets to git**:
   - `.env` is in `.gitignore`
   - Use environment variables only

2. **Rotate SESSION_SECRET periodically**:
   ```bash
   openssl rand -base64 32 > /tmp/new_secret
   # Update .env with new secret
   # Restart stream-bot
   ```

3. **Protect OAuth secrets**:
   - Keep `TWITCH_CLIENT_SECRET`, etc. in `.env` only
   - Never expose in client-side code or logs

4. **Database access**:
   - `streambot` user has limited permissions (only `streambot` database)
   - Use strong passwords for `STREAMBOT_DB_PASSWORD`

5. **Rate limiting**:
   - Built-in rate limiting on `/api/*` (100 req/15min)
   - Auth endpoints limited to 5 req/15min

---

## Backup and Recovery

### Backup Database

```bash
# Full database backup
docker exec discord-bot-db pg_dump -U streambot streambot > streambot_backup_$(date +%Y%m%d).sql

# Backup specific tables
docker exec discord-bot-db pg_dump -U streambot streambot -t users -t platform_connections > streambot_users_backup.sql
```

### Restore Database

```bash
# Restore from backup
cat streambot_backup_20251118.sql | docker exec -i discord-bot-db psql -U streambot streambot

# OR using docker cp
docker cp streambot_backup_20251118.sql discord-bot-db:/tmp/
docker exec discord-bot-db psql -U streambot streambot -f /tmp/streambot_backup_20251118.sql
```

---

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Container health**: `docker ps` should show `healthy`
2. **Active bot instances**: Should match number of signed-in users
3. **Platform connection status**: Check `is_connected` in database
4. **Memory usage**: Stream-Bot should stay under 512MB typically
5. **Database connections**: Monitor connection pool

### Example Monitoring Script

```bash
#!/bin/bash
# monitor-streambot.sh

# Check container health
if docker ps | grep stream-bot | grep -q "healthy"; then
  echo "✅ Stream-Bot container is healthy"
else
  echo "❌ Stream-Bot container is unhealthy!"
  docker logs stream-bot --tail 20
fi

# Check active instances
ACTIVE=$(docker exec discord-bot-db psql -U streambot streambot -t -c "SELECT COUNT(*) FROM bot_instances WHERE status='running';")
echo "Active bot instances: $ACTIVE"

# Check database connectivity
if curl -sf http://localhost:5000/ready > /dev/null; then
  echo "✅ Database connectivity OK"
else
  echo "❌ Database connectivity FAILED"
fi
```

---

## FAQ

### Q: Can I run Stream-Bot without Twitch OAuth?

**A**: No, Twitch OAuth is currently required as the primary authentication method. You can add YouTube/Kick as secondary platforms, but users must sign in with Twitch first.

### Q: How do I change the AI model?

**A**: Users can change their AI model in the dashboard Settings page. Options include `gpt-4o-mini`, `gpt-4`, `gpt-4-turbo`, etc. (any OpenAI model).

### Q: Can multiple users use the same Twitch account?

**A**: No, each Twitch account can only be linked to one Stream-Bot user. The database enforces uniqueness on `platform_connections(platform, platform_user_id)`.

### Q: How do I reset a user's bot?

**A**: Update their bot instance status:
```sql
UPDATE bot_instances SET status='stopped' WHERE user_id='<user-id>';
```
Then restart Stream-Bot container to reload.

### Q: Can I customize the OAuth callback URLs?

**A**: Yes, update the `*_SIGNIN_CALLBACK_URL` variables in `.env`. Make sure they match your OAuth app settings EXACTLY (including trailing slashes).

### Q: How do I enable debug logging?

**A**: Set `STREAMBOT_NODE_ENV=development` in `.env` and restart. This enables verbose logging.

---

## Support and Contributing

- **Issues**: Report bugs or request features on GitHub
- **Logs**: Always include `docker logs stream-bot` output when reporting issues
- **Database**: For database issues, provide output of relevant SQL queries
- **Environment**: Confirm all required environment variables are set

---

## Changelog

- **2025-11-18**: Initial documentation created
- **2025-11-18**: Fixed healthcheck syntax (CMD → CMD-SHELL)

---

**Last Updated**: November 18, 2025
