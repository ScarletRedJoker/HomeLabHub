# Nebula Command

A comprehensive homelab management and creation engine - empowering anyone to build, deploy, and manage services, websites, and applications from anywhere.

## Vision

Nebula Command is designed to be a universal creation platform where anyone can:
- Spin up a server and start creating in an afternoon
- Manage and deploy services without DevOps expertise
- Build websites, bots, and applications with visual tools
- Automate infrastructure with AI-powered assistance

## Features

### Dashboard (Next.js 14)
The central control panel for your entire infrastructure.

| Feature | Description |
|---------|-------------|
| **Home** | Live stats, container counts, server metrics, quick actions |
| **Services** | Docker container management (start/stop/restart/logs) |
| **Servers** | SSH-based metrics from remote servers |
| **Deploy** | One-click deployments with live log streaming |
| **Editor** | Monaco code editor with file tree navigation |
| **Designer** | Visual drag-drop website builder (14 component types) |
| **Marketplace** | One-click installation of Docker-based services |
| **Resources** | DNS/SSL management with Cloudflare integration |
| **AI Agents** | Configurable AI assistants (Jarvis, Coder, Creative, DevOps) |
| **Incidents** | Service health monitoring and auto-remediation |
| **Terminal** | Web-based SSH terminal access |

### Discord Bot
Full-featured community management bot.

| Feature | Description |
|---------|-------------|
| Tickets | Support ticket system with transcripts |
| Welcome Cards | Custom welcome images with @napi-rs/canvas |
| Stream Notifications | Go-live alerts for Twitch/YouTube/Kick |
| AutoMod | Automated content moderation |
| XP/Leveling | Member engagement tracking |
| Economy | Virtual currency system |
| Music | Play music with discord-player |

### Stream Bot
Multi-platform streaming management.

| Feature | Description |
|---------|-------------|
| Platform Connections | OAuth for Twitch, YouTube, Kick, Spotify |
| Stream Info Editor | Edit title/game/tags across all platforms |
| OBS Overlays | Now Playing, alerts, chat overlays |
| AI Content | Generate titles, descriptions, social posts |
| Clips | Clip management with social sharing |

## Quick Start

### Option 1: Deploy to Cloud (Linode/VPS)

1. **Create a server** (Ubuntu 22.04, 4GB RAM minimum)

2. **SSH into your server:**
```bash
ssh root@YOUR_SERVER_IP
```

3. **Install Docker:**
```bash
curl -fsSL https://get.docker.com | sh
```

4. **Clone and deploy:**
```bash
mkdir -p /opt/homelab && cd /opt/homelab
git clone https://github.com/yourusername/nebula-command.git
cd nebula-command/deploy/linode
./deploy.sh
```

The deploy script will:
- Auto-generate all internal secrets (database passwords, JWT keys, etc.)
- Prompt for required external tokens (Discord)
- Build and deploy all services

### Option 2: Local Ubuntu Homelab

```bash
cd /opt/homelab/nebula-command/deploy/local
./deploy.sh
```

## Deployment Commands

```bash
./deploy.sh          # Full deployment (setup + build + deploy)
./deploy.sh setup    # Interactive environment setup only
./deploy.sh check    # Health check
./deploy.sh build    # Build images only
./deploy.sh up       # Start services only
./deploy.sh down     # Stop services
./deploy.sh logs     # View service logs
./deploy.sh help     # Show all commands
```

## Architecture

### Services

| Service | Port | Description |
|---------|------|-------------|
| Dashboard | 5000 | Next.js web interface |
| Discord Bot | 4000 | Discord.js bot server |
| Stream Bot | 3000 | Multi-platform stream manager |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching and sessions |

### Deployment Targets

- **Cloud (Linode/VPS)**: Dashboard, Discord Bot, Stream Bot
- **Local Ubuntu**: Plex, MinIO, Home Assistant, Ollama, Stable Diffusion

Services communicate via Tailscale mesh networking for secure cross-server access.

## Configuration

### Environment Variables

The deployment script handles most configuration automatically.

**Auto-generated** (no action needed):
- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, `JWT_SECRET`
- Database passwords, session secrets

**Required**:
- `DISCORD_BOT_TOKEN` - Get from [Discord Developer Portal](https://discord.com/developers/applications)

**Optional**:
- `TAILSCALE_AUTHKEY` - For local homelab connectivity
- `CLOUDFLARE_API_TOKEN` - For DNS management
- `OPENAI_API_KEY` - For AI features

See `deploy/linode/.env.example` for full configuration options.

## Project Structure

```
nebula-command/
├── services/
│   ├── dashboard-next/   # Next.js 14 dashboard
│   ├── discord-bot/      # Discord.js bot
│   └── stream-bot/       # Stream management
├── deploy/
│   ├── linode/           # Cloud deployment
│   ├── local/            # Local Ubuntu deployment
│   └── shared/           # Shared deployment libraries
├── docs/                 # Documentation
└── plugins/              # Plugin directory
```

## Advanced Features

### Plugin System

Dynamic feature loading with sandboxed execution:

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "permissions": ["network", "database"]
}
```

### AI Sandbox

AI-powered code generation with human approval:

1. AI proposes changes with syntax-highlighted diffs
2. Human reviews and approves/rejects
3. Changes are applied with automatic rollback capability

### Remote Operations

- SSH Terminal via xterm.js
- SFTP File Browser
- Server power controls (restart, shutdown, WoL)
- Docker container management

## Security

- JWT authentication for all API endpoints
- Sandboxed plugin execution with path traversal protection
- Command injection prevention
- Secret management via environment variables
- Pre-commit hooks for secret detection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See LICENSE file for details
