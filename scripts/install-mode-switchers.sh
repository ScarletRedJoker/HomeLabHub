#!/bin/bash
# Install Mode Switching Scripts for Moonlight/WinApps
# Run this on your Ubuntu host to set up desktop shortcuts

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOMELAB_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Installing Mode Switching Scripts ==="

# Create local bin directory if it doesn't exist
mkdir -p ~/.local/bin

# Create symlinks to wrapper scripts
ln -sf "$SCRIPT_DIR/moonlight-wrapper.sh" ~/.local/bin/moonlight-gaming
ln -sf "$SCRIPT_DIR/winapps-wrapper.sh" ~/.local/bin/winapps-mode
ln -sf "$SCRIPT_DIR/gaming-mode.sh" ~/.local/bin/gaming-mode
ln -sf "$SCRIPT_DIR/productivity-mode.sh" ~/.local/bin/productivity-mode

# Make sure ~/.local/bin is in PATH
if ! grep -q 'local/bin' ~/.bashrc 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
    echo "Added ~/.local/bin to PATH in .bashrc"
fi

# Install desktop entries
mkdir -p ~/.local/share/applications
for desktop_file in "$SCRIPT_DIR/desktop-entries"/*.desktop; do
    if [ -f "$desktop_file" ]; then
        # Update paths in desktop files
        filename=$(basename "$desktop_file")
        sed "s|/opt/homelab/HomeLabHub|$HOMELAB_DIR|g" "$desktop_file" > ~/.local/share/applications/"$filename"
        echo "Installed: $filename"
    fi
done

# Update desktop database
if command -v update-desktop-database &> /dev/null; then
    update-desktop-database ~/.local/share/applications/
fi

echo ""
echo "━━━ Installing NAS Desktop Integration ━━━"
if [ -x "$SCRIPT_DIR/setup-nas-desktop.sh" ]; then
    "$SCRIPT_DIR/setup-nas-desktop.sh" || echo "NAS setup skipped (NAS may not be mounted)"
else
    echo "NAS desktop setup script not found, skipping..."
fi

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Available commands:"
echo "  moonlight-gaming    - Launch Moonlight with Gaming Mode"
echo "  winapps-mode <app>  - Launch WinApps app with Productivity Mode"
echo "  gaming-mode         - Switch to Gaming Mode (Sunshine)"
echo "  productivity-mode   - Switch to Productivity Mode (RDP)"
echo ""
echo "Desktop shortcuts installed to ~/.local/share/applications/"
echo ""
echo "NAS folders available in Files sidebar for drag-and-drop!"
echo ""
echo "Reload your shell or run: source ~/.bashrc"
