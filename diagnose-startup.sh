#!/bin/bash

# Dashboard Startup Diagnostics Script
# This helps identify why the dashboard is failing to start

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "════════════════════════════════════════════════════════════════"
echo "  Dashboard Startup Diagnostics"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "  Run: cp .env.example .env"
    echo "  Then fill in all YOUR_* placeholders"
    exit 1
fi
echo -e "${GREEN}✓ .env file exists${NC}"

# Critical environment variables that dashboard needs
echo -e "\n${BLUE}Checking Critical Environment Variables:${NC}"

check_var() {
    local var_name=$1
    local var_value=$(grep "^${var_name}=" .env 2>/dev/null | cut -d'=' -f2)
    
    if [ -z "$var_value" ]; then
        echo -e "${RED}✗ $var_name is MISSING${NC}"
        return 1
    elif [[ "$var_value" == *"YOUR_"* ]] || [[ "$var_value" == *"PLACEHOLDER"* ]]; then
        echo -e "${YELLOW}⚠ $var_name is still placeholder: $var_value${NC}"
        return 1
    else
        echo -e "${GREEN}✓ $var_name is set${NC}"
        return 0
    fi
}

failed=0

# Core credentials
check_var "WEB_USERNAME" || ((failed++))
check_var "WEB_PASSWORD" || ((failed++))
check_var "SESSION_SECRET" || ((failed++))
check_var "DASHBOARD_API_KEY" || ((failed++))
check_var "POSTGRES_PASSWORD" || ((failed++))

# Database passwords
check_var "DISCORD_DB_PASSWORD" || ((failed++))
check_var "STREAMBOT_DB_PASSWORD" || ((failed++))
check_var "JARVIS_DB_PASSWORD" || ((failed++))

# OpenAI (critical for AI features)
check_var "OPENAI_API_KEY" || ((failed++))

echo ""
echo "════════════════════════════════════════════════════════════════"

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}✓ All critical environment variables are configured!${NC}"
    echo ""
    echo "Environment is OK. If dashboard still fails, check logs:"
    echo "  docker logs homelab-dashboard"
    echo ""
else
    echo -e "${RED}✗ Found $failed misconfigured environment variable(s)${NC}"
    echo ""
    echo -e "${YELLOW}How to fix:${NC}"
    echo "  1. Edit .env file: nano .env"
    echo "  2. Replace all YOUR_* placeholders with actual values"
    echo "  3. Generate secrets with: openssl rand -hex 32"
    echo ""
    echo -e "${YELLOW}Quick fix for common issues:${NC}"
    echo "  # Set web credentials (use your actual password!)"
    echo "  sed -i 's/WEB_PASSWORD=YOUR_WEB_PASSWORD_HERE/WEB_PASSWORD=Brs=2729/' .env"
    echo ""
    echo "  # Generate random secrets"
    echo "  SESSION_SECRET=\$(openssl rand -hex 32)"
    echo "  DASHBOARD_API_KEY=\$(openssl rand -hex 32)"
    echo "  sed -i \"s/SESSION_SECRET=YOUR_SESSION_SECRET_HEX_64/SESSION_SECRET=\$SESSION_SECRET/\" .env"
    echo "  sed -i \"s/DASHBOARD_API_KEY=YOUR_DASHBOARD_API_KEY_HEX_64/DASHBOARD_API_KEY=\$DASHBOARD_API_KEY/\" .env"
    echo ""
fi

# Check if containers are running
echo -e "${BLUE}Container Status:${NC}"
if command -v docker &> /dev/null; then
    if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(homelab-dashboard|homelab-postgres|homelab-redis)" || true; then
        :
    else
        echo -e "${YELLOW}⚠ No homelab containers running${NC}"
        echo "  Start with: ./bootstrap-homelab.sh"
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${BLUE}Next Steps:${NC}"
if [ $failed -eq 0 ]; then
    echo "  1. Check dashboard logs: docker logs homelab-dashboard"
    echo "  2. Try restarting: docker restart homelab-dashboard"
else
    echo "  1. Fix .env file as shown above"
    echo "  2. Run bootstrap again: ./bootstrap-homelab.sh"
fi
echo "════════════════════════════════════════════════════════════════"
