#!/bin/bash
set -euo pipefail

echo "================================================"
echo "  Tailscale VPN Mesh Setup"
echo "================================================"
echo ""

print_status() { echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
print_success() { echo -e "\033[1;32m✓\033[0m $1"; }
print_warning() { echo -e "\033[1;33m⚠\033[0m $1"; }

install_tailscale() {
    if command -v tailscale &> /dev/null; then
        print_success "Tailscale already installed"
        return 0
    fi
    
    print_status "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
    print_success "Tailscale installed"
}

authenticate() {
    print_status "Authenticating with Tailscale..."
    
    if tailscale status &> /dev/null; then
        CURRENT_IP=$(tailscale ip -4)
        print_success "Already authenticated: $CURRENT_IP"
    else
        print_warning "Opening browser for authentication..."
        sudo tailscale up --accept-routes --accept-dns
    fi
}

show_acl_config() {
    echo ""
    echo "================================================"
    echo "  Recommended Tailscale ACL Configuration"
    echo "================================================"
    echo ""
    echo "Add this to your Tailscale admin console ACLs:"
    echo ""
    cat << 'ACL'
{
  "acls": [
    // Homelab hosts can access each other
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:*"]},
    
    // Allow specific ports between homelab nodes
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:5432"]},  // PostgreSQL
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:6379"]},  // Redis
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:8123"]},  // Home Assistant
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:32400"]}, // Plex
    {"action": "accept", "src": ["tag:homelab"], "dst": ["tag:homelab:9000"]},  // MinIO
  ],
  
  "tagOwners": {
    "tag:homelab": ["autogroup:admin"]
  }
}
ACL
    echo ""
}

show_status() {
    print_status "Current Tailscale Status"
    echo ""
    tailscale status
    echo ""
    
    echo "Your Tailscale IPs:"
    echo "  IPv4: $(tailscale ip -4 2>/dev/null || echo 'Not available')"
    echo "  IPv6: $(tailscale ip -6 2>/dev/null || echo 'Not available')"
    echo ""
}

main() {
    install_tailscale
    authenticate
    show_status
    show_acl_config
    
    echo ""
    echo "Next steps:"
    echo "  1. Run this script on both Linode and Local host"
    echo "  2. Note down the Tailscale IPs for each machine"
    echo "  3. Update .env files with Tailscale IPs"
    echo "  4. Tag both machines as 'homelab' in Tailscale admin"
    echo ""
}

main "$@"
