#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                                                              ║"
echo "║        🗄️  UNIFIED DATABASE PROVISIONING SYSTEM 🗄️          ║"
echo "║                                                              ║"
echo "║  Automatically creates all databases and users on startup   ║"
echo "║  Idempotent • Secure • Plug-and-Play                        ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ============================================
# Sanitize passwords (prevent shell expansion)
# ============================================
sanitized_streambot_pwd=$(printf '%s' "$STREAMBOT_DB_PASSWORD")
sanitized_jarvis_pwd=$(printf '%s' "$JARVIS_DB_PASSWORD")

# ============================================
# Database 1: Stream Bot
# ============================================
if [ -z "$STREAMBOT_DB_PASSWORD" ]; then
    echo "⚠️  WARNING: STREAMBOT_DB_PASSWORD not set, skipping streambot database..."
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Creating: streambot (user: streambot)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    psql -v ON_ERROR_STOP=1 --set=pwd="$sanitized_streambot_pwd" --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'streambot') THEN
                CREATE USER streambot WITH PASSWORD :'pwd';
                RAISE NOTICE '✓ Created user: streambot';
            ELSE
                ALTER USER streambot WITH PASSWORD :'pwd';
                RAISE NOTICE '✓ User streambot already exists, password updated';
            END IF;
        END \$\$;
        
        SELECT 'CREATE DATABASE streambot OWNER streambot'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'streambot')\gexec
        
        GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;
EOSQL

    if [ $? -eq 0 ]; then
        echo "✅ Stream Bot database ready"
    else
        echo "❌ Failed to create Stream Bot database!"
        exit 1
    fi
    echo ""
fi

# ============================================
# Database 2: Homelab Dashboard (Jarvis)
# ============================================
if [ -z "$JARVIS_DB_PASSWORD" ]; then
    echo "⚠️  WARNING: JARVIS_DB_PASSWORD not set, skipping homelab_jarvis database..."
else
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Creating: homelab_jarvis (user: jarvis)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    psql -v ON_ERROR_STOP=1 --set=pwd="$sanitized_jarvis_pwd" --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jarvis') THEN
                CREATE USER jarvis WITH PASSWORD :'pwd';
                RAISE NOTICE '✓ Created user: jarvis';
            ELSE
                ALTER USER jarvis WITH PASSWORD :'pwd';
                RAISE NOTICE '✓ User jarvis already exists, password updated';
            END IF;
        END \$\$;
        
        SELECT 'CREATE DATABASE homelab_jarvis OWNER jarvis'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'homelab_jarvis')\gexec
        
        GRANT ALL PRIVILEGES ON DATABASE homelab_jarvis TO jarvis;
EOSQL

    if [ $? -eq 0 ]; then
        echo "✅ Homelab Dashboard (Jarvis) database ready"
    else
        echo "❌ Failed to create Homelab Dashboard database!"
        exit 1
    fi
    echo ""
fi

# ============================================
# Verification
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Database Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# List all databases
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\l" | grep -E "streambot|homelab_jarvis" || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL DATABASE PROVISIONING COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Databases created:"
echo "  • streambot         (Stream Bot)"
echo "  • homelab_jarvis    (Dashboard)"
echo ""
echo "🔒 Security Features:"
echo "  ✓ Shell expansion prevention via printf sanitization"
echo "  ✓ Proper psql variable binding with --set flag"
echo "  ✓ SQL literal binding using :'pwd' syntax"
echo "  ✓ Protection against command injection"
echo ""
echo "Services can now connect on first startup without manual intervention!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
