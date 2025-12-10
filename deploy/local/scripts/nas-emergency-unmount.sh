#!/bin/bash
# Emergency NAS Unmount - Run this when Docker is hanging due to NAS issues

echo "Force unmounting all NAS paths..."

# Force lazy unmount - clears stale mounts without hanging
sudo umount -l /mnt/nas/all 2>/dev/null || true
sudo umount -l /mnt/nas/video 2>/dev/null || true
sudo umount -l /mnt/nas/music 2>/dev/null || true
sudo umount -l /mnt/nas/photo 2>/dev/null || true
sudo umount -l /mnt/nas/games 2>/dev/null || true

# Clear bind mounts
sudo umount -l /srv/media/video 2>/dev/null || true
sudo umount -l /srv/media/music 2>/dev/null || true
sudo umount -l /srv/media/photo 2>/dev/null || true
sudo umount -l /srv/media/games 2>/dev/null || true

echo "Done. Docker commands should work now."
echo ""
echo "To restart Plex:"
echo "  docker compose up -d plex"
