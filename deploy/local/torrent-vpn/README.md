# qBittorrent + VPN (Gluetun) Setup

Private, secure torrenting with automatic kill switch.

## Features
- **VPN Kill Switch**: If VPN drops, qBittorrent loses all network access
- **No IP Leaks**: All torrent traffic routed through VPN only
- **NAS Downloads**: Completed torrents go directly to /srv/media/downloads
- **Web UI**: Access qBittorrent at http://localhost:8080

## Quick Setup

### 1. Configure VPN Credentials

Create `.env` file in this directory:

```bash
# For Mullvad (recommended):
VPN_PROVIDER=mullvad
VPN_TYPE=wireguard
WIREGUARD_PRIVATE_KEY=your_private_key_here
WIREGUARD_ADDRESSES=10.x.x.x/32
VPN_COUNTRY=USA

# For other providers, see: https://github.com/qdm12/gluetun-wiki
```

### 2. Fix NAS Permissions

The NAS mount must have correct permissions for the container to write:

```bash
# Check your NAS mount permissions
ls -la /srv/media/

# If downloads folder doesn't exist:
mkdir -p /srv/media/downloads /srv/media/torrents
chown -R 1000:1000 /srv/media/downloads /srv/media/torrents
```

The NAS mount options should include `uid=1000,gid=1000` to match the container user.

### 3. Start the Stack

```bash
cd deploy/local/torrent-vpn
docker compose up -d
```

### 4. Verify VPN is Working

```bash
# Check gluetun logs for connection
docker logs gluetun-vpn

# Verify IP is VPN (not your real IP)
docker exec qbittorrent curl -s https://ipinfo.io
```

### 5. Access WebUI

- URL: http://localhost:8080

**Getting the Password** (qBittorrent 4.6.1+ generates a random password on first run):
```bash
# Check container logs for the randomly generated password
docker logs qbittorrent 2>&1 | grep "temporary password"

# Look for a line like:
# The WebUI administrator password was not set. A temporary password is provided for this session: XXXXXXXXXX
```

**Reset Password if Needed:**
```bash
# Stop container
docker stop qbittorrent

# Edit the config to disable web auth temporarily
docker run --rm -v qbt-config:/config alpine sh -c "sed -i 's/WebUI\\\\LocalHostAuth=.*/WebUI\\\\LocalHostAuth=false/' /config/qBittorrent/qBittorrent.conf"

# Restart and set new password via WebUI Settings > Web UI
docker start qbittorrent
```

**Or Set a Known Password:**
```bash
# Stop container and set password manually
docker stop qbittorrent

# Generate password hash (using Python)
python3 -c "import hashlib; print('Password hash:', hashlib.pbkdf2_hmac('sha512', b'YourPasswordHere', b'', 100000).hex())"

# Then edit /config/qBittorrent/qBittorrent.conf and set:
# WebUI\Password_PBKDF2="@ByteArray(YOUR_HASH_HERE)"
```

## Supported VPN Providers

Gluetun supports 50+ VPN providers:
- Mullvad (recommended - no account logs)
- ProtonVPN
- NordVPN
- ExpressVPN
- Surfshark
- Private Internet Access
- And many more...

See full list: https://github.com/qdm12/gluetun-wiki/tree/main/setup/providers

## Troubleshooting

### DHT Shows 0 Nodes (Most Common Issue!)

If your torrents are stuck at "Downloading metadata" with 0 peers and DHT shows 0 nodes:

**1. Restart the VPN container to apply port forwarding:**
```bash
cd deploy/local/torrent-vpn
docker compose down
docker compose up -d
```

**2. Verify port 6881 is open in qBittorrent:**
- Go to qBittorrent Web UI > Settings > Connection
- Set "Port used for incoming connections" to `6881`
- Uncheck "Use UPnP / NAT-PMP" (doesn't work through VPN)
- Check "Enable DHT"

**3. If using Mullvad, enable port forwarding:**
- Log in to https://mullvad.net/account
- Go to "Port forwarding" and add a port
- Update your `.env` file: `VPN_INPUT_PORTS=YOUR_PORT`
- Update qBittorrent to use that same port

**4. Check if VPN is connected:**
```bash
docker logs gluetun-vpn | tail -20
# Should show "Healthy!" if working
```

**5. Force announce to trackers:**
- Right-click torrent > Force reannounce
- This tells trackers you're available for connections

### "Permission denied" on downloads
```bash
# Remount NAS with correct UID/GID
sudo umount /srv/media
sudo mount -o uid=1000,gid=1000,rw //192.168.0.185/networkshare /srv/media
```

### VPN not connecting
```bash
# Check gluetun logs
docker logs gluetun-vpn -f

# Common issues:
# - Wrong credentials
# - Server country not available
# - Firewall blocking UDP 51820 (WireGuard)
```

### Kill switch test
```bash
# Stop VPN container - qBittorrent should lose all connectivity
docker stop gluetun-vpn

# qBittorrent should now be unreachable
docker exec qbittorrent curl https://google.com  # Should fail
```

## Security Notes

1. **Never expose port 8080 to the internet** - Only access via local network
2. **Use a VPN provider that doesn't log** - Mullvad, ProtonVPN recommended
3. **Change default WebUI password immediately**
4. **Enable HTTPS in qBittorrent settings if accessing remotely**
