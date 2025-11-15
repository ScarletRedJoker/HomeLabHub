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

echo "Setting up connection monitoring..."
cat > /tmp/vnc-idle-monitor.sh << 'IDLEMON'
#!/bin/bash
# Monitor VNC idle connections and disconnect after timeout

IDLE_TIMEOUT=${VNC_IDLE_TIMEOUT:-14400}  # 4 hours default
CHECK_INTERVAL=300  # Check every 5 minutes

while true; do
    sleep $CHECK_INTERVAL
    
    # Find idle VNC sessions
    for pid in $(pgrep -f 'websockify|Xvnc'); do
        # Get process start time
        start_time=$(ps -p $pid -o etimes= 2>/dev/null | tr -d ' ')
        
        if [ -n "$start_time" ] && [ "$start_time" -gt "$IDLE_TIMEOUT" ]; then
            # Check if there's actual activity (keyboard/mouse events)
            activity=$(find /tmp/.X11-unix -mmin -$((IDLE_TIMEOUT/60)) 2>/dev/null | wc -l)
            
            if [ "$activity" -eq 0 ]; then
                echo "[$(date)] Terminating idle VNC process $pid (idle for ${start_time}s, timeout: ${IDLE_TIMEOUT}s)"
                kill -TERM $pid 2>/dev/null || true
            fi
        fi
    done
done
IDLEMON

chmod +x /tmp/vnc-idle-monitor.sh

# Start idle monitor in background
if [ "$(id -u)" = "0" ]; then
    nohup /tmp/vnc-idle-monitor.sh > /tmp/vnc-idle-monitor.log 2>&1 &
    echo "Idle timeout monitor started (timeout: ${VNC_IDLE_TIMEOUT:-14400}s)"
fi

# Create connection limit check wrapper
cat > /tmp/vnc-connection-wrapper.sh << 'CONNWRAP'
#!/bin/bash
# Check connection limits before allowing new VNC connection

/usr/local/bin/vnc-monitor.sh check-limit
if [ $? -ne 0 ]; then
    echo "ERROR: Cannot accept new connection - maximum limit reached"
    exit 1
fi

# Log new connection
/usr/local/bin/vnc-monitor.sh count > /dev/null
CONNWRAP

chmod +x /tmp/vnc-connection-wrapper.sh

# Add VNC monitoring desktop shortcut
cat > "${USER_HOME}/Desktop/VNC-Monitor.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Name=VNC Connection Monitor
Comment=View VNC connection statistics
Exec=gnome-terminal -- bash -c "/usr/local/bin/vnc-monitor.sh stats | python3 -m json.tool; echo ''; echo 'Press Enter to close'; read"
Icon=utilities-system-monitor
Type=Application
Terminal=false
EOF

chmod +x "${USER_HOME}/Desktop/VNC-Monitor.desktop"
chown ${VNC_USER}:${VNC_USER} "${USER_HOME}/Desktop/VNC-Monitor.desktop" 2>/dev/null || true

echo "============================================"
echo "  Bootstrap Complete!"
echo ""
echo "  Configuration:"
echo "    Windows Host: ${WINDOWS_RDP_HOST:-NOT SET}"
echo "    Windows User: ${WINDOWS_RDP_USER:-NOT SET}"
echo "    Windows Port: ${WINDOWS_RDP_PORT:-3389}"
echo "    RDP Domain:   ${WINDOWS_RDP_DOMAIN:-none}"
echo ""
echo "  Resource Limits:"
echo "    Max Connections: ${MAX_VNC_CONNECTIONS:-3}"
echo "    Idle Timeout:    ${VNC_IDLE_TIMEOUT:-14400}s (4 hours)"
echo "    CPU Limit:       2.0 cores"
echo "    Memory Limit:    2GB (1.5GB reserved)"
echo ""
echo "  Access via: https://vnc.evindrake.net"
echo "  RDP will launch automatically"
echo "============================================"
