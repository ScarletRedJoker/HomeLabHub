#!/bin/bash
# Install automatic sync from Replit using systemd timer
# This will check for Replit changes every 5 minutes and auto-deploy

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SYNC_SCRIPT="$PROJECT_DIR/deployment/sync-from-replit.sh"

echo "Installing automatic Replit sync..."

# Make sync script executable
chmod +x "$SYNC_SCRIPT"

# Create systemd service
sudo tee /etc/systemd/system/replit-sync.service > /dev/null <<EOF
[Unit]
Description=Sync and deploy changes from Replit
After=network.target docker.service

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=$SYNC_SCRIPT
StandardOutput=journal
StandardError=journal
EOF

# Create systemd timer (runs every 5 minutes)
sudo tee /etc/systemd/system/replit-sync.timer > /dev/null <<EOF
[Unit]
Description=Auto-sync from Replit every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

# Enable and start the timer
echo "Enabling systemd timer..."
sudo systemctl daemon-reload
sudo systemctl enable replit-sync.timer
sudo systemctl start replit-sync.timer

# Create log and state directories
mkdir -p "$PROJECT_DIR/var/log" "$PROJECT_DIR/var/state"

echo ""
echo "✅ Auto-sync installed successfully!"
echo ""
echo "The system will now check for Replit changes every 5 minutes and auto-deploy."
echo ""
echo "Sync logs:  $PROJECT_DIR/var/log/replit-sync.log"
echo "State file: $PROJECT_DIR/var/state/.last_sync_commit"
echo ""
echo "Useful commands:"
echo "  - Check sync status:   sudo systemctl status replit-sync.timer"
echo "  - View sync logs:      journalctl -u replit-sync.service -f"
echo "  - View detailed log:   tail -f $PROJECT_DIR/var/log/replit-sync.log"
echo "  - Manual sync now:     $SYNC_SCRIPT"
echo "  - Disable auto-sync:   sudo systemctl stop replit-sync.timer && sudo systemctl disable replit-sync.timer"
echo ""
