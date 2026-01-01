#!/bin/bash

# Set qBittorrent WebUI password from environment variable
# This runs on container startup

CONFIG_FILE="/config/qBittorrent/qBittorrent.conf"

if [ -n "$WEBUI_PASSWORD" ]; then
    echo "Setting qBittorrent WebUI password..."
    
    # Wait for config file to exist
    while [ ! -f "$CONFIG_FILE" ]; do
        sleep 1
    done
    
    # Generate PBKDF2 hash (qBittorrent 4.2+ format)
    HASH=$(python3 -c "
import hashlib
import base64
password = '$WEBUI_PASSWORD'.encode()
salt = b''
iterations = 100000
dk = hashlib.pbkdf2_hmac('sha512', password, salt, iterations)
print('@ByteArray(' + dk.hex() + ')')
")
    
    # Update config file
    if grep -q "WebUI\\\\Password_PBKDF2" "$CONFIG_FILE"; then
        sed -i "s|WebUI\\\\Password_PBKDF2=.*|WebUI\\\\Password_PBKDF2=$HASH|" "$CONFIG_FILE"
    else
        echo "WebUI\\Password_PBKDF2=$HASH" >> "$CONFIG_FILE"
    fi
    
    echo "Password set successfully"
fi
