# Orchestration - ARCHIVED

This folder contains Phase 3-8 roadmap features that are **not currently in use**.

The active deployment uses a **simplified unified approach**:
- ONE `.env` file at project root
- ONE `docker-compose.yml` at project root
- ONE `./homelab` script for management
- ONE `./deploy/scripts/bootstrap.sh` for deployment

## What's in this folder?

These files were part of an advanced microservices architecture roadmap:

- **compose.consul.yml** - Consul service discovery (Phase 3)
- **compose.traefik.yml** - Traefik API gateway (Phase 7)
- **compose.observability.yml** - Prometheus/Grafana/Loki (Phase 5)
- **services.yaml** - Service catalog definitions

## Why was this archived?

Per the project philosophy: **Simple, straightforward, automated, self-healing**

The split deployment with Consul, Traefik, and multiple compose files added complexity
without providing clear benefits for a homelab with ~12 services.

## If you want to use these features

1. These are optional advanced features
2. Run the specific compose file: `docker compose -f orchestration/compose.consul.yml up -d`
3. You'll need to add the corresponding environment variables to your `.env`

## Current recommended approach

```bash
./deploy/scripts/bootstrap.sh    # One-time setup
./homelab up                      # Start services
./homelab status                  # Check status
./homelab logs                    # View logs
```
