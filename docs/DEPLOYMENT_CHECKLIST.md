# 📋 Deployment Checklist

**Last Updated:** November 19, 2025  
**Purpose:** Comprehensive deployment verification guide for production deployments

---

## 🎯 Quick Start

For a complete deployment, follow these three phases:

1. **Pre-Deployment** - Verify everything is configured ✅
2. **Deployment** - Deploy to production 🚀
3. **Post-Deployment** - Verify everything works 🧪

---

## 📝 PRE-DEPLOYMENT CHECKLIST

### Environment Variables

Run this command to verify all critical environment variables are set:

```bash
# Check if all required env vars are present
./homelab-manager.sh
# Select option: 10) View Current Configuration
```

**Required Environment Variables:**

#### AI Integrations (Shared by Dashboard & Stream Bot)
- [ ] `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key for AI features
- [ ] `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (default: https://api.openai.com/v1)

#### Dashboard Service
- [ ] `SESSION_SECRET` - Dashboard session encryption
- [ ] `DASHBOARD_API_KEY` - Dashboard API authentication
- [ ] `WEB_USERNAME` - Web interface login username
- [ ] `WEB_PASSWORD` - Web interface login password
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `DOCKER_HOST` - Docker socket path
- [ ] `SSH_HOST` - SSH host for remote execution
- [ ] `SSH_PORT` - SSH port (default: 22)
- [ ] `SSH_USER` - SSH username
- [ ] `SSH_KEY_PATH` - Path to SSH private key

#### Stream Bot Service
- [ ] `STREAMBOT_DB_PASSWORD` - Stream Bot database password
- [ ] `STREAMBOT_SESSION_SECRET` - Stream Bot session secret
- [ ] `STREAMBOT_NODE_ENV` - Node environment (production)
- [ ] `STREAMBOT_PORT` - Server port (default: 5000)

#### Optional Integrations
- [ ] `TWITCH_CLIENT_ID` - Twitch OAuth client ID (optional)
- [ ] `TWITCH_CLIENT_SECRET` - Twitch OAuth secret (optional)
- [ ] `SPOTIFY_CLIENT_ID` - Spotify OAuth client ID (optional)
- [ ] `SPOTIFY_CLIENT_SECRET` - Spotify OAuth secret (optional)
- [ ] `YOUTUBE_CLIENT_ID` - YouTube OAuth client ID (optional)
- [ ] `YOUTUBE_CLIENT_SECRET` - YouTube OAuth secret (optional)

#### DNS & SSL
- [ ] `ZONEEDIT_USERNAME` - ZoneEdit account email
- [ ] `ZONEEDIT_API_TOKEN` - ZoneEdit dynamic authentication token
- [ ] `LETSENCRYPT_EMAIL` - Email for SSL certificates

### Service Configuration

- [ ] All Docker images built successfully
- [ ] PostgreSQL database initialized
- [ ] Redis server accessible
- [ ] MinIO object storage configured
- [ ] Caddy reverse proxy configured
- [ ] SSL certificates obtained (or using staging)

### Code & Dependencies

- [ ] Latest code synced from repository
- [ ] All Python dependencies installed (`requirements.txt`)
- [ ] All Node dependencies installed (`package.json`)
- [ ] Database migrations ready to run (alembic migrations 001-010)

### Network & DNS

- [ ] All domain names configured in DNS
- [ ] Firewall rules allow HTTP (80) and HTTPS (443)
- [ ] Port forwarding configured (if behind NAT)
- [ ] Dynamic DNS configured (if using dynamic IP)

---

## 🚀 DEPLOYMENT STEPS

### Step 1: Environment Setup

Generate or update your `.env` file:

```bash
cd deployment
./generate-unified-env.sh
```

**Prompts you'll need to answer:**
- Service user (default: evin)
- Let's Encrypt email
- Dashboard login credentials
- **OpenAI API Key** (critical for AI features)
- OpenAI base URL
- ZoneEdit DNS credentials
- Various service-specific passwords (auto-generated if empty)

### Step 2: Sync Code to Ubuntu Server

**From Replit** (run this on Replit workspace):

```bash
# Code is automatically synced if auto-sync is installed
# Or manually sync:
git push origin main
```

**On Ubuntu Server**:

```bash
cd ~/HomeLabHub
./deployment/sync-from-replit.sh
```

Or use the homelab manager:

```bash
./homelab-manager.sh
# Select: 17) Sync from Replit (pull latest code & auto-deploy)
```

### Step 3: Deploy Services

Run the unified deployment:

```bash
./homelab-manager.sh
# Select: 1) Full Deploy (build and start all services)
```

**Or use the linear deployment script directly:**

```bash
./deployment/linear-deploy.sh
```

This will:
1. ✅ Build all Docker images
2. ✅ Create and initialize databases
3. ✅ Run database migrations
4. ✅ Start all services in dependency order
5. ✅ Verify services are healthy

### Step 4: Run Database Migrations

Migrations should run automatically, but verify:

```bash
./homelab-manager.sh
# Select: 7) Check Database Status
```

**If migrations are stuck:**

```bash
./homelab-manager.sh
# Select: 22) Fix Stuck Database Migrations
```

### Step 5: Verify Service Health

```bash
./homelab-manager.sh
# Select: 12) Health Check (all services)
```

**Expected result:** All services should show as "healthy"

---

## 🧪 POST-DEPLOYMENT VERIFICATION

### Run Full Verification Suite

```bash
./homelab-manager.sh
# Select: 23) Run Full Deployment Verification
```

This automated check verifies:
- ✅ All critical environment variables are set
- ✅ PostgreSQL database is accessible
- ✅ Redis connection works
- ✅ AI features are operational
- ✅ All services are running
- ✅ Network connectivity

### Manual AI Features Verification

Follow the comprehensive AI testing guide:

```bash
# See AI_FEATURES_VERIFICATION.md for detailed test procedures
cat AI_FEATURES_VERIFICATION.md
```

**Quick AI Feature Tests:**

#### Test 1: Dashboard AI (Jarvis)

```bash
curl -X POST http://localhost:5000/api/ai/test \
  -H "Content-Type: application/json" \
  -d '{"message":"Hello Jarvis"}'
```

**Expected:** `{"success": true, "response": "..."}`

#### Test 2: Stream Bot AI (Snapple Facts)

```bash
curl -X POST http://localhost:3000/api/snapple-fact \
  -H "Content-Type: application/json"
```

**Expected:** `{"success": true, "fact": "...", "model": "gpt-4.1-mini"}`

#### Test 3: AI Log Analysis

```bash
curl -X POST http://localhost:5000/api/analyze-logs \
  -H "Content-Type: application/json" \
  -d '{
    "logs": "ERROR: Container exited with code 1\nConnection refused",
    "context": "Docker deployment"
  }'
```

**Expected:** AI-generated analysis and recommendations

### Service Accessibility Check

Verify all services are accessible:

- [ ] Dashboard: `https://host.evindrake.net`
- [ ] Stream Bot: `https://stream.rig-city.com`
- [ ] Discord Bot: `https://discord.rig-city.com`
- [ ] MinIO: `https://minio.evindrake.net`
- [ ] n8n: `https://n8n.evindrake.net`
- [ ] Code Server: `https://code.evindrake.net`
- [ ] VNC Desktop: `https://vnc.evindrake.net`
- [ ] Plex: `https://plex.evindrake.net`

### Database Verification

```bash
# Check that all required tables exist
docker exec postgres-db psql -U postgres -d jarvis -c "\dt"
```

**Expected tables:**
- agents
- artifacts
- marketplace_apps
- google_integrations
- jarvis_tasks
- workflows
- deployments
- (and more from migrations 001-010)

### Celery Workers Verification

```bash
# Check that Celery workers are running
docker exec dashboard-celery celery -A celery_app inspect active
```

**Expected:** 41 registered tasks across all workers

---

## ⚠️ TROUBLESHOOTING GUIDE

### AI Features Not Working

**Symptom:** AI features return "AI not available" errors

**Diagnosis:**
```bash
# Check if OpenAI env vars are set
docker exec dashboard-app env | grep AI_INTEGRATIONS
docker exec stream-bot env | grep AI_INTEGRATIONS
```

**Fix:**
1. Ensure `AI_INTEGRATIONS_OPENAI_API_KEY` is set in `.env`
2. Rebuild containers with `./homelab-manager.sh` → Option 3 (Rebuild & Deploy)
3. Verify API key is valid at https://platform.openai.com/api-keys

### Database Migrations Stuck

**Symptom:** Migrations show duplicate errors or won't run

**Fix:**
```bash
./homelab-manager.sh
# Select: 22) Fix Stuck Database Migrations
```

This script will:
1. Backup database
2. Clean duplicate migration records
3. Re-run migrations in order

### Services Not Starting

**Symptom:** Containers repeatedly restart or exit

**Diagnosis:**
```bash
./homelab-manager.sh
# Select: 11) View Service Logs
# Enter service name when prompted
```

**Common fixes:**
- Check environment variables are set
- Verify database is accessible
- Check for port conflicts
- Review logs for specific error messages

### Network Issues

**Symptom:** Services can't communicate

**Diagnosis:**
```bash
./homelab-manager.sh
# Select: 12a) Check Docker Network Status
```

**Fix:**
```bash
# Rebuild network
docker network rm homelabhub_homelab
./homelab-manager.sh
# Select: 3) Rebuild & Deploy
```

### DNS/SSL Issues

**Symptom:** Domains not resolving or SSL errors

**Fix:**
1. Verify DNS records are correct at ZoneEdit
2. Check Caddy logs: `docker logs caddy`
3. Verify firewall allows ports 80 and 443
4. Test DNS propagation: `nslookup host.evindrake.net`

---

## ✅ "PLUG AND PLAY" CONFIRMATION

Your deployment is **production-ready** when all of these are true:

### Services Status
- [ ] All 15 containers running
- [ ] No containers in "restarting" state
- [ ] All health checks passing

### AI Features
- [ ] Dashboard AI (Jarvis) responding
- [ ] Stream Bot AI generating facts
- [ ] AI log analysis working
- [ ] Chatbot responding to commands
- [ ] Auto-moderation active

### Database & Workers
- [ ] PostgreSQL accessible
- [ ] All migrations applied (001-010)
- [ ] Redis connected
- [ ] Celery workers processing tasks

### Network & Access
- [ ] All domains resolving correctly
- [ ] SSL certificates valid (green padlock)
- [ ] No CORS or network errors
- [ ] All services accessible from internet

### Integration Tests
- [ ] Dashboard login works
- [ ] Stream Bot web interface loads
- [ ] Discord bot responds to commands
- [ ] File uploads to MinIO work
- [ ] VNC desktop accessible

---

## 🎉 SUCCESS CRITERIA

**Your deployment is "sock-knocking" successful when:**

1. ✅ Everything works without manual intervention
2. ✅ Auto-sync to Ubuntu deploys cleanly
3. ✅ All services start on first boot
4. ✅ AI features accessible from day one
5. ✅ Zero errors in logs
6. ✅ All 13 AI features operational
7. ✅ Complete test suite passes

**If ALL checks pass, you're ready for production! 🚀**

---

## 📞 SUPPORT

If you encounter issues not covered in this guide:

1. Check `AI_FEATURES_VERIFICATION.md` for detailed AI testing
2. Review `deployment/TROUBLESHOOTING.md` for deployment issues
3. Run diagnostics: `./homelab-lifecycle-diagnostics.sh`
4. Check service logs: `./homelab-manager.sh` → Option 11

---

**🎯 Remember:** A successful deployment means **everything works on the first try**, no manual fixes needed!
