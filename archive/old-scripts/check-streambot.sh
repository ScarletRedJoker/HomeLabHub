#!/bin/bash
echo "=== SnappleBotAI Project Structure ==="
if [ -d "/home/evin/contain/SnappleBotAI" ]; then
    cd /home/evin/contain/SnappleBotAI
    echo "Files in root:"
    ls -la
    echo ""
    echo "=== package.json scripts ==="
    cat package.json | grep -A 10 '"scripts"' || echo "No package.json found"
    echo ""
    echo "=== Main entry point ==="
    cat package.json | grep '"main"' || echo "No main field"
    echo ""
    echo "=== Check for common directories ==="
    ls -d src client dist 2>/dev/null || echo "No src/client/dist folders"
else
    echo "ERROR: /home/evin/contain/SnappleBotAI does not exist!"
fi
