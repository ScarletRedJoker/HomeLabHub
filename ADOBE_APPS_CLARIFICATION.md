# Adobe Apps & VNC Desktop - Important Clarification

## Where Are Adobe Apps?

**Adobe Creative Cloud apps are NOT in the VNC Desktop container.**

They are on your **Windows 11 KVM virtual machine** with GPU passthrough, accessible via **WinApps** and **game streaming**.

---

## Two Different Environments

### 1. VNC Desktop (Docker Container)
**What it is**: Ubuntu desktop in Docker container  
**Access**: https://vnc.evindrake.net  
**GPU**: ❌ No GPU (software rendering only)  
**Purpose**: Remote Linux development environment  

**Apps available**:
- ✅ VLC Media Player
- ✅ OBS Studio (software mode, no GPU)
- ✅ GIMP (image editing)
- ✅ Audacity (audio editing)
- ✅ LibreOffice (office suite)
- ✅ Steam (gaming client)
- ✅ Firefox, Terminal, File Manager
- ✅ Development tools (git, python, nodejs, etc.)

**Adobe apps**: ❌ NOT available (can't run without GPU)

---

### 2. Windows 11 KVM (libvirt Virtual Machine)
**What it is**: Full Windows VM with RTX 3060 GPU passthrough  
**Access**: Via Moonlight client at game.evindrake.net  
**GPU**: ✅ RTX 3060 (full hardware acceleration)  
**Purpose**: Windows applications, gaming, Adobe Creative Cloud  

**Apps available**:
- ✅ Adobe Photoshop (via WinApps)
- ✅ Adobe Premiere Pro (via WinApps)
- ✅ Adobe After Effects (via WinApps)
- ✅ Adobe Illustrator (via WinApps)
- ✅ Any other Adobe Creative Cloud app
- ✅ Windows games (Steam, Epic, etc.)
- ✅ All Windows applications

**Access method**: Moonlight game streaming

---

## How to Access Adobe Apps

### Step 1: Set Up Sunshine (Windows VM)
On your Windows 11 KVM:

1. Install Sunshine: https://github.com/LizardByte/Sunshine/releases
2. Open Sunshine Web UI: https://localhost:47990
3. Add Adobe apps to Applications list:

```
Application 1: Photoshop
Command: C:\Program Files\Adobe\Adobe Photoshop 2025\Photoshop.exe

Application 2: Premiere Pro
Command: C:\Program Files\Adobe\Adobe Premiere Pro 2025\Adobe Premiere Pro.exe

Application 3: After Effects
Command: C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.exe
```

### Step 2: Connect via Moonlight
1. Install Moonlight client on your device
2. Visit game.evindrake.net for connection instructions
3. Pair with Sunshine server
4. Launch Adobe apps from Moonlight

### Step 3: Use WinApps (Alternative)
For seamless integration with your Linux desktop:

1. WinApps already configured via libvirt KVM
2. Adobe apps appear as native Linux applications
3. Click to launch - streams via RDP/Moonlight
4. Full GPU acceleration from RTX 3060

**See**: `docs/WINAPPS_STREAMING.md` for complete setup

---

## Performance Comparison

### VNC Desktop (Docker)
- ✅ Fast for development tools
- ✅ Good for terminal/coding
- ✅ OK for basic media playback
- ❌ Slow for video editing (no GPU)
- ❌ Can't run Adobe apps (no Windows)

### Windows KVM + Moonlight
- ✅ Full RTX 3060 GPU acceleration
- ✅ Native Windows performance
- ✅ Perfect for Adobe Creative Cloud
- ✅ 4K video editing support
- ✅ <10ms latency on LAN/Twingate

---

## Use Case Guide

**Use VNC Desktop for**:
- SSH into servers
- Git operations
- Code editing (Python, Node.js)
- Terminal commands
- Basic image editing (GIMP)
- Audio editing (Audacity)
- Office documents (LibreOffice)
- Web browsing
- Light development work

**Use Windows KVM + Moonlight for**:
- Adobe Photoshop
- Adobe Premiere Pro
- Adobe After Effects
- Adobe Illustrator
- High-performance gaming
- 4K video editing
- GPU-accelerated rendering
- Any Windows-only software

---

## Quick Access URLs

**VNC Desktop** (Linux Docker):
- 🔗 https://vnc.evindrake.net
- Apps: VLC, GIMP, OBS, Audacity, Steam, etc.

**Game Streaming** (Windows KVM):
- 🔗 https://game.evindrake.net
- Apps: Adobe Creative Cloud, Windows games, etc.

**Homelab Dashboard**:
- 🔗 https://host.evindrake.net
- Manage all services

---

## Summary

**VNC Desktop**: 
- ✅ Linux development environment
- ✅ Open-source apps
- ❌ No Adobe apps
- ❌ No GPU acceleration

**Windows KVM**: 
- ✅ Adobe Creative Cloud
- ✅ Full GPU acceleration
- ✅ Windows gaming
- ✅ Professional creative work

**Adobe apps live on Windows VM, not VNC Desktop!**

Access them via Moonlight/WinApps for full RTX 3060 performance.

---

*See docs/WINAPPS_STREAMING.md for complete Adobe streaming setup guide*
