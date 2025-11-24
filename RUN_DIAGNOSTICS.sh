#!/bin/bash
echo "Pulling latest fixes..."
git pull origin main

echo ""
echo "Running diagnostics..."
./QUICK_FIX.sh

echo ""
echo "If dashboard issues found, run:"
echo "  docker compose restart homelab-dashboard"
echo "  docker compose restart caddy"
