# KVM Mode Switching Guide

This guide explains how to switch your Windows 11 KVM VM between Gaming Mode (Sunshine/Moonlight) and Productivity Mode (RDP/WinApps).

## Why Mode Switching is Needed

Sunshine and RDP compete for the GPU and display driver:
- When RDP connects, Windows switches to a "Remote Display Driver" that disables GPU capture
- Sunshine cannot capture the screen when RDP is active, causing Moonlight failures
- Running both simultaneously causes freezing and conflicts

The solution is to cleanly switch between modes.

## Quick Start

### From Ubuntu Host

```bash
# Switch to Gaming Mode (Moonlight)
./deploy/local/scripts/switch-kvm-mode.sh gaming

# Switch to Productivity Mode (RDP/WinApps)
./deploy/local/scripts/switch-kvm-mode.sh productivity

# Check current status
./deploy/local/scripts/switch-kvm-mode.sh status
```

### Manual Mode Switching (if scripts aren't set up)

**To Enter Gaming Mode:**
1. Disconnect any RDP sessions from the Windows VM
2. Start Sunshine (if not running as a service)
3. Connect with Moonlight to your Ubuntu host IP (192.168.0.177)

**To Enter Productivity Mode:**
1. Exit Sunshine (right-click tray icon -> Exit)
2. Wait 5 seconds
3. Connect with RDP or launch WinApps

## Windows Setup (One-Time)

### Install the Mode Switching Script

1. Create scripts folder on Windows:
   ```powershell
   mkdir C:\Scripts
   ```

2. Copy `scripts/windows/set-mode.ps1` to `C:\Scripts\set-mode.ps1` on the Windows VM

3. Test it manually:
   ```powershell
   # Run as Administrator
   powershell -ExecutionPolicy Bypass -File C:\Scripts\set-mode.ps1 -Mode gaming
   powershell -ExecutionPolicy Bypass -File C:\Scripts\set-mode.ps1 -Mode productivity
   ```

### Enable SSH (Optional - for automated switching)

To allow the Ubuntu host to automatically switch modes:

1. Install OpenSSH Server on Windows:
   ```powershell
   Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
   Start-Service sshd
   Set-Service -Name sshd -StartupType 'Automatic'
   ```

2. Add firewall rule:
   ```powershell
   New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
   ```

3. Test from Ubuntu:
   ```bash
   ssh Evin@192.168.122.250
   ```

## Troubleshooting

### Moonlight Shows "Error 113" or "Error 116"

1. Make sure no RDP sessions are active on the Windows VM
2. Run: `./deploy/local/scripts/switch-kvm-mode.sh gaming`
3. Wait 10 seconds for Sunshine to start
4. Try Moonlight again

### Games Freeze on Windows VM

1. **Switch to Gaming Mode first** - RDP must be disconnected
2. **Check GPU passthrough:**
   ```bash
   # On Ubuntu host
   lspci -nnk | grep -A3 "NVIDIA"
   ```
   Should show `vfio-pci` as the driver in use

3. **Set High Performance power plan** (done automatically by scripts):
   ```powershell
   powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c
   ```

4. **Disable Game Bar/Overlay:**
   - Settings -> Gaming -> Game Bar -> Off
   - Settings -> Gaming -> Captures -> Background Recording -> Off

### RDP Won't Connect

1. Make sure Sunshine is stopped
2. Run: `./deploy/local/scripts/switch-kvm-mode.sh productivity`
3. Check Windows firewall allows RDP

### WinApps Not Working

1. Switch to productivity mode first
2. Make sure RDP is enabled on Windows
3. Check WinApps configuration in `~/.config/winapps/winapps.conf`

## Network Topology

```
[3DS/Phone/PC]
      |
      v (WiFi/LAN)
[Ubuntu Host: 192.168.0.177]
      |
      | iptables DNAT (ports 47984-48010)
      v
[virbr0: 192.168.122.1]
      |
      v
[Windows VM: 192.168.122.250]
      |
      +-- Sunshine (Gaming Mode)
      +-- RDP (Productivity Mode)
```

## Files

| File | Location | Purpose |
|------|----------|---------|
| `switch-kvm-mode.sh` | Ubuntu: `deploy/local/scripts/` | Host orchestrator |
| `set-mode.ps1` | Windows: `C:\Scripts\` | Windows mode switcher |
| `setup-gamestream-forwarding.sh` | Ubuntu: `deploy/local/scripts/` | Initial port forwarding setup |
| `setup-autologin.ps1` | Windows: `C:\Scripts\` | Configure Windows autologin |
| `setup-ssh-server.ps1` | Windows: `C:\Scripts\` | Enable SSH for automation |
| `setup-startup-mode.ps1` | Windows: `C:\Scripts\` | Auto-enter mode on boot |
| `create-mode-shortcuts.ps1` | Windows: `C:\Scripts\` | Desktop shortcuts |

## Automation Setup

### 1. Fix Autologin

Windows must auto-login for Sunshine to work properly:

```powershell
# Run as Administrator
powershell -ExecutionPolicy Bypass -File C:\Scripts\setup-autologin.ps1 -Username "YourUsername" -Password "YourPassword"
```

### 2. Enable SSH (Recommended)

Allows Ubuntu to remotely switch modes:

```powershell
# Run as Administrator
powershell -ExecutionPolicy Bypass -File C:\Scripts\setup-ssh-server.ps1
```

Then test from Ubuntu:
```bash
ssh Evin@192.168.122.250
```

### 3. Auto-Enter Mode on Boot

Set Windows to automatically enter gaming or productivity mode after login:

```powershell
# Gaming mode on startup (for dedicated gaming VM)
powershell -ExecutionPolicy Bypass -File C:\Scripts\setup-startup-mode.ps1 -Mode gaming

# Or productivity mode on startup
powershell -ExecutionPolicy Bypass -File C:\Scripts\setup-startup-mode.ps1 -Mode productivity

# Disable auto-mode
powershell -ExecutionPolicy Bypass -File C:\Scripts\setup-startup-mode.ps1 -Mode disable
```

### 4. Desktop Shortcuts

Create one-click shortcuts:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Scripts\create-mode-shortcuts.ps1
```

Right-click the shortcuts and set "Run as administrator" in Properties -> Advanced.

## What Each Mode Does

### Gaming Mode
- Disconnects all RDP sessions
- Disables RDP service temporarily
- Starts Sunshine service
- Sets High Performance power plan
- Enables Sunshine firewall rules

### Productivity Mode
- Stops Sunshine service
- Enables RDP service
- WinApps containers can connect
