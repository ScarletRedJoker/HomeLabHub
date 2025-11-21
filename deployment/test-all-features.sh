#!/bin/bash
# ============================================
# Test All HomeLabHub Features
# ============================================
# This script tests critical features before deployment
# Run this on Replit before deploying to production

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_TOTAL=0

# ============================================
# Load Environment Variables
# ============================================
# Detect environment and load appropriate .env file
if [ -n "$REPL_ID" ] || [ -n "$REPLIT_CONNECTORS_HOSTNAME" ]; then
    # Replit environment
    if [ -f ".env.replit" ]; then
        echo "Loading .env.replit..."
        set -a
        source .env.replit
        set +a
    elif [ -f ".env" ]; then
        echo "Loading .env..."
        set -a
        source .env
        set +a
    fi
else
    # Production environment - try multiple file names
    if [ -f ".env" ]; then
        echo "Loading .env..."
        set -a
        source .env
        set +a
    elif [ -f ".env.production" ]; then
        echo "Loading .env.production..."
        set -a
        source .env.production
        set +a
    else
        echo -e "${RED}WARNING: No .env file found!${NC}"
        echo "Please create .env file with required configuration."
    fi
fi
echo ""

# ============================================
# Helper Functions
# ============================================
log_test() {
    echo -e "${BLUE}[TEST]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_skip() {
    echo -e "${YELLOW}[SKIP]${NC} $1"
}

run_test() {
    TESTS_TOTAL=$((TESTS_TOTAL + 1))
    log_test "$1"
}

# ============================================
# Test Suite
# ============================================

echo "============================================"
echo "HomeLabHub Feature Test Suite"
echo "============================================"
echo ""

# Test 1: Environment Detection
run_test "Environment Detection"
if [ -n "$REPL_ID" ] || [ -n "$REPLIT_CONNECTORS_HOSTNAME" ]; then
    log_pass "Running on Replit environment"
else
    log_pass "Running on Production environment"
fi
echo ""

# Test 2: Environment Variables
run_test "Critical Environment Variables"
MISSING_VARS=()

# Core variables
[ -z "$POSTGRES_PASSWORD" ] && MISSING_VARS+=("POSTGRES_PASSWORD")
[ -z "$WEB_PASSWORD" ] && MISSING_VARS+=("WEB_PASSWORD")
[ -z "$SESSION_SECRET" ] && MISSING_VARS+=("SESSION_SECRET")
[ -z "$DASHBOARD_API_KEY" ] && MISSING_VARS+=("DASHBOARD_API_KEY")

if [ ${#MISSING_VARS[@]} -eq 0 ]; then
    log_pass "All critical environment variables are set"
else
    log_fail "Missing variables: ${MISSING_VARS[*]}"
fi
echo ""

# Test 3: OpenAI Configuration
run_test "OpenAI API Configuration"
if [ -n "$AI_INTEGRATIONS_OPENAI_API_KEY" ] || [ -n "$OPENAI_API_KEY" ]; then
    log_pass "OpenAI API key is configured"
    
    # Test API connectivity (optional)
    if command -v curl &> /dev/null; then
        API_KEY="${AI_INTEGRATIONS_OPENAI_API_KEY:-$OPENAI_API_KEY}"
        BASE_URL="${AI_INTEGRATIONS_OPENAI_BASE_URL:-https://api.openai.com/v1}"
        
        RESPONSE=$(curl -s -w "%{http_code}" -o /dev/null \
            -H "Authorization: Bearer $API_KEY" \
            "$BASE_URL/models" 2>/dev/null || echo "000")
        
        if [ "$RESPONSE" = "200" ]; then
            log_pass "OpenAI API is reachable and valid"
        else
            log_fail "OpenAI API returned HTTP $RESPONSE"
        fi
    fi
else
    log_fail "OpenAI API key is not configured"
fi
echo ""

# Test 4: Database Configuration
run_test "Database Configuration"
DB_TESTS=0
DB_PASS=0

# Check database URLs
if [ -n "$JARVIS_DATABASE_URL" ]; then
    ((DB_TESTS++))
    if [[ "$JARVIS_DATABASE_URL" != *'${'* ]]; then
        ((DB_PASS++))
        log_pass "JARVIS_DATABASE_URL is properly resolved"
    else
        log_fail "JARVIS_DATABASE_URL contains unresolved variables"
    fi
fi

if [ -n "$STREAMBOT_DATABASE_URL" ]; then
    ((DB_TESTS++))
    if [[ "$STREAMBOT_DATABASE_URL" != *'${'* ]]; then
        ((DB_PASS++))
        log_pass "STREAMBOT_DATABASE_URL is properly resolved"
    else
        log_fail "STREAMBOT_DATABASE_URL contains unresolved variables"
    fi
fi

if [ -n "$DISCORD_DATABASE_URL" ]; then
    ((DB_TESTS++))
    if [[ "$DISCORD_DATABASE_URL" != *'${'* ]]; then
        ((DB_PASS++))
        log_pass "DISCORD_DATABASE_URL is properly resolved"
    else
        log_fail "DISCORD_DATABASE_URL contains unresolved variables"
    fi
fi

if [ $DB_TESTS -eq $DB_PASS ]; then
    log_pass "All database URLs are configured correctly"
else
    log_fail "Some database URLs need fixing"
fi
echo ""

# Test 5: Python Services
run_test "Python Dashboard Service"
if [ -d "services/dashboard" ]; then
    cd services/dashboard
    
    # Check if Python is available
    if command -v python3 &> /dev/null; then
        # Test import of environment config
        if python3 -c "from config.environment import get_openai_config, is_replit; print('OK')" 2>/dev/null; then
            log_pass "Environment config module loads successfully"
        else
            log_fail "Environment config module has errors"
        fi
    else
        log_skip "Python3 not found - skipping Python tests"
    fi
    
    cd ../..
else
    log_fail "Dashboard service directory not found"
fi
echo ""

# Test 6: Stream-bot Service
run_test "Stream-bot TypeScript Service"
if [ -d "services/stream-bot" ]; then
    cd services/stream-bot
    
    # Check if Node.js is available
    if command -v node &> /dev/null; then
        # Check if dependencies are installed
        if [ -d "node_modules" ]; then
            log_pass "Stream-bot dependencies installed"
        else
            log_fail "Stream-bot node_modules not found - run 'npm install'"
        fi
        
        # Test TypeScript compilation (if available)
        if command -v tsc &> /dev/null && [ -f "tsconfig.json" ]; then
            if tsc --noEmit 2>/dev/null; then
                log_pass "TypeScript compilation successful"
            else
                log_fail "TypeScript compilation has errors"
            fi
        fi
    else
        log_skip "Node.js not found - skipping Stream-bot tests"
    fi
    
    cd ../..
else
    log_fail "Stream-bot service directory not found"
fi
echo ""

# Test 7: YouTube OAuth Configuration
run_test "YouTube OAuth Configuration"
if [ -n "$REPLIT_CONNECTORS_HOSTNAME" ]; then
    log_pass "Using Replit YouTube Connector (automatic)"
elif [ -n "$YOUTUBE_CLIENT_ID" ] && [ -n "$YOUTUBE_CLIENT_SECRET" ]; then
    log_pass "YouTube OAuth credentials configured for production"
else
    log_skip "YouTube OAuth not configured (optional feature)"
fi
echo ""

# Test 8: VNC Desktop Configuration
run_test "VNC Desktop Configuration"
if [ -f "services/vnc-desktop/docker-entrypoint.sh" ]; then
    if [ -x "services/vnc-desktop/docker-entrypoint.sh" ]; then
        log_pass "VNC entrypoint script exists and is executable"
    else
        log_fail "VNC entrypoint script is not executable"
    fi
    
    if grep -q "NOVNC_ENABLE" services/vnc-desktop/docker-entrypoint.sh; then
        log_pass "VNC script includes noVNC support"
    else
        log_fail "VNC script missing noVNC configuration"
    fi
else
    log_fail "VNC entrypoint script not found"
fi
echo ""

# Test 9: Plex Configuration
run_test "Plex Media Server Configuration"
if [ -n "$PLEX_URL" ]; then
    log_pass "PLEX_URL is configured: $PLEX_URL"
    
    if [ -n "$PLEX_TOKEN" ]; then
        log_pass "PLEX_TOKEN is configured"
    else
        log_skip "PLEX_TOKEN not set (required for Plex integration)"
    fi
else
    log_skip "Plex not configured (optional feature)"
fi
echo ""

# Test 10: Docker Configuration
run_test "Docker Compose Configuration"
if [ -f "docker-compose.yml" ]; then
    log_pass "docker-compose.yml exists"
    
    # Validate docker-compose.yml syntax
    if command -v docker-compose &> /dev/null; then
        if docker-compose config >/dev/null 2>&1; then
            log_pass "docker-compose.yml syntax is valid"
        else
            log_fail "docker-compose.yml has syntax errors"
        fi
    fi
else
    log_fail "docker-compose.yml not found"
fi
echo ""

# ============================================
# Test Summary
# ============================================
echo "============================================"
echo "Test Summary"
echo "============================================"
echo "Total Tests: $TESTS_TOTAL"
echo -e "Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All critical tests passed!${NC}"
    echo "The system is ready for deployment."
    exit 0
else
    echo -e "${RED}✗ Some tests failed.${NC}"
    echo "Please fix the issues before deploying to production."
    exit 1
fi
