# HomeLabHub Operations Guide

Complete reference for day-to-day operations, troubleshooting, and maintenance of your homelab infrastructure.

## Table of Contents

- [Quick Reference](#quick-reference)
- [Daily Operations](#daily-operations)
- [Health Monitoring](#health-monitoring)
- [Backup & Restore](#backup--restore)
- [Deployment Updates](#deployment-updates)
- [Service Management](#service-management)
- [Troubleshooting](#troubleshooting)
- [Common Errors & Solutions](#common-errors--solutions)
- [Maintenance Tasks](#maintenance-tasks)

---

## Quick Reference

### Most Used Commands

```bash
# Check status
./homelab status

# View logs (all services)
./homelab logs

# View specific service logs
./homelab logs homelab-dashboard

# Run health checks
./homelab health

# Create database backup
./homelab backup

# Update from git and redeploy
./homelab update

# Fix all issues
./homelab fix
```

### Service URLs

| Service | URL | Notes |
|---------|-----|-------|
| Dashboard | https://host.evindrake.net | Main control panel |
| Discord Bot | https://bot.rig-city.com | Ticket bot interface |
| Stream Bot | https://stream.rig-city.com | Streaming automation |
| Plex | https://plex.evindrake.net | Media server |
| n8n | https://n8n.evindrake.net | Automation workflows |
| MinIO | https://minio.evindrake.net | Object storage console |

---

## Daily Operations

### Morning Checklist

```bash
# 1. Check all services are running
./homelab status

# 2. Run health checks
./homelab health

# 3. Check for any errors in logs (last 50 lines)
./homelab logs | tail -50 | grep -i error
```

### Before Leaving for the Day

```bash
# 1. Create a backup
./homelab backup

# 2. Verify services are stable
./homelab status

# 3. Check disk space
df -h /home/evin/contain/HomeLabHub
```

### Weekly Tasks

1. **Update Deployment** (if changes available)
   ```bash
   ./homelab update
   ```

2. **Clean Old Files**
   ```bash
   ./homelab clean
   ```

3. **Run Integration Tests**
   ```bash
   ./homelab test
   ```

4. **Review Logs** for patterns or recurring errors
   ```bash
   ./homelab logs | grep -E "ERROR|WARNING" | sort | uniq -c
   ```

---

## Health Monitoring

### Comprehensive Health Check

```bash
./homelab health
```

This checks:
- ✅ Database connectivity (PostgreSQL)
- ✅ API endpoints (Dashboard, Discord Bot, Stream Bot, MinIO)
- ✅ Disk space usage
- ✅ Memory usage  
- ✅ Container health status

### Individual Health Checks

**Database Check:**
```bash
docker exec homelab-postgres pg_isready -U postgres
```

**Redis Check:**
```bash
docker exec homelab-redis redis-cli ping
```

**MinIO Check:**
```bash
curl http://localhost:9000/minio/health/live
```

**Dashboard API Check:**
```bash
curl http://localhost:8080/
```

### Monitoring Disk Space

```bash
# Overall disk usage
df -h

# Docker disk usage
docker system df

# Specific directories
du -sh /home/evin/contain/HomeLabHub/var/*
```

### Monitoring Memory

```bash
# System memory
free -h

# Docker container memory
docker stats --no-stream
```

---

## Backup & Restore

### Creating Backups

**Automated Backup (Recommended):**
```bash
./homelab backup
```

Creates timestamped backup at:
`var/backups/databases/homelab-backup-YYYYMMDD-HHMMSS.sql`

Automatically keeps last 10 backups.

**Manual Database Backup:**
```bash
# All databases
docker exec homelab-postgres pg_dumpall -U postgres > backup-$(date +%Y%m%d).sql

# Specific database
docker exec homelab-postgres pg_dump -U postgres -d homelab_jarvis > jarvis-backup.sql
```

**Backup .env File:**
```bash
cp .env .env.backup-$(date +%Y%m%d)
chmod 600 .env.backup-*
```

### Restoring from Backup

**Using homelab command (Recommended):**
```bash
# List available backups
ls -lh var/backups/databases/

# Restore specific backup
./homelab restore var/backups/databases/homelab-backup-20251123-140000.sql
```

**Manual Restore:**
```bash
# Stop services
./homelab stop

# Restore all databases
docker compose up -d homelab-postgres
sleep 5
docker exec -i homelab-postgres psql -U postgres < backup-file.sql

# Start all services
./homelab start
```

### Backup Schedule Recommendations

- **Hourly**: Automatic via cron (critical data only)
- **Daily**: Before major changes
- **Weekly**: Full system backup
- **Before Updates**: Always create backup

**Example Cron Job:**
```bash
# Add to crontab -e
0 2 * * * cd /home/evin/contain/HomeLabHub && ./homelab backup >> /var/log/homelab-backup.log 2>&1
```

---

## Deployment Updates

### Update from Git Repository

**Safe Update Process:**
```bash
# 1. Create backup first
./homelab backup

# 2. Run update (includes git pull and redeploy)
./homelab update

# 3. Verify deployment
./homelab health
```

The `update` command:
- Creates automatic backup
- Shows what will change
- Asks for confirmation
- Pulls latest code
- Rebuilds images
- Restarts services

### Manual Update Process

If you need more control:

```bash
# 1. Backup
./homelab backup

# 2. Pull changes
git pull origin main

# 3. Review changes
git log --oneline -5

# 4. Rebuild and restart
docker compose build
docker compose up -d --force-recreate

# 5. Verify
./homelab health
```

### Rolling Back an Update

If update fails or causes issues:

```bash
# 1. Check git history
git log --oneline -10

# 2. Revert to previous commit
git reset --hard <commit-hash>

# 3. Rebuild
docker compose build
docker compose up -d --force-recreate

# 4. Or restore database from backup
./homelab restore var/backups/databases/pre-update-backup.sql
```

---

## Service Management

### Restarting Specific Services

**Using homelab:**
```bash
./homelab rebuild <service-name>
```

**Using docker compose:**
```bash
# Restart single service
docker compose restart homelab-dashboard

# Rebuild and restart
docker compose up -d --force-recreate homelab-dashboard
```

### Viewing Service Logs

```bash
# All services (follows new logs)
./homelab logs

# Specific service
./homelab logs homelab-dashboard

# Last 100 lines without following
docker compose logs --tail=100 homelab-dashboard

# Follow logs from multiple services
docker compose logs -f discord-bot stream-bot
```

### Scaling Services

```bash
# Scale celery workers
docker compose up -d --scale homelab-celery-worker=4

# View current scale
docker compose ps
```

### Stopping/Starting Services

```bash
# Stop all
./homelab stop

# Start all
./homelab start

# Restart all
./homelab restart

# Stop specific service
docker compose stop homelab-dashboard

# Start specific service
docker compose start homelab-dashboard
```

---

## Troubleshooting

### Service Won't Start

1. **Check logs:**
   ```bash
   ./homelab logs <service-name>
   docker logs <container-name> --tail=100
   ```

2. **Check container status:**
   ```bash
   docker ps -a | grep <service-name>
   docker inspect <container-name>
   ```

3. **Common fixes:**
   ```bash
   # Rebuild service
   ./homelab rebuild <service-name>
   
   # Force recreate
   docker compose up -d --force-recreate <service-name>
   
   # Full fix
   ./homelab fix
   ```

### Database Connection Issues

1. **Verify PostgreSQL is running:**
   ```bash
   docker ps | grep postgres
   docker exec homelab-postgres pg_isready -U postgres
   ```

2. **Check database exists:**
   ```bash
   docker exec homelab-postgres psql -U postgres -l
   ```

3. **Test connection:**
   ```bash
   # From dashboard container
   docker exec homelab-dashboard env | grep DATABASE
   ```

4. **Reset databases:**
   ```bash
   ./homelab stop
   docker volume rm homelab_postgres_data  # WARNING: Deletes all data
   ./bootstrap-homelab.sh
   ```

### Environment Variable Issues

1. **Validate .env file:**
   ```bash
   ./homelab validate-env
   ```

2. **Check what container sees:**
   ```bash
   docker exec <container-name> env | grep -E "POSTGRES|DISCORD|STREAMBOT"
   ```

3. **Common fixes:**
   ```bash
   # Ensure .env has no syntax errors
   grep -n "^[^#]" .env | grep -v "="  # Should return nothing
   
   # Recreate containers with new env
   ./homelab fix
   ```

### Port Conflicts

1. **Check what's using ports:**
   ```bash
   sudo netstat -tlnp | grep -E ":(80|443|5000|4000|8080)"
   ```

2. **Kill conflicting process:**
   ```bash
   sudo kill <PID>
   ```

3. **Change ports in docker-compose.yml** if needed

### Disk Space Full

1. **Check usage:**
   ```bash
   df -h
   docker system df
   ```

2. **Clean up:**
   ```bash
   # Use homelab clean command
   ./homelab clean
   
   # Or manual cleanup
   docker system prune -a
   docker volume prune
   ```

3. **Clear old logs:**
   ```bash
   find /home/evin/contain/HomeLabHub/logs -name "*.log" -mtime +7 -delete
   ```

### Memory Issues

1. **Check memory usage:**
   ```bash
   free -h
   docker stats --no-stream
   ```

2. **Restart heavy services:**
   ```bash
   docker compose restart homelab-celery-worker plex-server
   ```

3. **Adjust resource limits** in docker-compose.yml:
   ```yaml
   services:
     service-name:
       deploy:
         resources:
           limits:
             memory: 2G
   ```

---

## Common Errors & Solutions

### Error: "Password authentication failed"

**Cause:** Database password mismatch between .env and container

**Solution:**
```bash
# 1. Verify passwords in .env match
grep -E "DB_PASSWORD" .env

# 2. Rebuild containers with --no-cache
./homelab fix
```

### Error: "pg_isready: connection refused"

**Cause:** PostgreSQL not running or not healthy

**Solution:**
```bash
# Check PostgreSQL logs
docker logs homelab-postgres --tail=50

# Restart PostgreSQL
docker compose restart homelab-postgres

# Wait for it to be ready
sleep 10
docker exec homelab-postgres pg_isready -U postgres
```

### Error: "Connection to Redis failed"

**Cause:** Redis container not running

**Solution:**
```bash
# Check Redis
docker ps | grep redis

# Restart Redis
docker compose restart redis

# Test connection
docker exec homelab-redis redis-cli ping
```

### Error: "No such file or directory: .env"

**Cause:** .env file missing or script run from wrong directory

**Solution:**
```bash
# From correct directory
cd /home/evin/contain/HomeLabHub

# Or create .env from template
cp .env.example .env
# Edit .env with your values
```

### Error: "Port is already in use"

**Cause:** Another service using the same port

**Solution:**
```bash
# Find what's using the port
sudo lsof -i :5000

# Kill the process or change ports in docker-compose.yml
sudo kill <PID>
```

### Error: "Migration failed"

**Cause:** Database schema out of sync

**Solution:**
```bash
# Access container
docker exec -it homelab-dashboard bash

# Run migrations manually
cd /app
alembic upgrade head

# Or reset and re-migrate
alembic downgrade base
alembic upgrade head
```

---

## Maintenance Tasks

### Daily
- [ ] Check service status
- [ ] Review error logs
- [ ] Monitor disk space

### Weekly
- [ ] Create backup
- [ ] Run health checks
- [ ] Clean old logs and backups
- [ ] Update deployment (if needed)

### Monthly
- [ ] Review and update environment variables
- [ ] Check for Docker/system updates
- [ ] Review security logs
- [ ] Test restore from backup
- [ ] Update SSL certificates (if manual)

### Quarterly
- [ ] Full system backup
- [ ] Review and optimize resource usage
- [ ] Update documentation
- [ ] Disaster recovery test

---

## Emergency Procedures

### Complete System Failure

1. **Don't panic** - backups exist
2. **Check basics:**
   ```bash
   systemctl status docker
   df -h
   free -h
   ```

3. **Stop everything:**
   ```bash
   docker compose down
   ```

4. **Start fresh:**
   ```bash
   ./bootstrap-homelab.sh
   ```

5. **Restore data:**
   ```bash
   ./homelab restore <latest-backup>
   ```

### Data Corruption

1. **Stop affected services immediately**
2. **Don't restart - data might still be in memory**
3. **Create emergency backup:**
   ```bash
   docker exec homelab-postgres pg_dumpall -U postgres > emergency-backup.sql
   ```
4. **Assess damage in backup**
5. **Restore from last known good backup**

### Security Breach

1. **Immediate Actions:**
   ```bash
   # Stop all external access
   docker compose down
   
   # Change all passwords in .env
   # Rotate all API keys and tokens
   ```

2. **Investigation:**
   - Check logs for unauthorized access
   - Review container logs
   - Check for unauthorized users in databases

3. **Recovery:**
   - Update all credentials
   - Rebuild all containers
   - Review and harden security settings

---

## Best Practices

### DO:
- ✅ Create backups before ANY changes
- ✅ Use `./homelab` commands (they handle paths correctly)
- ✅ Check logs when troubleshooting
- ✅ Run health checks after changes
- ✅ Keep .env file secure (chmod 600)
- ✅ Document custom changes
- ✅ Test in development before production

### DON'T:
- ❌ Edit running containers directly
- ❌ Delete backups without verification
- ❌ Commit .env to git
- ❌ Ignore health check warnings
- ❌ Skip backups "just this once"
- ❌ Run random docker commands without understanding
- ❌ Change multiple things at once

---

## Additional Resources

- **Project README:** `README.md`
- **Environment Setup:** `.env.example`
- **Deployment Guide:** `DEPLOYMENT.md`
- **Docker Compose Reference:** `docker-compose.yml`
- **Bootstrap Script:** `bootstrap-homelab.sh`
- **Homelab CLI:** `./homelab help`

---

## Getting Help

If you're stuck:

1. **Check this guide** for common solutions
2. **Run diagnostics:** `./homelab debug`
3. **Check logs:** `./homelab logs`
4. **Search error messages** in project docs
5. **Check GitHub issues** for similar problems

---

*Last updated: 2025-11-23*
*For questions or updates, refer to project documentation or GitHub repository.*
