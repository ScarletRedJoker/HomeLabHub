# Plex Media Server Maintenance Guide

Comprehensive guide for maintaining, optimizing, and troubleshooting your Plex Media Server.

## Table of Contents
- [Regular Maintenance Tasks](#regular-maintenance-tasks)
- [Database Optimization](#database-optimization)
- [Metadata Management](#metadata-management)
- [Transcoding Optimization](#transcoding-optimization)
- [Log Management](#log-management)
- [Update Procedures](#update-procedures)
- [Performance Tuning](#performance-tuning)
- [Troubleshooting](#troubleshooting)
- [Monitoring and Alerts](#monitoring-and-alerts)

## Regular Maintenance Tasks

### Daily Maintenance (Automated)
These tasks run automatically via systemd timers or cron:

✅ **Database Backup**
- Scheduled: 2:00 AM daily
- Retention: 7 days
- Location: `/home/evin/contain/backups/plex/daily/`

✅ **Log Rotation**
- Plex logs rotated automatically
- Keeps last 5 log files
- Compresses old logs

✅ **Cache Cleanup**
- Temporary transcoding files older than 7 days
- PhotoTranscoder cache cleanup
- Download cache cleanup

### Weekly Maintenance (Manual Check)

**Sunday Routine:**
1. Check backup completion
2. Review server health metrics
3. Check for Plex updates
4. Verify library scan status
5. Review storage space

```bash
# Weekly health check script
./deployment/plex-health-check.sh
```

### Monthly Maintenance

**First Sunday of Month:**
1. **Database Optimization** - Vacuum and reindex
2. **Metadata Refresh** - Refresh libraries for changes
3. **Storage Audit** - Review disk usage and cleanup
4. **Performance Review** - Check transcoding stats
5. **Security Update** - Apply Plex security patches

### Quarterly Maintenance

**Every 3 Months:**
1. **Full Database Backup** - Create offline backup
2. **Restore Test** - Verify backup integrity
3. **Performance Audit** - Review and optimize settings
4. **Library Cleanup** - Remove orphaned metadata
5. **Documentation Update** - Update notes and procedures

## Database Optimization

### Database Vacuum

Vacuuming reclaims space and optimizes the database structure.

#### Automated Vacuum (Recommended)
```bash
# Run database optimization script
./deployment/plex-db-optimize.sh

# This will:
# 1. Stop Plex gracefully
# 2. Backup database
# 3. Run VACUUM
# 4. Run ANALYZE
# 5. Verify integrity
# 6. Restart Plex
```

#### Manual Vacuum
```bash
# Stop Plex
docker stop plex-server

# Navigate to database directory
cd "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases"

# Backup first
cp com.plexapp.plugins.library.db com.plexapp.plugins.library.db.pre-vacuum

# Run vacuum
sqlite3 com.plexapp.plugins.library.db "VACUUM;"

# Run analyze to update statistics
sqlite3 com.plexapp.plugins.library.db "ANALYZE;"

# Verify integrity
sqlite3 com.plexapp.plugins.library.db "PRAGMA integrity_check;"

# Check size reduction
ls -lh com.plexapp.plugins.library.db*

# Restart Plex
docker start plex-server
```

**Expected Results:**
- Database size reduction: 10-30%
- Faster queries and library loading
- Improved metadata scanning
- Better overall performance

**Run vacuum when:**
- Database size > 5GB
- Adding/removing large amounts of content
- Performance degradation noticed
- After major library reorganization

### Database Integrity Check

```bash
# Quick integrity check (online)
docker exec plex-server sqlite3 \
  "/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  "PRAGMA quick_check;"

# Full integrity check (stop Plex first)
docker stop plex-server
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  "PRAGMA integrity_check;"
docker start plex-server

# Should return: ok
```

### Orphaned Metadata Cleanup

Remove metadata for deleted media files:

```bash
# Stop Plex
docker stop plex-server

# Backup database
cp "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
   "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db.backup"

# Remove orphaned entries (advanced - be careful)
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" <<EOF
DELETE FROM metadata_items WHERE id NOT IN (SELECT metadata_item_id FROM media_items);
DELETE FROM metadata_item_settings WHERE guid NOT IN (SELECT guid FROM metadata_items);
DELETE FROM metadata_item_views WHERE metadata_item_id NOT IN (SELECT id FROM metadata_items);
VACUUM;
EOF

# Restart Plex
docker start plex-server
```

## Metadata Management

### Refresh Library Metadata

```bash
# Via Web UI:
# Settings > Library > [Select Library] > Scan Library Files
# Settings > Library > [Select Library] > Refresh All Metadata

# Via Plex API (requires X-Plex-Token)
PLEX_TOKEN="your_plex_token"
SECTION_ID="1"  # Your library section ID

# Scan library
curl "http://localhost:32400/library/sections/${SECTION_ID}/refresh?X-Plex-Token=${PLEX_TOKEN}"

# Deep refresh (re-download all metadata)
curl "http://localhost:32400/library/sections/${SECTION_ID}/refresh?force=1&X-Plex-Token=${PLEX_TOKEN}"
```

### Clean Bundles (Remove Unused Metadata)

```bash
# Via Web UI:
# Settings > Troubleshooting > Clean Bundles
# This removes unused metadata and thumbnails

# Monitor during cleanup
docker logs -f plex-server

# Typical cleanup recovers 1-10GB depending on library size
```

### Optimize Database

```bash
# Via Web UI:
# Settings > Troubleshooting > Optimize Database

# This runs VACUUM and other optimizations
# Can take 10-60 minutes depending on database size
# Server remains available during optimization
```

### Thumbnail Regeneration

```bash
# Delete and regenerate thumbnails
docker stop plex-server

# Remove thumbnail caches
rm -rf "./services/plex/config/Library/Application Support/Plex Media Server/Cache/PhotoTranscoder/"*

# Restart Plex
docker start plex-server

# Thumbnails will regenerate on-demand
# May cause slower initial library browsing
```

## Transcoding Optimization

### Hardware Transcoding (GPU)

Your Plex server has GPU passthrough configured for hardware acceleration.

**Verify GPU Access:**
```bash
# Check GPU is accessible
docker exec plex-server ls -la /dev/dri

# Should show:
# drwxr-xr-x 2 root root ... /dev/dri
# crw-rw---- 1 root video ... renderD128
```

**Enable Hardware Transcoding:**
1. Settings > Transcoder
2. Check "Use hardware acceleration when available"
3. Select "Use hardware-accelerated video encoding"
4. Save changes

**Supported Codecs:**
- H.264 (AVC) - Encode/Decode
- HEVC (H.265) - Decode only (depends on GPU)
- MPEG-2 - Decode

**Benefits:**
- 3-5x faster transcoding
- Lower CPU usage (from 100% to <20%)
- More concurrent streams
- Lower power consumption

### Transcoding Quality Settings

**Settings > Transcoder:**

**Maximum Simultaneous Video Transcodes:**
- Recommended: `3` (with GPU)
- Without GPU: `1-2`
- Plex Pass: Unlimited option

**Transcoder Quality:**
- `Automatic` - Balanced (recommended)
- `Prefer higher speed encoding` - Faster, lower quality
- `Prefer higher quality encoding` - Slower, better quality

**Transcoder Default Throttle Buffer:**
- Default: `60` seconds
- Increase to `120` for buffering issues
- Decrease to `30` for faster starts

### Transcoding Temporary Directory

Fast storage is critical for transcoding performance.

**Current Configuration:**
```yaml
volumes:
  - ./services/plex/transcode:/transcode
```

**Optimization Options:**

**Option 1: Use tmpfs (RAM disk) - Best Performance**
```yaml
# In docker-compose.unified.yml
volumes:
  - ./services/plex/config:/config
  - ./services/plex/media:/media
tmpfs:
  - /transcode:size=8G,mode=1777  # 8GB RAM for transcoding
```

**Option 2: Use SSD Storage**
```bash
# Mount SSD
sudo mkdir -p /mnt/ssd/plex-transcode

# Update docker-compose.unified.yml
# - /mnt/ssd/plex-transcode:/transcode
```

**Option 3: Network Storage (Not Recommended)**
Avoid NFS/SMB for transcoding - causes stuttering and poor performance.

### Transcoding Resource Limits

**Configure in docker-compose.unified.yml:**
```yaml
plex:
  deploy:
    resources:
      limits:
        cpus: '4.0'        # Max 4 CPU cores
        memory: 8G         # Max 8GB RAM
      reservations:
        cpus: '1.0'        # Minimum 1 core
        memory: 2G         # Minimum 2GB
  devices:
    - /dev/dri:/dev/dri    # GPU access
```

**Recommended Resource Allocation:**
- **CPU**: 1 core per 1080p transcode, 2 cores per 4K
- **RAM**: 2GB base + 1GB per concurrent transcode
- **GPU**: Shared across all transcodes (much more efficient)

### Monitor Transcoding

**View Active Transcodes:**
```bash
# Via Plex dashboard
# http://localhost:32400/web/index.html#!/status

# Via API
curl "http://localhost:32400/status/sessions?X-Plex-Token=${PLEX_TOKEN}"

# Via logs
docker logs plex-server | grep -i transcode

# Check transcode directory size
du -sh ./services/plex/transcode/

# Monitor in real-time
watch -n 1 'docker stats plex-server --no-stream'
```

## Log Management

### Log Locations

**Inside Container:**
- `/config/Library/Application Support/Plex Media Server/Logs/`

**Host System:**
- `./services/plex/config/Library/Application Support/Plex Media Server/Logs/`

**Log Files:**
- `Plex Media Server.log` - Main server log
- `Plex Media Server.*.log` - Rotated logs (1-5)
- `PMS Plugin Logs/*.log` - Agent/plugin logs
- `Plex Tuner Service.log` - DVR logs (if using)

### Log Rotation

Plex automatically rotates logs:
- Keeps 5 historical logs
- Rotates when logs reach ~10MB
- Older logs are deleted automatically

**Manual log rotation:**
```bash
# Clear current logs (backup first!)
docker exec plex-server sh -c "cd '/config/Library/Application Support/Plex Media Server/Logs' && for log in *.log; do > \$log; done"

# Or rotate manually
docker exec plex-server sh -c "cd '/config/Library/Application Support/Plex Media Server/Logs' && \
  for i in 5 4 3 2 1; do \
    [ -f 'Plex Media Server.$((i-1)).log' ] && mv 'Plex Media Server.$((i-1)).log' 'Plex Media Server.$i.log'; \
  done && \
  mv 'Plex Media Server.log' 'Plex Media Server.1.log' && \
  touch 'Plex Media Server.log'"
```

### Log Level Configuration

**Adjust log verbosity:**
1. Settings > Console
2. Enable "Advanced" view
3. Select log level:
   - `Error` - Errors only
   - `Warn` - Warnings and errors
   - `Info` - General information (default)
   - `Debug` - Detailed debugging
   - `Verbose` - Very detailed (not recommended for production)

**Via Preferences.xml:**
```xml
<Preferences ... LogLevel="Debug" ... />
```

### View Logs

**Real-time:**
```bash
# Follow main log
docker exec plex-server tail -f "/config/Library/Application Support/Plex Media Server/Logs/Plex Media Server.log"

# Follow with Docker
docker logs -f plex-server

# Search logs
docker logs plex-server 2>&1 | grep -i "error"
```

**Historical:**
```bash
# View rotated logs
for i in {1..5}; do
  echo "=== Plex Media Server.$i.log ==="
  docker exec plex-server head -20 "/config/Library/Application Support/Plex Media Server/Logs/Plex Media Server.$i.log"
done

# Search all logs
docker exec plex-server sh -c "grep -h 'ERROR' '/config/Library/Application Support/Plex Media Server/Logs/'*.log | tail -50"
```

### Log Cleanup

**Clean old logs (safe):**
```bash
# Remove logs older than 30 days
find "./services/plex/config/Library/Application Support/Plex Media Server/Logs" \
  -name "*.log.*" -mtime +30 -delete

# Remove plugin logs older than 7 days
find "./services/plex/config/Library/Application Support/Plex Media Server/Logs/PMS Plugin Logs" \
  -name "*.log.*" -mtime +7 -delete

# Clean transcode logs
rm -rf "./services/plex/transcode/"*.log
```

## Update Procedures

### Before Updating

**Pre-Update Checklist:**
- [ ] Backup database (automated via `backup-plex.sh`)
- [ ] Note current version
- [ ] Read release notes
- [ ] Check for breaking changes
- [ ] Verify sufficient disk space
- [ ] Plan maintenance window (15-30 min)

### Update Plex

**Via Docker (Recommended):**
```bash
# Pull latest image
docker pull lscr.io/linuxserver/plex:latest

# Stop current container
docker stop plex-server

# Remove old container
docker rm plex-server

# Recreate with new image
docker-compose -f docker-compose.unified.yml up -d plex

# Monitor startup
docker logs -f plex-server

# Verify version
docker exec plex-server cat /usr/lib/plexmediaserver/lib/plexmediaserver.so | strings | grep "Plex Media Server v"
```

**Automated Update Script:**
```bash
#!/bin/bash
# update-plex.sh

# Backup first
./deployment/backup-plex.sh

# Pull latest
docker-compose -f docker-compose.unified.yml pull plex

# Recreate
docker-compose -f docker-compose.unified.yml up -d plex

# Wait for healthy
timeout 60 bash -c 'until docker exec plex-server curl -f http://localhost:32400/identity; do sleep 5; done'

echo "Plex updated successfully"
```

### Update Plugins and Agents

Plex automatically updates agents. Manual update:
1. Settings > Manage > Plugins
2. Click plugin name
3. Click "Update" if available

### Rollback Procedure

If update causes issues:

```bash
# Stop current version
docker stop plex-server
docker rm plex-server

# Pull specific version
docker pull lscr.io/linuxserver/plex:1.32.5.7349-8f4248874

# Update docker-compose.unified.yml
# image: lscr.io/linuxserver/plex:1.32.5.7349-8f4248874

# Start with old version
docker-compose -f docker-compose.unified.yml up -d plex

# Restore database if needed
cp /home/evin/contain/backups/plex/daily/latest/*.db \
   "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/"
```

## Performance Tuning

### Network Performance

**Settings > Network:**
- **LAN Networks**: `192.168.0.0/16,172.16.0.0/12` (adjust for your network)
- **Treat WAN IP As LAN Bandwidth**: Enable if using VPN
- **Enable server support for IPv6**: Enable if your network supports it

**Bandwidth Limits:**
- **Remote** stream bitrate limit: `8 Mbps` (or higher with good upload)
- **LAN** stream bitrate limit: `Original` (no transcoding)
- **Upload** speed limit: Leave blank (unlimited)

### Database Performance

**WAL Mode (Write-Ahead Logging):**
```bash
# Check current journal mode
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  "PRAGMA journal_mode;"

# Enable WAL mode (better performance)
sqlite3 "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  "PRAGMA journal_mode=WAL;"

# Should return: wal
```

Benefits of WAL:
- Better concurrent read/write performance
- Reduces database locking
- Faster library scans while streaming

### Library Optimization

**Scanner Settings:**
- **Scan my library automatically**: Enable
- **Run a partial scan when changes are detected**: Enable
- **Scan my library periodically**: Disable (use manual scans)
- **Empty trash automatically after every scan**: Disable (manual control)

**Agent Settings:**
- Disable unused agents
- Reduce metadata refresh frequency
- Cache agent results

### Resource Optimization

**Memory Management:**
```yaml
# In docker-compose.unified.yml
environment:
  - PLEX_PREFERENCE="TranscoderTempDirectory=/transcode"
  - PLEX_PREFERENCE="RelayEnabled=0"  # Disable Relay if not needed
  - PLEX_PREFERENCE="GdmEnabled=0"    # Disable GDM if not using
```

**CPU Scheduling:**
```yaml
deploy:
  resources:
    limits:
      cpus: '4.0'
    reservations:
      cpus: '1.0'
cpu_shares: 1024  # Default priority
```

## Troubleshooting

### Common Issues and Solutions

#### Plex Won't Start
```bash
# Check logs
docker logs plex-server

# Common causes:
# 1. Database corruption
sqlite3 library.db "PRAGMA integrity_check;"

# 2. Permission issues
chown -R 1000:1000 ./services/plex/config

# 3. Port conflict
netstat -tulpn | grep 32400

# 4. Insufficient resources
docker stats plex-server
```

#### Playback Buffering
```bash
# Check transcoding
docker exec plex-server ls -la /transcode

# Check network bandwidth
iperf3 -c client-ip

# Check CPU/GPU usage
docker stats plex-server --no-stream

# Solutions:
# 1. Enable hardware transcoding
# 2. Lower remote quality
# 3. Increase transcoder buffer
# 4. Use faster transcode storage
```

#### Metadata Not Downloading
```bash
# Check internet connectivity
docker exec plex-server ping -c 4 metadata.provider.plex.tv

# Refresh metadata agents
# Settings > Agents > [Agent] > Update

# Check agent logs
docker exec plex-server tail -100 "/config/Library/Application Support/Plex Media Server/Logs/PMS Plugin Logs/com.plexapp.agents.*.log"

# Fix: Restart Plex
docker restart plex-server
```

#### Database Locked
```bash
# Check for multiple Plex processes
docker exec plex-server ps aux | grep -i plex

# Stop Plex completely
docker stop plex-server

# Remove WAL files (safe)
cd "./services/plex/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases"
rm -f *.db-wal *.db-shm

# Restart
docker start plex-server
```

#### Remote Access Not Working
```bash
# Check published port
docker port plex-server 32400

# Check firewall
sudo ufw status | grep 32400

# Test connectivity
curl http://your-public-ip:32400/identity

# Enable manual port forwarding
# Settings > Remote Access > Manually specify public port: 32400
```

### Diagnostic Commands

```bash
# Server info
curl http://localhost:32400/identity

# Server status
curl http://localhost:32400/:/prefs

# Active sessions
curl "http://localhost:32400/status/sessions?X-Plex-Token=${PLEX_TOKEN}"

# Library sections
curl "http://localhost:32400/library/sections?X-Plex-Token=${PLEX_TOKEN}"

# Server capabilities
curl http://localhost:32400/servers
```

### Performance Diagnostics

```bash
# CPU usage
docker stats plex-server --no-stream | awk '{print $3}'

# Memory usage
docker stats plex-server --no-stream | awk '{print $4}'

# Disk I/O
iostat -x 1 5

# Network throughput
iftop -i eth0

# Database query performance
sqlite3 library.db "EXPLAIN QUERY PLAN SELECT * FROM metadata_items LIMIT 10;"
```

## Monitoring and Alerts

### Plex Dashboard Monitoring

The Homelab dashboard includes Plex monitoring at:
`http://dashboard.yourdomain.com/monitoring`

**Metrics Displayed:**
- Active streams
- Transcoding sessions
- Server health status
- Library size
- Recent scans
- Error count

### Health Checks

**Docker health check (automatic):**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:32400/identity"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 120s
```

**Manual health check:**
```bash
# Check Plex is responding
curl -f http://localhost:32400/identity || echo "UNHEALTHY"

# Check database accessibility
docker exec plex-server sqlite3 \
  "/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db" \
  "SELECT COUNT(*) FROM metadata_items;"
```

### Alert Configuration

**Email alerts on failures:**
```bash
# In backup-plex.sh
ALERT_EMAIL="admin@example.com"

send_alert() {
  echo "$1" | mail -s "Plex Alert: $2" "$ALERT_EMAIL"
}
```

**Discord webhooks:**
```bash
DISCORD_WEBHOOK="https://discord.com/api/webhooks/..."

send_discord() {
  curl -X POST "$DISCORD_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"content\": \"$1\"}"
}
```

## Best Practices Summary

✅ **Daily:**
- Monitor active streams
- Check backup completion
- Review error logs

✅ **Weekly:**
- Verify library scans
- Check disk space
- Review performance metrics

✅ **Monthly:**
- Vacuum database
- Clean old metadata
- Update Plex version
- Review resource usage

✅ **Quarterly:**
- Full backup test restore
- Performance audit
- Security update review
- Documentation update

## Quick Reference Commands

```bash
# Restart Plex
docker restart plex-server

# View logs
docker logs -f plex-server

# Backup database
./deployment/backup-plex.sh

# Optimize database
./deployment/plex-db-optimize.sh

# Check health
curl http://localhost:32400/identity

# Check version
docker exec plex-server cat /usr/lib/plexmediaserver/lib/plexmediaserver.so | strings | grep "Plex Media Server v"

# Update Plex
docker-compose pull plex && docker-compose up -d plex
```
