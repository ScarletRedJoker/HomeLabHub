#!/bin/bash
# Nebula Command Quick Start
# For experienced users who just want to clone and run
#
# Usage: curl -fsSL https://nebula.sh/quick | bash

set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/nebula-command}"
REPO_URL="${NEBULA_REPO_URL:-https://github.com/user/nebula-command.git}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Nebula Command - Quick Start"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

command -v git >/dev/null 2>&1 || { echo "Error: git is required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: Node.js is required"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm is required"; exit 1; }

echo "→ Cloning repository..."
if [ -d "$INSTALL_DIR" ]; then
    cd "$INSTALL_DIR"
    git pull --ff-only
else
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

echo "→ Installing dependencies..."
npm ci --production 2>/dev/null || npm install --production

for service in services/dashboard-next services/discord-bot services/stream-bot; do
    if [ -d "$service" ] && [ -f "$service/package.json" ]; then
        echo "  → $(basename $service)..."
        (cd "$service" && npm ci --production 2>/dev/null || npm install --production)
    fi
done

echo "→ Setting up environment..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "  Created .env from template"
    else
        cat > .env << 'EOF'
DATABASE_URL=postgresql://user:password@localhost:5432/nebula
NODE_ENV=production
PORT=5000
EOF
        echo "  Created minimal .env"
    fi
fi

echo "→ Starting services..."
if command -v pm2 >/dev/null 2>&1; then
    pm2 start ecosystem.config.js --env production 2>/dev/null || pm2 restart all
    pm2 save
else
    echo "  Installing PM2..."
    npm install -g pm2
    pm2 start ecosystem.config.js --env production
    pm2 save
fi

echo ""
echo "✓ Nebula Command is running!"
echo ""
echo "  Dashboard: http://localhost:5000"
echo "  Setup:     http://localhost:5000/setup"
echo ""
echo "  Commands:"
echo "    pm2 status    - View services"
echo "    pm2 logs      - View logs"
echo "    pm2 stop all  - Stop services"
echo ""
