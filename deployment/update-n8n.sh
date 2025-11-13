#!/bin/bash
set -e

# Quick n8n Update Script
# Updates n8n to the latest version

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Updating n8n to latest version..."
echo ""

# Call the generic update script
"$SCRIPT_DIR/update-service.sh" n8n

echo ""
echo "n8n is now updated and running!"
echo "Access it at: https://n8n.evindrake.net"
