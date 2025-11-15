#!/bin/bash
################################################################################
# Comprehensive Script Validation and Enhancement Utility
#
# Validates all deployment scripts for:
# - Shellcheck compliance
# - Help documentation
# - Error handling
# - Executable permissions
# - Standard structure
################################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Counters
TOTAL_SCRIPTS=0
EXECUTABLE_SCRIPTS=0
SCRIPTS_WITH_HELP=0
SHELLCHECK_PASS=0
SCRIPTS_WITH_ERROR_HANDLING=0

# Report file
REPORT_FILE="${SCRIPT_DIR}/validation-report.txt"

# ===== FUNCTIONS =====
log_info() {
    echo -e "${BLUE}[ℹ]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*"
}

log_section() {
    echo ""
    echo -e "${CYAN}${BOLD}━━━ $* ━━━${NC}"
}

# Check if script has help documentation
has_help() {
    local script="$1"
    
    if grep -q "\-\-help\|\-h" "$script" && \
       grep -q "show.*help\|usage\|USAGE" "$script" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Check if script has error handling
has_error_handling() {
    local script="$1"
    
    if grep -q "set -e" "$script" || \
       grep -q "trap.*ERR" "$script" || \
       grep -q "set -o errexit" "$script"; then
        return 0
    else
        return 1
    fi
}

# Check shellcheck
check_shellcheck() {
    local script="$1"
    
    if shellcheck -S warning "$script" &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Validate single script
validate_script() {
    local script="$1"
    local script_name
    script_name=$(basename "$script")
    
    ((TOTAL_SCRIPTS++))
    
    echo -n "  $script_name: "
    
    local status=""
    local issues=()
    
    # Check executable
    if [ -x "$script" ]; then
        ((EXECUTABLE_SCRIPTS++))
        status+="${GREEN}✓ exec${NC} "
    else
        status+="${RED}✗ exec${NC} "
        issues+=("not executable")
    fi
    
    # Check help
    if has_help "$script"; then
        ((SCRIPTS_WITH_HELP++))
        status+="${GREEN}✓ help${NC} "
    else
        status+="${YELLOW}⚠ help${NC} "
        issues+=("no help")
    fi
    
    # Check error handling
    if has_error_handling "$script"; then
        ((SCRIPTS_WITH_ERROR_HANDLING++))
        status+="${GREEN}✓ err${NC} "
    else
        status+="${YELLOW}⚠ err${NC} "
        issues+=("no error handling")
    fi
    
    # Check shellcheck
    if check_shellcheck "$script"; then
        ((SHELLCHECK_PASS++))
        status+="${GREEN}✓ lint${NC}"
    else
        status+="${YELLOW}⚠ lint${NC}"
        issues+=("shellcheck warnings")
    fi
    
    echo -e "$status"
    
    if [ ${#issues[@]} -gt 0 ]; then
        echo "      Issues: ${issues[*]}"
    fi
}

# Generate report
generate_report() {
    {
        echo "======================================================================"
        echo "  DEPLOYMENT SCRIPTS VALIDATION REPORT"
        echo "  Generated: $(date '+%Y-%m-%d %H:%M:%S')"
        echo "======================================================================"
        echo ""
        echo "SUMMARY"
        echo "----------------------------------------------------------------------"
        echo "  Total Scripts:              $TOTAL_SCRIPTS"
        echo "  Executable:                 $EXECUTABLE_SCRIPTS / $TOTAL_SCRIPTS"
        echo "  With Help Documentation:    $SCRIPTS_WITH_HELP / $TOTAL_SCRIPTS"
        echo "  With Error Handling:        $SCRIPTS_WITH_ERROR_HANDLING / $TOTAL_SCRIPTS"
        echo "  Passing Shellcheck:         $SHELLCHECK_PASS / $TOTAL_SCRIPTS"
        echo ""
        
        local exec_pct=$((EXECUTABLE_SCRIPTS * 100 / TOTAL_SCRIPTS))
        local help_pct=$((SCRIPTS_WITH_HELP * 100 / TOTAL_SCRIPTS))
        local error_pct=$((SCRIPTS_WITH_ERROR_HANDLING * 100 / TOTAL_SCRIPTS))
        local lint_pct=$((SHELLCHECK_PASS * 100 / TOTAL_SCRIPTS))
        
        echo "PERCENTAGES"
        echo "----------------------------------------------------------------------"
        echo "  Executable:                 ${exec_pct}%"
        echo "  With Help:                  ${help_pct}%"
        echo "  With Error Handling:        ${error_pct}%"
        echo "  Passing Shellcheck:         ${lint_pct}%"
        echo ""
        
        echo "ENVIRONMENT FILES"
        echo "----------------------------------------------------------------------"
        if [ -f "${PROJECT_ROOT}/.env.example" ]; then
            echo "  ✓ Root .env.example exists"
        else
            echo "  ✗ Root .env.example missing"
        fi
        
        for service in dashboard discord-bot stream-bot; do
            if [ -f "${PROJECT_ROOT}/services/${service}/.env.example" ]; then
                echo "  ✓ services/${service}/.env.example exists"
            else
                echo "  ✗ services/${service}/.env.example missing"
            fi
        done
        echo ""
        
        echo "CRITICAL SCRIPTS STATUS"
        echo "----------------------------------------------------------------------"
        for script in deploy-with-health-check.sh rollback-deployment.sh \
                      backup-databases.sh migrate-all.sh homelab-manager.sh \
                      test-deployment.sh; do
            if [ -f "${SCRIPT_DIR}/${script}" ] || [ -f "${PROJECT_ROOT}/${script}" ]; then
                echo "  ✓ $script exists"
            else
                echo "  ✗ $script missing"
            fi
        done
        echo ""
        
        echo "DOCUMENTATION"
        echo "----------------------------------------------------------------------"
        if [ -f "${SCRIPT_DIR}/DEPLOYMENT_README.md" ]; then
            local lines
            lines=$(wc -l < "${SCRIPT_DIR}/DEPLOYMENT_README.md")
            echo "  ✓ DEPLOYMENT_README.md exists (${lines} lines)"
        else
            echo "  ✗ DEPLOYMENT_README.md missing"
        fi
        
        if [ -f "${SCRIPT_DIR}/README.md" ]; then
            echo "  ✓ deployment/README.md exists"
        fi
        echo ""
        
        echo "RECOMMENDATIONS"
        echo "----------------------------------------------------------------------"
        
        if [ $help_pct -lt 80 ]; then
            echo "  • Add --help flags to scripts missing documentation"
        fi
        
        if [ $lint_pct -lt 100 ]; then
            echo "  • Fix shellcheck warnings in affected scripts"
        fi
        
        if [ $error_pct -lt 100 ]; then
            echo "  • Add 'set -euo pipefail' to scripts missing error handling"
        fi
        
        if [ $exec_pct -eq 100 ] && [ $help_pct -ge 80 ] && [ $lint_pct -ge 90 ]; then
            echo "  ✓ All scripts meet production quality standards!"
        fi
        
        echo ""
        echo "======================================================================"
    } | tee "$REPORT_FILE"
}

# Main
main() {
    echo ""
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}        ${BOLD}${BLUE}📋 DEPLOYMENT SCRIPTS VALIDATION${NC}                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                                ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    log_section "Validating Deployment Scripts"
    
    # Validate deployment scripts
    for script in "${SCRIPT_DIR}"/*.sh; do
        if [ -f "$script" ] && [ "$(basename "$script")" != "validate-all-scripts.sh" ]; then
            validate_script "$script"
        fi
    done
    
    # Validate root scripts
    if [ -f "${PROJECT_ROOT}/homelab-manager.sh" ]; then
        log_section "Validating Root Scripts"
        validate_script "${PROJECT_ROOT}/homelab-manager.sh"
    fi
    
    # Generate report
    log_section "Generating Report"
    generate_report
    
    echo ""
    log_success "Validation complete!"
    log_info "Report saved to: $REPORT_FILE"
    echo ""
    
    # Return appropriate exit code
    if [ $exec_pct -eq 100 ] && [ $lint_pct -ge 90 ]; then
        return 0
    else
        return 1
    fi
}

# Run if executed directly
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
