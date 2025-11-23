# Phase 3: Service Discovery & Networking

## Architecture Overview

Phase 3 introduces dynamic service discovery and intelligent routing to HomeLabHub using:

- **Consul** - Service registry and health checking
- **Traefik** - Dynamic reverse proxy with automatic SSL
- **Tailscale** (optional) - Cross-host mesh networking

```
┌─────────────────────────────────────────────────────────────┐
│                      Service Discovery Flow                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Service Starts                                           │
│     └─> Docker labels detected by Traefik                   │
│     └─> Service registers with Consul (optional)            │
│                                                               │
│  2. Traefik Auto-Configuration                               │
│     └─> Reads Docker labels                                 │
│     └─> Creates routing rules                               │
│     └─> Requests SSL cert from Let's Encrypt                │
│                                                               │
│  3. Health Monitoring                                        │
│     └─> Consul checks service health                        │
│     └─> Traefik monitors backend availability               │
│     └─> Auto-removes unhealthy services from rotation       │
│                                                               │
│  4. Cross-Host (with Tailscale)                             │
│     └─> Services advertise on Tailscale network             │
│     └─> Traefik routes to services on any host              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Consul - Service Registry

**Purpose:** Centralized service discovery and health checking

**Features:**
- Service registration and discovery
- Health check monitoring
- Key-value store for configuration
- Web UI on port 8500
- Single-node setup (MVP) - scales to 3-node cluster later

**Services:**
- `consul-server` - Main Consul server
- `consul-agent` - Service registration helper

### Traefik - Dynamic Reverse Proxy

**Purpose:** Automatic routing and SSL management

**Features:**
- Docker provider (watches container labels)
- Consul provider (watches Consul catalog)
- Let's Encrypt automatic HTTPS
- Cloudflare DNS challenge for wildcard certs
- Dashboard on port 8080 (secured)

**Key Benefits:**
- No manual routing configuration
- Automatic SSL certificate management
- Zero-downtime service updates
- Load balancing built-in

### Tailscale - Mesh Networking (Optional)

**Purpose:** Secure cross-host networking

**Features:**
- WireGuard-based mesh VPN
- Cross-host service communication
- Zero-config networking
- ACL-based security

## Deployment Guide

### Prerequisites

1. **Cloudflare DNS API Token**
   - Log in to Cloudflare
   - Go to My Profile > API Tokens
   - Create token with `Zone:DNS:Edit` permissions
   - Save as `CLOUDFLARE_DNS_API_TOKEN` in `.env`

2. **Domain Configuration**
   - Ensure domains are pointed to your server
   - Cloudflare DNS records should exist

3. **Phase 1 & 2 Complete**
   - Environment configuration generated
   - Services running via docker-compose

### Step 1: Generate Phase 3 Configuration

Update your Phase 1 secrets file with Traefik/Consul credentials:

```bash
cd config
vim secrets/base.yaml
```

Add to `secrets` section:
```yaml
secrets:
  # ... existing secrets ...
  
  # Cloudflare (for Traefik DNS challenge)
  cloudflare_email: "your-email@example.com"
  cloudflare_dns_api_token: "your-cloudflare-dns-token"
  cloudflare_zone_api_token: "your-cloudflare-zone-token"
  
  # Traefik Dashboard
  traefik_dashboard_auth: "admin:$apr1$xyz..."  # Generate with: htpasswd -nb admin password
  
  # Consul (optional - for ACLs)
  consul_acl_master_token: "your-secure-token"
```

Regenerate configuration:
```bash
python3 config/scripts/generate-config.py prod evindrake_net
```

### Step 2: Deploy Consul

Start Consul server and agent:

```bash
cd $PROJECT_ROOT

# Start Consul
docker compose -f orchestration/compose.consul.yml up -d

# Check Consul status
docker ps | grep consul
docker logs consul-server
```

Access Consul UI: http://your-server:8500

### Step 3: Deploy Traefik

Start Traefik with service discovery:

```bash
# Start Traefik
docker compose -f orchestration/compose.traefik.yml up -d

# Check Traefik status
docker ps | grep traefik
docker logs traefik

# Test with whoami service
curl -H "Host: whoami.evindrake.net" http://localhost
```

Access Traefik dashboard: https://traefik.evindrake.net (secured with basic auth)

### Step 4: Migrate Services to Traefik

Services are now configured with discovery metadata in `orchestration/services.yaml`.

To enable a service for Traefik routing:

1. Add Traefik labels to the service in `docker-compose.yml`:

```yaml
services:
  my-service:
    image: my-app:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.my-service.rule=Host(`myapp.evindrake.net`)"
      - "traefik.http.routers.my-service.entrypoints=websecure"
      - "traefik.http.routers.my-service.tls=true"
      - "traefik.http.routers.my-service.tls.certresolver=cloudflare"
      - "traefik.http.services.my-service.loadbalancer.server.port=8080"
```

2. Restart the service:
```bash
docker compose up -d my-service
```

3. Traefik automatically:
   - Detects the new service
   - Creates routing rules
   - Requests SSL certificate
   - Starts routing traffic

### Step 5: Verify Service Discovery

Check discovered services:

```bash
# Via Homelab CLI
./homelab services discover

# Via Consul API
curl http://localhost:8500/v1/catalog/services

# Via Traefik API
curl http://localhost:8080/api/http/routers
```

### Step 6: (Optional) Setup Tailscale

For cross-host deployments, Tailscale provides secure mesh networking.

**Manual Setup (Recommended for MVP):**

1. Install Tailscale on host:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-routes=172.18.0.0/16 --accept-routes
```

2. Approve subnet routes in Tailscale admin console

3. Services can now communicate across hosts via Tailscale IPs

**Container Setup (Advanced):**

See `orchestration/TAILSCALE_SETUP.md` for containerized Tailscale deployment.

## Service Discovery Metadata

Each service in `orchestration/services.yaml` now includes:

```yaml
discovery:
  traefik_labels:
    - "traefik.enable=true"
    - "traefik.http.routers.SERVICE.rule=Host(`domain.com`)"
    - "traefik.http.routers.SERVICE.entrypoints=websecure"
    - "traefik.http.routers.SERVICE.tls=true"
    - "traefik.http.routers.SERVICE.tls.certresolver=cloudflare"
  consul_tags:
    - "web"
    - "production"
  health_check:
    http: "http://localhost:8080/health"
    interval: "30s"
    timeout: "10s"
```

This metadata is used by:
- Deployment scripts to generate Docker labels
- Consul for service registration
- Monitoring tools for health checks

## Adding New Services

To add a new service with auto-discovery:

1. **Update services.yaml:**
```yaml
my-new-service:
  name: my-new-service
  container_name: my-new-service
  domains:
    - myapp.evindrake.net
  discovery:
    traefik_labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.evindrake.net`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls=true"
      - "traefik.http.routers.myapp.tls.certresolver=cloudflare"
    consul_tags:
      - "web"
    health_check:
      http: "http://localhost:8080/health"
      interval: "30s"
```

2. **Add to docker-compose.yml:**
```yaml
services:
  my-new-service:
    image: myapp:latest
    networks:
      - homelab
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.myapp.rule=Host(`myapp.evindrake.net`)"
      - "traefik.http.routers.myapp.entrypoints=websecure"
      - "traefik.http.routers.myapp.tls=true"
      - "traefik.http.routers.myapp.tls.certresolver=cloudflare"
```

3. **Deploy:**
```bash
docker compose up -d my-new-service
```

4. **Verify:**
```bash
./homelab routes list | grep myapp
curl https://myapp.evindrake.net
```

## Homelab CLI Commands

### `./homelab services discover`

Shows all services registered with Consul:

```bash
./homelab services discover

# Output:
# ┌──────────────────────────────────────────┐
# │        Discovered Services (Consul)      │
# ├──────────────────────────────────────────┤
# │ Service         │ Tags        │ Health   │
# ├─────────────────┼─────────────┼──────────┤
# │ dashboard       │ web, admin  │ ✓ Healthy│
# │ discord-bot     │ bot, web    │ ✓ Healthy│
# │ stream-bot      │ bot, web    │ ✓ Healthy│
# └──────────────────────────────────────────┘
```

### `./homelab routes list`

Shows Traefik routing configuration:

```bash
./homelab routes list

# Output:
# ┌────────────────────────────────────────────────────────┐
# │              Traefik Routes                             │
# ├────────────────────────────────────────────────────────┤
# │ Router        │ Domain              │ Service │ Status │
# ├───────────────┼─────────────────────┼─────────┼────────┤
# │ dashboard     │ host.evindrake.net  │ ✓       │ Active │
# │ discord-bot   │ bot.rig-city.com    │ ✓       │ Active │
# │ stream-bot    │ stream.rig-city.com │ ✓       │ Active │
# └────────────────────────────────────────────────────────┘
```

### `./homelab network peers`

Shows Tailscale mesh network peers (if Tailscale is enabled):

```bash
./homelab network peers

# Output:
# ┌──────────────────────────────────────────┐
# │         Tailscale Network Peers          │
# ├──────────────────────────────────────────┤
# │ Hostname    │ IP Address  │ Online       │
# ├─────────────┼─────────────┼──────────────┤
# │ homelab-01  │ 100.64.1.1  │ ✓ Online     │
# │ homelab-02  │ 100.64.1.2  │ ✓ Online     │
# └──────────────────────────────────────────┘
```

## Migration from Caddy to Traefik

Both Caddy and Traefik can run simultaneously during migration.

### Gradual Migration Strategy

**Phase 1: Run Both (Current State)**
- Caddy handles all existing routing
- Traefik deployed but not handling traffic
- Test Traefik with `whoami` service

**Phase 2: Migrate Non-Critical Services**
- Move static sites to Traefik
- Verify SSL certificates
- Monitor for issues

**Phase 3: Migrate Core Services**
- Move dashboard, bots to Traefik
- Update DNS to point to Traefik (if needed)
- Keep Caddy as backup

**Phase 4: Full Cutover**
- All services on Traefik
- Stop Caddy container
- Remove Caddy from compose file

### Port Conflict Resolution

If both run on same host, you'll need to:

**Option A: Different Ports**
```yaml
# Caddy
ports:
  - "80:80"
  - "443:443"

# Traefik
ports:
  - "8000:80"
  - "8443:443"
```

**Option B: Separate Hosts**
- Run Caddy on host A
- Run Traefik on host B
- Update DNS records to switch

**Option C: Stop Caddy**
```bash
docker compose stop caddy
docker compose -f orchestration/compose.traefik.yml up -d
```

## Cross-Host Deployment

With Tailscale and Consul, you can deploy services across multiple hosts.

### Setup Multi-Host

**Host 1 (homelab-01):**
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-routes=172.18.0.0/16

# Deploy Consul server + core services
docker compose -f orchestration/compose.consul.yml up -d
docker compose -f orchestration/compose.base.yml up -d
```

**Host 2 (homelab-02):**
```bash
# Install Tailscale
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --accept-routes

# Deploy Consul agent + app services
export CONSUL_SERVER_IP=100.64.1.1  # Tailscale IP of homelab-01
docker compose -f orchestration/compose.consul.yml up -d consul-agent
docker compose -f orchestration/compose.bots.yml up -d
```

Services on Host 2 will:
1. Register with Consul on Host 1
2. Be discoverable via Consul DNS
3. Get routed by Traefik on Host 1

## Troubleshooting

### Traefik Not Detecting Services

**Check:**
1. Service has `traefik.enable=true` label
2. Service is on `homelab` network
3. Traefik container is running
4. Check Traefik logs: `docker logs traefik`

**Fix:**
```bash
# Restart Traefik
docker compose -f orchestration/compose.traefik.yml restart traefik

# Force service recreation
docker compose up -d --force-recreate my-service
```

### SSL Certificate Not Issued

**Check:**
1. Cloudflare API token is correct
2. DNS records exist for domain
3. Check Traefik logs for ACME errors

**Fix:**
```bash
# Check ACME logs
docker logs traefik | grep acme

# Verify Cloudflare token
curl -X GET "https://api.cloudflare.com/client/v4/zones" \
  -H "Authorization: Bearer $CLOUDFLARE_DNS_API_TOKEN"

# Force cert renewal
docker exec traefik rm /data/acme.json
docker compose -f orchestration/compose.traefik.yml restart traefik
```

### Consul Services Not Appearing

**Check:**
1. Consul server is healthy
2. Service registration is configured
3. Network connectivity to Consul

**Fix:**
```bash
# Check Consul health
docker exec consul-server consul members

# Manual service registration
curl -X PUT http://localhost:8500/v1/agent/service/register \
  -d '{
    "name": "my-service",
    "port": 8080,
    "tags": ["web"],
    "check": {
      "http": "http://localhost:8080/health",
      "interval": "30s"
    }
  }'
```

## Performance Considerations

### Traefik vs Caddy

**Traefik Advantages:**
- Dynamic service discovery
- Built-in load balancing
- Better Kubernetes integration (future)
- More flexible routing rules

**Caddy Advantages:**
- Simpler configuration
- Slightly lower resource usage
- Mature, stable

**Recommendation:**
- Use Traefik for dynamic environments with frequent service changes
- Use Caddy for static environments with few services

### Resource Usage

Typical resource consumption:

- **Consul Server:** ~50MB RAM, minimal CPU
- **Consul Agent:** ~20MB RAM, minimal CPU
- **Traefik:** ~100MB RAM, 1-5% CPU
- **Tailscale:** ~30MB RAM, minimal CPU (when idle)

**Total Overhead:** ~200MB RAM for full service discovery stack

## Security Considerations

### Consul ACLs

For production, enable Consul ACLs:

1. Update `config/secrets/base.yaml`:
```yaml
config:
  consul_acl_enabled: true
  consul_acl_default_policy: "deny"

secrets:
  consul_acl_master_token: "your-very-secure-token"
```

2. Regenerate config and restart Consul

3. Create service tokens:
```bash
consul acl token create \
  -description "Dashboard service token" \
  -service-identity "dashboard"
```

### Traefik Dashboard Security

Dashboard is protected by:
1. Basic auth (configured in `TRAEFIK_DASHBOARD_AUTH`)
2. HTTPS only
3. No public exposure (VPN recommended)

### Tailscale Security

Best practices:
1. Use Tailscale ACLs to restrict access
2. Enable key expiry
3. Use tagged devices for service isolation
4. Monitor access logs

## Known Limitations (MVP)

### Service Catalog Metadata Injection

**Status**: ⚠️ Not Implemented in MVP

The `services.yaml` file contains rich metadata for services (DNS records, Traefik labels, auth flags, rate limits). However, **automatic metadata injection into Docker Compose files is not yet implemented**.

**Current Workarounds:**

1. **Traefik Labels**: Manually add labels to service definitions in compose files
   ```yaml
   services:
     myservice:
       labels:
         - "traefik.enable=true"
         - "traefik.http.routers.myservice.rule=Host(`myservice.evindrake.net`)"
   ```

2. **DNS Records**: Use `./homelab dns sync` command to manually sync DNS records from `services.yaml`

3. **Service Discovery**: Still works via Traefik Docker provider watching container labels

**Future Enhancement:**
- Automatic label injection from `services.yaml` metadata
- Template-based compose file generation
- Dynamic configuration updates without container restarts

This limitation does not prevent Phase 3 from functioning - it just requires manual label configuration for now.

## Next Steps

With Phase 3 complete, you now have:
- ✅ Dynamic service discovery
- ✅ Automatic SSL management
- ✅ Cross-host networking (optional)
- ✅ Scalable routing infrastructure

**Phase 4 Preview:** Monitoring & Observability
- Prometheus metrics collection
- Grafana dashboards
- Log aggregation with Loki
- Distributed tracing

## Additional Resources

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Consul Documentation](https://developer.hashicorp.com/consul/docs)
- [Tailscale Documentation](https://tailscale.com/kb/)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
