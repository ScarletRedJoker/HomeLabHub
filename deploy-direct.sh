#!/bin/bash
# Direct deployment script - bypasses GitHub
# Usage: ./deploy-direct.sh <your-server-ip-or-hostname>

if [ -z "$1" ]; then
    echo "Usage: ./deploy-direct.sh <server-address>"
    echo "Example: ./deploy-direct.sh evin@192.168.1.100"
    exit 1
fi

SERVER="$1"
REMOTE_PATH="/home/evin/contain/HomeLabHub"

echo "🚀 Direct Deploy to Ubuntu Server"
echo "=================================="
echo ""
echo "Target: $SERVER:$REMOTE_PATH"
echo ""

# Create list of files to transfer
echo "📦 Copying files..."

rsync -avz --progress \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.env' \
    . "$SERVER:$REMOTE_PATH/"

echo ""
echo "✅ Files transferred!"
echo ""
echo "Next steps on your server:"
echo "  ssh $SERVER"
echo "  cd $REMOTE_PATH"
echo "  ./homelab-manager.sh"
echo ""
