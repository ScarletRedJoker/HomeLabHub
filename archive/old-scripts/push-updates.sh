#!/bin/bash

# Quick script to commit and push updates to GitHub
# Usage: ./push-updates.sh "commit message"

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

COMMIT_MSG="${1:-Update homelab dashboard}"

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Push Updates to GitHub             ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# Check if we're in a git repository
if [ ! -d .git ]; then
    print_error "Not a git repository!"
    exit 1
fi

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    print_info "Uncommitted changes detected"
    
    # Show status
    echo ""
    git status --short
    echo ""
    
    # Add all changes
    print_info "Adding all changes..."
    git add .
    print_success "Changes staged"
    
    # Commit
    print_info "Committing with message: $COMMIT_MSG"
    git commit -m "$COMMIT_MSG"
    print_success "Changes committed"
    
    # Push
    print_info "Pushing to GitHub..."
    git push origin main
    print_success "Changes pushed to GitHub!"
    
    echo ""
    print_success "All updates synchronized with GitHub"
    echo ""
    print_info "Repository: https://github.com/ScarletRedJoker/HomeLabHub"
else
    print_warning "No changes to commit"
    
    # Check if we're ahead of remote
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")
    
    if [ "$LOCAL" != "$REMOTE" ] && [ -n "$REMOTE" ]; then
        print_info "Local commits exist, pushing to GitHub..."
        git push origin main
        print_success "Changes pushed to GitHub!"
    else
        print_success "Already in sync with GitHub"
    fi
fi

echo ""
print_info "Latest commit:"
git log -1 --oneline
echo ""
