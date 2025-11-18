#!/bin/bash
# Fix VNC password storage location
# This script ensures the VNC password is stored in the correct location
# and x11vnc can find it

set -e

VNC_USER=${VNC_USER:-evin}
USER_HOME="/home/${VNC_USER}"

echo "Setting up VNC password for user: ${VNC_USER}"

# Create .vnc directory if it doesn't exist
mkdir -p "${USER_HOME}/.vnc"

# If VNC_PASSWORD is set, create the password file in the correct location
if [ -n "$VNC_PASSWORD" ]; then
    echo "Creating VNC password file..."
    # Use x11vnc to create password file in user's home directory
    echo "$VNC_PASSWORD" | x11vnc -storepasswd - "${USER_HOME}/.vnc/passwd" 2>/dev/null || true
    
    # Set proper permissions
    chmod 600 "${USER_HOME}/.vnc/passwd" 2>/dev/null || true
    chown ${VNC_USER}:${VNC_USER} "${USER_HOME}/.vnc/passwd" 2>/dev/null || true
    
    echo "✓ VNC password configured at ${USER_HOME}/.vnc/passwd"
else
    echo "⚠ VNC_PASSWORD not set - VNC may not require password"
fi

# Export the password file location for x11vnc to use
export X11VNC_AUTH="${USER_HOME}/.vnc/passwd"

echo "VNC password setup complete"
