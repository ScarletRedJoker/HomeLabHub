# Simple Git-Based Deployment

## Setup (One Time)

1. **Initialize git in Replit**:
   ```bash
   # In Replit shell
   git init
   git add .
   git commit -m "Initial commit"
   ```

2. **Create GitHub repo** and push:
   ```bash
   # In Replit shell
   git remote add origin https://github.com/yourusername/discord-ticket-bot.git
   git push -u origin main
   ```

3. **Clone to your Ubuntu machine**:
   ```bash
   cd ~
   git clone https://github.com/yourusername/discord-ticket-bot.git
   cd discord-ticket-bot
   
   # Create .env file from example
   cp .env.example .env
   nano .env
   # Add your production environment variables (see below)
   ```

4. **Generate required secrets**:
   ```bash
   # Generate session secret
   openssl rand -base64 32
   
   # Generate homelabhub API key (if using homelabhub)
   openssl rand -hex 32
   ```

5. **Configure environment variables** in `.env`:
   - Discord credentials (BOT_TOKEN, CLIENT_ID, CLIENT_SECRET, APP_ID)
   - Database password (POSTGRES_PASSWORD)
   - Session secret (from step 4)
   - Public domain (PUBLIC_DOMAIN, DISCORD_CALLBACK_URL)
   - **HOMELABHUB_API_KEY** (from step 4, required for homelabhub integration)

## Deploy Updates

Whenever you make changes in Replit:

1. **Commit and push in Replit**:
   ```bash
   git add .
   git commit -m "Your changes"
   git push
   ```

2. **Deploy on Ubuntu**:
   ```bash
   cd ~/discord-ticket-bot
   ./deploy.sh
   ```

That's it! The script:
- Pulls latest code
- Rebuilds Docker containers
- Restarts the bot

## Alternative: Manual Deploy

```bash
cd ~/discord-ticket-bot
git pull
docker compose down
docker compose build
docker compose up -d
```

## View Logs

```bash
docker compose logs -f bot
```
