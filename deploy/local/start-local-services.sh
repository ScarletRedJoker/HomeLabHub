#!/bin/bash
# Start Local Ubuntu Services
# Run from: /opt/homelab/HomeLabHub/deploy/local

set -e

echo "=== Starting Local Homelab Services ==="

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env from template..."
    cp .env.example .env
    
    # Generate a random password for MinIO
    MINIO_PASSWORD=$(openssl rand -base64 24)
    sed -i "s/your_secure_minio_password_here/$MINIO_PASSWORD/" .env
    
    echo "Generated MinIO password. Check .env file for credentials."
fi

# Verify .env has MINIO_ROOT_PASSWORD
if ! grep -q "MINIO_ROOT_PASSWORD=." .env 2>/dev/null || grep -q "MINIO_ROOT_PASSWORD=$" .env 2>/dev/null; then
    echo "ERROR: MINIO_ROOT_PASSWORD is not set in .env"
    echo "Please edit .env and set a secure password"
    exit 1
fi

echo "Pulling latest images..."
docker compose pull

echo "Starting services..."
docker compose up -d

echo ""
echo "Waiting for services to start..."
sleep 10

echo ""
echo "=== Service Status ==="
docker compose ps

echo ""
echo "=== Health Checks ==="

# Check Plex
if curl -sf http://localhost:32400/identity > /dev/null 2>&1; then
    echo "[OK] Plex is running on port 32400"
else
    echo "[WAIT] Plex is still starting..."
fi

# Check MinIO
if curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    echo "[OK] MinIO is running on port 9000 (API) and 9001 (Console)"
else
    echo "[WAIT] MinIO is still starting..."
fi

# Check Home Assistant
if curl -sf http://localhost:8123/ > /dev/null 2>&1; then
    echo "[OK] Home Assistant is running on port 8123"
else
    echo "[WAIT] Home Assistant is still starting..."
fi

echo ""
echo "=== Access URLs ==="
echo "Plex:           http://localhost:32400/web"
echo "MinIO Console:  http://localhost:9001"
echo "Home Assistant: http://localhost:8123"
echo ""
echo "Via WireGuard from Linode:"
echo "Plex:           http://10.200.0.2:32400"
echo "MinIO:          http://10.200.0.2:9000"
echo "Home Assistant: http://10.200.0.2:8123"
