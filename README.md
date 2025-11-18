# 🌌 Nebula Command Development Workspace

**Centralized development environment for all infrastructure services**

This Repo serves as your development environment for managing 7 production services across 3 domains. Edit code here, test changes, then deploy to your Ubuntu 25.10 server.

---

## 🎯 Quick Start

### 🚀 One Command to Rule Them All

```bash
./homelab-manager.sh
```

This launches an **interactive menu** with everything you need:
- Deploy/redeploy services
- Start/stop/restart
- Database management
- Configuration
- Logs and troubleshooting
- Health checks

### Development Workflow (on Replit)
```bash
# 1. Edit any service code
cd services/discord-bot
# Make your changes...

# 2. Commit changes
git add .
git commit -m "Updated Discord bot"
```

### Deployment (on Ubuntu Server)
```bash
# 1. SSH to your server
ssh evin@your-server

# 2. Pull latest changes
cd /home/evin/contain/NebulaCommand
git pull

# 3. Run the manager
./homelab-manager.sh
# Select: 1) Full Deploy
```

---

## 📦 Services

| **Service** | **Domain** | **Stack** | **Database** |
|------------|------------|-----------|-------------|
| **Dashboard** | host.evindrake.net | Flask/Python | None |
| **Discord Bot** | bot.rig-city.com | TypeScript/React | PostgreSQL |
| **Stream Bot** | stream.rig-city.com | TypeScript/React | PostgreSQL |
| **Plex** | plex.evindrake.net | Plex Server | SQLite |
| **n8n** | n8n.evindrake.net | Node.js | SQLite |
| **VNC Desktop** | vnc.evindrake.net | noVNC | None |
| **Code-Server** | code.evindrake.net | VS Code | None |
| **Static Site** | scarletredjoker.com | HTML/CSS/JS | None |

All services automatically receive SSL certificates via **Caddy**.

---

## 📁 Workspace Structure

```
services/
├── dashboard/      ← Nebula Command management UI
├── discord-bot/    ← Discord Ticket Bot
├── stream-bot/     ← Twitch/Kick Stream Bot
├── static-site/    ← scarletredjoker.com
├── n8n/            ← Workflow automation
└── plex/           ← Media server config

deployment/         ← Deployment scripts
├── deploy-unified.sh
├── generate-unified-env.sh
├── fix-existing-deployment.sh
└── ...

docs/              ← Documentation
├── WORKSPACE_STRUCTURE.md
├── DEPLOYMENT_FIX_COMPLETE.md
└── ...

config/            ← Configuration files
├── postgres-init/ ← Database initialization
└── ...

docker-compose.unified.yml  ← Main deployment file
Caddyfile                   ← Reverse proxy config
```

See **[WORKSPACE_STRUCTURE.md](docs/WORKSPACE_STRUCTURE.md)** for complete details.

---

## 🔄 Development Workflow

### **Option 1: Git-Based (Recommended)**

**Setup (one-time):**
```bash
# On Ubuntu server:
cd /home/evin/contain
git clone <this-replit-git-url> NebulaCommand
cd NebulaCommand
./deployment/generate-unified-env.sh
```

**Daily workflow:**
1. Edit code on Replit
2. Commit changes
3. On Ubuntu: `git pull && ./deployment/deploy-unified.sh`

### **Option 2: rsync/scp**

```bash
# From Replit or local machine:
rsync -avz --exclude='node_modules' --exclude='.git' \
  . evin@your-server:/home/evin/contain/NebulaCommand/

# Then on Ubuntu:
cd /home/evin/contain/NebulaCommand
./deployment/deploy-unified.sh
```

---

## 🛠️ Common Tasks

### All-in-One Manager (Recommended)
```bash
./homelab-manager.sh
```

**Menu Options:**
- **1** - 🚀 Full Deploy (build and start all)
- **2** - 🔄 Quick Restart (no rebuild)
- **6** - 🔄 Restart Specific Service
- **7** - 🗄️ Fix Database Issues
- **9** - ⚙️ Generate/Edit .env
- **11** - 🔍 View Service Logs
- **13** - 🔧 Full Troubleshoot Mode

### Manual Commands (Advanced Users)
```bash
# Full deployment
./deployment/deploy-unified.sh

# Database maintenance
./deployment/ensure-databases.sh

# Generate .env
./deployment/generate-unified-env.sh

# View logs
docker-compose -f docker-compose.unified.yml logs -f

# Restart a service
docker-compose -f docker-compose.unified.yml restart discord-bot
```

---

## 🗄️ Database Architecture

**Single PostgreSQL container** hosts multiple databases:

```
discord-bot-db (PostgreSQL 16)
├── ticketbot (Discord Bot database)
└── streambot (Stream Bot database)
```

- **Automatic initialization** via scripts in `config/postgres-init/`
- **For existing deployments:** Run `./deployment/fix-existing-deployment.sh`
- See [DATABASE_AUTOCONFIGURE_SUMMARY.md](docs/DATABASE_AUTOCONFIGURE_SUMMARY.md) for details

---

## 🌐 Domains & SSL

All domains configured with automatic SSL via Caddy:

- **host.evindrake.net** → Homelab Dashboard
- **bot.rig-city.com** → Discord Ticket Bot  
- **stream.rig-city.com** → Stream Bot
- **plex.evindrake.net** → Plex Server
- **n8n.evindrake.net** → n8n Automation
- **vnc.evindrake.net** → VNC Desktop
- **scarletredjoker.com** → Static Website

SSL certificates automatically obtained from Let's Encrypt.

---

## 🔐 Security

- **Environment variables** stored in `.env` (git-ignored)
- **Secrets management** via `generate-unified-env.sh`
- **PostgreSQL passwords** auto-generated
- **No hardcoded credentials** in any code
- **SSH access** for remote management

See [SECURITY.md](docs/SECURITY.md) for security best practices.

---

## 📚 Documentation

- **[WORKSPACE_STRUCTURE.md](docs/WORKSPACE_STRUCTURE.md)** - Complete workspace guide
- **[DEPLOYMENT_FIX_COMPLETE.md](docs/DEPLOYMENT_FIX_COMPLETE.md)** - Deployment troubleshooting
- **[DATABASE_AUTOCONFIGURE_SUMMARY.md](docs/DATABASE_AUTOCONFIGURE_SUMMARY.md)** - Database setup
- **[ENV_QUICK_GUIDE.md](docs/ENV_QUICK_GUIDE.md)** - Environment variables reference

---

## 🎉 Why This Workspace?

✅ **Unified Development** - All services in one place  
✅ **Version Control** - Full Git history  
✅ **Easy Testing** - Test before deploying to production  
✅ **Replit AI** - AI-powered development assistance  
✅ **Automatic Deployment** - One command deploys everything  
✅ **Clean Organization** - Maintainable codebase structure  

---

## 🚀 Getting Started

**New to this workspace?**

1. **Explore the services:**
   ```bash
   ls services/
   ```

2. **Read the structure guide:**
   ```bash
   cat docs/WORKSPACE_STRUCTURE.md
   ```

3. **Set up deployment to Ubuntu:**
   ```bash
   # On Ubuntu server:
   git clone <this-repo> NebulaCommand
   cd NebulaCommand
   ./deployment/generate-unified-env.sh
   ./deployment/deploy-unified.sh
   ```

4. **Start developing!**

---

## 🆘 Need Help?

- **Quick fix:** Run `./homelab-manager.sh` → **Option 13** (Troubleshoot)
- **Database problems:** Run `./homelab-manager.sh` → **Option 7** (Ensure Databases)
- **Deployment issues:** See `docs/DATABASE_TROUBLESHOOTING.md`
- **Environment setup:** Run `./homelab-manager.sh` → **Option 9** (Generate .env)
- **Ask Replit AI:** I can help with any service!

---

**Maintained by:** Evin  
**Last Updated:** November 2025  
**Ubuntu Version:** 25.10 Desktop  
**Architecture:** Docker Compose + Caddy + PostgreSQL
