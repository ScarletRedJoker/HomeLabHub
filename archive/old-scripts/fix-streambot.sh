#!/bin/bash

# Fix Stream Bot Vite Production Error
# This script patches the SnappleBotAI Dockerfile to properly exclude dev dependencies

set -e

STREAMBOT_DIR="/home/evin/contain/SnappleBotAI"

echo "╔═══════════════════════════════════════╗"
echo "║   Stream Bot Production Fix          ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Check if directory exists
if [ ! -d "$STREAMBOT_DIR" ]; then
    echo "❌ Error: $STREAMBOT_DIR not found"
    exit 1
fi

cd "$STREAMBOT_DIR"

# Backup existing Dockerfile
if [ -f "Dockerfile" ]; then
    echo "📦 Backing up existing Dockerfile..."
    cp Dockerfile Dockerfile.backup.$(date +%Y%m%d_%H%M%S)
fi

# Create fixed Dockerfile
echo "🔧 Creating optimized production Dockerfile..."
cat > Dockerfile << 'EOF'
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
EOF

echo "✅ Dockerfile updated"
echo ""
echo "📝 Changes made:"
echo "   - Separated build and production stages"
echo "   - Vite is only installed in build stage"
echo "   - Production stage uses --only=production flag"
echo "   - Added proper signal handling with dumb-init"
echo ""
echo "🚀 Next steps:"
echo "   1. Review the changes: diff Dockerfile.backup.* Dockerfile"
echo "   2. Rebuild and restart: cd ~/contain/HomeLabHub && ./deploy-unified.sh"
echo ""
echo "💡 Note: Your original Dockerfile is backed up as Dockerfile.backup.*"
EOF

chmod +x fix-streambot.sh
