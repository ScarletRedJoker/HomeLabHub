#!/bin/bash
# Commit and push the complete, robust homelab setup

git add bootstrap-homelab.sh SETUP.md
git add check-health.sh diagnose-services.sh verify-everything-works.sh
git add FINAL_FIX_SUMMARY.md replit.md

git commit -m "Complete homelab bootstrap: robust, idempotent, tested setup

- Added bootstrap-homelab.sh: One script to set up everything
  - Validates environment
  - Creates databases & users
  - Runs migrations correctly  
  - Tests all services actually work
  - Idempotent (safe to run multiple times)

- Added SETUP.md: Clear documentation anyone can follow
- Cleaned up ad-hoc fix scripts
- Comprehensive validation included"

git push origin main

echo ""
echo "✅ Pushed to GitHub"
echo ""
echo "═══════════════════════════════════════════════"
echo "  On your Ubuntu server, run:"
echo "  cd /home/evin/contain/HomeLabHub"
echo "  git pull origin main"
echo "  ./bootstrap-homelab.sh"
echo "═══════════════════════════════════════════════"
