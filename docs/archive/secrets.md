# Secrets Management

Guide to managing API keys, passwords, and sensitive configuration in HomeLabHub.

## Secret Categories

### Auto-Generated Secrets
These are automatically generated during bootstrap if not provided:

| Variable | Purpose | Generation |
|----------|---------|------------|
| `SERVICE_AUTH_TOKEN` | Inter-service authentication | `openssl rand -hex 32` |

### Required User Secrets
These must be provided by the user:

| Variable | Source | Required |
|----------|--------|----------|
| `POSTGRES_PASSWORD` | User generated | ✓ |
| `DISCORD_DB_PASSWORD` | User generated | ✓ |
| `STREAMBOT_DB_PASSWORD` | User generated | ✓ |
| `JARVIS_DB_PASSWORD` | User generated | ✓ |
| `WEB_USERNAME` | User chosen | ✓ |
| `WEB_PASSWORD` | User chosen | ✓ |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal | ✓ |
| `DISCORD_CLIENT_ID` | Discord Developer Portal | ✓ |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal | ✓ |
| `OPENAI_API_KEY` | OpenAI Platform | ✓ |

### Optional Secrets
For enhanced functionality:

| Variable | Source | Purpose |
|----------|--------|---------|
| `TWITCH_CLIENT_ID` | Twitch Developer | Stream integration |
| `TWITCH_CLIENT_SECRET` | Twitch Developer | Stream integration |
| `YOUTUBE_CLIENT_ID` | Google Cloud | YouTube integration |
| `YOUTUBE_CLIENT_SECRET` | Google Cloud | YouTube integration |
| `SPOTIFY_CLIENT_ID` | Spotify Developer | Music integration |
| `SPOTIFY_CLIENT_SECRET` | Spotify Developer | Music integration |
| `PLEX_TOKEN` | Plex.tv | Plex integration |
| `HOME_ASSISTANT_TOKEN` | Home Assistant | Smart home |
| `CODE_SERVER_PASSWORD` | User chosen | VS Code access |
| `N8N_BASIC_AUTH_PASSWORD` | User chosen | n8n automation |
| `VNC_PASSWORD` | User chosen | Remote desktop |
| `MINIO_ROOT_PASSWORD` | User generated | Object storage |

## Generating Secure Passwords

### Using OpenSSL
```bash
# For session secrets (64 hex characters)
openssl rand -hex 32

# For database passwords (base64, shorter)
openssl rand -base64 24

# For API tokens (URL-safe)
openssl rand -base64 32 | tr -d '/+=' | head -c 48
```

### Using pwgen
```bash
# Install pwgen
sudo apt install pwgen

# Generate secure passwords
pwgen -s 32 1  # Random, 32 characters
pwgen -sy 24 1 # With symbols, 24 characters
```

### Batch Generation Script
```bash
#!/bin/bash
# generate-secrets.sh - Generate all required secrets

echo "=== Auto-Generated Secrets ==="
echo ""
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)"
echo "DISCORD_DB_PASSWORD=$(openssl rand -base64 24)"
echo "STREAMBOT_DB_PASSWORD=$(openssl rand -base64 24)"
echo "JARVIS_DB_PASSWORD=$(openssl rand -base64 24)"
echo ""
echo "SESSION_SECRET=$(openssl rand -hex 32)"
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "DISCORD_SESSION_SECRET=$(openssl rand -hex 32)"
echo "STREAMBOT_SESSION_SECRET=$(openssl rand -hex 32)"
echo ""
echo "MINIO_ROOT_PASSWORD=$(openssl rand -base64 24)"
```

## Environment File Security

### File Permissions
```bash
# Set restrictive permissions on .env file
chmod 600 .env

# Verify permissions
ls -la .env
# Should show: -rw------- (owner read/write only)
```

### Git Exclusion
The `.env` file should never be committed to git. Verify `.gitignore`:

```bash
# Check .gitignore includes .env
grep ".env" .gitignore

# If missing, add it
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
```

### Backup .env Securely
```bash
# Create encrypted backup
gpg -c .env
# Creates .env.gpg (password protected)

# Decrypt when needed
gpg -d .env.gpg > .env.restored
```

## Distributing Secrets Between Servers

### Secure Copy to Linode
```bash
# From local machine to Linode (via SSH)
scp ~/.homelab-secrets root@linode-ip:/opt/homelab/.env

# Or using rsync
rsync -avz --chmod=600 .env root@linode-ip:/opt/homelab/HomeLabHub/
```

### Sharing via Tailscale
Since both servers are on Tailscale, you can use secure internal networking:

```bash
# Copy from local to Linode via Tailscale hostname
scp .env homelab-cloud:/opt/homelab/HomeLabHub/.env
```

### Using 1Password/Bitwarden (Recommended)
Store secrets in a password manager and access via CLI:

```bash
# 1Password CLI
op read "op://HomeLabHub/Linode/.env" > .env

# Bitwarden CLI
bw get item "HomeLabHub Secrets" --field notes > .env
```

## Secret Rotation Procedures

### Rotating Database Passwords

**Step 1: Generate new passwords**
```bash
NEW_DISCORD_PW=$(openssl rand -base64 24)
NEW_STREAMBOT_PW=$(openssl rand -base64 24)
NEW_JARVIS_PW=$(openssl rand -base64 24)
```

**Step 2: Update PostgreSQL**
```bash
# Connect to PostgreSQL
docker exec -it homelab-postgres psql -U postgres

# Update each user password
ALTER USER ticketbot WITH PASSWORD 'new_password';
ALTER USER streambot WITH PASSWORD 'new_password';
ALTER USER jarvis WITH PASSWORD 'new_password';
```

**Step 3: Update .env file**
```bash
# Update .env with new passwords
nano .env

# Update these lines:
DISCORD_DB_PASSWORD=new_password
STREAMBOT_DB_PASSWORD=new_password
JARVIS_DB_PASSWORD=new_password
```

**Step 4: Restart services**
```bash
./homelab restart
```

### Rotating API Keys

| Service | Rotation Procedure |
|---------|-------------------|
| Discord | Create new bot token in Developer Portal, update `DISCORD_BOT_TOKEN` |
| OpenAI | Create new API key, revoke old one, update `OPENAI_API_KEY` |
| Twitch | Regenerate in Developer Console, update `TWITCH_CLIENT_SECRET` |

### Rotating Session Secrets

```bash
# Generate new session secrets
NEW_SESSION=$(openssl rand -hex 32)
NEW_DISCORD_SESSION=$(openssl rand -hex 32)

# Update .env
sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=$NEW_SESSION/" .env
sed -i "s/DISCORD_SESSION_SECRET=.*/DISCORD_SESSION_SECRET=$NEW_DISCORD_SESSION/" .env

# Restart services (users will need to re-login)
./homelab restart
```

## OAuth Redirect URLs

When setting up OAuth credentials, use these redirect URLs:

| Service | Redirect URL |
|---------|-------------|
| Discord (Bot Dashboard) | `https://bot.rig-city.com/auth/discord/callback` |
| Twitch (Stream Bot) | `https://stream.rig-city.com/api/auth/twitch/callback` |
| YouTube (Stream Bot) | `https://stream.rig-city.com/api/auth/youtube/callback` |
| Spotify (Stream Bot) | `https://stream.rig-city.com/api/auth/spotify/callback` |
| Kick (Stream Bot) | `https://stream.rig-city.com/api/auth/kick/callback` |

## Environment Variable Reference

### Full .env Template
See `.env.example` in the repository root for a complete template with all variables.

### Required Variables Quick Reference

```bash
# ═══════════════════════════════════════════════════════════════════
# REQUIRED - Must be set before deployment
# ═══════════════════════════════════════════════════════════════════

# Database
POSTGRES_PASSWORD=
DISCORD_DB_PASSWORD=
STREAMBOT_DB_PASSWORD=
JARVIS_DB_PASSWORD=

# Dashboard
WEB_USERNAME=admin
WEB_PASSWORD=

# Discord
DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=

# AI
OPENAI_API_KEY=

# Sessions (auto-generated if empty)
SESSION_SECRET=
SECRET_KEY=
DISCORD_SESSION_SECRET=
SERVICE_AUTH_TOKEN=
```

## Security Best Practices

1. **Never commit secrets to git**
   - Always check `.gitignore` includes `.env`
   - Use `git status` before committing

2. **Use unique passwords for each service**
   - Don't reuse database passwords
   - Generate random passwords for each purpose

3. **Rotate secrets periodically**
   - API keys: Every 6 months
   - Database passwords: Every 12 months
   - Session secrets: After security incidents

4. **Limit secret exposure**
   - Only add secrets that are actually needed
   - Remove unused API keys from .env

5. **Monitor for leaked secrets**
   - Use GitHub secret scanning
   - Set up alerts for exposed credentials

## Troubleshooting

### "Missing required variable" error
```bash
# Check which variables are missing
grep -E "^(POSTGRES_PASSWORD|DISCORD_DB_PASSWORD|JARVIS_DB_PASSWORD)=" .env

# Ensure no empty values
grep "=$" .env  # Shows lines ending with =
```

### Database authentication failures
```bash
# Check current database passwords
docker exec -it homelab-postgres psql -U postgres -c "\du"

# Verify password in .env matches database
grep "DISCORD_DB_PASSWORD" .env
docker exec -it homelab-postgres psql -U ticketbot -d ticketbot -W
```

### Service connection errors
```bash
# Check SERVICE_AUTH_TOKEN is consistent across services
grep SERVICE_AUTH_TOKEN .env
docker exec homelab-dashboard printenv | grep SERVICE_AUTH_TOKEN
```
