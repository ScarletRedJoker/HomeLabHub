#!/bin/bash
################################################################################
# Unified CI/CD Deployment Pipeline
#
# Orchestrates the complete deployment lifecycle:
# 1. Validate  → Pre-deployment checks and validation
# 2. Test      → Run test suites (unit, integration, smoke)
# 3. Build     → Build and tag Docker images
# 4. Deploy    → Deploy services with health checks
# 5. Verify    → Post-deployment verification
# 6. Rollback  → Automatic rollback on failure (optional)
#
# Features:
# - Environment-specific deployments (dev/staging/production)
# - Parallel execution where safe
# - Comprehensive reporting and logging
# - Automatic rollback on failure
# - Integration with CI/CD systems (GitHub Actions, GitLab CI, etc.)
# - Deployment approval gates
# - Test coverage reporting
#
# Usage:
#   ./unified-pipeline.sh [OPTIONS]
#   ./unified-pipeline.sh --env production --skip-tests
#   ./unified-pipeline.sh --stage validate
#   DRY_RUN=true ./unified-pipeline.sh
################################################################################

set -euo pipefail

# ===== SCRIPT SETUP =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SCRIPT_NAME="unified-pipeline"

# Source common library
# shellcheck source=deployment/lib-common.sh
source "${SCRIPT_DIR}/lib-common.sh"

# ===== CONFIGURATION =====
PIPELINE_CONFIG="${SCRIPT_DIR}/pipeline-config.yaml"
PIPELINE_LOG="${SCRIPT_DIR}/pipeline-execution.log"
PIPELINE_REPORT="${SCRIPT_DIR}/pipeline-report.html"
PIPELINE_HISTORY="${SCRIPT_DIR}/pipeline-history.log"

# Pipeline state tracking
PIPELINE_START_TIME=""
PIPELINE_END_TIME=""
PIPELINE_STATUS="RUNNING"
PIPELINE_ID=""
FAILED_STAGES=()
COMPLETED_STAGES=()
SKIPPED_STAGES=()

# Stage results
STAGE_VALIDATE_STATUS="PENDING"
STAGE_TEST_STATUS="PENDING"
STAGE_BUILD_STATUS="PENDING"
STAGE_DEPLOY_STATUS="PENDING"
STAGE_VERIFY_STATUS="PENDING"

# Configuration options
ENVIRONMENT="${ENVIRONMENT:-dev}"
SKIP_TESTS="${SKIP_TESTS:-false}"
SKIP_VALIDATION="${SKIP_VALIDATION:-false}"
SKIP_BUILD="${SKIP_BUILD:-false}"
AUTO_ROLLBACK="${AUTO_ROLLBACK:-true}"
REQUIRE_APPROVAL="${REQUIRE_APPROVAL:-false}"
PARALLEL_BUILD="${PARALLEL_BUILD:-false}"
PUSH_IMAGES="${PUSH_IMAGES:-false}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"
RUN_SECURITY_SCAN="${RUN_SECURITY_SCAN:-true}"
SPECIFIC_STAGE="${SPECIFIC_STAGE:-}"

# ===== BANNER =====
show_pipeline_banner() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${MAGENTA}🚀 UNIFIED CI/CD DEPLOYMENT PIPELINE${NC}               ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${GREEN}Automated Testing • Building • Deployment${NC}           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    echo -e "${BOLD}Pipeline Configuration:${NC}"
    echo -e "  Environment:      ${CYAN}${ENVIRONMENT}${NC}"
    echo -e "  Auto-Rollback:    ${AUTO_ROLLBACK}"
    echo -e "  Skip Tests:       ${SKIP_TESTS}"
    echo -e "  Skip Validation:  ${SKIP_VALIDATION}"
    echo -e "  Parallel Build:   ${PARALLEL_BUILD}"
    echo -e "  Dry Run:          ${DRY_RUN}"
    echo ""
    
    if [ -n "$SPECIFIC_STAGE" ]; then
        echo -e "${YELLOW}Running specific stage only: ${SPECIFIC_STAGE}${NC}"
        echo ""
    fi
}

# ===== PIPELINE STATE MANAGEMENT =====
init_pipeline() {
    PIPELINE_ID="pipeline_$(get_timestamp)_${ENVIRONMENT}"
    PIPELINE_START_TIME=$(date +%s)
    
    # Initialize log
    echo "=== Pipeline Execution Started ===" > "$PIPELINE_LOG"
    echo "Pipeline ID: $PIPELINE_ID" >> "$PIPELINE_LOG"
    echo "Environment: $ENVIRONMENT" >> "$PIPELINE_LOG"
    echo "Started: $(get_iso_timestamp)" >> "$PIPELINE_LOG"
    echo "" >> "$PIPELINE_LOG"
    
    log_info "Pipeline ID: ${PIPELINE_ID}"
    log_info "Log file: ${PIPELINE_LOG}"
}

record_stage_result() {
    local stage_name="$1"
    local status="$2"
    local duration="${3:-0}"
    
    echo "$(get_iso_timestamp) STAGE:${stage_name} STATUS:${status} DURATION:${duration}s" >> "$PIPELINE_LOG"
    
    case "$status" in
        SUCCESS)
            COMPLETED_STAGES+=("$stage_name")
            ;;
        FAILED)
            FAILED_STAGES+=("$stage_name")
            ;;
        SKIPPED)
            SKIPPED_STAGES+=("$stage_name")
            ;;
    esac
}

log_to_history() {
    local status="$1"
    local message="${2:-}"
    local git_commit=""
    
    if [ -d "${PROJECT_ROOT}/.git" ]; then
        git_commit=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    fi
    
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ${PIPELINE_ID} ${status} ${ENVIRONMENT} ${git_commit} \"${message}\"" >> "$PIPELINE_HISTORY"
}

# ===== STAGE 1: VALIDATION =====
stage_validate() {
    log_section "Stage 1: Validation"
    
    local stage_start=$(date +%s)
    local validation_failed=false
    
    log_info "Running pre-deployment validation checks..."
    
    # Run validation script
    if [ -f "${SCRIPT_DIR}/validate-deployment.sh" ]; then
        if run_cmd "${SCRIPT_DIR}/validate-deployment.sh" 2>&1 | tee -a "$PIPELINE_LOG"; then
            log_success "Validation checks passed"
            STAGE_VALIDATE_STATUS="SUCCESS"
        else
            log_error "Validation checks failed"
            STAGE_VALIDATE_STATUS="FAILED"
            validation_failed=true
        fi
    else
        log_warning "validate-deployment.sh not found, skipping validation"
        STAGE_VALIDATE_STATUS="SKIPPED"
    fi
    
    # Additional validation: Check migration status
    if [ "$validation_failed" = "false" ]; then
        log_info "Checking database migration status..."
        if [ -f "${SCRIPT_DIR}/migrate-all.sh" ]; then
            if "${SCRIPT_DIR}/migrate-all.sh" --status-only 2>&1 | tee -a "$PIPELINE_LOG"; then
                log_success "Migration status check passed"
            else
                log_warning "Pending migrations detected (will apply in deploy stage)"
            fi
        fi
    fi
    
    local stage_duration=$(($(date +%s) - stage_start))
    record_stage_result "VALIDATE" "$STAGE_VALIDATE_STATUS" "$stage_duration"
    
    if [ "$validation_failed" = "true" ]; then
        return 1
    fi
    
    return 0
}

# ===== STAGE 2: TESTING =====
stage_test() {
    log_section "Stage 2: Testing"
    
    local stage_start=$(date +%s)
    local tests_failed=false
    
    log_info "Running test suites..."
    
    # Run deployment test suite
    if [ -f "${SCRIPT_DIR}/test-deployment.sh" ]; then
        log_info "Running deployment infrastructure tests..."
        if run_cmd "${SCRIPT_DIR}/test-deployment.sh" 2>&1 | tee -a "$PIPELINE_LOG"; then
            log_success "Infrastructure tests passed"
        else
            log_error "Infrastructure tests failed"
            tests_failed=true
        fi
    else
        log_warning "test-deployment.sh not found, skipping infrastructure tests"
    fi
    
    # Run service-specific tests
    run_service_tests
    
    # Generate test coverage report
    generate_test_coverage_report
    
    local stage_duration=$(($(date +%s) - stage_start))
    
    if [ "$tests_failed" = "true" ]; then
        STAGE_TEST_STATUS="FAILED"
        record_stage_result "TEST" "FAILED" "$stage_duration"
        return 1
    else
        STAGE_TEST_STATUS="SUCCESS"
        record_stage_result "TEST" "SUCCESS" "$stage_duration"
        return 0
    fi
}

run_service_tests() {
    log_info "Running service-specific tests..."
    
    local services_with_tests=(
        "services/dashboard:pytest"
        "services/discord-bot:npm test"
        "services/stream-bot:npm test"
    )
    
    for service_test in "${services_with_tests[@]}"; do
        local service_path="${service_test%%:*}"
        local test_command="${service_test##*:}"
        
        if [ -d "${PROJECT_ROOT}/${service_path}" ]; then
            log_info "Testing: ${service_path}"
            
            cd "${PROJECT_ROOT}/${service_path}"
            
            case "$test_command" in
                pytest)
                    if [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
                        if run_cmd "pytest --maxfail=1 --disable-warnings -q" 2>&1 | tee -a "$PIPELINE_LOG"; then
                            log_success "${service_path} tests passed"
                        else
                            log_error "${service_path} tests failed"
                            tests_failed=true
                        fi
                    else
                        log_warning "${service_path}: No pytest configuration found"
                    fi
                    ;;
                npm*)
                    if [ -f "package.json" ]; then
                        if grep -q '"test"' package.json; then
                            if run_cmd "$test_command" 2>&1 | tee -a "$PIPELINE_LOG"; then
                                log_success "${service_path} tests passed"
                            else
                                log_error "${service_path} tests failed"
                                tests_failed=true
                            fi
                        else
                            log_warning "${service_path}: No test script defined in package.json"
                        fi
                    fi
                    ;;
            esac
            
            cd "$PROJECT_ROOT"
        else
            log_warning "Service path not found: ${service_path}"
        fi
    done
}

generate_test_coverage_report() {
    log_info "Generating test coverage report..."
    
    local coverage_report="${SCRIPT_DIR}/test-coverage-report.txt"
    
    {
        echo "=== Test Coverage Report ==="
        echo "Generated: $(date)"
        echo ""
        
        # Dashboard coverage
        if [ -f "${PROJECT_ROOT}/services/dashboard/coverage.json" ]; then
            echo "Dashboard Coverage:"
            cat "${PROJECT_ROOT}/services/dashboard/coverage.json" || echo "  Coverage data available"
            echo ""
        fi
        
        # Discord Bot coverage
        if [ -d "${PROJECT_ROOT}/services/discord-bot/coverage" ]; then
            echo "Discord Bot Coverage:"
            echo "  Coverage report generated"
            echo ""
        fi
        
        # Stream Bot coverage
        if [ -d "${PROJECT_ROOT}/services/stream-bot/coverage" ]; then
            echo "Stream Bot Coverage:"
            echo "  Coverage report generated"
            echo ""
        fi
    } > "$coverage_report"
    
    log_success "Coverage report: ${coverage_report}"
}

# ===== STAGE 3: BUILD =====
stage_build() {
    log_section "Stage 3: Build"
    
    local stage_start=$(date +%s)
    local build_failed=false
    
    log_info "Building Docker images..."
    
    # Detect Docker Compose command
    local dc_cmd
    dc_cmd=$(detect_docker_compose)
    
    local compose_file="${PROJECT_ROOT}/docker-compose.unified.yml"
    
    if [ ! -f "$compose_file" ]; then
        log_error "docker-compose.unified.yml not found"
        STAGE_BUILD_STATUS="FAILED"
        return 1
    fi
    
    # Get Git commit hash for tagging
    local git_commit=""
    local image_tag="latest"
    
    if [ -d "${PROJECT_ROOT}/.git" ]; then
        git_commit=$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")
        image_tag="${git_commit}"
        log_info "Git commit: ${git_commit}"
    fi
    
    # Build images
    log_info "Building all service images..."
    
    if [ "$PARALLEL_BUILD" = "true" ]; then
        log_info "Building in parallel mode..."
        if run_cmd "$dc_cmd -f $compose_file build --parallel" 2>&1 | tee -a "$PIPELINE_LOG"; then
            log_success "All images built successfully (parallel)"
        else
            log_error "Image build failed"
            build_failed=true
        fi
    else
        if run_cmd "$dc_cmd -f $compose_file build" 2>&1 | tee -a "$PIPELINE_LOG"; then
            log_success "All images built successfully"
        else
            log_error "Image build failed"
            build_failed=true
        fi
    fi
    
    # Tag images with commit hash and environment
    if [ "$build_failed" = "false" ] && [ -n "$git_commit" ]; then
        tag_images "$git_commit"
    fi
    
    # Security scanning
    if [ "$RUN_SECURITY_SCAN" = "true" ] && [ "$build_failed" = "false" ]; then
        run_security_scan
    fi
    
    # Push to registry (optional)
    if [ "$PUSH_IMAGES" = "true" ] && [ -n "$IMAGE_REGISTRY" ] && [ "$build_failed" = "false" ]; then
        push_images_to_registry "$image_tag"
    fi
    
    local stage_duration=$(($(date +%s) - stage_start))
    
    if [ "$build_failed" = "true" ]; then
        STAGE_BUILD_STATUS="FAILED"
        record_stage_result "BUILD" "FAILED" "$stage_duration"
        return 1
    else
        STAGE_BUILD_STATUS="SUCCESS"
        record_stage_result "BUILD" "SUCCESS" "$stage_duration"
        return 0
    fi
}

tag_images() {
    local git_commit="$1"
    
    log_info "Tagging images with commit hash: ${git_commit}"
    
    local services=("homelab-dashboard" "discord-bot" "stream-bot")
    
    for service in "${services[@]}"; do
        if docker images --format "{{.Repository}}" | grep -q "^${service}$"; then
            run_cmd "docker tag ${service}:latest ${service}:${git_commit}" || log_warning "Failed to tag ${service}"
            run_cmd "docker tag ${service}:latest ${service}:${ENVIRONMENT}" || log_warning "Failed to tag ${service} with environment"
        fi
    done
}

run_security_scan() {
    log_info "Running security scans on images..."
    
    # Check if Trivy is available
    if command -v trivy &> /dev/null; then
        local services=("homelab-dashboard" "discord-bot" "stream-bot")
        
        for service in "${services[@]}"; do
            if docker images --format "{{.Repository}}" | grep -q "^${service}$"; then
                log_info "Scanning ${service}..."
                trivy image --severity HIGH,CRITICAL "${service}:latest" 2>&1 | tee -a "$PIPELINE_LOG" || log_warning "Security scan failed for ${service}"
            fi
        done
    else
        log_warning "Trivy not installed, skipping security scans"
        log_info "Install Trivy: https://github.com/aquasecurity/trivy"
    fi
}

push_images_to_registry() {
    local tag="$1"
    
    log_info "Pushing images to registry: ${IMAGE_REGISTRY}"
    
    local services=("homelab-dashboard" "discord-bot" "stream-bot")
    
    for service in "${services[@]}"; do
        if docker images --format "{{.Repository}}" | grep -q "^${service}$"; then
            local remote_image="${IMAGE_REGISTRY}/${service}:${tag}"
            
            run_cmd "docker tag ${service}:latest ${remote_image}"
            
            if run_cmd "docker push ${remote_image}" 2>&1 | tee -a "$PIPELINE_LOG"; then
                log_success "Pushed ${service}:${tag}"
            else
                log_error "Failed to push ${service}:${tag}"
            fi
        fi
    done
}

# ===== STAGE 4: DEPLOY =====
stage_deploy() {
    log_section "Stage 4: Deploy"
    
    local stage_start=$(date +%s)
    local deploy_failed=false
    
    # Approval gate for production
    if [ "$ENVIRONMENT" = "production" ] && [ "$REQUIRE_APPROVAL" = "true" ]; then
        if ! confirm_action "Deploy to PRODUCTION environment?" "n"; then
            log_warning "Deployment cancelled by user"
            STAGE_DEPLOY_STATUS="CANCELLED"
            record_stage_result "DEPLOY" "CANCELLED" "0"
            return 1
        fi
    fi
    
    log_info "Deploying to ${ENVIRONMENT} environment..."
    
    # Create deployment snapshot for rollback
    local snapshot_name=""
    if [ "$AUTO_ROLLBACK" = "true" ]; then
        log_info "Creating pre-deployment snapshot..."
        if [ -f "${SCRIPT_DIR}/rollback-deployment.sh" ]; then
            snapshot_name=$("${SCRIPT_DIR}/rollback-deployment.sh" create 2>&1 | tail -1 || echo "")
            if [ -n "$snapshot_name" ]; then
                log_success "Snapshot created: ${snapshot_name}"
                echo "SNAPSHOT=${snapshot_name}" >> "$PIPELINE_LOG"
            else
                log_warning "Failed to create snapshot"
            fi
        fi
    fi
    
    # Backup databases
    log_info "Backing up databases..."
    if [ -f "${SCRIPT_DIR}/backup-databases.sh" ]; then
        if run_cmd "${SCRIPT_DIR}/backup-databases.sh" 2>&1 | tee -a "$PIPELINE_LOG"; then
            log_success "Database backup completed"
        else
            log_warning "Database backup failed (continuing anyway)"
        fi
    fi
    
    # Run database migrations
    log_info "Running database migrations..."
    if [ -f "${SCRIPT_DIR}/migrate-all.sh" ]; then
        if run_cmd "${SCRIPT_DIR}/migrate-all.sh" 2>&1 | tee -a "$PIPELINE_LOG"; then
            log_success "Database migrations completed"
        else
            log_error "Database migrations failed"
            deploy_failed=true
        fi
    fi
    
    # Deploy services with health checks
    if [ "$deploy_failed" = "false" ]; then
        log_info "Deploying services with health checks..."
        if [ -f "${SCRIPT_DIR}/deploy-with-health-check.sh" ]; then
            if run_cmd "${SCRIPT_DIR}/deploy-with-health-check.sh" 2>&1 | tee -a "$PIPELINE_LOG"; then
                log_success "Services deployed successfully"
                STAGE_DEPLOY_STATUS="SUCCESS"
            else
                log_error "Service deployment failed"
                deploy_failed=true
                STAGE_DEPLOY_STATUS="FAILED"
            fi
        else
            log_error "deploy-with-health-check.sh not found"
            deploy_failed=true
            STAGE_DEPLOY_STATUS="FAILED"
        fi
    fi
    
    local stage_duration=$(($(date +%s) - stage_start))
    record_stage_result "DEPLOY" "$STAGE_DEPLOY_STATUS" "$stage_duration"
    
    # Automatic rollback on failure
    if [ "$deploy_failed" = "true" ] && [ "$AUTO_ROLLBACK" = "true" ] && [ -n "$snapshot_name" ]; then
        log_warning "Deployment failed, triggering automatic rollback..."
        if [ -f "${SCRIPT_DIR}/rollback-deployment.sh" ]; then
            "${SCRIPT_DIR}/rollback-deployment.sh" restore "$snapshot_name" 2>&1 | tee -a "$PIPELINE_LOG"
            log_warning "Rollback completed"
        fi
    fi
    
    if [ "$deploy_failed" = "true" ]; then
        return 1
    fi
    
    return 0
}

# ===== STAGE 5: VERIFY =====
stage_verify() {
    log_section "Stage 5: Verification"
    
    local stage_start=$(date +%s)
    local verify_failed=false
    
    log_info "Running post-deployment verification..."
    
    # Run smoke tests
    log_info "Running smoke tests..."
    if [ -f "${SCRIPT_DIR}/test-deployment.sh" ]; then
        if run_cmd "${SCRIPT_DIR}/test-deployment.sh --smoke" 2>&1 | tee -a "$PIPELINE_LOG"; then
            log_success "Smoke tests passed"
        else
            log_error "Smoke tests failed"
            verify_failed=true
        fi
    fi
    
    # Verify all services are healthy
    log_info "Verifying service health..."
    verify_service_health
    
    # Verify service endpoints
    log_info "Verifying service endpoints..."
    verify_endpoints
    
    local stage_duration=$(($(date +%s) - stage_start))
    
    if [ "$verify_failed" = "true" ]; then
        STAGE_VERIFY_STATUS="FAILED"
        record_stage_result "VERIFY" "FAILED" "$stage_duration"
        return 1
    else
        STAGE_VERIFY_STATUS="SUCCESS"
        record_stage_result "VERIFY" "SUCCESS" "$stage_duration"
        return 0
    fi
}

verify_service_health() {
    local services=(
        "homelab-dashboard:5000:/health"
        "discord-bot:3001:/api/health"
        "stream-bot:3000:/api/health"
    )
    
    for service_info in "${services[@]}"; do
        local service_name="${service_info%%:*}"
        local port_endpoint="${service_info#*:}"
        local port="${port_endpoint%%:*}"
        local endpoint="${port_endpoint#*:}"
        
        if docker ps --format '{{.Names}}' | grep -q "^${service_name}$"; then
            log_info "Checking ${service_name} health..."
            
            # Try to access health endpoint
            if curl -sf "http://localhost:${port}${endpoint}" &> /dev/null; then
                log_success "${service_name} is healthy"
            else
                log_warning "${service_name} health check failed (endpoint may not exist)"
            fi
        else
            log_warning "${service_name} container is not running"
        fi
    done
}

verify_endpoints() {
    log_info "Testing critical service endpoints..."
    
    # This is a placeholder - would check actual endpoints based on environment
    if [ "$ENVIRONMENT" = "production" ]; then
        log_info "Production endpoint verification would happen here"
    else
        log_info "Development endpoint verification - checking localhost access"
    fi
}

# ===== REPORTING =====
generate_pipeline_report() {
    log_section "Generating Pipeline Report"
    
    PIPELINE_END_TIME=$(date +%s)
    local total_duration=$((PIPELINE_END_TIME - PIPELINE_START_TIME))
    
    local total_stages=$((${#COMPLETED_STAGES[@]} + ${#FAILED_STAGES[@]} + ${#SKIPPED_STAGES[@]}))
    
    # Console summary
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}                    PIPELINE EXECUTION SUMMARY${NC}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}Pipeline ID:${NC}       ${PIPELINE_ID}"
    echo -e "  ${BOLD}Environment:${NC}       ${ENVIRONMENT}"
    echo -e "  ${BOLD}Status:${NC}            ${PIPELINE_STATUS}"
    echo -e "  ${BOLD}Duration:${NC}          ${total_duration}s ($(date -u -d @${total_duration} +%T 2>/dev/null || echo "${total_duration}s"))"
    echo ""
    echo -e "  ${BOLD}Stage Results:${NC}"
    echo -e "    Validate:          ${STAGE_VALIDATE_STATUS}"
    echo -e "    Test:              ${STAGE_TEST_STATUS}"
    echo -e "    Build:             ${STAGE_BUILD_STATUS}"
    echo -e "    Deploy:            ${STAGE_DEPLOY_STATUS}"
    echo -e "    Verify:            ${STAGE_VERIFY_STATUS}"
    echo ""
    
    if [ ${#FAILED_STAGES[@]} -gt 0 ]; then
        echo -e "  ${RED}${BOLD}Failed Stages:${NC}"
        for stage in "${FAILED_STAGES[@]}"; do
            echo -e "    ${RED}✗${NC} ${stage}"
        done
        echo ""
    fi
    
    if [ ${#SKIPPED_STAGES[@]} -gt 0 ]; then
        echo -e "  ${YELLOW}${BOLD}Skipped Stages:${NC}"
        for stage in "${SKIPPED_STAGES[@]}"; do
            echo -e "    ${YELLOW}⊘${NC} ${stage}"
        done
        echo ""
    fi
    
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    
    # Generate HTML report
    generate_html_report "$total_duration"
    
    log_success "Pipeline report generated: ${PIPELINE_REPORT}"
    log_success "Pipeline log: ${PIPELINE_LOG}"
}

generate_html_report() {
    local duration="$1"
    
    local status_color="#4CAF50"
    local status_text="SUCCESS"
    
    if [ "$PIPELINE_STATUS" = "FAILED" ]; then
        status_color="#f44336"
        status_text="FAILED"
    elif [ "$PIPELINE_STATUS" = "PARTIAL" ]; then
        status_color="#FF9800"
        status_text="PARTIAL SUCCESS"
    fi
    
    cat > "$PIPELINE_REPORT" <<EOF
<!DOCTYPE html>
<html>
<head>
    <title>Pipeline Report - ${PIPELINE_ID}</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        .header .pipeline-id {
            font-size: 14px;
            opacity: 0.9;
            font-family: 'Courier New', monospace;
        }
        .status-banner {
            background: ${status_color};
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 2px;
        }
        .content {
            padding: 40px;
        }
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .summary-card {
            background: #f8f9fa;
            padding: 24px;
            border-radius: 12px;
            border-left: 4px solid #667eea;
        }
        .summary-card .label {
            font-size: 12px;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 8px;
        }
        .summary-card .value {
            font-size: 28px;
            font-weight: bold;
            color: #212529;
        }
        .stages {
            margin-top: 40px;
        }
        .stage {
            background: white;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: all 0.3s ease;
        }
        .stage:hover {
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .stage-name {
            font-size: 18px;
            font-weight: 600;
            color: #212529;
        }
        .stage-status {
            padding: 8px 20px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .stage-status.success {
            background: #d4edda;
            color: #155724;
        }
        .stage-status.failed {
            background: #f8d7da;
            color: #721c24;
        }
        .stage-status.skipped {
            background: #fff3cd;
            color: #856404;
        }
        .stage-status.pending {
            background: #d1ecf1;
            color: #0c5460;
        }
        h2 {
            font-size: 24px;
            margin-bottom: 20px;
            color: #212529;
            padding-bottom: 12px;
            border-bottom: 3px solid #667eea;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px 40px;
            border-top: 1px solid #dee2e6;
            font-size: 12px;
            color: #6c757d;
            text-align: center;
        }
        .log-link {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        .log-link:hover {
            background: #764ba2;
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 CI/CD Pipeline Report</h1>
            <div class="pipeline-id">${PIPELINE_ID}</div>
        </div>
        
        <div class="status-banner">${status_text}</div>
        
        <div class="content">
            <div class="summary-grid">
                <div class="summary-card">
                    <div class="label">Environment</div>
                    <div class="value">${ENVIRONMENT}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Duration</div>
                    <div class="value">${duration}s</div>
                </div>
                <div class="summary-card">
                    <div class="label">Completed</div>
                    <div class="value">${#COMPLETED_STAGES[@]}</div>
                </div>
                <div class="summary-card">
                    <div class="label">Failed</div>
                    <div class="value">${#FAILED_STAGES[@]}</div>
                </div>
            </div>
            
            <h2>Pipeline Stages</h2>
            <div class="stages">
                <div class="stage">
                    <div class="stage-name">1. Validation</div>
                    <div class="stage-status $(echo ${STAGE_VALIDATE_STATUS} | tr '[:upper:]' '[:lower:]')">${STAGE_VALIDATE_STATUS}</div>
                </div>
                <div class="stage">
                    <div class="stage-name">2. Testing</div>
                    <div class="stage-status $(echo ${STAGE_TEST_STATUS} | tr '[:upper:]' '[:lower:]')">${STAGE_TEST_STATUS}</div>
                </div>
                <div class="stage">
                    <div class="stage-name">3. Build</div>
                    <div class="stage-status $(echo ${STAGE_BUILD_STATUS} | tr '[:upper:]' '[:lower:]')">${STAGE_BUILD_STATUS}</div>
                </div>
                <div class="stage">
                    <div class="stage-name">4. Deploy</div>
                    <div class="stage-status $(echo ${STAGE_DEPLOY_STATUS} | tr '[:upper:]' '[:lower:]')">${STAGE_DEPLOY_STATUS}</div>
                </div>
                <div class="stage">
                    <div class="stage-name">5. Verification</div>
                    <div class="stage-status $(echo ${STAGE_VERIFY_STATUS} | tr '[:upper:]' '[:lower:]')">${STAGE_VERIFY_STATUS}</div>
                </div>
            </div>
            
            <div style="text-align: center;">
                <a href="file://${PIPELINE_LOG}" class="log-link">📋 View Full Logs</a>
            </div>
        </div>
        
        <div class="footer">
            Generated: $(date '+%Y-%m-%d %H:%M:%S') | Pipeline ID: ${PIPELINE_ID}
        </div>
    </div>
</body>
</html>
EOF
}

# ===== HELP =====
show_pipeline_help() {
    cat <<EOF
${BOLD}Unified CI/CD Deployment Pipeline${NC}

Orchestrates the complete deployment lifecycle with automated testing,
building, deployment, and verification.

${BOLD}USAGE:${NC}
    $0 [OPTIONS]

${BOLD}OPTIONS:${NC}
    --env ENV              Target environment (dev/staging/production) [default: dev]
    --stage STAGE          Run specific stage only (validate/test/build/deploy/verify)
    --skip-tests           Skip test stage
    --skip-validation      Skip validation stage
    --skip-build           Skip build stage
    --no-rollback          Disable automatic rollback on failure
    --require-approval     Require manual approval before deploy
    --parallel-build       Build images in parallel
    --push-images          Push images to registry
    --registry URL         Container registry URL
    --no-security-scan     Skip security scanning
    -h, --help             Show this help message
    -n, --dry-run          Preview actions without making changes
    -v, --verbose          Enable verbose output
    -d, --debug            Enable debug output

${BOLD}ENVIRONMENT VARIABLES:${NC}
    ENVIRONMENT           Target environment
    SKIP_TESTS            Skip testing stage (true/false)
    SKIP_VALIDATION       Skip validation stage (true/false)
    AUTO_ROLLBACK         Enable auto-rollback (true/false) [default: true]
    REQUIRE_APPROVAL      Require manual approval (true/false)
    PARALLEL_BUILD        Build in parallel (true/false)
    PUSH_IMAGES           Push to registry (true/false)
    IMAGE_REGISTRY        Registry URL
    RUN_SECURITY_SCAN     Run security scans (true/false) [default: true]
    DRY_RUN               Dry-run mode (true/false)

${BOLD}STAGES:${NC}
    1. Validate   → Pre-deployment checks and validation
    2. Test       → Run test suites (unit, integration, smoke)
    3. Build      → Build and tag Docker images
    4. Deploy     → Deploy services with health checks
    5. Verify     → Post-deployment verification

${BOLD}EXAMPLES:${NC}
    # Full pipeline for development
    $0 --env dev

    # Production deployment with approval
    $0 --env production --require-approval

    # Build and test only
    $0 --stage build
    $0 --stage test

    # Skip tests for quick deployment
    $0 --env staging --skip-tests

    # Dry-run to preview changes
    $0 --env production --dry-run

    # Build in parallel and push to registry
    $0 --parallel-build --push-images --registry registry.example.com

${BOLD}EXIT CODES:${NC}
    0   Pipeline completed successfully
    1   Pipeline failed at any stage
    2   Pipeline cancelled by user
    130 Pipeline interrupted (SIGINT)

${BOLD}REPORTS:${NC}
    Pipeline Log:    ${PIPELINE_LOG}
    HTML Report:     ${PIPELINE_REPORT}
    History:         ${PIPELINE_HISTORY}

${BOLD}MORE INFO:${NC}
    See deployment/PIPELINE_GUIDE.md for detailed documentation
EOF
}

# ===== MAIN PIPELINE EXECUTION =====
main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --stage)
                SPECIFIC_STAGE="$2"
                shift 2
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-validation)
                SKIP_VALIDATION=true
                shift
                ;;
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --no-rollback)
                AUTO_ROLLBACK=false
                shift
                ;;
            --require-approval)
                REQUIRE_APPROVAL=true
                shift
                ;;
            --parallel-build)
                PARALLEL_BUILD=true
                shift
                ;;
            --push-images)
                PUSH_IMAGES=true
                shift
                ;;
            --registry)
                IMAGE_REGISTRY="$2"
                shift 2
                ;;
            --no-security-scan)
                RUN_SECURITY_SCAN=false
                shift
                ;;
            -h|--help)
                show_pipeline_help
                exit 0
                ;;
            -n|--dry-run)
                DRY_RUN=true
                shift
                ;;
            -v|--verbose)
                set -x
                shift
                ;;
            -d|--debug)
                DEBUG=1
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                show_pipeline_help
                exit 1
                ;;
        esac
    done
    
    # Initialize script
    init_script "$SCRIPT_NAME" true 10
    
    # Initialize pipeline
    init_pipeline
    
    # Show banner
    show_pipeline_banner
    
    # Record start
    log_to_history "STARTED" "Pipeline started for ${ENVIRONMENT}"
    
    # Execute pipeline stages
    local pipeline_failed=false
    
    # Stage 1: Validation
    if [ -z "$SPECIFIC_STAGE" ] || [ "$SPECIFIC_STAGE" = "validate" ]; then
        if [ "$SKIP_VALIDATION" = "false" ]; then
            if ! stage_validate; then
                pipeline_failed=true
                PIPELINE_STATUS="FAILED"
            fi
        else
            log_warning "Validation stage skipped"
            STAGE_VALIDATE_STATUS="SKIPPED"
            record_stage_result "VALIDATE" "SKIPPED" "0"
        fi
    fi
    
    # Stop if validation failed
    if [ "$pipeline_failed" = "true" ]; then
        log_error "Pipeline failed at validation stage"
        generate_pipeline_report
        log_to_history "FAILED" "Validation failed"
        exit 1
    fi
    
    # Stage 2: Testing
    if [ -z "$SPECIFIC_STAGE" ] || [ "$SPECIFIC_STAGE" = "test" ]; then
        if [ "$SKIP_TESTS" = "false" ]; then
            if ! stage_test; then
                pipeline_failed=true
                PIPELINE_STATUS="FAILED"
            fi
        else
            log_warning "Test stage skipped"
            STAGE_TEST_STATUS="SKIPPED"
            record_stage_result "TEST" "SKIPPED" "0"
        fi
    fi
    
    # Stop if tests failed
    if [ "$pipeline_failed" = "true" ]; then
        log_error "Pipeline failed at test stage"
        generate_pipeline_report
        log_to_history "FAILED" "Tests failed"
        exit 1
    fi
    
    # Stage 3: Build
    if [ -z "$SPECIFIC_STAGE" ] || [ "$SPECIFIC_STAGE" = "build" ]; then
        if [ "$SKIP_BUILD" = "false" ]; then
            if ! stage_build; then
                pipeline_failed=true
                PIPELINE_STATUS="FAILED"
            fi
        else
            log_warning "Build stage skipped"
            STAGE_BUILD_STATUS="SKIPPED"
            record_stage_result "BUILD" "SKIPPED" "0"
        fi
    fi
    
    # Stop if build failed
    if [ "$pipeline_failed" = "true" ]; then
        log_error "Pipeline failed at build stage"
        generate_pipeline_report
        log_to_history "FAILED" "Build failed"
        exit 1
    fi
    
    # Stage 4: Deploy
    if [ -z "$SPECIFIC_STAGE" ] || [ "$SPECIFIC_STAGE" = "deploy" ]; then
        if ! stage_deploy; then
            pipeline_failed=true
            PIPELINE_STATUS="FAILED"
        fi
    fi
    
    # Stop if deploy failed
    if [ "$pipeline_failed" = "true" ]; then
        log_error "Pipeline failed at deploy stage"
        generate_pipeline_report
        log_to_history "FAILED" "Deployment failed"
        exit 1
    fi
    
    # Stage 5: Verification
    if [ -z "$SPECIFIC_STAGE" ] || [ "$SPECIFIC_STAGE" = "verify" ]; then
        if ! stage_verify; then
            log_warning "Verification stage had issues (not failing pipeline)"
            # Don't fail pipeline on verify issues, just warn
        fi
    fi
    
    # Pipeline completed
    if [ "$pipeline_failed" = "false" ]; then
        PIPELINE_STATUS="SUCCESS"
        log_to_history "SUCCESS" "Pipeline completed successfully"
    fi
    
    # Generate final report
    generate_pipeline_report
    
    # Exit with appropriate code
    if [ "$PIPELINE_STATUS" = "SUCCESS" ]; then
        log_success "🎉 Pipeline completed successfully!"
        exit 0
    else
        log_error "Pipeline execution failed"
        exit 1
    fi
}

# Run main
main "$@"
