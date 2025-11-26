import os
import subprocess
import logging
import tempfile
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

    def mount_smb_share(self, share_name: str, mount_point: str, username: Optional[str] = None, password: Optional[str] = None) -> Dict[str, Any]:
        """Mount SMB/CIFS share from NAS using secure credentials file"""
        creds_file = None
        try:
            username = username if username is not None else self.nas_user
            password = password if password is not None else self.nas_password
            nas_host = self.nas_ip or self.nas_hostname

            if not all([nas_host, share_name, username, password]):
                return {
                    'success': False,
                    'error': 'Missing required NAS credentials or share name'
                }

            os.makedirs(mount_point, exist_ok=True)

            fd, creds_file = tempfile.mkstemp(prefix='cifs-creds-', suffix='.conf')
            try:
                os.write(fd, f'username={username}\n'.encode())
                os.write(fd, f'password={password}\n'.encode())
            finally:
                os.close(fd)
            
            os.chmod(creds_file, 0o600)

            mount_cmd = [
                'mount',
                '-t', 'cifs',
                f'//{nas_host}/{share_name}',
                mount_point,
                '-o', f'credentials={creds_file},uid=1000,gid=1000,rw'
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
        finally:
            if creds_file and os.path.exists(creds_file):
                try:
                    os.unlink(creds_file)
                except Exception as e:
                    logger.warning(f"Failed to cleanup credentials file: {e}")

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
        temp_mount = f"{self.mount_base}/backup-temp"
        mount_succeeded = False
        
        try:
            mount_result = self.mount_smb_share(dest_share, temp_mount)
            if not mount_result.get('success'):
                return mount_result
            
            mount_succeeded = True

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
            return {
                'success': False,
                'error': str(e)
            }
        finally:
            if mount_succeeded:
                try:
                    self.unmount_share(temp_mount)
                except Exception as e:
                    logger.error(f"Failed to unmount {temp_mount}: {e}")

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

    def browse_path(self, path: str = '') -> Dict[str, Any]:
        """
        Browse files and folders in mounted NAS path
        
        Args:
            path: Relative path within mount base (e.g., 'networkshare/video')
            
        Returns:
            Dictionary with folders, files, and path info
        """
        try:
            path = path.strip() if path else ''
            path = path.lstrip('/')
            
            if '..' in path.split(os.sep) or '..' in path.split('/'):
                logger.warning(f"Path traversal attempt blocked: {path}")
                return {
                    'success': False,
                    'error': 'Access denied: path traversal not allowed'
                }
            
            full_path = os.path.join(self.mount_base, path) if path else self.mount_base
            
            real_mount_base = os.path.realpath(self.mount_base)
            real_full_path = os.path.realpath(full_path)
            
            if not real_full_path.startswith(real_mount_base):
                logger.warning(f"Path traversal attempt blocked via symlink: {path} -> {real_full_path}")
                return {
                    'success': False,
                    'error': 'Access denied: path traversal not allowed'
                }
            
            if not os.path.exists(full_path):
                return {
                    'success': False,
                    'error': f'Path does not exist: {path}',
                    'mounted': False
                }
            
            folders = []
            files = []
            
            try:
                for entry in os.scandir(full_path):
                    try:
                        stat_info = entry.stat()
                        item = {
                            'name': entry.name,
                            'path': os.path.relpath(entry.path, self.mount_base),
                            'size': stat_info.st_size if entry.is_file() else 0,
                            'modified': datetime.fromtimestamp(stat_info.st_mtime).isoformat(),
                        }
                        
                        if entry.is_dir():
                            item['type'] = 'folder'
                            item['plex_path'] = f'/nas/{item["path"]}'
                            folders.append(item)
                        else:
                            item['type'] = 'file'
                            ext = os.path.splitext(entry.name)[1].lower()
                            item['extension'] = ext
                            item['is_media'] = ext in {'.mp4', '.mkv', '.avi', '.mov', '.mp3', '.flac', '.m4a', '.wav'}
                            files.append(item)
                    except (PermissionError, OSError) as e:
                        logger.debug(f"Skipping inaccessible entry {entry.name}: {e}")
                        continue
                        
            except PermissionError:
                return {
                    'success': False,
                    'error': f'Permission denied: {path}'
                }
            
            folders.sort(key=lambda x: x['name'].lower())
            files.sort(key=lambda x: x['name'].lower())
            
            storage_info = self.get_mount_storage_info(self.mount_base)
            
            return {
                'success': True,
                'path': path,
                'full_path': full_path,
                'plex_container_path': f'/nas/{path}' if path else '/nas',
                'parent': os.path.dirname(path) if path else None,
                'folders': folders,
                'files': files,
                'total_items': len(folders) + len(files),
                'storage': storage_info
            }
            
        except Exception as e:
            logger.error(f"Error browsing NAS path {path}: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def get_media_folders(self) -> Dict[str, Any]:
        """
        Get common media folders suitable for Plex libraries
        
        Returns:
            Dictionary with categorized media folders
        """
        try:
            networkshare_path = os.path.join(self.mount_base, 'networkshare')
            
            if not os.path.exists(networkshare_path):
                return {
                    'success': False,
                    'error': 'NAS not mounted. Run: sudo ./scripts/mount-nas.sh',
                    'mounted': False
                }
            
            media_categories = {
                'movies': ['video', 'movies', 'films', 'media/movies'],
                'tv_shows': ['tv', 'tv shows', 'series', 'media/tv'],
                'music': ['music', 'audio', 'media/music'],
                'photos': ['photo', 'photos', 'pictures'],
            }
            
            found_folders = {
                'movies': [],
                'tv_shows': [],
                'music': [],
                'photos': [],
                'other': []
            }
            
            try:
                for entry in os.scandir(networkshare_path):
                    if entry.is_dir():
                        folder_name = entry.name.lower()
                        folder_path = os.path.relpath(entry.path, self.mount_base)
                        plex_path = f'/nas/{folder_path}'
                        
                        folder_info = {
                            'name': entry.name,
                            'path': folder_path,
                            'plex_path': plex_path,
                            'host_path': entry.path
                        }
                        
                        categorized = False
                        for category, keywords in media_categories.items():
                            if any(kw in folder_name for kw in keywords):
                                found_folders[category].append(folder_info)
                                categorized = True
                                break
                        
                        if not categorized:
                            found_folders['other'].append(folder_info)
                            
            except PermissionError:
                return {
                    'success': False,
                    'error': 'Permission denied accessing NAS'
                }
            
            return {
                'success': True,
                'mounted': True,
                'mount_base': self.mount_base,
                'folders': found_folders,
                'plex_library_suggestions': [
                    {
                        'library_type': 'movie',
                        'name': 'Movies',
                        'suggested_paths': [f['plex_path'] for f in found_folders['movies']]
                    },
                    {
                        'library_type': 'show',
                        'name': 'TV Shows',
                        'suggested_paths': [f['plex_path'] for f in found_folders['tv_shows']]
                    },
                    {
                        'library_type': 'artist',
                        'name': 'Music',
                        'suggested_paths': [f['plex_path'] for f in found_folders['music']]
                    },
                    {
                        'library_type': 'photo',
                        'name': 'Photos',
                        'suggested_paths': [f['plex_path'] for f in found_folders['photos']]
                    }
                ]
            }
            
        except Exception as e:
            logger.error(f"Error getting media folders: {e}")
            return {
                'success': False,
                'error': str(e)
            }

    def copy_to_nas(self, source_path: str, dest_folder: str, filename: str = None) -> Dict[str, Any]:
        """
        Copy a file to NAS storage
        
        Args:
            source_path: Local source file path
            dest_folder: Destination folder relative to mount base
            filename: Optional new filename (defaults to source filename)
            
        Returns:
            Copy result dictionary
        """
        try:
            if not os.path.exists(source_path):
                return {
                    'success': False,
                    'error': f'Source file not found: {source_path}'
                }
            
            dest_folder = dest_folder.strip().lstrip('/') if dest_folder else ''
            
            if '..' in dest_folder.split(os.sep) or '..' in dest_folder.split('/'):
                logger.warning(f"Path traversal attempt in copy_to_nas blocked: {dest_folder}")
                return {
                    'success': False,
                    'error': 'Invalid destination path: path traversal not allowed'
                }
            
            dest_dir = os.path.join(self.mount_base, dest_folder)
            
            real_mount_base = os.path.realpath(self.mount_base)
            real_dest_dir = os.path.realpath(dest_dir) if os.path.exists(dest_dir) else os.path.realpath(os.path.dirname(dest_dir))
            
            if not real_dest_dir.startswith(real_mount_base) and not dest_dir.startswith(self.mount_base):
                logger.warning(f"Path traversal attempt in copy_to_nas blocked: {dest_folder}")
                return {
                    'success': False,
                    'error': 'Invalid destination path'
                }
            
            if not os.path.exists(dest_dir):
                os.makedirs(dest_dir, exist_ok=True)
            
            if filename is None:
                filename = os.path.basename(source_path)
            
            dest_path = os.path.join(dest_dir, filename)
            
            shutil.copy2(source_path, dest_path)
            
            file_size = os.path.getsize(dest_path)
            
            return {
                'success': True,
                'source': source_path,
                'destination': dest_path,
                'nas_path': os.path.relpath(dest_path, self.mount_base),
                'plex_path': f'/nas/{os.path.relpath(dest_path, self.mount_base)}',
                'file_size': file_size,
                'message': f'Successfully copied to NAS'
            }
            
        except PermissionError:
            return {
                'success': False,
                'error': 'Permission denied writing to NAS'
            }
        except Exception as e:
            logger.error(f"Error copying to NAS: {e}")
            return {
                'success': False,
                'error': str(e)
            }
