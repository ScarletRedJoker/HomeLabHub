# Nebula Command - HomeLabHub Platform

## Overview
Nebula Command is the HomeLabHub Platform, a comprehensive suite of services designed for homelab management, Discord integration, and multi-platform streaming. It consists of three core services: a Dashboard for homelab control and AI assistance, a Discord Bot for community management and notifications, and a Stream Bot for automated content posting across various streaming platforms. The platform aims to provide a unified control plane for homelab enthusiasts, offering advanced features for automation, monitoring, and interaction within their digital environments.

## User Preferences
- **User:** Evin
- **Managed Domains:** rig-city.com, evindrake.net, scarletredjoker.com
- **Development Workflow:** Edit in Replit → Push to GitHub → Pull on Ubuntu servers
- **Database:** Shared PostgreSQL (Neon in dev, homelab-postgres in prod)
- **Secrets:** .env file (never commit), Replit Secrets in dev

### Deployment Preference
When Evin asks to "deploy", this means:
1. **Linode**: `ssh root@linode.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/linode && ./deploy.sh`
2. **Local Ubuntu**: `ssh evin@host.evindrake.net` → `cd /opt/homelab/HomeLabHub/deploy/local && ./deploy.sh`

Each server deploys ONLY its own services. They are separate and independent.

## System Architecture

### Core Services
The platform is built around three distinct services, each with a specific role:
-   **Dashboard (Flask/Python)**: Provides a web interface for homelab management, Jarvis AI assistance, Docker control, NAS mount management, fleet control, KVM gaming mode switching, and DNS management via Cloudflare. It features a professional GitHub-style dark theme with a clean, flat design and semantic status indicators.
-   **Discord Bot (Node.js/React)**: Manages Discord communities with a ticket system, music bot capabilities (Spotify/YouTube), stream notifications, and analytics. It integrates with the Stream Bot for go-live notifications and features multi-tenant security with server access validation. It includes advanced stream notification features like role-based filtering, game/category filtering, and cooldowns.
-   **Stream Bot (Node.js/React/Vite)**: Facilitates multi-platform fact posting and interaction across Twitch, YouTube, and Kick. It supports OAuth for platform connections, per-user fact personalization, token encryption, rate limiting, and anti-spam measures. The UI has been modernized to a professional neutral aesthetic.

### Cross-Service Integration
-   **Stream Bot to Discord Bot**: Webhook integration for real-time go-live notifications.
-   **Dashboard to Discord Bot**: API communication for ticket management.
-   **All Services**: Share a PostgreSQL database and Redis for caching/session management.
-   **Plex "Now Playing"**: Discord Bot presence integrates with Plex to show current media.
-   **Personal Rich Presence (Lanyard)**: Integrates with Discord for dynamic user activity display.
-   **Multi-Tenant System**: Features user roles, RBAC, and remote bot control via an admin API.

### Deployment and Hosting
The system is deployed across two independent servers:
-   **Linode Cloud**: Hosts the Dashboard, Discord Bot, and Stream Bot.
-   **Local Ubuntu**: Hosts local homelab services like Plex, MinIO, and Home Assistant.
Each server has its own deployment script, ensuring separation of concerns.

### Database Schema
A shared PostgreSQL instance is used, with separate databases for each service:
-   `homelab_jarvis`: Used by the Dashboard for AI conversations, Docker data, and audit logs.
-   `discord_bot`: Stores data for tickets, messages, server configurations, and stream notifications.
-   `stream_bot`: Manages bot configurations, platform connections, and message history.

### File Structure
The codebase is organized into a `services/` directory for each application, alongside `scripts/` for deployment and utility tasks, `deployment/` for server-specific deployment logic, `docker-compose.yml` for orchestration, and `Caddyfile` for reverse proxy configuration.

## External Dependencies

-   **PostgreSQL**: Primary database for all services (Neon for development, homelab-postgres for production).
-   **Redis**: Used for caching and session management across services.
-   **OpenAI API**: For Jarvis AI features in the Dashboard.
-   **Discord API (discord.js)**: For Discord Bot functionality.
-   **Twitch API**: For Stream Bot and Discord Bot integrations (OAuth, chat posting, notifications).
-   **YouTube API**: For Stream Bot and Discord Bot integrations (OAuth, live chat).
-   **Kick API**: For Stream Bot integration (connection, chat posting).
-   **Spotify API**: For music bot features in the Discord Bot.
-   **Plex API**: For "Now Playing" integration in the Discord Bot.
-   **Home Assistant API**: For homelab automation and status in the Dashboard.
-   **Cloudflare API**: For DNS management features in the Dashboard.
-   **Lanyard API**: For personal rich presence integration.
-   **Caddy**: Used as a reverse proxy for all services.
-   **Tailscale**: For secure network access between homelab components.

## KVM Gaming Setup

### Quick Fix (If Things Break)
```bash
cd /opt/homelab/HomeLabHub/deploy/local/scripts
./fix-kvm-winapps.sh   # Fixes RDP, WinApps config, everything
```

### VM Configuration
- **VM Name:** RDPWindows
- **VM IP:** 192.168.122.250
- **User:** Evin
- **Network:** e1000e on libvirt default (virbr0)
- **GPU:** NVIDIA passthrough for gaming
- **Guest Agent:** QEMU Guest Agent for remote admin commands

### Access Methods
1. **Sunshine/Moonlight** - Gaming mode (CoD, Steam) via https://192.168.122.250:47990
2. **RDP/WinApps** - Desktop mode, seamless Windows apps on Linux
3. **SPICE Console** - Recovery fallback (`virt-viewer RDPWindows`)

### WinApps Setup
Config lives at `~/.config/winapps/winapps.conf`:
```
RDP_USER="Evin"
RDP_PASS="Brs=2729"
RDP_IP="192.168.122.250"
VM_NAME="RDPWindows"
```

Also requires in `/etc/environment`:
```
LIBVIRT_DEFAULT_URI="qemu:///system"
```

### Manual Mode Switching
```bash
./kvm-launch.sh gaming     # Start VM → Sunshine → Moonlight
./kvm-launch.sh desktop    # Start VM → RDP mode → WinApps
./kvm-launch.sh console    # SPICE recovery console
```

### Enable RDP from Linux (via Guest Agent)
```bash
./enable-rdp.sh            # Uses QEMU guest agent to enable RDP remotely
```

### Windows Requirements
Inside Windows, these must be installed:
1. **QEMU Guest Agent** - From virtio-win.iso → `guest-agent/qemu-ga-x86_64.msi`
2. **SPICE Guest Tools** - For mouse input in SPICE console
3. **Sunshine** - For Moonlight game streaming

### Recovery When Locked Out
```bash
virt-viewer RDPWindows     # Opens SPICE console (keyboard works)
```
Then use keyboard to navigate Windows and run admin commands.

### Technical Notes
- Network: e1000e adapter (Windows built-in driver support)
- GPU passthrough: NVIDIA with vfio-pci binding
- Sunshine ports: 47984-48010 (TCP/UDP)
- RDP port: 3389