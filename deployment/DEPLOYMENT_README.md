# 🚀 Deployment Guide

Complete guide for deploying and managing the HomeLabHub infrastructure.

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Deployment Scripts Overview](#deployment-scripts-overview)
- [Step-by-Step Deployment](#step-by-step-deployment)
- [Backup & Restore](#backup--restore)
- [Migrations](#migrations)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)
- [Common Issues](#common-issues)
- [Script Reference](#script-reference)

---

## Quick Start

For experienced users who want to deploy immediately:

```bash
# 1. Set up environment
cd deployment
./setup-env.sh

# 2. Verify configuration
./check-all-env.sh

# 3. Deploy with health checks
./deploy-with-health-check.sh

# 4. Validate deployment
./validate-deployment.sh
```

For first-time users or production deployments, **read the full guide below**.

---

## Prerequisites

### Required Software

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| **Docker** | 20.10+ | Container runtime |
| **Docker Compose** | 2.0+ | Multi-container orchestration |
| **Bash** | 4.0+ | Script execution |
| **Git** | 2.0+ | Version control |
| **PostgreSQL Client** | 12+ | Database operations |

### System Requirements

- **CPU**: 4+ cores recommended
- **RAM**: 8GB minimum, 16GB recommended
- **Disk**: 50GB+ free space
- **Network**: Internet connection for pulling images
- **Ports**: See [Port Reference](#port-reference)

### Pre-Deployment Checklist

- [ ] Docker daemon running and accessible
- [ ] Docker Compose installed
- [ ] `.env` file configured (or use `.env.example`)
- [ ] Required ports available
- [ ] Sufficient disk space
- [ ] Network connectivity

---

## Deployment Scripts Overview

### Core Deployment

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `deploy-with-health-check.sh` | **Main deployment script** with health monitoring | Primary deployment method |
| `deploy-unified.sh` | Deploy all services from unified compose file | Alternative deployment |
| `rollback-deployment.sh` | Rollback to previous snapshot | When deployment fails |
| `validate-deployment.sh` | Verify deployment health | Post-deployment validation |

### Environment & Configuration

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `setup-env.sh` | Interactive environment setup | First-time setup |
| `generate-unified-env.sh` | Generate `.env` from templates | Automated setup |
| `check-all-env.sh` | Validate environment variables | Pre-deployment check |

### Database Operations

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `backup-databases.sh` | Backup all databases | Before deployments/migrations |
| `restore-database.sh` | Restore from backup | Disaster recovery |
| `migrate-all.sh` | Run database migrations | Schema updates |
| `ensure-databases.sh` | Create databases if missing | Initial setup |

### Backup & Sync

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `backup-plex.sh` | Backup Plex media server | Media server maintenance |
| `sync-from-replit.sh` | Sync from Replit development | Replit → Production sync |
| `manual-sync.sh` | Manual file synchronization | Custom sync operations |

### Monitoring & Maintenance

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `monitor-services.sh` | Real-time service monitoring | Ongoing monitoring |
| `diagnose-all.sh` | Comprehensive system diagnostics | Troubleshooting |
| `homelab-manager.sh` | Interactive management TUI | Day-to-day operations |

### Testing

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `test-deployment.sh` | Comprehensive test suite | Pre-deployment validation |

---

## Step-by-Step Deployment

### 1. Environment Setup

**Option A: Interactive Setup (Recommended for first-time)**

```bash
cd deployment
./setup-env.sh
```

This will guide you through:
- Database credentials
- Service URLs
- API keys
- Security secrets

**Option B: Automated Setup**

```bash
# Copy example and edit manually
cp .env.example .env
nano .env

# Or generate from templates
./generate-unified-env.sh
```

### 2. Pre-Deployment Validation

**Check environment variables:**

```bash
./check-all-env.sh
```

**Run pre-deployment tests:**

```bash
./test-deployment.sh --smoke
```

**Verify Docker Compose configuration:**

```bash
docker compose -f ../docker-compose.unified.yml config > /dev/null
echo "✓ Compose file valid"
```

### 3. Backup Current State (If Applicable)

**Before any deployment**, create backups:

```bash
# Backup databases
./backup-databases.sh

# Create deployment snapshot
./rollback-deployment.sh create-snapshot pre-deployment-$(date +%Y%m%d)
```

### 4. Deploy Services

**Recommended: Deploy with health checks and auto-rollback**

```bash
./deploy-with-health-check.sh
```

This script will:
1. Validate configuration
2. Create snapshot
3. Deploy services
4. Monitor health checks
5. Auto-rollback on failure

**Advanced options:**

```bash
# Dry-run (see what would happen)
DRY_RUN=true ./deploy-with-health-check.sh

# Skip auto-rollback
AUTO_ROLLBACK=false ./deploy-with-health-check.sh

# Custom health check timeout
HEALTH_CHECK_TIMEOUT=300 ./deploy-with-health-check.sh
```

### 5. Run Database Migrations

```bash
./migrate-all.sh
```

This handles migrations for:
- Dashboard (Alembic/Python)
- Stream Bot (Drizzle/TypeScript)
- Discord Bot (Drizzle/TypeScript)

### 6. Post-Deployment Validation

**Comprehensive validation:**

```bash
./validate-deployment.sh
```

**Run integration tests:**

```bash
./test-deployment.sh --integration
```

**Manual verification:**

```bash
# Check running containers
docker ps

# View service logs
docker logs homelab-dashboard
docker logs stream-bot
docker logs discord-bot

# Test endpoints
curl http://localhost:5000/health  # Dashboard
curl http://localhost:3000/health  # Stream Bot
curl http://localhost:3001/health  # Discord Bot
```

### 7. Configure Automated Backups (Optional)

```bash
# Install systemd timers for automated backups
./install-auto-sync.sh

# Verify backup schedule
systemctl --user list-timers
```

---

## Backup & Restore

### Creating Backups

**Database Backups:**

```bash
# Backup all databases
./backup-databases.sh

# Backups are stored in:
# /home/evin/contain/backups/database/daily/
# /home/evin/contain/backups/database/weekly/
```

**Configuration Backups:**

```bash
./backup-configs.sh

# Backs up:
# - .env files
# - docker-compose.yml
# - Caddy configurations
# - Home Assistant configs
```

**Service Data Backups:**

```bash
./backup-plex.sh              # Plex media server
```

**Full Deployment Snapshot:**

```bash
./rollback-deployment.sh create-snapshot my-snapshot-name
```

### Restoring from Backup

**Restore Database:**

```bash
# List available backups
./restore-database.sh list

# Restore specific database
./restore-database.sh restore ticketbot /path/to/backup.sql.gz
```

**Restore Full Deployment:**

```bash
# List snapshots
./rollback-deployment.sh list-snapshots

# Rollback to snapshot
./rollback-deployment.sh rollback snapshot_20241115_120000
```

---

## Migrations

### Running Migrations

**All services:**

```bash
./migrate-all.sh
```

**Check migration status:**

```bash
./migrate-all.sh --status
```

**Individual service migrations:**

```bash
# Dashboard (Alembic)
cd ../services/dashboard
alembic upgrade head

# Stream Bot (Drizzle)
cd ../services/stream-bot
npm run migrate:up

# Discord Bot (Drizzle)
cd ../services/discord-bot
npm run migrate:up
```

### Creating New Migrations

**Dashboard:**

```bash
cd services/dashboard
alembic revision -m "description_of_changes"
# Edit the generated file in alembic/versions/
alembic upgrade head
```

**Stream/Discord Bot:**

```bash
cd services/stream-bot  # or discord-bot
npm run db:generate    # Generate migration from schema changes
npm run migrate:up     # Apply migration
```

---

## Rollback Procedures

### Automatic Rollback

The `deploy-with-health-check.sh` script includes automatic rollback on failure.

### Manual Rollback

**1. List available snapshots:**

```bash
./rollback-deployment.sh list-snapshots
```

**2. Rollback to specific snapshot:**

```bash
./rollback-deployment.sh rollback snapshot_20241115_120000
```

**3. Verify rollback:**

```bash
./validate-deployment.sh
docker ps
```

### Emergency Rollback (Database Only)

```bash
# Stop services
docker compose -f ../docker-compose.unified.yml down

# Restore database
./restore-database.sh restore ticketbot /backups/latest.sql.gz

# Restart services
docker compose -f ../docker-compose.unified.yml up -d
```

---

## Troubleshooting

### Diagnostic Tools

**Quick diagnostics:**

```bash
./diagnose-all.sh
```

This checks:
- Docker status
- Container health
- Port availability
- Disk space
- Database connectivity
- Network configuration

**Interactive management:**

```bash
../homelab-manager.sh
```

Provides menu-driven interface for:
- Service management
- Log viewing
- Backup operations
- Status monitoring

### Common Commands

**View logs:**

```bash
# All services
docker compose -f ../docker-compose.unified.yml logs -f

# Specific service
docker logs -f --tail=100 homelab-dashboard

# Search logs
docker logs homelab-dashboard 2>&1 | grep ERROR
```

**Restart services:**

```bash
# All services
docker compose -f ../docker-compose.unified.yml restart

# Specific service
docker restart homelab-dashboard
```

**Check health:**

```bash
# Container health status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Detailed inspect
docker inspect homelab-dashboard | grep -A 10 Health
```

---

## Common Issues

### Issue: Port Already in Use

**Symptoms:**
```
Error starting userland proxy: listen tcp4 0.0.0.0:5000: bind: address already in use
```

**Solution:**
```bash
# Find process using port
sudo lsof -i :5000

# Kill the process
sudo kill -9 <PID>

# Or change port in docker-compose.unified.yml
```

### Issue: Database Connection Failed

**Symptoms:**
```
FATAL: password authentication failed for user
```

**Solutions:**

```bash
# 1. Check environment variables
./check-all-env.sh

# 2. Verify database is running
docker ps | grep postgres

# 3. Check database logs
docker logs discord-bot-db

# 4. Recreate databases
./ensure-databases.sh

# 5. Reset database password
docker exec -it discord-bot-db psql -U postgres
postgres=# ALTER USER ticketbot PASSWORD 'new_password';
# Update .env with new password
```

### Issue: Container Health Check Failing

**Symptoms:**
```
Container health check failed after 120s
```

**Solutions:**

```bash
# 1. Check application logs
docker logs <container-name>

# 2. Check if app is listening on correct port
docker exec <container-name> netstat -tlnp

# 3. Verify environment variables
docker exec <container-name> env

# 4. Test health endpoint manually
docker exec <container-name> curl localhost:5000/health

# 5. Increase timeout
HEALTH_CHECK_TIMEOUT=300 ./deploy-with-health-check.sh
```

### Issue: Disk Space Full

**Symptoms:**
```
no space left on device
```

**Solutions:**

```bash
# Check disk usage
df -h

# Clean Docker system
docker system prune -a --volumes

# Remove old images
docker image prune -a

# Clean old logs
journalctl --vacuum-time=7d

# Remove old backups
find /home/evin/contain/backups -mtime +30 -delete
```

### Issue: Migration Fails

**Symptoms:**
```
Alembic/Drizzle migration error
```

**Solutions:**

```bash
# 1. Check current migration status
./migrate-all.sh --status

# 2. Backup database first
./backup-databases.sh

# 3. Try manual migration with verbose output
cd services/dashboard
alembic upgrade head --verbose

# 4. If migration fails, rollback
alembic downgrade -1

# 5. Fix migration file and retry
```

### Issue: Services Not Communicating

**Symptoms:**
```
Connection refused or network unreachable between services
```

**Solutions:**

```bash
# 1. Check Docker network
docker network ls
docker network inspect homelab-network

# 2. Verify service names in compose file
docker compose -f ../docker-compose.unified.yml config | grep hostname

# 3. Test connectivity
docker exec homelab-dashboard ping discord-bot-db

# 4. Recreate network
docker compose -f ../docker-compose.unified.yml down
docker network rm homelab-network
docker compose -f ../docker-compose.unified.yml up -d
```

---

## Script Reference

### deploy-with-health-check.sh

**Purpose:** Main deployment script with health monitoring and auto-rollback

**Usage:**
```bash
./deploy-with-health-check.sh [OPTIONS]

Options:
  -h, --help              Show help
  -n, --dry-run           Show what would be done
  -f, --force             Skip confirmations
  --no-rollback           Disable auto-rollback
  --timeout SECONDS       Health check timeout (default: 120)
```

**Features:**
- Pre-deployment validation
- Automatic snapshot creation
- Health check monitoring
- Auto-rollback on failure
- Detailed error analysis

---

### rollback-deployment.sh

**Purpose:** Snapshot management and rollback

**Usage:**
```bash
./rollback-deployment.sh <command> [args]

Commands:
  create-snapshot NAME    Create deployment snapshot
  list-snapshots          List available snapshots
  rollback NAME           Rollback to snapshot
  delete-snapshot NAME    Delete snapshot
```

**Examples:**
```bash
# Create snapshot
./rollback-deployment.sh create-snapshot pre-update-v2

# List snapshots
./rollback-deployment.sh list-snapshots

# Rollback
./rollback-deployment.sh rollback snapshot_20241115_120000
```

---

### migrate-all.sh

**Purpose:** Unified database migration management

**Usage:**
```bash
./migrate-all.sh [OPTIONS]

Options:
  --status          Show migration status only
  --service NAME    Migrate specific service only
  --dry-run         Show pending migrations
```

**Examples:**
```bash
# Check status
./migrate-all.sh --status

# Migrate all
./migrate-all.sh

# Migrate specific service
./migrate-all.sh --service dashboard
```

---

### backup-databases.sh

**Purpose:** Automated database backup with retention

**Usage:**
```bash
./backup-databases.sh [OPTIONS]

Options:
  --verify          Verify backups after creation
  --skip-cleanup    Don't remove old backups
```

**Features:**
- Backs up all PostgreSQL databases
- Compression (gzip)
- Verification
- Retention policy (7 daily, 4 weekly)
- Logging

**Backup Locations:**
- Daily: `/home/evin/contain/backups/database/daily/`
- Weekly: `/home/evin/contain/backups/database/weekly/`

---

### homelab-manager.sh

**Purpose:** Interactive management interface

**Usage:**
```bash
../homelab-manager.sh
```

**Features:**
- Menu-driven UI
- Service management (start/stop/restart)
- Backup management
- Log viewing
- System status
- Database operations

---

### test-deployment.sh

**Purpose:** Comprehensive testing suite

**Usage:**
```bash
./test-deployment.sh [OPTIONS]

Options:
  --unit            Unit tests only
  --integration     Integration tests only
  --smoke           Smoke tests only
  --errors          Error scenario tests
  --all             All tests (default)
```

**Test Categories:**
- **Smoke Tests:** Basic system checks
- **Unit Tests:** Individual function tests
- **Integration Tests:** Cross-component tests
- **Error Scenarios:** Failure handling tests

**Output:**
- Console output with colored results
- Log file: `deployment/test-results.log`
- HTML report: `deployment/test-report.html`

---

## Port Reference

| Service | Port | Protocol | Purpose |
|---------|------|----------|---------|
| Dashboard | 5000 | HTTP | Web UI |
| Stream Bot | 3000 | HTTP | Stream management |
| Discord Bot | 3001 | HTTP | Discord integration |
| PostgreSQL | 5432 | TCP | Database |
| Redis | 6379 | TCP | Cache |
| MinIO | 9000 | HTTP | Object storage |
| MinIO Console | 9001 | HTTP | Admin UI |
| Caddy | 80, 443 | HTTP/HTTPS | Reverse proxy |
| n8n | 5678 | HTTP | Automation |
| Home Assistant | 8123 | HTTP | Smart home |
| Plex | 32400 | HTTP | Media server |
| Code Server | 8080 | HTTP | Web IDE |
| VNC Desktop | 6080 | HTTP | Remote desktop |

---

## Environment Variables Reference

### Required Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
DISCORD_DB_PASSWORD=secure_password
STREAMBOT_DB_PASSWORD=secure_password
JARVIS_DB_PASSWORD=secure_password

# Security
SECRET_KEY=random_secret_key_here
JWT_SECRET=jwt_secret_key_here

# Service URLs
APP_URL=https://yourdomain.com
REPLIT_DEV_DOMAIN=yourdomain.repl.co  # If on Replit
```

### Optional Variables

```bash
# Debugging
DEBUG=1                    # Enable debug output
DRY_RUN=true              # Dry-run mode
FORCE=true                # Skip confirmations

# Monitoring
HEALTH_CHECK_TIMEOUT=120  # Health check timeout (seconds)
HEALTH_CHECK_INTERVAL=5   # Check interval (seconds)

# Backups
BACKUP_RETAIN_DAILY=7     # Days to retain daily backups
BACKUP_RETAIN_WEEKLY=4    # Weeks to retain weekly backups
```

---

## Best Practices

### Development

1. **Always use dry-run first:**
   ```bash
   DRY_RUN=true ./deploy-with-health-check.sh
   ```

2. **Test in non-production environment**

3. **Use version control:**
   ```bash
   git commit -am "Before deployment $(date)"
   ```

### Production

1. **Always backup before changes:**
   ```bash
   ./backup-databases.sh
   ./rollback-deployment.sh create-snapshot pre-change
   ```

2. **Run validation tests:**
   ```bash
   ./test-deployment.sh --smoke
   ./validate-deployment.sh
   ```

3. **Monitor during deployment:**
   ```bash
   ./monitor-services.sh &
   ./deploy-with-health-check.sh
   ```

4. **Document changes:**
   - Update CHANGELOG
   - Note configuration changes
   - Document any manual steps

### Maintenance

1. **Regular backups:**
   - Set up automated backups
   - Test restore procedures
   - Verify backup integrity

2. **Monitor disk space:**
   ```bash
   df -h
   docker system df
   ```

3. **Keep clean:**
   ```bash
   docker system prune -a --volumes  # Monthly
   ```

4. **Update regularly:**
   ```bash
   docker compose pull
   ./deploy-with-health-check.sh
   ```

---

## Support & Resources

### Documentation

- **Project README:** `../README.md`
- **Service-specific docs:** `../services/*/README.md`
- **Architecture:** `../docs/ARCHITECTURE.md`
- **Security:** `../docs/SECURITY.md`

### Logs

- **Deployment logs:** `deployment/deployment.log`
- **Test results:** `deployment/test-results.log`
- **Service logs:** `docker logs <container-name>`

### Getting Help

1. **Check diagnostic output:**
   ```bash
   ./diagnose-all.sh
   ```

2. **Review logs:**
   ```bash
   tail -f deployment/deployment.log
   ```

3. **Run tests:**
   ```bash
   ./test-deployment.sh
   ```

4. **Check existing issues in repository**

---

## Quick Reference Card

```bash
# Setup
./setup-env.sh                  # Interactive setup
./check-all-env.sh              # Validate config

# Deploy
./deploy-with-health-check.sh   # Full deployment
./validate-deployment.sh        # Verify deployment

# Backup
./backup-databases.sh           # Backup DBs
./rollback-deployment.sh create-snapshot NAME

# Rollback
./rollback-deployment.sh rollback NAME

# Migrate
./migrate-all.sh                # Run migrations
./migrate-all.sh --status       # Check status

# Monitor
./monitor-services.sh           # Real-time monitoring
../homelab-manager.sh           # Interactive UI

# Test
./test-deployment.sh            # Run all tests
./test-deployment.sh --smoke    # Quick checks

# Troubleshoot
./diagnose-all.sh               # System diagnostics
docker logs -f <service>        # View logs
```

---

## Changelog

### 2024-11-15
- Created comprehensive deployment guide
- Added test-deployment.sh suite
- Implemented common library (lib-common.sh)
- Enhanced all scripts with proper error handling
- Added dry-run support to all scripts

---

**Last Updated:** 2024-11-15
**Version:** 1.0.0
