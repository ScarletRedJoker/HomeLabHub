#!/bin/bash
# Install AI Health Monitor as systemd service
# Run on Ubuntu host to enable automatic AI status polling

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Installing Nebula AI Health Monitor ==="

# Copy service and timer files
sudo cp "$SCRIPT_DIR/nebula-ai-health.service" /etc/systemd/system/
sudo cp "$SCRIPT_DIR/nebula-ai-health.timer" /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start timer
sudo systemctl enable nebula-ai-health.timer
sudo systemctl start nebula-ai-health.timer

# Run once immediately
sudo systemctl start nebula-ai-health.service

echo ""
echo "=== Installation Complete ==="
echo ""
echo "Timer Status:"
sudo systemctl status nebula-ai-health.timer --no-pager
echo ""
echo "Commands:"
echo "  View status:    sudo systemctl status nebula-ai-health.timer"
echo "  View logs:      sudo journalctl -u nebula-ai-health.service -f"
echo "  Run now:        sudo systemctl start nebula-ai-health.service"
echo "  Stop:           sudo systemctl stop nebula-ai-health.timer"
echo "  Disable:        sudo systemctl disable nebula-ai-health.timer"
