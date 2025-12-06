#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# HomeLabHub Quick Install - Downloads and runs the full TUI installer
# ═══════════════════════════════════════════════════════════════════════════
#
# Usage:
#   curl -fsSL https://install.homelabhub.io | sudo bash
#   OR
#   wget -qO- https://install.homelabhub.io | sudo bash
#
# Environment Variables:
#   HOMELAB_INSTALL_DIR  - Installation directory (default: /opt/homelab)
#   HOMELAB_BRANCH       - Git branch to use (default: main)
#   HOMELAB_SKIP_VERIFY  - Skip checksum verification (default: false)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
cat << 'BANNER'
    ╦ ╦┌─┐┌┬┐┌─┐╦  ┌─┐┌┐    ╦ ╦┬ ┬┌┐ 
    ╠═╣│ ││││├┤ ║  ├─┤├┴┐   ╠═╣│ │├┴┐
    ╩ ╩└─┘┴ ┴└─┘╩═╝┴ ┴└─┘   ╩ ╩└─┘└─┘
       Quick Installer Bootstrap
BANNER
echo -e "${NC}"

# Check root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}Error: This script requires root privileges.${NC}"
    echo "Please run: curl -fsSL ... | sudo bash"
    exit 1
fi

# Configuration
INSTALL_DIR="${HOMELAB_INSTALL_DIR:-/opt/homelab}"
BRANCH="${HOMELAB_BRANCH:-main}"
REPO="ScarletRedJoker/HomeLabHub"
INSTALLER_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/deploy/installer/homelab-installer.sh"

echo -e "${CYAN}Downloading installer...${NC}"

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Download installer
if command -v curl &>/dev/null; then
    curl -fsSL "$INSTALLER_URL" -o "$TEMP_DIR/homelab-installer.sh"
elif command -v wget &>/dev/null; then
    wget -qO "$TEMP_DIR/homelab-installer.sh" "$INSTALLER_URL"
else
    echo -e "${RED}Error: Neither curl nor wget found. Please install one of them.${NC}"
    exit 1
fi

# Make executable
chmod +x "$TEMP_DIR/homelab-installer.sh"

echo -e "${GREEN}Starting interactive installer...${NC}"
echo ""

# Run installer
exec "$TEMP_DIR/homelab-installer.sh"
