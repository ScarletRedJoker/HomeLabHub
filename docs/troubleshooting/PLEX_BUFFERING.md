# Plex Buffering Troubleshooting Guide

> Comprehensive guide for fixing Plex buffering issues in your homelab setup.

## Quick Diagnosis

If Plex "works fine after letting it sit for a bit", this indicates:
- **Transcoding buffer needs time to build up**
- The transcode storage is too slow
- Or hardware transcoding isn't working

## Immediate Fixes

### 1. RAM-Based Transcoding (Fastest Fix)

The docker-compose.yml has been updated to use tmpfs (RAM) for transcoding:

```yaml
plex:
  tmpfs:
    - /transcode:size=4G
```

This stores transcode files in RAM (4GB), dramatically faster than disk.

**To apply:**
```bash
cd /opt/homelab/HomeLabHub/deploy/local
docker compose down plex
docker compose up -d plex
```

### 2. Enable Direct Play (Best Solution)

Direct Play means no transcoding - the client plays the original file.

**On each client device:**
1. Open Plex app settings
2. Video Quality → Home streaming quality: **Original / Maximum**
3. Video Quality → Remote streaming quality: **Original / Maximum**

**On Plex Server:**
1. Settings → Network → Secure connections: **Preferred** (not Required)
2. Settings → Network → Enable Relay: **OFF**

### 3. Enable Hardware Transcoding

**Check hardware transcoding is working:**
```bash
./deploy/local/scripts/optimize-plex.sh --check
```

**In Plex Settings:**
1. Settings → Transcoder → Use hardware acceleration: **ON**
2. Settings → Transcoder → Use hardware-accelerated video encoding: **ON**

**Requires:** Plex Pass subscription for hardware transcoding

## Understanding the Issue

### Why "Works After Sitting"?

When you start a video:
1. Plex checks if client can Direct Play
2. If not, Plex must **transcode** the video
3. Transcoding creates a buffer of converted video
4. If transcode storage is slow, buffer takes time to build

### Your NAS (Zyxel NAS326) Limitations

| Spec | Value | Impact |
|------|-------|--------|
| CPU | 1GHz ARM | Can't hardware transcode |
| Ethernet | Gigabit | ~100MB/s max |
| Read Speed | ~80-100MB/s | Okay for 1080p, borderline for 4K |

4K HDR content can require 100+ Mbps (12.5+ MB/s), which should work, but:
- Multiple simultaneous streams can overload the NAS
- High bitrate 4K Remux files (50GB+) may struggle

## Network Troubleshooting

### DOCSIS 3.1 Modem

**Will help with:** Remote streaming over the internet
**Will NOT help with:** Local network streaming

If buffering happens on your home network, the modem isn't the cause.

### Check Local Network Speed

```bash
# On Plex server
iperf3 -s

# On client device
iperf3 -c <plex-server-ip>
```

**Expected:** 900+ Mbps for Gigabit network

### Common Network Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| <100 Mbps LAN | 100Mbps port/cable | Check switch ports, use Cat6 cables |
| Intermittent buffering | WiFi congestion | Use Ethernet for Plex client |
| Only 4K buffers | NAS read speed | Copy 4K to local SSD |

## Advanced Fixes

### 1. Optimize Plex Library Settings

Reduce background I/O that can slow down playback:

1. Settings → Library → Generate video preview thumbnails: **Never**
2. Settings → Library → Generate intro video markers: **Never**
3. Settings → Library → Generate credits markers: **Never**

### 2. Check Plex Transcoder Settings

1. Settings → Transcoder → Transcoder quality: **Prefer higher speed encoding**
2. Settings → Transcoder → Maximum simultaneous transcodes: **2** (match your CPU capability)

### 3. Verify NAS Mount Performance

```bash
# Check NAS read speed
./deploy/local/scripts/optimize-plex.sh --check

# Or manually test
dd if=/mnt/nas/video/somefile.mkv of=/dev/null bs=1M count=500
```

**Good:** 80+ MB/s
**Concerning:** <50 MB/s

### 4. Consider SMB Instead of NFS

SMB can sometimes provide better performance:

```bash
sudo ./deploy/local/scripts/setup-nas-mounts.sh --smb-share=smb
```

## When Hardware Won't Help

### Signs It's a Hardware Limit

- Multiple 4K streams buffer simultaneously
- NAS CPU maxes out during playback
- Old/slow NAS device

### Solutions

1. **Copy frequently-watched 4K to local SSD** (fastest)
2. **Pre-transcode with Tdarr** (converts files to easier formats)
3. **Upgrade NAS** to something with better CPU/networking
4. **Use Plex Optimized Versions** (pre-transcodes for mobile)

## Verification Checklist

After making changes, verify:

```bash
# 1. Check Plex container is using tmpfs
docker inspect plex --format '{{range .Mounts}}{{.Destination}}: {{.Type}}{{"\n"}}{{end}}'
# Should show: /transcode: tmpfs

# 2. Check GPU is accessible
docker exec plex ls /dev/dri
# Should show render128, card0, etc.

# 3. Check NAS is mounted
docker exec plex ls /nas/video
# Should list your media

# 4. Run full optimization check
./deploy/local/scripts/optimize-plex.sh --all
```

## Quick Reference

| Problem | Quick Fix |
|---------|-----------|
| Buffering at start | Enable hardware transcoding, use tmpfs |
| 4K always buffers | Enable Direct Play on client |
| Remote buffering | Check internet upload speed, enable Relay temporarily |
| LAN is slow | Check Ethernet cables, switch ports |
| NAS too slow | Copy media to local SSD |

## Related Documentation

- [Local Ubuntu Setup](../deploy/LOCAL_UBUNTU_SETUP.md)
- [NAS Setup](../deploy/LOCAL_UBUNTU_SETUP.md#nas-media-setup)
