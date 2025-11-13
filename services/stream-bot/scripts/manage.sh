#!/bin/bash
# StreamBot Management Script for HomelabHub Integration
# This script provides a unified interface for starting, stopping, and diagnosing the StreamBot application

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="streambot"
COMPOSE_FILE="docker-compose.yml"
HEALTH_ENDPOINT="http://localhost:5000/health"
DIAGNOSTICS_ENDPOINT="http://localhost:5000/api/diagnostics"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is available
check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
}

# Get Docker Compose command (v1 or v2)
get_compose_cmd() {
    if docker compose version &> /dev/null; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

# Start the application
start() {
    log_info "Starting $APP_NAME..."
    check_docker
    
    COMPOSE_CMD=$(get_compose_cmd)
    
    # Check if .env file exists
    if [ ! -f .env ]; then
        log_warn ".env file not found. Creating from example..."
        if [ -f .env.example ]; then
            cp .env.example .env
            log_info "Please configure .env file with your settings"
        fi
    fi
    
    # Start containers
    $COMPOSE_CMD -f "$COMPOSE_FILE" up -d
    
    # Wait for health check
    log_info "Waiting for application to be healthy..."
    for i in {1..30}; do
        if curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
            log_info "$APP_NAME started successfully!"
            return 0
        fi
        echo -n "."
        sleep 2
    done
    
    log_error "$APP_NAME failed to start or health check failed"
    $COMPOSE_CMD -f "$COMPOSE_FILE" logs --tail=50
    return 1
}

# Stop the application
stop() {
    log_info "Stopping $APP_NAME..."
    check_docker
    
    COMPOSE_CMD=$(get_compose_cmd)
    $COMPOSE_CMD -f "$COMPOSE_FILE" down
    
    log_info "$APP_NAME stopped successfully"
}

# Restart the application
restart() {
    log_info "Restarting $APP_NAME..."
    stop
    sleep 2
    start
}

# Get application status
status() {
    check_docker
    
    COMPOSE_CMD=$(get_compose_cmd)
    
    log_info "Container status:"
    $COMPOSE_CMD -f "$COMPOSE_FILE" ps
    
    echo ""
    log_info "Health check:"
    if curl -sf "$HEALTH_ENDPOINT" 2>/dev/null; then
        log_info "Application is healthy"
    else
        log_error "Application is not responding to health checks"
        return 1
    fi
}

# Get detailed diagnostics
diagnose() {
    log_info "Running diagnostics..."
    
    if ! curl -sf "$HEALTH_ENDPOINT" > /dev/null 2>&1; then
        log_error "Application is not running or not responding"
        return 1
    fi
    
    log_info "Fetching diagnostics from $DIAGNOSTICS_ENDPOINT..."
    
    if command -v jq &> /dev/null; then
        curl -sf "$DIAGNOSTICS_ENDPOINT" | jq .
    else
        curl -sf "$DIAGNOSTICS_ENDPOINT"
    fi
}

# View logs
logs() {
    check_docker
    
    COMPOSE_CMD=$(get_compose_cmd)
    
    if [ -n "$1" ]; then
        $COMPOSE_CMD -f "$COMPOSE_FILE" logs -f --tail="$1" streambot
    else
        $COMPOSE_CMD -f "$COMPOSE_FILE" logs -f --tail=100 streambot
    fi
}

# Build the container
build() {
    log_info "Building $APP_NAME container..."
    check_docker
    
    COMPOSE_CMD=$(get_compose_cmd)
    $COMPOSE_CMD -f "$COMPOSE_FILE" build
    
    log_info "Build completed successfully"
}

# Run database migrations
migrate() {
    log_info "Running database migrations..."
    check_docker
    
    COMPOSE_CMD=$(get_compose_cmd)
    $COMPOSE_CMD -f "$COMPOSE_FILE" exec streambot npm run db:push
    
    log_info "Migrations completed"
}

# Show help
show_help() {
    cat << EOF
StreamBot Management Script for HomelabHub Integration

Usage: $0 <command> [options]

Commands:
    start           Start the application
    stop            Stop the application
    restart         Restart the application
    status          Show application status
    diagnose        Run detailed diagnostics
    logs [lines]    View application logs (default: 100 lines)
    build           Build the Docker container
    migrate         Run database migrations
    help            Show this help message

Examples:
    $0 start                # Start the application
    $0 status               # Check if application is running
    $0 diagnose             # Get detailed diagnostics
    $0 logs 50              # View last 50 log lines
    $0 restart              # Restart the application

For HomelabHub integration, use:
    - Health check: curl http://localhost:5000/health
    - Diagnostics: curl http://localhost:5000/api/diagnostics
    - Start: $0 start
    - Stop: $0 stop

EOF
}

# Main command handler
case "${1:-help}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    diagnose|diagnostics)
        diagnose
        ;;
    logs)
        logs "${2:-100}"
        ;;
    build)
        build
        ;;
    migrate)
        migrate
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
