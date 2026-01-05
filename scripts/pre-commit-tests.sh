#!/bin/bash
set -euo pipefail

echo "Running pre-commit tests..."
echo "================================"

FAILED=0

echo ""
echo "[1/3] Running Stream Bot overlay tests..."
cd services/stream-bot
if ! npm run test:overlay; then
    echo "Stream Bot overlay tests FAILED"
    FAILED=1
fi

echo ""
echo "[2/3] Running Stream Bot OAuth tests..."
if ! npm run test:oauth; then
    echo "Stream Bot OAuth tests FAILED"
    FAILED=1
fi

echo ""
echo "[3/3] Running Stream Bot E2E tests..."
if ! npm run test -- tests/e2e-overlay-flow.test.ts; then
    echo "Stream Bot E2E tests FAILED"
    FAILED=1
fi

cd ../..

echo ""
echo "[4/4] Running Discord Bot tests..."
cd services/discord-bot
if ! npm run test:api; then
    echo "Discord Bot API tests FAILED"
    FAILED=1
fi

cd ../..

echo ""
echo "================================"
if [ $FAILED -eq 1 ]; then
    echo "PRE-COMMIT TESTS FAILED"
    echo "Please fix the failing tests before committing."
    exit 1
else
    echo "All pre-commit tests PASSED (56 tests)"
    exit 0
fi
