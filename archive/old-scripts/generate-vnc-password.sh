#!/bin/bash
# Helper script to generate VNC authentication password

if ! command -v htpasswd &> /dev/null; then
    echo "htpasswd not found. Installing apache2-utils..."
    sudo apt-get update && sudo apt-get install -y apache2-utils
fi

echo ""
echo "VNC Web Access Password Generator"
echo "=================================="
echo ""
read -p "Enter username (default: evin): " username
username=${username:-evin}

read -sp "Enter password: " password
echo ""

# Generate the htpasswd hash with escaped dollar signs for .env
hash=$(htpasswd -nb "$username" "$password" | sed -e 's/\$/\$\$/g')

echo ""
echo "Add this line to your .env file:"
echo ""
echo "VNC_BASIC_AUTH=$hash"
echo ""
