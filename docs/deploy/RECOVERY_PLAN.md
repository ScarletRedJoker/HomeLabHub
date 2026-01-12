# Emergency Recovery & Deployment Plan

This is a linear, step-by-step guide to restore your split-architecture homelab deployment.

---

## Current Status

| Component | Location | Status |
|-----------|----------|--------|
| Dashboard | Linode | DOWN - .env missing |
| Discord Bot | Linode | DOWN - .env missing |
| Stream Bot | Linode | DOWN - .env missing |
| PostgreSQL | Linode | DOWN - .env missing |
| Plex | Local Ubuntu | WORKING |
| Home Assistant | Local Ubuntu | NEEDS VERIFICATION |
| MinIO | Local Ubuntu | WORKING |
| Vibeshine | Windows VM | BLOCKED - RDP interference |

---

## PHASE 1: Restore Linode Cloud Services

### Step 1.1: SSH to Linode
```bash
ssh root@YOUR_LINODE_IP
cd /opt/homelab/HomeLabHub
```

### Step 1.2: Create .env from template
```bash
# Copy the template
cp .env.example .env
chmod 600 .env
```

### Step 1.3: Edit .env with your credentials
```bash
nano .env
```

**REQUIRED VALUES TO SET:**
```ini
# Core Database (generate with: openssl rand -base64 24)
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD
DISCORD_DB_PASSWORD=YOUR_SECURE_PASSWORD
STREAMBOT_DB_PASSWORD=YOUR_SECURE_PASSWORD
JARVIS_DB_PASSWORD=YOUR_SECURE_PASSWORD

# Dashboard Login
WEB_USERNAME=admin
WEB_PASSWORD=YOUR_SECURE_PASSWORD

# Discord Bot (from https://discord.com/developers/applications)
DISCORD_BOT_TOKEN=YOUR_DISCORD_TOKEN
DISCORD_CLIENT_ID=YOUR_CLIENT_ID
DISCORD_CLIENT_SECRET=YOUR_CLIENT_SECRET

# AI (from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-proj-YOUR_KEY

# Multi-host routing (your local Ubuntu Tailscale IP)
LOCAL_TAILSCALE_IP=100.x.x.x  # Run `tailscale ip -4` on local Ubuntu to get this
```

### Step 1.4: Run bootstrap script
```bash
./deploy/scripts/bootstrap.sh --role cloud --merge-env
```

This will:
- Verify Docker is running
- Check Tailscale connectivity
- Generate any missing secrets
- Create required directories
- Build and start all containers

### Step 1.5: Verify services are running
```bash
# Check container status
docker compose ps

# Expected output - all should be "healthy" or "running":
# - caddy
# - homelab-postgres
# - homelab-redis
# - homelab-dashboard
# - discord-bot
# - stream-bot
# - n8n
# - code-server
```

### Step 1.6: Test endpoints
```bash
# Test dashboard health
curl -f http://localhost:5000/health

# Check Caddy logs for SSL status
docker logs caddy --tail 50
```

### Step 1.7: Verify SSL certificates
Wait 1-2 minutes for Let's Encrypt to issue certificates, then test:
```bash
curl -I https://host.evindrake.net
curl -I https://bot.evindrake.net
curl -I https://stream.evindrake.net
```

**If SSL fails**, check:
1. DNS A records point to Linode IP
2. Ports 80 and 443 are open in firewall
3. Restart Caddy: `docker restart caddy`

---

## PHASE 2: Set Up WireGuard Site-to-Site Tunnel

This replaces Tailscale as your primary networking solution.

### Step 2.1: Install WireGuard on Linode
```bash
apt update && apt install -y wireguard
```

### Step 2.2: Generate Linode keys
```bash
wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
chmod 600 /etc/wireguard/privatekey
cat /etc/wireguard/publickey  # Save this - you'll need it for local host
```

### Step 2.3: Create Linode WireGuard config
```bash
cat > /etc/wireguard/wg0.conf << 'EOF'
[Interface]
Address = 10.200.200.1/24
ListenPort = 51820
PrivateKey = <LINODE_PRIVATE_KEY>
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Local Ubuntu Host
PublicKey = <LOCAL_HOST_PUBLIC_KEY>
AllowedIPs = 10.200.200.2/32, 192.168.122.0/24
EOF
```

### Step 2.4: Install WireGuard on Local Ubuntu
```bash
sudo apt update && sudo apt install -y wireguard
```

### Step 2.5: Generate Local keys
```bash
wg genkey | sudo tee /etc/wireguard/privatekey | wg pubkey | sudo tee /etc/wireguard/publickey
sudo chmod 600 /etc/wireguard/privatekey
cat /etc/wireguard/publickey  # Add this to Linode config
```

### Step 2.6: Create Local WireGuard config
```bash
sudo cat > /etc/wireguard/wg0.conf << 'EOF'
[Interface]
Address = 10.200.200.2/24
PrivateKey = <LOCAL_PRIVATE_KEY>

[Peer]
# Linode Cloud
PublicKey = <LINODE_PUBLIC_KEY>
Endpoint = YOUR_LINODE_IP:51820
AllowedIPs = 10.200.200.1/32
PersistentKeepalive = 25
EOF
```

### Step 2.7: Start WireGuard on both hosts
```bash
# On Linode
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0

# On Local Ubuntu
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```

### Step 2.8: Test connectivity
```bash
# From Linode
ping 10.200.200.2

# From Local Ubuntu
ping 10.200.200.1
```

### Step 2.9: Update Caddyfile to use WireGuard IPs
Update `.env` on Linode:
```ini
LOCAL_TAILSCALE_IP=10.200.200.2
```

Then restart Caddy:
```bash
docker restart caddy
```

---

## PHASE 3: Fix Vibeshine GameStream (Windows VM)

The issue: RDP creates a synthetic display that prevents virtual displays from being used.

### Step 3.1: Access Windows VM via libvirt console (NOT RDP)
```bash
# On local Ubuntu host
virt-manager &
# Connect to your Windows VM via the console view
```

Or use Spice/VNC directly if configured.

### Step 3.2: Disconnect RDP session properly
In an elevated PowerShell on the Windows VM:
```powershell
# Check current sessions
query session

# Move your RDP session to console (replace 1 with your session ID)
tscon 1 /dest:console
```

**Note:** This will disconnect your RDP immediately. That's expected.

### Step 3.3: Verify virtual display appears
With RDP disconnected, in the Windows console session:
```powershell
& "C:\Program Files\Sunshine\tools\dxgi-info.exe"
```

You should now see a second display (DISPLAY2) attached to the NVIDIA GPU.

### Step 3.4: Set virtual display as primary
1. Right-click desktop → Display Settings
2. Select the VDD display (should be "VDD by MTT")
3. Check "Make this my main display"
4. Click Apply

### Step 3.5: Configure Sunshine for virtual display
1. Open Sunshine config: `C:\Program Files\Sunshine\config\sunshine.conf`
2. Set:
```ini
capture = ddx
output_name = 1  # or whichever display number is the VDD
adapter_name = NVIDIA GeForce RTX 3060
```

3. Restart Sunshine

### Step 3.6: Create startup script (optional)
To automate this on boot, create a PowerShell script:
```powershell
# C:\Scripts\enable-gamestream.ps1
# Disconnect any RDP and enable virtual display

# Wait for system to stabilize
Start-Sleep -Seconds 30

# Force VDD to be primary
DisplaySwitch.exe /internal

# Restart Sunshine
Stop-Service -Name "Sunshine" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Service -Name "Sunshine"
```

Schedule this to run at startup via Task Scheduler.

---

## PHASE 4: Verify All Services

### Dashboard (host.evindrake.net)
- [ ] Can login with admin credentials
- [ ] Docker status shows all containers
- [ ] Jarvis AI responds

### Discord Bot (bot.evindrake.net)
- [ ] Can login with Discord OAuth
- [ ] No CSP errors in browser console
- [ ] Channels load properly
- [ ] WebSocket stable

### Stream Bot (stream.evindrake.net)
- [ ] Onboarding flow works
- [ ] Twitch connection works
- [ ] Spotify integration works

### Plex (plex.evindrake.net)
- [ ] Can access media library
- [ ] Streaming works

### Home Assistant (home.evindrake.net)
- [ ] Dashboard loads
- [ ] Devices show up

### GameStream (gamestream.evindrake.net)
- [ ] Sunshine web UI accessible
- [ ] Can pair with Moonlight client
- [ ] Games stream successfully

---

## Troubleshooting

### Linode services won't start
```bash
# Check Docker logs
docker compose logs -f

# Reset and rebuild
docker compose down
docker compose build --no-cache
docker compose up -d
```

### SSL certificates failing
```bash
# Check Caddy logs
docker logs caddy

# Force certificate renewal
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

### WireGuard not connecting
```bash
# Check status
sudo wg show

# Check for errors
sudo journalctl -u wg-quick@wg0
```

### Vibeshine still only shows DISPLAY1
1. Ensure you're accessing via console, NOT RDP
2. Try disabling and re-enabling VDD in Device Manager
3. Check Windows Event Viewer for display driver errors

---

## Security Notes

**IMPORTANT:** The database password was exposed in chat. After recovery:
1. Rotate POSTGRES_PASSWORD and all DB passwords
2. Regenerate SERVICE_AUTH_TOKEN
3. Update .env on both Linode and local host
4. Restart all services: `docker compose down && docker compose up -d`
