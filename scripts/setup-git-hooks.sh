#!/bin/bash

echo "Setting up git hooks for HomeLabHub..."

HOOKS_DIR=".git/hooks"
PRE_COMMIT_HOOK="$HOOKS_DIR/pre-commit"

if [ ! -d "$HOOKS_DIR" ]; then
    echo "Error: .git/hooks directory not found. Are you in the repository root?"
    exit 1
fi

cat > "$PRE_COMMIT_HOOK" << 'EOF'
#!/bin/bash
echo "Running pre-commit tests..."
./scripts/pre-commit-tests.sh
exit $?
EOF

chmod +x "$PRE_COMMIT_HOOK"

echo "Git pre-commit hook installed successfully!"
echo "Tests will run automatically before each commit."
echo ""
echo "To skip tests temporarily, use: git commit --no-verify"
