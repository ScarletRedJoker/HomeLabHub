# URGENT: Fix Discord Bot Connection Issues

## Problem Identified

Your Discord bot can't connect because:
1. **Container name mismatch**: Bot looks for `postgres:5432` but container is `discord-bot-db`
2. **Port not exposed**: Bot's web dashboard port 5000 isn't accessible from host
3. **Port conflict**: Both bot and homelab-dashboard using port 5000 internally

## Solution

Edit your `docker-compose.unified.yml`:

### Fix 1: Change Database Hostname in Bot Environment

Find the `discord-bot` service and update `DATABASE_URL`:

```yaml
services:
  discord-bot:
    environment:
      # CHANGE THIS LINE:
      # DATABASE_URL: "postgresql://ticketbot:${POSTGRES_PASSWORD}@postgres:5432/ticketbot"
      # TO THIS:
      DATABASE_URL: "postgresql://ticketbot:${POSTGRES_PASSWORD}@discord-bot-db:5432/ticketbot"
      # ↑ Use actual container name: discord-bot-db
```

### Fix 2: Expose Bot Port to Host

```yaml
services:
  discord-bot:
    ports:
      - "5001:5000"  # Expose on port 5001 to avoid conflict with homelab-dashboard
```

### Fix 3: Update Nginx Proxy Manager

After making the changes, update your Nginx Proxy Manager:
- Change `bot.rig-city.com` to forward to `http://discord-bot:5001` (or `http://192.168.x.x:5001`)

## Quick Commands

```bash
cd ~/contain/HomeLabHub

# 1. Edit the unified compose file
nano docker-compose.unified.yml
# Make the changes above

# 2. Restart the bot
docker compose -f docker-compose.unified.yml down discord-bot
docker compose -f docker-compose.unified.yml up -d discord-bot

# 3. Check logs (should connect immediately)
docker logs discord-bot --tail=50

# 4. Verify connection
docker exec discord-bot wget -qO- http://localhost:5000/health
```

## Alternative: Rename Container to 'postgres'

If you want to keep DATABASE_URL as `postgres:5432`, rename the container:

```yaml
services:
  postgres:  # Rename service from discord-bot-db
    container_name: postgres  # Change container name
    # ... rest of config ...
```

But this might affect other services if they reference `discord-bot-db`.

## Verify Success

You should see:
```
[Database] Detected local/Docker PostgreSQL
Discord bot ready! Logged in as Rig City Ticket Tool#8919
=== Bot Server Status ===
Connected to 2 server(s)
```

## Complete Fixed Configuration

```yaml
services:
  discord-bot-db:  # Keep this name
    image: postgres:16-alpine
    container_name: discord-bot-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ticketbot
      POSTGRES_USER: ticketbot
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - discord_postgres_data:/var/lib/postgresql/data
    networks:
      - homelab
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ticketbot -d ticketbot"]
      interval: 10s
      timeout: 5s
      retries: 5

  discord-bot:
    build:
      context: ./discord-ticket-bot
      dockerfile: Dockerfile
    container_name: discord-bot
    restart: unless-stopped
    depends_on:
      discord-bot-db:
        condition: service_healthy
    environment:
      # FIX: Use actual container name
      DATABASE_URL: "postgresql://ticketbot:${POSTGRES_PASSWORD}@discord-bot-db:5432/ticketbot"
      DISCORD_BOT_TOKEN: ${DISCORD_BOT_TOKEN}
      DISCORD_CLIENT_ID: ${DISCORD_CLIENT_ID}
      DISCORD_CLIENT_SECRET: ${DISCORD_CLIENT_SECRET}
      DISCORD_APP_ID: ${DISCORD_APP_ID}
      DISCORD_CALLBACK_URL: ${DISCORD_CALLBACK_URL}
      PUBLIC_DOMAIN: ${PUBLIC_DOMAIN}
      SESSION_SECRET: ${SESSION_SECRET}
      HOMELABHUB_API_KEY: ${HOMELABHUB_API_KEY}
      NODE_ENV: production
      PORT: 5000
    volumes:
      - ./discord-ticket-bot/attached_assets:/app/attached_assets
      - ./discord-ticket-bot/logs:/app/logs
    networks:
      - homelab
    ports:
      - "5001:5000"  # FIX: Expose to host on port 5001
    labels:
      - "homelabhub.enable=true"
      - "homelabhub.name=Discord Ticket Bot"
      - "homelabhub.web.url=https://bot.rig-city.com"
      - "homelabhub.metrics.endpoint=/api/homelabhub/metrics"
      - "homelabhub.control.endpoint=/api/homelabhub/control"

networks:
  homelab:
    external: true
    name: homelabhub_homelab

volumes:
  discord_postgres_data:
```
