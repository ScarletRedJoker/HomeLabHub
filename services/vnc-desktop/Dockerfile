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
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

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
