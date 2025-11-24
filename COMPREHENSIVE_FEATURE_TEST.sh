#!/bin/bash
# ============================================================================
# COMPREHENSIVE FEATURE VERIFICATION - Test EVERYTHING
# ============================================================================
# Run this on your Ubuntu server to verify all features actually work

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0
SKIPPED=0

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       COMPREHENSIVE HOMELAB FEATURE VERIFICATION         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

cd /home/evin/contain/HomeLabHub

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

skip() {
    echo -e "${YELLOW}⊘${NC} $1"
    ((SKIPPED++))
}

test_http() {
    local url="$1"
    local description="$2"
    local expected_code="${3:-200}"
    
    local code=$(curl -s -o /dev/null -w "%{http_code}" -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" "$url" 2>/dev/null || echo "000")
    
    if [ "$code" = "$expected_code" ]; then
        pass "$description (HTTP $code)"
        return 0
    else
        fail "$description (Expected $expected_code, got $code)"
        return 1
    fi
}

test_api() {
    local url="$1"
    local description="$2"
    local search_term="$3"
    
    local response=$(curl -s -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" "$url" 2>/dev/null)
    
    if echo "$response" | grep -q "$search_term"; then
        pass "$description"
        return 0
    else
        fail "$description (Response: ${response:0:100}...)"
        return 1
    fi
}

echo -e "${CYAN}[1/12] Core Dashboard Pages${NC}"
test_http "https://dashboard.evindrake.net/" "Dashboard home page"
test_http "https://dashboard.evindrake.net/health" "Health check endpoint"
test_http "https://dashboard.evindrake.net/service-actions" "Service actions page"
echo ""

echo -e "${CYAN}[2/12] AI Features${NC}"
test_http "https://dashboard.evindrake.net/ai-assistant" "Jarvis AI page"
test_http "https://dashboard.evindrake.net/agent-swarm" "Agent Swarm page"
test_http "https://dashboard.evindrake.net/jarvis-voice" "Voice commands page"
test_http "https://dashboard.evindrake.net/ollama_models" "AI Models page"
test_http "https://dashboard.evindrake.net/facts" "AI Facts page"

# Test Jarvis API
if curl -s -X POST https://dashboard.evindrake.net/api/jarvis/chat \
    -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello","conversation_history":[]}' 2>/dev/null | grep -q "response"; then
    pass "Jarvis AI chat API"
else
    fail "Jarvis AI chat API"
fi
echo ""

echo -e "${CYAN}[3/12] Facts System${NC}"
test_api "https://dashboard.evindrake.net/api/facts/latest?limit=5" "Facts API endpoint" '"success"'

# Check if facts exist in database
FACT_COUNT=$(curl -s -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" \
    "https://dashboard.evindrake.net/api/facts/latest?limit=1" 2>/dev/null | \
    grep -o '"count":[0-9]*' | grep -o '[0-9]*' || echo "0")

if [ "$FACT_COUNT" -gt "0" ]; then
    pass "Facts database populated ($FACT_COUNT facts)"
else
    fail "Facts database empty (stream-bot connection issue)"
fi
echo ""

echo -e "${CYAN}[4/12] Database Admin${NC}"
test_http "https://dashboard.evindrake.net/database" "Database Admin page"
test_http "https://dashboard.evindrake.net/databases" "Database management page"
test_api "https://dashboard.evindrake.net/api/db-admin/databases" "Database list API" '"databases"'

# Test database connection
if curl -s -X POST https://dashboard.evindrake.net/api/db-admin/test-connection \
    -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" \
    -H "Content-Type: application/json" \
    -d '{"database":"homelab"}' 2>/dev/null | grep -q '"success":true'; then
    pass "Database connection test"
else
    fail "Database connection test"
fi
echo ""

echo -e "${CYAN}[5/12] Plex Media Import${NC}"
test_http "https://dashboard.evindrake.net/plex" "Plex import page"

# Test Plex API
if curl -s https://dashboard.evindrake.net/api/plex/status \
    -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" 2>/dev/null | grep -q "status"; then
    pass "Plex API endpoint"
else
    fail "Plex API endpoint"
fi

echo -e "${YELLOW}⚠ Manual test required:${NC} Upload a test media file via drag-and-drop"
echo ""

echo -e "${CYAN}[6/12] Storage & NAS${NC}"
test_http "https://dashboard.evindrake.net/storage" "Storage monitor page"
test_http "https://dashboard.evindrake.net/nas" "NAS management page"

# Test storage API
if curl -s https://dashboard.evindrake.net/api/storage/usage \
    -u "${WEB_USERNAME:-admin}:${WEB_PASSWORD:-Brs=2729}" 2>/dev/null | grep -q "disk"; then
    pass "Storage usage API"
else
    fail "Storage usage API"
fi
echo ""

echo -e "${CYAN}[7/12] External Services${NC}"
test_http "http://localhost:8123" "Home Assistant" "200\|302"
test_http "http://localhost:9000" "MinIO" "200\|403"
test_http "http://localhost:8080" "n8n" "200\|302"

if docker ps | grep -q "homelab-postgres.*healthy"; then
    pass "PostgreSQL running"
else
    fail "PostgreSQL not running"
fi

if docker ps | grep -q "homelab-redis.*healthy"; then
    pass "Redis running"
else
    fail "Redis not running"
fi
echo ""

echo -e "${CYAN}[8/12] Bot Services${NC}"
if docker ps | grep -q "discord-bot.*running\|healthy"; then
    pass "Discord bot running"
    
    # Check logs for activity
    if docker logs discord-bot --tail 20 2>/dev/null | grep -q "Successfully loaded.*ticket-channel mappings"; then
        pass "Discord bot processing events"
    else
        fail "Discord bot not processing events"
    fi
else
    fail "Discord bot not running"
fi

if docker ps | grep -q "stream-bot.*running\|healthy"; then
    pass "Stream bot running"
    
    # Check if generating facts
    if docker logs stream-bot --tail 50 2>/dev/null | grep -q "OpenAI.*fact"; then
        pass "Stream bot generating facts"
    else
        skip "Stream bot not generating facts (may not be time yet)"
    fi
    
    # Check connection to dashboard
    if docker logs stream-bot --tail 50 2>/dev/null | grep -q "✓ Posted fact"; then
        pass "Stream bot → dashboard connection"
    elif docker logs stream-bot --tail 50 2>/dev/null | grep -q "✗ fetch failed"; then
        fail "Stream bot → dashboard connection (fetch failed)"
    else
        skip "Stream bot → dashboard connection (no recent attempts)"
    fi
else
    fail "Stream bot not running"
fi
echo ""

echo -e "${CYAN}[9/12] Marketplace & Deployments${NC}"
test_http "https://dashboard.evindrake.net/marketplace" "App marketplace page"

echo -e "${YELLOW}⚠ Manual test required:${NC} Deploy test app from marketplace"
skip "Marketplace deployment (manual test needed)"
echo ""

echo -e "${CYAN}[10/12] File Operations${NC}"
test_http "https://dashboard.evindrake.net/files" "File manager page" "200\|404"

echo -e "${YELLOW}⚠ Manual test required:${NC} Upload/download files via file manager"
skip "File manager operations (manual test needed)"
echo ""

echo -e "${CYAN}[11/12] Service Operations${NC}"
# Test service status API
if ./homelab status > /dev/null 2>&1; then
    pass "Service status command"
else
    fail "Service status command"
fi

# Test service logs
if ./homelab logs homelab-dashboard --tail 10 > /dev/null 2>&1; then
    pass "Service logs command"
else
    fail "Service logs command"
fi

echo -e "${YELLOW}⚠ Manual test required:${NC} Restart a service via dashboard UI"
skip "Service restart (manual test needed)"
echo ""

echo -e "${CYAN}[12/12] Authentication & Security${NC}"
# Test login page
if curl -s "https://dashboard.evindrake.net/login" | grep -q "login\|username\|password"; then
    pass "Login page accessible"
else
    fail "Login page accessible"
fi

# Test unauthenticated access is blocked
if curl -s -o /dev/null -w "%{http_code}" "https://dashboard.evindrake.net/ai-assistant" 2>/dev/null | grep -q "401\|302"; then
    pass "Authentication required for protected pages"
else
    fail "Authentication not enforcing (security risk!)"
fi

# Test HTTPS
if curl -s -I "https://dashboard.evindrake.net" | grep -q "HTTP.*200\|302"; then
    pass "HTTPS working (Caddy SSL)"
else
    fail "HTTPS not working"
fi
echo ""

echo -e "${CYAN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    TEST SUMMARY                          ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}PASSED:${NC}  $PASSED"
echo -e "${RED}FAILED:${NC}  $FAILED"
echo -e "${YELLOW}SKIPPED:${NC} $SKIPPED (manual tests required)"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    PERCENT=$((PASSED * 100 / TOTAL))
    echo -e "Success Rate: ${PERCENT}%"
    echo ""
fi

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL AUTOMATED TESTS PASSED!${NC}"
    echo ""
    echo "Manual tests remaining:"
    echo "  1. Plex: Upload media file via drag-and-drop"
    echo "  2. File Manager: Upload/download files"
    echo "  3. Marketplace: Deploy a test app"
    echo "  4. Service Actions: Restart a service via UI"
    echo "  5. Voice Commands: Test speech-to-text"
    echo "  6. Agent Swarm: Run multi-agent task"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Review failures above and fix before declaring system ready."
    echo ""
    echo "Common issues:"
    echo "  - Stream-bot connection: Check Docker network"
    echo "  - Facts empty: Wait 1 hour or manually POST test fact"
    echo "  - Services down: Run ./homelab status"
    echo "  - API errors: Check ./homelab logs homelab-dashboard"
    exit 1
fi
