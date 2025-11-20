#!/bin/bash
# Diagnose database configuration
set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     🔬 DATABASE DIAGNOSTIC                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo -e "${BOLD}Databases:${NC}"
docker exec homelab-postgres psql -U postgres -c "\l" | grep -E "streambot|ticketbot|homelab_jarvis|Name"

echo ""
echo -e "${BOLD}Users:${NC}"
docker exec homelab-postgres psql -U postgres -c "\du" | grep -E "streambot|ticketbot|jarvis|Role name"

echo ""
echo -e "${BOLD}Database Ownership:${NC}"
docker exec homelab-postgres psql -U postgres -c "SELECT datname, pg_catalog.pg_get_userbyid(datdba) as owner FROM pg_database WHERE datname IN ('streambot', 'ticketbot', 'homelab_jarvis');"

echo ""
echo -e "${BOLD}Schema Ownership (streambot DB):${NC}"
docker exec homelab-postgres psql -U postgres -d streambot -c "SELECT schema_name, schema_owner FROM information_schema.schemata WHERE schema_name = 'public';"

echo ""
echo -e "${BOLD}Schema Ownership (ticketbot DB):${NC}"
docker exec homelab-postgres psql -U postgres -d ticketbot -c "SELECT schema_name, schema_owner FROM information_schema.schemata WHERE schema_name = 'public';"

echo ""
echo -e "${BOLD}Schema Ownership (homelab_jarvis DB):${NC}"
docker exec homelab-postgres psql -U postgres -d homelab_jarvis -c "SELECT schema_name, schema_owner FROM information_schema.schemata WHERE schema_name = 'public';"

echo ""
echo -e "${BOLD}Permissions on public schema (streambot DB):${NC}"
docker exec homelab-postgres psql -U postgres -d streambot -c "\dp" | grep public || echo "No grants found"

echo ""
