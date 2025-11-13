#!/bin/bash
# Deployment script for stream notifications feature + fixes

echo "🚀 Homelab Deployment - Stream Notifications + VNC Fix"
echo "======================================================"
echo ""

# Step 1: Grant developer access
echo "Step 1: Granting developer access..."
docker exec -it discord-bot-db psql -U ticketbot -d ticketbot -f /tmp/grant-developer-access.sql

# Step 2: Rebuild and deploy all services
echo ""
echo "Step 2: Rebuilding services..."
cd /home/evin/contain/HomeLabHub
./homelab-manager.sh

# After homelab-manager.sh completes, continue with VNC fix
echo ""
echo "Step 3: Checking VNC service..."
docker ps | grep vnc-desktop

echo ""
echo "✅ Deployment steps:"
echo "1. ✅ Developer access granted (Discord ID: 368610753885896705)"
echo "2. Run ./homelab-manager.sh and select option 3 (Rebuild & Deploy)"
echo "3. Access developer dashboard at: https://bot.rig-city.com/dev"
echo "4. Access stream notifications at: https://bot.rig-city.com (Streams tab)"
echo ""
echo "📋 Next: VNC troubleshooting if 502 persists"
