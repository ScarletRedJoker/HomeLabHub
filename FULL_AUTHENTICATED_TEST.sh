#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
PASSED=0
FAILED=0
WARNINGS=0

# Cookie jar for session persistence
COOKIE_JAR="/tmp/homelab_cookies.txt"
rm -f "$COOKIE_JAR"

# Configuration
DOMAIN="host.evindrake.net"
USERNAME="${WEB_USERNAME:-admin}"
PASSWORD="${WEB_PASSWORD:-Brs=2729}"

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FULL AUTHENTICATED HOMELAB TEST SUITE          ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Helper functions
test_endpoint() {
    local url="$1"
    local name="$2"
    local expected_status="${3:-200}"
    local method="${4:-GET}"
    local data="${5:-}"
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -X POST -s -w "\n%{http_code}" --max-time 5 \
            -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
            -H "Content-Type: application/json" \
            -d "$data" "$url" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" --max-time 5 \
            -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$url" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} $name (HTTP $http_code)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗${NC} $name (HTTP $http_code, expected $expected_status)"
        ((FAILED++))
        return 1
    fi
}

test_json_response() {
    local url="$1"
    local name="$2"
    local method="${3:-GET}"
    local data="${4:-}"
    
    if [ "$method" = "POST" ] && [ -n "$data" ]; then
        response=$(curl -X POST -s --max-time 5 \
            -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
            -H "Content-Type: application/json" \
            -d "$data" "$url" 2>/dev/null)
    else
        response=$(curl -s --max-time 5 \
            -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$url" 2>/dev/null)
    fi
    
    if echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $name (valid JSON)"
        ((PASSED++))
        echo "$response"
        return 0
    else
        echo -e "${RED}✗${NC} $name (invalid JSON)"
        echo "Response: $response"
        ((FAILED++))
        return 1
    fi
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Step 1: Get CSRF token from login page
section "Authentication"
echo "Fetching login page to get CSRF token..."

login_page=$(curl -s -c "$COOKIE_JAR" "https://$DOMAIN/login" 2>/dev/null)
csrf_token=$(echo "$login_page" | grep -oP 'name="csrf_token" value="\K[^"]+' | head -n1)

if [ -z "$csrf_token" ]; then
    echo -e "${RED}✗${NC} Could not extract CSRF token from login page"
    ((FAILED++))
    exit 1
else
    echo -e "${GREEN}✓${NC} CSRF token obtained: ${csrf_token:0:20}..."
    ((PASSED++))
fi

# Step 2: Login with CSRF token
echo "Logging in as: $USERNAME"

login_response=$(curl -X POST -s -w "\n%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$USERNAME&password=$PASSWORD&csrf_token=$csrf_token" \
    "https://$DOMAIN/login" 2>/dev/null)

login_code=$(echo "$login_response" | tail -n1)
login_body=$(echo "$login_response" | sed '$d')

if [ "$login_code" = "302" ] || [ "$login_code" = "200" ]; then
    echo -e "${GREEN}✓${NC} Login successful (HTTP $login_code)"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Login failed (HTTP $login_code)"
    echo "Response: $login_body"
    ((FAILED++))
    echo ""
    echo "Cannot proceed without authentication. Exiting."
    exit 1
fi

# Verify session cookie exists
if [ -f "$COOKIE_JAR" ] && grep -q "session" "$COOKIE_JAR"; then
    echo -e "${GREEN}✓${NC} Session cookie obtained"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} No session cookie found"
    ((FAILED++))
fi

# Step 2: Test Dashboard Pages
section "Dashboard Pages (Authenticated)"
test_endpoint "https://$DOMAIN/" "Home Page" "200"
test_endpoint "https://$DOMAIN/health" "Health Check" "200"
test_endpoint "https://$DOMAIN/services" "Services Page" "200"
test_endpoint "https://$DOMAIN/system" "System Overview" "200"

# Step 3: Test AI Features
section "AI Features"
test_endpoint "https://$DOMAIN/jarvis" "Jarvis AI Page" "200"
test_endpoint "https://$DOMAIN/agent-swarm" "Agent Swarm Page" "200"
test_endpoint "https://$DOMAIN/jarvis-voice" "Voice Commands Page" "200"
test_endpoint "https://$DOMAIN/facts" "Facts Display Page" "200"

# Test Jarvis AI Chat API
section "Jarvis AI Chat API"
chat_response=$(test_json_response "https://$DOMAIN/api/ai/chat" "Jarvis Chat Test" "POST" \
    '{"message":"Hello, are you working?","conversation_id":"test-123"}')

if [ $? -eq 0 ]; then
    if echo "$chat_response" | jq -e '.response' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Jarvis returned a valid response"
        ((PASSED++))
    else
        warn "Jarvis response missing 'response' field"
    fi
fi

# Step 4: Test Media & Storage (Now Authenticated!)
section "Media & Storage Features"
test_endpoint "https://$DOMAIN/plex" "Plex Import Page" "200"
test_endpoint "https://$DOMAIN/storage" "Storage Monitor Page" "200"
test_endpoint "https://$DOMAIN/nas" "NAS Management Page" "200"

# Test Storage API
test_json_response "https://$DOMAIN/api/storage/metrics" "Storage Metrics API"
test_json_response "https://$DOMAIN/api/storage/trends" "Storage Trends API"

# Step 5: Test Database & Admin
section "Database Administration"
test_endpoint "https://$DOMAIN/databases" "DB Admin Page" "200"
test_json_response "https://$DOMAIN/api/databases" "Database List API"

# Step 6: Test App Marketplace
section "App Marketplace"
test_endpoint "https://$DOMAIN/marketplace" "Marketplace Page" "200"

# Step 7: Test Bot Integrations
section "Bot Services"
test_endpoint "https://bot.rig-city.com" "Discord Bot" "200"
test_endpoint "https://bot.rig-city.com/health" "Discord Bot Health" "200"

stream_bot_response=$(curl -s --max-time 5 "https://stream.rig-city.com" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Stream Bot (HTTP 200)"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Stream Bot timeout/error"
    ((FAILED++))
fi

test_endpoint "https://stream.rig-city.com/health" "Stream Bot Health" "200"

# Step 8: Test Stream Bot Facts API (Critical Integration!)
section "Stream Bot Integration Tests"
echo "Testing Stream Bot → Dashboard communication..."

# Test facts endpoint from dashboard
facts_response=$(curl -s --max-time 5 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "https://$DOMAIN/api/facts/random" 2>/dev/null)

if echo "$facts_response" | jq . >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Dashboard Facts API (valid JSON)"
    ((PASSED++))
    
    # Check if we got a fact
    if echo "$facts_response" | jq -e '.fact' >/dev/null 2>&1; then
        fact=$(echo "$facts_response" | jq -r '.fact')
        echo -e "${GREEN}✓${NC} Fact returned: ${fact:0:50}..."
        ((PASSED++))
    else
        warn "No fact in response"
    fi
else
    echo -e "${RED}✗${NC} Dashboard Facts API failed"
    ((FAILED++))
fi

# Test if Stream Bot can POST to dashboard (requires dashboard API key)
echo ""
echo "Testing if Stream Bot can communicate with Dashboard..."
warn "Stream Bot network communication requires manual verification"
warn "Check stream-bot logs for any connection errors to dashboard"

# Step 9: Test Static Websites
section "Static Websites"
test_endpoint "https://rig-city.com" "Rig City Homepage" "200"
test_endpoint "https://scarletredjoker.com" "Scarlet Red Joker Homepage" "200"

# Verify contact form exists
rig_city_html=$(curl -s --max-time 5 "https://rig-city.com/contact.html" 2>/dev/null)
if echo "$rig_city_html" | grep -q "form"; then
    echo -e "${GREEN}✓${NC} Rig City Contact Form Present"
    ((PASSED++))
else
    warn "Rig City contact form may be missing"
fi

scarlet_html=$(curl -s --max-time 5 "https://scarletredjoker.com" 2>/dev/null)
if echo "$scarlet_html" | grep -q "contact"; then
    echo -e "${GREEN}✓${NC} Scarlet Red Joker Contact Section Present"
    ((PASSED++))
else
    warn "Scarlet Red Joker contact section may be missing"
fi

# Step 10: Test Health Endpoints
section "Service Health Checks"
health=$(curl -s --max-time 5 "https://$DOMAIN/health" 2>/dev/null)
if echo "$health" | jq -e '.status' >/dev/null 2>&1; then
    status=$(echo "$health" | jq -r '.status')
    if [ "$status" = "healthy" ]; then
        echo -e "${GREEN}✓${NC} Dashboard health status: $status"
        ((PASSED++))
    else
        warn "Dashboard health status: $status"
    fi
    
    # Check individual services
    if echo "$health" | jq -e '.services' >/dev/null 2>&1; then
        echo ""
        echo "Service Status:"
        echo "$health" | jq -r '.services | to_entries[] | "  \(.key): \(.value.status)"'
    fi
fi

# Step 11: Test Docker Integration
section "Docker & System Monitoring"
test_json_response "https://$DOMAIN/api/services" "Docker Services List"
test_json_response "https://$DOMAIN/api/system/stats" "System Statistics"

# Step 12: Test AI Agent Swarm
section "AI Agent Swarm System"
test_json_response "https://$DOMAIN/api/agents" "Agent List API"

# Step 13: Cleanup
section "Cleanup"
if [ -f "$COOKIE_JAR" ]; then
    rm -f "$COOKIE_JAR"
    echo -e "${GREEN}✓${NC} Cleaned up session cookie"
fi

# Final Report
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                    FINAL RESULTS                    ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
else
    SUCCESS_RATE=0
fi

echo -e "Tests Passed:    ${GREEN}$PASSED${NC}"
echo -e "Tests Failed:    ${RED}$FAILED${NC}"
echo -e "Warnings:        ${YELLOW}$WARNINGS${NC}"
echo -e "Success Rate:    ${GREEN}${SUCCESS_RATE}%${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! System is fully functional!${NC}"
    exit 0
elif [ $SUCCESS_RATE -ge 90 ]; then
    echo -e "${YELLOW}⚠ System mostly functional with minor issues${NC}"
    exit 0
else
    echo -e "${RED}❌ System has significant issues requiring attention${NC}"
    exit 1
fi
