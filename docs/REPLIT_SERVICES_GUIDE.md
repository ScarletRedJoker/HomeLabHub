# Replit Multi-Service Testing Guide

## Overview
This guide explains how to test all services on Replit and switch between them.

## Available Services

### ✅ Dashboard (Port 5000)
**Status**: ✅ Fully functional on Replit  
**Access**: Primary webview (default)  
**Features**: Control Center, Smart Home, AI Foundry, Marketplace, Agent Chat  
**URL**: https://your-repl.replit.dev/ (port 5000 auto-mapped to 80)

### ✅ Stream Bot (Port 3000)
**Status**: ✅ Running on Replit  
**Access**: Via port 3000  
**Features**: Multi-platform bot management, OAuth, Commands, AI Moderation  
**URL**: https://your-repl.replit.dev:3000/

### ⚠️ Discord Bot (Port 3001)
**Status**: ⚠️ Can run but needs Discord token  
**Access**: Backend only (no web UI)  
**Features**: Support tickets, role management  
**Testing**: Requires DISCORD_BOT_TOKEN environment variable

### ❌ Other Services
**n8n, Plex, VNC Desktop**: Require Docker (not available on Replit)  
**Testing**: Only testable on Ubuntu deployment

---

## How to Switch Between Services

### Method 1: Change Port in Browser
```
Dashboard:   https://your-repl.replit.dev/      (port 5000 → 80)
Stream Bot:  https://your-repl.replit.dev:3000/
Discord Bot: Backend only (no web UI)
```

### Method 2: Use Replit Preview Tool
1. Click "Preview" button in Replit
2. Select port from dropdown (5000 or 3000)
3. Service loads in preview pane

### Method 3: Update .replit Webview
Change which service is primary webview:

**For Dashboard (default):**
```toml
[workflows.workflow.metadata]
outputType = "webview"
waitForPort = 5000
```

**For Stream Bot:**
```toml
[workflows.workflow.metadata]
outputType = "webview"
waitForPort = 3000
```

---

## Service Health Checks

### Check Dashboard
```bash
curl http://localhost:5000/
# Should return: 302 redirect to /login
```

### Check Stream Bot
```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

### Check All Services
```bash
# Run health check script
./scripts/replit-health-check.sh
```

---

## Testing Each Service

### Dashboard Testing
```bash
cd services/dashboard
pytest -v                    # Run all tests
pytest -m unit              # Unit tests only
pytest tests/test_api_endpoints.py  # Specific test
```

**Features to Test:**
- ✅ Login (evin/homelab)
- ✅ Control Center UI
- ✅ Smart Home mock data
- ✅ AI Foundry mock data
- ✅ Marketplace catalog
- ✅ Agent chat WebSocket

### Stream Bot Testing
```bash
cd services/stream-bot
npm run test                # Run tests
npm run test:coverage       # With coverage
```

**Features to Test:**
- ✅ OAuth flows (Twitch, YouTube, Kick)
- ✅ Bot management API
- ✅ Command system
- ✅ User dashboard
- ⚠️ Real bot connections (need platform tokens)

### Discord Bot Testing
```bash
cd services/discord-bot
npm run test                # Run tests
```

**Features to Test:**
- ⚠️ Requires DISCORD_BOT_TOKEN to fully test
- ✅ Can test routes and API without token
- ✅ Database operations work

---

## Environment Variables

### Dashboard
```bash
DEMO_MODE=true              # Auto-set on Replit
DATABASE_URL=<replit-db>    # Auto-set if using Replit DB
```

### Stream Bot
```bash
PORT=3000
DATABASE_URL=<replit-db>
APP_URL=https://${REPLIT_DEV_DOMAIN}
TWITCH_CLIENT_ID=<optional>
YOUTUBE_CLIENT_ID=<optional>
KICK_CLIENT_ID=<optional>
```

### Discord Bot
```bash
PORT=3001
DATABASE_URL=<replit-db>
DISCORD_BOT_TOKEN=<required-for-full-testing>
DISCORD_CLIENT_ID=<optional>
DISCORD_CLIENT_SECRET=<optional>
```

---

## Troubleshooting

### Service Not Starting
```bash
# Check logs
cat /tmp/logs/<service>_*.log

# Restart service
# In Replit: Click "Stop" then "Run"
```

### Port Conflicts
```bash
# Check which ports are in use
lsof -i :3000
lsof -i :5000

# Kill process if needed
kill -9 <PID>
```

### Database Issues
```bash
# Check database connection
psql $DATABASE_URL -c "SELECT 1"

# Run migrations manually
cd services/<service>
npm run db:migrate   # For Node.js services
alembic upgrade head # For Python services
```

---

## Development Workflow

### For Dashboard Changes
1. Edit code in `services/dashboard/`
2. Auto-reload happens instantly
3. Run tests: `cd services/dashboard && pytest`
4. Access at port 5000

### For Stream Bot Changes
1. Edit code in `services/stream-bot/`
2. Auto-reload happens (tsx watch mode)
3. Run tests: `cd services/stream-bot && npm test`
4. Access at port 3000

### For Discord Bot Changes
1. Edit code in `services/discord-bot/`
2. Restart workflow to see changes
3. Test via API endpoints (no web UI)
4. Full testing requires Discord token

---

## Service Feature Matrix

| Feature | Dashboard | Stream Bot | Discord Bot |
|---------|-----------|------------|-------------|
| Web UI | ✅ Full | ✅ Full | ❌ None |
| Database | ✅ Postgres | ✅ Postgres | ✅ Postgres |
| Redis | ❌ Disabled | ❌ Disabled | ❌ Disabled |
| OAuth | ✅ Mock | ✅ Real | ✅ Real |
| Testing | ✅ pytest | ✅ vitest | ✅ vitest |
| Replit Ready | ✅ Yes | ✅ Yes | ⚠️ Partial |

---

## Quick Reference

**View Dashboard**: `https://your-repl.replit.dev/`  
**View Stream Bot**: `https://your-repl.replit.dev:3000/`  
**Test Dashboard**: `cd services/dashboard && pytest`  
**Test Stream Bot**: `cd services/stream-bot && npm test`  
**Check Logs**: `cat /tmp/logs/<service>_*.log`  
**Restart All**: Click "Stop" → "Run" in Replit

---

## Next Steps

1. **Get OAuth Tokens** - For full Stream Bot testing
2. **Add Discord Token** - For Discord Bot testing
3. **Write More Tests** - Expand test coverage
4. **Deploy to Ubuntu** - Test production features

**Remember**: Changes made on Replit automatically work on Ubuntu because of environment detection!
