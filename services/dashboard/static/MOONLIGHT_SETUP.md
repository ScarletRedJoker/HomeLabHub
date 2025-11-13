# Moonlight Game Streaming Setup Guide

Stream games from your Windows 11 KVM (with RTX 3060) anywhere with low-latency 3D acceleration using Moonlight and Sunshine.

## Overview

**Moonlight** is an open-source game streaming client that uses NVIDIA's GameStream protocol.  
**Sunshine** is a self-hosted GameStream server that works with any GPU (including your RTX 3060).

This setup lets you play games from anywhere with near-native performance and low latency.

## Architecture

```
[Windows 11 KVM + RTX 3060]
         ↓ (Sunshine Server)
    [Traefik Proxy]
         ↓ (HTTPS)
  [Internet/Twingate]
         ↓
[Moonlight Client: Web/Desktop/Mobile]
```

## Prerequisites

- Windows 11 KVM with RTX 3060 GPU passthrough
- Static IP or hostname for the Windows VM on your network
- Ports 47984-47990 and 48010 available
- Router port forwarding (if accessing from internet)

## Part 1: Install Sunshine on Windows 11 KVM

### Step 1: Download Sunshine

1. **On your Windows 11 KVM**, download Sunshine:
   - Visit: https://github.com/LizardByte/Sunshine/releases
   - Download: `sunshine-windows-installer.exe`

2. **Run the installer** and install with default settings

3. **Open Sunshine** from Start Menu or desktop shortcut

### Step 2: Configure Sunshine

1. **Open Sunshine Web UI**:
   - Browser: http://localhost:47990
   - Default login: `admin` / `admin`

2. **Change Default Password**:
   - Go to: Configuration → Credentials
   - Set a strong password
   - Click "Save"

3. **Configure Streaming Settings**:
   - Go to: Configuration → Audio/Video
   - **Encoder**: NVENC (uses your RTX 3060)
   - **Resolution**: 1920x1080 (or your preference)
   - **FPS**: 60 (or higher if your network supports it)
   - **Bitrate**: 20 Mbps (adjust based on your upload speed)
   - Click "Save"

4. **Configure Network**:
   - Go to: Configuration → Network
   - **Bind Address**: Leave as `0.0.0.0` (all interfaces)
   - **External IP**: Your Ubuntu server's IP (for Traefik proxy)
   - Click "Save"

5. **Add Games/Applications**:
   - Go to: Applications
   - Click "Add Application"
   - **Desktop**: Select "mstsc.exe" for full desktop streaming
   - **Games**: Browse to your game executables
   - Click "Save"

### Step 3: Configure Windows Firewall

Open PowerShell as Administrator and run:

```powershell
# Allow Sunshine through Windows Firewall
New-NetFirewallRule -DisplayName "Sunshine Game Streaming" -Direction Inbound -Program "C:\Program Files\Sunshine\sunshine.exe" -Action Allow -Profile Any

# Or allow ports directly
New-NetFirewallRule -DisplayName "Sunshine TCP" -Direction Inbound -Protocol TCP -LocalPort 47984-47990,48010 -Action Allow
New-NetFirewallRule -DisplayName "Sunshine UDP" -Direction Inbound -Protocol UDP -LocalPort 47998-48000 -Action Allow
```

### Step 4: Start Sunshine Service

1. Open **Services** (Win + R, type `services.msc`)
2. Find "**Sunshine**" service
3. Set to **Automatic** startup
4. **Start** the service

## Part 2: Configure Traefik Reverse Proxy (Optional)

If you want to access Sunshine from the internet through your dashboard's Traefik instance:

### Option A: TCP Router (Recommended for Gaming)

Add to your `.env`:
```bash
# Sunshine/Moonlight Configuration
WINDOWS_KVM_IP=192.168.1.XXX  # Your Windows VM's IP
```

Add to `docker-compose.unified.yml`:
```yaml
  # Sunshine Game Streaming Proxy
  sunshine-proxy:
    image: alpine/socat
    container_name: sunshine-proxy
    restart: unless-stopped
    networks:
      - homelab
    command: >
      sh -c "
      socat TCP4-LISTEN:47984,fork,reuseaddr TCP4:${WINDOWS_KVM_IP}:47984 &
      socat TCP4-LISTEN:47989,fork,reuseaddr TCP4:${WINDOWS_KVM_IP}:47989 &
      socat TCP4-LISTEN:48010,fork,reuseaddr TCP4:${WINDOWS_KVM_IP}:48010 &
      socat UDP4-LISTEN:47998,fork,reuseaddr UDP4:${WINDOWS_KVM_IP}:47998 &
      socat UDP4-LISTEN:47999,fork,reuseaddr UDP4:${WINDOWS_KVM_IP}:47999 &
      socat UDP4-LISTEN:48000,fork,reuseaddr UDP4:${WINDOWS_KVM_IP}:48000 &
      wait
      "
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.sunshine.rule=Host(`game.evindrake.net`)"
      - "traefik.http.routers.sunshine.entrypoints=websecure"
      - "traefik.http.routers.sunshine.tls.certresolver=letsencrypt"
      - "traefik.http.services.sunshine.loadbalancer.server.port=47990"
```

### Option B: Direct Access (Simpler, Better Performance)

If using Twingate VPN, **skip the proxy** and connect directly to your Windows VM's IP:
- Sunshine Web UI: `http://192.168.1.XXX:47990`
- Moonlight connection: `192.168.1.XXX`

This provides **better latency** for gaming.

## Part 3: Configure Router Port Forwarding (Internet Access)

If you want to stream from outside your network (not using Twingate):

**Forward these ports** to your Windows 11 KVM:
```
TCP: 47984, 47989, 48010
UDP: 47998, 47999, 48000
```

⚠️ **Security Note**: Use a strong Sunshine password and consider using Twingate VPN instead for secure access.

## Part 4: Connect with Moonlight Client

### Desktop/Laptop (Windows, Mac, Linux)

1. **Download Moonlight**:
   - https://moonlight-stream.org/
   - Install for your OS

2. **Launch Moonlight**

3. **Add PC**:
   - Click "Add PC"
   - Enter:
     - **Via Twingate/LAN**: `192.168.1.XXX` (Windows VM IP)
     - **Via Internet**: `game.evindrake.net` or your public IP
   
4. **Pair Device**:
   - Moonlight shows a PIN
   - Go to Sunshine Web UI → Pin → Enter the PIN
   - Click "Pair"

5. **Start Streaming**:
   - Select your PC in Moonlight
   - Choose application/game
   - Enjoy! 🎮

### Mobile (Android/iOS)

1. **Download Moonlight** from Google Play or App Store

2. **Connect to WiFi** (same network as Windows VM for initial setup)

3. **Add PC** and pair (same as desktop)

4. **Optional**: For internet access, use your public IP or domain

### Web Browser (Experimental)

Some unofficial Moonlight web clients exist but are not officially supported. Desktop/mobile apps provide better performance.

## Performance Optimization

### Network Settings

- **LAN/Twingate**: Best performance (< 1ms latency)
- **Upload Speed**: At least 20 Mbps for 1080p60
- **For 4K60**: 50+ Mbps upload recommended

### Sunshine Settings

Optimize in Sunshine Web UI → Configuration:

**Low Latency (Competitive Gaming)**:
- Encoder: NVENC
- FPS: 60-120
- Bitrate: 10-15 Mbps
- Quality: Balanced

**High Quality (Casual Gaming)**:
- Encoder: NVENC
- FPS: 60
- Bitrate: 30-50 Mbps
- Quality: High

### GPU Passthrough Verification

Verify your RTX 3060 is properly passed through:

```powershell
# Check GPU in Windows
nvidia-smi
```

Should show RTX 3060 and driver version.

## Troubleshooting

### "Failed to Connect to PC"

1. **Check Sunshine service** is running on Windows
2. **Verify firewall** rules allow Sunshine
3. **Test locally first**: Use Windows VM's LAN IP
4. **Check Twingate** VPN connection if using it

### High Latency/Stuttering

1. **Check network speed**: Run speedtest from client and server
2. **Lower bitrate**: Reduce in Sunshine settings
3. **Use wired connection**: Ethernet on both ends
4. **Close background apps**: On both client and server

### Black Screen

1. **Check GPU passthrough**: Run `nvidia-smi` on Windows
2. **Update GPU drivers**: Latest NVIDIA drivers
3. **Try desktop stream first**: Before launching games

### Audio Issues

1. **In Sunshine**: Configuration → Audio/Video
2. **Select correct audio device**: Usually "Virtual Audio Cable" or your default device
3. **Windows Audio Settings**: Set default playback device

## Alternative: RDP for Non-Gaming Use

For simple remote desktop (not gaming):

### Guacamole (Web-based RDP)

Add Apache Guacamole to your unified deployment for browser-based RDP access:

```yaml
  guacamole:
    image: guacamole/guacamole:latest
    container_name: guacamole
    restart: unless-stopped
    networks:
      - homelab
    environment:
      - GUACD_HOSTNAME=guacd
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.rdp.rule=Host(`rdp.evindrake.net`)"
      - "traefik.http.routers.rdp.entrypoints=websecure"
      - "traefik.http.routers.rdp.tls.certresolver=letsencrypt"
      - "traefik.http.services.rdp.loadbalancer.server.port=8080"

  guacd:
    image: guacamole/guacd:latest
    container_name: guacd
    restart: unless-stopped
    networks:
      - homelab
```

Then access RDP via browser at `https://rdp.evindrake.net`

## Dashboard Integration

The Homelab Dashboard includes a "Game Streaming" page with:
- ✅ Sunshine status monitoring
- ✅ Quick connection info for Moonlight
- ✅ Download links for all platforms
- ✅ Performance metrics

Access at: `https://host.evindrake.net/game-streaming`

## Security Best Practices

1. **Use Strong Password**: Change default `admin/admin` immediately
2. **Use Twingate VPN**: Don't expose ports directly to internet
3. **Keep Updated**: Update Sunshine regularly
4. **Monitor Logs**: Check Sunshine logs for unauthorized access attempts
5. **Enable 2FA**: If Sunshine adds support in future

## Resources

- **Sunshine GitHub**: https://github.com/LizardByte/Sunshine
- **Moonlight Clients**: https://moonlight-stream.org/
- **Sunshine Docs**: https://docs.lizardbyte.dev/projects/sunshine/
- **Moonlight Discord**: https://discord.gg/moonlight

## Summary

- ✅ **Install Sunshine** on Windows 11 KVM
- ✅ **Configure GPU encoding** (NVENC on RTX 3060)
- ✅ **Connect via Moonlight** client
- ✅ **Best for LAN/Twingate** access (lowest latency)
- ✅ **Optional Traefik proxy** for internet access
- ✅ **Far better than RDP** for gaming!

Enjoy 3D accelerated gaming from anywhere! 🎮🚀
