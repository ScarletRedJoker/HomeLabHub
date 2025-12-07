# Ultimate Gaming & Media Setup Guide

Transform your Ubuntu workstation into the future of personal computing - a seamless blend of gaming, media management, and productivity that you control from anywhere.

## The Vision

Your setup enables:
- **GameStream Gaming** - Play AAA games via Moonlight from any device, anywhere
- **NAS Media Hub** - Drag-and-drop media management that feeds Plex automatically
- **Remote Desktop** - Full Windows productivity apps via WinApps
- **Mode Switching** - Instant transitions between gaming and work

## Quick Start

### One-Time Setup (on Ubuntu host)

```bash
cd /home/evin/contain/HomeLabHub

# Install all desktop integrations
./scripts/install-mode-switchers.sh

# This installs:
#   - Gaming Mode launchers
#   - WinApps shortcuts  
#   - NAS folder bookmarks in Files app
#   - Desktop shortcuts for all modes
```

### Daily Usage

**Gaming:**
```bash
# Start gaming session (switches VM to console mode)
gaming-mode

# Or click "Moonlight Gaming" from app menu
# Connect with Moonlight app to: 192.168.122.250
```

**Media Management:**
- Open Files app → See NAS folders in sidebar
- Drag movies to "NAS Video" → Plex auto-scans
- Drag music to "NAS Music" → Available in Plex immediately

**Productivity:**
```bash
# Use Windows apps seamlessly on Linux desktop
winapps-mode word
winapps-mode excel
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Your Ubuntu Desktop                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│   │   Files     │    │  Moonlight  │    │  WinApps    │         │
│   │  (Nautilus) │    │   Client    │    │  (RDP)      │         │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│          │                   │                  │                 │
│          ▼                   ▼                  ▼                 │
│   ┌─────────────────────────────────────────────────────┐       │
│   │              KVM Virtual Machine                      │       │
│   │         Windows 11 + RTX 3060 Passthrough            │       │
│   │                                                       │       │
│   │   ┌──────────────┐  ┌──────────────┐                │       │
│   │   │   Sunshine    │  │   RDP Server  │                │       │
│   │   │  (GameStream) │  │  (WinApps)    │                │       │
│   │   └──────────────┘  └──────────────┘                │       │
│   └─────────────────────────────────────────────────────┘       │
│          │                                                       │
│          ▼                                                       │
│   ┌─────────────────────────────────────────────────────┐       │
│   │                  NAS Storage (Zyxel)                  │       │
│   │         /mnt/nas/networkshare                         │       │
│   │                                                       │       │
│   │   /video ──► Plex Movies/Shows                        │       │
│   │   /music ──► Plex Music Library                       │       │
│   │   /games ──► Game Backups/ISOs                        │       │
│   │   /photo ──► Photo Albums                             │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │        WireGuard Tunnel        │
              │    Remote Access from Linode   │
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │      Moonlight on Phone/      │
              │      Tablet/Laptop/Steam Deck │
              │                               │
              │   Play Games From Anywhere!   │
              └───────────────────────────────┘
```

## NAS Media Management

### Folder Structure

| Path | Purpose | Plex Integration |
|------|---------|------------------|
| `/mnt/nas/networkshare/video` | Movies & TV Shows | Auto-scans every 15 min |
| `/mnt/nas/networkshare/music` | Music Library | Full library access |
| `/mnt/nas/networkshare/photo` | Photo Albums | Available in Plex |
| `/mnt/nas/networkshare/games` | Game ISOs/Backups | N/A (storage only) |

### Adding Media to Plex

1. **Drag & Drop Method:**
   - Open Files → Click "NAS Video" in sidebar
   - Drag your `.mkv`, `.mp4`, or `.avi` files into folder
   - Plex scans automatically (or trigger: Settings → Libraries → Scan)

2. **Command Line:**
   ```bash
   # Copy a movie
   cp "Movie.mkv" /mnt/nas/networkshare/video/Movies/
   
   # Copy a TV show (create folder structure)
   mkdir -p /mnt/nas/networkshare/video/Shows/ShowName/Season\ 01
   cp "Show.S01E01.mkv" /mnt/nas/networkshare/video/Shows/ShowName/Season\ 01/
   ```

3. **Remote Upload (from anywhere):**
   - Use SFTP: `sftp evin@host.evindrake.net`
   - Or rsync: `rsync -avz movies/ evin@host.evindrake.net:/mnt/nas/networkshare/video/Movies/`

### Plex Naming Best Practices

```
Movies/
  Movie Name (2024)/
    Movie Name (2024).mkv
    
Shows/
  Show Name (2024)/
    Season 01/
      Show Name - S01E01 - Episode Title.mkv
```

## GameStream Gaming

### Prerequisites Checklist

- [ ] Windows VM running (`virsh start RDPWindows`)
- [ ] Sunshine installed and running on Windows
- [ ] NVIDIA drivers installed in VM
- [ ] Moonlight client installed on your device

### Starting a Gaming Session

**From Desktop (Ubuntu):**
```bash
# Check everything is ready
./deploy/local/scripts/check-gamestream.sh

# Switch to gaming mode
gaming-mode

# Launch Moonlight
moonlight-gaming
```

**From Remote Device:**
1. Open Moonlight app
2. Add host: `10.200.0.2` (via WireGuard) or `192.168.122.250` (LAN)
3. Pair with PIN shown in Sunshine
4. Launch Desktop or your games

### Performance Tuning

**For Best Quality (LAN):**
- Resolution: 1440p or 4K
- Bitrate: 50-80 Mbps
- Codec: HEVC

**For Remote/WAN:**
- Resolution: 1080p
- Bitrate: 15-25 Mbps
- Codec: HEVC

**Latency Tips:**
- Use 5GHz WiFi or Ethernet
- Enable Low Latency Mode in NVIDIA Control Panel
- Set buffer frames to 1 in Moonlight

## Mode Switching

### Gaming Mode
Disconnects RDP, enables Sunshine for low-latency streaming.

```bash
gaming-mode
```

### Productivity Mode  
Reconnects RDP for seamless Windows app integration.

```bash
productivity-mode
```

### WinApps Integration
Run Windows apps as if they were native Linux apps:

```bash
winapps-mode word      # Microsoft Word
winapps-mode excel     # Microsoft Excel
winapps-mode explorer  # Windows Explorer
```

## Remote Access

### WireGuard VPN (Recommended)

Your setup includes a WireGuard tunnel for secure remote access:

| Location | WireGuard IP |
|----------|--------------|
| Linode Server | 10.200.0.1 |
| Ubuntu Host | 10.200.0.2 |

Connect to gaming from anywhere via the Linode relay:
1. VPN to Linode (or use Tailscale)
2. Connect Moonlight to `10.200.0.2`

### Tailscale (Alternative)

If using Tailscale, your devices can connect directly without port forwarding.

## Troubleshooting

### GameStream Issues

```bash
# Check complete status
./deploy/local/scripts/check-gamestream.sh

# Restart VM if stuck
virsh shutdown RDPWindows
sleep 30
virsh start RDPWindows

# Check Sunshine logs (in Windows)
# C:\Program Files\Sunshine\logs\
```

### NAS Issues

```bash
# Diagnose NAS connectivity
./deploy/local/scripts/diagnose-nas.sh

# Remount if needed
sudo ./deploy/local/scripts/setup-nas-mounts.sh --nas-ip=192.168.0.176

# Check write access
touch /mnt/nas/networkshare/test.txt && rm /mnt/nas/networkshare/test.txt && echo "Write OK"
```

### Plex Issues

```bash
# Check Plex container
docker ps | grep plex
docker logs plex --tail 50

# Restart Plex
docker restart plex
```

## The Future of Computing

You've built something remarkable:

1. **Your PC is now a cloud gaming server** - Play from your phone, tablet, laptop, or Steam Deck
2. **Your NAS is your personal media empire** - All your content, organized and streaming
3. **Your workstation is invisible** - The hardware disappears; only the experience remains
4. **You own everything** - No subscriptions, no limits, no corporate control

This is what the future looks like - and you built it yourself.

---

*"Any sufficiently advanced technology is indistinguishable from magic."* - Arthur C. Clarke

Your homelab is that magic. 
