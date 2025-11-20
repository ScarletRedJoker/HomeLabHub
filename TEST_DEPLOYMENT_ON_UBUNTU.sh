#!/bin/bash
#================================================
# Ubuntu 20.10 Deployment Testing Script
# Run this on your Ubuntu server to verify all fixes
#================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║     UBUNTU 20.10 DEPLOYMENT VERIFICATION TEST SUITE            ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

PASSED=0
FAILED=0

# Test function
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo -e "${BLUE}━━━ Testing: $test_name ━━━${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((FAILED++))
    fi
    echo ""
}

#================================================
# TEST 1: Verify Symlink
#================================================
test_symlink() {
    if [ -L docker-compose.yml ] && [ "$(readlink docker-compose.yml)" = "docker-compose.unified.yml" ]; then
        echo "  Symlink exists: docker-compose.yml -> docker-compose.unified.yml"
        return 0
    else
        echo "  ERROR: Symlink missing or incorrect"
        return 1
    fi
}

#================================================
# TEST 2: Docker Compose Plugin Available
#================================================
test_docker_compose() {
    if docker compose version >/dev/null 2>&1; then
        echo "  Docker Compose plugin is installed"
        docker compose version | head -1
        return 0
    else
        echo "  ERROR: Docker Compose plugin not found"
        echo "  Install with: sudo apt install docker-compose-plugin"
        return 1
    fi
}

#================================================
# TEST 3: Compose Config Resolves
#================================================
test_compose_config() {
    if docker compose config --services >/dev/null 2>&1; then
        echo "  docker-compose.yml resolves correctly"
        echo "  Services found: $(docker compose config --services | wc -l)"
        return 0
    else
        echo "  ERROR: docker compose config failed"
        return 1
    fi
}

#================================================
# TEST 4: Script Syntax Check
#================================================
test_script_syntax() {
    local errors=0
    
    # Check deploy_database_architecture.sh
    if bash -n deploy_database_architecture.sh 2>/dev/null; then
        echo "  ✓ deploy_database_architecture.sh syntax OK"
    else
        echo "  ✗ deploy_database_architecture.sh has syntax errors"
        ((errors++))
    fi
    
    # Check homelab-manager.sh
    if bash -n homelab-manager.sh 2>/dev/null; then
        echo "  ✓ homelab-manager.sh syntax OK"
    else
        echo "  ✗ homelab-manager.sh has syntax errors"
        ((errors++))
    fi
    
    # Check deployment scripts
    for script in deployment/*.sh; do
        if [ -f "$script" ]; then
            if bash -n "$script" 2>/dev/null; then
                echo "  ✓ $script syntax OK"
            else
                echo "  ✗ $script has syntax errors"
                ((errors++))
            fi
        fi
    done
    
    return $errors
}

#================================================
# TEST 5: Verify Backup Fix
#================================================
test_backup_fix() {
    # Check that the backup function uses variable superuser
    if grep -q 'pg_dumpall -U "$superuser"' deploy_database_architecture.sh; then
        echo "  ✓ Backup function uses dynamic superuser"
        
        # Check container detection logic
        if grep -q 'if \[ "$POSTGRES_CONTAINER" = "discord-bot-db" \]; then' deploy_database_architecture.sh; then
            echo "  ✓ Container detection logic present"
            return 0
        else
            echo "  ✗ Container detection logic missing"
            return 1
        fi
    else
        echo "  ✗ Backup function not fixed"
        return 1
    fi
}

#================================================
# TEST 6: Check Services Status
#================================================
test_services() {
    echo "  Current service status:"
    docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || {
        echo "  WARNING: Could not check service status"
        echo "  Services may not be running yet"
        return 0  # Don't fail - services might not be started
    }
    return 0
}

#================================================
# TEST 7: Verify Required Files
#================================================
test_required_files() {
    local missing=0
    
    if [ -f docker-compose.unified.yml ]; then
        echo "  ✓ docker-compose.unified.yml exists"
    else
        echo "  ✗ docker-compose.unified.yml missing"
        ((missing++))
    fi
    
    if [ -f homelab-manager.sh ]; then
        echo "  ✓ homelab-manager.sh exists"
    else
        echo "  ✗ homelab-manager.sh missing"
        ((missing++))
    fi
    
    if [ -f deploy_database_architecture.sh ]; then
        echo "  ✓ deploy_database_architecture.sh exists"
    else
        echo "  ✗ deploy_database_architecture.sh missing"
        ((missing++))
    fi
    
    if [ -f UBUNTU_STARTUP_GUIDE.md ]; then
        echo "  ✓ UBUNTU_STARTUP_GUIDE.md exists"
    else
        echo "  ✗ UBUNTU_STARTUP_GUIDE.md missing"
        ((missing++))
    fi
    
    if [ -f .env ]; then
        echo "  ✓ .env file exists"
    else
        echo "  ⚠ .env file missing (may need to generate)"
    fi
    
    return $missing
}

#================================================
# TEST 8: Test Database Connection (if running)
#================================================
test_database() {
    # Try both container names
    for container in homelab-postgres discord-bot-db; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            echo "  PostgreSQL container found: $container"
            
            if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then
                echo "  ✓ PostgreSQL is accepting connections"
                return 0
            elif docker exec "$container" pg_isready -U ticketbot >/dev/null 2>&1; then
                echo "  ✓ PostgreSQL is accepting connections (legacy user)"
                return 0
            else
                echo "  ⚠ PostgreSQL not ready yet"
                return 0  # Don't fail - might be starting
            fi
        fi
    done
    
    echo "  ⓘ PostgreSQL container not running (this is OK if not deployed yet)"
    return 0
}

#================================================
# RUN ALL TESTS
#================================================
cd ~/contain/HomeLabHub || {
    echo "ERROR: Could not find ~/contain/HomeLabHub"
    echo "Please run this script from your project directory or update the path"
    exit 1
}

echo "Running tests in: $(pwd)"
echo ""

run_test "1. Symlink Verification" "test_symlink"
run_test "2. Docker Compose Plugin" "test_docker_compose"
run_test "3. Compose Config Resolution" "test_compose_config"
run_test "4. Script Syntax Validation" "test_script_syntax"
run_test "5. Backup Permission Fix" "test_backup_fix"
run_test "6. Required Files Check" "test_required_files"
run_test "7. Services Status" "test_services"
run_test "8. Database Connection" "test_database"

#================================================
# SUMMARY
#================================================
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                     TEST RESULTS SUMMARY                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                  ALL TESTS PASSED ✓                            ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "✓ Your Ubuntu 20.10 deployment environment is correctly configured!"
    echo ""
    echo "Next steps:"
    echo "  1. Run: ./homelab-manager.sh"
    echo "  2. Select: 1) Full Deploy"
    echo "  3. Wait for deployment to complete"
    echo "  4. Select: 23) Run Full Deployment Verification"
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                  SOME TESTS FAILED ✗                           ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Please review the errors above and:"
    echo "  1. Check UBUNTU_STARTUP_GUIDE.md for setup instructions"
    echo "  2. Install missing dependencies"
    echo "  3. Re-run this test script"
    echo ""
    exit 1
fi
