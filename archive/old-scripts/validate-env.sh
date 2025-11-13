#!/bin/bash

# ======================================================================
# Smart Environment Variable Validation Script
# Checks all required env vars and provides actionable feedback
# ======================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

print_error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

check_var() {
    local var_name=$1
    local var_value=${!var_name}
    local required=$2
    local placeholder=$3
    
    if [ -z "$var_value" ]; then
        if [ "$required" = "required" ]; then
            print_error "$var_name is NOT SET (required)"
            return 1
        else
            print_warning "$var_name is not set (optional)"
            return 0
        fi
    fi
    
    # Check for placeholder values
    if [[ "$var_value" == *"$placeholder"* ]] || \
       [[ "$var_value" == *"YOUR_"* ]] || \
       [[ "$var_value" == *"CHANGE"* ]] || \
       [[ "$var_value" == *"example.com"* ]]; then
        print_error "$var_name has placeholder value: $var_value"
        return 1
    fi
    
    print_success "$var_name is set"
    return 0
}

# Load environment
if [ ! -f .env ]; then
    print_error ".env file not found!"
    exit 1
fi

source .env

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Environment Variable Validation     ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"

# ============================================
# Global/System Variables
# ============================================
print_header "System Configuration"

check_var "LETSENCRYPT_EMAIL" "required" "EMAIL"
check_var "SERVICE_USER" "optional" ""

# ============================================
# Dashboard Variables
# ============================================
print_header "Homelab Dashboard"

check_var "WEB_USERNAME" "required" ""
check_var "WEB_PASSWORD" "required" ""
check_var "API_KEY" "required" ""
check_var "SESSION_SECRET" "required" ""
check_var "OPENAI_API_KEY" "optional" "sk-"

if [ -n "$OPENAI_API_KEY" ] && [[ ! "$OPENAI_API_KEY" =~ ^sk- ]]; then
    print_error "OPENAI_API_KEY should start with 'sk-'"
fi

# ============================================
# Discord Bot Variables
# ============================================
print_header "Discord Ticket Bot"

check_var "DISCORD_BOT_TOKEN" "required" ""
check_var "DISCORD_CLIENT_ID" "required" ""
check_var "DISCORD_CLIENT_SECRET" "required" ""
check_var "DISCORD_APP_ID" "required" ""
check_var "VITE_DISCORD_CLIENT_ID" "required" ""
check_var "DISCORD_SESSION_SECRET" "required" ""
check_var "DISCORD_DB_PASSWORD" "required" ""

# Validate OAuth URLs
echo ""
echo -e "${BLUE}OAuth Configuration:${NC}"
EXPECTED_CALLBACK="https://bot.rig-city.com/callback"
EXPECTED_APP_URL="https://bot.rig-city.com"

echo "  Expected callback: $EXPECTED_CALLBACK"
echo "  Expected app URL: $EXPECTED_APP_URL"
echo ""
echo -e "${YELLOW}Action Required:${NC} Add this redirect URI in Discord Developer Portal:"
echo "  1. Go to: https://discord.com/developers/applications/${DISCORD_CLIENT_ID:-YOUR_CLIENT_ID}"
echo "  2. OAuth2 → Redirects"
echo "  3. Add: $EXPECTED_CALLBACK"
echo "  4. Click Save Changes"

# ============================================
# Stream Bot Variables
# ============================================
print_header "Stream Bot (SnappleBotAI)"

check_var "STREAMBOT_OPENAI_API_KEY" "optional" ""
check_var "STREAMBOT_DATABASE_URL" "optional" ""
check_var "STREAMBOT_SESSION_SECRET" "optional" ""

if [ -z "$STREAMBOT_OPENAI_API_KEY" ] && [ -n "$OPENAI_API_KEY" ]; then
    print_warning "STREAMBOT_OPENAI_API_KEY not set, will use OPENAI_API_KEY as fallback"
fi

# ============================================
# Plex Variables
# ============================================
print_header "Plex Server"

check_var "PLEX_CLAIM" "optional" ""

if [ -z "$PLEX_CLAIM" ]; then
    echo ""
    echo -e "${YELLOW}To set up Plex:${NC}"
    echo "  1. Go to: https://www.plex.tv/claim/"
    echo "  2. Copy the claim code"
    echo "  3. Add to .env: PLEX_CLAIM=claim-xxxxxxxxxx"
    echo "  4. Restart Plex container"
fi

# ============================================
# VNC Variables
# ============================================
print_header "VNC Desktop"

check_var "VNC_PASSWORD" "optional" ""

if [ -z "$VNC_PASSWORD" ]; then
    print_warning "VNC_PASSWORD not set, using default 'changeme'"
fi

# ============================================
# Security Checks
# ============================================
print_header "Security Review"

# Check for weak passwords
if [ "$WEB_PASSWORD" = "homelab" ]; then
    print_error "WEB_PASSWORD is using default value 'homelab' - CHANGE THIS!"
fi

if [ "$VNC_PASSWORD" = "changeme" ]; then
    print_warning "VNC_PASSWORD is using default value 'changeme'"
fi

# Check secret lengths
if [ -n "$SESSION_SECRET" ] && [ ${#SESSION_SECRET} -lt 32 ]; then
    print_warning "SESSION_SECRET is shorter than 32 characters (currently ${#SESSION_SECRET})"
fi

if [ -n "$DISCORD_SESSION_SECRET" ] && [ ${#DISCORD_SESSION_SECRET} -lt 32 ]; then
    print_warning "DISCORD_SESSION_SECRET is shorter than 32 characters"
fi

# ============================================
# Summary
# ============================================
print_header "Validation Summary"

echo ""
if [ $ERRORS -eq 0 ]; then
    print_success "No critical errors found!"
else
    print_error "Found $ERRORS critical error(s) - deployment may fail"
fi

if [ $WARNINGS -gt 0 ]; then
    print_warning "Found $WARNINGS warning(s) - review recommended"
fi

echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo "1. Fix all errors marked with ${RED}✗${NC} above"
    echo "2. Edit .env file: nano .env"
    echo "3. Run this script again: ./validate-env.sh"
    echo "4. Once all errors are fixed, deploy: ./deploy-unified.sh"
else
    echo "✓ Environment is ready for deployment!"
    echo ""
    echo "Run: ./deploy-unified.sh"
fi

echo ""

exit $ERRORS
