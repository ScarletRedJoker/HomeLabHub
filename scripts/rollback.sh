#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# ROLLBACK - Restore Previous Deployment
# ═══════════════════════════════════════════════════════════════
# Rolls back to a previous deployment state

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="$PROJECT_ROOT/var/backups/deployments"
SERVICE="${1:-}"
BACKUP_NAME="${2:-}"

show_usage() {
    echo "Usage: $0 [service|all] [backup_name]"
    echo ""
    echo "Examples:"
    echo "  $0 all                    # Rollback all services to last backup"
    echo "  $0 dashboard              # Rollback dashboard service only"
    echo "  $0 all backup-20251123    # Rollback to specific backup"
    echo ""
    echo "Available backups:"
    if [ -d "$BACKUP_DIR" ]; then
        ls -1t "$BACKUP_DIR" | head -5
    else
        echo "  (none found)"
    fi
}

if [ -z "$SERVICE" ]; then
    show_usage
    exit 1
fi

# Find backup to restore
if [ -z "$BACKUP_NAME" ]; then
    # Get most recent backup
    BACKUP_NAME=$(ls -1t "$BACKUP_DIR" 2>/dev/null | head -1 || echo "")
    
    if [ -z "$BACKUP_NAME" ]; then
        echo -e "${RED}No backups found in $BACKUP_DIR${NC}"
        exit 1
    fi
    
    echo -e "${YELLOW}Using most recent backup: $BACKUP_NAME${NC}"
fi

BACKUP_PATH="$BACKUP_DIR/$BACKUP_NAME"

if [ ! -d "$BACKUP_PATH" ]; then
    echo -e "${RED}Backup not found: $BACKUP_PATH${NC}"
    show_usage
    exit 1
fi

echo -e "${CYAN}═══ Rollback Starting ═══${NC}\n"
echo "Backup: $BACKUP_NAME"
echo "Target: $SERVICE"
echo ""

# Confirm rollback
read -p "This will restore from backup. Continue? (y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled"
    exit 0
fi

# Create backup of current state before rollback
echo -e "\n${CYAN}Creating safety backup of current state...${NC}"
"$PROJECT_ROOT/scripts/backup-config.sh" "pre-rollback-$(date +%Y%m%d-%H%M%S)"

# Restore configuration files
echo -e "\n${CYAN}Restoring configuration files...${NC}"

if [ -f "$BACKUP_PATH/.env" ]; then
    echo -n "Restoring .env... "
    cp "$BACKUP_PATH/.env" "$PROJECT_ROOT/.env"
    echo -e "${GREEN}✓${NC}"
fi

if [ -f "$BACKUP_PATH/docker-compose.yml" ]; then
    echo -n "Restoring docker-compose.yml... "
    cp "$BACKUP_PATH/docker-compose.yml" "$PROJECT_ROOT/docker-compose.yml"
    echo -e "${GREEN}✓${NC}"
fi

if [ -d "$BACKUP_PATH/orchestration" ]; then
    echo -n "Restoring orchestration files... "
    cp -r "$BACKUP_PATH/orchestration"/* "$PROJECT_ROOT/orchestration/" 2>/dev/null || true
    echo -e "${GREEN}✓${NC}"
fi

if [ -f "$BACKUP_PATH/Caddyfile" ]; then
    echo -n "Restoring Caddyfile... "
    cp "$BACKUP_PATH/Caddyfile" "$PROJECT_ROOT/Caddyfile"
    echo -e "${GREEN}✓${NC}"
fi

# Restart services
echo -e "\n${CYAN}Restarting services...${NC}"

cd "$PROJECT_ROOT"

if [ "$SERVICE" = "all" ]; then
    # Restart all services
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        down
    
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        up -d
else
    # Restart specific service
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        up -d --force-recreate "$SERVICE"
fi

# Wait for services to stabilize
echo -e "\n${CYAN}Waiting for services to stabilize...${NC}"
sleep 10

# Run health checks
echo -e "\n${CYAN}Running health checks...${NC}"
if "$PROJECT_ROOT/scripts/health-check.sh" "$SERVICE"; then
    echo -e "\n${GREEN}✅ Rollback completed successfully${NC}"
    
    # Update deployment history
    if command -v jq &> /dev/null; then
        HISTORY_FILE="$PROJECT_ROOT/.deployments/history.json"
        if [ -f "$HISTORY_FILE" ]; then
            jq --arg service "$SERVICE" \
               --arg backup "$BACKUP_NAME" \
               --arg timestamp "$(date -Iseconds)" \
               '.deployments += [{
                   "action": "rollback",
                   "service": $service,
                   "backup": $backup,
                   "timestamp": $timestamp,
                   "status": "success"
               }] | .last_deployment = .deployments[-1]' \
               "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
        fi
    fi
    
    exit 0
else
    echo -e "\n${RED}❌ Rollback completed but health checks failed${NC}"
    echo "Check logs with: ./homelab logs $SERVICE"
    exit 1
fi
