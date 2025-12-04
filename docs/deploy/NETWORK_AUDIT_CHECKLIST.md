# Network Audit Checklist - Modem + Switch Migration

**Date:** December 4, 2025
**Change:** Migrated from Moto AC2600 Router to DOCSIS 3.0 Modem + Ethernet Switch

---

## Network Topology Change Summary

### Before (Router):
```
[Internet] → [Moto AC2600 Router] → [Local Network 192.168.x.x]
                  │
                  ├── NAT/DHCP/Firewall
                  ├── Port Forwarding Rules
                  └── WiFi
```

### After (Modem + Switch):
```
[Internet] → [DOCSIS 3.0 Modem] → [Ethernet Switch] → [Devices]
                  │
                  └── Bridge Mode OR Single Device NAT
```

---

## Critical Questions to Answer First

Run these commands ON YOUR LOCAL UBUNTU HOST:

### 1. What IP does Ubuntu have now?
```bash
ip addr show | grep -E "inet (192|10|172|100|69)" | head -5
hostname -I
```

**Expected Results:**
- If modem is in **bridge mode**: Ubuntu gets PUBLIC IP (69.x.x.x or similar)
- If modem is in **NAT mode**: Ubuntu gets private IP (likely 192.168.x.x)
- WireGuard IP should show: 10.200.0.2
- Tailscale IP should show: 100.x.x.x (if Tailscale is running)

### 2. Can Ubuntu reach the internet?
```bash
ping -c 3 8.8.8.8
ping -c 3 google.com
curl -s ifconfig.me
```

### 3. What's the WireGuard status?
```bash
sudo wg show
sudo systemctl status wg-quick@wg0
```

### 4. Can you reach Linode via WireGuard?
```bash
ping -c 3 10.200.0.1
```

---

## Section-by-Section Audit

### A. Ubuntu Host Network

```bash
# Check network interfaces
ip addr show

# Check routes
ip route show

# Check DNS
cat /etc/resolv.conf

# Check if firewall is active
sudo ufw status
```

**Things to verify:**
- [ ] Ubuntu has internet connectivity
- [ ] DNS is working
- [ ] No UFW rules blocking WireGuard (port 51820/udp)

### B. WireGuard VPN

```bash
# Check WireGuard interface
sudo wg show wg0

# Check WireGuard config
sudo cat /etc/wireguard/wg0.conf | grep -v "PrivateKey"

# Check if WireGuard service is running
sudo systemctl status wg-quick@wg0

# Test connectivity to Linode
ping -c 3 10.200.0.1
```

**WireGuard Config Key Points:**
- Linode Public IP: `69.164.211.205`
- Linode WG Port: `51820`
- Local WG IP: `10.200.0.2`
- Linode WG IP: `10.200.0.1`

**If WireGuard is down:**
```bash
sudo systemctl restart wg-quick@wg0
sudo journalctl -u wg-quick@wg0 --no-pager -n 20
```

### C. Docker Services

```bash
# Check Docker is running
docker ps

# Check Docker networks
docker network ls

# Specifically check homelab network
docker network inspect homelab 2>/dev/null || docker network inspect deploy_homelab

# Check container status
cd /opt/homelab/HomeLabHub/deploy/local
docker compose ps
```

**Expected Containers (Local):**
- caddy-local
- homelab-minio
- homeassistant

### D. KVM/libvirt (Windows VM)

```bash
# Check libvirt network
virsh net-list --all
virsh net-info default

# Check Windows VM status
virsh list --all

# Check VM IP
virsh domifaddr RDPWindows 2>/dev/null || virsh domifaddr win11 2>/dev/null

# Check NAT bridge
ip addr show virbr0
```

**Expected:**
- Default network: 192.168.122.0/24
- virbr0 IP: 192.168.122.1
- Windows VM IP: 192.168.122.250

**If VM network is down:**
```bash
sudo virsh net-start default
sudo virsh net-autostart default
```

### E. Sunshine/GameStream Ports

```bash
# Check iptables rules for GameStream
sudo iptables -L INPUT -n | grep -E "4798|4800|4801"

# Check iptables-persistent is installed
dpkg -l | grep iptables-persistent

# Check if rules are saved
cat /etc/iptables/rules.v4 | grep -E "4798|4800|4801"
```

**GameStream Ports Required:**
- TCP: 47984, 47989, 47990, 48010
- UDP: 47998, 47999, 48000, 48002, 48010

**If rules are missing:**
```bash
# Add GameStream rules
sudo iptables -A INPUT -p tcp --dport 47984 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 47989 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 47990 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 48010 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 47998 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 47999 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 48000 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 48002 -j ACCEPT
sudo iptables -A INPUT -p udp --dport 48010 -j ACCEPT

# Save rules
sudo netfilter-persistent save
```

### F. Plex Media Server

```bash
# Check if Plex is running (native install)
sudo systemctl status plexmediaserver

# Check Plex port
ss -tulpn | grep 32400

# Test Plex locally
curl -s http://localhost:32400/identity | head -1
```

---

## Modem-Specific Considerations

### If Modem is in BRIDGE MODE:
- Ubuntu gets the PUBLIC IP directly
- You are your own firewall (use iptables/ufw carefully)
- No port forwarding needed (but also no protection!)
- Other devices on switch won't have internet unless Ubuntu routes for them

**Recommendation for bridge mode:**
```bash
# Enable UFW with careful rules
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 51820/udp  # WireGuard
sudo ufw allow from 192.168.122.0/24  # KVM network
sudo ufw enable
```

### If Modem is in NAT MODE (most common):
- Modem assigns private IP to Ubuntu
- May need to forward port 51820/udp from modem to Ubuntu for WireGuard
- WireGuard can still work outbound (it initiates connection to Linode)

**Check your modem's admin page:**
- Usually at 192.168.100.1 or 192.168.0.1
- Look for "Port Forwarding" or "NAT Settings"

---

## Quick Health Check Script

Run this to get a quick status:

```bash
#!/bin/bash
echo "=== NETWORK AUDIT ==="
echo ""
echo "1. External IP:"
curl -s --max-time 5 ifconfig.me || echo "Cannot reach internet"
echo ""
echo ""
echo "2. Local IPs:"
hostname -I
echo ""
echo "3. WireGuard Status:"
sudo wg show 2>&1 | head -10
echo ""
echo "4. Docker Containers:"
docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null || echo "Docker not available"
echo ""
echo "5. Ping Linode (WireGuard):"
ping -c 1 -W 3 10.200.0.1 && echo "OK" || echo "FAIL - WireGuard tunnel may be down"
echo ""
echo "6. Windows VM Network:"
virsh net-list 2>/dev/null || echo "libvirt not available"
echo ""
echo "7. GameStream iptables rules:"
sudo iptables -L INPUT -n 2>/dev/null | grep -c "4798\|4800" || echo "0"
echo "rules found"
```

---

## What Should NOT Have Changed

These things should work exactly as before:

1. **WireGuard tunnel** - Outbound connection from Ubuntu to Linode
2. **KVM/libvirt network** - Internal 192.168.122.x network
3. **Docker bridge network** - Internal container networking
4. **Tailscale** - Mesh VPN (separate from WireGuard)

---

## What MAY Have Changed

1. **Ubuntu's LAN IP** - Depends on modem mode
2. **Port forwarding** - Previously on router, now either:
   - Not needed (bridge mode)
   - Needs to be configured on modem (NAT mode)
3. **Other devices' internet** - If bridge mode, they may lose connectivity

---

## Next Steps After Audit

1. Run the quick health check script above
2. Share the output with me
3. I'll help fix any issues identified

**Most likely scenario:** WireGuard is still working (it initiates outbound), but you may need to restart services after the network change.

```bash
# Restart all local services
sudo systemctl restart wg-quick@wg0
sudo systemctl restart docker
cd /opt/homelab/HomeLabHub/deploy/local && docker compose restart
sudo systemctl restart plexmediaserver
```
