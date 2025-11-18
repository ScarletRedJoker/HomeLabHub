# Connecting NAS to Plex Server

This guide will help you mount your NAS (nas.evindrake.net) and make it accessible to your Plex Media Server running in Docker.

## Prerequisites

- NAS accessible at: `nas.evindrake.net`
- NAS credentials (username and password)
- NAS share name (e.g., `media`, `plex`, `movies`, etc.)

## Step 1: Install Required Packages

```bash
sudo apt update
sudo apt install cifs-utils -y
```

## Step 2: Create Mount Point

```bash
sudo mkdir -p /mnt/nas
```

## Step 3: Test NAS Connection

**First, find out what share names are available on your NAS:**

```bash
# Replace YOUR_USERNAME with your NAS username
smbclient -L //nas.evindrake.net -U YOUR_USERNAME
```

This will show you all available shares. Common names are: `media`, `plex`, `movies`, `public`, `data`, etc.

**Test mounting the NAS (replace SHARE_NAME with actual share):**

```bash
# For SMB/CIFS shares (most common)
sudo mount -t cifs //nas.evindrake.net/SHARE_NAME /mnt/nas -o username=YOUR_USERNAME,password=YOUR_PASSWORD,uid=1000,gid=1000

# Verify it worked
ls -la /mnt/nas
```

If you see your files, great! If not, check:
- Is the NAS online? `ping nas.evindrake.net`
- Are your credentials correct?
- Is the share name correct?

## Step 4: Create Secure Credentials File

Instead of putting your password in plain text in fstab, store it securely:

```bash
sudo nano /root/.nas-credentials
```

Add these lines (replace with your actual credentials):
```
username=YOUR_NAS_USERNAME
password=YOUR_NAS_PASSWORD
domain=WORKGROUP
```

Secure the file:
```bash
sudo chmod 600 /root/.nas-credentials
sudo chown root:root /root/.nas-credentials
```

## Step 5: Configure Automatic Mount on Boot

Edit fstab:
```bash
sudo cp /etc/fstab /etc/fstab.backup  # Backup first!
sudo nano /etc/fstab
```

Add this line at the end (replace SHARE_NAME with your actual share):
```
//nas.evindrake.net/SHARE_NAME  /mnt/nas  cifs  credentials=/root/.nas-credentials,uid=1000,gid=1000,dir_mode=0770,file_mode=0660,iocharset=utf8,_netdev,nofail  0  0
```

**Important fstab options explained:**
- `credentials=/root/.nas-credentials` - Use secure credential file
- `uid=1000,gid=1000` - Files owned by your user (evin)
- `_netdev` - Wait for network before mounting
- `nofail` - Don't fail boot if NAS is unavailable
- `iocharset=utf8` - Support international characters in filenames

Test the mount:
```bash
sudo mount -a
ls -la /mnt/nas
```

## Step 6: Restart Plex Container

The docker-compose.unified.yml has been updated to include the NAS mount at `/nas` inside the Plex container.

```bash
cd /home/evin/contain/HomeLabHub

# Restart Plex with new NAS volume
docker-compose -f docker-compose.unified.yml restart plex

# Verify Plex is running
docker ps | grep plex

# Check if NAS is accessible inside container
docker exec plex-server ls -la /nas
```

## Step 7: Add NAS Library in Plex

1. Open Plex Web UI: https://plex.evindrake.net
2. Go to **Settings** → **Libraries**
3. Click **Add Library**
4. Choose library type (Movies, TV Shows, Music, etc.)
5. Click **Browse for Media Folder**
6. Navigate to **/nas** (this is your NAS inside the container)
7. Select the appropriate folder
8. Click **Add Library**
9. Plex will start scanning your NAS media!

## Troubleshooting

### NAS Won't Mount

**Check if NAS is reachable:**
```bash
ping nas.evindrake.net
```

**Check if SMB is accessible:**
```bash
smbclient -L //nas.evindrake.net -U YOUR_USERNAME
```

**Check mount status:**
```bash
mount | grep nas
```

**Check system logs for errors:**
```bash
sudo dmesg | grep -i cifs
journalctl -xe | grep -i mount
```

### Plex Can't See Files

**Verify NAS is mounted:**
```bash
ls -la /mnt/nas
```

**Check permissions:**
```bash
# Files should be owned by user with ID 1000 (your user)
ls -la /mnt/nas
```

**Verify Plex container can see NAS:**
```bash
docker exec plex-server ls -la /nas
```

**Restart Plex:**
```bash
docker-compose -f docker-compose.unified.yml restart plex
```

### Mount Fails After Reboot

**Check if network was ready:**
```bash
systemctl status network-online.target
```

**Manually remount:**
```bash
sudo mount -a
```

**If it works manually but not on boot:**
- Make sure `_netdev` and `nofail` options are in your fstab entry
- The NAS must have a static IP or reliable DNS

## Alternative: NFS Mount (If Your NAS Supports It)

NFS is faster for streaming large media files. If your NAS supports NFS:

**Install NFS client:**
```bash
sudo apt install nfs-common -y
```

**Test mount:**
```bash
sudo mount -t nfs nas.evindrake.net:/export/media /mnt/nas
```

**Add to fstab:**
```
nas.evindrake.net:/export/media  /mnt/nas  nfs  defaults,_netdev,nofail  0  0
```

## Performance Tips

1. **Use Gigabit Ethernet** - WiFi is too slow for 4K streaming
2. **Static IP for NAS** - Prevents mount failures
3. **Read-only mount** - The docker-compose mounts NAS as `:ro` (read-only) for safety
4. **Pre-transcoding** - For 4K content, consider pre-transcoding on the NAS

## Security Notes

- The NAS is mounted **read-only** in Plex container (`:ro` flag)
- Credentials stored in `/root/.nas-credentials` (only root can read)
- Never put passwords directly in fstab
- Consider creating a dedicated "plex" user on your NAS with read-only access

## Next Steps

Once the NAS is mounted and added to Plex:
1. Let Plex scan your media (may take a while for large libraries)
2. Check metadata quality in Plex
3. Enable "Empty Trash Automatically" in Plex settings
4. Configure transcoding settings for your GPU (you have `/dev/dri` enabled!)

## Need Help?

Common NAS share paths to try:
- `//nas.evindrake.net/media`
- `//nas.evindrake.net/plex`
- `//nas.evindrake.net/public`
- `//nas.evindrake.net/movies`
- `//nas.evindrake.net/data`

If you're unsure, run:
```bash
smbclient -L //nas.evindrake.net -U YOUR_USERNAME
```

This will list all available shares on your NAS.
