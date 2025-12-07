#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOMELAB_DIR="$(dirname "$SCRIPT_DIR")"
NAS_MOUNT="${NAS_MOUNT:-/mnt/nas/networkshare}"

log_ok() { echo -e "\033[0;32m[OK]\033[0m $*"; }
log_warn() { echo -e "\033[0;33m[WARN]\033[0m $*"; }
log_error() { echo -e "\033[0;31m[ERROR]\033[0m $*"; }
log_info() { echo -e "\033[0;34m[INFO]\033[0m $*"; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  NAS Desktop Integration Setup"
echo "═══════════════════════════════════════════════════════════════"
echo ""

if [[ ! -d "$NAS_MOUNT" ]]; then
    log_error "NAS not mounted at $NAS_MOUNT"
    echo "       Run: sudo ./deploy/local/scripts/setup-nas-mounts.sh"
    exit 1
fi

log_ok "NAS mount found at $NAS_MOUNT"
echo ""

echo "━━━ Installing Desktop Shortcuts ━━━"
mkdir -p ~/.local/share/applications

for desktop_file in "$SCRIPT_DIR/desktop-entries"/nas-*.desktop; do
    if [ -f "$desktop_file" ]; then
        filename=$(basename "$desktop_file")
        cp "$desktop_file" ~/.local/share/applications/"$filename"
        log_ok "Installed: $filename"
    fi
done

if command -v update-desktop-database &> /dev/null; then
    update-desktop-database ~/.local/share/applications/ 2>/dev/null || true
fi

echo ""
echo "━━━ Adding Nautilus Bookmarks ━━━"

BOOKMARKS_FILE="${HOME}/.config/gtk-3.0/bookmarks"
mkdir -p "$(dirname "$BOOKMARKS_FILE")"
touch "$BOOKMARKS_FILE"

add_bookmark() {
    local path="$1"
    local name="$2"
    local uri="file://$path"
    
    if ! grep -qF "$uri" "$BOOKMARKS_FILE" 2>/dev/null; then
        echo "$uri $name" >> "$BOOKMARKS_FILE"
        log_ok "Bookmark added: $name"
    else
        log_info "Bookmark exists: $name"
    fi
}

add_bookmark "$NAS_MOUNT" "NAS Media"
add_bookmark "$NAS_MOUNT/video" "NAS Video"
add_bookmark "$NAS_MOUNT/music" "NAS Music"
add_bookmark "$NAS_MOUNT/photo" "NAS Photos"
add_bookmark "$NAS_MOUNT/games" "NAS Games"

echo ""
echo "━━━ Creating Desktop Icons (Optional) ━━━"

DESKTOP_DIR="${HOME}/Desktop"
if [[ -d "$DESKTOP_DIR" ]]; then
    cp "$SCRIPT_DIR/desktop-entries/nas-media.desktop" "$DESKTOP_DIR/" 2>/dev/null || true
    chmod +x "$DESKTOP_DIR/nas-media.desktop" 2>/dev/null || true
    gio set "$DESKTOP_DIR/nas-media.desktop" metadata::trusted true 2>/dev/null || true
    log_ok "Desktop icon created: NAS Media"
else
    log_info "No ~/Desktop folder found, skipping desktop icon"
fi

echo ""
echo "━━━ NAS Quick Access Summary ━━━"
echo ""
echo "  Your NAS folders are now accessible:"
echo ""
echo "    Files App Sidebar:"
echo "      - NAS Media    → $NAS_MOUNT"
echo "      - NAS Video    → $NAS_MOUNT/video (Plex movies/shows)"
echo "      - NAS Music    → $NAS_MOUNT/music"
echo "      - NAS Photos   → $NAS_MOUNT/photo"
echo "      - NAS Games    → $NAS_MOUNT/games"
echo ""
echo "    Application Menu:"
echo "      Search for 'NAS' to find quick launchers"
echo ""
echo "    Command Line:"
echo "      cd $NAS_MOUNT"
echo "      nautilus $NAS_MOUNT"
echo ""
echo "  Drag and drop files directly to/from these folders!"
echo ""
log_ok "NAS desktop integration complete!"
