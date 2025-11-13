#!/bin/bash
# Quick manual sync script - run anytime to pull and deploy latest changes

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/sync-from-replit.sh"
