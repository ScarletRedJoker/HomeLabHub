# Production Deployment Checklist

Use this checklist before deploying to production to ensure everything is configured correctly.

## ✅ Pre-Deployment Checklist

### 1. Environment Variables
- [ ] `DISCORD_BOT_TOKEN` - Bot token from Discord Developer Portal
- [ ] `DISCORD_CLIENT_ID` - Application ID from Discord
- [ ] `DISCORD_CLIENT_SECRET` - OAuth client secret
- [ ] `DISCORD_APP_ID` - Same as DISCORD_CLIENT_ID
- [ ] `DISCORD_CALLBACK_URL` - Your OAuth callback URL (e.g., `https://bot.rig-city.com/auth/discord/callback`)
- [ ] `PUBLIC_DOMAIN` - Your public domain (e.g., `https://bot.rig-city.com`)
- [ ] `SESSION_SECRET` - Random 32+ character string
- [ ] `POSTGRES_PASSWORD` - Strong database password
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] **`HOMELABHUB_API_KEY`** - **Required for homelabhub integration** (generate with: `openssl rand -hex 32`)

### 2. Discord OAuth Configuration
- [ ] OAuth redirect URL added in Discord Developer Portal
- [ ] Bot has required privileged intents enabled:
  - [ ] SERVER MEMBERS INTENT
  - [ ] MESSAGE CONTENT INTENT
- [ ] Bot has required permissions (Manage Channels, Send Messages, etc.)

### 3. Docker Configuration
- [ ] `.env` file created from `.env.example`
- [ ] All environment variables filled in
- [ ] Docker network configured correctly (if using custom networks)
- [ ] Ports properly exposed (5000 for web interface)

### 4. Homelabhub Integration (If Using)
- [ ] `HOMELABHUB_API_KEY` generated and set in `.env`
- [ ] Docker labels verified in `docker-compose.yml`
- [ ] Homelabhub can access bot via Docker network
- [ ] API key configured in homelabhub dashboard

### 5. Reverse Proxy (Nginx/Nginx Proxy Manager)
- [ ] SSL certificate configured
- [ ] Proxy pass to port 5000 configured
- [ ] WebSocket support enabled (for real-time updates)
- [ ] Domain DNS records pointing to server

### 6. Database
- [ ] PostgreSQL container running and healthy
- [ ] Database migrations applied (automatic on first start)
- [ ] Backup strategy in place

### 7. Security
- [ ] `.env` file not committed to git
- [ ] Strong passwords used for all secrets
- [ ] API keys kept secret
- [ ] File permissions restricted on production server

## 🚀 Deployment Commands

### First-Time Deployment

```bash
# 1. Clone repository
git clone https://github.com/yourusername/discord-ticket-bot.git
cd discord-ticket-bot

# 2. Create and configure .env file
cp .env.example .env
nano .env  # Fill in all required values

# 3. Generate homelabhub API key
openssl rand -hex 32
# Add this to .env as HOMELABHUB_API_KEY=<generated_key>

# 4. Start services
docker compose up -d

# 5. Check logs
docker compose logs -f bot

# 6. Verify health
curl http://localhost:5000/health
```

### Update Deployment

```bash
cd ~/discord-ticket-bot
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose logs -f bot
```

## 🔍 Post-Deployment Verification

### 1. Health Checks
```bash
# Check bot container
docker ps | grep discord-bot-app

# Check database container
docker ps | grep discord-bot-db

# Check health endpoint
curl http://localhost:5000/health

# Check homelabhub metrics (with API key)
curl -H "X-Homelabhub-Key: YOUR_API_KEY" http://localhost:5000/api/homelabhub/metrics
```

### 2. Discord Bot
- [ ] Bot shows as online in Discord
- [ ] Slash commands registered (`/ticket`, `/help`)
- [ ] Can create test ticket
- [ ] Developer commands work (`/dev-stats`)

### 3. Web Dashboard
- [ ] Can access dashboard at your domain
- [ ] Discord OAuth login works
- [ ] Can view tickets
- [ ] Real-time updates working

### 4. Homelabhub Integration
- [ ] Bot appears in homelabhub dashboard (via Docker labels)
- [ ] Metrics endpoint returns data
- [ ] Control endpoint can restart bot
- [ ] API key authentication working

## 🐛 Troubleshooting

### Bot Not Starting
```bash
# Check logs for errors
docker compose logs bot

# Verify environment variables
docker compose config

# Check database connectivity
docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "SELECT 1;"
```

### OAuth Not Working
- Verify `DISCORD_CALLBACK_URL` matches Discord Developer Portal
- Check `PUBLIC_DOMAIN` is set correctly
- Ensure SSL is configured on reverse proxy

### Homelabhub Cannot Access Bot
- Verify both containers on same Docker network
- Check API key is set and matches
- Test endpoint manually:
  ```bash
  curl -H "X-Homelabhub-Key: YOUR_KEY" http://discord-bot-app:5000/api/homelabhub/status
  ```

### Database Connection Issues
- Check `DATABASE_URL` format: `postgresql://user:password@host:5432/database`
- Verify PostgreSQL container is healthy: `docker inspect discord-bot-db`
- Check network connectivity between containers

## 📊 Monitoring

### Log Files
```bash
# View bot logs
docker compose logs -f bot

# View database logs
docker compose logs -f postgres

# View last 100 lines
docker compose logs --tail=100 bot
```

### Resource Usage
```bash
# Container stats
docker stats discord-bot-app discord-bot-db

# Disk usage
docker system df
```

### Homelabhub Metrics
The `/api/homelabhub/metrics` endpoint provides:
- Bot status (online/offline)
- Discord statistics (guilds, users, channels)
- System metrics (memory, CPU, uptime)
- Health information

## 🔒 Security Best Practices

1. **Never commit `.env` file** - It contains secrets
2. **Use strong passwords** - For database and session secret
3. **Rotate API keys** - Change homelabhub key periodically
4. **Keep Docker updated** - `docker compose pull` regularly
5. **Monitor logs** - Watch for unauthorized access attempts
6. **Backup database** - Regular automated backups
7. **Use HTTPS only** - Configure SSL on reverse proxy
8. **Restrict developer access** - Only authorized Discord IDs in developers table

## 📚 Additional Documentation

- **[HOMELABHUB_INTEGRATION.md](./HOMELABHUB_INTEGRATION.md)** - Homelabhub setup guide
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick start guide for Replit and Docker
- **[DEPLOY_GUIDE.md](./DEPLOY_GUIDE.md)** - Simple git-based deployment
- **[replit.md](./replit.md)** - System architecture and preferences

## 🎯 Success Criteria

Your deployment is successful when:
- ✅ Bot shows as online in Discord
- ✅ Dashboard accessible via your domain
- ✅ OAuth login working
- ✅ Can create and manage tickets
- ✅ Real-time updates functioning
- ✅ Developer dashboard accessible (for authorized users)
- ✅ Homelabhub showing bot status and metrics
- ✅ No errors in container logs
- ✅ Health endpoint returning 200 OK
- ✅ Database persistent across restarts
