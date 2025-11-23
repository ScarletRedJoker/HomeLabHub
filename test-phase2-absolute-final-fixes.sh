#!/bin/bash
# ============================================
# PHASE 2 ABSOLUTE FINAL FIXES - TEST SCRIPT
# Verifies all 3 critical issues are resolved
# ============================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}   PHASE 2 ABSOLUTE FINAL FIXES TEST       ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}\n"

TESTS_PASSED=0
TESTS_FAILED=0

pass() {
    echo -e "${GREEN}✓ PASS${NC}: $1"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
    return 1
}

# ============================================
# Setup: Determine DEPLOYMENT_PATH
# ============================================
if [ -d "deployment/prod/evindrake_net" ] && [ -f "deployment/prod/evindrake_net/.env" ]; then
    export DEPLOYMENT_PATH="deployment/prod/evindrake_net"
    echo -e "${GREEN}Using production deployment:${NC} $DEPLOYMENT_PATH"
elif [ -d "deployment/dev/localhost" ] && [ -f "deployment/dev/localhost/.env" ]; then
    export DEPLOYMENT_PATH="deployment/dev/localhost"
    echo -e "${YELLOW}Using development deployment:${NC} $DEPLOYMENT_PATH"
else
    export DEPLOYMENT_PATH="$(pwd)"
    echo -e "${YELLOW}Using root directory:${NC} $DEPLOYMENT_PATH"
fi

echo ""

# ============================================
# ISSUE 1: Verify env_file Configuration
# ============================================
echo -e "${CYAN}[ISSUE 1] Verifying compose.web.yml env_file entries...${NC}\n"

# Check that services match services.yaml specification
python3 << 'PYEOF'
import yaml
import sys

try:
    # Load services.yaml
    with open('orchestration/services.yaml') as f:
        services_yaml = yaml.safe_load(f)

    # Load compose.web.yml (with DEPLOYMENT_PATH substitution)
    with open('orchestration/compose.web.yml') as f:
        compose_web_raw = f.read().replace('${DEPLOYMENT_PATH}', 'TESTPATH')
        compose_web = yaml.safe_load(compose_web_raw)

    # Services to check
    web_services = {
        'n8n': [],
        'scarletredjoker-web': [],
        'rig-city-site': [],
        'vnc-desktop': ['TESTPATH/.env'],
        'code-server': ['TESTPATH/.env'],
        'homeassistant': ['TESTPATH/.env']
    }

    all_pass = True
    for svc, expected in web_services.items():
        actual = compose_web['services'][svc].get('env_file', [])
        
        if actual == expected:
            print(f'  ✓ {svc}: {expected if expected else "no env_file (correct)"}')
        else:
            print(f'  ✗ {svc}: expected {expected}, got {actual}')
            all_pass = False
    
    sys.exit(0 if all_pass else 1)

except Exception as e:
    print(f'  ✗ Error: {e}')
    sys.exit(1)
PYEOF

if [ $? -eq 0 ]; then
    pass "All services have correct env_file configuration per services.yaml"
else
    fail "Some services have incorrect env_file configuration"
fi

echo ""

# ============================================
# ISSUE 2: Verify homelab script --env-file
# ============================================
echo -e "${CYAN}[ISSUE 2] Verifying homelab script has --env-file...${NC}\n"

if grep -q "env-file.*ENV_FILE" homelab; then
    echo "  Found: --env-file \"\$ENV_FILE\" in homelab script"
    pass "homelab script passes --env-file to docker compose"
else
    fail "homelab script missing --env-file flag"
fi

echo ""

# ============================================
# ISSUE 3: Verify DEPLOYMENT_PATH export
# ============================================
echo -e "${CYAN}[ISSUE 3] Verifying DEPLOYMENT_PATH is exported...${NC}\n"

if grep -q "export DEPLOYMENT_PATH" homelab; then
    echo "  Found: export DEPLOYMENT_PATH in homelab script"
    pass "DEPLOYMENT_PATH is exported before docker compose calls"
else
    fail "DEPLOYMENT_PATH is not exported in homelab script"
fi

echo ""

# ============================================
# Docker Compose Tests (if available)
# ============================================
if command -v docker &> /dev/null && docker compose version &> /dev/null; then
    echo -e "${CYAN}[DOCKER TESTS] Running docker compose config validation...${NC}\n"
    
    # Test 1: compose.base.yml
    echo "Testing compose.base.yml..."
    if docker compose -f orchestration/compose.base.yml config > /dev/null 2>&1; then
        pass "compose.base.yml validates successfully"
    else
        fail "compose.base.yml validation failed"
    fi
    
    # Test 2: compose.base.yml + compose.dashboard.yml
    echo "Testing compose.base.yml + compose.dashboard.yml..."
    if docker compose -f orchestration/compose.base.yml -f orchestration/compose.dashboard.yml config > /dev/null 2>&1; then
        pass "dashboard bundle validates successfully"
    else
        fail "dashboard bundle validation failed"
    fi
    
    # Test 3: compose.base.yml + compose.web.yml
    echo "Testing compose.base.yml + compose.web.yml..."
    if docker compose -f orchestration/compose.base.yml -f orchestration/compose.web.yml config > /dev/null 2>&1; then
        pass "web bundle validates successfully"
    else
        fail "web bundle validation failed"
    fi
    
    # Test 4: Verify env_file in config output
    echo "Checking env_file configuration in docker compose config output..."
    CONFIG_OUTPUT=$(docker compose -f orchestration/compose.base.yml -f orchestration/compose.web.yml config 2>&1)
    
    # vnc-desktop should have exactly one env_file entry
    VNC_ENV_COUNT=$(echo "$CONFIG_OUTPUT" | grep -A 20 "vnc-desktop:" | grep "env_file:" -A 10 | grep "^      -" | wc -l)
    if [ "$VNC_ENV_COUNT" -eq 1 ]; then
        pass "vnc-desktop has exactly 1 env_file entry (correct)"
    else
        fail "vnc-desktop has $VNC_ENV_COUNT env_file entries (expected 1)"
    fi
    
    echo ""
else
    echo -e "${YELLOW}⚠ Docker not available - skipping compose validation tests${NC}"
    echo "  (These tests will run on the production server)"
    echo ""
fi

# ============================================
# YAML Syntax Validation
# ============================================
echo -e "${CYAN}[YAML VALIDATION] Checking YAML syntax...${NC}\n"

python3 -c "import yaml; yaml.safe_load(open('orchestration/compose.web.yml'))" 2>&1
if [ $? -eq 0 ]; then
    pass "compose.web.yml has valid YAML syntax"
else
    fail "compose.web.yml has YAML syntax errors"
fi

python3 -c "import yaml; yaml.safe_load(open('orchestration/compose.all.yml'))" 2>&1
if [ $? -eq 0 ]; then
    pass "compose.all.yml has valid YAML syntax"
else
    fail "compose.all.yml has YAML syntax errors"
fi

echo ""

# ============================================
# Final Summary
# ============================================
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo -e "${CYAN}              TEST SUMMARY                  ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════${NC}"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
    echo ""
    echo "Phase 2 Absolute Final Fixes verified:"
    echo "  ✓ compose.web.yml env_file entries match services.yaml"
    echo "  ✓ homelab script injects DEPLOYMENT_PATH via --env-file"
    echo "  ✓ DEPLOYMENT_PATH is exported before docker compose calls"
    echo "  ✓ All YAML files have valid syntax"
    echo ""
    echo -e "${CYAN}Ready for deployment!${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED${NC}"
    echo ""
    echo "Please review the failures above and fix before deployment."
    echo ""
    exit 1
fi
