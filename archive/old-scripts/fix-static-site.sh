#!/bin/bash

# ======================================================================
# Fix Static Site (scarletredjoker.com) 403 Forbidden Error
# ======================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Fix Static Site (403 Forbidden)     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

SITE_DIR="/var/www/scarletredjoker"

# Check if directory exists
if [ ! -d "$SITE_DIR" ]; then
    echo -e "${RED}✗${NC} Directory $SITE_DIR does not exist"
    echo "Creating directory..."
    sudo mkdir -p "$SITE_DIR"
    sudo chown $USER:$USER "$SITE_DIR"
fi

# Check permissions
echo "Current permissions:"
ls -la "$SITE_DIR"
echo ""

# Fix ownership
echo "Fixing ownership..."
sudo chown -R $USER:$USER "$SITE_DIR"

# Fix permissions - make readable by all
echo "Fixing permissions..."
sudo chmod 755 "$SITE_DIR"
sudo find "$SITE_DIR" -type f -exec chmod 644 {} \;
sudo find "$SITE_DIR" -type d -exec chmod 755 {} \;

# Check for index.html
if [ ! -f "$SITE_DIR/index.html" ]; then
    echo -e "${YELLOW}⚠${NC} No index.html found"
    echo "Creating placeholder index.html..."
    
    cat > "$SITE_DIR/index.html" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scarlet Red Joker</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 20px;
            backdrop-filter: blur(10px);
        }
        h1 {
            font-size: 3.5em;
            margin: 0 0 20px 0;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
        }
        p {
            font-size: 1.5em;
            margin: 20px 0;
        }
        small {
            opacity: 0.8;
            font-size: 0.9em;
        }
        .status {
            margin-top: 30px;
            padding: 15px;
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🃏 Scarlet Red Joker</h1>
        <p>Coming Soon</p>
        <div class="status">
            <small>✓ Site is live and working!</small><br>
            <small>Upload your website files to:<br>/var/www/scarletredjoker/</small>
        </div>
    </div>
</body>
</html>
EOF
    
    chmod 644 "$SITE_DIR/index.html"
    echo -e "${GREEN}✓${NC} Created placeholder index.html"
fi

echo ""
echo "Final permissions:"
ls -la "$SITE_DIR"
echo ""

# Test with Docker container
echo "Restarting scarletredjoker-web container..."
cd /home/${USER}/contain/HomeLabHub
docker compose -f docker-compose.unified.yml restart scarletredjoker-web

echo ""
echo "Waiting for container to start..."
sleep 3

echo ""
echo -e "${GREEN}✓${NC} Static site should now be accessible!"
echo ""
echo "Test it:"
echo "  Browser: https://scarletredjoker.com"
echo "  CLI: curl -I https://scarletredjoker.com"
echo ""
echo "To upload your own site:"
echo "  1. Copy files to: $SITE_DIR/"
echo "  2. Ensure index.html exists"
echo "  3. Fix permissions: sudo chmod -R 755 $SITE_DIR"
echo ""
