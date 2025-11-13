# 🏗️ Homelab Workspace Structure

## Overview

This Replit workspace is your **development environment** for all homelab services. You edit code here, test changes, then deploy to your Ubuntu server at `/home/evin/contain/HomeLabHub`.

---

## 📁 Directory Structure

```
HomeLabHub/                      ← Replit Workspace Root
├── services/                    ← All service code organized here
│   ├── dashboard/              ← Homelab Dashboard (Flask/Python)
│   │   ├── routes/
│   │   ├── services/
│   │   ├── templates/
│   │   ├── static/
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── discord-bot/            ← Discord Ticket Bot (TypeScript/React)
│   │   ├── client/
│   │   ├── server/
│   │   ├── db/
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── stream-bot/             ← SnappleBotAI (TypeScript/React)
│   │   ├── client/
│   │   ├── server/
│   │   ├── db/
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── static-site/            ← scarletredjoker.com (HTML/CSS/JS)
│   │   ├── index.html
│   │   ├── about.html
│   │   ├── css/
│   │   ├── js/
│   │   └── src/               ← Image assets
│   │
│   ├── n8n/                    ← n8n Automation
│   │   └── n8n.sh
│   │
│   └── plex/                   ← Plex Media Server Config
│       ├── docker-compose.yml
│       └── config/
│
├── config/                      ← Deployment configurations
│   ├── postgres-init/          ← Database initialization scripts
│   │   ├── 00-create-streambot.sh
│   │   └── 01-init-databases.sh
│   └── ...
│
├── deployment/                  ← Deployment scripts & docs
│   ├── deploy-unified.sh       ← Main deployment script
│   ├── generate-unified-env.sh ← Environment setup
│   ├── fix-existing-deployment.sh
│   ├── migrate-database.sh
│   ├── diagnose-all.sh
│   └── check-all-env.sh
│
├── docker-compose.unified.yml   ← Unified Docker Compose
├── Caddyfile                    ← Reverse proxy config
├── .env                         ← Environment variables (git-ignored)
│
├── docs/                        ← Documentation
│   ├── DEPLOYMENT_FIX_COMPLETE.md
│   ├── DATABASE_AUTOCONFIGURE_SUMMARY.md
│   ├── ENV_QUICK_GUIDE.md
│   └── WORKSPACE_STRUCTURE.md  ← This file!
│
└── archive/                     ← Old/deprecated files
    ├── old-compose-files/
    ├── old-docs/
    └── old-scripts/
```

---

## 🔄 Development Workflow

### **1. Edit Code in Replit**
```bash
# Make changes to any service
cd services/discord-bot
# Edit files using Replit editor
```

### **2. Test Locally (Optional)**
```bash
# Test individual services before deploying
cd services/dashboard
python main.py

# Or test with Docker
docker-compose -f docker-compose.unified.yml up dashboard
```

### **3. Deploy to Ubuntu Server**

**Method A: Git Push** (Recommended)
```bash
# On Ubuntu server:
cd /home/evin/contain/HomeLabHub
git pull
./deployment/deploy-unified.sh
```

**Method B: rsync/scp**
```bash
# From Replit, sync to Ubuntu:
rsync -avz --exclude='node_modules' --exclude='.git' \
  . evin@your-server:/home/evin/contain/HomeLabHub/
```

---

## 🎯 Service Details

### **Dashboard** (host.evindrake.net)
- **Stack**: Flask, Python, Bootstrap 5, Chart.js
- **Purpose**: Web UI for managing all homelab services
- **Features**: Docker management, system monitoring, AI assistant
- **Port**: 5000
- **Database**: None (uses Docker socket)

### **Discord Ticket Bot** (bot.rig-city.com)
- **Stack**: TypeScript, React, Express, Discord.js, PostgreSQL
- **Purpose**: Support ticket system for Discord servers
- **Database**: PostgreSQL (ticketbot database)
- **Port**: 5000
- **Key Files**: `server/index.ts`, `client/src/`

### **Stream Bot** (stream.rig-city.com)
- **Stack**: TypeScript, React, Express, Twitch/Kick APIs, OpenAI
- **Purpose**: AI-powered Snapple facts for Twitch streams
- **Database**: PostgreSQL (streambot database)
- **Port**: 3000
- **Key Files**: `server/index.ts`, `server/bot.ts`

### **Static Site** (scarletredjoker.com)
- **Stack**: HTML, CSS, JavaScript
- **Purpose**: Personal portfolio website
- **Port**: 80 (served by Nginx/Caddy)
- **Deployment**: Copy to `/var/www` or serve via Docker

### **n8n** (n8n.evindrake.net)
- **Stack**: Node.js workflow automation
- **Purpose**: Automate tasks across services
- **Port**: 5678
- **Data**: Persisted in Docker volume

### **Plex** (plex.evindrake.net)
- **Stack**: Plex Media Server
- **Purpose**: Media streaming (movies, TV, music)
- **Port**: 32400
- **Storage**: `/home/evin/contain/plex-server/media`

---

## 🗄️ Database Architecture

**Single PostgreSQL Container** hosts multiple databases:

```
discord-bot-db (postgres:16-alpine)
├── ticketbot database
│   └── ticketbot user
└── streambot database
    └── streambot user
```

**Auto-Configuration**:
- Init scripts in `config/postgres-init/` create both databases
- Runs automatically on first PostgreSQL startup
- For existing deployments, run `./fix-existing-deployment.sh`

---

## 🌐 Domain Mapping

| **Domain** | **Service** | **Port** | **SSL** |
|-----------|------------|---------|---------|
| host.evindrake.net | Homelab Dashboard | 5000 | ✅ Auto (Caddy) |
| bot.rig-city.com | Discord Ticket Bot | 5000 | ✅ Auto (Caddy) |
| stream.rig-city.com | Stream Bot | 3000 | ✅ Auto (Caddy) |
| plex.evindrake.net | Plex Server | 32400 | ✅ Auto (Caddy) |
| n8n.evindrake.net | n8n Automation | 5678 | ✅ Auto (Caddy) |
| vnc.evindrake.net | VNC Desktop | 80 | ✅ Auto (Caddy) |
| scarletredjoker.com | Static Website | 80 | ✅ Auto (Caddy) |

**Caddy** automatically obtains Let's Encrypt SSL certificates for all domains.

---

## 🛠️ Quick Commands

### **Deploy Everything**
```bash
cd /home/evin/contain/HomeLabHub
./deployment/deploy-unified.sh
```

### **Setup Environment Variables**
```bash
./deployment/generate-unified-env.sh
```

### **Fix Existing Database**
```bash
./deployment/fix-existing-deployment.sh
```

### **Check Service Health**
```bash
./deployment/diagnose-all.sh
```

### **View Logs**
```bash
docker logs discord-bot --tail=50
docker logs stream-bot --tail=50
docker logs caddy --tail=50
```

### **Restart Service**
```bash
docker-compose -f docker-compose.unified.yml restart discord-bot
```

---

## 📝 Environment Variables

All secrets stored in `.env` file (git-ignored):

**Dashboard:**
- `OPENAI_API_KEY`
- `SESSION_SECRET`

**Discord Bot:**
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_DB_PASSWORD`

**Stream Bot:**
- `KICK_USERNAME`
- `KICK_PASSWORD`
- `TWITCH_USERNAME`
- `TWITCH_OAUTH_TOKEN`
- `STREAMBOT_DB_PASSWORD`

**Plex:**
- `PLEX_CLAIM` (optional, for initial setup)

See `ENV_QUICK_GUIDE.md` for complete list.

---

## 🔐 Security Notes

1. **Never commit** `.env` files to Git
2. **Use Replit Secrets** for API keys during development
3. **SSH keys** should be stored in `~/.ssh/` on Ubuntu server
4. **PostgreSQL** passwords auto-generated by `generate-unified-env.sh`
5. **Caddy** handles SSL automatically via Let's Encrypt

---

## 🚀 Getting Started

**First Time Setup:**

1. **Clone this workspace** to Replit (already done!)
2. **Edit service code** in `services/` directory
3. **Sync to Ubuntu server**:
   ```bash
   # On Ubuntu:
   cd /home/evin/contain
   git clone <this-repl-url> HomeLabHub
   ```
4. **Generate environment variables**:
   ```bash
   cd HomeLabHub
   ./deployment/generate-unified-env.sh
   ```
5. **Deploy**:
   ```bash
   ./deployment/deploy-unified.sh
   ```

**Daily Development:**

1. Edit code in Replit
2. Git commit changes
3. SSH to Ubuntu server
4. `git pull && ./deployment/deploy-unified.sh`

---

## 📚 Documentation

- **DEPLOYMENT_FIX_COMPLETE.md** - Complete deployment guide
- **DATABASE_AUTOCONFIGURE_SUMMARY.md** - Database setup details
- **ENV_QUICK_GUIDE.md** - Environment variable reference
- **README.md** - Project overview
- **replit.md** - Agent memory & project context

---

## 🎉 Benefits of This Workspace

✅ **Centralized Development** - All services in one place
✅ **Version Control** - Full Git history for all code
✅ **Easy Testing** - Test changes before production deployment
✅ **Replit AI** - I can help improve any service!
✅ **Clean Structure** - Organized, maintainable codebase
✅ **Automated Deployment** - One command deploys everything

---

Ready to build? Let's go! 🚀
