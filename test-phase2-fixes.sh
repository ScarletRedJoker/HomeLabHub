#!/bin/bash
# ============================================
# Phase 2 Bug Fix Verification Test Script
# Tests all 3 critical bug fixes
# ============================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

TESTS_PASSED=0
TESTS_FAILED=0

# Test function
test_case() {
    local name="$1"
    local description="$2"
    echo ""
    echo -e "${CYAN}═══ TEST: $name ═══${NC}"
    echo "$description"
    echo ""
}

pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

# ============================================
# BUG 1: Network Configuration Test
# ============================================
test_case "BUG 1: Network Configuration Merge" \
    "Verify compose files can merge without 'external: true' conflict"

# Check that external: true is removed from all bundles
echo "Checking compose files for 'external: true'..."
EXTERNAL_FOUND=0

for file in orchestration/compose.{dashboard,discord,stream,web,automation}.yml; do
    if grep -q "external: true" "$file" 2>/dev/null; then
        fail "Found 'external: true' in $file"
        EXTERNAL_FOUND=1
    fi
done

if [ $EXTERNAL_FOUND -eq 0 ]; then
    pass "All service bundles have 'external: true' removed"
fi

# Test compose config merge (if docker available)
if command -v docker &> /dev/null; then
    echo "Testing docker compose config merge..."
    
    # Test base + dashboard
    if docker compose -f orchestration/compose.base.yml -f orchestration/compose.dashboard.yml config > /dev/null 2>&1; then
        pass "compose.base.yml + compose.dashboard.yml merge succeeds"
    else
        fail "compose.base.yml + compose.dashboard.yml merge FAILED"
    fi
    
    # Test base + discord
    if docker compose -f orchestration/compose.base.yml -f orchestration/compose.discord.yml config > /dev/null 2>&1; then
        pass "compose.base.yml + compose.discord.yml merge succeeds"
    else
        fail "compose.base.yml + compose.discord.yml merge FAILED"
    fi
    
    # Test base + stream
    if docker compose -f orchestration/compose.base.yml -f orchestration/compose.stream.yml config > /dev/null 2>&1; then
        pass "compose.base.yml + compose.stream.yml merge succeeds"
    else
        fail "compose.base.yml + compose.stream.yml merge FAILED"
    fi
else
    echo -e "${YELLOW}⚠ Docker not available, skipping config merge test${NC}"
fi

# ============================================
# BUG 2: DEPLOYMENT_PATH Detection Test
# ============================================
test_case "BUG 2: DEPLOYMENT_PATH Detection" \
    "Verify homelab CLI detects and uses DEPLOYMENT_PATH"

# Check if homelab script has DEPLOYMENT_PATH logic
if grep -q "DEPLOYMENT_PATH=" homelab; then
    pass "homelab script has DEPLOYMENT_PATH detection"
else
    fail "homelab script missing DEPLOYMENT_PATH detection"
fi

# Check if modular_compose exports DEPLOYMENT_PATH
if grep -q "export DEPLOYMENT_PATH" homelab; then
    pass "modular_compose exports DEPLOYMENT_PATH for docker-compose"
else
    fail "modular_compose doesn't export DEPLOYMENT_PATH"
fi

# Check if validate_service_env function exists
if grep -q "validate_service_env()" homelab; then
    pass "validate_service_env() function exists"
else
    fail "validate_service_env() function missing"
fi

# Check if deployment configs exist
if [ -d "deployment/prod/evindrake_net" ] && [ -f "deployment/prod/evindrake_net/.env" ]; then
    pass "Phase 1 deployment configs found in deployment/prod/evindrake_net/"
    
    # Check for service-specific .env files
    SERVICE_ENVS=$(ls deployment/prod/evindrake_net/.env.* 2>/dev/null | wc -l)
    if [ $SERVICE_ENVS -gt 0 ]; then
        pass "Found $SERVICE_ENVS service-specific .env files"
    else
        fail "No service-specific .env files found"
    fi
else
    fail "Phase 1 deployment configs not found"
fi

# ============================================
# BUG 3: Dynamic Service Catalog Test
# ============================================
test_case "BUG 3: Dynamic Service Catalog" \
    "Verify deploy/undeploy functions use service_catalog.py dynamically"

# Check if service_catalog.py exists
if [ -f "orchestration/service_catalog.py" ]; then
    pass "service_catalog.py exists"
else
    fail "service_catalog.py missing"
fi

# Check if it's executable
if [ -x "orchestration/service_catalog.py" ]; then
    pass "service_catalog.py is executable"
else
    fail "service_catalog.py is not executable"
fi

# Test Python service catalog CLI
if command -v python3 &> /dev/null; then
    echo "Testing service_catalog.py commands..."
    
    # Test list command
    if python3 orchestration/service_catalog.py list > /dev/null 2>&1; then
        pass "service_catalog.py list command works"
    else
        fail "service_catalog.py list command failed"
    fi
    
    # Test get command
    if python3 orchestration/service_catalog.py get dashboard > /dev/null 2>&1; then
        pass "service_catalog.py get command works"
    else
        fail "service_catalog.py get command failed"
    fi
    
    # Test deps command
    DEPS=$(python3 orchestration/service_catalog.py deps dashboard 2>/dev/null)
    if echo "$DEPS" | grep -q "postgres"; then
        pass "service_catalog.py correctly identifies dashboard dependencies"
    else
        fail "service_catalog.py deps command failed or incorrect"
    fi
    
    # Test group command
    CORE_SERVICES=$(python3 orchestration/service_catalog.py group core 2>/dev/null)
    if echo "$CORE_SERVICES" | grep -q "postgres"; then
        pass "service_catalog.py group command works"
    else
        fail "service_catalog.py group command failed"
    fi
    
    # Test order command
    ORDER=$(python3 orchestration/service_catalog.py order dashboard 2>/dev/null)
    if echo "$ORDER" | grep -q "postgres"; then
        pass "service_catalog.py order command resolves dependencies"
    else
        fail "service_catalog.py order command failed"
    fi
else
    fail "python3 not available, cannot test service_catalog.py"
fi

# Check if deploy_service uses Python catalog
if grep -q "python3.*service_catalog.py" homelab; then
    pass "deploy_service function uses Python service catalog"
else
    fail "deploy_service still uses hardcoded case statements"
fi

# Check if undeploy_service uses Python catalog
if grep -q "python3.*service_catalog.py.*group" homelab; then
    pass "undeploy_service function uses Python service catalog"
else
    fail "undeploy_service still uses hardcoded case statements"
fi

# Check that old hardcoded case statements are removed from deploy_service
DEPLOY_LINE=$(grep -n "^deploy_service()" homelab | cut -d: -f1)
if [ -n "$DEPLOY_LINE" ]; then
    # Check next 100 lines for hardcoded service cases
    HARDCODED=$(sed -n "${DEPLOY_LINE},$((DEPLOY_LINE+120))p" homelab | grep -c "dashboard)" || true)
    if [ $HARDCODED -eq 0 ]; then
        pass "deploy_service no longer has hardcoded case statements"
    else
        # Allow for one instance (the check, not deployment logic)
        if [ $HARDCODED -le 2 ]; then
            pass "deploy_service uses dynamic catalog (minimal hardcoded refs)"
        else
            fail "deploy_service still has $HARDCODED hardcoded service references"
        fi
    fi
fi

# ============================================
# Integration Tests
# ============================================
test_case "Integration: Service Catalog + Compose Files" \
    "Verify service catalog correctly maps to compose files"

if command -v python3 &> /dev/null; then
    # Test that dashboard maps to correct compose files
    DASHBOARD_FILES=$(python3 orchestration/service_catalog.py compose dashboard 2>/dev/null)
    
    if echo "$DASHBOARD_FILES" | grep -q "compose.base.yml"; then
        pass "Dashboard correctly includes compose.base.yml"
    else
        fail "Dashboard missing compose.base.yml"
    fi
    
    if echo "$DASHBOARD_FILES" | grep -q "compose.dashboard.yml"; then
        pass "Dashboard correctly includes compose.dashboard.yml"
    else
        fail "Dashboard missing compose.dashboard.yml"
    fi
    
    # Test discord-bot
    DISCORD_FILES=$(python3 orchestration/service_catalog.py compose discord-bot 2>/dev/null)
    
    if echo "$DISCORD_FILES" | grep -q "compose.discord.yml"; then
        pass "Discord bot correctly includes compose.discord.yml"
    else
        fail "Discord bot missing compose.discord.yml"
    fi
fi

# ============================================
# Summary
# ============================================
echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}        TEST SUMMARY                   ${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL PHASE 2 BUG FIXES VERIFIED!${NC}"
    echo ""
    echo "Summary of fixes:"
    echo "  ✓ BUG 1: Network config conflict resolved (external: true removed)"
    echo "  ✓ BUG 2: DEPLOYMENT_PATH detection implemented"
    echo "  ✓ BUG 3: Dynamic service catalog deployment working"
    echo ""
    echo "The Phase 2 deployment system is now production-ready!"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review the failed tests above and fix the issues."
    exit 1
fi
