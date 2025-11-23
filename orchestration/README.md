# Orchestration - Modular Service Architecture

**Phase 2: Hybrid Compose-Bundle Architecture**

## Overview

The orchestration layer enables modular, independent deployment of HomeLabHub services. Instead of a monolithic `docker-compose.yml`, services are organized into reusable bundles that can be deployed individually or as groups.

### Key Benefits

- **Selective Deployment**: Deploy only the services you need
- **Resource Efficiency**: Run lightweight configurations on constrained hosts
- **Clear Dependencies**: Explicit dependency management prevents startup issues
- **Flexible Scaling**: Deploy services across multiple hosts (Phase 3)
- **Backward Compatible**: Existing `docker compose up` still works

## Architecture

```
orchestration/
├── services.yaml            # Service catalog & metadata
├── compose.base.yml         # Core infrastructure (always required)
├── compose.dashboard.yml    # Dashboard service bundle
├── compose.discord.yml      # Discord bot bundle
├── compose.stream.yml       # Stream bot bundle
├── compose.web.yml          # Web services bundle
├── compose.automation.yml   # Background workers bundle
├── compose.all.yml          # Full stack (backward compatibility)
└── README.md                # This file
```

### Dependency Graph

```
                    ┌─────────────────┐
                    │  compose.base   │
                    │  (Core Infra)   │
                    │                 │
                    │ • postgres      │
                    │ • redis         │
                    │ • minio         │
                    │ • caddy         │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
    ┌───────▼─────┐  ┌──────▼──────┐  ┌─────▼──────┐
    │  Dashboard  │  │    Bots     │  │ Automation │
    │             │  │             │  │            │
    │ • dashboard │  │ • discord   │  │ • celery   │
    │             │  │ • stream    │  │            │
    └─────────────┘  └─────────────┘  └────────────┘
                             │
                      ┌──────▼──────┐
                      │     Web     │
                      │             │
                      │ • n8n       │
                      │ • ha        │
                      │ • vnc       │
                      │ • code      │
                      └─────────────┘
```

## Service Catalog

### Service Groups

| Group | Services | Purpose |
|-------|----------|---------|
| **core** | postgres, redis, minio, caddy | Required infrastructure |
| **bots** | discord-bot, stream-bot | Community automation bots |
| **web** | n8n, homeassistant, static sites, vnc, code-server | Web applications |
| **automation** | celery-worker | Background task processing |
| **development** | vnc-desktop, code-server | Development tools |

### Individual Services

| Service | Container | Dependencies | Ports | Group |
|---------|-----------|--------------|-------|-------|
| **postgres** | homelab-postgres | - | 5432 (internal) | core |
| **redis** | homelab-redis | - | 6379 (internal) | core |
| **minio** | homelab-minio | - | 9000, 9001 | core |
| **caddy** | caddy | - | 80, 443 | core |
| **dashboard** | homelab-dashboard | postgres, redis, minio | 8080 | web |
| **discord-bot** | discord-bot | postgres | 4000 | bots |
| **stream-bot** | stream-bot | postgres | 5000 | bots |
| **celery-worker** | homelab-celery-worker | postgres, redis | - | automation |
| **n8n** | n8n | - | 5678 | web |
| **homeassistant** | homeassistant | - | 8123 | web |
| **vnc-desktop** | vnc-desktop | - | 5900, 6079 | development |
| **code-server** | code-server | - | 8443 | development |

## Quick Start

### Deploy Full Stack (All Services)

```bash
./homelab deploy all
```

Or using the legacy method:
```bash
docker compose -f orchestration/compose.all.yml up -d
```

### Deploy Only What You Need

```bash
# Core infrastructure only (lightweight)
./homelab deploy core

# Dashboard with dependencies
./homelab deploy dashboard

# Just the bots
./homelab deploy bots

# Web services
./homelab deploy web

# Development environment
./homelab deploy development
```

### Stop Services

```bash
# Stop specific service
./homelab undeploy discord-bot

# Stop entire group
./homelab undeploy bots

# Stop all
./homelab undeploy all
```

## CLI Commands

### List Services

```bash
./homelab services list
```

Output:
```
═══ Available Services & Groups ═══

Service Groups:
  core          - Core infrastructure (postgres, redis, minio, caddy)
  bots          - Discord & Stream bots
  web           - Web applications (n8n, homeassistant, static sites)
  automation    - Background workers (celery)
  development   - Dev tools (vnc-desktop, code-server)

Individual Services:
  dashboard     - Homelab management dashboard
  discord-bot   - Discord ticket management bot
  stream-bot    - Twitch/YouTube streaming bot
  ...
```

### Show Dependencies

```bash
./homelab services deps dashboard
```

Output:
```
═══ Dependencies for: dashboard ═══

Required: postgres, redis, minio
Optional: homeassistant
```

### View Full Catalog

```bash
./homelab services catalog
```

Displays the complete `services.yaml` catalog with all metadata.

## Deployment Patterns

### Pattern 1: Minimal Infrastructure

**Use Case**: Testing, development, minimal resource usage

```bash
./homelab deploy core
```

**Services**: postgres, redis, minio, caddy  
**Memory**: ~500MB  
**CPU**: Minimal

### Pattern 2: Bot Server

**Use Case**: Discord/Twitch bot hosting only

```bash
./homelab deploy bots
```

**Services**: core + discord-bot + stream-bot  
**Memory**: ~1.5GB  
**CPU**: Low

### Pattern 3: Dashboard Stack

**Use Case**: Homelab management with AI automation

```bash
./homelab deploy dashboard
./homelab deploy automation
```

**Services**: core + dashboard + celery-worker  
**Memory**: ~2GB  
**CPU**: Medium

### Pattern 4: Full Web Stack

**Use Case**: All web services and automation

```bash
./homelab deploy web
./homelab deploy automation
```

**Services**: core + all web apps + workers  
**Memory**: ~4GB  
**CPU**: Medium-High

### Pattern 5: Development Environment

**Use Case**: Remote development with VNC + Code Server

```bash
./homelab deploy development
```

**Services**: core + vnc-desktop + code-server  
**Memory**: ~2.5GB  
**CPU**: Medium

### Pattern 6: Production Full Stack

**Use Case**: Everything running

```bash
./homelab deploy all
```

**Services**: All 15 services  
**Memory**: ~6GB  
**CPU**: High

## Integration with Phase 1 Config System

### Environment Variable Resolution

Services use the Phase 1 configuration system for environment variables:

```yaml
env_file:
  - ${DEPLOYMENT_PATH}/.env          # Generated from Phase 1
  - ${DEPLOYMENT_PATH}/.env.dashboard # Service-specific config
```

Where `DEPLOYMENT_PATH` defaults to:
- Development: `.` (current directory)
- Production: `deployment/prod/evindrake_net/`

### Example: Production Deployment

```bash
# Generate configs (Phase 1)
./homelab config generate prod evindrake.net

# Deploy with generated configs
DEPLOYMENT_PATH=deployment/prod/evindrake_net ./homelab deploy all
```

## Advanced Usage

### Deploy Single Service with Docker Compose

```bash
# Dashboard only
docker compose \
  --project-directory . \
  --env-file .env \
  -f orchestration/compose.base.yml \
  -f orchestration/compose.dashboard.yml \
  up -d
```

### Deploy Specific Services from a Bundle

```bash
# Only VNC from web bundle
docker compose \
  -f orchestration/compose.base.yml \
  -f orchestration/compose.web.yml \
  up -d vnc-desktop
```

### Check What Would Be Deployed

```bash
# Dry run
docker compose \
  -f orchestration/compose.base.yml \
  -f orchestration/compose.discord.yml \
  config
```

### Override Environment Variables

```bash
# Deploy with custom env
POSTGRES_PASSWORD=newpass ./homelab deploy core
```

## Backward Compatibility

### Monolithic Deployment Still Works

The root `docker-compose.yml` remains functional for backward compatibility:

```bash
# Traditional method
docker compose up -d

# Or with homelab CLI
./homelab fix
```

### Migration Path

1. **Current State**: Monolithic `docker-compose.yml`
2. **Transition**: Use `./homelab deploy all` (equivalent)
3. **Modular**: Switch to selective deployment (`./homelab deploy bots`)

**No Breaking Changes**: Existing deployments continue working.

## Troubleshooting

### Service Won't Start

```bash
# Check dependencies
./homelab services deps <service>

# Ensure base infrastructure is running
./homelab deploy core

# Then deploy service
./homelab deploy <service>
```

### Network Issues

All services must use the `homelab` network:

```bash
# Recreate network
docker network rm homelab
docker network create homelab

# Redeploy base
./homelab deploy core
```

### Environment Variables Not Loading

```bash
# Check .env file exists
ls -la .env

# Validate environment
./homelab validate-env

# Regenerate configs (Phase 1)
./homelab config generate prod evindrake.net
```

### Port Conflicts

```bash
# Check what's using ports
sudo netstat -tulpn | grep -E ':(80|443|5000|8080|4000)'

# Stop conflicting services
sudo systemctl stop nginx  # Example
```

### Volume Permissions

```bash
# Fix volume permissions
docker compose -f orchestration/compose.base.yml down -v
docker volume prune -f
./homelab deploy core
```

## Health Checks

### Verify Service Health

```bash
# Comprehensive health check
./homelab health

# Check specific service
docker inspect homelab-dashboard --format='{{.State.Health.Status}}'
```

### Manual Health Endpoints

```bash
# Dashboard
curl http://localhost:8080/

# Discord Bot
curl http://localhost:4000/health

# Stream Bot
curl http://localhost:5000/health

# MinIO
curl http://localhost:9000/minio/health/live
```

## Performance Optimization

### Resource-Constrained Hosts

```bash
# Minimal deployment
./homelab deploy core
./homelab deploy discord-bot  # Only Discord bot

# Total memory: ~1GB
```

### High-Performance Hosts

```bash
# Everything
./homelab deploy all

# Scale workers
docker compose -f orchestration/compose.automation.yml up -d --scale celery-worker=4
```

## Security Considerations

### Network Isolation

Services communicate via the `homelab` bridge network. External access is controlled by Caddy reverse proxy.

### Secrets Management

Uses Phase 1 SOPS encryption:

```bash
# Edit encrypted secrets
sops config/secrets/base.enc.yaml

# Generate configs
./homelab config generate prod evindrake.net

# Deploy
./homelab deploy all
```

### Least Privilege

Deploy only required services to minimize attack surface:

```bash
# Production web server (no dev tools)
./homelab deploy core
./homelab deploy dashboard
./homelab deploy web
```

## Future: Phase 3 Multi-Host Deployment

The modular architecture prepares for Phase 3 service discovery:

```bash
# Deploy dashboard to host A
./homelab deploy dashboard --host=server-a

# Deploy bots to host B
./homelab deploy bots --host=server-b
```

Services will auto-discover via Consul/Traefik (Phase 3).

## Service Catalog Schema

See `services.yaml` for the complete catalog. Key fields:

- **name**: Container name
- **description**: What the service does
- **group**: Service group (core, bots, web, automation, development)
- **dependencies**: Required services
- **env_files**: Environment configuration files
- **interfaces**: Exposed ports and endpoints
- **placement**: Deployment constraints (local_only, local_or_remote)
- **health_endpoint**: Health check URL
- **startup_order**: Deployment sequence (1=first)

## Examples

### Example 1: Deploy Dashboard Stack

```bash
# Deploy infrastructure + dashboard + automation
./homelab deploy core
./homelab deploy dashboard
./homelab deploy automation

# Verify
./homelab status
./homelab health
```

### Example 2: Bot-Only Server

```bash
# Minimal bot server
./homelab deploy core     # 4 containers
./homelab deploy bots     # +2 containers (discord, stream)

# Total: 6 containers, ~1.5GB RAM
```

### Example 3: Gradual Service Addition

```bash
# Start minimal
./homelab deploy core

# Add services as needed
./homelab deploy discord-bot
./homelab deploy stream-bot
./homelab deploy n8n

# Later add more
./homelab deploy homeassistant
./homelab deploy vnc-desktop
```

### Example 4: Disaster Recovery

```bash
# Restore from backup
./homelab deploy core
./homelab restore backups/homelab-backup-20251123.sql

# Deploy services
./homelab deploy all

# Verify
./homelab health
```

## Summary

The orchestration layer provides:

✅ **Modular deployment** - Deploy only what you need  
✅ **Clear dependencies** - Automatic dependency resolution  
✅ **Backward compatible** - Existing deployments work  
✅ **Resource efficient** - Optimize for your host  
✅ **Phase 3 ready** - Prepared for multi-host deployment  

**Next Steps:**
- Use `./homelab services list` to explore available services
- Start with `./homelab deploy core` for infrastructure
- Add services incrementally with `./homelab deploy <service>`
- Monitor with `./homelab health`

For detailed operations, see `OPERATIONS_GUIDE.md`.
