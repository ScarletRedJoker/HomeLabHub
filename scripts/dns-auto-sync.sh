#!/bin/bash
# ============================================
# DNS AUTO-SYNC WATCHER
# Watches Traefik routes and syncs DNS automatically
# ============================================

set -euo pipefail

PROJECT_ROOT="/home/evin/contain/HomeLabHub"
SERVICES_YAML="$PROJECT_ROOT/orchestration/services.yaml"
LOG_FILE="$PROJECT_ROOT/logs/dns-auto-sync.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Watch Traefik for route changes
watch_traefik_routes() {
    log "Starting DNS auto-sync watcher..."
    
    while true; do
        # Get current Traefik routes
        current_routes=$(docker exec caddy wget -q -O - http://traefik:8080/api/http/routers 2>/dev/null || echo "[]")
        
        # Extract domains from routes
        domains=$(echo "$current_routes" | grep -oP '(?<="Host\(`)[^`]+' || true)
        
        if [ -n "$domains" ]; then
            log "Found domains: $domains"
            
            # Sync DNS for each domain
            for domain in $domains; do
                sync_dns_for_domain "$domain"
            done
        fi
        
        # Check every 5 minutes
        sleep 300
    done
}

sync_dns_for_domain() {
    local domain=$1
    
    log "Syncing DNS for $domain..."
    
    # Run homelab dns sync command
    if cd "$PROJECT_ROOT" && ./homelab dns sync 2>&1 | tee -a "$LOG_FILE"; then
        log "✓ DNS synced successfully for $domain"
    else
        log "✗ DNS sync failed for $domain"
    fi
}

# Monitor services.yaml for changes
watch_services_yaml() {
    log "Watching $SERVICES_YAML for changes..."
    
    last_modified=0
    
    while true; do
        if [ -f "$SERVICES_YAML" ]; then
            current_modified=$(stat -c %Y "$SERVICES_YAML")
            
            if [ "$current_modified" != "$last_modified" ]; then
                log "services.yaml changed, triggering DNS sync..."
                sync_dns_for_domain "all"
                last_modified=$current_modified
            fi
        fi
        
        sleep 60
    done
}

main() {
    mkdir -p "$(dirname "$LOG_FILE")"
    
    log "=== DNS Auto-Sync Watcher Started ==="
    
    # Run both watchers in background
    watch_services_yaml &
    watch_traefik_routes
}

main
