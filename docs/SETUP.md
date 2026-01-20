# Nebula Command Setup Guide

> **Easy enough for a monkey** 🐵 - One-command setup with clear instructions

## Quick Start (TL;DR)

```bash
# Clone the repository
git clone https://github.com/yourusername/HomeLabHub.git
cd HomeLabHub

# Run the setup script
./scripts/setup.sh

# Start a service
cd services/dashboard-next && npm run dev
```

That's it! The setup script handles everything.

---

## Prerequisites

### Required
- **Node.js 18+** - JavaScript runtime
- **npm** - Package manager (comes with Node.js)
- **Git** - Version control

### Optional (for full functionality)
- **PostgreSQL 14+** - Database (or use Neon cloud database)
- **Docker & Docker Compose** - For containerized services
- **SSH access** - For remote server deployment
- **Tailscale** - For secure private networking

### Platform-Specific Requirements

| Platform | Node.js | PostgreSQL | Docker | Notes |
|----------|---------|------------|--------|-------|
| Replit | ✅ Pre-installed | ✅ Neon DB | ❌ N/A | Secrets in Replit panel |
| Ubuntu/Debian | Manual install | `apt install postgresql` | `apt install docker.io` | |
| macOS | `brew install node` | `brew install postgresql` | Docker Desktop | |
| Windows | Official installer | Official installer | Docker Desktop | Use WSL2 recommended |

---

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/HomeLabHub.git
cd HomeLabHub
```

### 2. Run the Setup Script

```bash
./scripts/setup.sh
```

The script will:
1. Detect your environment (Replit, Linode, Ubuntu, Windows)
2. Check for required dependencies
3. Create `.env` from `.env.example`
4. Prompt for essential configuration values
5. Install npm dependencies for all services
6. Run database migrations

### 3. Configure Environment Variables

Edit `.env` and set these essential variables:

```bash
# Required for all deployments
DATABASE_URL=postgresql://user:password@localhost:5432/nebula
SESSION_SECRET=your_random_32_char_secret_here

# Required for Discord Bot
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Required for AI features (choose one)
OPENAI_API_KEY=sk-your_openai_key      # Cloud AI
# OR
LOCAL_AI_ONLY=true                      # Local AI only (Ollama)
OLLAMA_HOST=http://localhost:11434
```

### 4. Start Services

```bash
# Dashboard (main control panel)
cd services/dashboard-next && npm run dev

# Discord Bot (in another terminal)
cd services/discord-bot && npm run dev

# Stream Bot (in another terminal)
cd services/stream-bot && npm run dev
```

---

## Configuration Reference

### Core Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Random secret (min 32 chars) |
| `ADMIN_USERNAME` | Yes | Dashboard login username |
| `ADMIN_PASSWORD` | Yes | Dashboard login password |

### Discord Bot

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | Application client ID |
| `DISCORD_CLIENT_SECRET` | Optional | For OAuth flows |

### Stream Bot (Twitch/YouTube)

| Variable | Required | Description |
|----------|----------|-------------|
| `TWITCH_CLIENT_ID` | For Twitch | Twitch API client ID |
| `TWITCH_CLIENT_SECRET` | For Twitch | Twitch API secret |
| `YOUTUBE_CLIENT_ID` | For YouTube | YouTube API client ID |
| `YOUTUBE_CLIENT_SECRET` | For YouTube | YouTube API secret |

### AI Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | For Cloud AI | OpenAI API key |
| `LOCAL_AI_ONLY` | Optional | Set to `true` to use only local AI |
| `OLLAMA_HOST` | For Local AI | Ollama server URL |
| `STABLE_DIFFUSION_URL` | Optional | SD WebUI URL |
| `COMFYUI_URL` | Optional | ComfyUI URL |

### Multi-Node Deployment

| Variable | Required | Description |
|----------|----------|-------------|
| `WINDOWS_VM_TAILSCALE_IP` | For AI VM | Windows VM Tailscale IP |
| `LINODE_SSH_HOST` | For Linode | Linode server hostname/IP |
| `HOME_SSH_HOST` | For Home | Home server hostname/IP |

---

## Multi-Node Deployment Overview

Nebula Command supports distributed deployment across multiple nodes:

```
┌─────────────────────────────────────────────────────────────┐
│                      INTERNET                                │
└─────────────────┬───────────────────────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │         LINODE            │
    │  ┌─────────────────────┐  │
    │  │ Dashboard (Next.js) │  │
    │  │ Discord Bot         │  │
    │  │ Stream Bot          │  │
    │  │ PostgreSQL          │  │
    │  └─────────────────────┘  │
    └─────────────┬─────────────┘
                  │ Tailscale
    ┌─────────────┴─────────────┐
    │     UBUNTU HOME SERVER    │
    │  ┌─────────────────────┐  │
    │  │ Plex Media Server   │  │
    │  │ Docker Services     │  │
    │  │ KVM/libvirt         │  │
    │  └─────────────────────┘  │
    └─────────────┬─────────────┘
                  │ GPU Passthrough
    ┌─────────────┴─────────────┐
    │     WINDOWS 11 VM         │
    │  ┌─────────────────────┐  │
    │  │ Ollama (LLM)        │  │
    │  │ Stable Diffusion    │  │
    │  │ ComfyUI             │  │
    │  │ Nebula Agent        │  │
    │  └─────────────────────┘  │
    └───────────────────────────┘
```

### Deploying to All Nodes

```bash
# Deploy to all configured nodes
./scripts/deploy.sh all

# Check health of all nodes
./scripts/deploy.sh all --check

# Deploy to specific target
./scripts/deploy.sh linode
./scripts/deploy.sh home
./scripts/deploy.sh windows
```

---

## Troubleshooting

### Common Issues

#### "npm install fails with peer dependency errors"

```bash
npm install --legacy-peer-deps
```

#### "Cannot connect to database"

1. Check PostgreSQL is running: `systemctl status postgresql`
2. Verify DATABASE_URL format: `postgresql://user:pass@host:5432/dbname`
3. Check firewall allows port 5432

#### "Discord bot not connecting"

1. Verify `DISCORD_BOT_TOKEN` is correct
2. Check bot has proper intents enabled in Discord Developer Portal
3. Ensure bot is invited to your server with correct permissions

#### "AI features not working"

1. For cloud AI: Verify `OPENAI_API_KEY` is valid
2. For local AI: Check `OLLAMA_HOST` is reachable
3. Try: `curl http://localhost:11434/api/tags`

#### "SSH deployment fails"

1. Verify SSH key is added to remote server
2. Check SSH config: `ssh -v user@host`
3. Ensure target directory exists and has correct permissions

### Getting Help

1. Check logs: `logs/` directory
2. Run health checks: `./scripts/deploy.sh all --check`
3. View service logs: `pm2 logs` or `docker compose logs`

---

## Replit-Specific Setup

If using Replit:

1. **Secrets**: Add sensitive values in Replit's Secrets panel (lock icon)
   - `DATABASE_URL`
   - `SESSION_SECRET`
   - `DISCORD_BOT_TOKEN`
   - `OPENAI_API_KEY`

2. **Database**: Replit provides Neon PostgreSQL automatically

3. **Running**: Click the "Run" button to start the dashboard

4. **Ports**: Dashboard runs on port 5000 (automatically exposed)

---

## Development Workflow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Replit     │ ──► │   GitHub     │ ──► │   Servers    │
│   (Edit)     │     │   (Push)     │     │   (Pull)     │
└──────────────┘     └──────────────┘     └──────────────┘
```

1. Edit code in Replit or locally
2. Push changes to GitHub
3. Deploy to servers: `./scripts/deploy.sh all`

---

## Security Best Practices

1. **Never commit `.env`** - It's in `.gitignore`
2. **Use strong passwords** - Generate with `openssl rand -hex 32`
3. **Rotate secrets regularly** - Especially API keys
4. **Limit SSH access** - Use key-based auth only
5. **Keep dependencies updated** - Run `npm audit` regularly

---

## Next Steps

- [ ] Configure Discord bot commands
- [ ] Set up Twitch/YouTube integration
- [ ] Enable local AI services (Ollama)
- [ ] Configure automated backups
- [ ] Set up monitoring with Grafana

For more detailed documentation, see:
- `docs/LOCAL_AI_DEPLOYMENT_GUIDE.md` - AI services setup
- `docs/DEPLOYMENT_PIPELINE.md` - CI/CD configuration
- `docs/INTEGRATION_GUIDE.md` - Third-party integrations
