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

### DHT Shows 0 Nodes / Stuck on "Downloading metadata"

**IMPORTANT: Mullvad removed port forwarding on July 1, 2023!**

If you're using Mullvad VPN, you cannot accept incoming connections. This means:
- DHT will show 0 nodes or very few
- Torrents may be slow to find peers
- You can download but seeding is limited

**Your Options:**

#### Option A: Switch to a VPN with Port Forwarding (Recommended)

VPNs that still support port forwarding:
- **Private Internet Access (PIA)** - Most popular choice
- **AirVPN** - Multiple static ports
- **ProtonVPN** - On paid plans

To switch to PIA, update your `.env`:
```bash
VPN_PROVIDER=private internet access
VPN_TYPE=openvpn
PIA_USER=your_username
PIA_PASS=your_password
```

Then uncomment the PIA lines in docker-compose.yml.

#### Option B: Stay with Mullvad (Limited Functionality)

You can still download, but with limitations:

**1. Make sure the VPN is connected:**
```bash
docker logs gluetun-vpn | tail -20
# Should show "Healthy!" if working
```

**2. Configure qBittorrent for no port forwarding:**
- Settings > Connection
- Uncheck "Use UPnP / NAT-PMP"
- Check "Enable DHT", "Enable PeX", "Enable Local Peer Discovery"

**3. Use well-seeded torrents:**
- Public torrents with many seeders will work fine
- Private trackers may have issues

**4. Check your IP is hidden:**
```bash
docker exec qbittorrent curl -s https://ipinfo.io
# Should show VPN IP, not your real IP
```

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
