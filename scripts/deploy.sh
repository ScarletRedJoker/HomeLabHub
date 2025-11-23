#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# DEPLOY - Production Deployment Script
# ═══════════════════════════════════════════════════════════════
# Safely deploys services with automatic rollback on failure

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
SERVICE="${1:-all}"
NO_BACKUP="${NO_BACKUP:-false}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"

echo -e "${CYAN}═══ Deployment Starting ═══${NC}\n"
echo "Service: $SERVICE"
echo "Auto-rollback: $AUTO_ROLLBACK"
echo ""

# Create backup unless disabled
BACKUP_NAME=""
if [ "$NO_BACKUP" != "true" ]; then
    echo -e "${CYAN}Creating pre-deployment backup...${NC}"
    BACKUP_NAME="pre-deploy-$(date +%Y%m%d-%H%M%S)"
    "$PROJECT_ROOT/scripts/backup-config.sh" "$BACKUP_NAME"
    echo ""
fi

# Build images
echo -e "${CYAN}Building Docker images...${NC}"
cd "$PROJECT_ROOT"

if [ "$SERVICE" = "all" ]; then
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        build
else
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        build "$SERVICE"
fi

echo -e "${GREEN}✓ Build completed${NC}\n"

# Deploy
echo -e "${CYAN}Deploying services...${NC}"

if [ "$SERVICE" = "all" ]; then
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        up -d
else
    docker compose --project-directory "$PROJECT_ROOT" \
        --env-file "$PROJECT_ROOT/.env" \
        up -d "$SERVICE"
fi

echo -e "${GREEN}✓ Deployment completed${NC}\n"

# Wait for services to stabilize
echo -e "${CYAN}Waiting for services to stabilize...${NC}"
sleep 10

# Run health checks
echo -e "\n${CYAN}Running post-deployment health checks...${NC}"
if "$PROJECT_ROOT/scripts/health-check.sh" "$SERVICE"; then
    echo -e "\n${GREEN}✅ Deployment successful${NC}"
    
    # Update deployment history
    if command -v jq &> /dev/null; then
        HISTORY_FILE="$PROJECT_ROOT/.deployments/history.json"
        
        # Get current image tags
        IMAGE_TAGS=$(docker compose --project-directory "$PROJECT_ROOT" \
            --env-file "$PROJECT_ROOT/.env" \
            images --format json 2>/dev/null || echo "[]")
        
        jq --arg service "$SERVICE" \
           --arg timestamp "$(date -Iseconds)" \
           --arg backup "$BACKUP_NAME" \
           --argjson images "$IMAGE_TAGS" \
           '.deployments += [{
               "id": ("deploy-" + ($timestamp | gsub("[^0-9]"; ""))),
               "action": "deploy",
               "service": $service,
               "timestamp": $timestamp,
               "backup": $backup,
               "images": $images,
               "status": "success",
               "health_check": "passed"
           }] | 
           .deployments = (.deployments | .[-10:]) |
           .last_deployment = .deployments[-1]' \
           "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
    fi
    
    exit 0
else
    echo -e "\n${RED}❌ Deployment health checks failed${NC}"
    
    # Automatic rollback if enabled
    if [ "$AUTO_ROLLBACK" = "true" ] && [ -n "$BACKUP_NAME" ]; then
        echo -e "\n${YELLOW}Initiating automatic rollback...${NC}"
        "$PROJECT_ROOT/scripts/rollback.sh" "$SERVICE" "$BACKUP_NAME"
        
        # Update deployment history with failure
        if command -v jq &> /dev/null; then
            HISTORY_FILE="$PROJECT_ROOT/.deployments/history.json"
            jq --arg service "$SERVICE" \
               --arg timestamp "$(date -Iseconds)" \
               --arg backup "$BACKUP_NAME" \
               '.deployments += [{
                   "id": ("deploy-" + ($timestamp | gsub("[^0-9]"; ""))),
                   "action": "deploy",
                   "service": $service,
                   "timestamp": $timestamp,
                   "backup": $backup,
                   "status": "failed",
                   "health_check": "failed",
                   "rollback": "automatic"
               }] | .deployments = (.deployments | .[-10:])' \
               "$HISTORY_FILE" > "${HISTORY_FILE}.tmp" && mv "${HISTORY_FILE}.tmp" "$HISTORY_FILE"
        fi
    else
        echo -e "${YELLOW}Auto-rollback disabled. Manual intervention required.${NC}"
        
        if [ -n "$BACKUP_NAME" ]; then
            echo -e "\nRollback manually with:"
            echo "  ./homelab rollback $SERVICE $BACKUP_NAME"
        fi
    fi
    
    exit 1
fi
