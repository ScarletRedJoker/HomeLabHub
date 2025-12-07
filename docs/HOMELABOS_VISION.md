# HomeLabOS Vision

**The Goal:** Transform HomeLabHub from a collection of Docker services into a deployable, self-contained "operating system" for homelabs - complete with setup wizards, one-click installations, and an app marketplace.

---

## Current State (December 2025)

### What We Have
- **TUI Installer** (`deploy/installer/homelab-installer.sh`) - Interactive terminal installer with cyberpunk aesthetic
- **Unified Management** (`homelab` script) - Single command for all operations
- **Tiered Deployment** - Automated, ordered service deployment with health checks
- **Smoke Testing** - Post-deployment validation with auto-fix capability
- **Role Detection** - Auto-detect cloud vs local deployment
- **Environment Wizard** - Auto-generate secrets, guided configuration

### Infrastructure Ready
- Linode cloud deployment (dashboard, bots, monitoring, static sites)
- Local Ubuntu deployment (Plex, MinIO, Home Assistant, GameStream)
- WireGuard VPN tunnel between cloud and local
- Cloudflare DNS automation

---

## Phase 1: Polish & Testing (Current)

**Goal:** Get everything deployed, tested, and stable.

### Checklist
- [ ] All services deployed to Linode
- [ ] All services deployed to Ubuntu
- [ ] WireGuard tunnel stable
- [ ] All domains resolving correctly
- [ ] Health checks passing
- [ ] Smoke tests green
- [ ] Documentation complete

---

## Phase 2: Bundle & Package

**Goal:** Create a single-command installation experience.

### Installation Experience
```bash
# One-liner install (like Tailscale)
curl -fsSL https://install.homelabos.io | sudo bash
```

### Features
1. **Interactive TUI Installer**
   - ASCII art splash screen
   - Service selection menu (checkboxes)
   - Environment configuration wizard
   - Progress bars and status updates
   - Health monitoring dashboard

2. **Smart Defaults**
   - Auto-detect hardware (CPU, RAM, disk)
   - Suggest appropriate services
   - Auto-generate all secrets
   - Auto-configure networking

3. **Profile-Based Installation**
   ```bash
   # Minimal (just dashboard + database)
   ./install.sh --profile minimal
   
   # Full (all services)
   ./install.sh --profile full
   
   # Streaming (optimized for streamers)
   ./install.sh --profile streaming
   
   # Media (Plex, NAS, storage)
   ./install.sh --profile media
   ```

---

## Phase 3: App Marketplace

**Goal:** One-click deployment for community applications.

### Marketplace Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                    HOMELAB MARKETPLACE                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Nextcloud│  │ Jellyfin │  │ Vaultwarden│ │ Gitea   │    │
│  │   ☁️    │  │   🎬    │  │    🔐     │ │   🐙    │    │
│  │ [Install]│  │ [Install]│  │ [Install] │ │ [Install]│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Pi-hole  │  │ Uptime   │  │ Immich   │  │ Paperless│    │
│  │   🛡️    │  │  Kuma    │  │   📸    │  │    📄   │    │
│  │ [Install]│  │ [Install]│  │ [Install] │ │ [Install]│    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### App Definition Format
```yaml
# marketplace/apps/nextcloud.yaml
name: Nextcloud
description: Self-hosted cloud storage and collaboration
version: "28.0"
category: productivity
icon: "☁️"

resources:
  min_ram: 512MB
  recommended_ram: 2GB
  storage: 10GB+

dependencies:
  - postgresql
  - redis

ports:
  - "8080:80"

environment:
  - POSTGRES_DB=nextcloud
  - REDIS_HOST=homelab-redis

compose:
  services:
    nextcloud:
      image: nextcloud:28
      volumes:
        - nextcloud_data:/var/www/html
      environment:
        - POSTGRES_HOST=homelab-postgres
```

### Installation Flow
1. User clicks "Install" in dashboard
2. System checks resource requirements
3. Creates isolated database
4. Generates subdomain (nextcloud.yourdomain.com)
5. Configures Caddy reverse proxy
6. Deploys container
7. Runs health check
8. Shows success with access URL

---

## Phase 4: Self-Updating System

**Goal:** Keep everything current without manual intervention.

### Auto-Update Features
- **Security patches** - Auto-apply critical updates
- **Image updates** - Pull new Docker images with digest verification
- **Rollback** - One-click revert if update fails
- **Changelog** - Show what changed in each update
- **Scheduled updates** - Configure maintenance windows

### Update Architecture
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   GitHub    │────▶│  Update Bot  │────▶│  Homelab    │
│  Releases   │     │  (on Linode) │     │  Services   │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    ┌──────┴──────┐
                    │  Changelog  │
                    │  Rollback   │
                    │  Notify     │
                    └─────────────┘
```

---

## Phase 5: Community & Distribution

**Goal:** Make HomeLabOS available to others.

### Distribution Options

1. **GitHub Release**
   - One-liner install from raw GitHub URL
   - Version-tagged releases
   - Automated CI/CD builds

2. **ISO Image**
   - Bootable USB/VM image
   - Pre-configured Ubuntu with HomeLabOS
   - First-boot wizard

3. **Cloud Images**
   - Linode StackScript
   - DigitalOcean Droplet
   - AWS AMI
   - Proxmox template

### Community Features
- **App Store Contributions** - Community-submitted apps
- **Theme Marketplace** - Dashboard themes
- **Integration Directory** - Third-party integrations
- **Documentation Wiki** - Community-maintained docs

---

## Technical Architecture

### Core Components
```
HomeLabOS/
├── installer/           # TUI installer scripts
├── core/                # Core services (always installed)
│   ├── caddy/          # Reverse proxy + SSL
│   ├── postgres/       # Database
│   ├── redis/          # Cache
│   └── dashboard/      # Web UI + Jarvis AI
├── apps/               # Installable applications
│   ├── discord-bot/
│   ├── stream-bot/
│   ├── n8n/
│   ├── grafana/
│   └── ...
├── marketplace/        # App definitions
│   ├── catalog.yaml   # Available apps
│   └── apps/          # App configs
├── profiles/           # Installation profiles
│   ├── minimal.yaml
│   ├── full.yaml
│   └── streaming.yaml
└── scripts/            # Management scripts
    ├── install.sh
    ├── update.sh
    └── backup.sh
```

### Database Schema for Marketplace
```sql
CREATE TABLE installed_apps (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20),
    installed_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'running',
    subdomain VARCHAR(100),
    container_id VARCHAR(64)
);

CREATE TABLE app_updates (
    id SERIAL PRIMARY KEY,
    app_id INTEGER REFERENCES installed_apps(id),
    from_version VARCHAR(20),
    to_version VARCHAR(20),
    updated_at TIMESTAMP DEFAULT NOW(),
    success BOOLEAN,
    rollback_available BOOLEAN DEFAULT true
);
```

---

## Success Metrics

### Phase 1 (Testing)
- [ ] 100% uptime for 7 days
- [ ] All smoke tests passing
- [ ] No critical bugs

### Phase 2 (Bundle)
- [ ] < 10 minute installation time
- [ ] Zero manual configuration required
- [ ] Works on fresh Ubuntu 22.04+

### Phase 3 (Marketplace)
- [ ] 10+ apps in marketplace
- [ ] One-click install working
- [ ] Auto-DNS configuration

### Phase 4 (Updates)
- [ ] Zero-downtime updates
- [ ] < 5 minute update time
- [ ] Successful rollback tested

### Phase 5 (Community)
- [ ] Public release
- [ ] 10+ community contributions
- [ ] Documentation coverage > 80%

---

## Immediate Next Steps

1. **Complete Phase 1** - Deploy everything, run full tests
2. **Stabilize** - Fix any issues found during testing
3. **Document** - Ensure all runbooks are current
4. **Iterate** - Improve installer based on deployment experience
