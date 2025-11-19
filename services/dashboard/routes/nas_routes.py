from flask import Blueprint, render_template, jsonify, request
from services.nas_service import NASService
from sqlalchemy.orm import Session
from database import get_db
from models import NASMount, NASBackupJob
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

nas_bp = Blueprint('nas', __name__, url_prefix='/nas')


@nas_bp.route('/')
def nas_management():
    """Render NAS management page"""
    return render_template('nas_management.html')


@nas_bp.route('/api/discover', methods=['POST'])
def discover_nas():
    """Discover NAS on local network"""
    try:
        nas_service = NASService()
        result = nas_service.discover_nas()
        
        if result:
            return jsonify({
                'success': True,
                'nas': result
            })
        else:
            return jsonify({
                'success': False,
                'error': 'NAS not found on network'
            }), 404

    except Exception as e:
        logger.error(f"NAS discovery error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/test-connection', methods=['POST'])
def test_connection():
    """Test connection to NAS"""
    try:
        nas_service = NASService()
        result = nas_service.test_connection()
        
        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Connection test error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/mounts', methods=['GET'])
def list_mounts():
    """List all NAS mounts"""
    try:
        nas_service = NASService()
        mounts = nas_service.list_mounts()
        
        db: Session = next(get_db())
        db_mounts = db.query(NASMount).all()
        
        mounts_with_info = []
        for mount in mounts:
            storage_info = nas_service.get_mount_storage_info(mount['mount_point'])
            mount['storage'] = storage_info
            mounts_with_info.append(mount)
        
        return jsonify({
            'success': True,
            'mounts': mounts_with_info,
            'configured_mounts': [
                {
                    'id': m.id,
                    'share_name': m.share_name,
                    'mount_point': m.mount_point,
                    'is_active': m.is_active,
                    'created_at': m.created_at.isoformat()
                }
                for m in db_mounts
            ]
        })

    except Exception as e:
        logger.error(f"Error listing mounts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/mount', methods=['POST'])
def mount_share():
    """Mount NAS share"""
    try:
        data = request.get_json()
        share_name = data.get('share_name')
        mount_point = data.get('mount_point')
        username = data.get('username')
        password = data.get('password')

        if not all([share_name, mount_point]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400

        nas_service = NASService()
        result = nas_service.mount_smb_share(share_name, mount_point, username, password)

        if result.get('success'):
            db: Session = next(get_db())
            
            nas_mount = NASMount(
                share_name=share_name,
                mount_point=mount_point,
                is_active=True
            )
            db.add(nas_mount)
            db.commit()

        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error mounting share: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/unmount', methods=['POST'])
def unmount_share():
    """Unmount NAS share"""
    try:
        data = request.get_json()
        mount_point = data.get('mount_point')

        if not mount_point:
            return jsonify({
                'success': False,
                'error': 'Missing mount_point'
            }), 400

        nas_service = NASService()
        result = nas_service.unmount_share(mount_point)

        if result.get('success'):
            db: Session = next(get_db())
            mount = db.query(NASMount).filter_by(mount_point=mount_point).first()
            if mount:
                mount.is_active = False
                db.commit()

        return jsonify(result), 200 if result.get('success') else 500

    except Exception as e:
        logger.error(f"Error unmounting share: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/storage/<path:mount_point>', methods=['GET'])
def get_storage_info(mount_point):
    """Get storage information for mount point"""
    try:
        nas_service = NASService()
        storage_info = nas_service.get_mount_storage_info(f'/{mount_point}')
        
        if storage_info:
            return jsonify({
                'success': True,
                'storage': storage_info
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Mount point not found or not mounted'
            }), 404

    except Exception as e:
        logger.error(f"Error getting storage info: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/backup', methods=['POST'])
def create_backup():
    """Create backup to NAS"""
    try:
        data = request.get_json()
        source_path = data.get('source_path')
        dest_share = data.get('dest_share')
        backup_name = data.get('backup_name')

        if not all([source_path, dest_share, backup_name]):
            return jsonify({
                'success': False,
                'error': 'Missing required fields'
            }), 400

        db: Session = next(get_db())
        
        backup_job = NASBackupJob(
            source_path=source_path,
            dest_share=dest_share,
            backup_name=backup_name,
            status='pending'
        )
        db.add(backup_job)
        db.commit()

        from workers.nas_worker import run_nas_backup
        run_nas_backup.delay(backup_job.id)

        return jsonify({
            'success': True,
            'job_id': backup_job.id,
            'message': 'Backup job started'
        })

    except Exception as e:
        logger.error(f"Error creating backup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@nas_bp.route('/api/backups', methods=['GET'])
def list_backups():
    """List all backup jobs"""
    try:
        db: Session = next(get_db())
        backups = db.query(NASBackupJob).order_by(NASBackupJob.created_at.desc()).limit(50).all()
        
        return jsonify({
            'success': True,
            'backups': [
                {
                    'id': b.id,
                    'source_path': b.source_path,
                    'dest_share': b.dest_share,
                    'backup_name': b.backup_name,
                    'status': b.status,
                    'error_message': b.error_message,
                    'created_at': b.created_at.isoformat(),
                    'completed_at': b.completed_at.isoformat() if b.completed_at else None
                }
                for b in backups
            ]
        })

    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
