#!/bin/bash
set -e

# ============================================
# VNC Desktop Entrypoint Script
# ============================================
# This script configures and starts the VNC desktop environment
# with noVNC for web-based access

echo "========================================"
echo "Starting VNC Desktop Environment"
echo "========================================"

# ============================================
# Environment Variables
# ============================================
VNC_USER="${VNC_USER:-evin}"
VNC_PASSWORD="${VNC_PASSWORD:-password}"
NOVNC_ENABLE="${NOVNC_ENABLE:-true}"
DISPLAY="${DISPLAY:-:1}"

echo "Configuration:"
echo "  VNC User: $VNC_USER"
echo "  Display: $DISPLAY"
echo "  noVNC Enabled: $NOVNC_ENABLE"

# ============================================
# Create User Home Directory
# ============================================
if [ ! -d "/home/$VNC_USER" ]; then
    echo "Creating home directory for user $VNC_USER..."
    mkdir -p "/home/$VNC_USER"
    chown -R "$VNC_USER:$VNC_USER" "/home/$VNC_USER"
    echo "  ✓ Home directory created"
fi

# ============================================
# Configure VNC Password
# ============================================
echo "Configuring VNC password..."
VNC_PASSWORD_FILE="/home/$VNC_USER/.vnc/passwd"
mkdir -p "/home/$VNC_USER/.vnc"

# Set VNC password using vncpasswd
echo "$VNC_PASSWORD" | vncpasswd -f > "$VNC_PASSWORD_FILE"
chmod 600 "$VNC_PASSWORD_FILE"
chown -R "$VNC_USER:$VNC_USER" "/home/$VNC_USER/.vnc"
echo "  ✓ VNC password configured"

# ============================================
# Start X Virtual Framebuffer (Xvfb)
# ============================================
echo "Starting X Virtual Framebuffer..."
Xvfb "$DISPLAY" -screen 0 1920x1080x24 &
XVFB_PID=$!
echo "  ✓ Xvfb started with PID $XVFB_PID"

# Wait for X server to be ready
sleep 2

# ============================================
# Start VNC Server
# ============================================
echo "Starting VNC server..."
export DISPLAY="$DISPLAY"
vncserver "$DISPLAY" -geometry 1920x1080 -depth 24 -rfbauth "$VNC_PASSWORD_FILE" &
VNC_PID=$!
echo "  ✓ VNC server started with PID $VNC_PID"

# Wait for VNC server to be ready
sleep 2

# ============================================
# Start noVNC (Web-based VNC Client)
# ============================================
if [ "$NOVNC_ENABLE" = "true" ]; then
    echo "Starting noVNC on port 6080..."
    
    # Check if websockify is available
    if command -v websockify &> /dev/null; then
        websockify --web /usr/share/novnc 6080 localhost:5901 &
        NOVNC_PID=$!
        echo "  ✓ noVNC started with PID $NOVNC_PID"
        echo "  ✓ Access via: http://localhost:6080/vnc.html"
    else
        echo "  ⚠ websockify not found - noVNC disabled"
        echo "  Install with: apt-get install python3-websockify novnc"
    fi
else
    echo "noVNC disabled (NOVNC_ENABLE=$NOVNC_ENABLE)"
fi

# ============================================
# Start Window Manager (optional)
# ============================================
if command -v fluxbox &> /dev/null; then
    echo "Starting Fluxbox window manager..."
    DISPLAY="$DISPLAY" fluxbox &
    echo "  ✓ Fluxbox started"
elif command -v openbox &> /dev/null; then
    echo "Starting Openbox window manager..."
    DISPLAY="$DISPLAY" openbox &
    echo "  ✓ Openbox started"
else
    echo "  ⚠ No window manager found"
fi

# ============================================
# Keep Container Running
# ============================================
echo "========================================"
echo "VNC Desktop Environment Started!"
echo "========================================"
echo "Connection Info:"
echo "  VNC Port: 5901"
echo "  noVNC Port: 6080"
echo "  Display: $DISPLAY"
echo "========================================"

# Keep the container running by waiting for all background processes
wait
