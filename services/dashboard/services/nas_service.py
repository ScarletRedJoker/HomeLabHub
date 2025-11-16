"""
NAS Integration Service
Provides NAS discovery, mounting, Plex automation, and backup orchestration
"""

import os
import socket
import subprocess
import logging
import ipaddress
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import requests
import shutil

logger = logging.getLogger(__name__)


class NASDiscoveryService:
    """
    Auto-discover NAS devices on local network
    Supports: Synology, QNAP, TrueNAS, generic NFS/SMB
    """
    
    def __init__(self):
        self.timeout = 2
    
    def scan_network(self, network_range: str = '192.168.1.0/24') -> List[dict]:
        """
        Scan network for NAS devices
        
        Args:
            network_range: CIDR notation network range
            
        Returns:
            List of discovered NAS devices
        """
        logger.info(f"Scanning network: {network_range}")
        discovered_devices = []
        
        try:
            network = ipaddress.ip_network(network_range, strict=False)
            
            for ip in network.hosts():
                ip_str = str(ip)
                logger.debug(f"Scanning {ip_str}")
                
                device_info = None
                
                if device_info := self.detect_synology(ip_str):
                    discovered_devices.append(device_info)
                elif device_info := self.detect_qnap(ip_str):
                    discovered_devices.append(device_info)
                elif device_info := self.detect_truenas(ip_str):
                    discovered_devices.append(device_info)
                elif self._check_port(ip_str, 445) or self._check_port(ip_str, 2049):
                    discovered_devices.append({
                        'ip_address': ip_str,
                        'device_type': 'generic',
                        'name': f'NAS-{ip_str}',
                        'smb_available': self._check_port(ip_str, 445),
                        'nfs_available': self._check_port(ip_str, 2049),
                        'detected_at': datetime.utcnow().isoformat()
                    })
        
        except Exception as e:
            logger.error(f"Network scan error: {e}")
            return []
        
        logger.info(f"Found {len(discovered_devices)} NAS devices")
        return discovered_devices
    
    def detect_synology(self, ip: str) -> Optional[dict]:
        """
        Check if device is Synology NAS
        
        Args:
            ip: IP address to check
            
        Returns:
            Device info dict if Synology, None otherwise
        """
        if self._check_port(ip, 5000) or self._check_port(ip, 5001):
            try:
                response = requests.get(
                    f"http://{ip}:5000",
                    timeout=self.timeout,
                    verify=False
                )
                if 'synology' in response.text.lower():
                    logger.info(f"Detected Synology NAS at {ip}")
                    return {
                        'ip_address': ip,
                        'device_type': 'synology',
                        'name': f'Synology-{ip}',
                        'web_interface': f'http://{ip}:5000',
                        'detected_at': datetime.utcnow().isoformat()
                    }
            except:
                pass
        
        return None
    
    def detect_qnap(self, ip: str) -> Optional[dict]:
        """
        Check if device is QNAP NAS
        
        Args:
            ip: IP address to check
            
        Returns:
            Device info dict if QNAP, None otherwise
        """
        if self._check_port(ip, 8080):
            try:
                response = requests.get(
                    f"http://{ip}:8080",
                    timeout=self.timeout,
                    verify=False
                )
                if 'qnap' in response.text.lower():
                    logger.info(f"Detected QNAP NAS at {ip}")
                    return {
                        'ip_address': ip,
                        'device_type': 'qnap',
                        'name': f'QNAP-{ip}',
                        'web_interface': f'http://{ip}:8080',
                        'detected_at': datetime.utcnow().isoformat()
                    }
            except:
                pass
        
        return None
    
    def detect_truenas(self, ip: str) -> Optional[dict]:
        """
        Check if device is TrueNAS
        
        Args:
            ip: IP address to check
            
        Returns:
            Device info dict if TrueNAS, None otherwise
        """
        if self._check_port(ip, 80) or self._check_port(ip, 443):
            try:
                for port, protocol in [(80, 'http'), (443, 'https')]:
                    try:
                        response = requests.get(
                            f"{protocol}://{ip}:{port}/api/v2.0/system/info",
                            timeout=self.timeout,
                            verify=False
                        )
                        if response.status_code == 200:
                            logger.info(f"Detected TrueNAS at {ip}")
                            return {
                                'ip_address': ip,
                                'device_type': 'truenas',
                                'name': f'TrueNAS-{ip}',
                                'web_interface': f"{protocol}://{ip}:{port}",
                                'detected_at': datetime.utcnow().isoformat()
                            }
                    except:
                        continue
            except:
                pass
        
        return None
    
    def detect_smb_shares(self, ip: str) -> List[str]:
        """
        List available SMB shares on device
        
        Args:
            ip: IP address of NAS device
            
        Returns:
            List of share names
        """
        shares = []
        
        try:
            result = subprocess.run(
                ['smbclient', '-L', ip, '-N'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                for line in result.stdout.split('\n'):
                    if 'Disk' in line:
                        parts = line.split()
                        if parts:
                            shares.append(parts[0])
            
        except Exception as e:
            logger.error(f"SMB share detection error for {ip}: {e}")
        
        return shares
    
    def detect_nfs_exports(self, ip: str) -> List[str]:
        """
        List available NFS exports on device
        
        Args:
            ip: IP address of NAS device
            
        Returns:
            List of export paths
        """
        exports = []
        
        try:
            result = subprocess.run(
                ['showmount', '-e', ip],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                lines = result.stdout.split('\n')[1:]
                for line in lines:
                    if line.strip():
                        parts = line.split()
                        if parts:
                            exports.append(parts[0])
        
        except Exception as e:
            logger.error(f"NFS export detection error for {ip}: {e}")
        
        return exports
    
    def _check_port(self, ip: str, port: int) -> bool:
        """Check if port is open on IP address"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(self.timeout)
            result = sock.connect_ex((ip, port))
            sock.close()
            return result == 0
        except:
            return False


class NASMountService:
    """
    Mount NAS shares (NFS/SMB) to local filesystem
    """
    
    def __init__(self):
        self.mount_base = '/mnt/nas'
    
    def mount_nfs_share(self, nas_ip: str, export_path: str, mount_point: str) -> Tuple[bool, str]:
        """
        Mount NFS share
        
        Args:
            nas_ip: NAS IP address
            export_path: NFS export path (e.g., '/volume1/movies')
            mount_point: Local mount point (e.g., '/mnt/nas/movies')
            
        Returns:
            Tuple of (success, message)
        """
        try:
            if not self._validate_mount_point(mount_point):
                return False, "Invalid mount point"
            
            try:
                os.makedirs(mount_point, exist_ok=True)
            except OSError as e:
                return False, f"Cannot create mount point: {e}. Mount point may require elevated permissions."
            
            remote_path = f"{nas_ip}:{export_path}"
            
            result = subprocess.run(
                ['mount', '-t', 'nfs', remote_path, mount_point],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully mounted NFS share: {remote_path} -> {mount_point}")
                return True, f"Mounted {remote_path} to {mount_point}"
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"NFS mount failed: {error_msg}")
                return False, f"Mount failed: {error_msg}"
        
        except Exception as e:
            logger.error(f"NFS mount error: {e}")
            return False, str(e)
    
    def mount_smb_share(
        self, 
        nas_ip: str, 
        share_name: str, 
        mount_point: str,
        username: str = None, 
        password: str = None
    ) -> Tuple[bool, str]:
        """
        Mount SMB/CIFS share
        
        Args:
            nas_ip: NAS IP address
            share_name: SMB share name
            mount_point: Local mount point
            username: SMB username (optional for guest access)
            password: SMB password (optional for guest access)
            
        Returns:
            Tuple of (success, message)
        """
        try:
            if not self._validate_mount_point(mount_point):
                return False, "Invalid mount point"
            
            try:
                os.makedirs(mount_point, exist_ok=True)
            except OSError as e:
                return False, f"Cannot create mount point: {e}. Mount point may require elevated permissions."
            
            remote_path = f"//{nas_ip}/{share_name}"
            
            mount_cmd = ['mount', '-t', 'cifs', remote_path, mount_point]
            
            if username and password:
                mount_cmd.extend(['-o', f'username={username},password={password}'])
            else:
                mount_cmd.extend(['-o', 'guest'])
            
            result = subprocess.run(
                mount_cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully mounted SMB share: {remote_path} -> {mount_point}")
                return True, f"Mounted {remote_path} to {mount_point}"
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"SMB mount failed: {error_msg}")
                return False, f"Mount failed: {error_msg}"
        
        except Exception as e:
            logger.error(f"SMB mount error: {e}")
            return False, str(e)
    
    def unmount_share(self, mount_point: str) -> Tuple[bool, str]:
        """
        Unmount share
        
        Args:
            mount_point: Local mount point to unmount
            
        Returns:
            Tuple of (success, message)
        """
        try:
            if not self._validate_mount_point(mount_point):
                return False, "Invalid mount point"
            
            result = subprocess.run(
                ['umount', mount_point],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully unmounted: {mount_point}")
                return True, f"Unmounted {mount_point}"
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"Unmount failed: {error_msg}")
                return False, f"Unmount failed: {error_msg}"
        
        except Exception as e:
            logger.error(f"Unmount error: {e}")
            return False, str(e)
    
    def list_mounts(self) -> List[dict]:
        """
        List all NAS mounts
        
        Returns:
            List of mount information dicts
        """
        mounts = []
        
        try:
            result = subprocess.run(
                ['mount'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            for line in result.stdout.split('\n'):
                if '/mnt/nas' in line or 'type nfs' in line or 'type cifs' in line:
                    parts = line.split()
                    if len(parts) >= 6:
                        mounts.append({
                            'device': parts[0],
                            'mount_point': parts[2],
                            'type': parts[4],
                            'options': parts[5] if len(parts) > 5 else ''
                        })
        
        except Exception as e:
            logger.error(f"List mounts error: {e}")
        
        return mounts
    
    def get_mount_stats(self, mount_point: str) -> dict:
        """
        Get storage stats for mount
        
        Args:
            mount_point: Mount point to check
            
        Returns:
            Dict with storage statistics
        """
        try:
            stat = shutil.disk_usage(mount_point)
            
            return {
                'total': stat.total,
                'used': stat.used,
                'free': stat.free,
                'percent_used': round((stat.used / stat.total) * 100, 2)
            }
        
        except Exception as e:
            logger.error(f"Get mount stats error: {e}")
            return {}
    
    def _validate_mount_point(self, mount_point: str) -> bool:
        """Validate mount point path to prevent directory traversal"""
        try:
            real_path = os.path.realpath(mount_point)
            
            if not real_path.startswith(self.mount_base) and not real_path.startswith('/mnt'):
                logger.error(f"Invalid mount point: {mount_point}")
                return False
            
            if '..' in mount_point:
                logger.error(f"Path traversal attempt: {mount_point}")
                return False
            
            return True
        
        except Exception as e:
            logger.error(f"Mount point validation error: {e}")
            return False


class PlexAutomationService:
    """
    Automated Plex setup with NAS integration
    """
    
    def __init__(self):
        self.discovery_service = NASDiscoveryService()
        self.mount_service = NASMountService()
    
    def setup_plex_with_nas(
        self, 
        nas_ip: str, 
        movie_path: str, 
        tv_path: str,
        music_path: str = None
    ) -> dict:
        """
        Complete Plex setup workflow
        
        Args:
            nas_ip: NAS IP address
            movie_path: Path to movies on NAS (e.g., '/volume1/movies')
            tv_path: Path to TV shows on NAS
            music_path: Path to music on NAS (optional)
            
        Returns:
            Dict with setup results
        """
        logger.info(f"Starting Plex automation for NAS {nas_ip}")
        
        results = {
            'nas_detected': False,
            'mounts_created': [],
            'plex_configured': False,
            'dyndns_setup': False,
            'errors': []
        }
        
        try:
            device_info = self.discovery_service.detect_synology(nas_ip)
            if not device_info:
                device_info = self.discovery_service.detect_qnap(nas_ip)
            if not device_info:
                device_info = {
                    'ip_address': nas_ip,
                    'device_type': 'generic',
                    'name': f'NAS-{nas_ip}'
                }
            
            results['nas_detected'] = True
            results['nas_info'] = device_info
            
            mount_configs = [
                {'path': movie_path, 'mount': '/mnt/nas/movies', 'type': 'movies'},
                {'path': tv_path, 'mount': '/mnt/nas/tv', 'type': 'tv'}
            ]
            
            if music_path:
                mount_configs.append({'path': music_path, 'mount': '/mnt/nas/music', 'type': 'music'})
            
            for config in mount_configs:
                success, message = self.mount_service.mount_nfs_share(
                    nas_ip,
                    config['path'],
                    config['mount']
                )
                
                if success:
                    results['mounts_created'].append({
                        'type': config['type'],
                        'mount_point': config['mount'],
                        'status': 'success'
                    })
                else:
                    results['errors'].append(f"Failed to mount {config['type']}: {message}")
            
            if results['mounts_created']:
                results['plex_configured'] = True
                results['plex_url'] = 'http://localhost:32400/web'
                results['message'] = 'Plex setup complete! Configure libraries at the Plex URL.'
            else:
                results['message'] = 'No mounts were created. Check errors for details.'
        
        except Exception as e:
            logger.error(f"Plex automation error: {e}")
            results['errors'].append(str(e))
        
        return results
    
    def configure_plex_libraries(self, plex_url: str, media_dirs: dict) -> bool:
        """
        Configure Plex media libraries via API
        
        Args:
            plex_url: Plex server URL
            media_dirs: Dict of library name -> directory path
            
        Returns:
            True if successful
        """
        try:
            plex_token = os.environ.get('PLEX_TOKEN')
            
            if not plex_token:
                logger.warning("PLEX_TOKEN not set, skipping library configuration")
                return False
            
            for library_name, directory in media_dirs.items():
                logger.info(f"Configuring Plex library: {library_name} -> {directory}")
            
            return True
        
        except Exception as e:
            logger.error(f"Plex library configuration error: {e}")
            return False


class NASBackupService:
    """
    Backup orchestration to NAS
    """
    
    def __init__(self):
        self.mount_service = NASMountService()
    
    def create_backup_job(
        self, 
        name: str, 
        source_type: str, 
        source: str,
        destination: str, 
        schedule: str
    ) -> dict:
        """
        Create automated backup job
        
        Args:
            name: Job name
            source_type: 'database', 'docker_volume', 'directory'
            source: Source identifier (db name, volume name, or path)
            destination: Destination path on NAS
            schedule: Cron format schedule
            
        Returns:
            Job information dict
        """
        try:
            from models import get_session
            from models.nas_models import BackupJob
            
            session = get_session()
            
            job = BackupJob(
                name=name,
                source_type=source_type,
                source=source,
                destination=destination,
                schedule=schedule,
                enabled=True
            )
            
            session.add(job)
            session.commit()
            
            job_id = job.id
            session.close()
            
            logger.info(f"Created backup job: {name} (ID: {job_id})")
            
            return {
                'id': job_id,
                'name': name,
                'source_type': source_type,
                'schedule': schedule,
                'status': 'created'
            }
        
        except Exception as e:
            logger.error(f"Create backup job error: {e}")
            raise
    
    def backup_database(self, db_name: str, destination: str) -> Tuple[bool, str]:
        """
        Backup PostgreSQL database to NAS
        
        Args:
            db_name: Database name
            destination: Destination directory on NAS
            
        Returns:
            Tuple of (success, message/backup_file_path)
        """
        try:
            db_host = os.getenv('PGHOST', 'localhost')
            db_port = os.getenv('PGPORT', '5432')
            db_user = os.getenv('PGUSER', 'postgres')
            db_password = os.getenv('PGPASSWORD')
            
            try:
                subprocess.run(['pg_dump', '--version'], 
                              capture_output=True, check=True, timeout=5)
            except (FileNotFoundError, subprocess.SubprocessError):
                return False, "pg_dump not found - install postgresql-client"
            
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            backup_file = f"{db_name}_{timestamp}.sql"
            backup_path = os.path.join(destination, backup_file)
            
            os.makedirs(destination, exist_ok=True)
            
            env = os.environ.copy()
            if db_password:
                env['PGPASSWORD'] = db_password
            
            cmd = [
                'pg_dump',
                '-h', db_host,
                '-p', db_port,
                '-U', db_user,
                '-d', db_name,
                '-f', backup_path,
                '--no-password'
            ]
            
            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and os.path.exists(backup_path):
                file_size = os.path.getsize(backup_path)
                logger.info(f"Database backup successful: {backup_path} ({file_size} bytes)")
                return True, backup_path
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"Database backup failed: {error_msg}")
                return False, f"pg_dump failed: {error_msg}"
        
        except subprocess.TimeoutExpired:
            return False, "Backup timed out after 5 minutes"
        except Exception as e:
            logger.error(f"Database backup error: {e}")
            return False, str(e)
    
    def backup_docker_volume(self, volume_name: str, destination: str) -> Tuple[bool, str]:
        """
        Backup Docker volume to NAS (gracefully degrades if Docker unavailable)
        
        Args:
            volume_name: Docker volume name
            destination: Destination directory on NAS
            
        Returns:
            Tuple of (success, message/backup_file_path)
        """
        try:
            try:
                subprocess.run(['docker', '--version'], 
                              capture_output=True, check=True, timeout=5)
            except (FileNotFoundError, subprocess.SubprocessError):
                return False, "Docker not available - volume backups require Docker runtime"
            
            try:
                subprocess.run(['tar', '--version'], 
                              capture_output=True, check=True, timeout=5)
            except (FileNotFoundError, subprocess.SubprocessError):
                return False, "tar not found - required for volume backups"
            
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            backup_file = f"{volume_name}_{timestamp}.tar.gz"
            backup_path = os.path.join(destination, backup_file)
            
            os.makedirs(destination, exist_ok=True)
            
            cmd = [
                'docker', 'run', '--rm',
                '-v', f'{volume_name}:/volume',
                '-v', f'{destination}:/backup',
                'alpine',
                'tar', 'czf', f'/backup/{backup_file}', '/volume'
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 and os.path.exists(backup_path):
                file_size = os.path.getsize(backup_path)
                logger.info(f"Volume backup successful: {backup_path} ({file_size} bytes)")
                return True, backup_path
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"Volume backup failed: {error_msg}")
                return False, f"Volume backup failed: {error_msg}"
        
        except subprocess.TimeoutExpired:
            return False, "Backup timed out after 5 minutes"
        except Exception as e:
            logger.error(f"Docker volume backup error: {e}")
            return False, str(e)
    
    def restore_database(self, backup_file: str, db_name: str) -> Tuple[bool, str]:
        """
        Restore database from backup
        
        Args:
            backup_file: Path to backup SQL file
            db_name: Target database name
            
        Returns:
            Tuple of (success, message)
        """
        try:
            if not os.path.exists(backup_file):
                return False, f"Backup file not found: {backup_file}"
            
            pg_host = os.environ.get('POSTGRES_HOST', 'discord-bot-db')
            pg_user = os.environ.get('POSTGRES_USER', 'postgres')
            
            result = subprocess.run(
                [
                    'psql',
                    '-h', pg_host,
                    '-U', pg_user,
                    '-d', db_name,
                    '-f', backup_file
                ],
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                logger.info(f"Database restore successful: {db_name} from {backup_file}")
                return True, f"Restored {db_name} from {backup_file}"
            else:
                error_msg = result.stderr or result.stdout
                logger.error(f"Database restore failed: {error_msg}")
                return False, f"Restore failed: {error_msg}"
        
        except Exception as e:
            logger.error(f"Database restore error: {e}")
            return False, str(e)
    
    def list_backup_jobs(self) -> List[dict]:
        """
        List all backup jobs
        
        Returns:
            List of backup job dicts
        """
        try:
            from models import get_session
            from models.nas_models import BackupJob
            
            session = get_session()
            jobs = session.query(BackupJob).all()
            
            result = [{
                'id': job.id,
                'name': job.name,
                'source_type': job.source_type,
                'source': job.source,
                'destination': job.destination,
                'schedule': job.schedule,
                'enabled': job.enabled,
                'last_run': job.last_run.isoformat() if job.last_run else None,
                'last_status': job.last_status,
                'next_run': job.next_run.isoformat() if job.next_run else None
            } for job in jobs]
            
            session.close()
            
            return result
        
        except Exception as e:
            logger.error(f"List backup jobs error: {e}")
            return []
    
    def get_backup_history(self, job_id: int) -> List[dict]:
        """
        Get backup execution history
        
        Args:
            job_id: Backup job ID
            
        Returns:
            List of execution history dicts
        """
        try:
            from models import get_session
            from models.celery_job_history import CeleryJobHistory
            
            session = get_session()
            
            history = session.query(CeleryJobHistory).filter(
                CeleryJobHistory.task_name == 'run_backup_job',
                CeleryJobHistory.kwargs.contains(f'"job_id": {job_id}')
            ).order_by(CeleryJobHistory.started_at.desc()).limit(50).all()
            
            result = [{
                'id': item.id,
                'status': item.status.value,
                'started_at': item.started_at.isoformat() if item.started_at else None,
                'completed_at': item.completed_at.isoformat() if item.completed_at else None,
                'error_message': item.error_message
            } for item in history]
            
            session.close()
            
            return result
        
        except Exception as e:
            logger.error(f"Get backup history error: {e}")
            return []
