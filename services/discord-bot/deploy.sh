#!/bin/bash

#######################################################################
# Discord Ticket Bot - Git-Based Deployment Script
# 
# Simple git pull and rebuild approach
#
# Usage:
#   ./deploy.sh
#######################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

DEPLOY_DIR="/home/evin/discord-ticket-bot"

log_info "Starting deployment..."

# Check if directory exists
if [ ! -d "$DEPLOY_DIR" ]; then
    log_error "Deploy directory not found: $DEPLOY_DIR"
    log_info "Please clone the repository first:"
    echo "  git clone YOUR_REPO_URL $DEPLOY_DIR"
    exit 1
fi

cd "$DEPLOY_DIR"

# Check if .env exists
if [ ! -f ".env" ]; then
    log_error ".env file not found!"
    log_info "Please create .env file before deploying"
    exit 1
fi

# Pull latest changes
log_info "Pulling latest code from git..."
git pull

# Stop containers
log_info "Stopping containers..."
/usr/bin/docker compose down

# Rebuild
log_info "Rebuilding containers..."
/usr/bin/docker compose build --no-cache

# Start
log_info "Starting containers..."
/usr/bin/docker compose up -d

# Show status
log_info "Checking status..."
/usr/bin/docker compose ps

log_success "Deployment complete!"
log_info "View logs: docker compose logs -f bot"
