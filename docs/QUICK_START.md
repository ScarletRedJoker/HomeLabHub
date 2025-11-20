# 🚀 Quick Start Guide

## 1-Minute Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/HomeLabHub.git
cd HomeLabHub

# Configure environment
cp .env.example .env
nano .env  # Add your API keys

# Deploy everything
chmod +x homelab
./homelab deploy
```

## Essential Commands

```bash
./homelab          # Interactive menu (recommended)
./homelab deploy   # Deploy everything
./homelab health   # Check if everything works
./homelab logs all # View all logs
./homelab fix      # Auto-fix issues
```

## Required API Keys

You MUST add these to `.env`:
- `OPENAI_API_KEY` - For Jarvis AI (get from https://platform.openai.com)
- `DISCORD_BOT_TOKEN` - For Discord bot (from Discord Developer Portal)

## First Time?

1. Run: `./homelab`
2. Select: `[1] Deployment`
3. Select: `[1] Fresh deployment`
4. Wait ~5 minutes for everything to build
5. Check health: `./homelab health`

## Troubleshooting

If anything fails:
```bash
./homelab diagnose  # See what's wrong
./homelab fix       # Try auto-fix
./homelab logs [service-name]  # Check specific service
```

## Service URLs

After deployment, access your services at:
- Dashboard: https://host.evindrake.net
- Discord Bot: Check your Discord server
- VNC Desktop: https://vnc.evindrake.net

## Need Help?

- Run: `./homelab help`
- Check: [README.md](../README.md)
- Logs: `./homelab logs all`