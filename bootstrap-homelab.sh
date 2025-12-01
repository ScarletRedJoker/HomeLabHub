#!/bin/bash
# ════════════════════════════════════════════════════════════════
# HOMELAB BOOTSTRAP - Thin Wrapper
# ════════════════════════════════════════════════════════════════
# This is a convenience wrapper that calls the unified bootstrap script.
# For full control, use ./deploy/scripts/bootstrap.sh directly.
#
# Usage:
#   ./bootstrap-homelab.sh                    # Auto-detect role (local)
#   ./bootstrap-homelab.sh --role cloud       # Force cloud role
#   ./bootstrap-homelab.sh --generate-secrets # Auto-generate passwords
#
# All arguments are passed through to the main bootstrap script.
# ════════════════════════════════════════════════════════════════

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

BOOTSTRAP_SCRIPT="$SCRIPT_DIR/deploy/scripts/bootstrap.sh"

if [ ! -f "$BOOTSTRAP_SCRIPT" ]; then
    echo -e "${RED}Error: Main bootstrap script not found at:${NC}"
    echo "  $BOOTSTRAP_SCRIPT"
    echo ""
    echo "Make sure you're running from the project root directory."
    exit 1
fi

ROLE=""
ARGS=()

for arg in "$@"; do
    ARGS+=("$arg")
    if [ "$arg" = "--role" ]; then
        :
    elif [[ "${ARGS[*]}" == *"--role"* ]] && [ -z "$ROLE" ]; then
        ROLE="$arg"
    fi
done

if [ -z "$ROLE" ]; then
    if curl -s --max-time 2 http://169.254.169.254/v1/instance-id &>/dev/null; then
        ROLE="cloud"
        echo -e "${CYAN}Auto-detected: Running on Linode (cloud role)${NC}"
    else
        ROLE="local"
        echo -e "${CYAN}Auto-detected: Running on local host (local role)${NC}"
    fi
    ARGS+=("--role" "$ROLE")
fi

echo -e "${GREEN}Calling unified bootstrap script...${NC}"
echo ""

exec "$BOOTSTRAP_SCRIPT" "${ARGS[@]}"
