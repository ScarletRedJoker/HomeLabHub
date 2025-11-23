#!/bin/bash

# Quick fix script to replace placeholder in JARVIS_DATABASE_URL
# with actual password from JARVIS_DB_PASSWORD

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "════════════════════════════════════════════════════════════════"
echo "  Database URL Quick Fix"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ ! -f .env ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    exit 1
fi

# Get the current password
JARVIS_PASS=$(grep "^JARVIS_DB_PASSWORD=" .env | cut -d'=' -f2)

if [ -z "$JARVIS_PASS" ]; then
    echo -e "${RED}✗ JARVIS_DB_PASSWORD not set in .env${NC}"
    exit 1
fi

if [[ "$JARVIS_PASS" == *"YOUR_"* ]]; then
    echo -e "${RED}✗ JARVIS_DB_PASSWORD is still a placeholder${NC}"
    echo "  Edit .env and set JARVIS_DB_PASSWORD to your actual password"
    exit 1
fi

echo -e "${GREEN}✓ Found JARVIS_DB_PASSWORD${NC}"

# Check current DATABASE_URL
CURRENT_URL=$(grep "^JARVIS_DATABASE_URL=" .env | cut -d'=' -f2)

echo -e "\nCurrent database URL:"
echo -e "${YELLOW}$CURRENT_URL${NC}"

# Build correct URL
CORRECT_URL="postgresql://jarvis:${JARVIS_PASS}@homelab-postgres:5432/homelab_jarvis"

if [ "$CURRENT_URL" == "$CORRECT_URL" ]; then
    echo -e "\n${GREEN}✓ Database URL is already correct!${NC}"
    exit 0
fi

# Create backup
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
echo -e "${GREEN}✓ Created backup of .env${NC}"

# Update the URL
sed -i "s|^JARVIS_DATABASE_URL=.*|JARVIS_DATABASE_URL=${CORRECT_URL}|" .env

echo -e "\n${GREEN}✓ Updated JARVIS_DATABASE_URL${NC}"
echo -e "\nNew database URL:"
echo -e "${GREEN}postgresql://jarvis:***@homelab-postgres:5432/homelab_jarvis${NC}"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo -e "${GREEN}  Fix Applied Successfully!${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Run: ./bootstrap-homelab.sh"
echo "  2. Watch logs: docker logs -f homelab-dashboard"
echo ""
