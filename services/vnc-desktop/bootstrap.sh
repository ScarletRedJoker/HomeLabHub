#!/bin/bash

set -e

VNC_USER=${VNC_USER:-evin}
USER_HOME="/home/${VNC_USER}"

echo "============================================"
echo "  NoVNC X11 XRDP Client Bootstrap"
echo "  User: ${VNC_USER}"
echo "  Home: ${USER_HOME}"
echo "  Mode: Windows RDP Viewer"
echo "============================================"

echo "Creating basic directories..."
mkdir -p "${USER_HOME}/Desktop"
mkdir -p "${USER_HOME}/.config/autostart"
mkdir -p "${USER_HOME}/.config/lxpanel/LXDE/panels"

echo "Configuring RDP client autostart..."
cat > "${USER_HOME}/.config/autostart/rdp-launcher.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Windows RDP Connection
Comment=Auto-connect to Windows XRDP Server
Exec=/usr/local/bin/rdp-launcher.sh
Terminal=false
Hidden=false
X-GNOME-Autostart-enabled=true
StartupNotify=false
EOF

chmod +x "${USER_HOME}/.config/autostart/rdp-launcher.desktop"

echo "Creating connection status desktop shortcut..."
cat > "${USER_HOME}/Desktop/RDP-Status.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Name=RDP Connection Status
Comment=View RDP connection logs
Exec=gnome-terminal -- bash -c "echo 'RDP Connection Status'; echo '======================'; echo ''; ps aux | grep xfreerdp | grep -v grep || echo 'RDP Client not running'; echo ''; echo 'Press Enter to close'; read"
Icon=utilities-terminal
Type=Application
Terminal=false
EOF

chmod +x "${USER_HOME}/Desktop/RDP-Status.desktop"

echo "Creating minimal panel configuration..."
cat > "${USER_HOME}/.config/lxpanel/LXDE/panels/panel" << 'EOF'
Global {
  edge=bottom
  allign=center
  margin=0
  widthtype=percent
  width=100
  height=28
  transparent=0
  tintcolor=#000000
  alpha=0
  autohide=1
  heightwhenhidden=2
  setdocktype=1
  setpartialstrut=1
  usefontcolor=0
  fontcolor=#ffffff
  background=0
  backgroundfile=/usr/share/lxpanel/images/background.png
  iconsize=20
}
Plugin {
  type=space
  Config {
    Size=2
  }
}
Plugin {
  type=menu
  Config {
    image=start-here
    system {
    }
    separator {
    }
    item {
      command=run
    }
  }
}
Plugin {
  type=space
  Config {
    Size=4
  }
}
Plugin {
  type=taskbar
  expand=1
  Config {
    tooltips=1
    IconsOnly=0
    ShowAllDesks=0
    UseMouseWheel=1
    UseUrgencyHint=1
    FlatButton=0
    MaxTaskWidth=200
    spacing=1
    GroupedTasks=0
  }
}
Plugin {
  type=dclock
  Config {
    ClockFmt=%R
    TooltipFmt=%A %x
    BoldFont=0
    IconOnly=0
    CenterText=0
  }
}
EOF

echo "Setting permissions..."
if [ "$(id -u)" = "0" ]; then
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/.config" 2>/dev/null || true
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Desktop" 2>/dev/null || true
else
    echo "Running as non-root user, skipping chown"
fi

echo "============================================"
echo "  Bootstrap Complete!"
echo ""
echo "  Configuration:"
echo "    Windows Host: ${WINDOWS_RDP_HOST:-NOT SET}"
echo "    Windows User: ${WINDOWS_RDP_USER:-NOT SET}"
echo "    Windows Port: ${WINDOWS_RDP_PORT:-3389}"
echo "    RDP Domain:   ${WINDOWS_RDP_DOMAIN:-none}"
echo ""
echo "  Access via: https://vnc.evindrake.net"
echo "  RDP will launch automatically"
echo "============================================"
