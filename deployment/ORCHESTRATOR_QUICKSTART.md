# Homelab Orchestrator Quick Start

## Overview

The Homelab Orchestrator provides bulletproof git synchronization and zero-downtime deployments with automatic rollback.

## Key Features

### 🛡️ Hardened Git Sync (`scripts/hardened-sync.sh`)
- **Lock-based concurrency control** - Prevents race conditions
- **Automatic stash/recovery** - Safely handles local changes
- **Conflict detection** - Catches issues before they happen
- **Permission enforcement** - Ensures correct UID/GID (1000:1000)
- **Rollback capability** - Can revert to previous state

### 🚀 Deployment Orchestrator (`scripts/homelab-orchestrator.sh`)
- **6-stage pipeline**: Validate → Backup → Sync → Build → Deploy → Verify
- **Zero-downtime deployments** - Rolling restarts with health checks
- **Automatic rollback** - Reverts on failure
- **Circuit breaker** - Prevents repeated failures
- **GitOps integration** - Tag-based deployments with signed commits
- **Audit logging** - Complete deployment history

## Quick Start

### Using the Homelab Manager
```bash
./homelab-manager.sh

# Then select:
# 21) Deploy with Auto-Rollback
# 22) View Deployment History
# 23) Rollback to Previous Version
# 24) Deployment Dry-Run
# 25) Validate Deployment
```

### Direct Commands

**Full deployment:**
```bash
./scripts/homelab-orchestrator.sh deploy
```

**Dry-run (preview without changes):**
```bash
./scripts/homelab-orchestrator.sh deploy --dry-run
```

**Validation only:**
```bash
./scripts/homelab-orchestrator.sh validate
```

**View deployment history:**
```bash
./scripts/homelab-orchestrator.sh history
```

**Rollback to previous version:**
```bash
./scripts/homelab-orchestrator.sh rollback
```

**Git sync only (hardened):**
```bash
./scripts/hardened-sync.sh
```

## Deployment Pipeline Stages

1. **Validate** - Check environment, files, DNS, databases
2. **Backup** - Snapshot databases, volumes, configs
3. **Sync** - Pull latest code with hardened git sync
4. **Build** - Build containers with latest base images
5. **Deploy** - Rolling restart with health checks
6. **Verify** - Smoke tests and endpoint validation

## Health Checks

The orchestrator monitors service health and will:
- ✅ Wait up to 2 minutes for services to become healthy
- ✅ Automatically rollback if health checks fail
- ✅ Track consecutive failures and apply circuit breaker
- ✅ Verify all critical endpoints are responding

## Cron Integration

Safe for automated deployments every 5 minutes:

```bash
# Install auto-sync via homelab-manager.sh option 18
# Or manually configure cron:
*/5 * * * * /path/to/scripts/homelab-orchestrator.sh deploy --auto >> /var/log/homelab-deploy.log 2>&1
```

The lock file prevents overlapping runs.

## Configuration

Edit `deployment/orchestrator-config.yaml` to customize:
- Service health check endpoints
- Timeout values
- Backup strategies
- Email notifications
- Circuit breaker thresholds

## Safety Features

✅ **Lock files** - Prevents concurrent deployments  
✅ **Dry-run mode** - Preview changes safely  
✅ **Automatic backups** - Before every deployment  
✅ **Health monitoring** - Continuous service checks  
✅ **Auto-rollback** - On any failure  
✅ **State snapshots** - Can restore previous state  
✅ **Audit logging** - Complete deployment history  
✅ **Circuit breaker** - Stops after repeated failures  

## Troubleshooting

### Deployment fails
```bash
# View deployment history
./scripts/homelab-orchestrator.sh history

# Check logs
tail -f var/log/orchestrator.log

# Rollback to last known good state
./scripts/homelab-orchestrator.sh rollback
```

### Git sync conflicts
```bash
# Hardened sync will automatically stash local changes
# To recover stashed changes:
git stash list
git stash pop
```

### Permission issues
```bash
# Hardened sync automatically fixes permissions
# Manual fix if needed:
sudo chown -R 1000:1000 .
```

## Migration from Legacy Scripts

The orchestrator is backward-compatible:
- ✅ `deployment/deploy-unified.sh` - Still works, recommends orchestrator
- ✅ `deployment/sync-from-replit.sh` - Now uses hardened-sync.sh
- ✅ All existing workflows continue to function

For production deployments, use the orchestrator for:
- Zero-downtime updates
- Automatic health checks
- Built-in rollback capability
- Complete audit trail

## Support

For issues or questions:
1. Check `var/log/orchestrator.log` for detailed logs
2. Run validation: `./scripts/homelab-orchestrator.sh validate`
3. Use dry-run to test: `./scripts/homelab-orchestrator.sh deploy --dry-run`
