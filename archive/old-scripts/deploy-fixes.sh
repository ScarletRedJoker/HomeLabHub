#!/bin/bash

# Complete Fix Deployment Script
# Run this on your Ubuntu homelab server

set -e

echo "╔═══════════════════════════════════════╗"
echo "║   Homelab Fixes Deployment            ║"
echo "║   Stream Bot + Static Site            ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

STREAMBOT_DIR="/home/evin/contain/SnappleBotAI"
STATIC_DIR="/var/www/scarletredjoker"

# ============================================
# FIX 1: Stream Bot Dockerfile
# ============================================
echo -e "${YELLOW}[1/3] Fixing Stream Bot Dockerfile...${NC}"

if [ ! -d "$STREAMBOT_DIR" ]; then
    echo -e "${RED}❌ Error: $STREAMBOT_DIR not found${NC}"
    exit 1
fi

cd "$STREAMBOT_DIR"

# Backup existing Dockerfile
if [ -f "Dockerfile" ]; then
    echo "📦 Backing up existing Dockerfile..."
    cp Dockerfile "Dockerfile.backup.$(date +%Y%m%d_%H%M%S)"
fi

# Create optimized Dockerfile
echo "🔧 Creating optimized Dockerfile..."
cat > Dockerfile << 'DOCKERFILEEOF'
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application (this needs vite as dev dependency)
RUN npm run build && \
    echo "Build completed. Checking output..." && \
    ls -la dist/ && \
    echo "Build verification successful!"

# Production stage
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S streambot -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ONLY production dependencies (excludes vite and other dev tools)
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder --chown=streambot:nodejs /app/dist ./dist

# Copy any other necessary config files
COPY --chown=streambot:nodejs drizzle.config.ts ./

# Create logs directory
RUN mkdir -p /app/logs && chown streambot:nodejs /app/logs

# Switch to non-root user
USER streambot

# Expose port
EXPOSE 5000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
DOCKERFILEEOF

echo -e "${GREEN}✅ Stream Bot Dockerfile fixed${NC}"

# ============================================
# FIX 2: Static Website
# ============================================
echo ""
echo -e "${YELLOW}[2/3] Setting up Static Website...${NC}"

# Create directory
echo "📁 Creating website directory..."
sudo mkdir -p "$STATIC_DIR"
sudo chown -R evin:evin "$STATIC_DIR"

# Create index.html
echo "📝 Creating index.html..."
cat > "$STATIC_DIR/index.html" << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scarlet Red Joker</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        
        .container {
            text-align: center;
            padding: 40px;
            max-width: 900px;
        }
        
        h1 {
            font-size: 4rem;
            margin-bottom: 20px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            animation: fadeIn 1s ease-in;
        }
        
        p {
            font-size: 1.5rem;
            margin-bottom: 40px;
            opacity: 0.9;
            animation: fadeIn 1.5s ease-in;
        }
        
        .links {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
            animation: fadeIn 2s ease-in;
        }
        
        .link-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 30px 20px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            text-decoration: none;
            color: white;
            transition: all 0.3s ease;
        }
        
        .link-card:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-5px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        }
        
        .link-card h3 {
            font-size: 1.5rem;
            margin-bottom: 10px;
        }
        
        .link-card p {
            font-size: 1rem;
            margin: 0;
            opacity: 0.8;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .footer {
            margin-top: 40px;
            font-size: 0.9rem;
            opacity: 0.7;
        }
        
        @media (max-width: 768px) {
            h1 {
                font-size: 2.5rem;
            }
            
            p {
                font-size: 1.2rem;
            }
            
            .links {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🃏 Scarlet Red Joker</h1>
        <p>Welcome to my homelab services</p>
        
        <div class="links">
            <a href="https://bot.rig-city.com" class="link-card">
                <h3>🎫 Discord Bot</h3>
                <p>Ticket Support System</p>
            </a>
            
            <a href="https://stream.rig-city.com" class="link-card">
                <h3>🎮 Stream Bot</h3>
                <p>AI Snapple Facts</p>
            </a>
            
            <a href="https://plex.evindrake.net" class="link-card">
                <h3>🎬 Plex Server</h3>
                <p>Media Streaming</p>
            </a>
            
            <a href="https://n8n.evindrake.net" class="link-card">
                <h3>🔄 n8n Automation</h3>
                <p>Workflow Platform</p>
            </a>
            
            <a href="https://host.evindrake.net" class="link-card">
                <h3>🖥️ Homelab Dashboard</h3>
                <p>Central Control</p>
            </a>
            
            <a href="https://vnc.evindrake.net" class="link-card">
                <h3>🖱️ Remote Desktop</h3>
                <p>VNC Access</p>
            </a>
        </div>
        
        <div class="footer">
            <p>🚀 Powered by Ubuntu 25.10 | Managed with Docker & Caddy</p>
            <p>🔒 Secured with Let's Encrypt SSL</p>
        </div>
    </div>
</body>
</html>
HTMLEOF

# Create 404 page
echo "📝 Creating 404.html..."
cat > "$STATIC_DIR/404.html" << 'HTML404EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Page Not Found</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            text-align: center;
            padding: 20px;
        }
        
        h1 {
            font-size: 8rem;
            margin-bottom: 20px;
        }
        
        h2 {
            font-size: 2rem;
            margin-bottom: 20px;
        }
        
        a {
            color: white;
            text-decoration: none;
            padding: 15px 30px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            display: inline-block;
            margin-top: 20px;
            transition: all 0.3s ease;
        }
        
        a:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div>
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/">← Back to Home</a>
    </div>
</body>
</html>
HTML404EOF

# Set permissions
echo "🔒 Setting permissions..."
chmod -R 755 "$STATIC_DIR"

echo -e "${GREEN}✅ Static website created${NC}"

# ============================================
# FIX 3: Redeploy Services
# ============================================
echo ""
echo -e "${YELLOW}[3/3] Redeploying services...${NC}"

cd /home/evin/contain/HomeLabHub

# Rebuild stream-bot with new Dockerfile
echo "🔨 Rebuilding stream-bot..."
docker compose -f docker-compose.unified.yml build --no-cache stream-bot

# Restart stream-bot
echo "🔄 Restarting stream-bot..."
docker compose -f docker-compose.unified.yml up -d stream-bot

# Restart static site to pick up new files
echo "🔄 Restarting static website..."
docker compose -f docker-compose.unified.yml restart scarletredjoker-web

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ All Fixes Applied Successfully  ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo "📊 Checking container status..."
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "stream-bot|scarletredjoker"

echo ""
echo "🔍 Verifying fixes..."
echo ""
echo "Stream Bot:"
echo "  - Check logs: docker logs stream-bot --tail 50"
echo "  - Should NOT see 'Cannot find package vite' error"
echo ""
echo "Static Website:"
echo "  - Visit: https://scarletredjoker.com"
echo "  - Should see landing page with service links"
echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
