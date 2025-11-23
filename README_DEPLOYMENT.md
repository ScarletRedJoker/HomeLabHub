# 🚀 HomeLabHub Deployment Guide

Quick reference for deploying HomeLabHub services to production.

## Quick Start

### First-Time Setup

```bash
# 1. Generate production configuration
python3 config/scripts/generate-config.py prod evindrake_net

# 2. Copy to server
scp deployment/prod/evindrake_net/.env evin@server:/home/evin/contain/HomeLabHub/.env

# 3. Bootstrap homelab
ssh evin@server "cd /home/evin/contain/HomeLabHub && ./bootstrap-homelab.sh"

# 4. Verify deployment
ssh evin@server "cd /home/evin/contain/HomeLabHub && ./homelab health"
```

### Regular Deployments

```bash
# Deploy specific service
./homelab deploy-prod dashboard

# Deploy all services
./homelab deploy-prod all

# Check deployment status
./homelab deployment status

# View deployment history
./homelab deployment history
```

## GitHub Actions Setup

### 1. Configure Secrets

Go to **Settings → Secrets and variables → Actions** and add:

```
PROD_SERVER_HOST=your-server.com
PROD_SERVER_USER=evin
PROD_SSH_KEY=<paste-private-key>
```

### 2. Generate SSH Key

```bash
# Generate key pair
ssh-keygen -t ed25519 -C "github-actions@homelab" -f github-actions-key

# Add public key to server
ssh-copy-id -i github-actions-key.pub evin@your-server.com

# Copy private key to GitHub Secrets
cat github-actions-key
```

### 3. Test Connection

```bash
ssh -i github-actions-key evin@your-server.com "echo 'Connected!'"
```

## Manual Deployment

### Deploy Dashboard

```bash
# 1. Create backup
./scripts/backup-config.sh

# 2. Deploy
./scripts/deploy.sh dashboard

# 3. Verify
./scripts/health-check.sh dashboard
```

### Deploy All Services

```bash
./scripts/deploy.sh all
```

## Rollback

### Automatic Rollback

Failed deployments rollback automatically if `AUTO_ROLLBACK=true` (default).

### Manual Rollback

```bash
# Rollback to last backup
./homelab rollback dashboard

# Rollback to specific backup
./homelab rollback dashboard backup-20251123-120000

# View available backups
ls -lt var/backups/deployments/
```

## Health Checks

```bash
# All services
./homelab health

# Specific service
./scripts/health-check.sh dashboard

# With custom timeout
HEALTH_CHECK_TIMEOUT=120 ./scripts/health-check.sh
```

## Deployment History

```bash
# View history
./homelab deployment history

# View current status
./homelab deployment status

# View full history file
cat .deployments/history.json | jq
```

## Troubleshooting

### Deployment Fails

```bash
# Check logs
./homelab logs dashboard

# Verify environment
./homelab validate-env

# Run health checks
./homelab health

# Try fix command
./homelab fix
```

### Rollback Fails

```bash
# List backups
ls -lt var/backups/deployments/

# Manual restore
./homelab rollback dashboard backup-20251123-120000

# Check service status
./homelab status
```

### GitHub Actions Fails

```bash
# Check SSH connection
ssh -i github-actions-key evin@your-server.com

# Verify secrets in GitHub
# Settings → Secrets and variables → Actions

# Check workflow logs
# Actions → Deploy to Production → View logs
```

## Common Commands

```bash
# Status
./homelab status                    # Service status
./homelab deployment status         # Deployment info
./homelab health                    # Health checks

# Deployment
./homelab deploy-prod <service>     # Deploy to production
./homelab rollback <service>        # Rollback service
./homelab deployment history        # View history

# Maintenance
./homelab backup                    # Backup databases
./homelab logs <service>            # View logs
./homelab restart                   # Restart all services
```

## Best Practices

1. ✅ **Always backup** before deployments
2. ✅ **Test in staging** if available
3. ✅ **Monitor logs** after deployment
4. ✅ **Verify health checks** pass
5. ✅ **Document changes** in git commits

## Resources

- **Full Documentation:** [orchestration/PHASE6_CICD.md](orchestration/PHASE6_CICD.md)
- **GitHub Actions Template:** [config/templates/github-actions.env.j2](config/templates/github-actions.env.j2)
- **Deployment Scripts:** [scripts/](scripts/)
- **Services Configuration:** [orchestration/services.yaml](orchestration/services.yaml)

---

**Need Help?** Check [orchestration/PHASE6_CICD.md](orchestration/PHASE6_CICD.md) for complete documentation.
