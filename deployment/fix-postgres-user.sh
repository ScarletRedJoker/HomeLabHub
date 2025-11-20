#!/bin/bash

# Fix PostgreSQL user mismatch - create 'postgres' superuser if it doesn't exist
# This handles cases where the container was initialized with a different POSTGRES_USER

set -e

echo "================================================"
echo "  Fixing PostgreSQL User Configuration"
echo "================================================"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Auto-detect which superuser exists
echo "Detecting existing superuser..."

if docker exec homelab-postgres psql -U postgres -c "SELECT 1;" &>/dev/null; then
    SUPERUSER="postgres"
    echo -e "${GREEN}✓${NC} postgres user already exists and works"
    exit 0
elif docker exec homelab-postgres psql -U ticketbot -c "SELECT 1;" &>/dev/null; then
    SUPERUSER="ticketbot"
    echo -e "${YELLOW}⚠${NC} Found legacy superuser: ticketbot"
else
    echo -e "${RED}✗${NC} Could not connect to PostgreSQL with any known superuser"
    exit 1
fi

echo ""
echo "Creating 'postgres' superuser role..."

# Create postgres superuser if it doesn't exist
docker exec homelab-postgres psql -U "$SUPERUSER" -c "
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
        CREATE ROLE postgres WITH SUPERUSER CREATEDB CREATEROLE LOGIN PASSWORD '${POSTGRES_PASSWORD:-postgres}';
        RAISE NOTICE 'Created postgres superuser role';
    ELSE
        -- Ensure postgres has superuser privileges
        ALTER ROLE postgres WITH SUPERUSER CREATEDB CREATEROLE LOGIN;
        RAISE NOTICE 'Updated postgres role privileges';
    END IF;
END
\$\$;
" 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} postgres superuser is now available"
    echo ""
    echo "Testing connection with postgres user..."
    if docker exec homelab-postgres psql -U postgres -c "SELECT version();" &>/dev/null; then
        echo -e "${GREEN}✓${NC} Connection test successful"
    else
        echo -e "${RED}✗${NC} Connection test failed"
        exit 1
    fi
else
    echo -e "${RED}✗${NC} Failed to create postgres user"
    exit 1
fi

echo ""
echo "================================================"
echo "  ✅ PostgreSQL user configuration fixed!"
echo "================================================"
echo ""
echo "You can now connect with: docker exec homelab-postgres psql -U postgres"
