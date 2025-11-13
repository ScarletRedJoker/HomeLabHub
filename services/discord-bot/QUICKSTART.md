# Quick Start Guide

This guide provides step-by-step instructions for deploying the Discord Ticket Bot in different environments.

## Table of Contents
1. [Replit Deployment (Easiest)](#replit-deployment)
2. [Docker Deployment (Production)](#docker-deployment)
3. [Environment Variables Reference](#environment-variables-reference)

---

## Replit Deployment

### Step 1: Fork the Repl

1. Open this Repl in Replit
2. Click **Fork** to create your own copy

### Step 2: Create Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** → Enter name → Create
3. Note the **Application ID** (this is your `DISCORD_CLIENT_ID` and `DISCORD_APP_ID`)

### Step 3: Configure OAuth2

1. Click **OAuth2** → **General** in sidebar
2. Copy the **Client Secret** (this is your `DISCORD_CLIENT_SECRET`)
3. Click **Add Redirect**
4. Enter: `https://YOUR-REPL-NAME.YOUR-USERNAME.repl.co/auth/discord/callback`
   - Replace `YOUR-REPL-NAME` and `YOUR-USERNAME` with your actual Repl details
5. Click **Save Changes**

### Step 4: Create Bot Token

1. Click **Bot** in sidebar
2. Click **Reset Token** → **Yes, do it!**
3. Copy the token (this is your `DISCORD_BOT_TOKEN`)
4. Scroll down to **Privileged Gateway Intents**
5. Enable these intents:
   - ✅ **SERVER MEMBERS INTENT**
   - ✅ **MESSAGE CONTENT INTENT**
6. Click **Save Changes**

### Step 5: Add Secrets in Replit

1. In Replit, open the **Secrets** tool (🔒 icon in left sidebar)
2. Add these secrets one by one:

| Key | Value | How to Get |
|-----|-------|------------|
| `DISCORD_CLIENT_ID` | Your Application ID | From Step 2 |
| `DISCORD_APP_ID` | Same as CLIENT_ID | From Step 2 |
| `DISCORD_CLIENT_SECRET` | Your Client Secret | From Step 3 |
| `DISCORD_BOT_TOKEN` | Your Bot Token | From Step 4 |
| `SESSION_SECRET` | Random 32-char string | Run: `openssl rand -base64 32` |

**Optional - For Spotify Integration:**
| Key | Value | How to Get |
|-----|-------|------------|
| `SPOTIFY_CLIENT_ID` | Spotify App ID | [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) |
| `SPOTIFY_CLIENT_SECRET` | Spotify App Secret | Spotify Developer Dashboard |

### Step 6: Add PostgreSQL Database

1. In Replit, click **+ Add Database**
2. Select **PostgreSQL**
3. Click **Create Database**
4. The `DATABASE_URL` will be automatically added to your secrets

### Step 7: Invite Bot to Server

1. In Discord Developer Portal, click **OAuth2** → **URL Generator**
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select permissions (or use code `274878221376`):
   - ✅ View Channels
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Attach Files
   - ✅ Read Message History
   - ✅ Manage Messages
   - ✅ Manage Channels
   - ✅ Connect (voice)
   - ✅ Speak (voice)
4. Copy the generated URL
5. Open URL in browser and invite bot to your server

### Step 8: Run the Bot

1. In Replit, click the **Run** button (or press Ctrl+Enter)
2. Wait for startup logs showing:
   ```
   Discord bot ready! Logged in as YourBot#1234
   ✅ Successfully loaded X ticket-channel mappings
   ✅ YouTube and Spotify extractors registered successfully
   12:00:00 AM [express] serving on port 5000
   ```
3. Click **Open website** in the webview
4. Click **Login with Discord**
5. Authorize the application

### Step 9: Configure Bot in Dashboard

1. Select your server from dropdown
2. Go to **Settings** tab
3. Configure:
   - **General**: Set admin roles
   - **Categories**: Create ticket categories
   - **Channels**: Set up ticket channels
   - **Music**: Configure music bot settings

### Step 10: Test Everything

1. In Discord, type `/ticket` → Select category → Create ticket
2. Verify ticket channel appears and dashboard updates
3. Join a voice channel, type `/play never gonna give you up`
4. Verify music starts playing and dashboard Music tab updates

**✅ You're all set!** The bot is now running on Replit.

---

## Docker Deployment

**🔧 Database Driver Auto-Detection**: The application automatically detects your database type:
- **Neon Cloud (Replit)**: Uses serverless driver with WebSocket for Neon-hosted PostgreSQL
- **Local/Docker PostgreSQL**: Uses standard pg driver for Docker containers and traditional PostgreSQL servers

The detection is automatic based on your `DATABASE_URL` - no configuration needed!

### Prerequisites

- Ubuntu/Debian server with 2GB RAM minimum
- Docker and Docker Compose installed
- Domain name (for HTTPS)

### Step 1: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

### Step 2: Clone Repository

```bash
cd ~
git clone https://github.com/yourusername/discord-ticket-bot.git
cd discord-ticket-bot
```

### Step 3: Create Environment File

```bash
nano .env
```

Paste and customize:

```env
# Discord Configuration
DISCORD_CLIENT_ID=your_application_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_APP_ID=your_application_id

# Database Configuration
POSTGRES_PASSWORD=ChooseAStrongPassword123!
DATABASE_URL=postgresql://ticketbot:ChooseAStrongPassword123!@postgres:5432/ticketbot

# Session Security (generate with: openssl rand -base64 32)
SESSION_SECRET=paste_your_generated_secret_here

# Public Domain
PUBLIC_DOMAIN=https://yourdomain.com
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback

# Environment
NODE_ENV=production
PORT=5000
```

**Save**: Press `Ctrl+X`, then `Y`, then `Enter`

### Step 4: Generate Session Secret

```bash
openssl rand -base64 32
```

Copy the output and paste it as `SESSION_SECRET` in `.env`

### Step 5: Configure Discord Redirect URL

Update Discord Developer Portal OAuth2 redirect URL to:
```
https://yourdomain.com/auth/discord/callback
```

### Step 6: Build and Start

```bash
# Build and start containers
docker compose up -d

# View logs
docker compose logs -f bot

# Wait for this line:
# "Discord bot ready! Logged in as YourBot#1234"
```

### Step 7: Set Up Nginx + SSL

#### Install Nginx and Certbot

```bash
sudo apt-get update
sudo apt-get install nginx certbot python3-certbot-nginx
```

#### Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/ticketbot
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

#### Enable Site and Get SSL

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ticketbot /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com

# Follow prompts and select option 2 (redirect HTTP to HTTPS)
```

### Step 8: Verify Deployment

```bash
# Check health endpoint
curl https://yourdomain.com/health

# Expected output:
# {"status":"healthy","timestamp":"...","uptime":123}
```

### Step 9: Monitor and Maintain

```bash
# View logs
docker compose logs -f bot

# Restart bot
docker compose restart bot

# Stop bot
docker compose down

# Update bot
git pull
docker compose up -d --build
```

**✅ Production deployment complete!**

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DISCORD_CLIENT_ID` | Discord Application ID | `123456789012345678` |
| `DISCORD_APP_ID` | Same as CLIENT_ID | `123456789012345678` |
| `DISCORD_CLIENT_SECRET` | Discord OAuth2 secret | `AbC123...` |
| `DISCORD_BOT_TOKEN` | Discord bot token | `MTE...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Express session secret (32+ chars) | Generate with `openssl rand -base64 32` |
| `PUBLIC_DOMAIN` | Your public URL | `https://yourdomain.com` |
| `DISCORD_CALLBACK_URL` | OAuth2 callback | `https://yourdomain.com/auth/discord/callback` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SPOTIFY_CLIENT_ID` | Spotify app ID (for playlist import) | None |
| `SPOTIFY_CLIENT_SECRET` | Spotify app secret | None |
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `5000` |
| `POSTGRES_PASSWORD` | Database password (Docker only) | None |

### Security Best Practices

- ✅ **Never commit `.env` to version control** - Add to `.gitignore`
- ✅ **Use strong passwords** - 16+ characters, mixed case, numbers, symbols
- ✅ **Rotate secrets regularly** - Change SESSION_SECRET monthly
- ✅ **Keep tokens secure** - Never share bot token publicly
- ✅ **Enable 2FA** - On Discord account used for bot
- ✅ **Use HTTPS** - Always in production (via Nginx + Let's Encrypt)

---

## Troubleshooting

### "Connection terminated due to connection timeout"

**Fixed in latest version!** The bot now uses Neon serverless driver with retry logic.

If you still see this:
1. Verify `DATABASE_URL` is set correctly
2. Check database is running: `docker compose ps`
3. View database logs: `docker compose logs db`

### Bot Not Responding to Commands

1. Check bot is online in Discord
2. Verify slash commands registered:
   ```bash
   docker compose logs bot | grep "registered application commands"
   ```
3. Ensure bot has proper permissions in server
4. Check bot logs for errors: `docker compose logs -f bot`

### Music Not Playing

1. Ensure bot is in voice channel
2. Check bot has voice permissions
3. View music logs:
   ```bash
   docker compose logs bot | grep -i music
   ```
4. Verify ffmpeg installed (included in Docker image)

### Dashboard Login Not Working

1. Verify `DISCORD_CALLBACK_URL` matches your actual domain
2. Check redirect URL is correct in Discord Developer Portal
3. Ensure `PUBLIC_DOMAIN` is set to your actual domain (with `https://`)
4. Clear browser cookies and try again

### WebSocket Connection Failed

1. Check Nginx WebSocket proxy is configured (see Step 7)
2. Verify firewall allows WebSocket connections
3. Check browser console for specific error messages

---

## Need More Help?

- **Full Documentation**: See [README.md](./README.md)
- **Technical Details**: See [replit.md](./replit.md)
- **GitHub Issues**: Open an issue if you encounter problems
- **Discord Commands**: Type `/help` in Discord after bot is running

---

**Ready to deploy?** Choose your platform above and follow the step-by-step guide!
