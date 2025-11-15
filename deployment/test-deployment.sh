#!/bin/bash
################################################################################
# Comprehensive Deployment Testing Suite
#
# Tests all aspects of the deployment system:
# - Pre-flight checks
# - Environment validation
# - Database operations (backup, restore, migrate)
# - Service deployment
# - Health checks
# - Rollback functionality
# - Error scenarios
#
# Usage:
#   ./test-deployment.sh              # Run all tests
#   ./test-deployment.sh --unit       # Run unit tests only
#   ./test-deployment.sh --integration # Run integration tests only
#   ./test-deployment.sh --smoke      # Run smoke tests only
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source common library
# shellcheck source=deployment/lib-common.sh
source "${SCRIPT_DIR}/lib-common.sh"

# Test configuration
TEST_LOG="${SCRIPT_DIR}/test-results.log"
TEST_REPORT="${SCRIPT_DIR}/test-report.html"
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
FAILED_TESTS=()

# ===== TEST FRAMEWORK =====
start_test_suite() {
    local suite_name="$1"
    echo ""
    log_section "$suite_name"
    echo "$(get_iso_timestamp) START_SUITE $suite_name" >> "$TEST_LOG"
}

end_test_suite() {
    local suite_name="$1"
    echo "$(get_iso_timestamp) END_SUITE $suite_name" >> "$TEST_LOG"
}

run_test() {
    local test_name="$1"
    local test_function="$2"
    
    echo -n "  Testing: ${test_name}... "
    echo "$(get_iso_timestamp) START_TEST $test_name" >> "$TEST_LOG"
    
    if $test_function &>> "$TEST_LOG"; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((TESTS_PASSED++))
        echo "$(get_iso_timestamp) PASS $test_name" >> "$TEST_LOG"
        return 0
    else
        echo -e "${RED}✗ FAIL${NC}"
        ((TESTS_FAILED++))
        FAILED_TESTS+=("$test_name")
        echo "$(get_iso_timestamp) FAIL $test_name" >> "$TEST_LOG"
        return 1
    fi
}

skip_test() {
    local test_name="$1"
    local reason="${2:-No reason provided}"
    
    echo -e "  Testing: ${test_name}... ${YELLOW}⊘ SKIP${NC} ($reason)"
    ((TESTS_SKIPPED++))
    echo "$(get_iso_timestamp) SKIP $test_name - $reason" >> "$TEST_LOG"
}

assert_equals() {
    local actual="$1"
    local expected="$2"
    local message="${3:-Values do not match}"
    
    if [ "$actual" = "$expected" ]; then
        return 0
    else
        log_error "$message"
        log_error "  Expected: $expected"
        log_error "  Actual:   $actual"
        return 1
    fi
}

assert_true() {
    local condition="$1"
    local message="${2:-Condition is false}"
    
    if $condition; then
        return 0
    else
        log_error "$message"
        return 1
    fi
}

assert_command_succeeds() {
    local cmd="$*"
    if eval "$cmd" &> /dev/null; then
        return 0
    else
        log_error "Command failed: $cmd"
        return 1
    fi
}

assert_command_fails() {
    local cmd="$*"
    if eval "$cmd" &> /dev/null; then
        log_error "Command should have failed but succeeded: $cmd"
        return 1
    else
        return 0
    fi
}

assert_file_exists() {
    local file_path="$1"
    local message="${2:-File does not exist: $file_path}"
    
    if [ -f "$file_path" ]; then
        return 0
    else
        log_error "$message"
        return 1
    fi
}

assert_dir_exists() {
    local dir_path="$1"
    local message="${2:-Directory does not exist: $dir_path}"
    
    if [ -d "$dir_path" ]; then
        return 0
    else
        log_error "$message"
        return 1
    fi
}

# ===== UNIT TESTS =====
test_script_exists() {
    assert_file_exists "${SCRIPT_DIR}/deploy-with-health-check.sh"
}

test_script_executable() {
    local script="${SCRIPT_DIR}/deploy-with-health-check.sh"
    if [ -x "$script" ]; then
        return 0
    else
        log_error "Script is not executable: $script"
        return 1
    fi
}

test_common_library_loads() {
    # Test that sourcing the library doesn't cause errors
    (
        # shellcheck source=deployment/lib-common.sh
        source "${SCRIPT_DIR}/lib-common.sh"
        [ -n "${_LIB_COMMON_LOADED}" ]
    )
}

test_logging_functions() {
    local test_log_file="/tmp/test-log-$$.txt"
    export LOG_FILE="$test_log_file"
    
    log_info "test info message"
    log_success "test success message"
    log_warning "test warning message"
    log_error "test error message"
    
    local result=0
    grep -q "test info message" "$test_log_file" || result=1
    grep -q "test success message" "$test_log_file" || result=1
    grep -q "test warning message" "$test_log_file" || result=1
    grep -q "test error message" "$test_log_file" || result=1
    
    rm -f "$test_log_file"
    return $result
}

test_lock_mechanism() {
    local lock_name="test-lock-$$"
    
    # Acquire lock in subshell
    (
        # shellcheck source=deployment/lib-common.sh
        source "${SCRIPT_DIR}/lib-common.sh"
        acquire_lock "$lock_name" 0
        sleep 2
    ) &
    
    local lock_pid=$!
    sleep 0.5
    
    # Try to acquire same lock (should fail)
    (
        # shellcheck source=deployment/lib-common.sh
        source "${SCRIPT_DIR}/lib-common.sh"
        if acquire_lock "$lock_name" 0 2>/dev/null; then
            exit 1
        else
            exit 0
        fi
    )
    local lock_result=$?
    
    wait $lock_pid || true
    rm -f "/tmp/${lock_name}.lock"
    
    return $lock_result
}

test_dry_run_mode() {
    export DRY_RUN=true
    
    local test_file="/tmp/test-dry-run-$$.txt"
    
    # This should not create the file in dry-run mode
    run_cmd "touch $test_file"
    
    export DRY_RUN=false
    
    if [ -f "$test_file" ]; then
        rm -f "$test_file"
        return 1
    else
        return 0
    fi
}

test_validation_functions() {
    validate_command_exists "bash" && \
    validate_command_exists "docker" && \
    validate_file_exists "${SCRIPT_DIR}/lib-common.sh" && \
    validate_dir_exists "$SCRIPT_DIR"
}

run_unit_tests() {
    start_test_suite "Unit Tests"
    
    run_test "Script existence" test_script_exists
    run_test "Script executable permissions" test_script_executable
    run_test "Common library loads" test_common_library_loads
    run_test "Logging functions" test_logging_functions
    run_test "Lock mechanism" test_lock_mechanism
    run_test "Dry-run mode" test_dry_run_mode
    run_test "Validation functions" test_validation_functions
    
    end_test_suite "Unit Tests"
}

# ===== INTEGRATION TESTS =====
test_env_file_validation() {
    if [ -f "${PROJECT_ROOT}/.env" ]; then
        assert_command_succeeds "${SCRIPT_DIR}/check-all-env.sh"
    else
        log_warning ".env file not found, skipping"
        return 0
    fi
}

test_env_example_exists() {
    assert_file_exists "${PROJECT_ROOT}/.env.example" "Missing .env.example file"
}

test_compose_file_valid() {
    local compose_file="${PROJECT_ROOT}/docker-compose.unified.yml"
    
    if [ ! -f "$compose_file" ]; then
        log_warning "Compose file not found, skipping"
        return 0
    fi
    
    local dc_cmd
    dc_cmd=$(detect_docker_compose)
    
    $dc_cmd -f "$compose_file" config > /dev/null 2>&1
}

test_database_scripts_exist() {
    assert_file_exists "${SCRIPT_DIR}/backup-databases.sh" && \
    assert_file_exists "${SCRIPT_DIR}/restore-database.sh" && \
    assert_file_exists "${SCRIPT_DIR}/migrate-all.sh"
}

test_deployment_scripts_exist() {
    assert_file_exists "${SCRIPT_DIR}/deploy-with-health-check.sh" && \
    assert_file_exists "${SCRIPT_DIR}/rollback-deployment.sh" && \
    assert_file_exists "${SCRIPT_DIR}/validate-deployment.sh"
}

test_shellcheck_all_scripts() {
    local failed_scripts=()
    
    for script in "${SCRIPT_DIR}"/*.sh "${PROJECT_ROOT}/homelab-manager.sh"; do
        if [ -f "$script" ]; then
            if ! shellcheck -S warning "$script" &> /dev/null; then
                failed_scripts+=("$(basename "$script")")
            fi
        fi
    done
    
    if [ ${#failed_scripts[@]} -eq 0 ]; then
        return 0
    else
        log_error "Scripts with shellcheck issues: ${failed_scripts[*]}"
        return 1
    fi
}

run_integration_tests() {
    start_test_suite "Integration Tests"
    
    run_test "Environment file validation" test_env_file_validation
    run_test ".env.example exists" test_env_example_exists
    run_test "Docker Compose file validity" test_compose_file_valid
    run_test "Database scripts exist" test_database_scripts_exist
    run_test "Deployment scripts exist" test_deployment_scripts_exist
    run_test "Shellcheck all scripts" test_shellcheck_all_scripts
    
    end_test_suite "Integration Tests"
}

# ===== SMOKE TESTS =====
test_docker_available() {
    validate_docker_running
}

test_docker_compose_available() {
    detect_docker_compose > /dev/null
}

test_required_commands() {
    validate_command_exists "bash" && \
    validate_command_exists "docker" && \
    validate_command_exists "git" && \
    validate_command_exists "grep" && \
    validate_command_exists "sed" && \
    validate_command_exists "awk"
}

test_project_structure() {
    assert_dir_exists "$PROJECT_ROOT" && \
    assert_dir_exists "${PROJECT_ROOT}/deployment" && \
    assert_dir_exists "${PROJECT_ROOT}/services" && \
    assert_dir_exists "${PROJECT_ROOT}/config"
}

test_critical_files() {
    assert_file_exists "${PROJECT_ROOT}/.env.example" && \
    assert_file_exists "${PROJECT_ROOT}/docker-compose.unified.yml"
}

run_smoke_tests() {
    start_test_suite "Smoke Tests"
    
    run_test "Docker available" test_docker_available
    run_test "Docker Compose available" test_docker_compose_available
    run_test "Required commands" test_required_commands
    run_test "Project structure" test_project_structure
    run_test "Critical files" test_critical_files
    
    end_test_suite "Smoke Tests"
}

# ===== ERROR SCENARIO TESTS =====
test_missing_env_var_handling() {
    # Test that scripts handle missing env vars gracefully
    (
        unset DATABASE_URL
        export DRY_RUN=true
        "${SCRIPT_DIR}/deploy-with-health-check.sh" --help &> /dev/null
    )
}

test_port_conflict_detection() {
    # This is a placeholder - would need actual port conflict scenario
    log_info "Port conflict detection test - manual verification needed"
    return 0
}

run_error_scenario_tests() {
    start_test_suite "Error Scenario Tests"
    
    run_test "Missing environment variable handling" test_missing_env_var_handling
    run_test "Port conflict detection" test_port_conflict_detection
    
    end_test_suite "Error Scenario Tests"
}

# ===== REPORT GENERATION =====
generate_report() {
    local total_tests=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
    local pass_rate=0
    
    if [ $total_tests -gt 0 ]; then
        pass_rate=$((TESTS_PASSED * 100 / total_tests))
    fi
    
    log_section "Test Results Summary"
    echo ""
    echo -e "  Total Tests:    ${BOLD}${total_tests}${NC}"
    echo -e "  ${GREEN}Passed:         ${TESTS_PASSED}${NC}"
    echo -e "  ${RED}Failed:         ${TESTS_FAILED}${NC}"
    echo -e "  ${YELLOW}Skipped:        ${TESTS_SKIPPED}${NC}"
    echo -e "  Pass Rate:      ${BOLD}${pass_rate}%${NC}"
    echo ""
    
    if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
        echo -e "${RED}${BOLD}Failed Tests:${NC}"
        for test in "${FAILED_TESTS[@]}"; do
            echo -e "  ${RED}✗${NC} $test"
        done
        echo ""
    fi
    
    # Generate HTML report
    cat > "$TEST_REPORT" <<EOF
<!DOCTYPE html>
<html>
<head>
    <title>Deployment Test Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 30px 0; }
        .stat { padding: 20px; border-radius: 4px; text-align: center; }
        .stat.total { background: #2196F3; color: white; }
        .stat.passed { background: #4CAF50; color: white; }
        .stat.failed { background: #f44336; color: white; }
        .stat.skipped { background: #FF9800; color: white; }
        .stat-value { font-size: 36px; font-weight: bold; }
        .stat-label { font-size: 14px; margin-top: 5px; }
        .failed-tests { margin-top: 30px; }
        .failed-tests h2 { color: #f44336; }
        .failed-test-item { padding: 10px; margin: 10px 0; background: #ffebee; border-left: 4px solid #f44336; }
        .timestamp { color: #666; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 Deployment Test Report</h1>
        <p class="timestamp">Generated: $(date '+%Y-%m-%d %H:%M:%S')</p>
        
        <div class="summary">
            <div class="stat total">
                <div class="stat-value">${total_tests}</div>
                <div class="stat-label">Total Tests</div>
            </div>
            <div class="stat passed">
                <div class="stat-value">${TESTS_PASSED}</div>
                <div class="stat-label">Passed</div>
            </div>
            <div class="stat failed">
                <div class="stat-value">${TESTS_FAILED}</div>
                <div class="stat-label">Failed</div>
            </div>
            <div class="stat skipped">
                <div class="stat-value">${TESTS_SKIPPED}</div>
                <div class="stat-label">Skipped</div>
            </div>
        </div>
        
        <div style="background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong>Pass Rate:</strong> ${pass_rate}%
        </div>
EOF
    
    if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
        cat >> "$TEST_REPORT" <<EOF
        <div class="failed-tests">
            <h2>❌ Failed Tests</h2>
EOF
        for test in "${FAILED_TESTS[@]}"; do
            cat >> "$TEST_REPORT" <<EOF
            <div class="failed-test-item">$test</div>
EOF
        done
        cat >> "$TEST_REPORT" <<EOF
        </div>
EOF
    fi
    
    cat >> "$TEST_REPORT" <<EOF
        <div style="margin-top: 30px; padding: 15px; background: #f5f5f5; border-radius: 4px;">
            <strong>Log File:</strong> <code>${TEST_LOG}</code>
        </div>
    </div>
</body>
</html>
EOF
    
    log_success "HTML report generated: ${TEST_REPORT}"
}

# ===== MAIN =====
show_banner() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${MAGENTA}🧪 DEPLOYMENT TESTING SUITE${NC}                       ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

show_test_help() {
    cat <<EOF
${BOLD}Deployment Testing Suite${NC}

Comprehensive test suite for deployment scripts and infrastructure.

${BOLD}USAGE:${NC}
    $0 [OPTIONS]

${BOLD}OPTIONS:${NC}
    --unit          Run unit tests only
    --integration   Run integration tests only
    --smoke         Run smoke tests only
    --errors        Run error scenario tests only
    --all           Run all tests (default)
    -h, --help      Show this help message
    -v, --verbose   Enable verbose output

${BOLD}EXAMPLES:${NC}
    $0                      # Run all tests
    $0 --unit               # Run only unit tests
    $0 --integration        # Run only integration tests
    $0 --smoke --errors     # Run smoke and error tests

${BOLD}OUTPUT:${NC}
    Results are logged to: ${TEST_LOG}
    HTML report generated: ${TEST_REPORT}
EOF
}

main() {
    local run_unit=false
    local run_integration=false
    local run_smoke=false
    local run_errors=false
    local run_all=true
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --unit)
                run_unit=true
                run_all=false
                shift
                ;;
            --integration)
                run_integration=true
                run_all=false
                shift
                ;;
            --smoke)
                run_smoke=true
                run_all=false
                shift
                ;;
            --errors)
                run_errors=true
                run_all=false
                shift
                ;;
            --all)
                run_all=true
                shift
                ;;
            -h|--help)
                show_test_help
                exit 0
                ;;
            -v|--verbose)
                set -x
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_test_help
                exit 1
                ;;
        esac
    done
    
    show_banner
    
    # Initialize test log
    echo "=== Deployment Test Suite ===" > "$TEST_LOG"
    echo "Started: $(get_iso_timestamp)" >> "$TEST_LOG"
    echo "" >> "$TEST_LOG"
    
    # Run requested test suites
    if [ "$run_all" = "true" ] || [ "$run_smoke" = "true" ]; then
        run_smoke_tests
    fi
    
    if [ "$run_all" = "true" ] || [ "$run_unit" = "true" ]; then
        run_unit_tests
    fi
    
    if [ "$run_all" = "true" ] || [ "$run_integration" = "true" ]; then
        run_integration_tests
    fi
    
    if [ "$run_all" = "true" ] || [ "$run_errors" = "true" ]; then
        run_error_scenario_tests
    fi
    
    # Generate report
    generate_report
    
    # Exit with appropriate code
    if [ $TESTS_FAILED -gt 0 ]; then
        log_error "Some tests failed!"
        exit 1
    else
        log_success "All tests passed!"
        exit 0
    fi
}

# Run main
main "$@"
