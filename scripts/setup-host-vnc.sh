#!/bin/bash
# ============================================
# Host VNC Setup Script for Ubuntu 25.10
# ============================================
# Installs TigerVNC server + noVNC web client
# Much faster than Docker container VNC
#
# Usage: sudo ./scripts/setup-host-vnc.sh
# ============================================

set -euo pipefail

echo "================================================"
echo "  Installing Host VNC (TigerVNC + noVNC)"
echo "================================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ]; then
    echo "Please run with sudo: sudo $0"
    exit 1
fi

VNC_USER="${1:-evin}"
VNC_DISPLAY=":1"
VNC_PORT="5901"
NOVNC_PORT="6080"

echo -e "\n${GREEN}[1/5] Installing TigerVNC Server...${NC}"
apt-get update
apt-get install -y tigervnc-standalone-server tigervnc-common

echo -e "\n${GREEN}[2/5] Installing noVNC Web Client...${NC}"
apt-get install -y novnc websockify

# Create noVNC directory if using manual install
if [ ! -d "/opt/novnc" ]; then
    mkdir -p /opt/novnc
    ln -sf /usr/share/novnc /opt/novnc/novnc
fi

echo -e "\n${GREEN}[3/5] Configuring VNC Password...${NC}"
# Set VNC password for user - read from env or prompt
VNC_PASSWORD="${VNC_PASSWORD:-}"
if [ -z "$VNC_PASSWORD" ]; then
    read -sp "Enter VNC password: " VNC_PASSWORD
    echo ""
fi
sudo -u "$VNC_USER" bash -c "
    mkdir -p ~/.vnc
    echo '$VNC_PASSWORD' | vncpasswd -f > ~/.vnc/passwd
    chmod 600 ~/.vnc/passwd
"

echo -e "\n${GREEN}[4/5] Creating VNC Startup Script...${NC}"
# Create xstartup script
sudo -u "$VNC_USER" bash -c '
cat > ~/.vnc/xstartup << "EOF"
#!/bin/bash
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS

# Start desktop environment
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=GNOME

# Use GNOME if available, otherwise fallback to xfce or basic
if command -v gnome-session &> /dev/null; then
    exec gnome-session
elif command -v startxfce4 &> /dev/null; then
    exec startxfce4
elif command -v startlxde &> /dev/null; then
    exec startlxde
else
    exec xterm
fi
EOF
chmod +x ~/.vnc/xstartup
'

echo -e "\n${GREEN}[5/5] Creating Systemd Services...${NC}"

# Create VNC server systemd service
cat > /etc/systemd/system/vncserver@.service << EOF
[Unit]
Description=TigerVNC Server for %i
After=syslog.target network.target

[Service]
Type=simple
User=$VNC_USER
PAMName=login
PIDFile=/home/$VNC_USER/.vnc/%H%i.pid
ExecStartPre=/bin/sh -c '/usr/bin/vncserver -kill %i > /dev/null 2>&1 || :'
ExecStart=/usr/bin/vncserver %i -geometry 1920x1080 -depth 24 -localhost no -fg
ExecStop=/usr/bin/vncserver -kill %i
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Create noVNC systemd service
# IMPORTANT: Bind to 0.0.0.0 so Docker containers (Caddy) can access it
cat > /etc/systemd/system/novnc.service << EOF
[Unit]
Description=noVNC Web Client
After=vncserver@1.service
Requires=vncserver@1.service

[Service]
Type=simple
User=$VNC_USER
ExecStart=/usr/bin/websockify --web=/usr/share/novnc 0.0.0.0:${NOVNC_PORT} localhost:${VNC_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable services
systemctl daemon-reload
systemctl enable vncserver@1.service
systemctl enable novnc.service

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  VNC Setup Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "  VNC Server: localhost:${VNC_PORT} (display ${VNC_DISPLAY})"
echo "  noVNC Web:  http://localhost:${NOVNC_PORT}/vnc.html"
echo "  Password:   (the password you entered during setup)"
echo ""
echo "  Start services:"
echo "    sudo systemctl start vncserver@1"
echo "    sudo systemctl start novnc"
echo ""
echo "  Or start both:"
echo "    sudo systemctl start vncserver@1 novnc"
echo ""
echo "  Check status:"
echo "    systemctl status vncserver@1 novnc"
echo ""
echo "  Access via Caddy:"
echo "    https://vnc.evindrake.net"
echo ""
