#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# HEALTH CHECK - Post-Deployment Validation
# ═══════════════════════════════════════════════════════════════
# Validates services are running correctly after deployment

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
HEALTH_CHECK_TIMEOUT=${HEALTH_CHECK_TIMEOUT:-60}
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

# Service to check (empty means all)
SERVICE="${1:-}"

echo -e "${CYAN}═══ Health Check - Starting ═══${NC}\n"

# Function to check single service health
check_service_health() {
    local service=$1
    local endpoint=$2
    local expected_codes=${3:-"200"}
    local timeout=${4:-10}
    
    echo -n "Checking $service... "
    
    # Wait for service to be running
    local retries=0
    local max_retries=$((HEALTH_CHECK_TIMEOUT / 5))
    
    while [ $retries -lt $max_retries ]; do
        if docker ps --format "{{.Names}}" | grep -q "^$service$"; then
            break
        fi
        sleep 5
        ((retries++))
    done
    
    if ! docker ps --format "{{.Names}}" | grep -q "^$service$"; then
        echo -e "${RED}✗ FAILED${NC} (container not running)"
        return 1
    fi
    
    # Check HTTP endpoint if provided
    if [ -n "$endpoint" ]; then
        local status=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null || echo "000")
        
        if echo "$expected_codes" | grep -q "$status"; then
            echo -e "${GREEN}✓ HEALTHY${NC} (HTTP $status)"
            return 0
        else
            echo -e "${RED}✗ FAILED${NC} (HTTP $status, expected: $expected_codes)"
            return 1
        fi
    else
        # Just check if container is running
        if docker ps --filter "name=$service" --filter "health=healthy" --format "{{.Names}}" | grep -q "$service"; then
            echo -e "${GREEN}✓ HEALTHY${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠ RUNNING${NC} (no health endpoint)"
            return 0
        fi
    fi
}

# Health check definitions
declare -A HEALTH_CHECKS=(
    ["homelab-postgres"]="pg_isready -U postgres"
    ["homelab-redis"]="http://localhost:6379/"
    ["homelab-minio"]="http://localhost:9000/minio/health/live"
    ["homelab-dashboard"]="http://localhost:8080/"
    ["discord-bot"]="http://localhost:4000/health|200 404"
    ["stream-bot"]="http://localhost:5000/health|200 404"
    ["caddy"]="http://localhost:80/"
    ["n8n"]="http://localhost:5678/"
)

# Run health checks
failed_checks=0
total_checks=0

if [ -z "$SERVICE" ]; then
    # Check all services
    echo "Running health checks for all services..."
    echo ""
    
    for service in "${!HEALTH_CHECKS[@]}"; do
        config="${HEALTH_CHECKS[$service]}"
        
        # Parse config
        if [[ "$config" =~ ^http ]]; then
            endpoint=$(echo "$config" | cut -d'|' -f1)
            expected_codes=$(echo "$config" | cut -d'|' -f2)
            [ "$expected_codes" = "$endpoint" ] && expected_codes="200"
        else
            endpoint=""
        fi
        
        ((total_checks++))
        if ! check_service_health "$service" "$endpoint" "$expected_codes"; then
            ((failed_checks++))
        fi
    done
else
    # Check specific service
    if [ -z "${HEALTH_CHECKS[$SERVICE]:-}" ]; then
        echo -e "${YELLOW}No health check configured for: $SERVICE${NC}"
        echo "Checking if container is running..."
        
        if docker ps --format "{{.Names}}" | grep -q "^$SERVICE$"; then
            echo -e "${GREEN}✓ $SERVICE is running${NC}"
            exit 0
        else
            echo -e "${RED}✗ $SERVICE is not running${NC}"
            exit 1
        fi
    fi
    
    config="${HEALTH_CHECKS[$SERVICE]}"
    
    # Parse config
    if [[ "$config" =~ ^http ]]; then
        endpoint=$(echo "$config" | cut -d'|' -f1)
        expected_codes=$(echo "$config" | cut -d'|' -f2)
        [ "$expected_codes" = "$endpoint" ] && expected_codes="200"
    else
        endpoint=""
    fi
    
    ((total_checks++))
    if ! check_service_health "$SERVICE" "$endpoint" "$expected_codes"; then
        ((failed_checks++))
    fi
fi

# Summary
echo ""
echo -e "${CYAN}═══ Health Check Summary ═══${NC}"
echo "Total checks: $total_checks"
echo "Passed: $((total_checks - failed_checks))"
echo "Failed: $failed_checks"

if [ $failed_checks -eq 0 ]; then
    echo -e "\n${GREEN}✅ All health checks passed${NC}"
    exit 0
else
    echo -e "\n${RED}❌ $failed_checks health check(s) failed${NC}"
    exit 1
fi
