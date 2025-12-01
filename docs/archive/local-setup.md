# Local Ubuntu Host Setup

Configure your local Ubuntu machine (gaming/streaming PC) to run Plex, Home Assistant, MinIO, and VNC.

## Architecture

```
Local Ubuntu Host (Gaming PC)
├── Plex Media Server     → Streams via plex.evindrake.net
├── Home Assistant        → Smart home via home.evindrake.net  
├── MinIO Object Storage  → Local S3-compatible storage
├── VNC Desktop           → Remote access via vnc.evindrake.net
└── NAS Mount             → Access network storage
         │
         └──► Tailscale ──► Linode Cloud (Caddy reverse proxy)
```

## Prerequisites

- [ ] Ubuntu 22.04 LTS or newer
- [ ] Docker and Docker Compose installed
- [ ] Linode server already deployed
- [ ] Tailscale auth key or browser access

## Step 1: Install Docker

```bash
# Install Docker using official script
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker --version
docker compose version
```

## Step 2: Install Tailscale

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh

# Authenticate (choose one method)

# Method A: Interactive (if you have browser access)
sudo tailscale up

# Method B: Auth key (headless servers)
sudo tailscale up --authkey=tskey-auth-xxxxx

# Verify connection
tailscale status
```

**Important**: Note your Tailscale IP (100.x.x.x) for cloud configuration.

### Optional: Set Hostname
```bash
sudo tailscale up --hostname=homelab-local
```

## Step 3: Clone Repository

```bash
# Create project directory
mkdir -p ~/contain
cd ~/contain

# Clone HomeLabHub
git clone https://github.com/ScarletRedJoker/HomeLabHub.git
cd HomeLabHub
```

## Step 4: Run Local Bootstrap

```bash
# Make executable and run
chmod +x deploy/scripts/bootstrap-local.sh
./deploy/scripts/bootstrap-local.sh
```

### What the Script Does
1. ✓ Verifies Docker installation
2. ✓ Checks Tailscale connection
3. ✓ Creates local directory structure
4. ✓ Copies local configuration
5. ✓ Sets up VNC tools
6. ✓ Creates systemd service for auto-start

## Step 5: Configure Environment

```bash
# Navigate to local deployment directory
cd ~/contain/HomeLabLocal

# Create .env from template
cp .env.template .env

# Edit with your credentials
nano .env
```

### Required Variables

```bash
# MinIO Object Storage
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=your_secure_minio_password

# Plex Media Server
PLEX_CLAIM=claim-xxxxxx  # Get from plex.tv/claim
PLEX_TOKEN=your_plex_token

# Home Assistant (optional)
HOME_ASSISTANT_TOKEN=your_ha_token

# NAS Storage (if using)
NAS_IP=192.168.1.100
NAS_USER=admin
NAS_PASSWORD=your_nas_password
```

## Step 6: Mount NAS Storage (Optional)

If you have network storage for media:

```bash
# Install CIFS utilities
sudo apt install -y cifs-utils avahi-utils

# Set NAS credentials in environment
export NAS_IP=192.168.1.100
export NAS_USER=admin
export NAS_PASSWORD=your_password

# Run mount script
sudo ./scripts/mount-nas.sh automount
```

### Verify Mount
```bash
# Check mount status
./scripts/mount-nas.sh status

# List mounted content
ls -la /mnt/nas/
```

### Manual Mount (if script fails)
```bash
# Create mount point
sudo mkdir -p /mnt/nas/nfs

# Create credentials file
sudo tee /root/.nas-credentials << EOF
username=admin
password=your_password
EOF
sudo chmod 600 /root/.nas-credentials

# Mount share
sudo mount -t cifs //192.168.1.100/nfs /mnt/nas/nfs \
  -o credentials=/root/.nas-credentials,uid=1000,gid=1000,vers=3.0
```

## Step 7: Start Local Services

```bash
# Start all local services
cd ~/contain/HomeLabLocal
docker compose -f compose.local.yml up -d

# Or from the main repo directory
cd ~/contain/HomeLabHub
docker compose -f compose.local.yml up -d
```

### Verify Services
```bash
# Check running containers
docker compose -f compose.local.yml ps

# Expected output:
# homelab-minio      running (0.0.0.0:9000->9000, 0.0.0.0:9001->9001)
# plex-server        running (network mode: host)
# homeassistant      running (network mode: host)
```

## Step 8: Configure Plex

### Initial Setup
1. Open http://localhost:32400/web
2. Sign in with your Plex account
3. Name your server (e.g., "HomeLabHub Plex")

### Add Libraries
1. Go to **Settings** → **Libraries** → **Add Library**
2. Configure paths:

| Library Type | Path in Container |
|--------------|------------------|
| Movies | /nas/video/Movies or /media/Movies |
| TV Shows | /nas/video/TV or /media/TV |
| Music | /nas/music or /media/Music |

### Enable Remote Access
1. Go to **Settings** → **Remote Access**
2. Manually specify public port: 32400
3. External URL will be: https://plex.evindrake.net

## Step 9: Configure Home Assistant

### Initial Setup
1. Open http://localhost:8123
2. Create admin account
3. Complete onboarding wizard

### Generate Long-Lived Token
1. Click your profile (bottom left)
2. Scroll to **Long-Lived Access Tokens**
3. Create token named "HomeLabHub Dashboard"
4. Copy token and add to `.env`:
   ```bash
   HOME_ASSISTANT_TOKEN=eyJ0eXA...
   ```

### Configure External Access
Edit `/config/homeassistant/configuration.yaml`:
```yaml
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - 172.17.0.0/16  # Docker network
    - 100.64.0.0/10  # Tailscale network
```

Restart Home Assistant:
```bash
docker restart homeassistant
```

## Step 10: Set Up VNC Desktop

### Configure VNC Password
```bash
# Set VNC password
vncpasswd
# Enter password twice

# Start VNC server
vncserver :1 -geometry 1920x1080 -depth 24

# Start noVNC web client
websockify --web=/opt/novnc 6080 localhost:5901 &
```

### Test VNC Access
- Local: http://localhost:6080
- Remote: https://vnc.evindrake.net (after DNS configured)

### Auto-Start VNC
```bash
# Create systemd service
sudo tee /etc/systemd/system/vncserver.service << EOF
[Unit]
Description=VNC Server
After=network.target

[Service]
Type=forking
User=$USER
ExecStartPre=/usr/bin/vncserver -kill :1 || true
ExecStart=/usr/bin/vncserver :1 -geometry 1920x1080 -depth 24
ExecStop=/usr/bin/vncserver -kill :1

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable vncserver
sudo systemctl start vncserver
```

## Step 11: Enable Auto-Start

```bash
# Enable local homelab service
sudo systemctl enable homelab-local

# Start service
sudo systemctl start homelab-local

# Check status
sudo systemctl status homelab-local
```

## Step 12: Update Linode Configuration

On your Linode server, update the environment with your local Tailscale IP:

```bash
# On Linode server
cd /opt/homelab/HomeLabHub
nano .env

# Add/update:
LOCAL_TAILSCALE_IP=100.x.x.x  # Your local host Tailscale IP
PLEX_URL=http://100.x.x.x:32400
HOME_ASSISTANT_URL=http://100.x.x.x:8123

# Restart services to pick up changes
./homelab restart
```

## Verify Complete Setup

### Check Connectivity
```bash
# From Linode, ping local host via Tailscale
ping 100.x.x.x

# From local host, verify services
curl http://localhost:32400/identity  # Plex
curl http://localhost:8123            # Home Assistant
curl http://localhost:9000/minio/health/live  # MinIO
```

### Test External Access
After DNS propagation:
- https://plex.evindrake.net
- https://home.evindrake.net
- https://vnc.evindrake.net

## Service Summary

| Service | Local Port | Access Via |
|---------|------------|------------|
| Plex | 32400 | plex.evindrake.net |
| Home Assistant | 8123 | home.evindrake.net |
| MinIO API | 9000 | Internal only |
| MinIO Console | 9001 | Internal only |
| VNC | 5901 | vnc.evindrake.net |
| noVNC | 6080 | vnc.evindrake.net |

## Troubleshooting

### NAS Mount Issues
```bash
# Check if CIFS is available
modprobe cifs

# Test connectivity
ping 192.168.1.100

# Try mounting manually with verbose output
sudo mount -t cifs //192.168.1.100/nfs /mnt/nas/nfs -v \
  -o user=admin,pass=password,vers=3.0
```

### Plex Not Accessible
```bash
# Check if Plex is running
docker logs plex-server

# Verify network mode
docker inspect plex-server | grep NetworkMode

# Check port binding
ss -tlnp | grep 32400
```

### Tailscale Connection Issues
```bash
# Check Tailscale status
tailscale status

# Restart Tailscale
sudo systemctl restart tailscaled

# Re-authenticate
sudo tailscale up
```

## Next Steps

1. [Configure secrets](secrets.md) for secure credential sharing
2. [Set up email](email.md) for dashboard notifications
3. [Troubleshooting guide](troubleshooting.md) for common issues
