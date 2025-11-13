#!/bin/bash

# Fix scarletredjoker.com volume mount to point to correct location

echo "🔧 Restarting scarletredjoker-web with correct volume mount..."
cd /home/evin/contain/HomeLabHub
docker compose -f docker-compose.unified.yml up -d scarletredjoker-web

echo ""
echo "✅ Fixed! Your actual website from /home/evin/contain/scarletredjoker.com/public_html"
echo "   is now being served at https://scarletredjoker.com"
echo ""
echo "🔍 Verify:"
echo "   curl -I https://scarletredjoker.com"
