#!/bin/bash
# ╔════════════════════════════════════════════════════════════════════════════╗
# ║             LOGGING SETUP - Configure Structured Logging                  ║
# ╚════════════════════════════════════════════════════════════════════════════╝
# Sets up JSON logging, log rotation, and directory structure

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_ROOT="${PROJECT_ROOT:-/home/evin/contain/HomeLabHub}"

echo -e "${CYAN}═══ Setting Up Structured Logging ═══${NC}"
echo ""

# ============================================================================
# Create Log Directory Structure
# ============================================================================
echo -e "${CYAN}[1/5] Creating log directory structure...${NC}"

# System log directory
if [ -d "/var/log/homelab" ] || sudo mkdir -p /var/log/homelab 2>/dev/null; then
    sudo chown -R ${USER}:docker /var/log/homelab 2>/dev/null || true
    sudo chmod 775 /var/log/homelab 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} /var/log/homelab"
else
    echo -e "  ${YELLOW}⚠${NC} /var/log/homelab (requires sudo)"
fi

# Project log directories
log_dirs=(
    "$PROJECT_ROOT/logs"
    "$PROJECT_ROOT/logs/aggregated"
    "$PROJECT_ROOT/logs/archive"
    "$PROJECT_ROOT/services/dashboard/logs"
    "$PROJECT_ROOT/services/discord-bot/logs"
    "$PROJECT_ROOT/services/stream-bot/logs"
    "$PROJECT_ROOT/var/reports"
)

for dir in "${log_dirs[@]}"; do
    mkdir -p "$dir" 2>/dev/null || true
    chmod 755 "$dir" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} $dir"
done

# ============================================================================
# Install Logrotate Configuration
# ============================================================================
echo ""
echo -e "${CYAN}[2/5] Installing logrotate configuration...${NC}"

if [ -f "/etc/logrotate.d" ]; then
    if sudo cp "$PROJECT_ROOT/config/logging/logrotate.conf" /etc/logrotate.d/homelab 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Logrotate config installed"
    else
        echo -e "  ${YELLOW}⚠${NC} Could not install system logrotate (requires sudo)"
        echo "     Manual install: sudo cp config/logging/logrotate.conf /etc/logrotate.d/homelab"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} Logrotate not installed on this system"
fi

# ============================================================================
# Create JSON Log Formatter Script
# ============================================================================
echo ""
echo -e "${CYAN}[3/5] Creating JSON log formatter...${NC}"

cat > "$PROJECT_ROOT/config/logging/json-log-formatter.sh" << 'EOF'
#!/bin/bash
# JSON Log Formatter - Wraps log output in JSON format
# Usage: some-command 2>&1 | json-log-formatter.sh <service-name>

SERVICE="${1:-unknown}"
COMPONENT="${2:-general}"

while IFS= read -r line; do
    timestamp=$(date -Iseconds)
    level="INFO"
    
    # Detect log level from content
    if echo "$line" | grep -qiE '\b(error|exception|fail|fatal)\b'; then
        level="ERROR"
    elif echo "$line" | grep -qiE '\b(warn|warning)\b'; then
        level="WARN"
    elif echo "$line" | grep -qiE '\b(debug)\b'; then
        level="DEBUG"
    fi
    
    # Escape special characters for JSON
    escaped_line=$(echo "$line" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | tr -d '\n')
    
    # Output as JSON
    echo "{\"timestamp\":\"$timestamp\",\"level\":\"$level\",\"service\":\"$SERVICE\",\"component\":\"$COMPONENT\",\"message\":\"$escaped_line\"}"
done
EOF

chmod +x "$PROJECT_ROOT/config/logging/json-log-formatter.sh"
echo -e "  ${GREEN}✓${NC} JSON formatter created"

# ============================================================================
# Create Log Aggregator Script
# ============================================================================
echo ""
echo -e "${CYAN}[4/5] Creating log aggregation script...${NC}"

cat > "$PROJECT_ROOT/config/logging/aggregate-logs.sh" << 'EOF'
#!/bin/bash
# Log Aggregator - Combines logs from all services into unified files
# Run periodically via cron: */5 * * * * /path/to/aggregate-logs.sh

PROJECT_ROOT="${PROJECT_ROOT:-/home/evin/contain/HomeLabHub}"
AGGREGATE_DIR="$PROJECT_ROOT/logs/aggregated"
TIMESTAMP=$(date +%Y%m%d)

# Ensure directory exists
mkdir -p "$AGGREGATE_DIR"

# Aggregate all service logs
aggregate_service_logs() {
    local combined_log="$AGGREGATE_DIR/combined-$TIMESTAMP.log"
    local error_log="$AGGREGATE_DIR/errors-$TIMESTAMP.log"
    
    # Clear old today's file if starting fresh
    if [ ! -f "$combined_log" ]; then
        touch "$combined_log"
        touch "$error_log"
    fi
    
    # Aggregate from Docker logs
    for container in homelab-dashboard discord-bot stream-bot homelab-celery-worker caddy; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            docker logs --since 5m "$container" 2>&1 | while read line; do
                echo "[$container] $line" >> "$combined_log"
                if echo "$line" | grep -qiE '(error|exception|fatal)'; then
                    echo "[$container] $line" >> "$error_log"
                fi
            done
        fi
    done
    
    # Aggregate from file-based logs
    for log_file in "$PROJECT_ROOT"/services/*/logs/*.log; do
        if [ -f "$log_file" ]; then
            service=$(basename $(dirname $(dirname "$log_file")))
            tail -n 100 "$log_file" 2>/dev/null | while read line; do
                echo "[$service] $line" >> "$combined_log"
            done
        fi
    done
    
    # Keep only last 1000 lines in combined log
    if [ -f "$combined_log" ]; then
        tail -n 1000 "$combined_log" > "${combined_log}.tmp" && mv "${combined_log}.tmp" "$combined_log"
    fi
}

# Rotate old aggregated logs
rotate_old_logs() {
    local archive_dir="$PROJECT_ROOT/logs/archive"
    mkdir -p "$archive_dir"
    
    # Move logs older than 7 days to archive
    find "$AGGREGATE_DIR" -name "*.log" -mtime +7 -exec mv {} "$archive_dir/" \; 2>/dev/null || true
    
    # Delete archived logs older than 30 days
    find "$archive_dir" -name "*.log" -mtime +30 -delete 2>/dev/null || true
}

# Main
aggregate_service_logs
rotate_old_logs

echo "Log aggregation completed at $(date)"
EOF

chmod +x "$PROJECT_ROOT/config/logging/aggregate-logs.sh"
echo -e "  ${GREEN}✓${NC} Log aggregator created"

# ============================================================================
# Create Docker Logging Configuration
# ============================================================================
echo ""
echo -e "${CYAN}[5/5] Docker daemon logging configuration...${NC}"

cat > "$PROJECT_ROOT/config/logging/docker-daemon.json" << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "5",
    "labels": "service,component",
    "env": "SERVICE_NAME,NODE_ENV,FLASK_ENV"
  }
}
EOF

echo -e "  ${GREEN}✓${NC} Docker daemon config template created"
echo ""
echo -e "${YELLOW}Note:${NC} To apply Docker daemon config, copy to /etc/docker/daemon.json"
echo "      and restart Docker: sudo systemctl restart docker"

# ============================================================================
# Summary
# ============================================================================
echo ""
echo -e "${CYAN}═══ Logging Setup Complete ═══${NC}"
echo ""
echo "Log directories:"
echo "  - Aggregated: $PROJECT_ROOT/logs/aggregated/"
echo "  - Archive:    $PROJECT_ROOT/logs/archive/"
echo "  - Reports:    $PROJECT_ROOT/var/reports/"
echo ""
echo "Configuration files:"
echo "  - Logging config:  config/logging/logging.json"
echo "  - Logrotate:       config/logging/logrotate.conf"
echo "  - Docker daemon:   config/logging/docker-daemon.json"
echo ""
echo "Helper scripts:"
echo "  - JSON formatter:  config/logging/json-log-formatter.sh"
echo "  - Log aggregator:  config/logging/aggregate-logs.sh"
echo ""
echo "To add log aggregation cron job:"
echo "  echo '*/5 * * * * $PROJECT_ROOT/config/logging/aggregate-logs.sh' | crontab -"
EOF

chmod +x "$PROJECT_ROOT/config/logging/setup-logging.sh"
echo -e "  ${GREEN}✓${NC} Setup script created"

echo ""
echo -e "${GREEN}✅ Logging configuration complete!${NC}"
echo ""
echo "Run the setup script on your server:"
echo "  ./config/logging/setup-logging.sh"
