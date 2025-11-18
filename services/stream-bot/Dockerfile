# Multi-stage build for production-ready StreamBot container
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application (frontend + backend)
# Frontend builds to: dist/public/
# Backend builds to: dist/index.js
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

# Copy package files and install production dependencies
# Note: We need drizzle-kit for migrations, so we can't use --only=production
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy built application from builder stage
# Both frontend (dist/public/) and backend (dist/index.js) are in dist/
COPY --from=builder --chown=streambot:nodejs /app/dist ./dist

# Copy connect-pg-simple table.sql to dist/ for session store
COPY --from=builder --chown=streambot:nodejs /app/node_modules/connect-pg-simple/table.sql ./dist/table.sql

# Copy drizzle configuration and migrations for database setup
COPY --chown=streambot:nodejs drizzle.config.ts ./
COPY --chown=streambot:nodejs migrations ./migrations

# Copy shared schema
COPY --chown=streambot:nodejs shared ./shared

# Copy docker entrypoint script and make it executable
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown streambot:nodejs docker-entrypoint.sh

# Switch to non-root user
USER streambot

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly and run migrations before starting
ENTRYPOINT ["dumb-init", "--", "./docker-entrypoint.sh"]

# Start the application (uses compiled output from build stage)
CMD ["node", "dist/index.js"]
