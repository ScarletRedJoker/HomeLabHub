# HomeLabHub Interactive TUI Installer

A creative, terminal-based installer for headless Linux servers (Linode, VPS, etc.) that works without any GUI dependencies.

## Features

- ASCII art interface with cyberpunk color theme
- Interactive keyboard navigation (arrow keys, space, enter)
- Service selection with checkboxes (core, optional, monitoring)
- Environment configuration wizard with auto-generated secrets
- Progress bars and spinners for visual feedback
- Live health monitoring dashboard
- Comprehensive logging

## Quick Install

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/installer/homelab-installer.sh | sudo bash
```

### Manual Installation

```bash
# Download the installer
curl -fsSL https://raw.githubusercontent.com/ScarletRedJoker/HomeLabHub/main/deploy/installer/homelab-installer.sh -o homelab-installer.sh

# Make executable
chmod +x homelab-installer.sh

# Run with sudo
sudo ./homelab-installer.sh
```

## Requirements

- **OS**: Ubuntu 20.04+ / Debian 11+ (other Linux distros may work)
- **RAM**: 2GB minimum, 4GB+ recommended
- **Disk**: 20GB minimum, 50GB+ recommended
- **Access**: Root privileges (sudo)
- **Tools**: curl, git (installer will check these)

## What Gets Installed

### Core Services (Required)
- **Caddy** - Automatic HTTPS reverse proxy
- **PostgreSQL 16** - Database for all services
- **Redis** - Caching and message broker
- **Dashboard** - Main control panel with Jarvis AI
- **Celery Worker** - Background task processing

### Optional Services
- **Discord Bot** - Ticket system and server management
- **Stream Bot** - Twitch/YouTube/Spotify integration
- **N8N** - Workflow automation platform
- **Code Server** - VS Code in browser

### Monitoring Stack
- **Grafana** - Metrics and dashboards
- **Prometheus** - Metrics collection
- **Loki** - Log aggregation

## Interactive Menus

### Service Selection
```
  Use ↑/↓ to navigate, SPACE to toggle, ENTER to confirm

  ▶ [✔] Caddy Web Server                    CORE
        Automatic HTTPS reverse proxy
    [✔] PostgreSQL 16                       CORE
    [✔] Redis                               CORE
    [ ] Discord Bot                         OPT
    [ ] Grafana                             MON
```

### Keyboard Controls
- `↑` / `↓` - Navigate up/down
- `SPACE` - Toggle service selection
- `ENTER` - Confirm and proceed
- `A` - Select all services
- `N` - Select none (core only)
- `D` - Reset to defaults
- `Q` - Quit installer

## Environment Configuration

The installer will prompt for:

1. **Admin Credentials** - Dashboard, Code Server, N8N passwords
2. **API Keys** - OpenAI, Discord, Twitch (with helpful links)
3. **Domain Configuration** - Your primary domain
4. **Tailscale Connection** - For local services (Plex, Home Assistant)
5. **Cloudflare** - Optional DNS automation

Secrets (database passwords, session tokens) are auto-generated using secure random values.

## Post-Installation

After installation completes:

1. **Connect Tailscale** (if not already):
   ```bash
   sudo tailscale up
   ```

2. **Update DNS** - Point your domains to the server's IP

3. **Access Services**:
   - Dashboard: `https://dash.yourdomain.com`
   - Code Server: `https://code.yourdomain.com`
   - N8N: `https://n8n.yourdomain.com`

4. **Useful Commands**:
   ```bash
   cd /opt/homelab
   docker compose logs -f             # View logs
   docker compose restart <service>   # Restart service
   docker compose ps                  # Check status
   ./HomeLabHub/homelab status        # Full status check
   ```

## Troubleshooting

### Logs
Installation logs are saved to: `/var/log/homelab-installer.log`

### Common Issues

**Docker not starting:**
```bash
sudo systemctl restart docker
sudo docker compose up -d
```

**Service unhealthy:**
```bash
docker compose logs <service-name>
docker compose restart <service-name>
```

**Port conflicts:**
```bash
sudo netstat -tulpn | grep -E ':(80|443|5432)'
```

## Environment Variables

The installer creates `/opt/homelab/.env` with all configuration. To modify:

```bash
nano /opt/homelab/.env
docker compose up -d  # Recreate containers with new config
```

## Customization

### Custom Install Directory
```bash
HOMELAB_INSTALL_DIR=/home/user/homelab sudo ./homelab-installer.sh
```

### Custom Repository
```bash
HOMELAB_REPO_URL=https://github.com/youruser/HomeLabHub.git sudo ./homelab-installer.sh
```

## Security Notes

- The `.env` file is created with `600` permissions (owner read/write only)
- All passwords and secrets are randomly generated
- UFW firewall is configured to allow only SSH, HTTP, HTTPS, and Tailscale
- API keys are stored locally and never transmitted

## License

MIT License - Part of the HomeLabHub project.
