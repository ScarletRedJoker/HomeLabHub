# Tailscale Setup for HomeLabHub

Tailscale provides secure mesh networking for cross-host communication without complex VPN configuration.

## What is Tailscale?

Tailscale is a zero-config VPN built on WireGuard that creates a secure mesh network between your devices. It's perfect for:

- **Cross-host deployments** - Run services on multiple servers
- **Secure remote access** - Access your homelab from anywhere
- **Service mesh** - Services on different hosts communicate securely
- **No port forwarding** - Works behind NAT and firewalls

## Installation Options

### Option 1: Manual Host Installation (Recommended for MVP)

This is the simplest approach and works best for most homelab setups.

#### 1. Install Tailscale on Each Host

**On Ubuntu/Debian:**
```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

**On other platforms:**
Visit https://tailscale.com/download

#### 2. Join Your Tailnet

```bash
sudo tailscale up \
  --advertise-routes=172.18.0.0/16 \
  --accept-routes \
  --hostname=homelab-$(hostname)
```

**Parameters explained:**
- `--advertise-routes` - Share your Docker network with other Tailscale nodes
- `--accept-routes` - Accept routes from other nodes
- `--hostname` - Friendly name for this device

#### 3. Approve Routes in Tailscale Admin

1. Visit https://login.tailscale.com/admin/machines
2. Find your device
3. Click "Edit route settings"
4. Enable "Advertise routes"
5. Approve the subnet routes

#### 4. Verify Connectivity

From another Tailscale device:
```bash
# Ping the Tailscale IP
ping 100.64.0.1

# Access a service via Tailscale
curl http://100.64.0.1:8500  # Consul UI
```

### Option 2: Containerized Tailscale (Advanced)

For users who want Tailscale running in a container.

#### Prerequisites

1. Get an auth key from https://login.tailscale.com/admin/settings/keys
2. Save it as `TAILSCALE_AUTH_KEY` in your `.env` file

#### Compose File

Create `orchestration/compose.tailscale.yml`:

```yaml
networks:
  homelab:
    external: true

services:
  tailscale:
    image: tailscale/tailscale:latest
    container_name: tailscale
    restart: unless-stopped
    network_mode: "host"
    cap_add:
      - NET_ADMIN
      - NET_RAW
    environment:
      - TS_AUTHKEY=${TAILSCALE_AUTH_KEY}
      - TS_ROUTES=172.18.0.0/16
      - TS_ACCEPT_ROUTES=true
      - TS_STATE_DIR=/var/lib/tailscale
      - TS_EXTRA_ARGS=--advertise-exit-node
    volumes:
      - tailscale_data:/var/lib/tailscale
      - /dev/net/tun:/dev/net/tun
    healthcheck:
      test: ["CMD", "tailscale", "status"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  tailscale_data:
```

#### Deploy

```bash
# Start Tailscale
docker compose -f orchestration/compose.tailscale.yml up -d

# Check status
docker exec tailscale tailscale status
```

## Multi-Host Setup

For deploying services across multiple servers with Tailscale.

### Scenario: Split Workload

- **Host 1 (homelab-01)**: Core infrastructure (Postgres, Redis, Consul)
- **Host 2 (homelab-02)**: Application services (Bots, web apps)

### Host 1 Setup

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-routes=172.18.0.0/16 --hostname=homelab-01

# Deploy core services
cd /path/to/HomeLabHub
docker compose -f orchestration/compose.base.yml up -d
docker compose -f orchestration/compose.consul.yml up -d
docker compose -f orchestration/compose.traefik.yml up -d

# Get Tailscale IP
tailscale ip -4
# Example output: 100.64.0.1
```

### Host 2 Setup

```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --accept-routes --hostname=homelab-02

# Configure to use Host 1's services
export POSTGRES_HOST=100.64.0.1
export CONSUL_SERVER=100.64.0.1

# Deploy application services
cd /path/to/HomeLabHub
docker compose -f orchestration/compose.bots.yml up -d
docker compose -f orchestration/compose.web.yml up -d
```

### Update Service Configuration

Services on Host 2 need to connect to Host 1's Postgres and Consul:

```yaml
# docker-compose.yml on Host 2
services:
  discord-bot:
    environment:
      - DATABASE_URL=postgresql://ticketbot:password@100.64.0.1:5432/ticketbot
      - CONSUL_HTTP_ADDR=100.64.0.1:8500
```

## Tailscale ACLs

For production security, configure Tailscale ACLs to restrict access.

### Basic ACL Example

Edit your Tailscale ACL policy at https://login.tailscale.com/admin/acls:

```json
{
  "tagOwners": {
    "tag:homelab": ["your-email@example.com"],
    "tag:admin": ["your-email@example.com"]
  },
  "acls": [
    {
      "action": "accept",
      "src": ["tag:admin"],
      "dst": ["tag:homelab:*"]
    },
    {
      "action": "accept",
      "src": ["tag:homelab"],
      "dst": ["tag:homelab:80,443,8080,8500"]
    }
  ]
}
```

### Tag Devices

```bash
# Tag a device as homelab
tailscale up --advertise-tags=tag:homelab

# Tag yourself as admin
tailscale up --advertise-tags=tag:admin
```

## Service Discovery with Tailscale

Tailscale + Consul provides powerful service discovery across hosts.

### How It Works

1. **Service registers with Consul** on Host 1
2. **Consul stores** service location and Tailscale IP
3. **Other hosts query Consul** to find services
4. **Traefik routes** to services via Tailscale IPs

### Example: Discord Bot on Host 2, Postgres on Host 1

```yaml
# Host 2: Discord Bot
services:
  discord-bot:
    labels:
      - "consul.service=discord-bot"
      - "consul.tags=bot,web"
      - "consul.port=4000"
      - "consul.check.http=http://localhost:4000/health"
    environment:
      - CONSUL_HTTP_ADDR=100.64.0.1:8500
      - DATABASE_URL=postgresql://ticketbot:pass@100.64.0.1:5432/ticketbot
```

Consul on Host 1 will see `discord-bot` registered with Host 2's Tailscale IP.
Traefik on Host 1 can then route `bot.evindrake.net` → `100.64.0.2:4000`.

## Troubleshooting

### Tailscale Not Connecting

**Check status:**
```bash
sudo tailscale status
```

**Reconnect:**
```bash
sudo tailscale down
sudo tailscale up
```

### Routes Not Advertised

**Check advertised routes:**
```bash
tailscale status --json | jq '.Self.AllowedIPs'
```

**Approve in admin console:**
https://login.tailscale.com/admin/machines

### Can't Access Services on Other Hosts

1. **Check Tailscale connectivity:**
   ```bash
   ping 100.64.0.1  # Host 1's Tailscale IP
   ```

2. **Check Docker network routing:**
   ```bash
   # On the remote host
   docker network inspect homelab
   ```

3. **Check firewall:**
   ```bash
   # Allow Docker network
   sudo ufw allow from 172.18.0.0/16
   ```

4. **Test service directly:**
   ```bash
   curl http://100.64.0.1:5432  # Should connect to Postgres
   ```

### Exit Node Not Working

Tailscale can also act as an exit node (route all traffic through it):

```bash
# Enable exit node
sudo tailscale up --advertise-exit-node

# Approve in admin console, then use from another device:
sudo tailscale up --exit-node=100.64.0.1
```

## Monitoring Tailscale

### Check Connection Status

```bash
# Simple status
tailscale status

# Detailed JSON
tailscale status --json | jq

# Specific peer
tailscale status | grep homelab-01
```

### Monitor Traffic

```bash
# Watch Tailscale interface
sudo watch -n 1 'ip -s link show tailscale0'

# Network stats
tailscale netcheck
```

### Tailscale Logs

**On systemd systems:**
```bash
sudo journalctl -u tailscaled -f
```

**In container:**
```bash
docker logs -f tailscale
```

## Homelab CLI Integration

The homelab CLI includes Tailscale commands (if Tailscale is installed):

```bash
# Show Tailscale network peers
./homelab network peers

# Show Tailscale status
./homelab network status

# Show routes
./homelab network routes
```

## Security Best Practices

1. **Use ACLs** - Restrict which devices can access services
2. **Tag devices** - Organize by role (admin, homelab, guest)
3. **Rotate auth keys** - Set expiry on auth keys
4. **Enable MFA** - Require MFA for Tailscale account
5. **Monitor access** - Review audit logs regularly
6. **Disable key expiry** (optional) - For long-running servers:
   ```bash
   tailscale up --timeout=0
   ```

## When to Use Tailscale vs VPN

| Feature | Tailscale | Traditional VPN |
|---------|-----------|-----------------|
| Setup time | 5 minutes | 1-2 hours |
| NAT traversal | Automatic | Manual port forwarding |
| Multi-site mesh | Built-in | Complex routing |
| Mobile support | Excellent | Varies |
| Performance | WireGuard (fast) | Varies |
| Cost | Free (personal) | Varies |

**Use Tailscale if:**
- You have multiple hosts across networks
- You want zero-config networking
- You need remote access from anywhere

**Use traditional VPN if:**
- You need custom routing
- You have very specific security requirements
- You want full network isolation

## Next Steps

With Tailscale configured:

1. ✅ Services can communicate across hosts
2. ✅ Consul discovery works across the mesh
3. ✅ Traefik routes to services on any host
4. ✅ Secure remote access to entire homelab

**Phase 4 Preview:** Add monitoring (Prometheus, Grafana) to visualize cross-host traffic and service health.

## Additional Resources

- [Tailscale Documentation](https://tailscale.com/kb/)
- [Tailscale ACL Guide](https://tailscale.com/kb/1018/acls/)
- [WireGuard Protocol](https://www.wireguard.com/)
- [Docker + Tailscale](https://tailscale.com/kb/1282/docker/)
