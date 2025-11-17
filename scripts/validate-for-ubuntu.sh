#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🧪 REPLIT PRE-DEPLOYMENT VALIDATOR                       ║"
echo "║  Comprehensive validation before Ubuntu deployment        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

FAILED=0
WARNINGS=0

# Stage 1: LSP Diagnostics
echo "━━━ Stage 1: TypeScript & Code Quality ━━━"
if python3 scripts/validation/check_lsp.py; then
    echo "✅ LSP checks passed"
else
    echo "❌ LSP checks failed"
    FAILED=1
fi
echo ""

# Stage 2: Package Manifests
echo "━━━ Stage 2: Package Manifests ━━━"
if python3 scripts/validation/check_packages.py; then
    echo "✅ Package validation passed"
else
    echo "❌ Package validation failed"
    FAILED=1
fi
echo ""

# Stage 3: Docker Simulation
echo "━━━ Stage 3: Docker Build Simulation ━━━"
if python3 scripts/validation/docker_simulate.py; then
    echo "✅ Docker simulation passed"
else
    echo "⚠️  Docker simulation warnings (non-critical)"
    WARNINGS=1
fi
echo ""

# Stage 4: Network & Port Validation
echo "━━━ Stage 4: Network & Port Validation ━━━"
if python3 scripts/validation/check_network.py; then
    echo "✅ Network validation passed"
else
    echo "❌ Network validation failed"
    FAILED=1
fi
echo ""

# Stage 5: Service Health Checks
echo "━━━ Stage 5: Service Health Checks ━━━"
if python3 scripts/validation/check_services.py; then
    echo "✅ Service health checks passed"
else
    echo "⚠️  Service health checks completed with warnings"
    WARNINGS=1
fi
echo ""

# Stage 6: Overall Deployment Readiness
echo "━━━ Stage 6: Deployment Readiness Report ━━━"
if python3 scripts/validation/readiness_report.py; then
    echo "✅ Deployment readiness confirmed"
else
    echo "❌ Deployment readiness check failed"
    FAILED=1
fi
echo ""

# Summary
echo "═══════════════════════════════════════════════════════════"
if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ ALL VALIDATION CHECKS PASSED!"
    echo "   ✓ Code quality validated"
    echo "   ✓ Network configuration verified"
    echo "   ✓ Services ready for deployment"
    echo ""
    echo "🚀 READY TO DEPLOY TO UBUNTU"
    exit 0
elif [ $FAILED -eq 0 ] && [ $WARNINGS -eq 1 ]; then
    echo "⚠️  VALIDATION PASSED WITH WARNINGS"
    echo "   ✓ Critical checks passed"
    echo "   ⚠️  Non-critical warnings present"
    echo ""
    echo "🟡 Safe to deploy, but review warnings"
    exit 0
else
    echo "❌ VALIDATION FAILED"
    echo "   ✗ $FAILED critical error(s) detected"
    echo ""
    echo "🛑 FIX ERRORS BEFORE DEPLOYING TO UBUNTU"
    exit 1
fi
