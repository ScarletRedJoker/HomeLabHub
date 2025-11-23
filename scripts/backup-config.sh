#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# BACKUP CONFIG - Pre-Deployment Backup
# ═══════════════════════════════════════════════════════════════
# Creates backup of current deployment state before changes

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="$PROJECT_ROOT/var/backups/deployments"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="${1:-backup-$TIMESTAMP}"

echo -e "${CYAN}═══ Creating Pre-Deployment Backup ═══${NC}\n"

# Create backup directory
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Backup .env file
echo -n "Backing up .env... "
if [ -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env" "$BACKUP_DIR/$BACKUP_NAME/.env"
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ .env not found${NC}"
fi

# Backup docker-compose.yml
echo -n "Backing up docker-compose.yml... "
if [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
    cp "$PROJECT_ROOT/docker-compose.yml" "$BACKUP_DIR/$BACKUP_NAME/docker-compose.yml"
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗ docker-compose.yml not found${NC}"
fi

# Backup modular compose files if they exist
if [ -d "$PROJECT_ROOT/orchestration" ]; then
    echo -n "Backing up orchestration files... "
    mkdir -p "$BACKUP_DIR/$BACKUP_NAME/orchestration"
    cp -r "$PROJECT_ROOT/orchestration"/*.yml "$BACKUP_DIR/$BACKUP_NAME/orchestration/" 2>/dev/null || true
    cp "$PROJECT_ROOT/orchestration/services.yaml" "$BACKUP_DIR/$BACKUP_NAME/orchestration/" 2>/dev/null || true
    echo -e "${GREEN}✓${NC}"
fi

# Backup Caddyfile
echo -n "Backing up Caddyfile... "
if [ -f "$PROJECT_ROOT/Caddyfile" ]; then
    cp "$PROJECT_ROOT/Caddyfile" "$BACKUP_DIR/$BACKUP_NAME/Caddyfile"
    echo -e "${GREEN}✓${NC}"
fi

# Get current Docker image tags
echo -n "Saving Docker image tags... "
docker compose --project-directory "$PROJECT_ROOT" \
    --env-file "$PROJECT_ROOT/.env" \
    config --images > "$BACKUP_DIR/$BACKUP_NAME/image-tags.txt" 2>/dev/null || true
echo -e "${GREEN}✓${NC}"

# Backup databases if PostgreSQL is running
if docker ps --format "{{.Names}}" | grep -q "homelab-postgres"; then
    echo -n "Backing up databases... "
    docker exec homelab-postgres pg_dumpall -U postgres > "$BACKUP_DIR/$BACKUP_NAME/databases.sql" 2>/dev/null || true
    
    if [ -f "$BACKUP_DIR/$BACKUP_NAME/databases.sql" ]; then
        backup_size=$(du -h "$BACKUP_DIR/$BACKUP_NAME/databases.sql" | cut -f1)
        echo -e "${GREEN}✓ ($backup_size)${NC}"
    else
        echo -e "${RED}✗ Failed${NC}"
    fi
fi

# Create backup manifest
cat > "$BACKUP_DIR/$BACKUP_NAME/manifest.json" <<EOF
{
  "backup_name": "$BACKUP_NAME",
  "timestamp": "$TIMESTAMP",
  "created_at": "$(date -Iseconds)",
  "project_root": "$PROJECT_ROOT",
  "files": [
    ".env",
    "docker-compose.yml",
    "orchestration/",
    "Caddyfile",
    "image-tags.txt",
    "databases.sql"
  ],
  "version": "1.0.0"
}
EOF

# Calculate total backup size
backup_total_size=$(du -sh "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)

echo ""
echo -e "${GREEN}✅ Backup created successfully${NC}"
echo "Location: $BACKUP_DIR/$BACKUP_NAME"
echo "Size: $backup_total_size"
echo ""
echo "Restore with:"
echo "  ./scripts/rollback.sh $BACKUP_NAME"
