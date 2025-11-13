# Multi-stage build for production Discord Ticket Bot
FROM node:20-slim AS builder

# Install system dependencies for building
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --include=dev

# Copy application source
COPY . .

# Build the application - must succeed or fail the build
RUN npm run build

# Production stage
FROM node:20-slim

# Install runtime dependencies including:
# - ffmpeg for music bot and voice support
# - yt-dlp (via pip for latest version) for YouTube video downloading
# - postgresql-client for database connectivity checks (pg_isready and psql)
# - curl for health checks
# - Other required libraries
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libgif7 \
    libsodium23 \
    libc6 \
    postgresql-client \
    curl \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir --upgrade pip --break-system-packages \
    && python3 -m pip install --no-cache-dir --upgrade --force-reinstall yt-dlp --break-system-packages \
    && which psql || (echo "ERROR: psql not found after installing postgresql-client" && exit 1)

WORKDIR /app

# Set yt-dlp environment variables BEFORE npm install
# This prevents @distube/yt-dlp from downloading its own binary
ENV YTDLP_DISABLE_DOWNLOAD=true
ENV YTDLP_DIR=/usr/local/bin
ENV YTDLP_FILENAME=yt-dlp

# Copy package files
COPY package*.json ./

# Install production dependencies + drizzle-kit for migrations
RUN npm ci --omit=dev && npm install drizzle-kit --save-dev

# Copy built application from builder
# dist contains:
#   - index.js (main bundled server)
#   - vite.js (dev-only, not loaded in production)
#   - static.js (production static file serving)
#   - public/ (frontend static files)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/shared ./shared

# Copy entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Create directories for assets and logs
RUN mkdir -p attached_assets logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=5000

# Expose the application port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:5000/health || exit 1

# Use entrypoint for initialization
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application
CMD ["npm", "start"]
