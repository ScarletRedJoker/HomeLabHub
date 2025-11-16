#!/bin/bash
# Smoke Test Runner - Proves Graceful Degradation
# 
# This script runs comprehensive integration tests that prove the system
# works WITHOUT optional services configured. It demonstrates graceful
# degradation when external dependencies are missing.

set -e  # Exit on error

echo "🧪 Running Integration Smoke Tests"
echo "===================================="
echo ""
echo "These tests prove the system works WITHOUT optional services configured."
echo "They verify graceful degradation for:"
echo "  - AI Assistant (OpenAI API)"
echo "  - Domain Automation (ZoneEdit DNS)"
echo "  - Google Services (OAuth)"
echo "  - Docker Management"
echo ""

# Clear optional service credentials to force graceful degradation
echo "📋 Clearing optional service credentials..."
unset OPENAI_API_KEY
unset AI_INTEGRATIONS_OPENAI_API_KEY
unset AI_INTEGRATIONS_OPENAI_BASE_URL
unset ZONEEDIT_USERNAME
unset ZONEEDIT_PASSWORD
unset ZONEEDIT_API_KEY
unset ZONEEDIT_API_TOKEN
unset GOOGLE_CLIENT_ID
unset GOOGLE_CLIENT_SECRET

# Set required credentials for testing
export WEB_USERNAME="testuser"
export WEB_PASSWORD="testpass"

# Navigate to dashboard directory
cd services/dashboard

echo ""
echo "===================================="
echo "✅ Test 1: Application Startup (no crashes)"
echo "===================================="
echo ""

python -m pytest tests/test_startup_smoke.py -v --tb=short

echo ""
echo "===================================="
echo "✅ Test 2: Graceful Degradation (optional services disabled)"
echo "===================================="
echo ""

python -m pytest tests/test_integration_smoke.py -v --tb=short

echo ""
echo "===================================="
echo "✅ All smoke tests passed!"
echo ""
echo "VERIFIED:"
echo "  ✓ System starts without optional services"
echo "  ✓ AI Assistant degrades gracefully"
echo "  ✓ Domain Automation degrades gracefully"  
echo "  ✓ Core features work independently"
echo "  ✓ Error handling is robust"
echo ""
echo "System is production-ready with graceful degradation."
echo "===================================="
