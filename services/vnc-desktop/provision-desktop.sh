#!/bin/bash
# VNC Desktop Manual Provisioning Script
# Run this inside the VNC container to set up desktop icons and environment

set -e

echo "============================================"
echo "  VNC Desktop Manual Provisioning"
echo "============================================"
echo ""

USER_HOME="/home/evin"

# Create directories
echo "Creating desktop directories..."
mkdir -p "${USER_HOME}/Desktop"
mkdir -p "${USER_HOME}/Documents"
mkdir -p "${USER_HOME}/Downloads"
mkdir -p "${USER_HOME}/Pictures"
mkdir -p "${USER_HOME}/Videos"
mkdir -p "${USER_HOME}/Music"
mkdir -p "${USER_HOME}/.config/vlc"
mkdir -p "${USER_HOME}/.config/lxpanel/LXDE/panels"

# Configure VLC for Docker
echo "Configuring VLC..."
cat > "${USER_HOME}/.config/vlc/vlcrc" << 'EOF'
# VLC Configuration for Docker Containers
avcodec-hw=none
vout=x11
no-video-title-show=1
EOF

# Create VLC Desktop Shortcut
echo "Creating VLC desktop shortcut..."
cat > "${USER_HOME}/Desktop/VLC.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=VLC Media Player
GenericName=Media Player
Comment=Play movies and music
Exec=vlc --no-video-title-show %U
Icon=vlc
Terminal=false
Categories=AudioVideo;Player;Recorder;
MimeType=video/dv;video/mpeg;video/x-mpeg;video/msvideo;video/quicktime;video/x-anim;video/x-avi;video/x-ms-asf;video/x-ms-wmv;video/x-msvideo;video/x-nsv;video/x-flc;video/x-fli;application/ogg;application/x-ogg;video/x-theora+ogg;audio/x-vorbis+ogg;audio/x-flac+ogg;audio/x-speex+ogg;video/x-ogm+ogg;audio/x-shorten;audio/x-ape;audio/x-wavpack;audio/x-tta;audio/AMR;audio/ac3;audio/eac3;audio/flac;audio/x-it;audio/midi;audio/x-mod;audio/mp4;audio/mpeg;audio/x-mpegurl;audio/x-ms-asx;audio/x-ms-wma;application/vnd.rn-realmedia;audio/x-pn-realaudio;audio/x-pn-realaudio-plugin;audio/x-realaudio;audio/x-s3m;audio/x-scpls;audio/x-stm;audio/x-voc;audio/x-wav;audio/x-adpcm;audio/x-xm;application/x-shockwave-flash;application/x-flash-video;
StartupNotify=true
EOF

# Create Firefox Desktop Shortcut
echo "Creating Firefox desktop shortcut..."
cat > "${USER_HOME}/Desktop/Firefox.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Name=Firefox Web Browser
Comment=Browse the World Wide Web
Exec=firefox %u
Icon=firefox
Terminal=false
Type=Application
Categories=Network;WebBrowser;
StartupNotify=true
EOF

# Create Terminal Desktop Shortcut
echo "Creating Terminal desktop shortcut..."
cat > "${USER_HOME}/Desktop/Terminal.desktop" << 'EOF'
[Desktop Entry]
Name=Terminal
Comment=Use the command line
Exec=gnome-terminal
Icon=utilities-terminal
Type=Application
Categories=System;TerminalEmulator;
StartupNotify=true
EOF

# Create File Manager Desktop Shortcut
echo "Creating File Manager desktop shortcut..."
cat > "${USER_HOME}/Desktop/File-Manager.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=File Manager
GenericName=File Manager
Comment=Browse the file system
Exec=thunar %F
Icon=system-file-manager
Terminal=false
Categories=System;FileTools;FileManager;
StartupNotify=true
EOF

# Create OBS Studio Desktop Shortcut
echo "Creating OBS Studio desktop shortcut..."
cat > "${USER_HOME}/Desktop/OBS.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Name=OBS Studio
GenericName=Streaming/Recording Software
Comment=Free and Open Source Streaming/Recording Software
Exec=obs
Icon=com.obsproject.Studio
Terminal=false
Type=Application
Categories=AudioVideo;Recorder;
StartupNotify=true
EOF

# Create Steam Desktop Shortcut
echo "Creating Steam desktop shortcut..."
cat > "${USER_HOME}/Desktop/Steam.desktop" << 'EOF'
[Desktop Entry]
Name=Steam
Comment=Application for managing and playing games on Steam
Exec=/usr/games/steam %U
Icon=steam
Terminal=false
Type=Application
Categories=Network;FileTransfer;Game;
MimeType=x-scheme-handler/steam;x-scheme-handler/steamlink;
EOF

# Create GIMP Desktop Shortcut
echo "Creating GIMP desktop shortcut..."
cat > "${USER_HOME}/Desktop/GIMP.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=GNU Image Manipulation Program
GenericName=Image Editor
Comment=Create images and edit photographs
Exec=gimp-2.10 %U
Icon=gimp
Terminal=false
Categories=Graphics;2DGraphics;RasterGraphics;GTK;
MimeType=image/bmp;image/g3fax;image/gif;image/x-fits;image/x-pcx;image/x-portable-anymap;image/x-portable-bitmap;image/x-portable-graymap;image/x-portable-pixmap;image/x-psd;image/x-sgi;image/x-tga;image/x-xbitmap;image/x-xwindowdump;image/x-xcf;image/x-compressed-xcf;image/x-gimp-gbr;image/x-gimp-pat;image/x-gimp-gih;image/tiff;image/jpeg;image/x-psp;application/postscript;image/png;image/x-icon;image/x-xpixmap;image/x-exr;image/x-webp;image/heif;image/heic;image/svg+xml;application/pdf;image/x-wmf;image/jp2;image/x-xcursor;
StartupNotify=true
EOF

# Create Audacity Desktop Shortcut
echo "Creating Audacity desktop shortcut..."
cat > "${USER_HOME}/Desktop/Audacity.desktop" << 'EOF'
[Desktop Entry]
Version=1.0
Type=Application
Name=Audacity
GenericName=Audio Editor
Comment=Record and edit audio files
Exec=audacity %F
Icon=audacity
Terminal=false
Categories=AudioVideo;Audio;AudioVideoEditing;
MimeType=application/x-audacity-project;audio/aac;audio/ac3;audio/mp4;audio/x-ms-wma;video/mpeg;audio/mpeg;audio/x-wav;audio/x-aiff;audio/basic;audio/x-flac;audio/ogg;
StartupNotify=true
EOF

# Create Homelab Dashboard Desktop Shortcut
echo "Creating Homelab Dashboard desktop shortcut..."
cat > "${USER_HOME}/Desktop/Homelab-Dashboard.desktop" << 'EOF'
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

# Create Projects Folder Link (if mounted)
if [ -d "${USER_HOME}/host-projects" ]; then
    echo "Creating Projects folder link..."
    cat > "${USER_HOME}/Desktop/Projects.desktop" << EOF
[Desktop Entry]
Type=Link
Name=Projects Folder
Comment=Host system projects
Icon=folder-code
URL=file://${USER_HOME}/host-projects
EOF
fi

# Make all desktop files executable and trusted
echo "Making desktop shortcuts executable..."
chmod +x "${USER_HOME}/Desktop"/*.desktop

# Mark as trusted (required for LXDE to show icons)
for desktop_file in "${USER_HOME}/Desktop/"*.desktop; do
    if [ -f "$desktop_file" ]; then
        gio set "$desktop_file" "metadata::trusted" true 2>/dev/null || true
    fi
done

# Fix permissions
echo "Fixing permissions..."
chown -R evin:evin "${USER_HOME}/Desktop" 2>/dev/null || true
chown -R evin:evin "${USER_HOME}/.config" 2>/dev/null || true
chown -R evin:evin "${USER_HOME}/Documents" 2>/dev/null || true
chown -R evin:evin "${USER_HOME}/Downloads" 2>/dev/null || true
chown -R evin:evin "${USER_HOME}/Pictures" 2>/dev/null || true
chown -R evin:evin "${USER_HOME}/Videos" 2>/dev/null || true
chown -R evin:evin "${USER_HOME}/Music" 2>/dev/null || true

echo ""
echo "============================================"
echo "  Provisioning Complete!"
echo "============================================"
echo ""
echo "Desktop shortcuts created:"
echo "  ✓ VLC Media Player"
echo "  ✓ Firefox"
echo "  ✓ Terminal"
echo "  ✓ File Manager"
echo "  ✓ OBS Studio"
echo "  ✓ Steam"
echo "  ✓ GIMP"
echo "  ✓ Audacity"
echo "  ✓ Homelab Dashboard"
if [ -d "${USER_HOME}/host-projects" ]; then
    echo "  ✓ Projects Folder"
fi
echo ""
echo "VLC configured for Docker (hardware accel disabled)"
echo ""
echo "IMPORTANT: Refresh your VNC browser tab to see icons!"
echo "           Press F5 or click the refresh button"
echo ""
echo "============================================"
