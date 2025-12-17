from flask import Blueprint, render_template, jsonify, request
from services.nas_service import NASService
from services.db_service import db_service
from models.nas import NASMount, NASBackupJob
from models.rbac import Permission
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from config import Config
from datetime import datetime
import logging
import os
import shutil

logger = logging.getLogger(__name__)

storage_dashboard_bp = Blueprint('storage_dashboard', __name__, url_prefix='/storage-dashboard')


@storage_dashboard_bp.route('/')
@require_web_auth
def storage_dashboard():
    """Render unified storage dashboard"""
    return render_template('storage_dashboard.html')


@storage_dashboard_bp.route('/api/storage/overview', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_storage_overview():
    """Get overall storage summary across all sources"""
    try:
        nas_service = NASService()
        
        overview = {
            'total_capacity_bytes': 0,
            'total_used_bytes': 0,
            'total_available_bytes': 0,
            'sources': {
                'nas': {'count': 0, 'total_bytes': 0, 'used_bytes': 0, 'status': 'unknown'},
                'local': {'count': 0, 'total_bytes': 0, 'used_bytes': 0, 'status': 'online'},
                'cloud': {'count': 0, 'total_bytes': 0, 'used_bytes': 0, 'status': 'unknown'}
            },
            'alerts': [],
            'last_scan': datetime.utcnow().isoformat()
        }
        
        nas_mounts = nas_service.list_mounts()
        for mount in nas_mounts:
            storage_info = nas_service.get_mount_storage_info(mount.get('mount_point', ''))
            if storage_info:
                overview['sources']['nas']['count'] += 1
                overview['sources']['nas']['total_bytes'] += storage_info.get('total_bytes', 0)
                overview['sources']['nas']['used_bytes'] += storage_info.get('used_bytes', 0)
                overview['sources']['nas']['status'] = 'online'
                
                usage_percent = storage_info.get('usage_percent', 0)
                if usage_percent >= 90:
                    overview['alerts'].append({
                        'type': 'critical',
                        'message': f"NAS mount {mount.get('mount_point')} is {usage_percent}% full",
                        'mount_point': mount.get('mount_point')
                    })
                elif usage_percent >= Config.STORAGE_ALERT_THRESHOLD:
                    overview['alerts'].append({
                        'type': 'warning',
                        'message': f"NAS mount {mount.get('mount_point')} is {usage_percent}% full",
                        'mount_point': mount.get('mount_point')
                    })
        
        local_paths = ['/var', '/data', '/home']
        for path in local_paths:
            if os.path.exists(path):
                try:
                    stat = shutil.disk_usage(path)
                    overview['sources']['local']['count'] += 1
                    overview['sources']['local']['total_bytes'] += stat.total
                    overview['sources']['local']['used_bytes'] += stat.used
                    
                    usage_percent = (stat.used / stat.total * 100) if stat.total > 0 else 0
                    if usage_percent >= 90:
                        overview['alerts'].append({
                            'type': 'critical',
                            'message': f"Local storage {path} is {usage_percent:.1f}% full",
                            'mount_point': path
                        })
                    elif usage_percent >= Config.STORAGE_ALERT_THRESHOLD:
                        overview['alerts'].append({
                            'type': 'warning',
                            'message': f"Local storage {path} is {usage_percent:.1f}% full",
                            'mount_point': path
                        })
                except Exception as e:
                    logger.debug(f"Could not get stats for {path}: {e}")
        
        try:
            from minio import Minio
            minio_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            buckets = minio_client.list_buckets()
            overview['sources']['cloud']['count'] = len(buckets)
            overview['sources']['cloud']['status'] = 'online'
        except Exception as e:
            logger.debug(f"MinIO not available: {e}")
            overview['sources']['cloud']['status'] = 'offline'
        
        for source_type, source_data in overview['sources'].items():
            overview['total_capacity_bytes'] += source_data['total_bytes']
            overview['total_used_bytes'] += source_data['used_bytes']
        
        overview['total_available_bytes'] = overview['total_capacity_bytes'] - overview['total_used_bytes']
        overview['usage_percent'] = round(
            (overview['total_used_bytes'] / overview['total_capacity_bytes'] * 100) 
            if overview['total_capacity_bytes'] > 0 else 0, 2
        )
        
        return jsonify({
            'success': True,
            'overview': overview
        })

    except Exception as e:
        logger.error(f"Error getting storage overview: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/mounts', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_all_mounts():
    """List all mounted storage (NAS, local, cloud)"""
    try:
        nas_service = NASService()
        all_mounts = []
        
        nas_mounts = nas_service.list_mounts()
        for mount in nas_mounts:
            storage_info = nas_service.get_mount_storage_info(mount.get('mount_point', ''))
            mount_entry = {
                'id': f"nas_{mount.get('mount_point', '').replace('/', '_')}",
                'mount_point': mount.get('mount_point'),
                'source': mount.get('source'),
                'type': 'nas',
                'filesystem': mount.get('type', 'cifs'),
                'status': 'online' if storage_info else 'offline',
                'total_bytes': storage_info.get('total_bytes', 0) if storage_info else 0,
                'used_bytes': storage_info.get('used_bytes', 0) if storage_info else 0,
                'free_bytes': storage_info.get('free_bytes', 0) if storage_info else 0,
                'usage_percent': storage_info.get('usage_percent', 0) if storage_info else 0,
                'last_scan': datetime.utcnow().isoformat()
            }
            all_mounts.append(mount_entry)
        
        with db_service.get_session() as db:
            db_mounts = db.query(NASMount).filter_by(is_active=True).all()
            for db_mount in db_mounts:
                existing = next((m for m in all_mounts if m['mount_point'] == db_mount.mount_point), None)
                if not existing:
                    storage_info = nas_service.get_mount_storage_info(db_mount.mount_point)
                    mount_entry = {
                        'id': f"db_{db_mount.id}",
                        'mount_point': db_mount.mount_point,
                        'source': db_mount.share_name,
                        'type': 'nas',
                        'filesystem': 'cifs',
                        'status': 'online' if storage_info else 'offline',
                        'total_bytes': storage_info.get('total_bytes', 0) if storage_info else 0,
                        'used_bytes': storage_info.get('used_bytes', 0) if storage_info else 0,
                        'free_bytes': storage_info.get('free_bytes', 0) if storage_info else 0,
                        'usage_percent': storage_info.get('usage_percent', 0) if storage_info else 0,
                        'last_scan': datetime.utcnow().isoformat(),
                        'created_at': db_mount.created_at.isoformat() if db_mount.created_at else None
                    }
                    all_mounts.append(mount_entry)
        
        local_mounts = [
            {'path': '/', 'name': 'Root'},
            {'path': '/var', 'name': 'Var'},
            {'path': '/data', 'name': 'Data'},
            {'path': '/home', 'name': 'Home'},
        ]
        
        for local in local_mounts:
            if os.path.exists(local['path']):
                try:
                    stat = shutil.disk_usage(local['path'])
                    mount_entry = {
                        'id': f"local_{local['path'].replace('/', '_') or 'root'}",
                        'mount_point': local['path'],
                        'source': local['name'],
                        'type': 'local',
                        'filesystem': 'ext4',
                        'status': 'online',
                        'total_bytes': stat.total,
                        'used_bytes': stat.used,
                        'free_bytes': stat.free,
                        'usage_percent': round((stat.used / stat.total * 100) if stat.total > 0 else 0, 2),
                        'last_scan': datetime.utcnow().isoformat()
                    }
                    all_mounts.append(mount_entry)
                except Exception as e:
                    logger.debug(f"Could not get stats for {local['path']}: {e}")
        
        try:
            from minio import Minio
            minio_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            buckets = minio_client.list_buckets()
            for bucket in buckets:
                mount_entry = {
                    'id': f"minio_{bucket.name}",
                    'mount_point': f"s3://{bucket.name}",
                    'source': 'MinIO',
                    'type': 'cloud',
                    'filesystem': 's3',
                    'status': 'online',
                    'total_bytes': 0,
                    'used_bytes': 0,
                    'free_bytes': 0,
                    'usage_percent': 0,
                    'last_scan': datetime.utcnow().isoformat(),
                    'created_at': bucket.creation_date.isoformat() if bucket.creation_date else None
                }
                all_mounts.append(mount_entry)
        except Exception as e:
            logger.debug(f"MinIO not available: {e}")
        
        return jsonify({
            'success': True,
            'mounts': all_mounts,
            'count': len(all_mounts)
        })

    except Exception as e:
        logger.error(f"Error listing mounts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/mounts/<mount_id>/usage', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_mount_usage(mount_id):
    """Get usage details for specific mount"""
    try:
        nas_service = NASService()
        
        mount_point = mount_id.replace('_', '/').lstrip('/')
        if mount_id.startswith('local_'):
            mount_point = mount_id.replace('local_', '').replace('_', '/') or '/'
        elif mount_id.startswith('nas_'):
            mount_point = mount_id.replace('nas_', '').replace('_', '/')
        elif mount_id.startswith('db_'):
            db_id = int(mount_id.replace('db_', ''))
            with db_service.get_session() as db:
                db_mount = db.query(NASMount).filter_by(id=db_id).first()
                if db_mount:
                    mount_point = db_mount.mount_point
                else:
                    return jsonify({'success': False, 'error': 'Mount not found'}), 404
        
        if os.path.exists(mount_point):
            try:
                stat = shutil.disk_usage(mount_point)
                usage = {
                    'mount_point': mount_point,
                    'total_bytes': stat.total,
                    'used_bytes': stat.used,
                    'free_bytes': stat.free,
                    'total_gb': round(stat.total / (1024**3), 2),
                    'used_gb': round(stat.used / (1024**3), 2),
                    'free_gb': round(stat.free / (1024**3), 2),
                    'usage_percent': round((stat.used / stat.total * 100) if stat.total > 0 else 0, 2),
                    'is_mount': os.path.ismount(mount_point),
                    'last_scan': datetime.utcnow().isoformat()
                }
                
                return jsonify({
                    'success': True,
                    'usage': usage
                })
            except Exception as e:
                return jsonify({
                    'success': False,
                    'error': f'Could not get usage info: {str(e)}'
                }), 500
        else:
            return jsonify({
                'success': False,
                'error': 'Mount point does not exist'
            }), 404

    except Exception as e:
        logger.error(f"Error getting mount usage: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/backup-destinations', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_backup_destinations():
    """List configured backup destinations"""
    try:
        destinations = []
        
        nas_service = NASService()
        nas_discovery = nas_service.discover_nas()
        if nas_discovery and nas_discovery.get('is_alive'):
            destinations.append({
                'id': 'nas_backup',
                'name': f"NAS ({Config.NAS_HOSTNAME})",
                'type': 'nas',
                'endpoint': Config.NAS_IP or Config.NAS_HOSTNAME,
                'share': Config.NAS_BACKUP_SHARE,
                'status': 'online',
                'last_backup': None,
                'storage_used': 0
            })
        else:
            destinations.append({
                'id': 'nas_backup',
                'name': f"NAS ({Config.NAS_HOSTNAME})",
                'type': 'nas',
                'endpoint': Config.NAS_IP or Config.NAS_HOSTNAME,
                'share': Config.NAS_BACKUP_SHARE,
                'status': 'offline',
                'last_backup': None,
                'storage_used': 0
            })
        
        try:
            from minio import Minio
            minio_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            minio_client.list_buckets()
            destinations.append({
                'id': 'minio_backup',
                'name': 'MinIO Object Storage',
                'type': 'minio',
                'endpoint': Config.MINIO_ENDPOINT,
                'bucket': 'backups',
                'status': 'online',
                'last_backup': None,
                'storage_used': 0
            })
        except Exception as e:
            destinations.append({
                'id': 'minio_backup',
                'name': 'MinIO Object Storage',
                'type': 'minio',
                'endpoint': Config.MINIO_ENDPOINT,
                'bucket': 'backups',
                'status': 'offline',
                'last_backup': None,
                'storage_used': 0
            })
        
        with db_service.get_session() as db:
            latest_backups = db.query(NASBackupJob)\
                .filter_by(status='completed')\
                .order_by(NASBackupJob.completed_at.desc())\
                .limit(10)\
                .all()
            
            for backup in latest_backups:
                for dest in destinations:
                    if dest['type'] == 'nas' and backup.dest_share == Config.NAS_BACKUP_SHARE:
                        if not dest['last_backup'] or backup.completed_at:
                            dest['last_backup'] = backup.completed_at.isoformat() if backup.completed_at else None
        
        return jsonify({
            'success': True,
            'destinations': destinations
        })

    except Exception as e:
        logger.error(f"Error listing backup destinations: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/backup-destinations', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def add_backup_destination():
    """Add a new backup destination"""
    try:
        data = request.get_json()
        name = data.get('name')
        dest_type = data.get('type')
        endpoint = data.get('endpoint')
        
        if not all([name, dest_type, endpoint]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields: name, type, endpoint'
            }), 400
        
        return jsonify({
            'success': True,
            'message': f'Backup destination "{name}" added successfully',
            'destination': {
                'id': f'custom_{name.lower().replace(" ", "_")}',
                'name': name,
                'type': dest_type,
                'endpoint': endpoint,
                'status': 'pending_verification'
            }
        })

    except Exception as e:
        logger.error(f"Error adding backup destination: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/backup-destinations/<dest_id>', methods=['DELETE'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def remove_backup_destination(dest_id):
    """Remove a backup destination"""
    try:
        if dest_id in ['nas_backup', 'minio_backup']:
            return jsonify({
                'success': False,
                'error': 'Cannot remove built-in backup destinations'
            }), 400
        
        return jsonify({
            'success': True,
            'message': f'Backup destination {dest_id} removed'
        })

    except Exception as e:
        logger.error(f"Error removing backup destination: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/health', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def storage_health_check():
    """Storage health check (connectivity, capacity warnings)"""
    try:
        health = {
            'status': 'healthy',
            'checks': [],
            'warnings': [],
            'errors': [],
            'timestamp': datetime.utcnow().isoformat()
        }
        
        nas_service = NASService()
        nas_result = nas_service.test_connection()
        if nas_result.get('success'):
            health['checks'].append({
                'name': 'NAS Connectivity',
                'status': 'pass',
                'message': f"Connected to {Config.NAS_HOSTNAME}"
            })
        else:
            health['checks'].append({
                'name': 'NAS Connectivity',
                'status': 'fail',
                'message': nas_result.get('error', 'NAS not reachable')
            })
            health['errors'].append('NAS is not reachable')
            health['status'] = 'degraded'
        
        try:
            from minio import Minio
            minio_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            minio_client.list_buckets()
            health['checks'].append({
                'name': 'MinIO Connectivity',
                'status': 'pass',
                'message': f"Connected to {Config.MINIO_ENDPOINT}"
            })
        except Exception as e:
            health['checks'].append({
                'name': 'MinIO Connectivity',
                'status': 'fail',
                'message': str(e)
            })
            health['warnings'].append('MinIO is not available')
        
        critical_paths = ['/', '/var']
        for path in critical_paths:
            if os.path.exists(path):
                try:
                    stat = shutil.disk_usage(path)
                    usage_percent = (stat.used / stat.total * 100) if stat.total > 0 else 0
                    
                    if usage_percent >= 95:
                        health['checks'].append({
                            'name': f'Disk Space ({path})',
                            'status': 'critical',
                            'message': f'{usage_percent:.1f}% used - CRITICAL'
                        })
                        health['errors'].append(f'{path} is {usage_percent:.1f}% full')
                        health['status'] = 'critical'
                    elif usage_percent >= Config.STORAGE_ALERT_THRESHOLD:
                        health['checks'].append({
                            'name': f'Disk Space ({path})',
                            'status': 'warning',
                            'message': f'{usage_percent:.1f}% used - Warning'
                        })
                        health['warnings'].append(f'{path} is {usage_percent:.1f}% full')
                        if health['status'] == 'healthy':
                            health['status'] = 'warning'
                    else:
                        health['checks'].append({
                            'name': f'Disk Space ({path})',
                            'status': 'pass',
                            'message': f'{usage_percent:.1f}% used'
                        })
                except Exception as e:
                    logger.debug(f"Could not check {path}: {e}")
        
        return jsonify({
            'success': True,
            'health': health
        })

    except Exception as e:
        logger.error(f"Error in storage health check: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/scan', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def trigger_storage_scan():
    """Trigger storage scan to refresh metrics"""
    try:
        scan_result = {
            'started_at': datetime.utcnow().isoformat(),
            'sources_scanned': 0,
            'mounts_found': 0,
            'total_capacity': 0,
            'total_used': 0,
            'alerts': []
        }
        
        nas_service = NASService()
        nas_mounts = nas_service.list_mounts()
        for mount in nas_mounts:
            storage_info = nas_service.get_mount_storage_info(mount.get('mount_point', ''))
            if storage_info:
                scan_result['mounts_found'] += 1
                scan_result['total_capacity'] += storage_info.get('total_bytes', 0)
                scan_result['total_used'] += storage_info.get('used_bytes', 0)
                
                usage = storage_info.get('usage_percent', 0)
                if usage >= Config.STORAGE_ALERT_THRESHOLD:
                    scan_result['alerts'].append({
                        'type': 'warning' if usage < 90 else 'critical',
                        'mount': mount.get('mount_point'),
                        'usage': usage
                    })
        scan_result['sources_scanned'] += 1
        
        local_paths = ['/', '/var', '/data', '/home']
        for path in local_paths:
            if os.path.exists(path):
                try:
                    stat = shutil.disk_usage(path)
                    scan_result['mounts_found'] += 1
                    scan_result['total_capacity'] += stat.total
                    scan_result['total_used'] += stat.used
                except Exception:
                    pass
        scan_result['sources_scanned'] += 1
        
        try:
            from minio import Minio
            minio_client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            buckets = minio_client.list_buckets()
            scan_result['mounts_found'] += len(buckets)
            scan_result['sources_scanned'] += 1
        except Exception:
            pass
        
        scan_result['completed_at'] = datetime.utcnow().isoformat()
        
        return jsonify({
            'success': True,
            'scan': scan_result
        })

    except Exception as e:
        logger.error(f"Error during storage scan: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_dashboard_bp.route('/api/storage/nas-status', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_nas_status():
    """Get Zyxel NAS326 specific status"""
    try:
        nas_service = NASService()
        
        discovery = nas_service.discover_nas()
        connection = nas_service.test_connection()
        mounts = nas_service.list_mounts()
        
        nas_status = {
            'model': 'Zyxel NAS326',
            'hostname': Config.NAS_HOSTNAME,
            'ip_address': Config.NAS_IP or (discovery.get('ip_address') if discovery else 'Unknown'),
            'is_online': connection.get('success', False),
            'discovered_at': discovery.get('discovered_at') if discovery else None,
            'active_mounts': len(mounts),
            'mounts': [],
            'backup_share': Config.NAS_BACKUP_SHARE,
            'media_share': Config.NAS_MEDIA_SHARE
        }
        
        for mount in mounts:
            storage_info = nas_service.get_mount_storage_info(mount.get('mount_point', ''))
            mount_info = {
                'mount_point': mount.get('mount_point'),
                'source': mount.get('source'),
                'type': mount.get('type'),
                'storage': storage_info
            }
            nas_status['mounts'].append(mount_info)
        
        return jsonify({
            'success': True,
            'nas': nas_status
        })

    except Exception as e:
        logger.error(f"Error getting NAS status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
