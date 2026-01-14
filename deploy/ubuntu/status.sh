#!/bin/bash

echo "========================================"
echo "Nebula Command - Ubuntu Host Status"
echo "========================================"
echo ""

echo "System:"
echo "  Hostname: $(hostname)"
echo "  Uptime:   $(uptime -p)"
echo "  Load:     $(cat /proc/loadavg | awk '{print $1, $2, $3}')"
echo ""

echo "Virtualization:"
echo "  libvirtd: $(systemctl is-active libvirtd 2>/dev/null || echo 'not installed')"
if command -v virsh &> /dev/null; then
    echo "  VMs:"
    sudo virsh list --all 2>/dev/null | tail -n +3 | while read line; do
        [ -n "$line" ] && echo "    $line"
    done
fi
echo ""

echo "Docker Services:"
if command -v docker &> /dev/null; then
    docker ps --format "  {{.Names}}: {{.Status}}" 2>/dev/null || echo "  Docker not running"
else
    echo "  Docker not installed"
fi
echo ""

echo "Remote Access:"
echo "  VNC (:5901): $(vncserver -list 2>&1 | grep -c ':1' || echo '0') sessions"
echo "  xrdp:        $(systemctl is-active xrdp 2>/dev/null || echo 'not installed')"
echo ""

echo "Network:"
if command -v tailscale &> /dev/null; then
    echo "  Tailscale: $(tailscale status 2>/dev/null | head -1 || echo 'not connected')"
    echo "  Tailscale IP: $(tailscale ip -4 2>/dev/null || echo 'N/A')"
else
    echo "  Tailscale: not installed"
fi
echo ""

echo "NAS Mounts:"
mount | grep -E '(nas|nfs|cifs|smb)' 2>/dev/null | while read line; do
    echo "  $line"
done || echo "  No NAS mounts detected"
echo ""

echo "GPU (for VM passthrough):"
lspci | grep -i nvidia 2>/dev/null | head -1 || echo "  No NVIDIA GPU detected"
echo ""
