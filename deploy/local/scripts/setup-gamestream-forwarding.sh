#!/bin/bash
# Gamestream Port Forwarding for Windows KVM VM
# Forwards Sunshine ports from Ubuntu host to Windows VM (192.168.122.250)
# This allows devices on the LAN (like 3DS) to connect to Moonlight via Ubuntu's IP

set -euo pipefail

VM_IP="${VM_IP:-192.168.122.250}"

echo "Setting up Sunshine/Moonlight port forwarding to VM at ${VM_IP}..."

# NAT PREROUTING - redirect incoming traffic to VM
# TCP 47984-47990 (control) + 48010 (video stream)
sudo iptables -t nat -C PREROUTING -p tcp --dport 47984:48010 -j DNAT --to-destination ${VM_IP} 2>/dev/null || \
    sudo iptables -t nat -A PREROUTING -p tcp --dport 47984:48010 -j DNAT --to-destination ${VM_IP}

sudo iptables -t nat -C PREROUTING -p udp --dport 47998:48010 -j DNAT --to-destination ${VM_IP} 2>/dev/null || \
    sudo iptables -t nat -A PREROUTING -p udp --dport 47998:48010 -j DNAT --to-destination ${VM_IP}

# FORWARD rules - allow traffic to VM
sudo iptables -C FORWARD -d ${VM_IP} -p tcp --dport 47984:48010 -j ACCEPT 2>/dev/null || \
    sudo iptables -A FORWARD -d ${VM_IP} -p tcp --dport 47984:48010 -j ACCEPT

sudo iptables -C FORWARD -d ${VM_IP} -p udp --dport 47998:48010 -j ACCEPT 2>/dev/null || \
    sudo iptables -A FORWARD -d ${VM_IP} -p udp --dport 47998:48010 -j ACCEPT

# LIBVIRT_FWI rules - allow new connections through virbr0 (critical!)
sudo iptables -C LIBVIRT_FWI -d ${VM_IP} -o virbr0 -p tcp --dport 47984:48010 -j ACCEPT 2>/dev/null || \
    sudo iptables -I LIBVIRT_FWI 1 -d ${VM_IP} -o virbr0 -p tcp --dport 47984:48010 -j ACCEPT

sudo iptables -C LIBVIRT_FWI -d ${VM_IP} -o virbr0 -p udp --dport 47998:48010 -j ACCEPT 2>/dev/null || \
    sudo iptables -I LIBVIRT_FWI 1 -d ${VM_IP} -o virbr0 -p udp --dport 47998:48010 -j ACCEPT

# MASQUERADE for return traffic
sudo iptables -t nat -C POSTROUTING -d ${VM_IP} -j MASQUERADE 2>/dev/null || \
    sudo iptables -t nat -A POSTROUTING -d ${VM_IP} -j MASQUERADE

# Enable IP forwarding
sudo sysctl -w net.ipv4.ip_forward=1

# Save rules
sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null

echo "Done! Moonlight clients can now connect to $(hostname -I | awk '{print $1}')"
echo "Windows VM IP: ${VM_IP}"
