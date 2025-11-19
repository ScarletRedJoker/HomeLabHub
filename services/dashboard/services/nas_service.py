import os
import subprocess
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import socket
import shutil

logger = logging.getLogger(__name__)


class NASService:
    def __init__(self):
        self.nas_ip = os.getenv('NAS_IP', '')
        self.nas_hostname = os.getenv('NAS_HOSTNAME', 'zyxel-nas326')
        self.nas_user = os.getenv('NAS_USER', 'admin')
        self.nas_password = os.getenv('NAS_PASSWORD', '')
        self.mount_base = os.getenv('NAS_MOUNT_BASE', '/mnt/nas')

    def discover_nas(self) -> Optional[Dict[str, Any]]:
        """Discover NAS on local network using hostname resolution"""
        try:
            if not self.nas_hostname:
                return None

            ip_address = socket.gethostbyname(self.nas_hostname)
            
            is_alive = subprocess.run(
                ['ping', '-c', '1', '-W', '2', ip_address],
                capture_output=True,
                timeout=5
            ).returncode == 0

            return {
                'hostname': self.nas_hostname,
                'ip_address': ip_address,
                'is_alive': is_alive,
                'discovered_at': datetime.utcnow().isoformat()
            }
        except (socket.gaierror, subprocess.TimeoutExpired, Exception) as e:
            logger.warning(f"NAS discovery failed: {e}")
            return None

    def list_mounts(self) -> List[Dict[str, Any]]:
        """List all currently mounted NAS shares"""
        try:
            result = subprocess.run(
                ['mount'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            mounts = []
            for line in result.stdout.split('\n'):
                if self.nas_ip in line or self.nas_hostname in line:
                    parts = line.split()
                    if len(parts) >= 3:
                        mounts.append({
                            'source': parts[0],
                            'mount_point': parts[2],
                            'type': parts[4] if len(parts) > 4 else 'unknown',
                            'options': parts[5] if len(parts) > 5 else ''
                        })
            
            return mounts
        except Exception as e:
            logger.error(f"Error listing NAS mounts: {e}")
            return []

    def mount_smb_share(self, share_name: str, mount_point: str, username: str = None, password: str = None) -> Dict[str, Any]:
        """Mount SMB/CIFS share from NAS"""
        try:
            username = username or self.nas_user
            password = password or self.nas_password
            nas_host = self.nas_ip or self.nas_hostname

            if not all([nas_host, share_name, username, password]):
                return {
                    'success': False,
                    'error': 'Missing required NAS credentials or share name'
                }

            os.makedirs(mount_point, exist_ok=True)

            mount_cmd = [
                'mount',
                '-t', 'cifs',
                f'//{nas_host}/{share_name}',
                mount_point,
                '-o', f'username={username},password={password},uid=1000,gid=1000,rw'
            ]

            result = subprocess.run(
                mount_cmd,
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                return {
                    'success': True,
                    'mount_point': mount_point,
                    'share': share_name,
                    'message': f'Successfully mounted {share_name}'
                }
            else:
                return {
                    'success': False,
                    'error': result.stderr or 'Mount failed'
                }

        except Exception as e:
            logger.error(f"Error mounting SMB share {share_name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def unmount_share(self, mount_point: str) -> Dict[str, Any]:
        """Unmount NAS share"""
        try:
            result = subprocess.run(
                ['umount', mount_point],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                return {
                    'success': True,
                    'message': f'Successfully unmounted {mount_point}'
                }
            else:
                return {
                    'success': False,
                    'error': result.stderr or 'Unmount failed'
                }

        except Exception as e:
            logger.error(f"Error unmounting {mount_point}: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def get_mount_storage_info(self, mount_point: str) -> Optional[Dict[str, Any]]:
        """Get storage information for mounted share"""
        try:
            if not os.path.ismount(mount_point):
                return None

            stat = shutil.disk_usage(mount_point)
            
            return {
                'mount_point': mount_point,
                'total_bytes': stat.total,
                'used_bytes': stat.used,
                'free_bytes': stat.free,
                'total_gb': round(stat.total / (1024**3), 2),
                'used_gb': round(stat.used / (1024**3), 2),
                'free_gb': round(stat.free / (1024**3), 2),
                'usage_percent': round((stat.used / stat.total) * 100, 2) if stat.total > 0 else 0
            }

        except Exception as e:
            logger.error(f"Error getting storage info for {mount_point}: {e}")
            return None

    def backup_to_nas(self, source_path: str, dest_share: str, backup_name: str) -> Dict[str, Any]:
        """Create backup of local path to NAS share"""
        try:
            temp_mount = f"{self.mount_base}/backup-temp"
            
            mount_result = self.mount_smb_share(dest_share, temp_mount)
            if not mount_result.get('success'):
                return mount_result

            dest_path = os.path.join(temp_mount, backup_name)
            
            rsync_cmd = [
                'rsync',
                '-avz',
                '--delete',
                source_path,
                dest_path
            ]

            result = subprocess.run(
                rsync_cmd,
                capture_output=True,
                text=True,
                timeout=3600
            )

            self.unmount_share(temp_mount)

            if result.returncode == 0:
                return {
                    'success': True,
                    'backup_name': backup_name,
                    'message': f'Successfully backed up to {dest_share}/{backup_name}'
                }
            else:
                return {
                    'success': False,
                    'error': result.stderr or 'Backup failed'
                }

        except Exception as e:
            logger.error(f"Error during NAS backup: {e}")
            try:
                self.unmount_share(temp_mount)
            except:
                pass
            return {
                'success': False,
                'error': str(e)
            }

    def test_connection(self) -> Dict[str, Any]:
        """Test connection to NAS"""
        try:
            discovery = self.discover_nas()
            if not discovery:
                return {
                    'success': False,
                    'error': 'NAS not found on network'
                }

            if not discovery.get('is_alive'):
                return {
                    'success': False,
                    'error': f"NAS at {discovery.get('ip_address')} is not responding to ping"
                }

            return {
                'success': True,
                'nas_info': discovery,
                'message': 'NAS connection successful'
            }

        except Exception as e:
            logger.error(f"NAS connection test failed: {e}")
            return {
                'success': False,
                'error': str(e)
            }
