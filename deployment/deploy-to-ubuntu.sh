#!/bin/bash
# ============================================
# Deploy HomeLabHub to Ubuntu Server
# ============================================
# This script automates deployment to your Ubuntu production server
# Prerequisites:
#   - Ubuntu 22.04 or newer
#   - Docker and Docker Compose installed
#   - Git installed
#   - SSH access to the server

set -e

# ============================================
# Configuration
# ============================================
REPO_URL="https://github.com/yourusername/homelabhub.git"  # Update this!
DEPLOY_DIR="/opt/homelabhub"
BACKUP_DIR="/opt/homelabhub-backups"
ENV_FILE="${DEPLOY_DIR}/.env.production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# Helper Functions
# ============================================
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking requirements..."
    
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git first."
        exit 1
    fi
    
    log_info "✓ All requirements satisfied"
}

# ============================================
# Deployment Steps
# ============================================

echo "============================================"
echo "HomeLabHub Deployment Script"
echo "============================================"
echo ""

# Step 1: Check requirements
check_requirements

# Step 2: Create backup
if [ -d "$DEPLOY_DIR" ]; then
    log_info "Creating backup of existing deployment..."
    mkdir -p "$BACKUP_DIR"
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S)"
    sudo cp -r "$DEPLOY_DIR" "$BACKUP_DIR/$BACKUP_NAME"
    log_info "✓ Backup created: $BACKUP_DIR/$BACKUP_NAME"
fi

# Step 3: Clone or update repository
if [ -d "$DEPLOY_DIR" ]; then
    log_info "Updating existing repository..."
    cd "$DEPLOY_DIR"
    sudo git pull
else
    log_info "Cloning repository..."
    sudo mkdir -p "$(dirname "$DEPLOY_DIR")"
    sudo git clone "$REPO_URL" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi

# Step 4: Check for .env.production
if [ ! -f "$ENV_FILE" ]; then
    log_error ".env.production file not found!"
    log_info "Please create .env.production with your production credentials."
    log_info "You can use the .env.example as a template."
    log_info ""
    log_info "Steps to create .env.production:"
    log_info "  1. Copy .env.example: cp .env.example .env.production"
    log_info "  2. Edit .env.production and fill in all required values"
    log_info "  3. Ensure DATABASE_URL values are fully resolved (no \${VAR} expansion)"
    exit 1
fi

log_info "✓ Found .env.production"

# Step 5: Set proper permissions
log_info "Setting file permissions..."
sudo chmod 600 "$ENV_FILE"
sudo chown -R $USER:$USER "$DEPLOY_DIR"

# Step 6: Pull Docker images
log_info "Pulling Docker images..."
docker-compose pull

# Step 7: Stop existing containers
if docker-compose ps | grep -q "Up"; then
    log_info "Stopping existing containers..."
    docker-compose down
fi

# Step 8: Build and start services
log_info "Building and starting services..."
docker-compose --env-file "$ENV_FILE" up -d --build

# Step 9: Wait for services to be healthy
log_info "Waiting for services to be ready..."
sleep 10

# Step 10: Check service health
log_info "Checking service health..."
docker-compose ps

# Step 11: Show logs
log_info "Showing recent logs..."
docker-compose logs --tail=50

# ============================================
# Deployment Complete
# ============================================
echo ""
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
log_info "Services deployed successfully!"
echo ""
log_info "Next steps:"
echo "  1. Verify all services are running: docker-compose ps"
echo "  2. Check logs for errors: docker-compose logs -f"
echo "  3. Test dashboard: https://yourdomain.com"
echo "  4. Test Stream-bot: https://stream.yourdomain.com"
echo "  5. Test Discord bot functionality"
echo ""
log_warn "Remember to:"
echo "  - Configure Caddy reverse proxy for HTTPS"
echo "  - Set up firewall rules (ufw)"
echo "  - Configure automated backups"
echo "  - Monitor service health"
echo ""
echo "============================================"
