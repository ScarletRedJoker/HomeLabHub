#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "Stream Bot Production Startup Script"
echo "=============================================="
echo "Starting at: $(date)"
echo ""

cd "$BOT_DIR"

check_required_vars() {
    local missing=()
    
    if [ -z "$SESSION_SECRET" ]; then
        missing+=("SESSION_SECRET")
    fi
    if [ -z "$DATABASE_URL" ] && [ -z "$STREAMBOT_DATABASE_URL" ]; then
        missing+=("DATABASE_URL or STREAMBOT_DATABASE_URL")
    fi
    
    if [ ${#missing[@]} -gt 0 ]; then
        echo "❌ FATAL: Missing required environment variables:"
        for var in "${missing[@]}"; do
            echo "   - $var"
        done
        echo ""
        echo "Please ensure all required secrets are configured."
        exit 1
    fi
    
    echo "✓ All required environment variables present"
}

check_platform_credentials() {
    echo "Checking platform OAuth credentials..."
    
    local platforms_configured=0
    
    if [ -n "$TWITCH_CLIENT_ID" ] && [ -n "$TWITCH_CLIENT_SECRET" ]; then
        echo "  ✓ Twitch: configured"
        platforms_configured=$((platforms_configured + 1))
    else
        echo "  ○ Twitch: not configured"
    fi
    
    if [ -n "$YOUTUBE_CLIENT_ID" ] && [ -n "$YOUTUBE_CLIENT_SECRET" ]; then
        echo "  ✓ YouTube: configured"
        platforms_configured=$((platforms_configured + 1))
    else
        echo "  ○ YouTube: not configured"
    fi
    
    if [ -n "$SPOTIFY_CLIENT_ID" ] && [ -n "$SPOTIFY_CLIENT_SECRET" ]; then
        echo "  ✓ Spotify: configured"
        platforms_configured=$((platforms_configured + 1))
    else
        echo "  ○ Spotify: not configured"
    fi
    
    if [ -n "$KICK_CLIENT_ID" ] && [ -n "$KICK_CLIENT_SECRET" ]; then
        echo "  ✓ Kick: configured"
        platforms_configured=$((platforms_configured + 1))
    else
        echo "  ○ Kick: not configured (optional)"
    fi
    
    echo "  Total platforms configured: $platforms_configured"
    
    if [ $platforms_configured -eq 0 ]; then
        echo "⚠ Warning: No streaming platforms configured!"
        echo "  Users will not be able to connect accounts."
    fi
}

check_database() {
    echo "Checking database connectivity..."
    
    DB_URL="${STREAMBOT_DATABASE_URL:-$DATABASE_URL}"
    
    if command -v pg_isready &> /dev/null; then
        if pg_isready -d "$DB_URL" -t 5 &> /dev/null; then
            echo "✓ Database is ready"
            return 0
        fi
    fi
    
    MAX_RETRIES=5
    RETRY_DELAY=2
    
    for i in $(seq 1 $MAX_RETRIES); do
        echo "  Attempting database connection ($i/$MAX_RETRIES)..."
        
        if node -e "
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: process.env.STREAMBOT_DATABASE_URL || process.env.DATABASE_URL });
            pool.query('SELECT 1').then(() => {
                console.log('Connected');
                pool.end();
                process.exit(0);
            }).catch(err => {
                console.error('Failed:', err.message);
                pool.end();
                process.exit(1);
            });
        " 2>/dev/null; then
            echo "✓ Database connection successful"
            return 0
        fi
        
        if [ $i -lt $MAX_RETRIES ]; then
            echo "  Retrying in ${RETRY_DELAY}s..."
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))
        fi
    done
    
    echo "⚠ Could not verify database connection, continuing anyway..."
    return 0
}

check_optional_services() {
    echo "Checking optional services..."
    
    if [ -n "$OPENAI_API_KEY" ]; then
        echo "  ✓ OpenAI: configured"
    else
        echo "  ○ OpenAI: not configured (facts/AI features disabled)"
    fi
    
    if [ -n "$DISCORD_WEBHOOK_URL" ]; then
        echo "  ✓ Discord Webhook: configured"
    else
        echo "  ○ Discord Webhook: not configured"
    fi
    
    if [ -n "$OBS_WEBSOCKET_URL" ]; then
        echo "  ✓ OBS WebSocket: configured"
    else
        echo "  ○ OBS WebSocket: not configured"
    fi
}

check_dist_files() {
    if [ ! -f "dist/index.js" ]; then
        echo "❌ Production build not found (dist/index.js missing)"
        echo "   Run 'npm run build' first"
        exit 1
    fi
    echo "✓ Production build exists"
}

echo "[Pre-flight Checks]"
echo "-------------------"

check_required_vars
check_platform_credentials
check_database
check_optional_services
check_dist_files

echo ""
echo "[Starting Stream Bot]"
echo "---------------------"
echo "NODE_ENV: ${NODE_ENV:-production}"
echo "Port: ${PORT:-5000}"
echo ""

export NODE_ENV="${NODE_ENV:-production}"

exec node dist/index.js
