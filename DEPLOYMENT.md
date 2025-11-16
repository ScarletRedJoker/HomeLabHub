# 🚀 HOMELAB DASHBOARD - DEPLOYMENT GUIDE

## Quick Deploy (5 Minutes)

### On Your Ubuntu Server

1. **Pull Latest Code**
```bash
cd /home/evin/contain/HomeLabHub
git pull origin main
```

2. **Deploy Everything**
```bash
./scripts/homelab-manager.sh
# Select Option 1: Full Deploy
```

3. **Access Dashboard**
- Demo: https://test.evindrake.net (login: evin/homelab)
- Production: https://home.evindrake.net

---

## Features Verification Checklist

After deployment, verify these features work:

### ✅ Login
- [ ] Navigate to https://test.evindrake.net
- [ ] See "Default: evin / homelab" message
- [ ] Login successfully

### ✅ Central Control Hub
- [ ] Navigate to /control-center
- [ ] See real-time stats (apps available, deployed, agent messages)
- [ ] Quick action cards display
- [ ] Activity feed shows data

### ✅ Smart Home Integration
- [ ] Navigate to /smart-home
- [ ] Energy dashboard shows stats
- [ ] Device grid displays
- [ ] Automation list loads

### ✅ Local AI Foundry
- [ ] Navigate to /ai-foundry
- [ ] Model grid shows Llama 2, Mistral, CodeLlama
- [ ] Chat interface works
- [ ] Can type messages

### ✅ Agent-to-Agent Chat
- [ ] Navigate to /agent-ops
- [ ] Message feed displays
- [ ] Can simulate demo dialogue

### ✅ Container Marketplace
- [ ] Navigate to /marketplace
- [ ] 20 apps display in grid
- [ ] Search works
- [ ] Category filtering works

---

## Demo Mode vs Production Mode

### Demo Mode (Default)
```bash
export DEMO_MODE=true
./scripts/homelab-manager.sh
```
- Auto-login: evin/homelab
- Mock data for all services
- No real connections needed
- Perfect for investor demos

### Production Mode
```bash
# In /home/evin/contain/HomeLabHub/.env
DEMO_MODE=false
HOME_ASSISTANT_URL=http://192.168.1.x:8123
HOME_ASSISTANT_TOKEN=your_long_lived_token_here
WEB_USERNAME=your_secure_username
WEB_PASSWORD=your_secure_password
```

Then deploy:
```bash
./scripts/homelab-manager.sh
# Select Option 1: Full Deploy
```

---

## Production Setup (Real Services)

### 1. Install Ollama (Local AI)
```bash
# Install Ollama
curl https://ollama.ai/install.sh | sh

# Download models
ollama pull llama2
ollama pull mistral
ollama pull codellama

# Verify running
curl http://localhost:11434/api/tags
```

### 2. Get Home Assistant Token
```bash
# Access Home Assistant
firefox https://home.evindrake.net

# In Home Assistant:
# Profile → Long-Lived Access Tokens → Create Token
# Copy the token
```

### 3. Configure Environment
```bash
cd /home/evin/contain/HomeLabHub

# Edit .env file
nano .env

# Add these lines:
DEMO_MODE=false
HOME_ASSISTANT_URL=http://192.168.1.x:8123
HOME_ASSISTANT_TOKEN=paste_your_token_here
WEB_USERNAME=your_username
WEB_PASSWORD=your_secure_password
```

### 4. Deploy
```bash
./scripts/homelab-manager.sh
# Select Option 1: Full Deploy
```

---

## Troubleshooting

### Dashboard Won't Start
```bash
# Check logs
docker logs homelab-dashboard

# Common issues:
# - Database not running: docker-compose up -d postgres
# - Port 5000 in use: sudo lsof -i :5000
```

### Features Show Mock Data in Production
```bash
# Verify DEMO_MODE is false
cat .env | grep DEMO_MODE

# Check service availability
curl http://localhost:11434/api/tags  # Ollama
curl http://192.168.1.x:8123/api/  # Home Assistant
```

### Git Sync Not Working
```bash
# Manual sync
cd /home/evin/contain/HomeLabHub
git pull origin main
./scripts/homelab-manager.sh
```

---

## Service URLs

- **Dashboard**: https://test.evindrake.net (demo) or https://home.evindrake.net (prod)
- **Discord Bot**: https://bot.rig-city.com
- **Stream Bot**: https://stream.rig-city.com
- **Plex**: https://plex.evindrake.net
- **n8n**: https://n8n.evindrake.net
- **Home Assistant**: https://home.evindrake.net
- **VNC Desktop**: https://vnc.evindrake.net

---

## Support

If deployment fails:
1. Check logs: `docker logs homelab-dashboard`
2. Verify Docker running: `docker ps`
3. Check database: `docker exec -it postgres psql -U jarvis -d jarvis_dashboard`
4. Review .env file: `cat .env`

**This deployment will work. Follow the steps carefully.**
