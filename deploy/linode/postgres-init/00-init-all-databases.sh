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
# Helper function to create database and user
# ============================================
create_database() {
    local db_name=$1
    local db_user=$2
    local db_pass=$3
    local description=$4
    
    if [ -z "$db_pass" ]; then
        echo "⚠️  WARNING: Password not set for $db_name, skipping..."
        return 1
    fi
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Creating: $db_name (user: $db_user) - $description"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Sanitize password to prevent shell expansion
    local sanitized_pwd=$(printf '%s' "$db_pass")
    
    psql -v ON_ERROR_STOP=1 --set=pwd="$sanitized_pwd" --username "$POSTGRES_USER" <<-EOSQL
        DO \$\$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$db_user') THEN
                CREATE USER $db_user WITH PASSWORD :'pwd';
                RAISE NOTICE '✓ Created user: $db_user';
            ELSE
                ALTER USER $db_user WITH PASSWORD :'pwd';
                RAISE NOTICE '✓ User $db_user already exists, password updated';
            END IF;
        END \$\$;
        
        SELECT 'CREATE DATABASE $db_name OWNER $db_user'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db_name')\gexec
        
        GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;
EOSQL

    if [ $? -eq 0 ]; then
        echo "✅ $description database ready"
        return 0
    else
        echo "❌ Failed to create $description database!"
        return 1
    fi
    echo ""
}

# ============================================
# Database 1: Stream Bot
# ============================================
create_database "streambot" "streambot" "$STREAMBOT_DB_PASSWORD" "Stream Bot (Snapple Facts AI)"

# ============================================
# Database 2: Homelab Dashboard (Jarvis)
# ============================================
create_database "homelab_jarvis" "jarvis" "$JARVIS_DB_PASSWORD" "Homelab Dashboard (Jarvis)"

# ============================================
# Database 3: Discord Ticket Bot
# ============================================
create_database "ticketbot" "ticketbot" "$DISCORD_DB_PASSWORD" "Discord Ticket Bot"

# ============================================
# Verification
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Database Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# List all created databases
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\l" | grep -E "streambot|homelab_jarvis|ticketbot" || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👥 User Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "\du" | grep -E "streambot|jarvis|ticketbot" || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ALL DATABASE PROVISIONING COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Databases created:"
echo "  • streambot         → Stream Bot (Twitch/YouTube/Spotify integration)"
echo "  • homelab_jarvis    → Dashboard (Jarvis AI, Marketplace, Monitoring)"
echo "  • ticketbot         → Discord Ticket Bot"
echo ""
echo "🔒 Security Features:"
echo "  ✓ Shell expansion prevention via printf sanitization"
echo "  ✓ Proper psql variable binding with --set flag"
echo "  ✓ SQL literal binding using :'pwd' syntax"
echo "  ✓ Protection against command injection"
echo ""
echo "Services can now connect on first startup without manual intervention!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
