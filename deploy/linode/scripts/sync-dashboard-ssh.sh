#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"

source "${DEPLOY_DIR}/../shared/lib.sh"

SSH_SOURCE="/root/.ssh"
SSH_VOLUME_NAME="linode_dashboard_ssh"

print_header "Dashboard SSH Key Sync"

if [ ! -f "${SSH_SOURCE}/homelab" ]; then
    print_error "SSH key not found at ${SSH_SOURCE}/homelab"
    echo "Generate it with: ssh-keygen -t ed25519 -f ${SSH_SOURCE}/homelab -N ''"
    exit 1
fi

VOLUME_PATH=$(docker volume inspect "$SSH_VOLUME_NAME" --format '{{ .Mountpoint }}' 2>/dev/null || echo "")

if [ -z "$VOLUME_PATH" ]; then
    echo "Creating dashboard_ssh volume..."
    docker volume create "$SSH_VOLUME_NAME"
    VOLUME_PATH=$(docker volume inspect "$SSH_VOLUME_NAME" --format '{{ .Mountpoint }}')
fi

echo "Syncing SSH keys to container volume..."

TEMP_CONTAINER="ssh-sync-temp-$$"
docker run --rm -d --name "$TEMP_CONTAINER" \
    -v "$SSH_VOLUME_NAME:/ssh" \
    alpine:latest sleep 60 >/dev/null

docker cp "${SSH_SOURCE}/homelab" "$TEMP_CONTAINER:/ssh/homelab"

if [ -f "${SSH_SOURCE}/homelab.pub" ]; then
    docker cp "${SSH_SOURCE}/homelab.pub" "$TEMP_CONTAINER:/ssh/homelab.pub"
fi

if [ -f "${SSH_SOURCE}/known_hosts" ]; then
    docker cp "${SSH_SOURCE}/known_hosts" "$TEMP_CONTAINER:/ssh/known_hosts"
else
    echo "Generating known_hosts entries..."
    KNOWN_HOSTS_CONTENT=""
    
    if [ -n "${TAILSCALE_LINODE_HOST:-}" ]; then
        echo "  Adding Linode host: $TAILSCALE_LINODE_HOST"
        KNOWN_HOSTS_CONTENT+="$(ssh-keyscan -H "$TAILSCALE_LINODE_HOST" 2>/dev/null || echo "")"
        KNOWN_HOSTS_CONTENT+=$'\n'
    fi
    
    KNOWN_HOSTS_CONTENT+="$(ssh-keyscan -H localhost 2>/dev/null || echo "")"
    KNOWN_HOSTS_CONTENT+=$'\n'
    KNOWN_HOSTS_CONTENT+="$(ssh-keyscan -H 127.0.0.1 2>/dev/null || echo "")"
    
    if [ -n "${TAILSCALE_LOCAL_HOST:-}" ]; then
        echo "  Adding Home host: $TAILSCALE_LOCAL_HOST"
        KNOWN_HOSTS_CONTENT+=$'\n'
        KNOWN_HOSTS_CONTENT+="$(ssh-keyscan -H "$TAILSCALE_LOCAL_HOST" 2>/dev/null || echo "")"
    fi
    
    if [ -n "${WINDOWS_VM_TAILSCALE_IP:-}" ]; then
        echo "  Adding Windows VM: $WINDOWS_VM_TAILSCALE_IP"
        KNOWN_HOSTS_CONTENT+=$'\n'
        KNOWN_HOSTS_CONTENT+="$(ssh-keyscan -H "$WINDOWS_VM_TAILSCALE_IP" 2>/dev/null || echo "")"
    fi
    
    echo "$KNOWN_HOSTS_CONTENT" | docker exec -i "$TEMP_CONTAINER" sh -c "cat > /ssh/known_hosts"
fi

docker exec "$TEMP_CONTAINER" sh -c "
    chown -R 1001:1001 /ssh
    chmod 700 /ssh
    chmod 600 /ssh/homelab
    [ -f /ssh/homelab.pub ] && chmod 644 /ssh/homelab.pub
    [ -f /ssh/known_hosts ] && chmod 644 /ssh/known_hosts
"

docker stop "$TEMP_CONTAINER" >/dev/null 2>&1 || true

print_success "SSH keys synced to dashboard volume"
echo "  Volume: $SSH_VOLUME_NAME"
echo "  Path in container: /app/.ssh/homelab"

docker run --rm -v "$SSH_VOLUME_NAME:/ssh:ro" alpine:latest ls -la /ssh
