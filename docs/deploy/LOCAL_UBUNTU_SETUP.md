# Local Ubuntu Server Setup Guide

> Complete setup guide for the local Ubuntu 25.10 homelab server with NAS media, Plex, GameStream, and Docker services.

## Quick Start

SSH into your local Ubuntu server and run:

```bash
cd /opt/homelab/HomeLabHub

# 1. Set up NAS media mounts
sudo ./deploy/local/scripts/setup-nas-mounts.sh

# 2. Start all services
./deploy/local/start-local-services.sh
```

---

## Prerequisites

- Ubuntu 25.10 server
- Network access to Zyxel NAS326
- Plex Media Server installed natively
- Docker and Docker Compose installed

---

## NAS Media Setup

### About Your NAS

| Setting | Value |
|---------|-------|
| NAS Model | Zyxel NAS326 |
| Hostname | NAS326.local |
| Protocol | NFS |
| Share Path | /nfs/networkshare |

### Media Folders on NAS

| Folder | Content | Mount Path |
|--------|---------|------------|
| video | Movies & TV Shows | /mnt/nas/video |
| music | Music files | /mnt/nas/music |
| photo | Photos | /mnt/nas/photo |
| games | Game files | /mnt/nas/games |

### Set Up NAS Mounts

```bash
# Auto-detect NAS and mount shares
sudo ./deploy/local/scripts/setup-nas-mounts.sh

# Or specify NAS IP directly
sudo ./deploy/local/scripts/setup-nas-mounts.sh --nas-ip=192.168.0.100

# Check mount status
sudo ./deploy/local/scripts/setup-nas-mounts.sh --status

# Unmount shares
sudo ./deploy/local/scripts/setup-nas-mounts.sh --unmount
```

### Verify NAS Health

```bash
./deploy/local/scripts/check-nas-health.sh
```

---

## Plex Media Server

Plex runs in Docker with access to your NAS media folders.

### Claim Your Plex Server

If your Plex server shows "Not Claimed" (claimed="0"), use the helper script:

```bash
./deploy/local/scripts/plex-claim.sh
```

This script will:
1. Check your current Plex server status
2. Guide you through getting a claim token from https://www.plex.tv/claim/
3. Update your .env file automatically
4. Restart Plex with the new claim

**Note:** Claim tokens expire in 4 minutes, so be ready to paste it quickly!

### Add Libraries in Plex

1. Open Plex: http://localhost:32400/web
2. Go to **Settings → Libraries → Add Library**
3. Add these paths (inside the container):

| Library Type | Path |
|--------------|------|
| Movies | /nas/video |
| TV Shows | /nas/video |
| Music | /nas/music |
| Photos | /nas/photo |

### Remote Access

Plex is accessible via:
- Local: http://localhost:32400/web
- Via Caddy: https://plex.evindrake.net

For friends to access without VPN, see [External Access Guide](./EXTERNAL_ACCESS_GUIDE.md).

---

## Docker Services

### Services on Local Ubuntu

| Service | Port | Description |
|---------|------|-------------|
| MinIO | 9000, 9001 | S3-compatible object storage |
| Home Assistant | 8123 | Smart home hub |
| Caddy | 80, 443 | Reverse proxy with SSL |

### Start Services

```bash
cd /opt/homelab/HomeLabHub/deploy/local

# Start all Docker services
./start-local-services.sh

# Or manually with docker compose
docker compose up -d

# Check status
docker compose ps
```

### Service URLs

| Service | Local URL | Via WireGuard |
|---------|-----------|---------------|
| Plex | http://localhost:32400/web | http://10.200.0.2:32400 |
| MinIO Console | http://localhost:9001 | http://10.200.0.2:9001 |
| Home Assistant | http://localhost:8123 | http://10.200.0.2:8123 |

---

## GameStream (Sunshine)

### Overview

Sunshine runs on a Windows 11 KVM VM with GPU passthrough for low-latency game streaming.

| Setting | Value |
|---------|-------|
| Windows VM IP | 192.168.122.250 |
| Sunshine Port | 47990 (HTTPS) |
| Client | Moonlight |

### Access GameStream

From Moonlight client:
1. Add PC: `192.168.122.250` (local) or `10.200.0.2` (via WireGuard)
2. Pair with PIN shown in Sunshine
3. Launch games!

---

## WireGuard VPN

### Tunnel Configuration

| Endpoint | IP | Role |
|----------|-----|------|
| Linode | 10.200.0.1 | Cloud gateway |
| Local Ubuntu | 10.200.0.2 | Local services |

### Check Tunnel Status

```bash
sudo wg show
```

### Latency

Expected: ~34ms between Linode and local

---

## Troubleshooting

### NAS Not Mounting

1. Check NAS is reachable:
   ```bash
   ping NAS326.local
   ```

2. Check NFS exports:
   ```bash
   showmount -e NAS326.local
   ```

3. Try with IP address:
   ```bash
   sudo ./deploy/local/scripts/setup-nas-mounts.sh --nas-ip=192.168.0.xxx
   ```

### Stale NFS Mount

If NAS was disconnected:
```bash
sudo umount -f /mnt/nas/all
sudo ./deploy/local/scripts/setup-nas-mounts.sh
```

### Plex Can't See Media

1. Verify mounts: `ls /mnt/nas/video`
2. Check Plex has read permissions
3. Restart Plex: `sudo systemctl restart plexmediaserver`

### Docker Service Issues

```bash
cd /opt/homelab/HomeLabHub/deploy/local

# View logs
docker compose logs -f

# Restart specific service
docker compose restart minio

# Rebuild and restart
docker compose up -d --force-recreate
```

---

## Complete Service Overview

### Local Ubuntu (192.168.0.228)

| Service | Type | Port | Status |
|---------|------|------|--------|
| Plex | Native | 32400 | Running |
| MinIO | Docker | 9000, 9001 | Running |
| Home Assistant | Docker | 8123 | Running |
| Caddy | Docker | 80, 443 | Running |
| Sunshine | VM | 47990 | Running |

### Network Topology

```
Internet
    │
    ▼
┌─────────────────┐
│  Linode Cloud   │
│  10.200.0.1     │
│  (Dashboard,    │
│   Discord Bot,  │
│   Stream Bot)   │
└────────┬────────┘
         │ WireGuard
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Local Ubuntu   │────▶│  Zyxel NAS326   │
│  10.200.0.2     │ NFS │  NAS326.local   │
│  192.168.0.228  │     │  /nfs/share     │
│  (Plex, MinIO,  │     └─────────────────┘
│   Home Asst)    │
└────────┬────────┘
         │ virbr0
         ▼
┌─────────────────┐
│  Windows 11 VM  │
│  192.168.122.250│
│  (Sunshine/     │
│   GameStream)   │
└─────────────────┘
```
