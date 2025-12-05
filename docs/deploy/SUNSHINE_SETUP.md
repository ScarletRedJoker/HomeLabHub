# Sunshine GameStream Setup Guide

This guide configures Sunshine on the Windows 11 KVM VM with RTX 3060 GPU passthrough for optimal game streaming via Moonlight.

## Hardware Configuration

| Component | Value |
|-----------|-------|
| GPU | NVIDIA GeForce RTX 3060 (12GB VRAM) |
| VM Type | KVM with GPU Passthrough |
| Host | Ubuntu 25.10 (192.168.0.228) |
| VM IP | 192.168.122.250 (NAT) |
| Tunnel | WireGuard (10.200.0.2 ↔ 10.200.0.1) |

## Optimal Sunshine Settings

Access Sunshine Web UI: `https://localhost:47990` (on Windows VM)

### Video Settings (Configuration → Video)

```
Encoder: NVENC (Hardware)
Capture: NVFBC
Resolution: 1920x1080 (for WAN) or 2560x1440 (for LAN only)
FPS: 60
```

### Encoder Presets

| Setting | LAN Value | WAN Value |
|---------|-----------|-----------|
| Bitrate Mode | CBR | CBR |
| Bitrate | 40-60 Mbps | 15-25 Mbps |
| Preset | Low Latency HQ | Low Latency |
| Profile | High | Main |
| B-Frames | 0 | 0 |

### Advanced Settings

```ini
# In sunshine.conf or via Web UI
encoder = nvenc
capture = nvfbc
adapter_name = NVIDIA GeForce RTX 3060
frame_limiter_enable = true
frame_limiter_disable_vsync = true
nvenc_preset = 1
nvenc_spatial_aq = enabled
min_log_level = 1
```

### Audio Settings

```
Audio Device: Steam Virtual Audio Sink (recommended)
Virtual Sink: Enabled
```

## Windows Optimizations

### Power Settings
```powershell
# Run as Administrator
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c  # High Performance
```

### Disable Game Bar & Overlays
```powershell
# Disable Xbox Game Bar
Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name "AppCaptureEnabled" -Value 0
Set-ItemProperty -Path "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\GameDVR" -Name "GameDVR_Enabled" -Value 0
```

### NVIDIA Driver Settings
1. Open NVIDIA Control Panel
2. Manage 3D Settings → Global Settings:
   - Power management mode: **Prefer maximum performance**
   - Texture filtering - Quality: **High performance**
   - Low Latency Mode: **Ultra**
3. Change resolution → Use NVIDIA color settings:
   - Output color depth: **8 bpc**
   - Output color format: **RGB**
   - Output dynamic range: **Full**

## Network Configuration

### Ubuntu Host (Port Forwarding)

The iptables rules for forwarding GameStream ports through NAT:

```bash
# Already configured in /etc/iptables/rules.v4
# Sunshine ports: 47984-47990 (TCP/UDP), 48010 (UDP)

# Forward from WireGuard (10.200.0.2) to VM (192.168.122.250)
sudo iptables -t nat -A PREROUTING -i wg0 -p tcp --dport 47984:47990 -j DNAT --to-destination 192.168.122.250
sudo iptables -t nat -A PREROUTING -i wg0 -p udp --dport 47984:47990 -j DNAT --to-destination 192.168.122.250
sudo iptables -t nat -A PREROUTING -i wg0 -p udp --dport 48010 -j DNAT --to-destination 192.168.122.250

# Enable forwarding
sudo iptables -A FORWARD -i wg0 -o virbr0 -p tcp --dport 47984:47990 -j ACCEPT
sudo iptables -A FORWARD -i wg0 -o virbr0 -p udp --dport 47984:47990 -j ACCEPT
sudo iptables -A FORWARD -i wg0 -o virbr0 -p udp --dport 48010 -j ACCEPT

# Save rules
sudo netfilter-persistent save
```

### Windows Firewall (on VM)

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "Sunshine TCP" -Direction Inbound -Protocol TCP -LocalPort 47984-47990 -Action Allow
New-NetFirewallRule -DisplayName "Sunshine UDP" -Direction Inbound -Protocol UDP -LocalPort 47984-47990,48010 -Action Allow
```

## Moonlight Client Settings

| Setting | Recommended Value |
|---------|-------------------|
| Resolution | 1920x1080 |
| FPS | 60 |
| Bitrate | 40 Mbps (LAN) / 15 Mbps (WAN) |
| Codec | HEVC (H.265) |
| Video decoder | Hardware |
| Frame pacing | On |
| V-Sync | On |
| Buffer frames | 1-2 |

## Troubleshooting

### "Looks horrible" / Poor Quality

1. **Increase bitrate**: 40+ Mbps for LAN, 20+ for WAN
2. **Use HEVC codec** in Moonlight (better quality at same bitrate)
3. **Check resolution**: Ensure source matches client (no upscaling)
4. **Disable overlays**: Game Bar, Discord overlay, etc.
5. **Fix color banding**: Use 10-bit HEVC if supported

### High Latency

1. **Enable Low Latency mode** in NVIDIA Control Panel
2. **Reduce buffer frames** to 1 in Moonlight
3. **Use wired connection** if possible
4. **Check WireGuard latency**: `ping 10.200.0.1` (should be <50ms)

### Encoder Errors

The RTX 3060 does NOT support AV1 encoding (only RTX 4000+ series). Use H.264 or HEVC instead.

### Connection Issues

```bash
# On Ubuntu host, verify iptables
sudo iptables -t nat -L -n | grep 479

# Test port forwarding
nc -zv 192.168.122.250 47989

# Check VM is running
virsh list --all
```

## Quick Start Commands

### Start Sunshine VM (on Ubuntu host)
```bash
# Requires virsh/libvirt permissions (run with sudo if needed)
./deploy/local/scripts/start-sunshine-vm.sh start
./deploy/local/scripts/start-sunshine-vm.sh status
./deploy/local/scripts/start-sunshine-vm.sh stop
```

### Check GameStream Status
```bash
# Verifies VM, Sunshine, network, and port forwarding
./deploy/local/scripts/check-gamestream.sh
```

### Apply Optimal Settings (on Windows VM)
```powershell
# Run as Administrator in PowerShell
.\setup-sunshine-optimal.ps1
```

**Note**: The optimal settings script configures:
- Web UI accessible from LAN only (secure)
- UPnP disabled (manual port forwarding)
- Support for both 1080p60 and 1440p60
- NVENC with CBR encoding for consistent quality
