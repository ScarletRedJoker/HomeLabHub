# Nebula Command - Deployment Setup Guide

This guide helps you deploy Nebula Command on your own infrastructure.

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR-USERNAME/nebula-command.git
   cd nebula-command
   ```

2. **Choose your deployment**
   - **Cloud server (Linode/VPS)**: `cd deploy/linode`
   - **Local homelab**: `cd deploy/local`

3. **Run the deploy script**
   ```bash
   ./deploy.sh
   ```
   
   The script will:
   - Auto-generate internal secrets (database passwords, JWT keys, etc.)
   - Prompt you for required tokens (Discord bot token)
   - Build and start all services

## Configuration Files

### Environment Variables
Copy and customize the example file:
```bash
cp .env.example .env
```

Required tokens:
- `DISCORD_BOT_TOKEN` - Get from [Discord Developer Portal](https://discord.com/developers/applications)

Optional tokens:
- `TAILSCALE_AUTHKEY` - For secure networking between servers
- `CLOUDFLARE_API_TOKEN` - For DNS management
- `OPENAI_API_KEY` - For AI features

### Caddy (Reverse Proxy)
Copy the example Caddyfile:
```bash
cp Caddyfile.example Caddyfile
```

Replace placeholder domains with your own:
- `dashboard.yourdomain.com` → Your dashboard URL
- `discord.yourdomain.com` → Your Discord bot API URL  
- `stream.yourdomain.com` → Your Stream bot URL

### Cloudflared Tunnel (Optional)
For local homelab exposure without port forwarding:
```bash
cp config/cloudflared/config.yml.example config/cloudflared/config.yml
```

## Deploy Commands

| Command | Description |
|---------|-------------|
| `./deploy.sh` | Full deployment (setup + build + start) |
| `./deploy.sh setup` | Interactive environment setup only |
| `./deploy.sh check` | Verify environment configuration |
| `./deploy.sh build` | Build Docker images |
| `./deploy.sh up` | Start services |
| `./deploy.sh down` | Stop services |
| `./deploy.sh logs` | View service logs |

## Architecture

```
Cloud Server (Linode/VPS)
├── Dashboard (Next.js) - Port 5000
├── Discord Bot - Port 4000
├── Stream Bot - Port 3000
├── PostgreSQL - Port 5432
├── Redis - Port 6379
└── Caddy (reverse proxy) - Ports 80/443

Local Homelab (Optional)
├── Plex Media Server
├── MinIO Object Storage
├── Ollama (Local LLM)
├── Stable Diffusion
└── Home Assistant
```

## Troubleshooting

**Services won't start?**
```bash
docker compose logs -f [service-name]
```

**Database issues?**
```bash
docker compose exec homelab-postgres psql -U postgres
```

**Need to rebuild?**
```bash
./deploy.sh down
./deploy.sh build
./deploy.sh up
```

## Support

- Check the main [README.md](../README.md) for project overview
- Review `.env.example` files for all configuration options
