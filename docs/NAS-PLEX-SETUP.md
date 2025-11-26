# NAS + Plex Integration Setup Guide

This guide explains how to set up your Zyxel NAS326 with Plex for automatic media scanning and backup functionality.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Ubuntu Server                                │
│                                                                 │
│  ┌──────────────┐      ┌─────────────────┐                     │
│  │ /mnt/nas     │◄─────│ Zyxel NAS326    │                     │
│  │ (SMB mount)  │      │ networkshare    │                     │
│  └──────┬───────┘      └─────────────────┘                     │
│         │                                                       │
│         │ Docker volume mount                                   │
│         ▼                                                       │
│  ┌──────────────┐      ┌─────────────────┐                     │
│  │ Plex         │      │ Dashboard       │                     │
│  │ /nas (ro)    │      │ /mnt/nas (rw)   │                     │
│  │ Libraries:   │      │ Browse/Import   │                     │
│  │ - /nas/video │      │ APIs            │                     │
│  │ - /nas/music │      └─────────────────┘                     │
│  └──────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Step 1: Configure NAS Environment Variables

Add these to your `.env` file:

```bash
# NAS Configuration
NAS_IP=192.168.1.100         # Your NAS IP address
NAS_HOSTNAME=NAS326.local    # Your NAS hostname
NAS_USER=admin               # NAS username
NAS_PASSWORD=YourPassword    # NAS password
NAS_MOUNT_BASE=/mnt/nas      # Where to mount on server
```

## Step 2: Mount NAS on Ubuntu Server

### Option A: Quick Mount (Manual)

SSH into your server and run:

```bash
cd /home/evin/contain/HomeLabHub

# Make script executable (first time only)
chmod +x scripts/mount-nas.sh

# Mount NAS shares
sudo ./scripts/mount-nas.sh
```

### Option B: Automatic Mount on Boot

```bash
# Mount and configure for automatic startup
sudo ./scripts/mount-nas.sh automount
```

This adds the NAS to `/etc/fstab` so it mounts automatically on reboot.

### Verify Mount

```bash
# Check mount status
sudo ./scripts/mount-nas.sh status

# List NAS contents
ls -la /mnt/nas/networkshare/
```

You should see your folders: admin, games, music, photo, video, etc.

## Step 3: Configure Plex Libraries

The Plex container has `/mnt/nas` mapped to `/nas` (read-only). Your NAS folders are accessible at:

| NAS Folder | Plex Container Path (Full) | Symlink Path | Library Type |
|------------|---------------------------|--------------|--------------|
| video      | /nas/nfs/networkshare/video | /nas/video | Movies/TV Shows |
| music      | /nas/nfs/networkshare/music | /nas/music | Music |
| photo      | /nas/nfs/networkshare/photo | /nas/photo | Photos |
| games      | /nas/nfs/networkshare/games | /nas/games | Other |

### Add Libraries in Plex

1. Go to https://plex.evindrake.net
2. Settings → Manage → Libraries → Add Library
3. Choose library type (Movies, TV Shows, Music, etc.)
4. Click "Browse for media folder"
5. Navigate to `/nas/video` (or `/nas/nfs/networkshare/video`)
6. Click "Add" then "Add Library"

**Recommended Library Setup:**
- **Movies**: `/nas/video` (or subfolder like `/nas/video/Movies`)
- **TV Shows**: `/nas/video` (or subfolder like `/nas/video/TV Shows`)  
- **Music**: `/nas/music`
- **Photos**: `/nas/photo`

## Step 4: Using the Dashboard

### Browse NAS Files

Navigate to the NAS Management page in your dashboard:
- URL: https://dashboard.evindrake.net/nas

API endpoints available:
- `GET /nas/api/browse?path=networkshare/video` - Browse folders
- `GET /nas/api/media-folders` - Get categorized media folders
- `GET /nas/api/plex-paths` - Get Plex-ready paths

### Import Media to Plex

Two options:

**Option A: Direct NAS Scan (Recommended)**
- Mount NAS as shown above
- Configure Plex libraries to point to `/nas/networkshare/*`
- Plex automatically scans new files

**Option B: Upload via Dashboard**
- Go to Plex page in dashboard
- Drag & drop files
- Files are staged in MinIO, then moved to Plex directories
- Library scan triggered automatically

### Backup to NAS

```bash
# API call to backup Plex config to NAS
curl -X POST https://dashboard.evindrake.net/nas/api/backup \
  -H "Content-Type: application/json" \
  -d '{
    "source_path": "/app/services/plex/config",
    "dest_share": "nfs/networkshare",
    "backup_name": "plex-backup-2025"
  }'
```

## Step 5: Restart Services

After mounting NAS:

```bash
# Restart Plex to detect new mounts
docker compose restart plex

# Or restart all services
./homelab restart
```

## Troubleshooting

### NAS Not Mounting

1. Check NAS is reachable:
   ```bash
   ping NAS326.local
   ```

2. Install required packages:
   ```bash
   sudo apt install cifs-utils avahi-utils
   ```

3. Check credentials:
   ```bash
   # Test SMB connection manually
   smbclient //NAS326.local/nfs/networkshare -U admin
   ```

### Plex Can't See NAS Files

1. Verify mount inside Plex container:
   ```bash
   docker exec -it plex-server ls -la /nas/
   ```

2. Check Plex has read access:
   ```bash
   docker exec -it plex-server cat /nas/networkshare/video/somefile.mp4 | head -c 100
   ```

3. Ensure mount exists before Plex starts (use automount)

### Permission Denied

The mount script sets `uid=1000,gid=1000` to match the Plex container user. If you have different UIDs:

```bash
# Check your user IDs
id

# Modify mount options in mount-nas.sh if needed
```

## API Reference

### Browse NAS
```
GET /nas/api/browse?path=<relative_path>

Response:
{
  "success": true,
  "path": "networkshare/video",
  "plex_container_path": "/nas/networkshare/video",
  "folders": [...],
  "files": [...],
  "storage": { "total_gb": 500, "used_gb": 200, "free_gb": 300 }
}
```

### Get Media Folders
```
GET /nas/api/media-folders

Response:
{
  "success": true,
  "folders": {
    "movies": [{ "name": "video", "plex_path": "/nas/networkshare/video" }],
    "music": [{ "name": "music", "plex_path": "/nas/networkshare/music" }],
    ...
  },
  "plex_library_suggestions": [
    { "library_type": "movie", "name": "Movies", "suggested_paths": [...] }
  ]
}
```

### Get Plex-Ready Paths
```
GET /nas/api/plex-paths

Response:
{
  "success": true,
  "mount_info": {
    "host_mount": "/mnt/nas",
    "container_mount": "/nas",
    "description": "NAS is mounted at /mnt/nas on host, accessible as /nas inside Plex container"
  },
  "library_suggestions": [...]
}
```
