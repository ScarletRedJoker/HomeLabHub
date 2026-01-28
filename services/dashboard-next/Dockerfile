# Multi-stage build for Next.js dashboard
FROM node:20-alpine AS base

# Install all dependencies (including devDependencies for build)
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (devDependencies needed for TypeScript build)
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=8192"

# Build the application - skip type checking for faster builds (done in CI)
RUN SKIP_TYPE_CHECK=true npm run build

# Prune dev dependencies after build for smaller production image
RUN npm prune --omit=dev

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install wget for healthcheck, ffmpeg and python for yt-dlp
RUN apk add --no-cache wget ffmpeg python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets with proper ownership
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create directories for generated content with proper permissions
RUN mkdir -p /app/public/generated-images /app/public/generated-videos && \
    chown -R nextjs:nodejs /app/public

# Create directories for settings and data that might not have volume mounts
RUN mkdir -p /app/data /opt/homelab/studio-projects && \
    chown -R nextjs:nodejs /app/data /opt/homelab/studio-projects

USER nextjs

EXPOSE 5000

ENV PORT=5000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
