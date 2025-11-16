#!/bin/bash

# ======================================================================
# COMPREHENSIVE SERVICE VERIFICATION SCRIPT
# ======================================================================
# This script verifies ALL homelab services and provides detailed status
# Run after fixing secrets and rebuilding containers
# ======================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

echo "======================================================================="
echo "HOMELAB SERVICE VERIFICATION - COMPREHENSIVE CHECK"
echo "======================================================================="
echo ""

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}======================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}======================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_CHECKS++))
    ((TOTAL_CHECKS++))
}

print_failure() {
    echo -e "${RED}❌ $1${NC}"
    echo -e "${YELLOW}   → $2${NC}"
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ======================================================================
# PHASE 1: DOCKER ENVIRONMENT CHECK
# ======================================================================
print_header "PHASE 1: Docker Environment"

# Check if Docker is running
if docker info &> /dev/null; then
    print_success "Docker daemon is running"
else
    print_failure "Docker daemon not running" "Run: sudo systemctl start docker"
    exit 1
fi

# Check if docker-compose.unified.yml exists
if [ -f "docker-compose.unified.yml" ]; then
    print_success "docker-compose.unified.yml exists"
else
    print_failure "docker-compose.unified.yml not found" "Ensure you're in the project root directory"
    exit 1
fi

# ======================================================================
# PHASE 2: ENVIRONMENT SECRETS CHECK
# ======================================================================
print_header "PHASE 2: Environment Secrets"

# Check if .env file exists
if [ -f ".env" ]; then
    print_success ".env file exists"
    
    # Critical secrets check
    critical_secrets=(
        "DISCORD_DB_PASSWORD"
        "STREAMBOT_DB_PASSWORD"
        "JARVIS_DB_PASSWORD"
        "DISCORD_SESSION_SECRET"
        "STREAMBOT_SESSION_SECRET"
        "DISCORD_BOT_TOKEN"
        "DISCORD_CLIENT_ID"
        "DISCORD_CLIENT_SECRET"
    )
    
    missing_secrets=()
    
    for secret in "${critical_secrets[@]}"; do
        if grep -q "^${secret}=.\+" .env 2>/dev/null; then
            print_success "${secret} is set"
        else
            print_failure "${secret} is MISSING or EMPTY" "Add to .env file - see MISSING_SECRETS_CRITICAL.md"
            missing_secrets+=("$secret")
        fi
    done
    
    if [ ${#missing_secrets[@]} -gt 0 ]; then
        echo ""
        print_warning "CRITICAL: ${#missing_secrets[@]} secrets are missing!"
        print_info "Services will FAIL without these secrets"
        print_info "See MISSING_SECRETS_CRITICAL.md for instructions"
        echo ""
    fi
else
    print_failure ".env file not found" "Copy .env.example to .env and fill in values"
    print_info "Run: cp .env.example .env"
    exit 1
fi

# ======================================================================
# PHASE 3: CONTAINER STATUS CHECK
# ======================================================================
print_header "PHASE 3: Container Status"

# Get list of expected containers
expected_containers=(
    "caddy"
    "homelab-redis"
    "homelab-minio"
    "discord-bot-db"
    "discord-bot"
    "stream-bot"
    "homelab-dashboard"
    "homelab-dashboard-demo"
    "rig-city-site"
    "scarletredjoker-web"
    "homelab-powerdns"
)

# Check each container
for container in "${expected_containers[@]}"; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        # Container is running, check health
        health=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
        
        if [ "$health" = "healthy" ]; then
            print_success "${container} is running and healthy"
        elif [ "$health" = "none" ]; then
            print_success "${container} is running (no health check)"
        elif [ "$health" = "starting" ]; then
            print_warning "${container} is running (health check starting)"
        else
            print_failure "${container} is running but unhealthy" "Check logs: docker logs ${container}"
        fi
    else
        if docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
            print_failure "${container} exists but is not running" "Check logs: docker logs ${container}"
        else
            print_failure "${container} does not exist" "Run: docker-compose -f docker-compose.unified.yml up -d"
        fi
    fi
done

# ======================================================================
# PHASE 4: SERVICE ENDPOINT TESTS
# ======================================================================
print_header "PHASE 4: Service Endpoint Tests"

# Function to test HTTP endpoint
test_endpoint() {
    local url=$1
    local expected_code=$2
    local service_name=$3
    
    http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10 || echo "000")
    
    if [ "$http_code" = "$expected_code" ]; then
        print_success "${service_name}: ${url} returned ${http_code}"
    else
        print_failure "${service_name}: ${url} returned ${http_code} (expected ${expected_code})" \
                     "Check container logs or network configuration"
    fi
}

# Test internal endpoints (if containers are running)
if docker ps --format '{{.Names}}' | grep -q "^discord-bot$"; then
    test_endpoint "http://localhost:5000/health" "200" "Discord Bot (internal)"
else
    print_warning "Discord bot not running - skipping internal health check"
fi

if docker ps --format '{{.Names}}' | grep -q "^stream-bot$"; then
    test_endpoint "http://localhost:5000/health" "200" "Stream Bot (internal)"
else
    print_warning "Stream bot not running - skipping internal health check"
fi

# Note: External domain tests require production deployment
print_info "External domain tests (bot.rig-city.com, etc.) must be run on production server"

# ======================================================================
# PHASE 5: DATABASE CONNECTIVITY
# ======================================================================
print_header "PHASE 5: Database Connectivity"

if docker ps --format '{{.Names}}' | grep -q "^discord-bot-db$"; then
    # Test PostgreSQL connection
    if docker exec discord-bot-db pg_isready -U ticketbot -d ticketbot &> /dev/null; then
        print_success "PostgreSQL is ready and accepting connections"
        
        # Check if all databases exist
        databases=("ticketbot" "streambot" "homelab_jarvis" "powerdns")
        for db in "${databases[@]}"; do
            if docker exec discord-bot-db psql -U ticketbot -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
                print_success "Database '${db}' exists"
            else
                print_failure "Database '${db}' does not exist" "May need to run init scripts"
            fi
        done
    else
        print_failure "PostgreSQL not ready" "Check logs: docker logs discord-bot-db"
    fi
else
    print_failure "PostgreSQL container not running" "Start with: docker-compose -f docker-compose.unified.yml up -d discord-bot-db"
fi

# ======================================================================
# PHASE 6: STATIC SITE FILES
# ======================================================================
print_header "PHASE 6: Static Site Files"

# Check rig-city-site files
if [ -f "services/rig-city-site/index.html" ]; then
    print_success "rig-city-site/index.html exists"
else
    print_failure "rig-city-site/index.html missing" "Static site incomplete"
fi

if [ -f "services/rig-city-site/css/styles.css" ]; then
    print_success "rig-city-site/css/styles.css exists"
else
    print_failure "rig-city-site/css/styles.css missing" "Static site incomplete"
fi

if [ -f "services/rig-city-site/js/main.js" ]; then
    print_success "rig-city-site/js/main.js exists"
else
    print_failure "rig-city-site/js/main.js missing" "Static site incomplete"
fi

# Check scarletredjoker site
if [ -f "services/static-site/index.html" ]; then
    print_success "scarletredjoker site files exist"
else
    print_warning "scarletredjoker site files may be incomplete"
fi

# ======================================================================
# PHASE 7: BUILD VERIFICATION
# ======================================================================
print_header "PHASE 7: Build Configuration"

# Check Discord bot build script
if grep -q "platform=node" services/discord-bot/package.json; then
    print_success "Discord bot esbuild uses --platform=node"
else
    print_warning "Discord bot esbuild config may be incorrect"
fi

# Check if crypto import is fixed
if grep -q "^import crypto from 'crypto'" services/discord-bot/server/auth.ts; then
    print_success "Discord bot crypto import uses ESM (FIXED)"
elif grep -q "require('crypto')" services/discord-bot/server/auth.ts; then
    print_failure "Discord bot still uses require('crypto')" "Build will fail - needs ESM import"
else
    print_warning "Could not verify crypto import in Discord bot"
fi

# ======================================================================
# FINAL SUMMARY
# ======================================================================
print_header "VERIFICATION SUMMARY"

echo ""
echo "Total Checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"
echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}✅ ALL CHECKS PASSED!${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""
    echo "Next steps:"
    echo "1. If on production: Test external domains"
    echo "2. Verify OAuth flows work correctly"
    echo "3. Test ticket creation and management"
    echo ""
    exit 0
else
    echo -e "${RED}======================================${NC}"
    echo -e "${RED}❌ VERIFICATION FAILED${NC}"
    echo -e "${RED}======================================${NC}"
    echo ""
    echo "Failed checks: $FAILED_CHECKS"
    echo ""
    echo "Action items:"
    echo "1. Review failures above"
    echo "2. Check MISSING_SECRETS_CRITICAL.md for required secrets"
    echo "3. Check container logs: docker-compose -f docker-compose.unified.yml logs"
    echo "4. Fix issues and re-run this script"
    echo ""
    exit 1
fi
