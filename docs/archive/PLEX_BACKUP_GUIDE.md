# Plex Server Backup and Restore Guide

Comprehensive guide for backing up and restoring your Plex Media Server configuration, metadata, and watch history.

## Table of Contents
- [Understanding Plex Data](#understanding-plex-data)
- [Backup Procedures](#backup-procedures)
- [Automated Backup Script](#automated-backup-script)
- [Restore Procedures](#restore-procedures)
- [Migration to New Server](#migration-to-new-server)
- [Backup Verification](#backup-verification)
- [Scheduling and Automation](#scheduling-and-automation)
- [External Storage](#external-storage)

## Understanding Plex Data

### Critical Plex Files and Directories

Your Plex configuration is stored in: `./services/plex/config/Library/Application Support/Plex Media Server/`

#### Database Files (Critical - Must Backup)
- **`Plug-in Support/Databases/com.plexapp.plugins.library.db`** - Main library database
  - Contains all metadata, watch history, collections, playlists
  - This is the most critical file to backup
  - Size: Varies (typically 100MB-10GB depending on library size)

- **`Plug-in Support/Databases/com.plexapp.plugins.library.blobs.db`** - Binary large objects
  - Stores thumbnails, previews, and other binary data
  - Important for quick loading

#### Metadata and Posters
- **`Metadata/`** - Downloaded metadata, artwork, and thumbnails
  - Can be regenerated but takes time
  - Backing up saves hours of re-downloading
  
- **`Media/localhost/`** - Custom artwork and posters you've uploaded
  - Cannot be regenerated - backup is essential if you have custom art

#### Configuration Files
- **`Preferences.xml`** - Server settings and preferences
  - Port numbers, transcoding settings, library paths
  - Small file but critical for restore

- **`Plug-in Support/Preferences/`** - Plugin-specific preferences
  - Agent settings, scanner preferences

#### Watch History and User Data
- **Database contains:**
  - User watch progress and history
  - Ratings and reviews
  - Continue watching positions
  - Collections and playlists
  - Custom library sections

#### Logs (Optional)
- **`Logs/`** - Server logs
  - Useful for troubleshooting
  - Not required for restore but helpful for debugging

### What NOT to Backup
- **`Cache/`** - Temporary cache files (regenerated automatically)
- **`Crash Reports/`** - Not needed for restore
- **`Updates/`** - Update files (re-downloaded as needed)
- **Media files themselves** - Your actual movies/TV shows should have their own backup strategy

## Backup Procedures

### Method 1: Automated Script (Recommended)

The automated backup script `deployment/backup-plex.sh` handles all aspects of Plex backup:

```bash
# Run manual backup
./deployment/backup-plex.sh

# The script will:
# 1. Stop Plex gracefully
# 2. Backup database files
# 3. Backup configuration
# 4. Backup metadata and artwork
# 5. Verify backup integrity
# 6. Restart Plex
# 7. Create retention-managed snapshots
```

**What it backs up:**
- ✅ Main library database
- ✅ Blobs database
- ✅ Preferences.xml
- ✅ Plugin preferences
- ✅ Custom artwork and posters
- ✅ Metadata cache (optional)

**Backup locations:**
- Daily backups: `/home/evin/contain/backups/plex/daily/`
- Weekly backups: `/home/evin/contain/backups/plex/weekly/`
- Retention: 7 daily, 4 weekly

### Method 2: Manual Backup

#### Step 1: Stop Plex Container
```bash
# Stop Plex to ensure database consistency
docker stop plex-server

# Wait for graceful shutdown (10-30 seconds)
sleep 15
```

#### Step 2: Backup Database Files
```bash
# Create backup directory
BACKUP_DIR="/home/evin/contain/backups/plex/manual/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup main database
cp -p "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
   "$BACKUP_DIR/"

# Backup blobs database
cp -p "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.blobs.db" \
   "$BACKUP_DIR/"

# Backup WAL files (if they exist)
cp -p "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/"*.db-wal \
   "$BACKUP_DIR/" 2>/dev/null || true
cp -p "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/"*.db-shm \
   "$BACKUP_DIR/" 2>/dev/null || true
```

#### Step 3: Backup Preferences and Configuration
```bash
# Backup main preferences
cp -p "./services/plex/config/Library/Application Support/Plex Media Server/Preferences.xml" \
   "$BACKUP_DIR/"

# Backup plugin preferences
cp -rp "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Preferences/" \
   "$BACKUP_DIR/Preferences/"

# Backup metadata combinations
cp -rp "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Metadata Combination/" \
   "$BACKUP_DIR/Metadata_Combination/"
```

#### Step 4: Backup Metadata and Artwork (Optional but Recommended)
```bash
# This can be large (several GB) but saves hours of re-downloading

# Backup metadata
tar -czf "$BACKUP_DIR/metadata.tar.gz" \
   -C "./services/plex/config/Library/Application Support/Plex Media Server" \
   Metadata/

# Backup custom artwork
tar -czf "$BACKUP_DIR/media.tar.gz" \
   -C "./services/plex/config/Library/Application Support/Plex Media Server" \
   Media/
```

#### Step 5: Create Backup Manifest
```bash
# Create file listing and checksums
cat > "$BACKUP_DIR/manifest.txt" <<EOF
Backup Date: $(date)
Plex Version: $(docker exec plex-server cat /usr/lib/plexmediaserver/lib/plexmediaserver.so | strings | grep "Plex Media Server v" | head -1)

Files in backup:
$(ls -lh "$BACKUP_DIR")

Checksums:
$(md5sum "$BACKUP_DIR"/*.db 2>/dev/null)
EOF

chmod 600 "$BACKUP_DIR"/*
```

#### Step 6: Restart Plex
```bash
docker start plex-server

# Wait for Plex to be ready
sleep 10

# Check health
curl -f http://localhost:32400/identity || echo "Plex not responding yet"
```

### Method 3: Hot Backup (No Downtime)

For minimal downtime, use SQLite's backup API:

```bash
# Create backup directory
BACKUP_DIR="/home/evin/contain/backups/plex/hot/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Hot backup using sqlite3
docker exec plex-server sqlite3 \
  "/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  ".backup '/tmp/library_backup.db'"

# Copy backup out of container
docker cp plex-server:/tmp/library_backup.db "$BACKUP_DIR/com.plexapp.plugins.library.db"

# Cleanup temp file
docker exec plex-server rm /tmp/library_backup.db

# Same for blobs
docker exec plex-server sqlite3 \
  "/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.blobs.db" \
  ".backup '/tmp/blobs_backup.db'"

docker cp plex-server:/tmp/blobs_backup.db "$BACKUP_DIR/com.plexapp.plugins.library.blobs.db"
docker exec plex-server rm /tmp/blobs_backup.db

# Copy preferences (safe while running)
docker cp "plex-server:/config/Library/Application Support/Plex Media Server/Preferences.xml" \
  "$BACKUP_DIR/Preferences.xml"
```

## Automated Backup Script

The automated backup script handles all backup procedures with proper error handling and verification.

### Features
- ✅ Graceful Plex shutdown
- ✅ Database consistency checks
- ✅ Incremental metadata backup
- ✅ Backup verification
- ✅ Automatic retention management
- ✅ Email notifications (optional)
- ✅ Compression for space efficiency
- ✅ Backup integrity testing

### Usage
```bash
# Run backup manually
./deployment/backup-plex.sh

# Run with custom backup location
BACKUP_ROOT=/mnt/external/plex-backups ./deployment/backup-plex.sh

# Verify only (no backup)
./deployment/backup-plex.sh --verify-only

# Full backup including metadata (slower)
./deployment/backup-plex.sh --full
```

### Script Configuration
Edit the script to customize:
```bash
BACKUP_ROOT="/home/evin/contain/backups/plex"  # Backup location
RETAIN_DAILY=7                                   # Days to keep daily backups
RETAIN_WEEKLY=4                                  # Weeks to keep weekly backups
INCLUDE_METADATA=true                            # Backup metadata (slower, larger)
VERIFY_BACKUP=true                               # Verify after backup
```

## Restore Procedures

### Full Restore (Same Server)

#### Step 1: Stop Plex
```bash
docker stop plex-server
```

#### Step 2: Backup Current State (Just in Case)
```bash
mv "./services/plex/config" "./services/plex/config.old.$(date +%Y%m%d)"
mkdir -p "./services/plex/config"
```

#### Step 3: Restore Database Files
```bash
# Set backup directory
RESTORE_FROM="/home/evin/contain/backups/plex/daily/20250115_120000"

# Restore databases
mkdir -p "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases"
cp "$RESTORE_FROM/com.plexapp.plugins.library.db" \
   "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/"
cp "$RESTORE_FROM/com.plexapp.plugins.library.blobs.db" \
   "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/"

# Restore preferences
cp "$RESTORE_FROM/Preferences.xml" \
   "./services/plex/config/Library/Application Support/Plex Media Server/"

# Restore plugin preferences
cp -r "$RESTORE_FROM/Preferences/" \
   "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Preferences/"
```

#### Step 4: Restore Metadata (Optional)
```bash
# Extract metadata if backed up
if [ -f "$RESTORE_FROM/metadata.tar.gz" ]; then
    tar -xzf "$RESTORE_FROM/metadata.tar.gz" \
       -C "./services/plex/config/Library/Application Support/Plex Media Server"
fi

# Extract custom artwork
if [ -f "$RESTORE_FROM/media.tar.gz" ]; then
    tar -xzf "$RESTORE_FROM/media.tar.gz" \
       -C "./services/plex/config/Library/Application Support/Plex Media Server"
fi
```

#### Step 5: Fix Permissions
```bash
# Ensure correct ownership
chown -R 1000:1000 "./services/plex/config"
chmod -R 755 "./services/plex/config"
chmod 600 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/"*.db
```

#### Step 6: Start Plex and Verify
```bash
# Start container
docker start plex-server

# Wait for startup
sleep 30

# Check health
curl http://localhost:32400/identity

# Check logs
docker logs plex-server --tail 100

# Access web UI
# Navigate to http://localhost:32400/web
```

### Restore to New Server (Migration)

#### Pre-Migration Checklist
- [ ] Backup current server
- [ ] Note Plex claim token (if needed)
- [ ] Document library paths
- [ ] Export custom collections/playlists
- [ ] Note server settings (transcoding, network, etc.)

#### Step 1: Prepare New Server
```bash
# On new server, ensure same directory structure
mkdir -p ./services/plex/{config,transcode,media}

# If media is on different paths, note them for later adjustment
```

#### Step 2: Transfer Backup Files
```bash
# From old server
BACKUP_FILE="plex_backup_$(date +%Y%m%d).tar.gz"
tar -czf "$BACKUP_FILE" \
   -C "./services/plex/config/Library/Application Support/Plex Media Server" \
   "Plug-in Support/Databases" "Preferences.xml" "Plug-in Support/Preferences"

# Copy to new server (via scp, rsync, or external drive)
scp "$BACKUP_FILE" newserver:/home/evin/contain/
```

#### Step 3: Restore on New Server
```bash
# Extract on new server
tar -xzf "$BACKUP_FILE" \
   -C "./services/plex/config/Library/Application Support/Plex Media Server"

# Fix ownership
chown -R 1000:1000 "./services/plex/config"
```

#### Step 4: Update Preferences.xml for New Server

Edit `./services/plex/config/Library/Application Support/Plex Media Server/Preferences.xml`:

```xml
<!-- Update these if changed: -->
<!-- Server IP/hostname -->
<!-- Library paths (if different) -->
<!-- Port numbers (if different) -->

<!-- Example: Update library paths -->
<!-- Find and replace old paths with new paths -->
```

Or use sed:
```bash
# Update media paths
sed -i 's|/old/media/path|/new/media/path|g' \
   "./services/plex/config/Library/Application Support/Plex Media Server/Preferences.xml"
```

#### Step 5: Update Database Library Paths

If your media files are in different locations:

```bash
# Backup database before modification
cp "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
   "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db.backup"

# Update paths in database
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  "UPDATE section_locations SET root_path = REPLACE(root_path, '/old/path', '/new/path');"
```

#### Step 6: Start and Verify
```bash
# Start Plex
docker-compose up -d plex

# Monitor startup
docker logs -f plex-server

# Should see:
# "Plex Media Server v..."
# "Starting Plex Media Server"
# No database errors
```

#### Step 7: Reclaim Server (If Needed)

If server shows as "unclaimed":
1. Get claim token from https://plex.tv/claim
2. Add to docker-compose.yml: `PLEX_CLAIM=${PLEX_CLAIM_TOKEN}`
3. Restart container

## Backup Verification

### Database Integrity Check
```bash
# Check main database
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  "PRAGMA integrity_check;"

# Should return: ok

# Check blobs database
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.blobs.db" \
  "PRAGMA integrity_check;"
```

### Backup Content Verification
```bash
# List backup contents
ls -lh /home/evin/contain/backups/plex/daily/latest/

# Check database file size (should be > 1MB for active library)
du -h /home/evin/contain/backups/plex/daily/latest/*.db

# Verify checksums
md5sum /home/evin/contain/backups/plex/daily/latest/*.db
```

### Test Restore (Non-Destructive)
```bash
# Create test directory
TEST_DIR="/tmp/plex-restore-test-$(date +%s)"
mkdir -p "$TEST_DIR"

# Copy backup
cp -r /home/evin/contain/backups/plex/daily/latest/* "$TEST_DIR/"

# Test database can be opened
sqlite3 "$TEST_DIR/com.plexapp.plugins.library.db" "SELECT COUNT(*) FROM metadata_items;"

# Cleanup
rm -rf "$TEST_DIR"
```

## Scheduling and Automation

### Using Systemd Timer (Recommended)

The backup script includes systemd timer files for automatic scheduling.

#### Install Timer
```bash
# Copy timer files
sudo cp deployment/backup-plex.timer /etc/systemd/system/
sudo cp deployment/backup-plex.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start timer
sudo systemctl enable backup-plex.timer
sudo systemctl start backup-plex.timer

# Check timer status
sudo systemctl status backup-plex.timer
sudo systemctl list-timers backup-plex.timer
```

#### Default Schedule
- **Daily**: 2:00 AM (when Plex usage is typically lowest)
- **Weekly**: Sunday 2:00 AM (full backup with metadata)

#### View Backup Logs
```bash
# View service logs
sudo journalctl -u backup-plex.service -n 100

# Follow backup in real-time
sudo journalctl -u backup-plex.service -f
```

### Using Cron

```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /home/evin/contain/HomeLabHub/deployment/backup-plex.sh >> /home/evin/contain/backups/plex/backup.log 2>&1

# Add weekly full backup on Sunday at 3 AM
0 3 * * 0 /home/evin/contain/HomeLabHub/deployment/backup-plex.sh --full >> /home/evin/contain/backups/plex/backup.log 2>&1
```

## External Storage

### Backup to External Drive

```bash
# Mount external drive
sudo mount /dev/sdb1 /mnt/external

# Create backup directory
mkdir -p /mnt/external/plex-backups

# Run backup to external location
BACKUP_ROOT=/mnt/external/plex-backups ./deployment/backup-plex.sh

# Unmount when done
sudo umount /mnt/external
```

### Backup to Network Storage (NFS/SMB)

```bash
# Mount network share
sudo mkdir -p /mnt/nas/plex-backups
sudo mount -t nfs nas.local:/backups/plex /mnt/nas/plex-backups

# Run backup
BACKUP_ROOT=/mnt/nas/plex-backups ./deployment/backup-plex.sh

# Add to /etc/fstab for persistent mount
echo "nas.local:/backups/plex /mnt/nas/plex-backups nfs defaults 0 0" | sudo tee -a /etc/fstab
```

### Backup to Cloud Storage (S3/MinIO)

```bash
# Install MinIO client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/

# Configure MinIO
mc alias set homelab http://localhost:9000 admin your_password

# Sync backups to MinIO
mc mirror /home/evin/contain/backups/plex homelab/plex-backups

# Automate with cron
0 4 * * * mc mirror /home/evin/contain/backups/plex homelab/plex-backups --overwrite
```

### Backup to Rsync Server

```bash
# Rsync to remote server
rsync -avz --delete \
  /home/evin/contain/backups/plex/ \
  user@backup-server:/backups/plex/

# With SSH key
rsync -avz --delete -e "ssh -i ~/.ssh/backup_key" \
  /home/evin/contain/backups/plex/ \
  user@backup-server:/backups/plex/
```

## Recovery Scenarios

### Scenario 1: Corrupted Database
```bash
# Stop Plex
docker stop plex-server

# Restore from latest backup
LATEST_BACKUP=$(ls -t /home/evin/contain/backups/plex/daily/ | head -1)
cp "/home/evin/contain/backups/plex/daily/$LATEST_BACKUP/"*.db \
   "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/"

# Start Plex
docker start plex-server
```

### Scenario 2: Lost Custom Artwork
```bash
# Restore media folder from backup
LATEST_BACKUP=$(ls -t /home/evin/contain/backups/plex/daily/ | head -1)
tar -xzf "/home/evin/contain/backups/plex/daily/$LATEST_BACKUP/media.tar.gz" \
   -C "./services/plex/config/Library/Application Support/Plex Media Server"
```

### Scenario 3: Server Migration
Follow "Restore to New Server" section above.

### Scenario 4: Watch History Recovery Only
```bash
# Export watch history from backup
sqlite3 /path/to/backup/com.plexapp.plugins.library.db \
  "SELECT * FROM metadata_item_settings;" > watch_history.sql

# Import to current database
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  < watch_history.sql
```

## Best Practices

1. **Backup Frequency**
   - Daily: Database and preferences (small, fast)
   - Weekly: Full backup including metadata (larger, slower)
   - Before updates: Always backup before Plex updates

2. **Retention Policy**
   - Keep 7 daily backups
   - Keep 4 weekly backups
   - Keep 1 monthly backup for 6 months
   - Store critical backups offsite

3. **Testing**
   - Test restore procedure quarterly
   - Verify backup integrity weekly
   - Document recovery time objectives

4. **Monitoring**
   - Monitor backup success/failure
   - Check backup storage space
   - Alert on backup failures

5. **Security**
   - Encrypt backups containing user data
   - Restrict backup file permissions (chmod 600)
   - Secure backup storage locations

## Troubleshooting

### Backup Script Fails
```bash
# Check disk space
df -h

# Check Plex is running
docker ps | grep plex

# Check permissions
ls -la ./services/plex/config

# Check logs
tail -100 /home/evin/contain/backups/plex/backup.log
```

### Database Locked Error
```bash
# Stop Plex completely
docker stop plex-server

# Wait for database to close
sleep 10

# Try backup again
./deployment/backup-plex.sh
```

### Restore Doesn't Show Libraries
- Check library paths in Preferences.xml
- Verify media files are accessible
- Check database integrity
- Restart Plex container

### Missing Watch History After Restore
- Verify backup includes database
- Check metadata_item_settings table exists
- Ensure user accounts match

## Additional Resources

- [Official Plex Backup Guide](https://support.plex.tv/articles/201539237-backing-up-plex-media-server-data/)
- [Plex Database Structure](https://support.plex.tv/articles/202915258-where-is-the-plex-media-server-data-directory-located/)
- [Plex Forums - Backup Discussion](https://forums.plex.tv/)

## Quick Reference

```bash
# Backup
./deployment/backup-plex.sh

# Restore
docker stop plex-server
cp /backup/path/*.db ./services/plex/config/.../Databases/
docker start plex-server

# Verify
sqlite3 library.db "PRAGMA integrity_check;"

# Check backup age
ls -lt /home/evin/contain/backups/plex/daily/
```
