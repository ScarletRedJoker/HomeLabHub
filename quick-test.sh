#!/bin/bash
set -e

echo "=== Test 1: env-file in homelab ==="
if grep -q "env-file.*ENV_FILE" homelab; then
    echo "✓ PASS: Found --env-file in homelab"
else
    echo "✗ FAIL: Missing --env-file in homelab"
    exit 1
fi

echo ""
echo "=== Test 2: export DEPLOYMENT_PATH ==="
if grep -q "export DEPLOYMENT_PATH" homelab; then
    echo "✓ PASS: Found export DEPLOYMENT_PATH"
else
    echo "✗ FAIL: Missing export DEPLOYMENT_PATH"
    exit 1
fi

echo ""
echo "=== Test 3: YAML syntax ==="
python3 -c "import yaml; yaml.safe_load(open('orchestration/compose.web.yml'))"
echo "✓ PASS: compose.web.yml has valid YAML"

python3 -c "import yaml; yaml.safe_load(open('orchestration/compose.all.yml'))"
echo "✓ PASS: compose.all.yml has valid YAML"

echo ""
echo "✅ All quick tests passed!"
