"""Database Console Routes - Unified cross-environment database management"""
import logging
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, session, render_template

from services.db_admin_service import db_admin_service
from services.db_service import db_service
from services.environment_service import environment_service, ENVIRONMENTS
from models.db_admin import DBCredential, DBBackupJob
from models.rbac import Permission
from sqlalchemy import select
from config import Config
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission

logger = logging.getLogger(__name__)

database_console_bp = Blueprint('database_console', __name__)


@database_console_bp.route('/database-console')
@require_web_auth
def database_console_page():
    """Render the unified database console page"""
    return render_template('database_console.html')


@database_console_bp.route('/api/db-console/environments', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_environments():
    """List databases per environment (local/linode)"""
    try:
        environments = []
        
        for env_id, config in ENVIRONMENTS.items():
            env_data = {
                'env_id': env_id,
                'name': config.name,
                'description': config.description,
                'env_type': config.env_type,
                'hostname': config.hostname,
                'databases': config.databases,
                'status': 'unknown'
            }
            
            status = environment_service.get_environment_status(env_id)
            if status:
                env_data['status'] = status.get('overall_health', 'unknown')
                env_data['database_status'] = status.get('databases', {})
            
            environments.append(env_data)
        
        return jsonify({
            'success': True,
            'environments': environments,
            'total': len(environments)
        })
    
    except Exception as e:
        logger.error(f"Error listing environments: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/databases', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_all_databases():
    """List all databases across environments with optional filtering"""
    try:
        env_filter = request.args.get('environment')
        databases = []
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            query = select(DBCredential).order_by(DBCredential.host, DBCredential.db_name)
            credentials = db_session.execute(query).scalars().all()
            
            for cred in credentials:
                env_id = _determine_environment(cred.host)
                
                if env_filter and env_filter != 'all' and env_id != env_filter:
                    continue
                
                db_info = cred.to_dict(include_password=False)
                db_info['environment'] = env_id
                db_info['environment_name'] = ENVIRONMENTS.get(env_id, {})
                if hasattr(db_info['environment_name'], 'name'):
                    db_info['environment_name'] = db_info['environment_name'].name
                else:
                    db_info['environment_name'] = env_id.title()
                
                db_stats = _get_database_stats(cred)
                db_info.update(db_stats)
                
                databases.append(db_info)
        
        return jsonify({
            'success': True,
            'databases': databases,
            'total': len(databases)
        })
    
    except Exception as e:
        logger.error(f"Error listing databases: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/databases/<env_id>/<db_name>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_database_details(env_id, db_name):
    """Get detailed information about a specific database"""
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credential = db_session.execute(
                select(DBCredential).where(DBCredential.db_name == db_name)
            ).scalar_one_or_none()
            
            if not credential:
                return jsonify({
                    'success': False,
                    'error': 'Database not found'
                }), 404
            
            db_info = credential.to_dict(include_password=False)
            db_info['environment'] = env_id
            
            db_stats = _get_database_stats(credential)
            db_info.update(db_stats)
            
            backups = db_session.execute(
                select(DBBackupJob)
                .where(DBBackupJob.db_name == db_name)
                .order_by(DBBackupJob.created_at.desc())
                .limit(5)
            ).scalars().all()
            db_info['recent_backups'] = [b.to_dict() for b in backups]
            
            return jsonify({
                'success': True,
                'database': db_info
            })
    
    except Exception as e:
        logger.error(f"Error getting database details: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/credentials', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_credentials():
    """List stored credentials with masked values"""
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credentials = db_session.execute(
                select(DBCredential).order_by(DBCredential.db_name)
            ).scalars().all()
            
            cred_list = []
            for cred in credentials:
                cred_data = cred.to_dict(include_password=False)
                cred_data['environment'] = _determine_environment(cred.host)
                cred_data['password_masked'] = '••••••••'
                cred_list.append(cred_data)
            
            return jsonify({
                'success': True,
                'credentials': cred_list,
                'total': len(cred_list)
            })
    
    except Exception as e:
        logger.error(f"Error listing credentials: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/credentials', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def store_credential():
    """Store new database credentials"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        required_fields = ['db_name', 'username', 'password', 'host']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        host = data['host']
        if host not in Config.DB_ADMIN_ALLOWED_HOSTS:
            return jsonify({
                'success': False,
                'error': f'Host {host} not in allowed hosts list'
            }), 403
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        encrypted_password = db_admin_service.encrypt_password(data['password'])
        
        with db_service.get_session() as db_session:
            credential = DBCredential(
                db_name=data['db_name'],
                username=data['username'],
                password_hash=encrypted_password,
                host=host,
                port=data.get('port', 5432),
                metadata=data.get('metadata', {})
            )
            
            db_session.add(credential)
            db_session.commit()
            db_session.refresh(credential)
            
            logger.info(f"Added database credential: {credential.db_name}@{credential.host}")
            
            return jsonify({
                'success': True,
                'credential': credential.to_dict(include_password=False),
                'message': 'Credential stored successfully'
            }), 201
    
    except Exception as e:
        logger.error(f"Error storing credential: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/credentials/<credential_id>', methods=['DELETE'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def remove_credential(credential_id):
    """Remove stored credentials"""
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credential = db_session.execute(
                select(DBCredential).where(DBCredential.id == uuid.UUID(credential_id))
            ).scalar_one_or_none()
            
            if not credential:
                return jsonify({
                    'success': False,
                    'error': 'Credential not found'
                }), 404
            
            db_name = credential.db_name
            db_session.delete(credential)
            db_session.commit()
            
            logger.info(f"Removed credential: {db_name}")
            
            return jsonify({
                'success': True,
                'message': f'Credential for {db_name} removed successfully'
            })
    
    except Exception as e:
        logger.error(f"Error removing credential: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/test-connection', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def test_connection():
    """Test database connection"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        credential_id = data.get('credential_id')
        
        if credential_id:
            if not db_service.is_available:
                return jsonify({
                    'success': False,
                    'error': 'Database service not available'
                }), 503
            
            with db_service.get_session() as db_session:
                credential = db_session.execute(
                    select(DBCredential).where(DBCredential.id == uuid.UUID(credential_id))
                ).scalar_one_or_none()
                
                if not credential:
                    return jsonify({
                        'success': False,
                        'error': 'Credential not found'
                    }), 404
                
                password = db_admin_service.decrypt_password(credential.password_hash)
                
                result = db_admin_service.test_connection(
                    host=credential.host,
                    port=credential.port,
                    database=credential.db_name,
                    username=credential.username,
                    password=password
                )
                
                credential.last_tested_at = datetime.utcnow()
                credential.test_status = result['status']
                db_session.commit()
                
                return jsonify(result)
        else:
            required_fields = ['host', 'port', 'database', 'username', 'password']
            for field in required_fields:
                if field not in data:
                    return jsonify({
                        'success': False,
                        'error': f'Missing required field: {field}'
                    }), 400
            
            result = db_admin_service.test_connection(
                host=data['host'],
                port=data['port'],
                database=data['database'],
                username=data['username'],
                password=data['password']
            )
            
            return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error testing connection: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/backups', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_backups():
    """List available backups with optional filtering"""
    try:
        db_name = request.args.get('db_name')
        environment = request.args.get('environment')
        days = int(request.args.get('days', 90))
        
        backups = db_admin_service.list_backups(db_name=db_name, days=days)
        
        if environment and environment != 'all':
            filtered_backups = []
            for backup in backups:
                host = backup.get('metadata', {}).get('host', '')
                if _determine_environment(host) == environment:
                    filtered_backups.append(backup)
            backups = filtered_backups
        
        for backup in backups:
            host = backup.get('metadata', {}).get('host', '')
            backup['environment'] = _determine_environment(host)
        
        return jsonify({
            'success': True,
            'backups': backups,
            'total': len(backups)
        })
    
    except Exception as e:
        logger.error(f"Error listing backups: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/backup', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def trigger_backup():
    """Trigger a database backup"""
    try:
        data = request.get_json()
        
        if not data or 'credential_id' not in data:
            return jsonify({
                'success': False,
                'error': 'credential_id is required'
            }), 400
        
        backup_type = data.get('backup_type', 'full')
        compression = data.get('compression', 'gzip')
        run_async = data.get('async', True)
        
        if backup_type not in ['full', 'schema_only', 'data_only']:
            return jsonify({
                'success': False,
                'error': 'Invalid backup type'
            }), 400
        
        result = db_admin_service.backup_database(
            db_credential_id=uuid.UUID(data['credential_id']),
            backup_type=backup_type,
            compression=compression
        )
        
        if not result['success']:
            return jsonify(result), 500
        
        if run_async:
            try:
                from workers.db_admin_worker import backup_database_async
                task = backup_database_async.delay(uuid.UUID(result['backup_job_id']))
                
                return jsonify({
                    'success': True,
                    'backup_job': result['backup_job'],
                    'task_id': task.id,
                    'message': 'Backup job created and queued'
                })
            except Exception as e:
                logger.warning(f"Async backup not available, running sync: {e}")
                exec_result = db_admin_service.execute_backup(uuid.UUID(result['backup_job_id']))
                return jsonify(exec_result)
        else:
            exec_result = db_admin_service.execute_backup(uuid.UUID(result['backup_job_id']))
            return jsonify(exec_result)
    
    except Exception as e:
        logger.error(f"Error triggering backup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/restore', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def trigger_restore():
    """Trigger a database restore"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        if 'backup_job_id' not in data:
            return jsonify({
                'success': False,
                'error': 'backup_job_id is required'
            }), 400
        
        target_credential_id = data.get('target_credential_id')
        run_async = data.get('async', True)
        
        if run_async:
            try:
                from workers.db_admin_worker import restore_database_async
                task = restore_database_async.delay(
                    uuid.UUID(data['backup_job_id']),
                    uuid.UUID(target_credential_id) if target_credential_id else None
                )
                
                return jsonify({
                    'success': True,
                    'task_id': task.id,
                    'message': 'Restore job queued'
                })
            except Exception as e:
                logger.warning(f"Async restore not available, running sync: {e}")
                result = db_admin_service.restore_database(
                    backup_job_id=uuid.UUID(data['backup_job_id']),
                    target_db_credential_id=uuid.UUID(target_credential_id) if target_credential_id else None
                )
                return jsonify(result)
        else:
            result = db_admin_service.restore_database(
                backup_job_id=uuid.UUID(data['backup_job_id']),
                target_db_credential_id=uuid.UUID(target_credential_id) if target_credential_id else None
            )
            return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error triggering restore: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/backup/status/<task_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_backup_status(task_id):
    """Get backup/restore task status"""
    try:
        try:
            from celery.result import AsyncResult
            from workers.celery_app import celery_app
            
            task = AsyncResult(task_id, app=celery_app)
            
            return jsonify({
                'success': True,
                'task_id': task_id,
                'status': task.status,
                'ready': task.ready(),
                'result': task.result if task.ready() else None
            })
        except Exception as e:
            logger.warning(f"Celery not available for task status: {e}")
            return jsonify({
                'success': True,
                'task_id': task_id,
                'status': 'UNKNOWN',
                'message': 'Celery not available, task may have completed synchronously'
            })
    
    except Exception as e:
        logger.error(f"Error getting backup status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@database_console_bp.route('/api/db-console/connection-string/<credential_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_connection_string(credential_id):
    """Get connection string for a database (password masked unless requested)"""
    try:
        show_password = request.args.get('show_password', 'false').lower() == 'true'
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as db_session:
            credential = db_session.execute(
                select(DBCredential).where(DBCredential.id == uuid.UUID(credential_id))
            ).scalar_one_or_none()
            
            if not credential:
                return jsonify({
                    'success': False,
                    'error': 'Credential not found'
                }), 404
            
            if show_password:
                password = db_admin_service.decrypt_password(credential.password_hash)
            else:
                password = '********'
            
            connection_string = f"postgresql://{credential.username}:{password}@{credential.host}:{credential.port}/{credential.db_name}"
            
            return jsonify({
                'success': True,
                'connection_string': connection_string,
                'password_shown': show_password
            })
    
    except Exception as e:
        logger.error(f"Error getting connection string: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def _determine_environment(host: str) -> str:
    """Determine environment based on host"""
    local_hosts = ['localhost', '127.0.0.1', '192.168.', 'host.evindrake.net']
    linode_hosts = ['linode', 'discord-bot-db', 'postgres']
    
    for local in local_hosts:
        if local in host:
            return 'local'
    
    for linode in linode_hosts:
        if linode in host:
            return 'linode'
    
    return 'unknown'


def _get_database_stats(credential: DBCredential) -> dict:
    """Get database statistics (size, connections, etc.)"""
    stats = {
        'size_mb': None,
        'connection_count': None,
        'table_count': None
    }
    
    try:
        password = db_admin_service.decrypt_password(credential.password_hash)
        
        import psycopg2
        conn = psycopg2.connect(
            host=credential.host,
            port=credential.port,
            database=credential.db_name,
            user=credential.username,
            password=password,
            connect_timeout=5
        )
        
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT pg_database_size(%s) / 1024 / 1024 as size_mb
            """, (credential.db_name,))
            result = cursor.fetchone()
            if result:
                stats['size_mb'] = round(result[0], 2)
            
            cursor.execute("""
                SELECT count(*) FROM pg_stat_activity 
                WHERE datname = %s
            """, (credential.db_name,))
            result = cursor.fetchone()
            if result:
                stats['connection_count'] = result[0]
            
            cursor.execute("""
                SELECT count(*) FROM information_schema.tables 
                WHERE table_schema = 'public'
            """)
            result = cursor.fetchone()
            if result:
                stats['table_count'] = result[0]
        
        conn.close()
    except Exception as e:
        logger.debug(f"Could not get stats for {credential.db_name}: {e}")
    
    return stats


__all__ = ['database_console_bp']
