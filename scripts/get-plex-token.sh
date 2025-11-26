#!/bin/bash
# Get Plex authentication token
# Usage: ./get-plex-token.sh

echo "Enter your Plex email:"
read -r PLEX_EMAIL

echo "Enter your Plex password:"
read -rs PLEX_PASSWORD

echo ""
echo "Fetching token..."

RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-Plex-Client-Identifier: homelab-dashboard" \
  -H "X-Plex-Product: HomeLabHub" \
  -H "X-Plex-Version: 1.0" \
  --data-urlencode "user[login]=$PLEX_EMAIL" \
  --data-urlencode "user[password]=$PLEX_PASSWORD" \
  https://plex.tv/users/sign_in.xml)

TOKEN=$(echo "$RESPONSE" | grep -oP 'authToken="\K[^"]+')

if [ -n "$TOKEN" ]; then
  echo ""
  echo "Your Plex Token is:"
  echo "$TOKEN"
  echo ""
  echo "Add this to your .env file as:"
  echo "PLEX_TOKEN=$TOKEN"
else
  echo ""
  echo "Failed to get token. Response:"
  echo "$RESPONSE"
fi
