#!/bin/bash
# Commit and push docker-compose.yml fixes to Ubuntu server

echo "Committing fixes..."

# Stage the changes
git add docker-compose.yml fix-ubuntu-services.sh UBUNTU_FIX_INSTRUCTIONS.md

# Commit
git commit -m "Fix docker-compose.yml: remove unified.yml references after cleanup"

# Push to GitHub
git push origin main

echo "✅ Fixes pushed to GitHub!"
echo ""
echo "════════════════════════════════════════════════"
echo "  Next: On your Ubuntu server, run:"
echo "  cd /home/evin/contain/HomeLabHub"
echo "  ./fix-ubuntu-services.sh"
echo "════════════════════════════════════════════════"
