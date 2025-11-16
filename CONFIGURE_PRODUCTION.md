# Production Dashboard Configuration

## Architecture Overview

You now have **TWO completely separate dashboards**:

### 🏭 host.evindrake.net - PRODUCTION
- **Container**: `homelab-dashboard`
- **Purpose**: Your real homelab management platform
- **Access**: Private (secure credentials required)
- **Database**: `homelab_jarvis` (production data)
- **Redis**: DB 0 (production cache)
- **Docker**: Full read/write access
- **Features**: EVERYTHING works with real services

### 🎭 test.evindrake.net - DEMO
- **Container**: `homelab-dashboard-demo`  
- **Purpose**: Public investor demo site
- **Access**: Public (auto-login: demo/demo)
- **Database**: `homelab_jarvis_demo` (isolated demo data)
- **Redis**: DB 1 (demo cache)
- **Docker**: Read-only access (can't actually deploy)
- **Features**: Safe mock operations

---

## Step 1: Configure Production Environment

Edit `/home/evin/contain/HomeLabHub/.env`:

```bash
# Production Dashboard (host.evindrake.net)
WEB_USERNAME=your_secure_username
WEB_PASSWORD=your_secure_password
DEMO_MODE=false

# Real Service Connections
HOME_ASSISTANT_URL=http://192.168.1.x:8123
HOME_ASSISTANT_TOKEN=your_long_lived_access_token

# Optional: Connect to real Ollama
OLLAMA_HOST=http://localhost:11434
```

---

## Step 2: Install Real Services (Optional)

### Ollama (Local AI)
```bash
# Install Ollama
curl https://ollama.ai/install.sh | sh

# Download AI models
ollama pull llama2
ollama pull mistral
ollama pull codellama

# Verify running
curl http://localhost:11434/api/tags
```

### Home Assistant Token
```bash
# 1. Access Home Assistant
firefox https://home.evindrake.net

# 2. Get token:
#    - Click your profile (bottom left)
#    - Scroll to "Long-Lived Access Tokens"
#    - Click "Create Token"
#    - Name: "Homelab Dashboard"
#    - Copy the token

# 3. Add to .env:
HOME_ASSISTANT_TOKEN=your_copied_token_here
```

---

## Step 3: Set Up DNS

Both domains need A records pointing to your public IP:

```bash
# Get your public IP
curl ifconfig.me

# Add DNS records (ZoneEdit or your DNS provider):
# Type: A, Name: host, Value: <your IP>, TTL: 300
# Type: A, Name: test, Value: <your IP>, TTL: 300
```

---

## Step 4: Deploy Both Dashboards

```bash
cd /home/evin/contain/HomeLabHub

# Option 1: Use automated script
bash DEPLOY_TWO_DASHBOARDS.sh

# Option 2: Manual deployment
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard-demo
docker-compose -f docker-compose.unified.yml up -d caddy
```

---

## Step 5: Verify Everything Works

### Production Dashboard
```bash
# Test locally
curl http://localhost:5000/login

# Should NOT show auto-login credentials
# Should require your secure username/password

# Access via browser
firefox https://host.evindrake.net
# Login with your secure credentials
```

### Demo Dashboard  
```bash
# Test demo container
docker exec homelab-dashboard-demo curl http://localhost:5000/login

# Should show: "Default: demo / demo"

# Access via browser
firefox https://test.evindrake.net
# Login with: demo / demo
```

---

## What Works on Each Site

### ✅ Production (host.evindrake.net)

**Real Operations:**
- ✅ Deploy actual Docker containers
- ✅ Manage real services  
- ✅ Execute code on your server
- ✅ Real AI chat (if Ollama installed)
- ✅ Real smart home control (if Home Assistant configured)
- ✅ Real system monitoring
- ✅ Real database operations

**Full Power Features:**
- Container Marketplace → Actually deploys containers
- Code Generator → Executes generated code
- Jarvis Actions → Performs real operations
- Service Management → Controls real services

### 🎭 Demo (test.evindrake.net)

**Safe Mock Operations:**
- ✅ Same beautiful UI
- ✅ Simulated deployments (doesn't touch production)
- ✅ Mock AI responses
- ✅ Mock smart home data
- ✅ Read-only monitoring
- ✅ Safe to share publicly

**Investor-Friendly Features:**
- Shows what it CAN do
- Doesn't expose your infrastructure
- Can't accidentally break anything
- Auto-login for easy demos

---

## Security Best Practices

### Production Dashboard
```bash
# Use strong credentials
WEB_USERNAME=admin_$(openssl rand -hex 4)
WEB_PASSWORD=$(openssl rand -base64 24)

# Enable audit logging
ENABLE_AUDIT_LOG=true

# Restrict access by IP (optional)
# Add to Caddyfile:
# @blocked not remote_ip 192.168.1.0/24
# handle @blocked {
#     abort
# }
```

### Demo Dashboard
- Already configured safely
- Read-only Docker access
- Isolated database
- Public but harmless
- Rate limiting enabled

---

## Troubleshooting

### Production won't start
```bash
# Check credentials are set
grep WEB_ .env

# Check database exists
docker exec discord-bot-db psql -U jarvis -l | grep homelab_jarvis

# View logs
docker logs homelab-dashboard --tail 50
```

### Demo shows "Service Unavailable"  
```bash
# This is normal! Demo mode shows mock data
# Features appear to work but don't touch production

# If demo actually broken:
docker logs homelab-dashboard-demo --tail 50
```

### Can't access test.evindrake.net
```bash
# Check DNS propagation
nslookup test.evindrake.net

# Check Caddy is running
docker ps | grep caddy

# Reload Caddy config
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

---

## Next Steps

1. ✅ Deploy both dashboards
2. ✅ Configure production credentials
3. ✅ Test both sites work
4. ✅ Install real services (Ollama, etc.)
5. ✅ Start using your production dashboard!
6. ✅ Show demo site to investors

**Production is for YOU. Demo is for THEM. Both are REAL platforms.**
