# Prerequisites Checklist

Complete this checklist before starting deployment.

## Cloud Infrastructure

### Linode Account
- [ ] Create account at [linode.com](https://www.linode.com/)
- [ ] Add payment method
- [ ] Recommended VM specs:

| Tier | vCPU | RAM | Storage | Monthly Cost |
|------|------|-----|---------|--------------|
| Minimum | 2 | 4 GB | 80 GB | ~$24/mo |
| **Recommended** | 4 | 8 GB | 160 GB | ~$48/mo |
| High Performance | 6 | 16 GB | 320 GB | ~$96/mo |

**Recommendation**: Start with the 4GB plan ($24/mo) and upgrade if needed.

### Domain Names (Cloudflare DNS)
- [ ] Transfer or register domains with Cloudflare
- [ ] Required domains:
  - `evindrake.net` (dashboard, code server, VNC, Plex, Home Assistant)
  - `rig-city.com` (Discord bot, Stream bot, community site)
  - `scarletredjoker.com` (personal website)

- [ ] Enable Cloudflare DNS proxy (orange cloud) for DDoS protection

### Tailscale Account
- [ ] Create account at [tailscale.com](https://tailscale.com/)
- [ ] Generate auth key for automated setup:
  1. Go to **Settings** → **Keys**
  2. Click **Generate auth key**
  3. Enable: "Reusable", "Ephemeral" (optional)
  4. Save the key securely

### GitHub Account
- [ ] Repository access for HomeLabHub
- [ ] (Optional) Generate Personal Access Token for private repos

## Required API Keys

### Discord Bot (Required)
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create new application
3. Go to **Bot** section → **Add Bot**
4. Copy these values:
   - [ ] `DISCORD_BOT_TOKEN` (Bot → Token)
   - [ ] `DISCORD_CLIENT_ID` (OAuth2 → Client ID)
   - [ ] `DISCORD_CLIENT_SECRET` (OAuth2 → Client Secret)
   - [ ] `DISCORD_APP_ID` (same as Client ID)

5. Enable required intents:
   - [ ] Presence Intent
   - [ ] Server Members Intent
   - [ ] Message Content Intent

### OpenAI API (Required)
1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create new API key
3. Copy: `OPENAI_API_KEY`
4. Recommended: Set usage limits to prevent unexpected charges

### Twitch Integration (Optional)
1. Go to [Twitch Developer Console](https://dev.twitch.tv/console/apps)
2. Create new application
3. Copy:
   - [ ] `TWITCH_CLIENT_ID`
   - [ ] `TWITCH_CLIENT_SECRET`
4. Set OAuth redirect URL: `https://stream.rig-city.com/api/auth/twitch/callback`

### YouTube Integration (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project or select existing
3. Enable YouTube Data API v3
4. Create OAuth 2.0 credentials
5. Copy:
   - [ ] `YOUTUBE_CLIENT_ID`
   - [ ] `YOUTUBE_CLIENT_SECRET`
6. Set redirect URL: `https://stream.rig-city.com/api/auth/youtube/callback`

### Spotify Integration (Optional)
1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create new app
3. Copy:
   - [ ] `SPOTIFY_CLIENT_ID`
   - [ ] `SPOTIFY_CLIENT_SECRET`
4. Set redirect URL: `https://stream.rig-city.com/api/auth/spotify/callback`

### Plex Token (Local Services)
1. Sign in to Plex at [plex.tv](https://www.plex.tv/)
2. Get your token:
   - Open any Plex library in browser
   - Add `?X-Plex-Token=` to see token in XML
   - Or use [this guide](https://support.plex.tv/articles/204059436/)
3. Copy: `PLEX_TOKEN`
4. (Optional) Get claim token for new server: `PLEX_CLAIM`

### Home Assistant Token (Local Services)
1. Go to your Home Assistant instance
2. Click your profile (bottom left)
3. Scroll to **Long-Lived Access Tokens**
4. Create token: "HomeLabHub Dashboard"
5. Copy: `HOME_ASSISTANT_TOKEN`

## Local Hardware Requirements

### Ubuntu Host (Gaming/Streaming PC)
- [ ] Ubuntu 22.04 LTS or newer
- [ ] Docker and Docker Compose installed
- [ ] Minimum 16GB RAM (8GB for gaming, 8GB for services)
- [ ] GPU for Plex transcoding (optional but recommended)
- [ ] Static local IP or DHCP reservation

### NAS Storage (Optional)
- [ ] Network-attached storage accessible via SMB/CIFS
- [ ] Credentials for mounting:
  - [ ] `NAS_IP` (e.g., 192.168.1.100)
  - [ ] `NAS_USER`
  - [ ] `NAS_PASSWORD`
- [ ] Shares configured:
  - `/nfs` or similar for media files

## Passwords to Generate

Generate secure passwords before deployment:

```bash
# Generate secure random passwords
openssl rand -hex 32  # For session secrets
openssl rand -base64 24  # For database passwords
```

| Variable | Purpose | Generation Method |
|----------|---------|-------------------|
| `POSTGRES_PASSWORD` | Main database superuser | `openssl rand -base64 24` |
| `DISCORD_DB_PASSWORD` | Discord bot database | `openssl rand -base64 24` |
| `STREAMBOT_DB_PASSWORD` | Stream bot database | `openssl rand -base64 24` |
| `JARVIS_DB_PASSWORD` | Dashboard database | `openssl rand -base64 24` |
| `WEB_PASSWORD` | Dashboard login | Choose memorable |
| `SESSION_SECRET` | Flask sessions | `openssl rand -hex 32` |
| `SECRET_KEY` | Flask app key | `openssl rand -hex 32` |
| `DISCORD_SESSION_SECRET` | Discord OAuth | `openssl rand -hex 32` |
| `STREAMBOT_SESSION_SECRET` | Stream bot OAuth | `openssl rand -hex 32` |
| `CODE_SERVER_PASSWORD` | VS Code access | Choose memorable |
| `N8N_BASIC_AUTH_PASSWORD` | n8n automation | Choose memorable |
| `VNC_PASSWORD` | Remote desktop | Choose memorable |
| `MINIO_ROOT_PASSWORD` | Object storage | `openssl rand -base64 24` |

## Network Configuration

### Required Ports (Linode Firewall)
Inbound rules needed:
- [ ] 22/tcp (SSH)
- [ ] 80/tcp (HTTP - Caddy)
- [ ] 443/tcp (HTTPS - Caddy)
- [ ] Tailscale interface (all traffic)

### Tailscale ACLs (Recommended)
```json
{
  "acls": [
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:*"]}
  ],
  "tagOwners": {
    "tag:homelab": ["autogroup:admin"]
  }
}
```

## Final Checklist Summary

### Required (Must Have)
- [ ] Linode account with payment method
- [ ] At least one domain with Cloudflare DNS
- [ ] Tailscale account
- [ ] Discord application credentials
- [ ] OpenAI API key
- [ ] All required passwords generated

### Optional (Enhanced Features)
- [ ] Twitch API credentials
- [ ] YouTube API credentials
- [ ] Spotify API credentials
- [ ] Plex token
- [ ] Home Assistant token
- [ ] NAS storage configured
- [ ] Email service (Mailgun/SendGrid)

## Next Steps

Once all prerequisites are complete:
1. [Set up Linode server](linode-setup.md)
2. [Configure local host](local-setup.md)
3. [Manage secrets](secrets.md)
