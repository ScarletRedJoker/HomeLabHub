#!/bin/bash
# ============================================
# Generate Production .env from Replit Environment
# ============================================
# This script converts Replit environment variables to a production .env file
# Usage: ./generate-production-env.sh > .env.production

set -e

echo "# ============================================"
echo "# PRODUCTION ENVIRONMENT CONFIGURATION (Ubuntu Server)"
echo "# ============================================"
echo "# Auto-generated from Replit environment on $(date)"
echo "# All database URLs are fully resolved with NO \${VAR} expansion"
echo "# ============================================"
echo ""

echo "# ============================================"
echo "# CORE CONFIGURATION"
echo "# ============================================"
echo "SERVICE_USER=${SERVICE_USER:-evin}"
echo "LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}"
echo "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
echo "WEB_USERNAME=${WEB_USERNAME:-admin}"
echo "WEB_PASSWORD=${WEB_PASSWORD}"
echo "DISCORD_DB_PASSWORD=${DISCORD_DB_PASSWORD}"
echo "STREAMBOT_DB_PASSWORD=${STREAMBOT_DB_PASSWORD}"
echo "JARVIS_DB_PASSWORD=${JARVIS_DB_PASSWORD}"
echo ""

echo "# Flask Configuration"
echo "FLASK_ENV=production"
echo "FLASK_DEBUG=false"
echo "SECRET_KEY=${SECRET_KEY}"
echo ""

echo "# Dashboard Security"
echo "DASHBOARD_API_KEY=${DASHBOARD_API_KEY}"
echo "SESSION_SECRET=${SESSION_SECRET}"
echo "ENABLE_SCRIPT_EXECUTION=false"
echo ""

echo "# Server Configuration"
echo "FLASK_HOST=0.0.0.0"
echo "FLASK_PORT=5000"
echo ""

echo "# ============================================"
echo "# AI CONFIGURATION (Self-managed OpenAI API Key)"
echo "# ============================================"
echo "OPENAI_API_KEY=${OPENAI_API_KEY}"
echo "OPENAI_BASE_URL=https://api.openai.com/v1"
echo "AI_MODEL=gpt-3.5-turbo"
echo ""

echo "# ============================================"
echo "# JARVIS AI DATABASE (Fully Resolved)"
echo "# ============================================"
echo "JARVIS_DATABASE_URL=postgresql://jarvis:${JARVIS_DB_PASSWORD}@homelab-postgres:5432/homelab_jarvis"
echo ""

echo "# ============================================"
echo "# STREAM BOT (Fully Resolved)"
echo "# ============================================"
echo "STREAMBOT_DATABASE_URL=postgresql://streambot:${STREAMBOT_DB_PASSWORD}@homelab-postgres:5432/streambot"
echo "STREAMBOT_SESSION_SECRET=${STREAMBOT_SESSION_SECRET}"
echo "STREAMBOT_OPENAI_BASE_URL=https://api.openai.com/v1"
echo "STREAMBOT_NODE_ENV=production"
echo "STREAMBOT_PORT=5000"
echo "STREAMBOT_OPENAI_API_KEY=${OPENAI_API_KEY}"
echo "STREAMBOT_FACT_MODEL=gpt-3.5-turbo"
echo ""

echo "# Twitch (Optional)"
if [ -n "$TWITCH_CLIENT_ID" ]; then
  echo "TWITCH_CLIENT_ID=${TWITCH_CLIENT_ID}"
  echo "TWITCH_CLIENT_SECRET=${TWITCH_CLIENT_SECRET}"
  echo "TWITCH_CHANNEL=${TWITCH_CHANNEL}"
fi
echo ""

echo "# YouTube (Manual OAuth - Production)"
if [ -n "$YOUTUBE_CLIENT_ID" ]; then
  echo "YOUTUBE_CLIENT_ID=${YOUTUBE_CLIENT_ID}"
  echo "YOUTUBE_CLIENT_SECRET=${YOUTUBE_CLIENT_SECRET}"
  echo "YOUTUBE_SIGNIN_CALLBACK_URL=${YOUTUBE_SIGNIN_CALLBACK_URL:-https://stream.yourdomain.com/api/auth/youtube/callback}"
fi
echo ""

echo "# Kick (Optional)"
if [ -n "$KICK_CLIENT_ID" ]; then
  echo "KICK_CLIENT_ID=${KICK_CLIENT_ID}"
  echo "KICK_CLIENT_SECRET=${KICK_CLIENT_SECRET}"
fi
echo ""

echo "# ============================================"
echo "# DISCORD BOT (Fully Resolved)"
echo "# ============================================"
echo "DISCORD_DATABASE_URL=postgresql://ticketbot:${DISCORD_DB_PASSWORD}@homelab-postgres:5432/ticketbot"
echo "DISCORD_DB_PASSWORD=${DISCORD_DB_PASSWORD}"
echo "DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}"
echo "DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID}"
echo "DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET}"
echo "DISCORD_APP_ID=${DISCORD_APP_ID}"
echo "VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID}"
echo "DISCORD_SESSION_SECRET=${DISCORD_SESSION_SECRET}"
echo "VITE_CUSTOM_WS_URL=${VITE_CUSTOM_WS_URL:-wss://bot.yourdomain.com/ws}"
echo "RESET_DB=false"
echo "DISCORD_DB_USER=ticketbot_user"
echo "STREAMBOT_DB_USER=streambot_user"
echo "JARVIS_DB_USER=jarvis"
echo ""

echo "# ============================================"
echo "# PLEX MEDIA SERVER"
echo "# ============================================"
echo "PLEX_URL=${PLEX_URL}"
echo "PLEX_TOKEN=${PLEX_TOKEN}"
if [ -n "$PLEX_CLAIM" ]; then
  echo "PLEX_CLAIM=${PLEX_CLAIM}"
fi
echo ""

echo "# ============================================"
echo "# MINIO OBJECT STORAGE"
echo "# ============================================"
echo "MINIO_ROOT_USER=${MINIO_ROOT_USER:-admin}"
echo "MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}"
echo "MINIO_ENDPOINT=minio:9000"
echo "MINIO_USE_SSL=false"
echo "MINIO_BUCKET_NAME=${MINIO_BUCKET_NAME:-homelab-uploads}"
echo ""

echo "# ============================================"
echo "# VNC REMOTE DESKTOP"
echo "# ============================================"
echo "VNC_PASSWORD=${VNC_PASSWORD}"
echo "VNC_USER=${VNC_USER:-evin}"
echo "VNC_USER_PASSWORD=${VNC_USER_PASSWORD}"
echo "NOVNC_ENABLE=true"
echo ""

echo "# ============================================"
echo "# CODE SERVER"
echo "# ============================================"
echo "CODE_SERVER_PASSWORD=${CODE_SERVER_PASSWORD}"
echo ""

echo "# ============================================"
echo "# GOOGLE SERVICES"
echo "# ============================================"
echo "GOOGLE_TOKEN_CACHE_TTL=${GOOGLE_TOKEN_CACHE_TTL:-300}"
echo "CALENDAR_POLL_INTERVAL_MINUTES=${CALENDAR_POLL_INTERVAL_MINUTES:-5}"
echo "CALENDAR_LEAD_TIME_MINUTES=${CALENDAR_LEAD_TIME_MINUTES:-10}"
echo "GMAIL_FROM_NAME=${GMAIL_FROM_NAME:-Homelab Dashboard}"
echo "GMAIL_DEFAULT_RECIPIENT=${GMAIL_DEFAULT_RECIPIENT}"
echo "DRIVE_BACKUP_FOLDER_NAME=${DRIVE_BACKUP_FOLDER_NAME:-Homelab Backups}"
echo "DRIVE_BACKUP_RETENTION_DAYS=${DRIVE_BACKUP_RETENTION_DAYS:-30}"
echo "DRIVE_AUTO_BACKUP_ENABLED=${DRIVE_AUTO_BACKUP_ENABLED:-false}"
echo ""

echo "# ============================================"
echo "# HOME ASSISTANT (Optional)"
echo "# ============================================"
echo "HOME_ASSISTANT_URL=${HOME_ASSISTANT_URL:-http://homeassistant:8123}"
if [ -n "$HOME_ASSISTANT_TOKEN" ]; then
  echo "HOME_ASSISTANT_TOKEN=${HOME_ASSISTANT_TOKEN}"
fi
echo "HOME_ASSISTANT_VERIFY_SSL=False"
echo ""

echo "# ============================================"
echo "# SERVICE URLS"
echo "# ============================================"
echo "DISCORD_BOT_URL=${DISCORD_BOT_URL}"
echo "N8N_URL=${N8N_URL}"
echo "STATIC_SITE_URL=${STATIC_SITE_URL}"
echo ""

echo "# ============================================"
echo "# REDIS"
echo "# ============================================"
echo "REDIS_URL=redis://redis:6379/0"
echo ""

echo "# ============================================"
echo "# Generation Complete!"
echo "# ============================================"
echo "# Remember to:"
echo "#   1. Review all values before using in production"
echo "#   2. Store this file securely on your Ubuntu server"
echo "#   3. Never commit this file to version control"
echo "# ============================================"
