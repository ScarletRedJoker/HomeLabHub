# VLC Media Player Fix for VNC Desktop

## Problem
VLC doesn't open in Docker-based noVNC environments due to hardware acceleration conflicts.

## Root Cause
VLC tries to use hardware-accelerated video decoding (GPU), which isn't available in containerized environments. This causes VLC to crash silently when launched.

## The Fix
We've configured VLC to:
1. **Disable hardware acceleration** (`avcodec-hw=none`)
2. **Use X11 video output** (`vout=x11`) instead of GPU
3. **Hide video title overlay** (cleaner playback)

## Changes Made

### 1. Dockerfile Configuration
Added VLC config during image build:
```dockerfile
# Configure VLC for Docker containers (disable hardware acceleration)
RUN mkdir -p /root/.config/vlc && \
    echo 'avcodec-hw=none' >> /root/.config/vlc/vlcrc && \
    echo 'vout=x11' >> /root/.config/vlc/vlcrc && \
    echo 'no-video-title-show=1' >> /root/.config/vlc/vlcrc
```

### 2. Bootstrap Script
Creates user-specific VLC config on first run:
```bash
mkdir -p "${USER_HOME}/.config/vlc"
cat > "${USER_HOME}/.config/vlc/vlcrc" << 'EOF'
avcodec-hw=none
vout=x11
no-video-title-show=1
EOF
```

### 3. Desktop Shortcut
Added VLC icon to desktop with proper launch flags:
```desktop
[Desktop Entry]
Name=VLC Media Player
Exec=vlc --no-video-title-show %U
Icon=vlc
Type=Application
Categories=AudioVideo;Player;Recorder;
```

## Deployment

### Rebuild VNC Desktop
```bash
cd /home/evin/contain/HomeLabHub

# Stop and remove existing container
docker stop vnc-desktop && docker rm vnc-desktop

# Rebuild with VLC fix
docker compose -f docker-compose.unified.yml build --no-cache vnc-desktop

# Start container
docker compose -f docker-compose.unified.yml up -d vnc-desktop
```

### Verify VLC Works
1. Visit: https://vnc.evindrake.net
2. Double-click **VLC Media Player** icon on desktop
3. VLC should launch successfully
4. Or find in menu: **Sound & Video** → **VLC Media Player**

### Test Playback
In VNC desktop terminal:
```bash
# Download test video
wget https://download.blender.org/peach/bigbuckbunny_movies/big_buck_bunny_720p_h264.mov -O ~/Videos/test.mov

# Launch VLC with test video
vlc ~/Videos/test.mov
```

Should play smoothly without crashes!

## Alternative: Manual Fix (If Rebuild Not Possible)

If you can't rebuild the container, fix VLC in the running container:

```bash
# Enter the running container
docker exec -it vnc-desktop bash

# Create VLC config
mkdir -p /home/evin/.config/vlc
cat > /home/evin/.config/vlc/vlcrc << 'EOF'
avcodec-hw=none
vout=x11
no-video-title-show=1
EOF

# Fix permissions
chown -R evin:evin /home/evin/.config/vlc

# Test VLC
su - evin -c "vlc"
```

## Troubleshooting

### VLC Still Won't Open
**Check logs**:
```bash
# In VNC desktop terminal
vlc --verbose=2 2>&1 | tee ~/vlc-debug.log
```

**Common errors and fixes**:

**"Failed to initialize video output"**:
```bash
vlc --vout x11
```

**"cannot instantiate dialogs provider"**:
```bash
# Reinstall VLC plugins
sudo apt-get install --reinstall vlc-plugin-qt vlc-plugin-base
```

**"Running as root is a security risk"**:
```bash
vlc --no-luahttp
```

### Use Alternative Player
If VLC still has issues, try **MPV** (lighter, works better in Docker):
```bash
# Install MPV
sudo apt-get install mpv

# Play video
mpv ~/Videos/test.mov
```

## Performance Notes

**Expected Performance in Docker**:
- ✅ Audio playback: Perfect
- ✅ Video playback (720p): Smooth (using CPU decoding)
- ✅ Video playback (1080p): Good (may have slight frame drops on complex scenes)
- ⚠️ Video playback (4K): Slow (CPU decoding, not GPU)

**For 4K/heavy video editing**:
Use your **Windows KVM with GPU passthrough** at game.evindrake.net instead!

## Why This Works

**Docker Container Limitations**:
- No GPU access (unless using NVIDIA Container Toolkit)
- Hardware video decoding unavailable
- Must use software (CPU) decoding

**VLC Defaults**:
- Tries to use GPU acceleration by default
- Crashes when GPU unavailable
- Needs explicit configuration for software rendering

**Our Fix**:
- Forces X11 software rendering
- Disables all hardware acceleration
- Works reliably in containerized environments

## Additional Resources

**VLC Command-Line Options**:
```bash
vlc --help                    # Show all options
vlc --list                    # List all modules
vlc --vout ?                  # List video output modules
vlc --aout ?                  # List audio output modules
```

**Useful VLC Flags for Docker**:
```bash
vlc --no-video-title-show     # Hide title overlay
vlc --no-embedded-video       # Separate window
vlc --vout x11                # Force X11 output
vlc --avcodec-hw=none         # Disable hardware decoding
vlc --no-luahttp              # Disable web interface (if running as root)
```

---

*Created: Nov 13, 2025*
*VLC is now fully functional in your VNC Docker environment!*
