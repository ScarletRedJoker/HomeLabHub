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

### Tailscale Connectivity (Linode)
Linode requires a Tailscale sidecar container to reach local services running on the Ubuntu homelab:
- **Plex** (100.110.227.25:32400) - Media streaming
- **Home Assistant** (100.110.227.25:8123) - Home automation
- **MinIO** (100.110.227.25:9000) - Object storage
- **KVM/Sunshine** (100.118.44.102) - Gaming VM

The `tailscale` container in `deploy/linode/docker-compose.yml` runs with `network_mode: host`, allowing all other containers on the Linode to route traffic through the Tailscale network. Requires `TAILSCALE_AUTHKEY` in `.env`.

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

## KVM Gaming VM (Sunshine/Moonlight)

### VM Configuration
- **VM Name:** RDPWindows
- **VM IP:** 192.168.122.250
- **Tailscale IP:** 100.118.44.102
- **User:** Evin
- **GPU:** NVIDIA passthrough for gaming

### Access via Tailscale + Moonlight
Primary access method for gaming and desktop use:
- **Sunshine Web UI:** https://100.118.44.102:47990
- **Moonlight Streaming:** Connect Moonlight client to 100.118.44.102

**Setup on new device:**
1. Install Tailscale and join network
2. Install Moonlight client
3. Add host: 100.118.44.102
4. Pair via Sunshine web UI (PIN pairing)

### Tailscale Mesh
- homelab-local: 100.110.227.25
- homelab-linode: 100.66.61.51
- rdpwindows: 100.118.44.102
- Pixel 6 Pro: 100.88.227.91

### Launch VM
```bash
cd /opt/homelab/HomeLabHub/deploy/local/scripts
./kvm-launch.sh gaming     # Start VM → Sunshine → Moonlight
./kvm-launch.sh console    # SPICE recovery console (fallback)
```

### Windows Requirements
Inside Windows:
1. **QEMU Guest Agent** - From virtio-win.iso
2. **Sunshine** - For Moonlight game streaming

### Technical Notes
- Network: e1000e adapter on virbr0
- GPU passthrough: NVIDIA with vfio-pci binding
- Sunshine ports: 47984-48010 (TCP/UDP)

### Storage Options (in order of simplicity)

**Option 1: Direct Disk Passthrough (RECOMMENDED)**
Pass a physical disk directly to the VM. Simple, reliable, fast.
```bash
virsh shutdown RDPWindows
virsh edit RDPWindows
# Add inside <devices>:
#   <disk type='block' device='disk'>
#     <driver name='qemu' type='raw'/>
#     <source dev='/dev/disk/by-id/ata-WDC_WD10EZEX-00BN5A0_WD-WCC3F3UDCXUK'/>
#     <target dev='sde' bus='sata'/>
#   </disk>
virsh start RDPWindows
```
Note: Host loses access while VM is running. Unmount first with `sudo umount /media/evin/1TB`

**Option 2: NAS via Tailscale Subnet Routing**
Already configured - access NAS from anywhere on Tailscale.
- From Windows: `\\192.168.0.185\networkshare`
- Run `tailscale up --accept-routes` in Windows first

**Option 3: SMB Share (if needed)**
Share host folders via Samba - requires firewall config.

**Option 4: virtio-fs (advanced)**
Requires virtiofsd installed, complex setup, can break boot if misconfigured.

## Local Ubuntu Server (host.evindrake.net)

### NAS Configuration
- **NAS IP:** 192.168.0.185 (Zyxel NAS326)
- **NAS MAC:** bc:83:85:f4:1e:20 (for DHCP reservation)
- **Share:** //192.168.0.185/networkshare
- **Mount Point:** /srv/media (automount on access)
- **Plex Media Path:** /srv/media → /media (inside container)

### Mount Configuration (fstab)
```
//192.168.0.185/networkshare /srv/media cifs guest,uid=1000,gid=1000,vers=3.0,_netdev,noauto,x-systemd.automount,x-systemd.idle-timeout=60,x-systemd.mount-timeout=30 0 0
```

### Key Services (Docker)
- **plex** - Media server at http://192.168.0.177:32400/web
- **homeassistant** - Home automation
- **homelab-minio** - Object storage (ports 9000-9001)
- **caddy-local** - Reverse proxy (ports 80, 443)
- **homelab-dashboard** - Dashboard UI (port 5000)

### Boot Safety
- NAS mounts use `noauto,x-systemd.automount` to prevent boot hangs when NAS is offline
- VM autostart is DISABLED to prevent resource starvation
- Failed services have been cleaned up