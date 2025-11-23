# PHASE 8: DNS AUTOMATION

**Status**: ✅ **Implemented** (November 2025)

**Goal**: Automate DNS record management using Cloudflare API so new services automatically get DNS records without manual intervention.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Components](#components)
- [Setup](#setup)
- [Usage](#usage)
- [Service Configuration](#service-configuration)
- [Integration with Traefik](#integration-with-traefik)
- [Troubleshooting](#troubleshooting)
- [Advanced Topics](#advanced-topics)

---

## Overview

The DNS Automation system provides:

1. **Automated DNS record creation** from `services.yaml` configuration
2. **Cloudflare API integration** for DNS management across multiple zones
3. **CLI commands** for manual DNS operations
4. **Traefik integration** to auto-create DNS for new routes
5. **Health monitoring** and status reporting

### Supported Zones

- `evindrake.net` - Primary domain
- `rig-city.com` - Community domain
- `scarletredjoker.com` - Secondary domain

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DNS AUTOMATION FLOW                      │
└─────────────────────────────────────────────────────────────┘

    services.yaml                     Traefik Routes
          │                                  │
          │                                  │
          v                                  v
    ┌─────────────────────────────────────────────┐
    │          DNS Manager Service                │
    │  • Reads service DNS configuration          │
    │  • Watches Traefik routes via Consul        │
    │  • Creates/updates DNS records              │
    │  • Syncs every 5 minutes                    │
    └─────────────────┬───────────────────────────┘
                      │
                      v
            ┌────────────────────┐
            │  Cloudflare API    │
            │  • Zone: evindrake.net      │
            │  • Zone: rig-city.com       │
            │  • Zone: scarletredjoker.com│
            └────────────────────┘
                      │
                      v
            ┌────────────────────┐
            │  Public DNS        │
            │  • A records       │
            │  • CNAME records   │
            │  • Proxied via CDN │
            └────────────────────┘
```

---

## Components

### 1. DNS Manager Service

**Container**: `dns-manager`  
**Port**: `8001`  
**Image**: Custom Python application

**Features**:
- Cloudflare API client for DNS management
- Service catalog watcher (reads `services.yaml`)
- Traefik route watcher (via Consul)
- REST API for manual operations
- Automatic sync every 5 minutes

**Endpoints**:
- `GET /health` - Health check
- `GET /api/dns/zones` - List managed zones
- `GET /api/dns/records/<zone>` - List DNS records for a zone
- `POST /api/dns/sync` - Trigger manual DNS sync

### 2. Service Catalog (`services.yaml`)

Services define their DNS requirements in the catalog:

```yaml
services:
  dashboard:
    domains:
      - evindrake.net
      - dashboard.evindrake.net
      - host.evindrake.net
    dns:
      records:
        - type: A
          name: evindrake.net
          content: ${DNS_TARGET_IP}
          ttl: 300
          proxied: true
        - type: CNAME
          name: dashboard.evindrake.net
          content: evindrake.net
          ttl: 300
          proxied: true
```

### 3. CLI Commands

Integrated into `./homelab` CLI:

```bash
# Show DNS manager status
./homelab dns status

# List DNS records for a zone
./homelab dns list evindrake.net
./homelab dns list rig-city.com

# Sync DNS records from services.yaml to Cloudflare
./homelab dns sync

# Manual record creation (guidance)
./homelab dns create test.evindrake.net 192.168.1.100

# Manual record deletion (guidance)
./homelab dns delete test.evindrake.net
```

---

## Setup

### 1. Cloudflare API Token

Create an API token with DNS edit permissions:

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use "Edit zone DNS" template
4. Select zones: `evindrake.net`, `rig-city.com`, `scarletredjoker.com`
5. Copy the API token

### 2. Add to Environment

Add to your `.env` file:

```bash
# DNS Automation Configuration
CLOUDFLARE_API_TOKEN=your_token_here
DNS_TARGET_IP=<your_public_ip>
```

For production deployment configs:

```bash
# Generate encrypted config with DNS token
python3 config/scripts/generate-config.py prod evindrake_net
```

Add `CLOUDFLARE_API_TOKEN` to `config/secrets/base.yaml`:

```yaml
secrets:
  cloudflare_api_token: !secret cloudflare_api_token
```

### 3. Deploy DNS Manager

```bash
# Start DNS manager
docker compose -f orchestration/compose.dns.yml up -d

# Or deploy via homelab CLI
./homelab deploy dns-manager

# Check status
./homelab dns status
```

### 4. Initial DNS Sync

```bash
# Sync all DNS records from services.yaml
./homelab dns sync

# Check results
./homelab dns list evindrake.net
```

---

## Usage

### Viewing DNS Records

```bash
# List all records for a zone
./homelab dns list evindrake.net

# Output:
# A     evindrake.net              192.168.1.100  TTL: 300  Proxied: true
# CNAME dashboard.evindrake.net    evindrake.net  TTL: 300  Proxied: true
# CNAME host.evindrake.net         evindrake.net  TTL: 300  Proxied: true
# A     traefik.evindrake.net      192.168.1.100  TTL: 300  Proxied: true
# A     auth.evindrake.net         192.168.1.100  TTL: 300  Proxied: true
```

### Manual DNS Sync

```bash
# Trigger sync from services.yaml
./homelab dns sync

# Output:
# ✓ Sync complete!
#
# Results:
#   Created/Updated: 12
#   Failed: 0
#   Skipped: 3
```

### Adding New Service with DNS

1. **Add DNS configuration to `services.yaml`**:

```yaml
services:
  my-new-service:
    domains:
      - api.evindrake.net
    dns:
      records:
        - type: A
          name: api.evindrake.net
          content: ${DNS_TARGET_IP}
          ttl: 300
          proxied: true
```

2. **Sync DNS records**:

```bash
./homelab dns sync
```

3. **Verify**:

```bash
./homelab dns list evindrake.net | grep api
# A  api.evindrake.net  192.168.1.100  TTL: 300  Proxied: true
```

4. **Deploy service**:

```bash
./homelab deploy my-new-service
```

The service is now accessible at `https://api.evindrake.net`!

---

## Service Configuration

### DNS Record Types

#### A Record (IPv4)
```yaml
dns:
  records:
    - type: A
      name: service.evindrake.net
      content: 192.168.1.100
      ttl: 300
      proxied: true
```

#### CNAME Record (Alias)
```yaml
dns:
  records:
    - type: CNAME
      name: alias.evindrake.net
      content: target.evindrake.net
      ttl: 300
      proxied: true
```

#### Multiple Records
```yaml
dns:
  records:
    # Root domain
    - type: A
      name: evindrake.net
      content: ${DNS_TARGET_IP}
      ttl: 300
      proxied: true
    
    # Subdomain alias
    - type: CNAME
      name: www.evindrake.net
      content: evindrake.net
      ttl: 300
      proxied: true
    
    # API endpoint
    - type: CNAME
      name: api.evindrake.net
      content: evindrake.net
      ttl: 300
      proxied: true
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | string | `A` | Record type (A, AAAA, CNAME, TXT, MX) |
| `name` | string | required | Fully qualified domain name |
| `content` | string | required | Record value (IP, domain, text) |
| `ttl` | integer | `300` | Time to live in seconds |
| `proxied` | boolean | `true` | Use Cloudflare CDN proxy |
| `priority` | integer | null | Priority (for MX records) |

### Environment Variables

The DNS manager supports these environment variables:

```bash
# Cloudflare API Configuration
CLOUDFLARE_API_TOKEN=<token>       # Required: API token with DNS edit permissions

# DNS Configuration
DNS_TARGET_IP=<ip>                  # Public IP for A records (default: 0.0.0.0)

# Service Catalog
SERVICE_CATALOG_PATH=/config/services.yaml  # Path to services.yaml

# Consul Integration
CONSUL_HOST=consul-server           # Consul hostname for Traefik watching

# Sync Settings
SYNC_INTERVAL=300                   # Sync interval in seconds (default: 5 minutes)

# Logging
LOG_LEVEL=INFO                      # Log level (DEBUG, INFO, WARNING, ERROR)
```

---

## Integration with Traefik

The DNS manager watches Traefik routes via Consul and can automatically create DNS records for new routes.

### How It Works

1. **Service registers with Consul** (via Traefik labels)
2. **DNS manager watches Consul catalog** for new services
3. **Extracts Host() rules** from Traefik routes
4. **Creates DNS records** for discovered hosts

### Example

When you deploy a service with Traefik labels:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.myapp.rule=Host(`myapp.evindrake.net`)"
  - "traefik.http.routers.myapp.entrypoints=websecure"
```

The DNS manager will:
1. Detect the new route `Host('myapp.evindrake.net')`
2. Create A record: `myapp.evindrake.net` → `${DNS_TARGET_IP}`
3. Log the creation

### Manual Sync

If automatic watching is disabled, trigger manual sync:

```bash
./homelab dns sync
```

---

## Troubleshooting

### DNS Manager Not Running

**Problem**: DNS manager container fails to start

**Solution**:
```bash
# Check logs
docker logs dns-manager

# Common issues:
# 1. Missing CLOUDFLARE_API_TOKEN
# 2. Invalid API token
# 3. Services.yaml not found

# Fix and restart
docker compose -f orchestration/compose.dns.yml up -d
```

### DNS Records Not Syncing

**Problem**: `./homelab dns sync` completes but records don't update

**Diagnosis**:
```bash
# Check DNS manager logs
docker logs dns-manager -f

# Check API token permissions
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"

# Verify zone IDs
./homelab dns status
```

**Solutions**:
1. **Invalid API Token**: Recreate token with DNS edit permissions
2. **Wrong Zone**: Ensure domain is added to Cloudflare
3. **Proxied Record Conflict**: Try `proxied: false` for testing

### DNS Records Not Appearing

**Problem**: Records created but not resolving

**Check DNS propagation**:
```bash
# Query Cloudflare nameservers directly
dig @1.1.1.1 myapp.evindrake.net

# Check DNS propagation
https://dnschecker.org
```

**Wait time**: DNS changes can take 1-5 minutes to propagate

### Health Check Failures

**Problem**: `/health` endpoint returns errors

```bash
# Check DNS manager status
curl http://localhost:8001/health

# Expected response:
# {
#   "status": "healthy",
#   "service": "dns-manager",
#   "zones": 3
# }
```

**Solutions**:
1. Ensure port 8001 is not in use
2. Check Cloudflare API connectivity
3. Verify services.yaml exists

---

## Advanced Topics

### Custom TTL Values

For caching control:

```yaml
dns:
  records:
    # Short TTL for frequently changing IPs
    - type: A
      name: dynamic.evindrake.net
      content: ${DNS_TARGET_IP}
      ttl: 60  # 1 minute
    
    # Long TTL for stable records
    - type: CNAME
      name: static.evindrake.net
      content: evindrake.net
      ttl: 3600  # 1 hour
```

### Bypassing Cloudflare Proxy

For services that need direct connection:

```yaml
dns:
  records:
    - type: A
      name: direct.evindrake.net
      content: ${DNS_TARGET_IP}
      ttl: 300
      proxied: false  # DNS-only mode
```

### Multiple Zones

Services can have records across multiple zones:

```yaml
services:
  multi-domain-service:
    dns:
      records:
        - type: A
          name: app.evindrake.net
          content: ${DNS_TARGET_IP}
          ttl: 300
          proxied: true
        
        - type: A
          name: app.rig-city.com
          content: ${DNS_TARGET_IP}
          ttl: 300
          proxied: true
```

### ACME Challenge Records

For Let's Encrypt DNS-01 challenges:

```yaml
dns:
  records:
    - type: TXT
      name: _acme-challenge.evindrake.net
      content: "validation-token"
      ttl: 120
      proxied: false
```

**Note**: Traefik handles this automatically via Cloudflare DNS challenge.

---

## Migration Guide

### From Manual DNS Management

1. **Export existing records**:
```bash
./homelab dns list evindrake.net > current-records.txt
```

2. **Add to services.yaml**:
```yaml
services:
  existing-service:
    dns:
      records:
        # ... copy from current-records.txt
```

3. **Sync and verify**:
```bash
./homelab dns sync
./homelab dns list evindrake.net
```

### From Other DNS Providers

1. Export records from current provider
2. Convert to `services.yaml` format
3. Update nameservers to Cloudflare
4. Run DNS sync

---

## Best Practices

1. **Use environment variables** for IP addresses (`${DNS_TARGET_IP}`)
2. **Enable proxying** for public services (DDoS protection, caching)
3. **Set appropriate TTLs** (300s for dynamic, 3600s for static)
4. **Document DNS changes** in `services.yaml` comments
5. **Test in dev** before syncing to production zones
6. **Monitor sync results** via `./homelab dns sync` output

---

## API Reference

### Health Check

```bash
GET http://localhost:8001/health

Response:
{
  "status": "healthy",
  "service": "dns-manager",
  "zones": 3
}
```

### List Zones

```bash
GET http://localhost:8001/api/dns/zones

Response:
{
  "zones": [
    "evindrake.net",
    "rig-city.com",
    "scarletredjoker.com"
  ]
}
```

### List Records

```bash
GET http://localhost:8001/api/dns/records/evindrake.net

Response:
{
  "zone": "evindrake.net",
  "records": [
    {
      "id": "abc123",
      "type": "A",
      "name": "evindrake.net",
      "content": "192.168.1.100",
      "ttl": 300,
      "proxied": true
    }
  ]
}
```

### Trigger Sync

```bash
POST http://localhost:8001/api/dns/sync

Response:
{
  "status": "success",
  "stats": {
    "success": 12,
    "failed": 0,
    "skipped": 3
  }
}
```

---

## Security Considerations

1. **API Token Security**:
   - Store in SOPS-encrypted secrets
   - Use scoped tokens (zone-specific)
   - Rotate tokens regularly

2. **DNS Security**:
   - Enable DNSSEC on Cloudflare
   - Use Cloudflare proxy for DDoS protection
   - Monitor DNS change logs

3. **Access Control**:
   - DNS manager API requires JWT auth (via Traefik)
   - Only accessible from internal network
   - Rate limiting enabled

---

## Future Enhancements

**Deferred to Later Phases**:
- [ ] Support for Route53, DigitalOcean DNS
- [ ] Geographic DNS (geo-routing)
- [ ] Failover and health-based routing
- [ ] Automatic DNS validation testing
- [ ] DNS analytics and metrics
- [ ] Multi-region DNS sync

---

## Summary

Phase 8 DNS Automation provides:

✅ **Automated DNS management** for homelab services  
✅ **Cloudflare API integration** across multiple zones  
✅ **CLI commands** for manual operations  
✅ **Traefik integration** for auto-discovery  
✅ **Configuration-driven** DNS via `services.yaml`

New services automatically get DNS records without manual intervention, streamlining deployment and reducing configuration errors.

---

**Next**: Phase 9 - Advanced Observability & Auto-Recovery
