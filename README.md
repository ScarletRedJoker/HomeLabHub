# 🚀 HomeLabHub - Unified Infrastructure Management

**Single command tool for complete homelab management**

## ⚡ Quick Start

```bash
# Make executable and run
chmod +x homelab
./homelab
```

That's it! The interactive menu will guide you through everything.

## 🎯 One Tool, All Functions

The `homelab` script is your single control point for:
- 🚀 **Deployment** - Fresh, quick, or smart auto-deployment
- 🎛️ **Management** - Start, stop, restart services
- 🔍 **Diagnostics** - Health checks, testing, troubleshooting
- 🔧 **Fixes** - Auto-fix issues, repair Jarvis AI, fix permissions
- 💻 **Development** - Sync code, build services, setup environment
- 💾 **Backup** - Create and manage backups

## 📦 Services Overview

| **Service** | **URL** | **Purpose** | **Status** |
|------------|---------|-------------|------------|
| **Dashboard** | host.evindrake.net | Main control panel with Jarvis AI | ✅ Fixed |
| **Discord Bot** | bot.rig-city.com | Server management bot | ✅ Working |
| **Stream Bot** | stream.rig-city.com | Twitch/YouTube integration | ✅ Fixed |
| **VNC Desktop** | vnc.evindrake.net | Remote desktop access | ✅ Working |
| **Code Server** | code.evindrake.net | Web-based VS Code | ✅ Working |
| **Plex** | plex.evindrake.net | Media streaming | ✅ Working |
| **N8N** | n8n.evindrake.net | Workflow automation | ✅ Working |
| **Home Assistant** | home.evindrake.net | Smart home control | ✅ Working |

## 🛠️ Command Reference

### Interactive Mode (Recommended)
```bash
./homelab
```
Opens the full menu system with all options.

### Direct Commands

#### Deployment
```bash
./homelab deploy       # Smart auto-deployment
./homelab fresh        # Clean build from scratch
./homelab quick        # Fast deployment with cache
```

#### Service Management
```bash
./homelab start        # Start all services
./homelab stop         # Stop all services
./homelab restart [service]  # Restart specific service
./homelab logs [service]     # View logs (use 'all' for everything)
./homelab status       # Show service status
```

#### Diagnostics & Testing
```bash
./homelab health       # Quick health check
./homelab diagnose     # Full system diagnostics
./homelab test jarvis  # Test Jarvis AI
./homelab test db      # Test database connectivity
./homelab test redis   # Test Redis cache
```

#### Fixes & Troubleshooting
```bash
./homelab fix          # Auto-fix detected issues
./homelab fix-jarvis   # Fix Jarvis AI (40% error)
./homelab fix-perms    # Fix permission issues
```

#### Development
```bash
./homelab dev          # Setup development environment
./homelab sync         # Pull latest from Git
./homelab build [service]  # Rebuild specific service
```

#### Utilities
```bash
./homelab backup       # Create backup
./homelab urls         # Display all service URLs
./homelab info         # System information
./homelab help         # Show help
```

## 🔧 Initial Setup

### 1. Prerequisites
- Ubuntu 20.04+ or similar Linux
- Docker & Docker Compose installed
- 8GB RAM minimum, 50GB disk space
- Git installed

### 2. Clone Repository
```bash
git clone https://github.com/yourusername/HomeLabHub.git
cd HomeLabHub
```

### 3. Configure Environment
```bash
cp .env.example .env
nano .env  # Add your API keys
```

### 4. Deploy Everything
```bash
chmod +x homelab
./homelab deploy
```

## 🔑 Required API Keys

Add these to your `.env` file:

```env
# OpenAI (for Jarvis AI) - REQUIRED
OPENAI_API_KEY=sk-proj-...

# Discord Bot - REQUIRED
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...

# Streaming Services (optional)
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
YOUTUBE_API_KEY=...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://...
```

## 📁 Clean Project Structure

```
HomeLabHub/
├── homelab                    # 🎯 Main unified management script
├── docker-compose.yml         # Service definitions
├── Caddyfile                 # Reverse proxy config
├── .env                      # Your configuration
│
├── services/                 # Service code
│   ├── dashboard/           # Jarvis AI & control panel
│   ├── discord-bot/         # Discord bot
│   ├── stream-bot/          # Twitch/YouTube bot
│   ├── vnc-desktop/         # Remote desktop
│   └── ...
│
├── config/                   # Configurations
│   └── postgres-init/       # Database setup
│
├── deployment/              # Essential scripts
│   └── generate-unified-env.sh  # Environment helper
│
└── scripts-archive/         # Old scripts (archived)
    ├── fixes/              # Old fix scripts
    ├── deployment/         # Old deployment scripts
    └── migrations/         # Old migration scripts
```

## 🐛 Common Issues & Solutions

### Jarvis AI Shows 40% Error
**Cause:** Was using deprecated GPT-5 model  
**Fix:** Already fixed! Now uses GPT-3.5-turbo
```bash
./homelab fix-jarvis  # If issue persists
```

### Services Won't Start
```bash
./homelab diagnose    # See what's wrong
./homelab fix         # Auto-fix issues
```

### Database Connection Failed
```bash
./homelab test db     # Test connection
./homelab fix         # Auto-repair
```

### Permission Errors
```bash
./homelab fix-perms   # Fix Docker permissions
```

## 🔄 Updating

### Pull Latest Changes
```bash
./homelab sync        # Pulls from Git
./homelab deploy      # Redeploy with updates
```

### Auto-Update Setup
```bash
# Add to crontab for daily updates
0 3 * * * cd /path/to/HomeLabHub && ./homelab sync && ./homelab deploy
```

## 💾 Backup & Recovery

### Create Backup
```bash
./homelab backup
# Backups saved to /tmp/homelab-backups/
```

### Restore from Backup
```bash
# Manual restore (automated coming soon)
cd /tmp/homelab-backups/
tar -xzf homelab_backup_[timestamp].tar.gz
```

## 🚀 Advanced Usage

### Custom Deployment Order
Edit the `deploy_services_ordered()` function in `homelab` script.

### Add New Service
1. Add to `docker-compose.yml`
2. Add to `Caddyfile` if web-accessible
3. Update `homelab` script health checks
4. Deploy: `./homelab fresh`

### Production Deployment
```bash
# On production server
cd /home/evin/contain/HomeLabHub
git pull origin main
./homelab deploy
```

## 📊 System Requirements

### Minimum
- 4 CPU cores
- 8GB RAM
- 50GB storage
- 10Mbps internet

### Recommended
- 8+ CPU cores
- 16GB+ RAM
- 100GB+ SSD storage
- 100Mbps+ internet

## 🔐 Security

- All services behind Caddy reverse proxy
- Automatic SSL via Let's Encrypt
- Secrets in `.env` (never committed)
- PostgreSQL with strong passwords
- VNC password protected
- API keys properly managed

## 📈 Monitoring

Check system health:
```bash
./homelab health      # Quick check
./homelab diagnose    # Full diagnostics
./homelab info        # System resources
```

Monitor specific service:
```bash
./homelab logs dashboard -f    # Follow dashboard logs
./homelab logs discord-bot -f  # Follow Discord bot logs
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make your changes
4. Test thoroughly: `./homelab health`
5. Submit pull request

## 📚 Documentation

- [Script Archive Summary](scripts-archive/ARCHIVE_SUMMARY.md) - Old scripts reference
- [Environment Setup](.env.example) - Configuration template
- [Docker Compose](docker-compose.yml) - Service definitions
- [Caddy Config](Caddyfile) - Reverse proxy setup

## 🆘 Troubleshooting Guide

### Can't find homelab script?
```bash
ls -la homelab
chmod +x homelab
```

### Docker permission denied?
```bash
sudo ./homelab fix-perms
```

### Services keep restarting?
```bash
./homelab diagnose
./homelab logs [service]
```

### Out of disk space?
```bash
docker system prune -a
./homelab info
```

## 📝 Version History

- **v2.0.0** - Complete unification into single `homelab` tool
- **v1.5.0** - Fixed Jarvis AI GPT-5 → GPT-3.5 migration
- **v1.0.0** - Initial multi-script version

## 📞 Support

- **Quick Help:** `./homelab help`
- **Diagnostics:** `./homelab diagnose`
- **All Logs:** `./homelab logs all`
- **GitHub Issues:** Create issue with diagnostic output

---

**HomeLabHub v2.0** - Unified Management System  
*All your services, one simple command*