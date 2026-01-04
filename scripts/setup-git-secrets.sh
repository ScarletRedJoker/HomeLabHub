#!/bin/bash
# Enhanced Git Secrets Pre-commit Hook Setup
# Run this on all development machines to prevent secret leakage

set -e

echo "🔐 Setting up enhanced git-secrets protection..."

# Create the pre-commit hook
cat > .git/hooks/pre-commit << 'HOOKEOF'
#!/bin/bash
# Enhanced pre-commit hook to prevent secret leakage
# Installed by HomeLabHub security hardening

set -e

echo "🔐 Running security checks..."

# Get staged content
STAGED_CONTENT=$(git diff --cached)

# Patterns to detect
PATTERNS=(
    # Discord tokens (new format with dots)
    '[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}'
    # Discord bot tokens (legacy)
    'DISCORD.*TOKEN.*=.*[A-Za-z0-9_-]{50,}'
    # OpenAI keys
    'sk-proj-[A-Za-z0-9]{20,}'
    'sk-[A-Za-z0-9]{48,}'
    # Anthropic keys
    'sk-ant-[A-Za-z0-9_-]{20,}'
    # Tailscale keys
    'tskey-auth-[A-Za-z0-9]{20,}'
    'tskey-api-[A-Za-z0-9]{20,}'
    # Cloudflare tokens
    'CLOUDFLARE.*TOKEN.*=.*[A-Za-z0-9_-]{40,}'
    # Generic API keys (high entropy)
    'API_KEY.*=.*[A-Za-z0-9]{32,}'
    # OAuth client secrets (Twitch, YouTube, etc)
    'CLIENT_SECRET.*=.*[A-Za-z0-9_-]{20,}'
    # Private keys
    '-----BEGIN.*PRIVATE KEY-----'
    # AWS keys
    'AKIA[0-9A-Z]{16}'
    'aws_secret_access_key'
)

# Files to always skip
SKIP_PATTERNS='\.env\.template|\.env\.example|docs/|README|DEPLOYMENT|attached_assets/Pasted'

FOUND_SECRETS=0

for pattern in "${PATTERNS[@]}"; do
    # Check staged content, excluding template/example files
    if echo "$STAGED_CONTENT" | grep -qE "$pattern" 2>/dev/null; then
        # Get the matching files, excluding docs/templates
        MATCHING_FILES=$(git diff --cached --name-only | xargs -I{} sh -c "git show :\"{}\" 2>/dev/null | grep -lE \"$pattern\" && echo \"{}\"" 2>/dev/null | grep -vE "$SKIP_PATTERNS" || true)
        
        if [ -n "$MATCHING_FILES" ]; then
            echo "❌ BLOCKED: Potential secret detected matching pattern: $pattern"
            echo "   Files: $MATCHING_FILES"
            FOUND_SECRETS=1
        fi
    fi
done

# Check for .env files being staged (should never happen)
if git diff --cached --name-only | grep -qE '^\.env$|^\.env\.[^t]|\.env\.local|\.env\.production'; then
    echo "❌ BLOCKED: Environment file detected in commit!"
    echo "   .env files should NEVER be committed."
    FOUND_SECRETS=1
fi

if [ $FOUND_SECRETS -eq 1 ]; then
    echo ""
    echo "🚫 Commit blocked to protect secrets."
    echo "   If this is a false positive (template/docs), use:"
    echo "   git commit --no-verify"
    exit 1
fi

echo "✅ Security checks passed"
exit 0
HOOKEOF

chmod +x .git/hooks/pre-commit

echo "✅ Enhanced pre-commit hook installed!"
echo ""
echo "Protected patterns include:"
echo "  - Discord tokens"
echo "  - OpenAI API keys"
echo "  - Anthropic API keys"
echo "  - Tailscale auth keys"
echo "  - Cloudflare tokens"
echo "  - OAuth client secrets"
echo "  - Private keys"
echo "  - AWS credentials"
echo ""
echo "Run this script on Linode and Local Ubuntu servers too!"
