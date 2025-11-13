# Homelab Architecture Overview

## 🏗️ Current Architecture (Already Configured!)

Your homelab is set up as **fully independent services**, each on its own subdomain. The dashboard is just a **monitoring tool** - it doesn't sit in front of your services.

```
                        INTERNET (Port 80, 443)
                                  |
                                  ▼
                        ┌─────────────────┐
                        │   Traefik       │  (Reverse Proxy)
                        │   Port 80/443   │  - SSL Certificates
                        └─────────────────┘  - Domain Routing
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
    bot.rig-city.com      stream.rig-city.com      plex.evindrake.net
    ┌─────────────┐       ┌─────────────┐          ┌─────────────┐
    │ Discord Bot │       │ Stream Bot  │          │ Plex Server │
    │  (Port 3000)│       │ (Port 3000) │          │ (Port 32400)│
    └─────────────┘       └─────────────┘          └─────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
    PostgreSQL DB         Twitch/OpenAI API         Media Files
                          
         ▼                        ▼                        ▼
    n8n.evindrake.net    scarletredjoker.com     vnc.evindrake.net
    ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
    │ n8n Workflow│       │Static Website│       │  VNC Desktop│
    │ (Port 5678) │       │  (Nginx)    │       │ (Port 6080) │
    └─────────────┘       └─────────────┘       └─────────────┘

                              SEPARATE PATH
                                    │
                                    ▼
                          host.evindrake.net
                          ┌─────────────────┐
                          │Homelab Dashboard│  (Monitoring Only)
                          │   (Port 5000)   │
                          └─────────────────┘
                                    │
                        ┌───────────┴───────────┐
                        │   Docker Socket       │
                        │ /var/run/docker.sock  │
                        └───────────────────────┘
                                    │
                    Monitors & Controls All Containers
```

## ✅ How It Works

### **Each Service is INDEPENDENT:**

1. **Discord Bot** (`bot.rig-city.com`)
   - Runs on port 3000
   - Accessible directly at https://bot.rig-city.com
   - Has its own PostgreSQL database
   - Dashboard has NO control over the web interface

2. **Stream Bot** (`stream.rig-city.com`)
   - Runs on port 3000
   - Accessible directly at https://stream.rig-city.com
   - Connects to Twitch API directly
   - Dashboard monitors container only

3. **Plex Server** (`plex.evindrake.net`)
   - Runs on port 32400
   - Accessible directly at https://plex.evindrake.net
   - Users access Plex normally
   - Dashboard can start/stop container only

4. **n8n Automation** (`n8n.evindrake.net`)
   - Runs on port 5678
   - Accessible directly at https://n8n.evindrake.net
   - Your workflows run independently
   - Dashboard monitors status only

5. **Static Website** (`scarletredjoker.com`)
   - Serves files from `/var/www/scarletredjoker/`
   - Accessible directly at https://scarletredjoker.com
   - Dashboard can manage files

6. **VNC Desktop** (`vnc.evindrake.net`)
   - Runs on port 6080
   - Accessible directly at https://vnc.evindrake.net
   - Remote desktop access
   - Dashboard monitors only

### **Dashboard is a MONITORING TOOL:**

- Runs at `host.evindrake.net` (separate subdomain)
- Connects to Docker socket to monitor containers
- Can start/stop/restart containers
- View logs and system metrics
- **Does NOT proxy traffic** to your services
- **Does NOT sit in front** of your services

## 🔑 Access Patterns

### Users Access Services Directly:
```
User → https://bot.rig-city.com → Discord Bot (Port 3000)
User → https://plex.evindrake.net → Plex Server (Port 32400)
User → https://n8n.evindrake.net → n8n (Port 5678)
```

### You Access Dashboard for Monitoring:
```
You → https://host.evindrake.net → Dashboard (Port 5000)
Dashboard → Docker Socket → View all containers
```

## 📊 Traffic Flow

**Public Traffic:**
1. User types `bot.rig-city.com` in browser
2. DNS resolves to your public IP
3. Router forwards port 443 to server
4. Traefik receives request
5. Traefik checks domain → Routes to Discord Bot container
6. User interacts with Discord Bot directly

**Dashboard Monitoring:**
1. You access `host.evindrake.net`
2. Login with username/password (evin / homelab)
3. Dashboard reads Docker socket
4. Shows status of all containers
5. You can start/stop containers
6. View logs and metrics

## 🔒 Security Layers

1. **Twingate VPN** - Your primary security (external access)
2. **Traefik SSL** - HTTPS for all domains (automatic Let's Encrypt)
3. **Dashboard Login** - Username/password protection
4. **Container Isolation** - Each service in its own container
5. **Firewall** - Only ports 80/443 exposed

## 🎯 Summary

**Your architecture is ALREADY CORRECT!**

✅ Each service has its own subdomain
✅ Each service is independently accessible  
✅ Dashboard is a separate monitoring tool
✅ Dashboard does NOT proxy your services
✅ Users access services directly
✅ You use dashboard to monitor/control

**Nothing needs to change** - your understanding is perfect!

## 🔐 Dashboard Login (SIMPLIFIED)

**Default Credentials:**
- Username: `evin`
- Password: `homelab`

**To change:**
Edit `.env` file:
```bash
WEB_USERNAME=your_username
WEB_PASSWORD=your_secure_password
```

Then restart:
```bash
docker compose -f docker-compose.unified.yml restart homelab-dashboard
```

**This is shown on the login page** for convenience!
