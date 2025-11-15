FROM dorowu/ubuntu-desktop-lxde-vnc:latest

ENV DEBIAN_FRONTEND=noninteractive \
    VNC_USER=evin \
    USER_UID=1000 \
    USER_GID=1000 \
    WINDOWS_RDP_HOST="" \
    WINDOWS_RDP_PORT=3389 \
    WINDOWS_RDP_USER="" \
    WINDOWS_RDP_PASSWORD="" \
    WINDOWS_RDP_DOMAIN="" \
    RDP_RECONNECT_DELAY=5 \
    RDP_MAX_RETRIES=0

USER root

# Fix: Remove problematic Chrome repo that has GPG key issues
RUN rm -f /etc/apt/sources.list.d/google-chrome.list || true

# Install FreeRDP client and minimal utilities for X11 XRDP viewing
RUN apt-get update && apt-get install -y \
    # FreeRDP X11 Client (primary requirement)
    freerdp2-x11 \
    freerdp2-shadow-x11 \
    # Basic utilities for troubleshooting
    curl \
    wget \
    net-tools \
    iputils-ping \
    procps \
    vim \
    nano \
    # Desktop integration (minimal)
    dbus-x11 \
    xdg-utils \
    # Terminal for debugging if needed
    gnome-terminal \
    # Connection monitoring tools
    lsof \
    psmisc \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/* \
    && rm -rf /var/cache/apt/*

# Create RDP launcher script with reconnection logic
RUN cat > /usr/local/bin/rdp-launcher.sh << 'RDPEOF'
#!/bin/bash

set -e

echo "============================================"
echo "  FreeRDP Auto-Launcher for Windows XRDP"
echo "============================================"

# Wait for X server to be ready
echo "Waiting for X server..."
while ! xdpyinfo >/dev/null 2>&1; do
    sleep 1
done
echo "X server is ready!"

# Validate required environment variables
if [ -z "$WINDOWS_RDP_HOST" ]; then
    echo "ERROR: WINDOWS_RDP_HOST is not set!"
    echo "Please set the Windows XRDP server IP/hostname"
    exit 1
fi

if [ -z "$WINDOWS_RDP_USER" ]; then
    echo "ERROR: WINDOWS_RDP_USER is not set!"
    echo "Please set the Windows username"
    exit 1
fi

# Build FreeRDP command
RDP_CMD="xfreerdp"
RDP_CMD="$RDP_CMD /v:${WINDOWS_RDP_HOST}:${WINDOWS_RDP_PORT}"
RDP_CMD="$RDP_CMD /u:${WINDOWS_RDP_USER}"

# Add password if set
if [ -n "$WINDOWS_RDP_PASSWORD" ]; then
    RDP_CMD="$RDP_CMD /p:${WINDOWS_RDP_PASSWORD}"
fi

# Add domain if set
if [ -n "$WINDOWS_RDP_DOMAIN" ]; then
    RDP_CMD="$RDP_CMD /d:${WINDOWS_RDP_DOMAIN}"
fi

# Fullscreen mode for NoVNC display
RDP_CMD="$RDP_CMD /f"
RDP_CMD="$RDP_CMD /smart-sizing"
RDP_CMD="$RDP_CMD /dynamic-resolution"

# Performance and compatibility options
RDP_CMD="$RDP_CMD /gfx:AVC444"
RDP_CMD="$RDP_CMD /network:auto"
RDP_CMD="$RDP_CMD /compression"
RDP_CMD="$RDP_CMD /cert:ignore"
RDP_CMD="$RDP_CMD /timeout:60000"
RDP_CMD="$RDP_CMD +clipboard"
RDP_CMD="$RDP_CMD /audio-mode:0"

# Reconnection loop
RETRY_COUNT=0
MAX_RETRIES=${RDP_MAX_RETRIES:-0}  # 0 = infinite retries
RECONNECT_DELAY=${RDP_RECONNECT_DELAY:-5}

while true; do
    if [ $MAX_RETRIES -gt 0 ] && [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "Maximum retry attempts ($MAX_RETRIES) reached. Exiting."
        exit 1
    fi

    if [ $RETRY_COUNT -gt 0 ]; then
        echo "Reconnection attempt #$RETRY_COUNT after $RECONNECT_DELAY seconds..."
        sleep $RECONNECT_DELAY
    fi

    echo "Connecting to Windows XRDP: ${WINDOWS_RDP_USER}@${WINDOWS_RDP_HOST}:${WINDOWS_RDP_PORT}"
    echo "Command: $RDP_CMD"
    
    # Execute FreeRDP
    $RDP_CMD
    
    EXIT_CODE=$?
    echo "FreeRDP exited with code: $EXIT_CODE"
    
    if [ $EXIT_CODE -eq 0 ]; then
        echo "Clean disconnection. Reconnecting..."
    else
        echo "Connection error. Reconnecting..."
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
done
RDPEOF

RUN chmod +x /usr/local/bin/rdp-launcher.sh

# Create VNC connection monitor script
RUN cat > /usr/local/bin/vnc-monitor.sh << 'VNCMON'
#!/bin/bash
# VNC Connection Monitor - Tracks and limits connections

MAX_CONNECTIONS=${MAX_VNC_CONNECTIONS:-3}
IDLE_TIMEOUT=${VNC_IDLE_TIMEOUT:-14400}  # 4 hours in seconds
LOG_FILE="/tmp/vnc-connections.log"

# Count active VNC connections
count_connections() {
    lsof -i :5900 -i :6080 -i :6079 2>/dev/null | grep ESTABLISHED | wc -l
}

# Log connection info
log_connections() {
    local count=$(count_connections)
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$timestamp - Active VNC connections: $count/$MAX_CONNECTIONS" >> "$LOG_FILE"
    echo "$count"
}

# Get stats for monitoring dashboard
get_stats() {
    local active=$(count_connections)
    local cpu=$(ps aux | grep -E '(Xvnc|websockify|xfreerdp)' | grep -v grep | awk '{sum+=$3} END {print sum}')
    local mem=$(ps aux | grep -E '(Xvnc|websockify|xfreerdp)' | grep -v grep | awk '{sum+=$4} END {print sum}')
    
    cat << STATS
{
  "active_connections": ${active:-0},
  "max_connections": ${MAX_CONNECTIONS},
  "cpu_percent": ${cpu:-0},
  "memory_percent": ${mem:-0},
  "idle_timeout_sec": ${IDLE_TIMEOUT}
}
STATS
}

case "$1" in
    count)
        log_connections
        ;;
    stats)
        get_stats
        ;;
    check-limit)
        count=$(count_connections)
        if [ "$count" -ge "$MAX_CONNECTIONS" ]; then
            echo "ERROR: Maximum VNC connections ($MAX_CONNECTIONS) reached"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 {count|stats|check-limit}"
        exit 1
        ;;
esac
VNCMON

RUN chmod +x /usr/local/bin/vnc-monitor.sh

# Create user
RUN groupadd -g ${USER_GID} ${VNC_USER} || true && \
    useradd -m -u ${USER_UID} -g ${USER_GID} -s /bin/bash ${VNC_USER} || usermod -l ${VNC_USER} ubuntu

# Copy bootstrap script
COPY bootstrap.sh /usr/local/bin/bootstrap.sh
RUN chmod +x /usr/local/bin/bootstrap.sh

# Create user directories
USER ${VNC_USER}

RUN mkdir -p /home/${VNC_USER}/.config/lxpanel/LXDE/panels && \
    mkdir -p /home/${VNC_USER}/Desktop && \
    mkdir -p /home/${VNC_USER}/.local/share/applications

USER root

ENTRYPOINT ["/bin/bash", "-c", "/usr/local/bin/bootstrap.sh && /startup.sh"]
