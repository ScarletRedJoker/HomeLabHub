#!/bin/bash
set -e

echo "=== Persisting iptables rules for Sunshine port forwarding ==="

sudo mkdir -p /etc/iptables

sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null
sudo ip6tables-save | sudo tee /etc/iptables/rules.v6 > /dev/null

if ! dpkg -l | grep -q iptables-persistent; then
    echo "Installing iptables-persistent..."
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent
fi

echo "Enabling netfilter-persistent service..."
sudo systemctl enable netfilter-persistent
sudo systemctl start netfilter-persistent

echo ""
echo "✅ iptables rules saved to /etc/iptables/rules.v4"
echo "✅ Rules will be restored automatically on boot"
echo ""
echo "Current Sunshine port forwarding rules:"
sudo iptables -t nat -L PREROUTING -n | grep -E "47984|47989|47990|47998|47999|48000|48010" || echo "  (no rules found)"
