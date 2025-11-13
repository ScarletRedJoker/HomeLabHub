#!/bin/bash

set -e

VNC_USER=${VNC_USER:-evin}
USER_HOME="/home/${VNC_USER}"

echo "============================================"
echo "  VNC Desktop Bootstrap"
echo "  User: ${VNC_USER}"
echo "  Home: ${USER_HOME}"
echo "============================================"

if [ -f "${USER_HOME}/.desktop_provisioned" ]; then
    echo "Desktop already provisioned. Skipping bootstrap."
    exit 0
fi

echo "Creating XDG user directories..."
mkdir -p "${USER_HOME}/Desktop"
mkdir -p "${USER_HOME}/Documents"
mkdir -p "${USER_HOME}/Downloads"
mkdir -p "${USER_HOME}/Pictures"
mkdir -p "${USER_HOME}/Videos"
mkdir -p "${USER_HOME}/Music"

echo "Waiting for host mounts to be ready..."
sleep 2

echo "Creating desktop shortcuts..."
cat > "${USER_HOME}/Desktop/Firefox.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Name=Firefox Web Browser
Comment=Browse the World Wide Web
GenericName=Web Browser
Keywords=Internet;WWW;Browser;Web;Explorer
Exec=firefox %u
Terminal=false
X-MultipleArgs=false
Type=Application
Icon=firefox
Categories=GNOME;GTK;Network;WebBrowser;
MimeType=text/html;text/xml;application/xhtml+xml;application/xml;application/rss+xml;application/rdf+xml;image/gif;image/jpeg;image/png;x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/ftp;x-scheme-handler/chrome;video/webm;application/x-xpinstall;
StartupNotify=true
Actions=NewWindow;NewPrivateWindow;
EOF

cat > "${USER_HOME}/Desktop/Terminal.desktop" << 'EOF'
[Desktop Entry]
Name=Terminal
Comment=Use the command line
TryExec=gnome-terminal
Exec=gnome-terminal
Icon=utilities-terminal
Type=Application
Categories=GNOME;GTK;System;TerminalEmulator;
StartupNotify=true
OnlyShowIn=GNOME;Unity;
Keywords=Run;
Actions=new-window;
X-Ubuntu-Gettext-Domain=gnome-terminal
EOF

cat > "${USER_HOME}/Desktop/File Manager.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Exec=thunar %F
Icon=system-file-manager
Terminal=false
StartupNotify=true
Categories=System;FileTools;FileManager;
OnlyShowIn=GNOME;LXDE;XFCE;
Keywords=folders;filesystem;explorer;
Name=File Manager
GenericName=File Manager
Comment=Browse the file system
EOF

cat > "${USER_HOME}/Desktop/homelab-dashboard.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Homelab Dashboard
Comment=Access Homelab Control Panel
Exec=firefox https://host.evindrake.net
Icon=applications-internet
Terminal=false
Categories=Network;WebBrowser;
EOF

cat > "${USER_HOME}/Desktop/VLC.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=VLC Media Player
GenericName=Media Player
Comment=Read, capture, broadcast your multimedia streams
Exec=vlc --no-video-title-show %U
Icon=vlc
Terminal=false
Categories=AudioVideo;Player;Recorder;
MimeType=video/dv;video/mpeg;video/x-mpeg;video/msvideo;video/quicktime;video/x-anim;video/x-avi;video/x-ms-asf;video/x-ms-wmv;video/x-msvideo;video/x-nsv;video/x-flc;video/x-fli;application/ogg;application/x-ogg;video/x-theora+ogg;audio/x-vorbis+ogg;audio/x-flac+ogg;audio/x-speex+ogg;video/x-ogm+ogg;audio/x-shorten;audio/x-ape;audio/x-wavpack;audio/x-tta;audio/AMR;audio/ac3;audio/eac3;audio/flac;audio/x-it;audio/midi;audio/x-mod;audio/mp4;audio/mpeg;audio/x-mpegurl;audio/x-ms-asx;audio/x-ms-wma;application/vnd.rn-realmedia;audio/x-pn-realaudio;audio/x-pn-realaudio-plugin;audio/x-realaudio;audio/x-s3m;audio/x-scpls;audio/x-stm;audio/x-voc;audio/x-wav;audio/x-adpcm;audio/x-xm;application/x-shockwave-flash;application/x-flash-video;misc/ultravox;image/vnd.rn-realpix;audio/x-it;audio/x-mod;audio/x-s3m;audio/x-xm;
StartupNotify=true
EOF

if [ -d "${USER_HOME}/host-projects" ]; then
    cat > "${USER_HOME}/Desktop/Projects.desktop" << EOF
[Desktop Entry]
Type=Link
Name=Projects Folder
Icon=folder-code
URL=file://${USER_HOME}/host-projects
EOF
else
    echo "Warning: host-projects mount not available, skipping Projects shortcut"
fi

echo "Making desktop shortcuts executable..."
for desktop_file in "${USER_HOME}/Desktop/"*.desktop; do
    if [ -f "$desktop_file" ] && [ -w "$desktop_file" ]; then
        chmod +x "$desktop_file" || echo "Warning: Could not make $desktop_file executable"
    fi
done

echo "Creating LXQt panel configuration..."
mkdir -p "${USER_HOME}/.config/lxpanel/LXDE/panels"

cat > "${USER_HOME}/.config/lxpanel/LXDE/panels/panel" << 'EOF'
Global {
  edge=bottom
  allign=center
  margin=0
  widthtype=percent
  width=100
  height=36
  transparent=0
  tintcolor=#000000
  alpha=0
  autohide=0
  heightwhenhidden=2
  setdocktype=1
  setpartialstrut=1
  usefontcolor=0
  fontcolor=#ffffff
  background=0
  backgroundfile=/usr/share/lxpanel/images/background.png
  iconsize=24
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
    separator {
    }
    item {
      image=gnome-logout
      command=logout
    }
  }
}
Plugin {
  type=launchbar
  Config {
    Button {
      id=firefox.desktop
    }
    Button {
      id=gnome-terminal.desktop
    }
    Button {
      id=thunar.desktop
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
    MaxTaskWidth=150
    spacing=1
    GroupedTasks=0
  }
}
Plugin {
  type=tray
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

echo "Configuring VLC for Docker environment..."
mkdir -p "${USER_HOME}/.config/vlc"
cat > "${USER_HOME}/.config/vlc/vlcrc" << 'EOF'
# VLC Configuration for Docker Containers
# Disable hardware acceleration (not available in containers)
avcodec-hw=none
vout=x11
no-video-title-show=1
EOF

echo "Fixing permissions (if running as root)..."
if [ "$(id -u)" = "0" ]; then
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/.config" 2>/dev/null || true
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Desktop" 2>/dev/null || true
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Documents" 2>/dev/null || true
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Downloads" 2>/dev/null || true
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Pictures" 2>/dev/null || true
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Videos" 2>/dev/null || true
    chown -R ${VNC_USER}:${VNC_USER} "${USER_HOME}/Music" 2>/dev/null || true
else
    echo "Running as non-root user, skipping chown"
fi

echo "Provisioning complete!"
touch "${USER_HOME}/.desktop_provisioned"

echo "============================================"
echo "  VNC Desktop Ready!"
echo "  Access at: https://vnc.evindrake.net"
echo "============================================"
