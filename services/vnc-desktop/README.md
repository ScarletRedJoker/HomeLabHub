# NoVNC X11 Viewer for Windows WinApps/XRDP

X11 VNC Desktop configured as a **client viewer** that connects to a Windows KVM XRDP server, accessible through a web browser via NoVNC.

## Architecture

```
Browser (HTTPS) → NoVNC Web Interface (Port 6080)
                     ↓
                  VNC Server (X11)
                     ↓
                  FreeRDP Client
                     ↓
          Windows XRDP Server (WinApps/KVM)
```

**Key Concept**: This container does NOT run its own desktop. Instead, it acts as an X11 client that displays a Windows desktop from your XRDP server, making it accessible through any web browser via NoVNC.

## Features

### Core Functionality
- **FreeRDP Client**: Latest FreeRDP2 with X11 support
- **Auto-Connect**: Automatically connects to Windows XRDP on startup
- **Fullscreen Mode**: RDP session fills entire NoVNC viewport
- **Auto-Reconnection**: Infinite retry with configurable delay
- **Dynamic Resolution**: Adapts to browser window size changes
- **Clipboard Sharing**: Copy/paste between browser and Windows

### Security
- **HTTPS Access**: Secured via Caddy reverse proxy
- **VNC Password**: Protected VNC server
- **Certificate Bypass**: Auto-accepts RDP certificates (internal network)
- **Environment Variables**: Credentials stored in Docker secrets

### Performance
- **Smart Sizing**: Automatically scales RDP session to fit viewport
- **Compression**: Enabled for lower bandwidth usage
- **AVC444 Graphics**: Hardware-accelerated video codec (if supported)
- **Network Auto-Detection**: Adapts to connection quality

## Environment Variables

### Required Variables
```bash
WINDOWS_RDP_HOST=192.168.1.100    # Windows XRDP server IP or hostname
WINDOWS_RDP_USER=administrator     # Windows username
WINDOWS_RDP_PASSWORD=your_password # Windows password (optional, can prompt)
```

### Optional Variables
```bash
WINDOWS_RDP_PORT=3389             # RDP port (default: 3389)
WINDOWS_RDP_DOMAIN=""             # Windows domain (if domain-joined)
RDP_RECONNECT_DELAY=5             # Seconds to wait before reconnect (default: 5)
RDP_MAX_RETRIES=0                 # Max reconnect attempts, 0 = infinite (default: 0)
```

### VNC Server Variables (inherited from base image)
```bash
VNC_PASSWORD=your_vnc_password    # VNC server password
VNC_USER=evin                     # VNC user (default: evin)
USER_UID=1000                     # User UID (default: 1000)
USER_GID=1000                     # User GID (default: 1000)
RESOLUTION=1920x1080              # Desktop resolution (default: 1920x1080)
```

## Quick Start

### 1. Configure Environment Variables

Edit your `.env` file or Docker Compose:
```bash
# Windows XRDP Connection
WINDOWS_RDP_HOST=192.168.1.100
WINDOWS_RDP_USER=administrator
WINDOWS_RDP_PASSWORD=MySecurePassword123
WINDOWS_RDP_PORT=3389

# VNC Server (for NoVNC access)
VNC_PASSWORD=vnc_password_here
```

### 2. Deploy Container

```bash
cd /home/evin/contain
docker compose -f docker-compose.unified.yml build vnc-desktop
docker compose -f docker-compose.unified.yml up -d vnc-desktop
```

### 3. Access via Browser

Navigate to: **https://vnc.evindrake.net**

The RDP connection will launch automatically and display your Windows desktop.

## Docker Compose Configuration

Add to your `docker-compose.unified.yml`:

```yaml
vnc-desktop:
  build:
    context: ./services/vnc-desktop
    dockerfile: Dockerfile
  container_name: vnc-desktop
  hostname: vnc-desktop
  restart: unless-stopped
  environment:
    # VNC Server Settings
    - VNC_PASSWORD=${VNC_PASSWORD}
    - VNC_USER=evin
    - USER_UID=1000
    - USER_GID=1000
    - RESOLUTION=1920x1080
    
    # Windows XRDP Connection
    - WINDOWS_RDP_HOST=${WINDOWS_RDP_HOST}
    - WINDOWS_RDP_PORT=${WINDOWS_RDP_PORT:-3389}
    - WINDOWS_RDP_USER=${WINDOWS_RDP_USER}
    - WINDOWS_RDP_PASSWORD=${WINDOWS_RDP_PASSWORD}
    - WINDOWS_RDP_DOMAIN=${WINDOWS_RDP_DOMAIN:-}
    
    # Reconnection Settings
    - RDP_RECONNECT_DELAY=${RDP_RECONNECT_DELAY:-5}
    - RDP_MAX_RETRIES=${RDP_MAX_RETRIES:-0}
  ports:
    - "6080:80"  # NoVNC web interface (proxied by Caddy)
  volumes:
    - vnc_home:/home/evin
  shm_size: 2gb
  networks:
    - homelab
```

## Connection Modes

### Standard Connection (No Domain)
```bash
WINDOWS_RDP_HOST=192.168.1.100
WINDOWS_RDP_USER=LocalAdmin
WINDOWS_RDP_PASSWORD=password123
```

### Domain-Joined Windows
```bash
WINDOWS_RDP_HOST=192.168.1.100
WINDOWS_RDP_USER=john.doe
WINDOWS_RDP_PASSWORD=password123
WINDOWS_RDP_DOMAIN=CORP
```

### Password Prompt (More Secure)
```bash
WINDOWS_RDP_HOST=192.168.1.100
WINDOWS_RDP_USER=administrator
# Leave WINDOWS_RDP_PASSWORD empty - FreeRDP will prompt
```

## Advanced Configuration

### FreeRDP Command Options

The launcher script (`/usr/local/bin/rdp-launcher.sh`) builds this command:

```bash
xfreerdp \
  /v:192.168.1.100:3389 \           # Server and port
  /u:administrator \                 # Username
  /p:password \                      # Password (if set)
  /d:DOMAIN \                        # Domain (if set)
  /f \                               # Fullscreen
  /smart-sizing \                    # Scale to fit window
  /dynamic-resolution \              # Adjust on window resize
  /gfx:AVC444 \                      # Video codec
  /network:auto \                    # Auto-detect connection type
  /compression \                     # Enable compression
  /cert:ignore \                     # Ignore certificate warnings
  /timeout:60000 \                   # Connection timeout (60s)
  +clipboard \                       # Enable clipboard sharing
  /audio-mode:0                      # Redirect audio to client
```

### Custom FreeRDP Options

To add custom options, modify `/usr/local/bin/rdp-launcher.sh` in the Dockerfile:

```dockerfile
RDP_CMD="$RDP_CMD /drive:share,/path/to/share"  # Mount local drive
RDP_CMD="$RDP_CMD /usb:id,dev:054c:0268"        # USB passthrough
RDP_CMD="$RDP_CMD /multimon"                     # Multi-monitor
```

## Troubleshooting

### Connection Issues

#### RDP Not Connecting
1. Check container logs:
   ```bash
   docker logs vnc-desktop
   ```

2. Verify environment variables:
   ```bash
   docker exec vnc-desktop env | grep WINDOWS_RDP
   ```

3. Test network connectivity:
   ```bash
   docker exec vnc-desktop ping -c 3 $WINDOWS_RDP_HOST
   docker exec vnc-desktop nc -zv $WINDOWS_RDP_HOST 3389
   ```

#### Black Screen in NoVNC
- **Cause**: RDP client not launched or crashed
- **Fix**: Check logs for FreeRDP errors
  ```bash
  docker logs vnc-desktop | grep -i freerdp
  ```

#### "Connection Failed" Message
- **Cause**: Invalid credentials or XRDP server not running
- **Fix**: 
  1. Verify Windows XRDP server is running
  2. Test credentials from another RDP client
  3. Check Windows firewall allows port 3389

#### Authentication Failures
- **Cause**: Incorrect username/password or domain
- **Fix**:
  1. Verify credentials in `.env` file
  2. For domain users, ensure domain is set correctly
  3. Check Windows event logs for authentication failures

### Reconnection Issues

#### Client Keeps Disconnecting
- **Cause**: Network instability or Windows session limits
- **Fix**: Adjust reconnection settings
  ```bash
  RDP_RECONNECT_DELAY=10  # Wait longer between retries
  ```

#### Want Manual Control (No Auto-Reconnect)
- **Fix**: Set max retries to 1
  ```bash
  RDP_MAX_RETRIES=1
  ```

### Performance Issues

#### Laggy or Slow Response
1. Reduce resolution:
   ```bash
   RESOLUTION=1600x900  # Instead of 1920x1080
   ```

2. Disable graphics features in rdp-launcher.sh:
   ```bash
   # Remove or change:
   /gfx:AVC444  →  /gfx:RFX
   ```

3. Check network latency:
   ```bash
   docker exec vnc-desktop ping $WINDOWS_RDP_HOST
   ```

#### Clipboard Not Working
- **Cause**: Clipboard redirection disabled
- **Fix**: Ensure `+clipboard` option is in rdp-launcher.sh

## Debugging

### View RDP Connection Status
Access the desktop and click "RDP Status" icon to see:
- Current FreeRDP process
- Connection state
- Last error messages

### Manual RDP Test
```bash
# Enter container
docker exec -it vnc-desktop bash

# Test manual connection
xfreerdp /v:192.168.1.100:3389 /u:administrator /cert:ignore
```

### Check Autostart Configuration
```bash
docker exec vnc-desktop cat /home/evin/.config/autostart/rdp-launcher.desktop
```

### View Launcher Script
```bash
docker exec vnc-desktop cat /usr/local/bin/rdp-launcher.sh
```

## Security Considerations

### Best Practices
1. **Use Strong Passwords**: Both VNC and Windows passwords
2. **Internal Network Only**: Don't expose RDP server to internet
3. **HTTPS Only**: Always use Caddy reverse proxy with SSL
4. **Rotate Credentials**: Regularly update passwords
5. **Monitor Logs**: Watch for failed connection attempts

### Network Isolation
```yaml
networks:
  homelab:
    internal: true  # Prevent external access
```

### Password Management
Store sensitive credentials in Docker secrets:
```bash
echo "my_password" | docker secret create rdp_password -
```

Then reference in compose:
```yaml
secrets:
  - rdp_password
environment:
  - WINDOWS_RDP_PASSWORD_FILE=/run/secrets/rdp_password
```

## Use Cases

### WinApps Streaming
Access Windows applications (Adobe, MS Office, etc.) through your browser without a Windows license on the client machine.

### Remote Administration
Manage Windows servers from any device with a web browser - no VPN or RDP client required.

### Gaming (Limited)
Stream Windows games that don't require high-end GPU (e.g., indie games, older titles). For modern gaming, use native GPU passthrough.

### Development
Access Windows development environments (Visual Studio, .NET) from Linux/Mac/Chromebook.

## Upgrading

### From Ubuntu Desktop VNC
If migrating from the full desktop setup:

1. **Backup Data**:
   ```bash
   docker run --rm -v vnc_home:/data -v $(pwd):/backup \
       ubuntu tar czf /backup/vnc_home_backup.tar.gz /data
   ```

2. **Remove Old Container**:
   ```bash
   docker compose -f docker-compose.unified.yml down vnc-desktop
   ```

3. **Deploy New Configuration**:
   ```bash
   docker compose -f docker-compose.unified.yml build vnc-desktop
   docker compose -f docker-compose.unified.yml up -d vnc-desktop
   ```

### Update FreeRDP Version
Rebuild container to get latest packages:
```bash
docker compose -f docker-compose.unified.yml build --no-cache vnc-desktop
docker compose -f docker-compose.unified.yml up -d vnc-desktop
```

## Technical Details

### Base Image
- **Image**: `dorowu/ubuntu-desktop-lxde-vnc:latest`
- **Desktop**: LXDE (lightweight, auto-hides for fullscreen RDP)
- **VNC Server**: TigerVNC
- **NoVNC**: Web-based VNC client with websockets

### Installed Packages
- `freerdp2-x11` - FreeRDP client with X11 support
- `freerdp2-shadow-x11` - Shadow server (optional features)
- `gnome-terminal` - Terminal for debugging
- `vim`, `nano` - Text editors
- `curl`, `wget`, `net-tools` - Network utilities

### Ports
- **80**: NoVNC web interface (internal, proxied by Caddy)
- **5900**: VNC server (internal only, not exposed)

### Volume
- `vnc_home` - Persists `/home/evin` including:
  - FreeRDP connection history
  - Desktop configuration
  - User preferences

## Support

### Common Questions

**Q: Can I run local applications alongside RDP?**
A: No, this is designed as a pure RDP viewer. For a hybrid setup, use the original Ubuntu desktop image.

**Q: Does this work with non-Windows RDP servers?**
A: Yes! Works with xrdp on Linux, macOS Remote Desktop, or any RDP-compatible server.

**Q: Can I connect to multiple Windows servers?**
A: Not simultaneously in one container. Deploy multiple containers with different configurations.

**Q: What about GPU acceleration?**
A: GPU rendering happens on the Windows server. This container only displays the output.

### Related Documentation
- [FreeRDP Wiki](https://github.com/FreeRDP/FreeRDP/wiki)
- [NoVNC Documentation](https://novnc.com/info.html)
- [Windows XRDP Setup](https://docs.microsoft.com/en-us/windows-server/remote/remote-desktop-services/)

## License

Based on `dorowu/ubuntu-desktop-lxde-vnc` image.
FreeRDP is licensed under Apache License 2.0.
