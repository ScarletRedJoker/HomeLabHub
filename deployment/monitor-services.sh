#!/bin/bash

# ======================================================================
# Service Monitor - Watch logs and status of all homelab services
# ======================================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_header() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  $1${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
    echo ""
}

print_success() { echo -e "${GREEN}✓${NC} $1"; }
print_warning() { echo -e "${YELLOW}⚠${NC} $1"; }
print_error() { echo -e "${RED}✗${NC} $1"; }

cd /home/evin/contain/HomeLabHub

print_header "Homelab Service Monitor"

echo "Select monitoring option:"
echo ""
echo "  1) Container Status Overview"
echo "  2) SSL Certificate Status"
echo "  3) Follow All Logs (live)"
echo "  4) Follow Caddy Logs (SSL)"
echo "  5) Follow Dashboard Logs"
echo "  6) Follow Discord Bot Logs"
echo "  7) Follow Stream Bot Logs"
echo "  8) Show Recent Errors"
echo "  9) Health Check All Services"
echo "  0) Exit"
echo ""
read -p "Enter choice [1-9, 0 to exit]: " choice

case $choice in
    1)
        print_header "Container Status"
        docker compose -f docker-compose.unified.yml ps
        echo ""
        RUNNING=$(docker compose -f docker-compose.unified.yml ps --filter "status=running" -q | wc -l)
        TOTAL=$(docker compose -f docker-compose.unified.yml ps -q | wc -l)
        
        if [ "$RUNNING" -eq "$TOTAL" ]; then
            print_success "All $TOTAL containers running!"
        else
            print_warning "$RUNNING out of $TOTAL containers running"
        fi
        ;;
    
    2)
        print_header "SSL Certificate Status"
        echo "Checking Caddy for SSL certificates..."
        echo ""
        
        CADDY_LOGS=$(docker logs caddy --tail=100 2>&1)
        
        if echo "$CADDY_LOGS" | grep -qi "obtained.*certificate\|certificate.*successfully"; then
            print_success "SSL certificates acquired!"
            echo ""
            echo "Active certificates for:"
            echo "$CADDY_LOGS" | grep -i "obtained.*certificate\|certificate.*successfully" | sed 's/.*{\(.*\)}.*/  ✓ \1/' | sort -u
        else
            print_warning "No certificates found yet (or still acquiring)"
            echo ""
            echo "Recent Caddy activity:"
            docker logs caddy --tail=20
        fi
        ;;
    
    3)
        print_header "Following All Service Logs"
        print_warning "Press Ctrl+C to exit"
        echo ""
        docker compose -f docker-compose.unified.yml logs -f
        ;;
    
    4)
        print_header "Following Caddy Logs (SSL)"
        print_warning "Press Ctrl+C to exit"
        echo ""
        docker logs caddy -f
        ;;
    
    5)
        print_header "Following Dashboard Logs"
        print_warning "Press Ctrl+C to exit"
        echo ""
        docker logs homelab-dashboard -f
        ;;
    
    6)
        print_header "Following Discord Bot Logs"
        print_warning "Press Ctrl+C to exit"
        echo ""
        docker logs discord-bot -f
        ;;
    
    7)
        print_header "Following Stream Bot Logs"
        print_warning "Press Ctrl+C to exit"
        echo ""
        docker logs stream-bot -f
        ;;
    
    8)
        print_header "Recent Errors"
        echo "Scanning logs for errors..."
        echo ""
        
        SERVICES=("caddy" "homelab-dashboard" "discord-bot" "stream-bot" "n8n" "plex-server" "vnc-desktop")
        
        for service in "${SERVICES[@]}"; do
            ERRORS=$(docker logs $service --tail=50 2>&1 | grep -i "error\|fail\|exception" | head -3)
            if [ -n "$ERRORS" ]; then
                echo -e "${YELLOW}▶ $service${NC}"
                echo "$ERRORS" | sed 's/^/  /'
                echo ""
            fi
        done
        
        echo "If no errors shown above, all services are healthy!"
        ;;
    
    9)
        print_header "Health Check"
        echo "Checking all services..."
        echo ""
        
        # Container status
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Container Status:"
        docker compose -f docker-compose.unified.yml ps
        echo ""
        
        # Port bindings
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Port Bindings:"
        docker compose -f docker-compose.unified.yml ps --format "table {{.Name}}\t{{.Ports}}" | head -10
        echo ""
        
        # Resource usage
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Resource Usage:"
        docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" $(docker compose -f docker-compose.unified.yml ps -q)
        echo ""
        
        # SSL Status
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "SSL Certificates:"
        CADDY_CERTS=$(docker exec caddy ls /data/caddy/certificates 2>/dev/null | wc -l)
        if [ "$CADDY_CERTS" -gt 0 ]; then
            print_success "Caddy managing SSL certificates (auto-renew enabled)"
        else
            print_warning "No certificates found yet (may be acquiring)"
        fi
        echo ""
        
        print_success "Health check complete!"
        ;;
    
    0)
        echo "Exiting..."
        exit 0
        ;;
    
    *)
        print_error "Invalid choice"
        exit 1
        ;;
esac

echo ""
