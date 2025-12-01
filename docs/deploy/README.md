# Deployment

**All deployment instructions are in one place:**

## [FULL_DEPLOYMENT_GUIDE.md](./FULL_DEPLOYMENT_GUIDE.md)

This single document covers everything:
- Account setup (Cloudflare, Linode, Tailscale, OpenAI)
- DNS configuration  
- VPN setup between servers
- Cloud deployment (Linode)
- Local deployment (Ubuntu)
- OAuth apps (Discord, Twitch, YouTube, Spotify)
- Troubleshooting
- Daily operations

No other deployment documents needed.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│   LINODE CLOUD      │◄═══════►│   LOCAL UBUNTU      │
│   $24/month         │ Tailscale│   (Your PC)         │
│                     │   VPN    │                     │
│ • Dashboard         │         │ • Plex Media        │
│ • Discord Bot       │         │ • Home Assistant    │
│ • Stream Bot        │         │ • MinIO Storage     │
│ • PostgreSQL        │         │ • Sunshine Games    │
│ • Redis/n8n/Caddy   │         │                     │
└─────────────────────┘         └─────────────────────┘
```

## Quick Commands

```bash
# Linode deployment
./deploy/scripts/bootstrap.sh --role cloud --generate-secrets

# Local deployment  
./deploy/scripts/bootstrap.sh --role local

# Check status
./homelab status

# View logs
./homelab logs
```
