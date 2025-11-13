#!/bin/bash
# Fix VNC Desktop - Run this on Ubuntu server to provision desktop icons

set -e

echo "============================================"
echo "  VNC Desktop Icon Fix"
echo "============================================"
echo ""

cd /home/evin/contain/HomeLabHub || {
    echo "ERROR: Project directory not found"
    exit 1
}

echo "Step 1: Copy provisioning script into container..."
docker cp services/vnc-desktop/provision-desktop.sh vnc-desktop:/tmp/provision-desktop.sh

echo "Step 2: Make script executable..."
docker exec vnc-desktop chmod +x /tmp/provision-desktop.sh

echo "Step 3: Run provisioning script as root..."
docker exec vnc-desktop /tmp/provision-desktop.sh

echo ""
echo "============================================"
echo "  Desktop Icons Provisioned!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Refresh your VNC browser tab (F5)"
echo "  2. You should see these icons on desktop:"
echo "     - VLC Media Player"
echo "     - Firefox"
echo "     - Terminal"
echo "     - File Manager"
echo "     - OBS Studio"
echo "     - Steam"
echo "     - GIMP"
echo "     - Audacity"
echo "     - Homelab Dashboard"
echo ""
echo "  3. Test VLC:"
echo "     - Double-click VLC icon"
echo "     - Should launch without crashing"
echo ""
echo "If icons still don't appear:"
echo "  - Restart VNC container:"
echo "    docker restart vnc-desktop"
echo "  - Wait 30 seconds, then refresh browser"
echo ""
echo "============================================"
