#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=============================================="
echo "Discord Bot Production Startup Script"
echo "=============================================="
echo "Starting at: $(date)"
echo ""

cd "$BOT_DIR"

check_required_vars() {
    local missing=()
    
    if [ -z "$DISCORD_BOT_TOKEN" ]; then
        missing+=("DISCORD_BOT_TOKEN")
    fi
    if [ -z "$DISCORD_APP_ID" ]; then
        missing+=("DISCORD_APP_ID")
    fi
    if [ -z "$DISCORD_CLIENT_ID" ]; then
        missing+=("DISCORD_CLIENT_ID")
    fi
    if [ -z "$DISCORD_CLIENT_SECRET" ]; then
        missing+=("DISCORD_CLIENT_SECRET")
    fi
    if [ -z "$SESSION_SECRET" ]; then
        missing+=("SESSION_SECRET")
    fi
    if [ -z "$DATABASE_URL" ] && [ -z "$DISCORD_DATABASE_URL" ]; then
        missing+=("DATABASE_URL or DISCORD_DATABASE_URL")
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

check_database() {
    echo "Checking database connectivity..."
    
    DB_URL="${DISCORD_DATABASE_URL:-$DATABASE_URL}"
    
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
            const pool = new Pool({ connectionString: process.env.DISCORD_DATABASE_URL || process.env.DATABASE_URL });
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

check_local_ai() {
    if [ "$LOCAL_AI_ONLY" = "true" ] || [ "$LOCAL_AI_ONLY" = "1" ]; then
        echo "LOCAL_AI_ONLY mode enabled"
        
        OLLAMA_HOST="${OLLAMA_URL:-${LOCAL_AI_URL:-http://localhost:11434}}"
        echo "  Checking Ollama at: $OLLAMA_HOST"
        
        if curl -s --max-time 5 "${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; then
            echo "✓ Ollama is available"
        else
            echo "⚠ Ollama is not reachable at $OLLAMA_HOST"
            echo "  AI features will be unavailable until Ollama is started"
        fi
        
        if [ -n "$TAILSCALE_IP" ] || [ -n "$WINDOWS_VM_IP" ]; then
            TARGET_IP="${TAILSCALE_IP:-$WINDOWS_VM_IP}"
            echo "  Checking Tailscale connectivity to: $TARGET_IP"
            
            if ping -c 1 -W 2 "$TARGET_IP" > /dev/null 2>&1; then
                echo "✓ Tailscale network is reachable"
            else
                echo "⚠ Cannot reach $TARGET_IP via Tailscale"
            fi
        fi
    else
        echo "○ LOCAL_AI_ONLY mode disabled"
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
check_database
check_local_ai
check_dist_files

echo ""
echo "[Starting Discord Bot]"
echo "----------------------"
echo "NODE_ENV: ${NODE_ENV:-production}"
echo "Port: ${PORT:-4000}"
echo ""

export NODE_ENV="${NODE_ENV:-production}"

exec node dist/index.js
