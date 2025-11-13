#!/bin/bash

# Quick fix script to regenerate Caddyfile and restart services

cd /home/evin/contain/HomeLabHub

echo "Loading environment variables..."
source .env

if [ -z "$LETSENCRYPT_EMAIL" ]; then
    echo "ERROR: LETSENCRYPT_EMAIL not set in .env"
    echo "Please add: LETSENCRYPT_EMAIL=your-email@example.com"
    exit 1
fi

# Validate not a placeholder
if [[ "$LETSENCRYPT_EMAIL" == *"YOUR_EMAIL"* ]] || [[ "$LETSENCRYPT_EMAIL" == *"example.com"* ]]; then
    echo "ERROR: LETSENCRYPT_EMAIL still has placeholder value: $LETSENCRYPT_EMAIL"
    echo "Please edit .env and set your REAL email address"
    exit 1
fi

if [[ ! "$LETSENCRYPT_EMAIL" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    echo "ERROR: LETSENCRYPT_EMAIL is not a valid email: $LETSENCRYPT_EMAIL"
    exit 1
fi

echo "Generating Caddyfile with email: $LETSENCRYPT_EMAIL"

# Generate Caddyfile with actual email value
cat > Caddyfile << EOF
{
    email $LETSENCRYPT_EMAIL
}

bot.rig-city.com {
    reverse_proxy discord-bot:5000
}

stream.rig-city.com {
    reverse_proxy stream-bot:5000
}

plex.evindrake.net {
    reverse_proxy plex-server:32400
}

n8n.evindrake.net {
    reverse_proxy n8n:5678
}

host.evindrake.net {
    reverse_proxy homelab-dashboard:5000
}

vnc.evindrake.net {
    reverse_proxy vnc-desktop:6080
}

scarletredjoker.com {
    reverse_proxy scarletredjoker-web:80
}

www.scarletredjoker.com {
    redir https://scarletredjoker.com{uri} permanent
}
EOF

echo "✓ Caddyfile generated successfully"
echo ""
echo "Verifying Caddyfile contents:"
cat Caddyfile
echo ""
echo "Restarting Caddy..."
docker compose -f docker-compose.unified.yml restart caddy

echo ""
echo "Waiting for Caddy to start..."
sleep 3

echo "Checking Caddy logs:"
docker logs caddy --tail 20

echo ""
echo "✓ Done! Check if Caddy started successfully above."
