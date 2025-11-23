# Nebula Command Dashboard Project

## Overview
The Nebula Command Dashboard is a web-based interface for managing a Ubuntu 25.10 server hosting 15 Docker-based services. These services are accessible via custom evindrake.net subdomains and include homelab management, Discord/Twitch bots, media streaming, remote desktop access, and home automation. The project aims to provide a centralized, robust, and secure platform for managing a comprehensive homelab environment, integrating various functionalities for personal and community use.

## User Preferences
- User: Evin
- Ubuntu 25.10 server at host.evindrake.net
- Project location: `/home/evin/contain/HomeLabHub`
- Development: Edit in cloud IDE → Push to GitHub → Pull on Ubuntu server
- All services use shared PostgreSQL (homelab-postgres) with individual databases
- Main password: `Brs=2729` (used for most services)
- Managed domains: rig-city.com, evindrake.net, scarletredjoker.com

## System Architecture

### UI/UX Decisions
The dashboard is a Flask-based management UI using Bootstrap 5 and Chart.js for visualization. Bot interfaces are built with React, Vite, Tailwind CSS, and Radix UI.

### Technical Implementations
The core system relies on Docker Compose for orchestrating 15 services. A `bootstrap-homelab.sh` script provides idempotent fresh installations with pre-flight checks, rollback capabilities, and comprehensive validation. A `./homelab` script offers day-to-day management, including fixing issues, checking status, viewing logs, restarting services, health checks, database operations (backup/restore), and updates.

### Feature Specifications
- **Dashboard & AI:** Flask UI with Jarvis AI assistant (GPT-3.5-turbo), Agent Swarm (5 specialized AI agents), Voice Interface, Docker/system monitoring.
- **Storage & Data:** NAS Management (Zyxel NAS326), Storage Monitor (Plex/DB/Docker/MinIO analytics), Database Admin (PostgreSQL management), File Manager, Plex Media Import (drag-and-drop).
- **Bots:** Discord ticket bot (TypeScript, React, Drizzle ORM) and multi-platform stream bot (SnappleBotAI for Twitch/Kick/YouTube).
- **Services:** Remote Ubuntu desktop (VNC), VS Code in browser (code-server), Plex media server, n8n workflow automation, Home Assistant.
- **App Marketplace:** One-click deployment of pre-configured Docker applications.
- **Static Sites:** Hosting for rig-city.com and scarletredjoker.com.
- **Notification System:** Multi-channel alerts for storage thresholds and OAuth token expiry.
- **Security:** Automatic SSL via Caddy/Let's Encrypt, environment-based secrets, isolated database credentials per service, password-protected VNC/Code Server, rate limiting, and CSRF protection.

### System Design Choices
- **Containerization:** All services are Dockerized and managed by Docker Compose.
- **Centralized Database:** A single PostgreSQL container (`homelab-postgres`) serves as the shared database for all services, with individual databases and user credentials for each.
- **Reverse Proxy:** Caddy handles reverse proxying and automatic SSL for all services.
- **Environment Management:** All configuration is managed via a single `.env` file at the project root, loaded by Docker via absolute paths.
- **Modular Architecture:** Designed for easy addition of new services by modifying `docker-compose.yml` and Caddy configuration.
- **Authentication:** Centralized session-based authentication using `session['authenticated']` across all routes and blueprints.

## Recent Changes (November 2025)

### Navigation Expansion
- Added 5 missing features to sidebar navigation: NAS Management, Storage Monitor, Database Admin, File Manager, and App Marketplace
- All features were fully implemented but not previously exposed in UI

### Authentication Standardization
- Fixed authentication mismatches across 9 route files (storage, db_admin, plex, artifact, unified_logs, upload, analysis, game_streaming, storage_optimization)
- All custom `login_required` decorators now check `session.get('authenticated')` instead of `session['logged_in']`
- Aligns with centralized auth system in `utils/auth.py` and `web.py`

### NAS Integration
- Documented NAS configuration in `.env.example` (NAS_IP, NAS_HOSTNAME, NAS_USER, NAS_PASSWORD, NAS_MOUNT_BASE)
- Supports Zyxel NAS326 with SMB/CIFS mounting, auto-discovery, and backup scheduling

### Homepage Enhancement
- Added AI & Media Control card with responsive layout (col-lg-4 col-md-6 col-12)
- Quick access buttons for Plex Import, Jarvis AI, Agent Swarm, and Voice Interface

### Documentation
- Created `COMPLETE_FEATURE_LIST.md` with comprehensive feature inventory
- 50+ features across 7 categories
- 31 HTML templates, 16 database migrations, 15 services cataloged

## External Dependencies

- **PostgreSQL 16 Alpine:** Shared database for all services.
- **Redis:** Used for caching.
- **MinIO:** S3-compatible object storage.
- **Caddy:** Reverse proxy with automatic SSL via Let's Encrypt.
- **GPT-3.5-turbo (OpenAI API):** Powers the Jarvis AI assistant and stream bot's fact generation.
- **Discord API:** For the Discord ticket bot.
- **Twitch/Kick/YouTube APIs:** For the multi-platform stream bot.
- **Plex Media Server:** Integrated for media streaming.
- **n8n:** Workflow automation tool.
- **Home Assistant:** Smart home hub integration.