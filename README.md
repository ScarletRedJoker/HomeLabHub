# 🚀 Homelab Dashboard - Enterprise Infrastructure Platform

> **AI-powered, production-ready homelab management system with autonomous operations**

[![Status](https://img.shields.io/badge/Status-Production-success)]()
[![Python](https://img.shields.io/badge/Python-3.11-blue)]()
[![License](https://img.shields.io/badge/License-MIT-green)]()

## 🎯 Overview

A comprehensive web-based platform for managing Ubuntu homelab servers with enterprise-grade reliability and intelligent automation. Built with Flask, PostgreSQL, and GPT-4 powered AI assistance.

**Live Demo**: [host.evindrake.net](https://host.evindrake.net)

### Core Capabilities

- 🤖 **Jarvis AI Assistant** - GPT-4 powered with voice control & autonomous operations
- 🌐 **Domain Management** - Zero-touch DNS → SSL → deployment automation
- 🐳 **Container Orchestration** - Docker management with real-time monitoring
- 📊 **System Monitoring** - CPU, memory, disk, network analytics
- 🔒 **Enterprise Security** - Session auth, API keys, rate limiting, audit logs
- 🏠 **Smart Home** - Home Assistant integration
- ☁️ **Cloud Services** - Google Calendar, Gmail, Drive integration

## 🚀 Quick Start

```bash
# 1. Interactive setup (5 minutes)
./setup.sh

# 2. Deploy all services
./deploy.sh start

# 3. Access dashboard
http://localhost:5000
# Default: admin / (password from setup)
```

That's it! 🎉

## 📚 Documentation

- **[Architecture](docs/ARCHITECTURE.md)** - Technical deep-dive, patterns, integrations
- **[Deployment](docs/DEPLOYMENT.md)** - Setup, commands, troubleshooting
- **[API Reference](docs/API_REFERENCE.md)** - Complete REST API & WebSocket docs
- **[Changelog](CHANGELOG.md)** - Version history & breaking changes
- **[120% Roadmap](ROADMAP_TO_120_PERCENT.md)** - Upcoming features (DNS, NAS, Marketplace)

## ✨ Features

### Jarvis AI System
```bash
"Jarvis, what containers are running?"
"Jarvis, analyze my disk usage"
"Jarvis, deploy new service on test.example.com"
```

**20+ Autonomous Actions:**
- **Tier 1** (Diagnose): Health checks, log analysis, SSL validation
- **Tier 2** (Remediate): DNS fixes, SSL renewal, service recovery
- **Tier 3** (Proactive): Cleanup, optimization, maintenance

### Domain Management
```python
# Automatic workflow
1. Create DNS record (ZoneEdit/PowerDNS)
2. Verify propagation (multi-server check)
3. Generate Caddy config
4. Acquire SSL certificate
5. Verify HTTPS accessibility

# One command
POST /api/domains/:id/provision
```

### Multi-Service Platform

**8 Production Services:**
- Dashboard (host.evindrake.net)
- Discord Bot (bot.rig-city.com)
- Stream Bot (stream.rig-city.com)
- Plex Media (plex.evindrake.net)
- n8n Automation (n8n.evindrake.net)
- Home Assistant (home.evindrake.net)
- VNC Desktop (vnc.evindrake.net)
- Static Site (scarletredjoker.com)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│           Caddy Reverse Proxy               │
│     (Automatic SSL with Let's Encrypt)      │
└────────────────┬────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼──────┐  ┌──────▼────────┐
│  Dashboard   │  │ Other Services│
│  (Flask)     │  │ (8 services)  │
└───────┬──────┘  └───────────────┘
        │
┌───────▼──────────────────────────┐
│   PostgreSQL + Redis + MinIO     │
│   (Unified Database Container)   │
└──────────────────────────────────┘
```

**Tech Stack:**
- Backend: Flask, Python 3.11, SQLAlchemy
- Database: PostgreSQL 16 + Redis
- Storage: MinIO (S3-compatible)
- AI: OpenAI GPT-4
- Proxy: Caddy (automatic HTTPS)
- Container: Docker + Docker Compose

## 🔐 Security

- ✅ Session-based authentication
- ✅ API key auth for programmatic access
- ✅ CSRF protection on all mutations
- ✅ Rate limiting per endpoint
- ✅ Audit logging for all actions
- ✅ Secrets management (never committed)
- ✅ HTTPS everywhere (automatic SSL)

## 📊 System Requirements

**Minimum:**
- Ubuntu 20.04+ or compatible Linux
- 4GB RAM
- 20GB disk space
- Docker + Docker Compose

**Recommended (Production):**
- Ubuntu 22.04+
- 8GB RAM
- 50GB SSD
- Static IP or Dynamic DNS
- Domain name

## 🛠️ Development

### Project Structure
```
homelab-dashboard/
├── services/
│   ├── dashboard/        # Main Flask application
│   ├── stream-bot/       # Multi-platform stream bot
│   └── discord-bot/      # Ticket system
├── docs/                 # Documentation
├── deployment/           # Deployment scripts
├── setup.sh              # Interactive setup wizard
├── deploy.sh             # Deployment automation
└── docker-compose.unified.yml
```

### Development Workflow
1. **Edit on Replit** (development environment)
2. **Auto-sync** to Ubuntu every 5 minutes
3. **Deploy** via `./deploy.sh` in production

## 🗺️ Roadmap

### Phase 1: Local DNS (In Progress)
- PowerDNS integration
- Replace ZoneEdit dependency
- DynDNS automation for NAS

### Phase 2: Container Marketplace (Planned)
- One-click container deployment
- Template library (Plex, Jellyfin, etc.)
- GitHub import support

### Phase 3: NAS Integration (Planned)
- Auto-discover NAS devices
- Plex automation workflow
- Backup orchestration

See [ROADMAP_TO_120_PERCENT.md](ROADMAP_TO_120_PERCENT.md) for details.

## 🤝 Contributing

This is a personal project, but suggestions welcome! Open an issue or contact the maintainer.

## 📝 License

MIT License - See LICENSE file for details

## 👤 Author

**Evin** - Homelab enthusiast, parent, and automation addict

---

## 🙏 Acknowledgments

- OpenAI for GPT-4 API
- Caddy for amazing reverse proxy
- Docker & Docker Compose
- PostgreSQL, Redis, MinIO
- All the amazing open-source projects

---

**Need help?** Check [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) or ask Jarvis! 😊
