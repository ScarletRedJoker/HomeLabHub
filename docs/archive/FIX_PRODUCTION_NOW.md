# 🚨 URGENT FIX: Production Issues

**Run these commands on your Ubuntu server NOW**

---

## 🔍 Step 1: Check What's Actually Running

```bash
cd /home/evin/contain/HomeLabHub

# See which containers are running
docker compose -f docker-compose.unified.yml ps

# Look for:
# - rig-city-site (should be "healthy" or "running")
# - code-server (probably restarting or unhealthy)
```

---

## 🛠️ Step 2: Fix Code-Server Permissions

The code-server container needs proper permissions. Run this:

```bash
# Create the volumes directory if it doesn't exist
sudo mkdir -p ./volumes/code-server

# Set proper ownership (replace 'evin' if your username is different)
sudo chown -R 1000:1000 ./volumes/code-server

# Set proper permissions
sudo chmod -R 755 ./volumes/code-server
```

---

## 🚀 Step 3: Restart All Services

```bash
# Stop everything
docker compose -f docker-compose.unified.yml down

# Start everything fresh
docker compose -f docker-compose.unified.yml up -d

# Wait 2-3 minutes for services to stabilize
sleep 120

# Check status again
docker compose -f docker-compose.unified.yml ps
```

---

## ✅ Step 4: Verify Each Service

```bash
# Check rig-city-site
curl -I http://localhost:80 -H "Host: rig-city.com"
# Should return: HTTP/1.1 200 OK

# Check code-server
docker logs code-server --tail=20
# Should NOT show "permission denied" errors

# Check if code-server is actually running
docker exec code-server ps aux | grep code-server
# Should show code-server process running
```

---

## 🌐 Step 5: Test Public URLs

```bash
# Test rig-city.com
curl -I https://rig-city.com
# Should return: HTTP/2 200

# Test www.rig-city.com
curl -I https://www.rig-city.com
# Should return: HTTP/2 301 (redirect to rig-city.com)

# Test code-server
curl -I https://code.evindrake.net
# Should return: HTTP/2 200
```

---

## 📊 Expected Output (Good Deployment)

```
NAME                    IMAGE              STATUS
caddy                   caddy:2-alpine     Up (healthy)
homelab-dashboard       ...                Up (healthy)
homelab-redis           redis:7-alpine     Up (healthy)
discord-bot-db          postgres:16-alpine Up (healthy)
minio                   minio/minio        Up (healthy)
rig-city-site           nginx:alpine       Up (healthy)
code-server             ...                Up (healthy)
scarletredjoker-web     nginx:alpine       Up (healthy)
vnc-desktop             ...                Up
homeassistant           ...                Up
...
```

**All should show "Up (healthy)" or at least "Up"**

---

## 🚨 If rig-city-site Container is Missing

If `docker compose ps` doesn't show rig-city-site at all:

```bash
# Check if the service directory exists
ls -la services/rig-city-site/

# If it doesn't exist, create minimal content:
mkdir -p services/rig-city-site
cat > services/rig-city-site/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Rig City Community</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
        }
        h1 { color: #333; }
        p { color: #666; }
    </style>
</head>
<body>
    <h1>🎮 Rig City Community</h1>
    <p>Welcome to Rig City! Site under construction.</p>
    <p>Join us on Discord: <a href="https://bot.rig-city.com">bot.rig-city.com</a></p>
    <p>Watch streams: <a href="https://stream.rig-city.com">stream.rig-city.com</a></p>
</body>
</html>
EOF

# Then rebuild
docker compose -f docker-compose.unified.yml up -d rig-city-site
```

---

## 🚨 If Code-Server Still Failing

If code-server still shows permission errors after Step 2:

```bash
# Check current ownership
ls -la volumes/code-server/

# Nuclear option - remove and recreate
docker compose -f docker-compose.unified.yml stop code-server
sudo rm -rf ./volumes/code-server
sudo mkdir -p ./volumes/code-server
sudo chown -R 1000:1000 ./volumes/code-server
sudo chmod -R 755 ./volumes/code-server

# Start code-server
docker compose -f docker-compose.unified.yml up -d code-server

# Watch logs
docker logs -f code-server
# Press Ctrl+C to exit

# Should see: "HTTP server listening on http://0.0.0.0:8080/"
```

---

## 📋 Quick Health Check Command

Run this one-liner to check everything:

```bash
docker compose -f docker-compose.unified.yml ps | grep -E "(rig-city-site|code-server)" && \
curl -I https://rig-city.com && \
curl -I https://code.evindrake.net
```

---

## ⏰ Expected Timeline

- **Step 1:** 30 seconds (check status)
- **Step 2:** 1 minute (fix permissions)
- **Step 3:** 3 minutes (restart services)
- **Step 4:** 2 minutes (verify)
- **Step 5:** 1 minute (test URLs)

**Total: ~7-8 minutes to fix everything**

---

## 🎯 Success Criteria

✅ **www.rig-city.com loads** (shows website or redirect)  
✅ **code.evindrake.net loads** (no permission errors in logs)  
✅ **All containers show "healthy" status**  
✅ **No restart loops in docker logs**  

---

## 📞 If Still Broken

Send me the output of:

```bash
# 1. Container status
docker compose -f docker-compose.unified.yml ps

# 2. Code-server logs
docker logs code-server --tail=50

# 3. Caddy logs (for rig-city routing)
docker logs caddy --tail=50 | grep rig-city

# 4. Rig-city-site logs
docker logs rig-city-site --tail=20
```

---

**DO THIS NOW - Your investor demo needs these sites working!** 🚀
