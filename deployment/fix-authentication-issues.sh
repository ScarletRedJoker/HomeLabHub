#!/bin/bash

#######################################
# Fix Authentication for Code-Server & VNC Desktop
# This script ensures both services have proper passwords configured
#######################################

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔐 Fixing Code-Server & VNC Authentication"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# Change to HomeLabHub directory
cd /home/${SERVICE_USER:-evin}/contain/HomeLabHub

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found!"
    echo "   Run: ./homelab-manager.sh → Option 9 (Generate .env)"
    exit 1
fi

echo "Step 1: Checking environment variables..."
echo

# Check VNC_PASSWORD
if ! grep -q "^VNC_PASSWORD=" .env || grep -q "^VNC_PASSWORD=your_vnc_password_here" .env; then
    echo "⚠️  VNC_PASSWORD not set or using default value"
    echo "   Please update VNC_PASSWORD in .env file"
    VNC_NEEDS_CONFIG=true
else
    echo "✓ VNC_PASSWORD is configured"
    VNC_NEEDS_CONFIG=false
fi

# Check CODE_SERVER_PASSWORD
if ! grep -q "^CODE_SERVER_PASSWORD=" .env || grep -q "^CODE_SERVER_PASSWORD=your_code_server_password_here" .env; then
    echo "⚠️  CODE_SERVER_PASSWORD not set or using default value"
    echo "   Please update CODE_SERVER_PASSWORD in .env file"
    CODE_NEEDS_CONFIG=true
else
    echo "✓ CODE_SERVER_PASSWORD is configured"
    CODE_NEEDS_CONFIG=false
fi

echo

# If both are configured, proceed with restart
if [ "$VNC_NEEDS_CONFIG" = false ] && [ "$CODE_NEEDS_CONFIG" = false ]; then
    echo "Step 2: Both passwords configured! Restarting services..."
    echo
    
    # Restart VNC Desktop
    echo "→ Restarting vnc-desktop..."
    docker-compose -f docker-compose.unified.yml restart vnc-desktop
    
    # Restart Code-Server
    echo "→ Restarting code-server..."
    docker-compose -f docker-compose.unified.yml restart code-server
    
    echo
    echo "Step 3: Waiting for services to start (30 seconds)..."
    sleep 30
    
    echo
    echo "Step 4: Checking service status..."
    echo
    
    # Check VNC logs
    echo "━━━ VNC Desktop Status ━━━"
    if docker logs vnc-desktop 2>&1 | tail -20 | grep -q "x11vnc.*RUNNING\|VNC password setup complete"; then
        echo "✅ VNC Desktop is running correctly"
    else
        echo "⚠️  VNC Desktop may have issues. Checking logs..."
        docker logs vnc-desktop --tail 30 | grep -i "vnc\|password\|error" || echo "No specific errors found"
    fi
    echo
    
    # Check Code-Server logs
    echo "━━━ Code-Server Status ━━━"
    if docker logs code-server 2>&1 | tail -20 | grep -q "HTTP server listening\|Server listening"; then
        echo "✅ Code-Server is running correctly"
    else
        echo "⚠️  Code-Server may have issues. Checking logs..."
        docker logs code-server --tail 30 | grep -i "error\|listening" || echo "No specific errors found"
    fi
    echo
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ✅ Authentication Fix Complete!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "Access your services:"
    echo "  → VNC Desktop: https://vnc.evindrake.net"
    echo "     Password: (value of VNC_PASSWORD from .env)"
    echo
    echo "  → Code-Server: https://code.evindrake.net"
    echo "     Password: (value of CODE_SERVER_PASSWORD from .env)"
    echo
    
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  ⚠️  ACTION REQUIRED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo
    echo "Please configure the following in your .env file:"
    echo
    
    if [ "$VNC_NEEDS_CONFIG" = true ]; then
        echo "1. Set VNC_PASSWORD:"
        echo "   VNC_PASSWORD=YourSecurePassword123"
        echo
    fi
    
    if [ "$CODE_NEEDS_CONFIG" = true ]; then
        echo "2. Set CODE_SERVER_PASSWORD:"
        echo "   CODE_SERVER_PASSWORD=YourCodeServerPassword123"
        echo
    fi
    
    echo "Then run this script again:"
    echo "   ./deployment/fix-authentication-issues.sh"
    echo
    
    exit 1
fi
