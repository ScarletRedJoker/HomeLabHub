#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  🔧 FIX STUCK DATABASE MIGRATIONS${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}This script will fix the stuck migration 005 by:${NC}"
echo -e "  1. Dropping stuck enum types (serviceconnectionstatus, automationstatus, emailnotificationstatus, backupstatus)"
echo -e "  2. Dropping Google integration tables if they exist"
echo -e "  3. Re-running alembic upgrade head cleanly"
echo ""

# Check if PostgreSQL container is running
POSTGRES_CONTAINER="discord-bot-db"

if ! docker ps --filter "name=${POSTGRES_CONTAINER}" --filter "status=running" | grep -q "${POSTGRES_CONTAINER}"; then
    echo -e "${RED}✗ Error: PostgreSQL container '${POSTGRES_CONTAINER}' is not running${NC}"
    echo -e "${YELLOW}Please start the database container first${NC}"
    exit 1
fi

echo -e "${GREEN}✓ PostgreSQL container is running${NC}"
echo ""

# Detect which superuser to use (legacy container uses ticketbot, new uses postgres)
echo "Detecting PostgreSQL superuser..."
PG_SUPERUSER="ticketbot"
if docker exec "${POSTGRES_CONTAINER}" psql -U postgres -c "SELECT 1" >/dev/null 2>&1; then
    PG_SUPERUSER="postgres"
    echo -e "${GREEN}✓ Using superuser: postgres (new architecture)${NC}"
else
    echo -e "${GREEN}✓ Using superuser: ticketbot (legacy container)${NC}"
fi

# Use homelab_jarvis database
POSTGRES_DB="homelab_jarvis"

echo "Database connection details:"
echo "  Container: ${POSTGRES_CONTAINER}"
echo "  Database: ${POSTGRES_DB}"
echo "  Superuser: ${PG_SUPERUSER}"
echo ""

# Test database connection
echo "Testing database connection..."

if ! docker exec "${POSTGRES_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${POSTGRES_DB}" -c "SELECT 1;" &>/dev/null; then
    echo -e "${RED}✗ Error: Cannot connect to database${NC}"
    echo -e "${YELLOW}Please check that the database exists and is accessible${NC}"
    echo ""
    echo "Connection details:"
    echo "  Container: ${POSTGRES_CONTAINER}"
    echo "  Database: ${POSTGRES_DB}"
    echo "  Superuser: ${PG_SUPERUSER}"
    exit 1
fi

echo -e "${GREEN}✓ Database connection successful${NC}"
echo ""

# Check if migration 005 is already applied
echo "Checking migration status..."
MIGRATION_005_EXISTS=$(docker exec "${POSTGRES_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM alembic_version WHERE version_num = '005';" 2>/dev/null || echo "0")

if [ "$MIGRATION_005_EXISTS" -gt 0 ]; then
    echo -e "${YELLOW}⚠ Migration 005 is already applied in alembic_version table${NC}"
    echo "This is expected if the migration ran but failed partway through."
else
    echo -e "${GREEN}✓ Migration 005 not yet applied${NC}"
fi
echo ""

# Step 1: Drop stuck enum types
echo -e "${BOLD}Step 1: Dropping stuck enum types...${NC}"
echo ""

ENUM_TYPES=("serviceconnectionstatus" "automationstatus" "emailnotificationstatus" "backupstatus")
for enum_type in "${ENUM_TYPES[@]}"; do
    echo "  Checking enum type: $enum_type"
    ENUM_EXISTS=$(docker exec "${POSTGRES_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM pg_type WHERE typname = '$enum_type';" 2>/dev/null || echo "0")
    
    if [ "$ENUM_EXISTS" -gt 0 ]; then
        echo -e "    ${YELLOW}Found - dropping with CASCADE${NC}"
        if docker exec "${POSTGRES_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${POSTGRES_DB}" -c "DROP TYPE IF EXISTS $enum_type CASCADE;" &>/dev/null; then
            echo -e "    ${GREEN}✓ Dropped $enum_type${NC}"
        else
            echo -e "    ${RED}✗ Failed to drop $enum_type${NC}"
        fi
    else
        echo -e "    ${GREEN}✓ Not found (already clean)${NC}"
    fi
done

echo ""

# Step 2: Drop Google integration tables
echo -e "${BOLD}Step 2: Dropping Google integration tables...${NC}"
echo ""

TABLES=("drive_backups" "email_notifications" "calendar_automations" "google_service_status")
for table in "${TABLES[@]}"; do
    echo "  Checking table: $table"
    TABLE_EXISTS=$(docker exec "${POSTGRES_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${POSTGRES_DB}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table';" 2>/dev/null || echo "0")
    
    if [ "$TABLE_EXISTS" -gt 0 ]; then
        echo -e "    ${YELLOW}Found - dropping${NC}"
        if docker exec "${POSTGRES_CONTAINER}" psql -U "${PG_SUPERUSER}" -d "${POSTGRES_DB}" -c "DROP TABLE IF EXISTS $table CASCADE;" &>/dev/null; then
            echo -e "    ${GREEN}✓ Dropped $table${NC}"
        else
            echo -e "    ${RED}✗ Failed to drop $table${NC}"
        fi
    else
        echo -e "    ${GREEN}✓ Not found (already clean)${NC}"
    fi
done

echo ""

# Step 3: Remove migration 005 from alembic_version if it exists
echo -e "${BOLD}Step 3: Cleaning alembic_version table...${NC}"
echo ""

if [ "$MIGRATION_005_EXISTS" -gt 0 ]; then
    echo "  Removing migration 005 from alembic_version..."
    if psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DELETE FROM alembic_version WHERE version_num = '005';" &>/dev/null; then
        echo -e "  ${GREEN}✓ Removed migration 005 from alembic_version${NC}"
    else
        echo -e "  ${RED}✗ Failed to remove migration 005${NC}"
        echo -e "  ${YELLOW}You may need to manually delete it${NC}"
    fi
else
    echo -e "  ${GREEN}✓ Migration 005 not in alembic_version (clean)${NC}"
fi

echo ""

# Step 4: Re-run alembic upgrade head
echo -e "${BOLD}Step 4: Running alembic upgrade head...${NC}"
echo ""

# Change to dashboard directory where alembic.ini is located
cd services/dashboard || {
    echo -e "${RED}✗ Error: Cannot change to services/dashboard directory${NC}"
    exit 1
}

echo "Running: alembic upgrade head"
echo ""

if alembic upgrade head; then
    echo ""
    echo -e "${GREEN}✓ Alembic upgrade completed successfully${NC}"
else
    echo ""
    echo -e "${RED}✗ Alembic upgrade failed${NC}"
    echo -e "${YELLOW}Please check the error messages above${NC}"
    cd ../..
    exit 1
fi

cd ../..

# Step 5: Verify migration was applied
echo ""
echo -e "${BOLD}Step 5: Verifying migration status...${NC}"
echo ""

MIGRATION_005_APPLIED=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM alembic_version WHERE version_num = '005';" 2>/dev/null || echo "0")

if [ "$MIGRATION_005_APPLIED" -gt 0 ]; then
    echo -e "${GREEN}✓ Migration 005 successfully applied${NC}"
else
    echo -e "${YELLOW}⚠ Migration 005 not found in alembic_version${NC}"
    echo -e "${YELLOW}This may indicate that a newer migration is current${NC}"
fi

# Check current migration version
CURRENT_VERSION=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT version_num FROM alembic_version LIMIT 1;" 2>/dev/null || echo "unknown")
echo "Current migration version: $(echo $CURRENT_VERSION | xargs)"

echo ""

# Step 6: Verify tables were created
echo -e "${BOLD}Step 6: Verifying tables were created...${NC}"
echo ""

ALL_TABLES_EXIST=true
for table in "${TABLES[@]}"; do
    TABLE_EXISTS=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '$table';" 2>/dev/null || echo "0")
    
    if [ "$TABLE_EXISTS" -gt 0 ]; then
        echo -e "  ${GREEN}✓ Table $table exists${NC}"
    else
        echo -e "  ${RED}✗ Table $table missing${NC}"
        ALL_TABLES_EXIST=false
    fi
done

echo ""

# Final status
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  MIGRATION FIX SUMMARY${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$ALL_TABLES_EXIST" = true ] && [ "$MIGRATION_005_APPLIED" -gt 0 ]; then
    echo -e "${GREEN}✓ SUCCESS: All migrations fixed and tables created${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Restart Dashboard: docker-compose -f docker-compose.unified.yml restart homelab-dashboard"
    echo "  2. Restart Celery Worker: docker-compose -f docker-compose.unified.yml restart homelab-celery-worker"
    echo "  3. Check logs: docker-compose -f docker-compose.unified.yml logs -f homelab-dashboard"
    echo "  4. Verify AI features with: See docs/AI_FEATURES_VERIFICATION.md"
    echo ""
    exit 0
else
    echo -e "${YELLOW}⚠ PARTIAL SUCCESS: Cleanup completed but verification failed${NC}"
    echo ""
    echo "Please check:"
    echo "  - Database logs for any errors"
    echo "  - Alembic migration files in services/dashboard/alembic/versions/"
    echo "  - Run this script again if needed (it's idempotent)"
    echo ""
    exit 1
fi
