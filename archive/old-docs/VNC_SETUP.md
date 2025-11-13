# VNC Remote Desktop Setup

This guide shows how to set up VNC access to your Ubuntu desktop through the Homelab Dashboard.

## What is VNC?

VNC (Virtual Network Computing) lets you access your Ubuntu desktop remotely through a web browser. This is useful for:
- Managing GUI applications remotely
- Accessing your desktop when away from home
- Running graphical tools through the dashboard

## Quick Setup (noVNC on Ubuntu)

### Option 1: TigerVNC + noVNC (Recommended)

```bash
# Install VNC server and noVNC
sudo apt update
sudo apt install tigervnc-standalone-server novnc websockify python3-numpy

# Set VNC password
vncpasswd
# Enter password when prompted
# Skip view-only password

# Start VNC server on display :1
vncserver :1 -geometry 1920x1080 -depth 24

# Start noVNC websocket proxy
/usr/share/novnc/utils/novnc_proxy --vnc localhost:5901 --listen 6080
```

Now VNC is accessible at: `http://localhost:6080/vnc.html`

### Option 2: System Service (Auto-Start)

Create a systemd service to start VNC automatically:

```bash
# Create VNC service
sudo nano /etc/systemd/system/vncserver@.service
```

Add this content:

```ini
[Unit]
Description=TigerVNC Server
After=syslog.target network.target

[Service]
Type=forking
User=evin
ExecStartPre=/bin/sh -c '/usr/bin/vncserver -kill :%i > /dev/null 2>&1 || :'
ExecStart=/usr/bin/vncserver :%i -geometry 1920x1080 -depth 24 -localhost no
ExecStop=/usr/bin/vncserver -kill :%i

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
# Enable VNC server on display :1
sudo systemctl daemon-reload
sudo systemctl enable vncserver@1.service
sudo systemctl start vncserver@1.service

# Check status
sudo systemctl status vncserver@1.service
```

### Option 3: Docker Container (Isolated)

Run VNC in a Docker container:

```bash
docker run -d \
  --name vnc-desktop \
  --restart unless-stopped \
  -p 6080:6080 \
  -p 5901:5901 \
  -e VNC_RESOLUTION=1920x1080 \
  -e VNC_PASSWORD=yourpassword \
  dorowu/ubuntu-desktop-lxde-vnc
```

## Configure in Dashboard

After VNC is running, update your `.env` file:

```bash
cd /home/evin/contain/HomeLabHub
nano .env
```

Set the VNC URL:

```bash
# If running locally
NOVNC_URL=http://localhost:6080/vnc.html

# If accessible via domain (requires reverse proxy)
NOVNC_URL=https://vnc.evindrake.net
```

Restart dashboard:

```bash
docker compose -f docker-compose.unified.yml restart homelab-dashboard
```

## Access VNC Through Dashboard

1. Go to: https://host.evindrake.net
2. Log in with your API key
3. Click "Remote Desktop" in navigation
4. VNC window will open in iframe

## Security Notes

### Local Network Only (Default)

VNC is **not encrypted by default**. If using `localhost:6080`, it's only accessible from the same machine. This is secure for:
- Accessing through SSH tunnel
- Behind Twingate VPN
- Local network only

### Public Access (Use HTTPS)

If exposing VNC publicly, **always use a reverse proxy with SSL**:

#### Option A: Add to Traefik (Unified Stack)

Edit `docker-compose.unified.yml` and add a VNC service:

```yaml
  vnc-desktop:
    image: dorowu/ubuntu-desktop-lxde-vnc
    container_name: vnc-desktop
    restart: unless-stopped
    networks:
      - homelab
    environment:
      - VNC_RESOLUTION=1920x1080
      - VNC_PASSWORD=${VNC_PASSWORD}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.vnc.rule=Host(`vnc.evindrake.net`)"
      - "traefik.http.routers.vnc.entrypoints=websecure"
      - "traefik.http.routers.vnc.tls.certresolver=letsencrypt"
      - "traefik.http.services.vnc.loadbalancer.server.port=6080"
```

Then update `.env`:

```bash
NOVNC_URL=https://vnc.evindrake.net
VNC_PASSWORD=your-secure-password
```

#### Option B: SSH Tunnel (Most Secure)

Instead of exposing VNC, access via SSH tunnel:

```bash
# From your remote machine
ssh -L 6080:localhost:6080 evin@your-server-ip

# Then access in browser
http://localhost:6080/vnc.html
```

Update dashboard:
```bash
NOVNC_URL=http://localhost:6080/vnc.html
```

## Troubleshooting

### VNC Server Won't Start

```bash
# Kill existing VNC sessions
vncserver -kill :1

# Check if port is in use
sudo ss -tlnp | grep 5901

# Restart VNC
vncserver :1 -geometry 1920x1080 -depth 24
```

### noVNC Shows Black Screen

```bash
# Check VNC is running
ps aux | grep vnc

# Test VNC connection
vncviewer localhost:5901
```

### Can't Access from Dashboard

```bash
# Check noVNC is running
ps aux | grep novnc

# Check port 6080 is listening
sudo ss -tlnp | grep 6080

# Restart noVNC
/usr/share/novnc/utils/novnc_proxy --vnc localhost:5901 --listen 6080
```

## Alternative: X11VNC (Share Current Display)

To share your **existing desktop** (not a separate session):

```bash
# Install x11vnc
sudo apt install x11vnc

# Set password
x11vnc -storepasswd

# Start x11vnc
x11vnc -auth guess -forever -loop -noxdamage -repeat -rfbauth ~/.vnc/passwd -rfbport 5901 -shared

# Start noVNC
/usr/share/novnc/utils/novnc_proxy --vnc localhost:5901 --listen 6080
```

This shares your **actual desktop** instead of creating a new session.

## Performance Tips

1. **Lower resolution for slower connections:**
   ```bash
   vncserver :1 -geometry 1280x720 -depth 16
   ```

2. **Disable desktop effects:**
   - Use lightweight desktop environment (LXDE, XFCE)
   - Disable compositor and animations

3. **Compression:**
   noVNC automatically compresses, but you can adjust quality in the VNC client settings

## Summary

- ✅ Install TigerVNC + noVNC
- ✅ Set VNC password with `vncpasswd`
- ✅ Start VNC server: `vncserver :1`
- ✅ Start noVNC: `/usr/share/novnc/utils/novnc_proxy --vnc localhost:5901 --listen 6080`
- ✅ Update `.env`: `NOVNC_URL=http://localhost:6080/vnc.html`
- ✅ Restart dashboard
- ✅ Access via Remote Desktop page

For public access, use Traefik or SSH tunnel for security! 🔒
