# Discord Bot Database Management Scripts

This directory contains utility scripts for managing the Discord bot's ticket database.

## Available Scripts

### 🔄 reset-tickets.sh
**Purpose**: Safely reset all ticket data while preserving configuration

**What it does**:
1. ✅ Creates a timestamped SQL backup of all ticket data
2. ✅ Deletes all tickets, messages, resolutions, and audit logs
3. ✅ Resets auto-increment sequences to start from 1
4. ✅ Preserves bot settings, categories, and panel configurations
5. ✅ Restarts the Discord bot

**Usage**:
```bash
cd /path/to/HomeLabHub
bash services/discord-bot/scripts/reset-tickets.sh
```

**Interactive Prompts**:
- The script will ask for confirmation before deleting data
- Type `yes` to proceed or `no` to cancel

**What's Preserved**:
- ✓ Ticket categories
- ✓ Bot settings
- ✓ Panel settings and templates
- ✓ Server configurations
- ✓ Developer permissions
- ✓ Stream notification settings

**What's Deleted**:
- ✗ All tickets
- ✗ All ticket messages
- ✗ All ticket resolutions
- ✗ All ticket audit logs
- ✗ Interaction locks (temporary data)

---

### 📦 restore-tickets.sh
**Purpose**: Restore ticket data from a previous backup

**What it does**:
1. ✅ Lists all available backups with file sizes
2. ✅ Prompts you to select a backup file
3. ✅ Restores the backup to the database
4. ✅ Restarts the Discord bot

**Usage**:
```bash
cd /path/to/HomeLabHub
bash services/discord-bot/scripts/restore-tickets.sh
```

**Interactive Prompts**:
- Select backup file from the list
- Confirm restoration (type `yes` to proceed)

**Warning**: This will overwrite current ticket data!

---

## Backup Location

All backups are stored in:
```
/path/to/HomeLabHub/backups/discord-tickets/
```

Backup filename format:
```
tickets_backup_YYYYMMDD_HHMMSS.sql
```

Example:
```
tickets_backup_20251119_143022.sql
```

---

## Prerequisites

Before running these scripts, ensure:

1. ✅ Docker and docker-compose are installed
2. ✅ The `discord-bot-db` container is running
3. ✅ You have sufficient disk space for backups
4. ✅ You run the scripts from the project root or scripts directory

**Check if database is running**:
```bash
docker ps | grep discord-bot-db
```

**Start the database if needed**:
```bash
docker-compose -f docker-compose.unified.yml up -d discord-bot-db
```

---

## Common Use Cases

### 🔧 Testing/Development Reset
Clean slate for testing new features:
```bash
bash services/discord-bot/scripts/reset-tickets.sh
# Confirms backup is created
# Type 'yes' to reset
```

### 🚨 Emergency Restore
Recover from accidental deletion:
```bash
bash services/discord-bot/scripts/restore-tickets.sh
# Select the most recent backup
# Type 'yes' to restore
```

### 📅 Regular Maintenance
Archive old tickets and start fresh:
```bash
# 1. Reset (creates backup automatically)
bash services/discord-bot/scripts/reset-tickets.sh

# 2. Optional: Move old backups to archive
mkdir -p backups/discord-tickets/archive
mv backups/discord-tickets/tickets_backup_2025*.sql backups/discord-tickets/archive/
```

---

## Database Schema

The scripts operate on these tables:

**Deleted on Reset**:
- `tickets` - Main ticket records
- `ticket_messages` - All messages in tickets
- `ticket_resolutions` - Resolution records
- `ticket_audit_log` - Action history
- `interaction_locks` - Temporary locks

**Preserved**:
- `ticket_categories` - Support categories
- `bot_settings` - Bot configuration
- `ticket_panel_settings` - Panel customization
- `ticket_panel_categories` - Panel category settings
- `panel_templates` - Saved templates
- `servers` - Server records
- `discord_users` - User records
- `developers` - Developer access
- `stream_notification_settings` - Stream notifications

---

## Troubleshooting

### Error: "discord-bot-db container is not running"
**Solution**:
```bash
docker-compose -f docker-compose.unified.yml up -d discord-bot-db
```

### Error: "No backups found"
**Solution**:
- Run `reset-tickets.sh` first to create a backup
- Or manually create backups directory:
  ```bash
  mkdir -p backups/discord-tickets
  ```

### Error: "Backup file not found"
**Solution**:
- Check the filename (case-sensitive)
- Verify the file exists:
  ```bash
  ls -lh backups/discord-tickets/
  ```

### Restore fails with SQL errors
**Solution**:
- Ensure backup was created from the same schema version
- Check PostgreSQL logs:
  ```bash
  docker logs discord-bot-db
  ```

---

## Safety Features

✅ **Automatic Backups**: Reset script always creates a backup before deletion  
✅ **Confirmation Prompts**: Both scripts require explicit `yes` confirmation  
✅ **Timestamp Backups**: Each backup has a unique timestamp  
✅ **Preserved Config**: All settings and configurations remain intact  
✅ **Transaction Safety**: Uses PostgreSQL session replication role for safe deletion  

---

## Manual Database Access

For advanced operations:

```bash
# Connect to PostgreSQL
docker exec -it discord-bot-db psql -U postgres -d discord

# List all tables
\dt

# View ticket count
SELECT COUNT(*) FROM tickets;

# Exit
\q
```

---

## Backup Management

### View Backup Sizes
```bash
du -h backups/discord-tickets/*.sql
```

### Delete Old Backups (older than 30 days)
```bash
find backups/discord-tickets/ -name "tickets_backup_*.sql" -mtime +30 -delete
```

### Create Manual Backup
```bash
docker exec discord-bot-db pg_dump -U postgres -d discord \
  --table=tickets \
  --table=ticket_messages \
  --table=ticket_resolutions \
  --table=ticket_audit_log \
  > backups/discord-tickets/manual_backup_$(date +%Y%m%d_%H%M%S).sql
```

---

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review PostgreSQL logs: `docker logs discord-bot-db`
3. Review bot logs: `docker logs discord-bot`
4. Contact the development team

---

**Last Updated**: November 19, 2025  
**Script Version**: 1.0.0
