# Enhanced VNC Desktop

Custom Ubuntu desktop environment with pre-installed applications and shortcuts for seamless homelab management.

## Features

### Pre-installed Applications

#### Web Browsers
- **Firefox** - Full-featured web browser
- **Chromium** - Open-source Chrome

#### Development Tools
- **Git** - Version control
- **Python 3** with pip - Python development
- **Node.js** with npm - JavaScript development
- **build-essential** - C/C++ compilation (gcc, g++, make)
- **tmux** - Terminal multiplexer for persistent sessions
- **Vim & Nano** - Text editors
- **Gedit** - GUI text editor
- **OpenSSH Client** - SSH remote access

#### Graphics & Media  
- **GIMP** - Advanced image editing
- **VLC** - Universal media player
- **OBS Studio** - Screen recording & streaming (software mode)
- **Audacity** - Audio editing & recording

#### Productivity & Office
- **LibreOffice Suite** - Writer, Calc, Impress, Draw
- **Evince** - PDF viewer
- **Mousepad** - Lightweight text editor
- **KeePassXC** - Password manager with KeePass compatibility

#### System Monitoring & Tools
- **htop** - Interactive process viewer
- **glances** - Advanced system monitor (CPU, RAM, network, disk)
- **gnome-system-monitor** - GUI system resource monitor
- **nmap** - Network discovery & security scanner
- **neofetch** - System information display
- **Thunar** - File manager
- **GNOME Terminal** - Full-featured terminal

#### Remote Access
- **Remmina** - Remote desktop client (RDP, VNC, SSH support)

#### Gaming (Optional - ~500MB)
- **Steam** - Game platform with 32-bit library support
  - ⚠️ **Note**: GPU acceleration NOT available in containers
  - Best for: Steam Link, lightweight/2D games
  - For GPU gaming: Use **game.evindrake.net** (Windows KVM + RTX 3060)
  - **Status**: Enabled by default (`INSTALL_STEAM=true` in Dockerfile)
  - **Verify after rebuild**: Check Applications menu or run `which steam` in terminal
  - **To disable**: Edit `services/vnc-desktop/Dockerfile` and set `INSTALL_STEAM=false`

### Desktop Environment
- **Window Manager**: LXDE/LXQt (lightweight and responsive)
- **Desktop Shortcuts**: 
  - Firefox Web Browser
  - Terminal
  - File Manager (Thunar)
  - Homelab Dashboard (direct link to host.evindrake.net)
  - Projects Folder (linked to host projects)
- **Panel**: Custom LXQt panel with quick launch bar

### Persistent Storage
- **vnc_home** volume: Stores user settings, desktop configurations, and installed apps
- **Selective Host Mounts**: 
  - `/home/evin/contain` → `~/host-projects` (read-only)
  - `/home/evin/Downloads` → `~/host-downloads` (read-write)

## Build & Deploy

### Build Custom Image
```bash
cd /home/evin/contain
docker compose -f docker-compose.unified.yml build vnc-desktop
```

### Deploy
```bash
./homelab-manager.sh
# Select: Deploy Options → Full Deployment
# Or: Service Control → Restart vnc-desktop
```

## First-Time Setup

When the container starts for the first time:
1. Bootstrap script runs automatically
2. Creates XDG user directories (Desktop, Documents, Downloads, etc.)
3. Provisions desktop shortcuts
4. Configures LXQt panel
5. Sets up file manager favorites
6. Creates `.desktop_provisioned` flag to prevent re-provisioning

## Access

### Web Browser (noVNC)
- **URL**: https://vnc.evindrake.net
- **Port**: 6080 (proxied via Caddy)
- **Authentication**: Enter VNC password when prompted (from `VNC_PASSWORD` in .env file)
- **Security**: HTTPS with automatic SSL via Caddy

### Native VNC Client (Optional)
Not exposed externally for security. Use noVNC web interface.

## Authentication

**Simple Single-Password Login:**
- When you visit https://vnc.evindrake.net, you'll see a VNC password prompt
- Enter the password from your `.env` file: `VNC_PASSWORD=your_password_here`
- That's it! No username required, just the VNC password.

**Note**: Previous versions had a two-layer authentication (HTTP auth + VNC password). This has been simplified to only require the VNC password.

## Security

- **VNC Password**: Set via `VNC_PASSWORD` environment variable in `.env` file
- **Network**: Internal Docker network only
- **Reverse Proxy**: Caddy handles HTTPS and SSL termination  
- **No Direct Exposure**: VNC ports not exposed to internet
- **Recommendation**: Use a strong VNC password and ensure Twingate VPN is active for additional security

## Installing Additional Apps

### Apps NOT Included (Manual Installation)
These require AppImage or .deb downloads due to repository issues:

#### Discord (AppImage)
```bash
cd ~/Downloads
wget "https://discord.com/api/download?platform=linux&format=tar.gz" -O discord.tar.gz
tar -xvzf discord.tar.gz
./Discord/Discord
```

#### VS Code (.deb)
```bash
cd ~/Downloads  
wget "https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64" -O vscode.deb
sudo dpkg -i vscode.deb
```

#### Spotify (Web Player Recommended)
Use https://open.spotify.com in Firefox for best experience.

## Customization

### Add More Applications
Edit `services/vnc-desktop/Dockerfile`:
```dockerfile
RUN apt-get update && apt-get install -y \
    your-package-here \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
```

### Disable Steam (Save ~500MB)
Edit `services/vnc-desktop/Dockerfile`, change:
```dockerfile
ENV INSTALL_STEAM=false
```

### Add Desktop Shortcuts
Edit `services/vnc-desktop/bootstrap.sh`:
```bash
cat > "${USER_HOME}/Desktop/YourApp.desktop" << 'EOF'
[Desktop Entry]
Name=Your Application
Exec=/path/to/your/app
Icon=app-icon
Type=Application
EOF
```

### Rebuild After Changes
```bash
docker compose -f docker-compose.unified.yml build vnc-desktop
docker compose -f docker-compose.unified.yml up -d vnc-desktop
```

## Troubleshooting

### Desktop Not Showing Apps
1. Check if bootstrap script ran: `docker logs vnc-desktop | grep "VNC Desktop Bootstrap"`
2. Verify volume persistence: `docker volume inspect vnc_home`
3. Remove provisioning flag to re-run: 
   ```bash
   docker exec vnc-desktop rm /home/evin/.desktop_provisioned
   docker restart vnc-desktop
   ```

### Permission Issues
1. Ensure UID/GID match: Set `USER_UID=1000` and `USER_GID=1000` in .env
2. Check volume ownership: `docker exec vnc-desktop ls -la /home/evin`

### Can't Access Web UI
1. Check container status: `docker ps | grep vnc-desktop`
2. View logs: `docker logs vnc-desktop`
3. Verify Caddy routing: `docker logs caddy`
4. Test health check: `docker exec vnc-desktop curl -f http://localhost:6080`

## Architecture

```
Internet → Caddy (HTTPS/443)
    ↓
vnc-desktop:80 (noVNC web interface)
    ↓
vnc-desktop:5900 (VNC server)
    ↓
X Server + LXDE Desktop
    ↓
User Applications
```

## Performance

- **RAM**: 2GB shared memory allocated
- **Resolution**: 1920x1080 (configurable via RESOLUTION env var)
- **Timezone**: America/New_York (configurable via TZ env var)

## Backup & Restore

### Backup VNC Home
```bash
docker run --rm -v vnc_home:/data -v $(pwd):/backup \
    ubuntu tar czf /backup/vnc_home_backup.tar.gz /data
```

### Restore VNC Home
```bash
docker run --rm -v vnc_home:/data -v $(pwd):/backup \
    ubuntu tar xzf /backup/vnc_home_backup.tar.gz -C /
```
