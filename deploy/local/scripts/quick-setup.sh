#!/bin/bash
# Quick Setup Script - Creates missing files for local deployment
# Run from: /opt/homelab/HomeLabHub/deploy/local

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

echo "Creating .env file if missing..."
if [ ! -f "${DEPLOY_DIR}/.env" ]; then
    if [ -f "${DEPLOY_DIR}/.env.example" ]; then
        cp "${DEPLOY_DIR}/.env.example" "${DEPLOY_DIR}/.env"
        echo "Created .env from template"
    else
        cat > "${DEPLOY_DIR}/.env" << 'EOF'
# Local Ubuntu Deployment Environment
TZ=America/New_York

# MinIO Object Storage
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=

# Plex (get from https://www.plex.tv/claim/)
PLEX_CLAIM=
PLEX_TOKEN=

# Home Assistant (generate in HA: Profile -> Long-Lived Access Tokens)
HOME_ASSISTANT_TOKEN=

# VNC Remote Desktop (optional)
VNC_PASSWORD=

# Sunshine GameStream (optional)  
SUNSHINE_PASS=

# NAS Configuration (optional)
NAS_HOST=
NAS_USER=
NAS_PASSWORD=

# noVNC port (optional, default 6080)
NOVNC_PORT=6080
EOF
        echo "Created basic .env template"
    fi
fi

echo ""
echo "Generating secure passwords for empty fields..."

generate_password() {
    openssl rand -base64 24 2>/dev/null | tr -d '\n' | head -c 24 || \
    tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24
}

# Auto-generate MinIO password if empty
if grep -q "^MINIO_ROOT_PASSWORD=$" "${DEPLOY_DIR}/.env" 2>/dev/null; then
    NEW_PASS=$(generate_password)
    sed -i "s|^MINIO_ROOT_PASSWORD=.*|MINIO_ROOT_PASSWORD=${NEW_PASS}|" "${DEPLOY_DIR}/.env"
    echo "  Generated MINIO_ROOT_PASSWORD"
fi

# Auto-generate VNC password if empty
if grep -q "^VNC_PASSWORD=$" "${DEPLOY_DIR}/.env" 2>/dev/null; then
    NEW_PASS=$(openssl rand -base64 8 | tr -d '/+=' | head -c 8)
    sed -i "s|^VNC_PASSWORD=.*|VNC_PASSWORD=${NEW_PASS}|" "${DEPLOY_DIR}/.env"
    echo "  Generated VNC_PASSWORD"
fi

# Auto-generate Sunshine password if empty
if grep -q "^SUNSHINE_PASS=$" "${DEPLOY_DIR}/.env" 2>/dev/null; then
    NEW_PASS=$(generate_password)
    sed -i "s|^SUNSHINE_PASS=.*|SUNSHINE_PASS=${NEW_PASS}|" "${DEPLOY_DIR}/.env"
    echo "  Generated SUNSHINE_PASS"
fi

echo ""
echo "Environment setup complete!"
echo ""
echo "Manual configuration needed:"
echo "  - PLEX_CLAIM: Get from https://www.plex.tv/claim/"
echo "  - HOME_ASSISTANT_TOKEN: Generate in Home Assistant"
echo "  - NAS_HOST/USER/PASSWORD: If using NAS"
echo ""
echo "To start services:"
echo "  docker compose up -d"
echo ""
echo "Optional services:"
echo "  docker compose --profile vnc up -d        # noVNC desktop"
echo "  docker compose --profile gamestream up -d # Sunshine"
