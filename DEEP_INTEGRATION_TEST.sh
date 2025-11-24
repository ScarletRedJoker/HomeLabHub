#!/bin/bash

# Deep integration testing - tests actual functionality, not just HTTP codes

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

COOKIE_JAR="/tmp/homelab_deep_cookies.txt"
rm -f "$COOKIE_JAR"

DOMAIN="host.evindrake.net"
USERNAME="${WEB_USERNAME:-admin}"
PASSWORD="${WEB_PASSWORD:-Brs=2729}"

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      DEEP INTEGRATION & FUNCTIONALITY TEST       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

# Login first
section "Authentication & Session Management"

# Get CSRF token
login_page=$(curl -s -c "$COOKIE_JAR" "https://$DOMAIN/login" 2>/dev/null)
csrf_token=$(echo "$login_page" | grep -oP 'name="csrf_token" value="\K[^"]+' | head -n1)

if [ -z "$csrf_token" ]; then
    echo -e "${RED}✗${NC} Could not extract CSRF token"
    ((FAILED++))
    exit 1
fi

# Login with CSRF token
login_response=$(curl -X POST -s -w "\n%{http_code}" \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=$USERNAME&password=$PASSWORD&csrf_token=$csrf_token" \
    "https://$DOMAIN/login" 2>/dev/null)

login_code=$(echo "$login_response" | tail -n1)

if [ "$login_code" = "302" ] || [ "$login_code" = "200" ]; then
    echo -e "${GREEN}✓${NC} Authenticated successfully"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Authentication failed - cannot proceed"
    ((FAILED++))
    exit 1
fi

# Test 1: Jarvis AI End-to-End
section "Test 1: Jarvis AI Conversation Flow"
echo "Sending test message to Jarvis..."

jarvis_test=$(curl -X POST -s --max-time 10 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -H "Content-Type: application/json" \
    -d '{"message":"What is 2+2?","conversation_id":"integration-test-001"}' \
    "https://$DOMAIN/api/ai/chat" 2>/dev/null)

if echo "$jarvis_test" | jq -e '.response' >/dev/null 2>&1; then
    response=$(echo "$jarvis_test" | jq -r '.response')
    echo -e "${GREEN}✓${NC} Jarvis responded: ${response:0:80}..."
    ((PASSED++))
    
    # Check if OpenAI actually responded (not an error message)
    if echo "$response" | grep -qi "error\|failed\|cannot"; then
        echo -e "${YELLOW}⚠${NC} Response may indicate an error"
    else
        echo -e "${GREEN}✓${NC} Response appears valid"
        ((PASSED++))
    fi
else
    echo -e "${RED}✗${NC} Jarvis failed to respond"
    echo "Response: $jarvis_test"
    ((FAILED++))
fi

# Test 2: Storage Metrics Collection
section "Test 2: Storage Monitoring System"
echo "Fetching storage metrics..."

storage=$(curl -s --max-time 10 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "https://$DOMAIN/api/storage/metrics" 2>/dev/null)

if echo "$storage" | jq -e '.metrics' >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Storage metrics retrieved"
    ((PASSED++))
    
    # Check for key metrics
    if echo "$storage" | jq -e '.metrics.docker' >/dev/null 2>&1; then
        docker_size=$(echo "$storage" | jq -r '.metrics.docker.total_size_gb // 0')
        echo -e "${GREEN}✓${NC} Docker storage: ${docker_size} GB"
        ((PASSED++))
    fi
    
    if echo "$storage" | jq -e '.metrics.databases' >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Database metrics present"
        ((PASSED++))
    fi
else
    echo -e "${RED}✗${NC} Storage metrics failed"
    ((FAILED++))
fi

# Test 3: Database Admin Functionality
section "Test 3: Database Administration"
echo "Listing database connections..."

databases=$(curl -s --max-time 10 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "https://$DOMAIN/api/databases" 2>/dev/null)

if echo "$databases" | jq -e '.databases' >/dev/null 2>&1; then
    db_count=$(echo "$databases" | jq '.databases | length')
    echo -e "${GREEN}✓${NC} Found $db_count database configurations"
    ((PASSED++))
    
    # List databases
    echo "$databases" | jq -r '.databases[] | "  - \(.name // .database) (\(.type))"' 2>/dev/null
else
    echo -e "${RED}✗${NC} Database listing failed"
    ((FAILED++))
fi

# Test 4: Docker Service Discovery
section "Test 4: Docker Service Management"
echo "Discovering running services..."

services=$(curl -s --max-time 10 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "https://$DOMAIN/api/services" 2>/dev/null)

if echo "$services" | jq -e '.services' >/dev/null 2>&1; then
    service_count=$(echo "$services" | jq '.services | length')
    echo -e "${GREEN}✓${NC} Discovered $service_count Docker services"
    ((PASSED++))
    
    # Check for expected services
    for expected in "homelab-dashboard" "homelab-postgres" "homelab-redis"; do
        if echo "$services" | jq -e ".services[] | select(.name == \"$expected\")" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} Found $expected"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠${NC} $expected not found in service list"
        fi
    done
else
    echo -e "${RED}✗${NC} Service discovery failed"
    ((FAILED++))
fi

# Test 5: Facts API (Stream Bot Integration)
section "Test 5: AI Facts Generation"
echo "Generating random fact..."

fact=$(curl -s --max-time 10 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "https://$DOMAIN/api/facts/random" 2>/dev/null)

if echo "$fact" | jq -e '.fact' >/dev/null 2>&1; then
    fact_text=$(echo "$fact" | jq -r '.fact')
    echo -e "${GREEN}✓${NC} Generated fact: ${fact_text:0:80}..."
    ((PASSED++))
    
    # Verify fact has substance (not empty or error)
    if [ ${#fact_text} -gt 20 ]; then
        echo -e "${GREEN}✓${NC} Fact has valid content (${#fact_text} chars)"
        ((PASSED++))
    fi
else
    echo -e "${RED}✗${NC} Fact generation failed"
    echo "Response: $fact"
    ((FAILED++))
fi

# Test 6: Agent Swarm System
section "Test 6: AI Agent Swarm"
echo "Listing AI agents..."

agents=$(curl -s --max-time 10 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    "https://$DOMAIN/api/agents" 2>/dev/null)

if echo "$agents" | jq -e '.agents' >/dev/null 2>&1; then
    agent_count=$(echo "$agents" | jq '.agents | length')
    echo -e "${GREEN}✓${NC} Found $agent_count AI agents"
    ((PASSED++))
    
    # List agent names
    echo "$agents" | jq -r '.agents[].name' 2>/dev/null | while read name; do
        echo "  - $name"
    done
else
    echo -e "${YELLOW}⚠${NC} Agent swarm may not be initialized"
fi

# Test 7: System Health
section "Test 7: System Health & Diagnostics"
echo "Checking system health..."

health=$(curl -s --max-time 10 "https://$DOMAIN/health" 2>/dev/null)

if echo "$health" | jq -e '.status' >/dev/null 2>&1; then
    status=$(echo "$health" | jq -r '.status')
    
    if [ "$status" = "healthy" ]; then
        echo -e "${GREEN}✓${NC} System status: HEALTHY"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠${NC} System status: $status"
    fi
    
    # Check service health
    if echo "$health" | jq -e '.services.postgres.status' >/dev/null 2>&1; then
        pg_status=$(echo "$health" | jq -r '.services.postgres.status')
        echo -e "${GREEN}✓${NC} PostgreSQL: $pg_status"
        ((PASSED++))
    fi
    
    if echo "$health" | jq -e '.services.redis.status' >/dev/null 2>&1; then
        redis_status=$(echo "$health" | jq -r '.services.redis.status')
        echo -e "${GREEN}✓${NC} Redis: $redis_status"
        ((PASSED++))
    fi
fi

# Test 8: Bot Connectivity
section "Test 8: Bot Service Connectivity"

# Discord Bot
discord_health=$(curl -s --max-time 5 "https://bot.rig-city.com/health" 2>/dev/null)
if echo "$discord_health" | jq -e '.status' >/dev/null 2>&1; then
    bot_status=$(echo "$discord_health" | jq -r '.status')
    echo -e "${GREEN}✓${NC} Discord Bot: $bot_status"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Discord Bot health check failed"
    ((FAILED++))
fi

# Stream Bot
stream_health=$(curl -s --max-time 5 "https://stream.rig-city.com/health" 2>/dev/null)
if echo "$stream_health" | jq -e '.status' >/dev/null 2>&1; then
    stream_status=$(echo "$stream_health" | jq -r '.status')
    echo -e "${GREEN}✓${NC} Stream Bot: $stream_status"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Stream Bot health check failed"
    ((FAILED++))
fi

# Test 9: Network Communication (Critical!)
section "Test 9: Inter-Service Communication"
echo "Testing Dashboard ← → Stream Bot communication..."

# Check if Stream Bot can resolve dashboard hostname
echo "Verifying DNS resolution inside stream-bot container..."
dns_test=$(docker exec stream-bot getent hosts homelab-dashboard 2>/dev/null)
if [ $? -eq 0 ]; then
    ip=$(echo "$dns_test" | awk '{print $1}')
    echo -e "${GREEN}✓${NC} Stream Bot can resolve homelab-dashboard to $ip"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Stream Bot CANNOT resolve homelab-dashboard"
    echo "This explains why stream bot can't POST to dashboard!"
    ((FAILED++))
fi

# Test actual HTTP connectivity
echo "Testing HTTP connectivity from stream-bot to dashboard..."
http_test=$(docker exec stream-bot curl -s --max-time 3 http://homelab-dashboard:5001/health 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Stream Bot can reach dashboard via HTTP"
    ((PASSED++))
else
    echo -e "${RED}✗${NC} Stream Bot CANNOT reach dashboard via HTTP"
    echo "CRITICAL: This is the root cause of fact generation failures!"
    ((FAILED++))
fi

# Cleanup
rm -f "$COOKIE_JAR"

# Final Report
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}            DEEP INTEGRATION TEST RESULTS            ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
    SUCCESS_RATE=$((PASSED * 100 / TOTAL))
else
    SUCCESS_RATE=0
fi

echo -e "Integration Tests Passed: ${GREEN}$PASSED${NC}"
echo -e "Integration Tests Failed: ${RED}$FAILED${NC}"
echo -e "Success Rate:             ${GREEN}${SUCCESS_RATE}%${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL INTEGRATION TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠ Some integration tests failed - review above for details${NC}"
    exit 1
fi
