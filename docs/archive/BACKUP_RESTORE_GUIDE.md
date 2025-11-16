# Homelab Backup & Restore Guide

Complete guide for backing up and restoring your homelab infrastructure.

## Table of Contents

1. [Overview](#overview)
2. [Backup System Architecture](#backup-system-architecture)
3. [Automated Backups](#automated-backups)
4. [Manual Backups](#manual-backups)
5. [Restore Procedures](#restore-procedures)
6. [Disaster Recovery](#disaster-recovery)
7. [Secret Management](#secret-management)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This homelab implements a comprehensive 3-2-1 backup strategy:
- **3** copies of your data
- **2** different storage media
- **1** off-site backup

### What Gets Backed Up

1. **Databases** (PostgreSQL)
   - `ticketbot` - Discord Bot database
   - `streambot` - Stream Bot database  
   - `homelab_jarvis` - Dashboard database

2. **Configuration Files**
   - `.env` files (encrypted)
   - `docker-compose.unified.yml`
   - `Caddyfile`
   - Service-specific configs

3. **Service Data**
   - MinIO object storage
   - n8n workflows
   - Home Assistant configurations
   - Redis persistence (optional)

### Backup Locations

```
/home/evin/contain/backups/
├── database/
│   ├── daily/          # Last 7 daily backups
│   ├── weekly/         # Last 4 weekly backups
│   ├── backup.log      # Backup execution log
│   └── status.txt      # Latest backup status
├── config/             # Configuration backups
│   ├── config_TIMESTAMP.tar.gz
│   └── RESTORE_INSTRUCTIONS.txt
└── services/           # Service-specific backups
    ├── minio/
    ├── n8n/
    └── homeassistant/
```

---

## Backup System Architecture

### Components

1. **backup-databases.sh** - PostgreSQL backup script
   - Dumps all databases
   - Compresses with gzip
   - Verifies backup integrity
   - Implements retention policy
   - Logs all operations

2. **backup-configs.sh** - Configuration backup script
   - Encrypts .env files
   - Archives configuration files
   - Compresses entire backup
   - Cleans old backups

3. **restore-database.sh** - Database restore script
   - Lists available backups
   - Creates safety backup before restore
   - Restores from compressed backup
   - Verifies restoration

4. **Systemd Timer** - Automated scheduling
   - Runs daily at 3:00 AM
   - 15-minute random delay
   - Persistent across reboots

---

## Automated Backups

### Setup Systemd Timer (Production Deployment)

**Important:** This is for production deployment on your own server, NOT for Replit environment.

1. **Copy systemd files to system directory:**

```bash
sudo cp deployment/backup-systemd.service /etc/systemd/system/homelab-backup.service
sudo cp deployment/backup-systemd.timer /etc/systemd/system/homelab-backup.timer
```

2. **Reload systemd daemon:**

```bash
sudo systemctl daemon-reload
```

3. **Enable and start the timer:**

```bash
sudo systemctl enable homelab-backup.timer
sudo systemctl start homelab-backup.timer
```

4. **Verify timer is active:**

```bash
sudo systemctl status homelab-backup.timer
sudo systemctl list-timers | grep homelab
```

5. **View backup logs:**

```bash
sudo journalctl -u homelab-backup.service -f
```

### Backup Schedule

- **Daily Backups**: 3:00 AM (with 15-minute random delay)
- **Weekly Backups**: Sunday backups are copied to weekly storage
- **Retention**:
  - Daily: 7 days
  - Weekly: 4 weeks

### Disable Automated Backups

```bash
sudo systemctl stop homelab-backup.timer
sudo systemctl disable homelab-backup.timer
```

---

## Manual Backups

### Database Backup

**Backup all databases:**

```bash
cd /home/evin/contain/HomeLabHub
./deployment/backup-databases.sh
```

**Backup specific database:**

```bash
# Edit the script or use Docker directly
docker exec -e PGPASSWORD="your_password" discord-bot-db \
    pg_dump -U ticketbot -d ticketbot --no-owner --no-acl | \
    gzip -9 > /tmp/ticketbot_manual_$(date +%Y%m%d).sql.gz
```

### Configuration Backup

**Backup all configurations:**

```bash
cd /home/evin/contain/HomeLabHub
./deployment/backup-configs.sh
```

**Backup specific .env file:**

```bash
# Encrypt .env file
openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in .env \
    -out /tmp/env_backup_$(date +%Y%m%d).encrypted \
    -pass pass:"homelab-backup-$(date +%Y)"
```

### Service Data Backups

**MinIO Data:**

```bash
# Create MinIO backup directory
mkdir -p /home/evin/contain/backups/services/minio

# Backup MinIO data (requires MinIO running)
docker run --rm \
    --volumes-from homelab-minio \
    -v /home/evin/contain/backups/services/minio:/backup \
    alpine tar czf /backup/minio_$(date +%Y%m%d).tar.gz /data
```

**n8n Workflows:**

```bash
# Create n8n backup directory
mkdir -p /home/evin/contain/backups/services/n8n

# Backup n8n data
docker run --rm \
    --volumes-from n8n \
    -v /home/evin/contain/backups/services/n8n:/backup \
    alpine tar czf /backup/n8n_$(date +%Y%m%d).tar.gz /home/node/.n8n
```

**Home Assistant:**

```bash
# Create Home Assistant backup directory
mkdir -p /home/evin/contain/backups/services/homeassistant

# Backup Home Assistant config
docker run --rm \
    --volumes-from homeassistant \
    -v /home/evin/contain/backups/services/homeassistant:/backup \
    alpine tar czf /backup/homeassistant_$(date +%Y%m%d).tar.gz /config
```

---

## Restore Procedures

### Database Restore

**List available backups:**

```bash
cd /home/evin/contain/HomeLabHub
./deployment/restore-database.sh ticketbot --list
```

**Restore latest backup:**

```bash
./deployment/restore-database.sh ticketbot
```

**Restore specific backup:**

```bash
./deployment/restore-database.sh ticketbot /home/evin/contain/backups/database/daily/ticketbot_20250115_030000.sql.gz
```

**Manual restore (if script unavailable):**

```bash
# 1. Get database password from .env
DB_PASSWORD=$(grep "^DISCORD_DB_PASSWORD=" .env | cut -d'=' -f2)

# 2. Restore from backup
gunzip -c /path/to/backup.sql.gz | \
    docker exec -i -e PGPASSWORD="${DB_PASSWORD}" discord-bot-db \
    psql -U ticketbot -d ticketbot
```

### Configuration Restore

**Extract configuration backup:**

```bash
cd /home/evin/contain/backups/config
tar -xzf config_TIMESTAMP.tar.gz
cd TIMESTAMP
```

**Decrypt .env files:**

```bash
# Decrypt main .env
openssl enc -aes-256-cbc -d -pbkdf2 \
    -in .env.encrypted \
    -out .env \
    -pass pass:"homelab-backup-$(date +%Y)"

# Decrypt service-specific .env files
openssl enc -aes-256-cbc -d -pbkdf2 \
    -in dashboard.env.encrypted \
    -out dashboard.env \
    -pass pass:"homelab-backup-$(date +%Y)"
```

**Restore configuration files:**

```bash
# Copy files back to project
cp .env /home/evin/contain/HomeLabHub/
cp docker-compose.unified.yml /home/evin/contain/HomeLabHub/
cp Caddyfile /home/evin/contain/HomeLabHub/
cp -r service-configs/config /home/evin/contain/HomeLabHub/

# Restart services
cd /home/evin/contain/HomeLabHub
docker-compose -f docker-compose.unified.yml restart
```

### Service Data Restore

**Restore MinIO data:**

```bash
# Stop MinIO
docker stop homelab-minio

# Restore data
docker run --rm \
    --volumes-from homelab-minio \
    -v /home/evin/contain/backups/services/minio:/backup \
    alpine sh -c "cd / && tar xzf /backup/minio_DATE.tar.gz"

# Start MinIO
docker start homelab-minio
```

**Restore n8n workflows:**

```bash
# Stop n8n
docker stop n8n

# Restore workflows
docker run --rm \
    --volumes-from n8n \
    -v /home/evin/contain/backups/services/n8n:/backup \
    alpine sh -c "cd / && tar xzf /backup/n8n_DATE.tar.gz"

# Start n8n
docker start n8n
```

**Restore Home Assistant:**

```bash
# Stop Home Assistant
docker stop homeassistant

# Restore configuration
docker run --rm \
    --volumes-from homeassistant \
    -v /home/evin/contain/backups/services/homeassistant:/backup \
    alpine sh -c "cd / && tar xzf /backup/homeassistant_DATE.tar.gz"

# Start Home Assistant
docker start homeassistant
```

---

## Disaster Recovery

### Complete System Recovery

In case of complete system failure, follow these steps:

#### 1. Fresh Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker evin

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

#### 2. Restore Project Files

```bash
# Clone or copy project
mkdir -p /home/evin/contain
cd /home/evin/contain
git clone <your-repo-url> HomeLabHub
# OR restore from backup

cd HomeLabHub
```

#### 3. Restore Configuration Backups

```bash
# Extract latest config backup
cd /home/evin/contain/backups/config
tar -xzf $(ls -t config_*.tar.gz | head -1)

# Decrypt and restore .env files (see Configuration Restore section)
```

#### 4. Initialize Databases

```bash
# Start only the database first
docker-compose -f docker-compose.unified.yml up -d discord-bot-db

# Wait for database to be ready
sleep 30
```

#### 5. Restore Database Backups

```bash
# Restore all databases
./deployment/restore-database.sh ticketbot
./deployment/restore-database.sh streambot
./deployment/restore-database.sh homelab_jarvis
```

#### 6. Restore Service Data

```bash
# Restore MinIO, n8n, Home Assistant (see Service Data Restore section)
```

#### 7. Start All Services

```bash
# Start all services
docker-compose -f docker-compose.unified.yml up -d

# Verify all services are healthy
docker-compose -f docker-compose.unified.yml ps
```

#### 8. Setup Automated Backups

```bash
# Setup systemd timer (see Automated Backups section)
sudo cp deployment/backup-systemd.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable homelab-backup.timer
sudo systemctl start homelab-backup.timer
```

### Recovery Time Objectives (RTO)

- **Database Restore**: 5-15 minutes per database
- **Configuration Restore**: 5 minutes
- **Service Data Restore**: 10-30 minutes per service
- **Complete System Recovery**: 2-4 hours

### Recovery Point Objectives (RPO)

- **Database**: Maximum 24 hours data loss (daily backups)
- **Configuration**: Maximum 24 hours
- **Service Data**: Varies (manual backups recommended)

---

## Secret Management

### Required Secrets by Service

#### Core Secrets (CRITICAL)
```
DISCORD_DB_PASSWORD      # PostgreSQL ticketbot database
STREAMBOT_DB_PASSWORD    # PostgreSQL streambot database  
JARVIS_DB_PASSWORD       # PostgreSQL jarvis database
SESSION_SECRET           # Dashboard session encryption
DASHBOARD_API_KEY        # Dashboard API authentication
```

#### Discord Bot
```
DISCORD_BOT_TOKEN        # Discord bot authentication
DISCORD_CLIENT_ID        # Discord OAuth app ID
DISCORD_CLIENT_SECRET    # Discord OAuth secret
DISCORD_SESSION_SECRET   # Session encryption
```

#### Stream Bot
```
STREAMBOT_SESSION_SECRET # Session encryption
OPENAI_API_KEY           # OpenAI API access
TWITCH_CLIENT_ID         # Twitch integration
TWITCH_CLIENT_SECRET     # Twitch integration
```

#### Optional Services
```
YOUTUBE_CLIENT_ID        # YouTube integration
YOUTUBE_CLIENT_SECRET    # YouTube integration
PLEX_CLAIM               # Plex server setup (expires 4 min)
MINIO_ROOT_PASSWORD      # Object storage admin
VNC_PASSWORD             # VNC access
CODE_SERVER_PASSWORD     # Code-Server access
```

### Secret Generation

**Generate API Key:**
```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

**Generate Session Secret:**
```bash
python3 -c 'import secrets; print(secrets.token_hex(32))'
```

**Generate Database Password:**
```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(16))'
```

**Generate Random Password:**
```bash
openssl rand -base64 24
```

### Secret Rotation Schedule

**Recommended rotation periods:**

| Secret Type | Rotation Period | Priority |
|-------------|----------------|----------|
| API Keys & Tokens | 90 days | High |
| Session Secrets | 30 days | Medium |
| Database Passwords | 180 days | High |
| Service Passwords | 90 days | Medium |
| OAuth Secrets | 180 days | High |

### Secret Rotation Procedure

1. **Generate new secret** (use generation commands above)
2. **Update .env file** with new secret
3. **Create configuration backup** (to preserve old secrets temporarily)
4. **Restart affected services:**
   ```bash
   docker-compose -f docker-compose.unified.yml restart <service>
   ```
5. **Verify service functionality**
6. **Update external integrations** (Discord, Twitch, etc. if OAuth changed)
7. **Delete old backup** after verification (1 week)

### Secure Secret Storage Recommendations

**Use a password manager:**

1. **Bitwarden** (Open-source, self-hostable)
   - Store all secrets in secure notes
   - Enable 2FA
   - Use organization vault for team access

2. **1Password**
   - Use "Secure Notes" for environment variables
   - Enable Travel Mode for sensitive secrets
   - Share via vaults, not plaintext

3. **Pass** (Command-line)
   ```bash
   # Store secret
   pass insert homelab/discord_bot_token
   
   # Retrieve secret
   pass show homelab/discord_bot_token
   ```

4. **Age Encryption**
   ```bash
   # Encrypt .env file
   age -e -r <public_key> .env > .env.age
   
   # Decrypt .env file
   age -d -i <private_key> .env.age > .env
   ```

**Never:**
- Commit .env files to git
- Share secrets via email or chat
- Store secrets in plaintext on shared drives
- Use weak or predictable passwords

---

## Monitoring

### Check Backup Status

**View latest backup status:**
```bash
cat /home/evin/contain/backups/database/status.txt
```

**View backup logs:**
```bash
tail -100 /home/evin/contain/backups/database/backup.log
```

**Check backup disk usage:**
```bash
du -sh /home/evin/contain/backups/*
```

**List recent backups:**
```bash
# Database backups
ls -lht /home/evin/contain/backups/database/daily/ | head -10

# Configuration backups
ls -lht /home/evin/contain/backups/config/ | head -10
```

### Dashboard Monitoring

The homelab dashboard provides backup monitoring at `/monitoring`:

- **Last Backup Time**: Shows when last successful backup completed
- **Backup Status**: Success/failure indicator
- **Disk Usage**: Backup storage consumption
- **Backup Count**: Number of backups in retention
- **Failed Backups Alert**: Red alert if backup fails

### Email Alerts (Optional)

Configure email alerts for backup failures:

```bash
# Add to backup-databases.sh
send_email_alert() {
    echo "Backup failed on $(hostname)" | \
        mail -s "Homelab Backup Failure" your-email@example.com
}
```

---

## Troubleshooting

### Database Backup Failures

**Error: Container not running**
```bash
# Check container status
docker ps | grep discord-bot-db

# Start container
docker-compose -f docker-compose.unified.yml up -d discord-bot-db
```

**Error: Authentication failed**
```bash
# Verify password in .env
grep "DISCORD_DB_PASSWORD" .env

# Test database connection
docker exec -e PGPASSWORD="$(grep DISCORD_DB_PASSWORD .env | cut -d'=' -f2)" \
    discord-bot-db psql -U ticketbot -d ticketbot -c "SELECT 1;"
```

**Error: Disk space full**
```bash
# Check disk usage
df -h

# Clean old backups manually
rm /home/evin/contain/backups/database/daily/oldest_backup.sql.gz

# Or run cleanup
find /home/evin/contain/backups/database/daily/ -name "*.sql.gz" -mtime +7 -delete
```

### Configuration Restore Failures

**Error: Cannot decrypt .env file**
```bash
# Verify password (uses current year)
echo "homelab-backup-$(date +%Y)"

# Try previous year if backup is old
openssl enc -aes-256-cbc -d -pbkdf2 \
    -in .env.encrypted \
    -out .env \
    -pass pass:"homelab-backup-2024"
```

**Error: Corrupted backup archive**
```bash
# Test archive integrity
tar -tzf config_TIMESTAMP.tar.gz > /dev/null

# If corrupted, use previous backup
ls -lt /home/evin/contain/backups/config/
```

### Service Data Restore Failures

**Error: Volume not found**
```bash
# List Docker volumes
docker volume ls

# Recreate volume if missing
docker volume create minio_data
```

**Error: Permission denied**
```bash
# Fix ownership
sudo chown -R 1000:1000 /home/evin/contain/backups/

# Or run restore with sudo
sudo docker run --rm ...
```

### Systemd Timer Issues

**Timer not running**
```bash
# Check timer status
sudo systemctl status homelab-backup.timer

# Check for errors
sudo journalctl -u homelab-backup.timer -n 50

# Restart timer
sudo systemctl restart homelab-backup.timer
```

**Service failing**
```bash
# Check service logs
sudo journalctl -u homelab-backup.service -n 100

# Test script manually
cd /home/evin/contain/HomeLabHub
./deployment/backup-databases.sh
```

---

## Best Practices

### Backup Best Practices

1. **Test restores regularly** - Monthly test restores to verify backups work
2. **Monitor backup size** - Sudden size changes may indicate issues
3. **Keep multiple backup locations** - On-site and off-site copies
4. **Document recovery procedures** - Keep printed copy off-site
5. **Automate everything** - Manual backups are forgotten
6. **Verify backup integrity** - Use checksums and test restores
7. **Encrypt sensitive data** - All .env files should be encrypted

### Security Best Practices

1. **Rotate secrets regularly** - Follow rotation schedule
2. **Use strong passwords** - Minimum 24 characters, random
3. **Limit secret access** - Only necessary personnel
4. **Audit secret usage** - Review who has access
5. **Use secret management tools** - Bitwarden, 1Password, etc.
6. **Never commit secrets** - Use .gitignore for .env files
7. **Encrypt backups** - Especially off-site backups

### Monitoring Best Practices

1. **Check backup status daily** - Review dashboard
2. **Set up alerts** - Email/SMS for failures
3. **Track metrics** - Backup size, duration, success rate
4. **Review logs weekly** - Look for anomalies
5. **Test disaster recovery** - Quarterly full recovery test
6. **Document incidents** - Learn from failures

---

## Quick Reference

### Common Commands

```bash
# Backup all databases
./deployment/backup-databases.sh

# Backup configurations
./deployment/backup-configs.sh

# Restore database
./deployment/restore-database.sh <database>

# List backups
./deployment/restore-database.sh <database> --list

# Check backup status
cat /home/evin/contain/backups/database/status.txt

# View logs
tail -f /home/evin/contain/backups/database/backup.log

# Check disk usage
du -sh /home/evin/contain/backups/*
```

### Important Files

```
/home/evin/contain/HomeLabHub/
├── .env                              # Main environment file
├── deployment/
│   ├── backup-databases.sh           # Database backup script
│   ├── backup-configs.sh             # Config backup script
│   ├── restore-database.sh           # Database restore script
│   ├── backup-systemd.service        # Systemd service
│   └── backup-systemd.timer          # Systemd timer
├── .env.example                      # Environment template
└── BACKUP_RESTORE_GUIDE.md          # This file

/home/evin/contain/backups/
├── database/                         # Database backups
│   ├── daily/                        # 7 daily backups
│   ├── weekly/                       # 4 weekly backups
│   ├── backup.log                    # Backup log
│   └── status.txt                    # Latest status
└── config/                           # Config backups
    └── config_TIMESTAMP.tar.gz       # Archived configs
```

### Support

For issues or questions:
1. Check this guide
2. Review logs: `/home/evin/contain/backups/database/backup.log`
3. Check dashboard monitoring: `https://your-domain/monitoring`
4. Test scripts manually
5. Review Docker logs: `docker-compose logs`

---

**Last Updated:** 2025-11-15  
**Version:** 1.0
