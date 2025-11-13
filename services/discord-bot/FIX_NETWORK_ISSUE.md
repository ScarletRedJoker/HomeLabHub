# Fix Discord Bot Network Connectivity Issue

## 🚨 Problem
Your Discord bot cannot connect to PostgreSQL because they're on **different Docker networks** in your unified compose file.

## ✅ Solution Steps

### Option 1: Quick Fix (Add to Existing Networks)

**1. Find your main network name:**
```bash
# On your Ubuntu server
docker network ls
# Look for the network used by your other services (homelab-dashboard, etc.)
```

**2. Edit `docker-compose.unified.yml`:**

Find the `discord-bot` and `postgres` services, then ensure they both have:

```yaml
services:
  postgres:
    # ... existing config ...
    networks:
      - your-main-network-name  # Add this line

  discord-bot:
    # ... existing config ...
    networks:
      - your-main-network-name  # Add this line (same network!)
    depends_on:
      postgres:
        condition: service_healthy  # Add this to wait for DB
```

**3. Restart services:**
```bash
cd ~/discord-ticket-bot  # or your homelab directory
docker compose -f docker-compose.unified.yml down discord-bot postgres
docker compose -f docker-compose.unified.yml up -d postgres
# Wait 10 seconds for postgres to be healthy
sleep 10
docker compose -f docker-compose.unified.yml up -d discord-bot
```

### Option 2: Use Standalone Bot Deployment

If you want to keep the bot separate from your unified compose:

**1. Navigate to bot directory:**
```bash
cd ~/discord-ticket-bot
```

**2. Use the bot's own docker-compose.yml:**
```bash
# Ensure .env file has all required variables
cp .env.example .env
nano .env  # Fill in all values

# Start bot with its own compose file
docker compose up -d
```

**3. Connect to Nginx Proxy Manager:**
- The bot will run on port 5000
- Configure NPM to proxy bot.rig-city.com → localhost:5000

### Option 3: Fix Port Conflict (If Port 5000 Taken)

If your homelab-dashboard is already using port 5000:

**1. Change bot port in docker-compose.unified.yml:**
```yaml
discord-bot:
  # ... other config ...
  environment:
    PORT: 5001  # Change to different port
  ports:
    - "5001:5001"  # Update port mapping
```

**2. Update Nginx Proxy Manager:**
- Change bot.rig-city.com to proxy to port 5001 instead of 5000

## 🔍 Verification Commands

### Check if postgres is running:
```bash
docker ps | grep postgres
docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "SELECT 1;"
```

### Check network connectivity:
```bash
# Get postgres IP
docker inspect discord-bot-db | grep IPAddress

# Test from discord-bot container
docker exec discord-bot-app ping -c 2 postgres
# Should show successful pings
```

### Check bot logs:
```bash
docker logs discord-bot-app --tail=50
# Should show successful database connection
```

### Test homelabhub endpoints:
```bash
# Replace with your API key
curl -H "X-Homelabhub-Key: YOUR_KEY" http://localhost:5000/api/homelabhub/status
```

## 🎯 Expected Success Output

When fixed, you should see in the bot logs:
```
[Database] Detected local/Docker PostgreSQL, using standard pg driver
Discord bot ready! Logged in as Rig City Ticket Tool#8919
=== Bot Server Status ===
Connected to 2 server(s):
  - Joker's Evil Headquarters (ID: 623281252451221515)
  - Rig City (ID: 692850100795473920)
```

## 📋 Checklist

- [ ] Identify your main Docker network name
- [ ] Update both `postgres` and `discord-bot` to use same network
- [ ] Add `depends_on: postgres: condition: service_healthy`
- [ ] Restart postgres first, then bot
- [ ] Verify postgres is accessible from bot container
- [ ] Check bot logs for successful connection
- [ ] Test bot in Discord
- [ ] Test dashboard at bot.rig-city.com
- [ ] Verify homelabhub can discover bot

## 🆘 Still Not Working?

### Get detailed network info:
```bash
# Show all networks
docker network ls

# Inspect your main network
docker network inspect YOUR_NETWORK_NAME

# See which containers are on which networks
docker ps --format "table {{.Names}}\t{{.Networks}}"
```

### Common Issues:

**Issue**: Port 5000 already in use
- **Fix**: Change bot port to 5001 or another available port

**Issue**: postgres service doesn't exist
- **Fix**: Add postgres service from `docker-compose.bot-fix.yml`

**Issue**: DATABASE_URL wrong
- **Fix**: Ensure it's `postgresql://ticketbot:PASSWORD@postgres:5432/ticketbot`

**Issue**: Networks don't match
- **Fix**: Both services MUST be on the same network

### Send me this info if still stuck:
```bash
# Get current configuration
docker ps --format "table {{.Names}}\t{{.Networks}}\t{{.Ports}}"
docker network inspect $(docker network ls -q) | grep -E "Name|Containers" -A 20
docker logs discord-bot-app --tail=100
```

## 📚 Reference Files

- `docker-compose.bot-fix.yml` - Example configuration for unified compose
- `HOMELABHUB_INTEGRATION.md` - Homelabhub integration guide
- `DEPLOYMENT_CHECKLIST.md` - Full deployment checklist
