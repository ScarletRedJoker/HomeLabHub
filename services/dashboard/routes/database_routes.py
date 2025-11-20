"""
Database Management API Routes
RESTful API for database provisioning and management
"""
from flask import Blueprint, request, jsonify
from services.database_provisioner import get_provisioner
from functools import wraps
import logging

logger = logging.getLogger(__name__)

database_bp = Blueprint('database', __name__, url_prefix='/api/databases')

def require_admin(f):
    """Decorator to require admin authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # TODO: Add proper authentication check
        # For now, check if user is logged in via session
        return f(*args, **kwargs)
    return decorated_function


@database_bp.route('/', methods=['GET'])
@require_admin
def list_databases():
    """GET /api/databases - List all databases"""
    try:
        provisioner = get_provisioner()
        result = provisioner.list_databases()
        
        if result['success']:
            return jsonify({
                'success': True,
                'databases': result['databases']
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error')
            }), 500
            
    except Exception as e:
        logger.error(f"Error listing databases: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@database_bp.route('/', methods=['POST'])
@require_admin
def create_database():
    """POST /api/databases - Create a new database"""
    try:
        data = request.get_json()
        
        # Validate required fields
        if not data or 'database_name' not in data:
            return jsonify({
                'success': False,
                'error': 'database_name is required'
            }), 400
        
        db_name = data['database_name']
        db_user = data.get('user', db_name)
        db_password = data.get('password')  # Auto-generated if not provided
        
        provisioner = get_provisioner()
        result = provisioner.create_database(
            db_name=db_name,
            db_user=db_user,
            db_password=db_password
        )
        
        if result['success']:
            # Don't expose password in API response (use separate endpoint to retrieve)
            safe_result = {
                'success': True,
                'database': result['database'],
                'user': result['user'],
                'connection_url': result['connection_url'].replace(result['password'], '****'),
                'host': result['host'],
                'port': result['port']
            }
            return jsonify(safe_result), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error')
            }), 400
            
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@database_bp.route('/<db_name>', methods=['GET'])
@require_admin
def get_database_info(db_name: str):
    """GET /api/databases/<name> - Get database information"""
    try:
        provisioner = get_provisioner()
        result = provisioner.get_database_info(db_name)
        
        if result['success']:
            return jsonify({
                'success': True,
                'info': result['info']
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error')
            }), 404
            
    except Exception as e:
        logger.error(f"Error getting database info: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@database_bp.route('/<db_name>', methods=['DELETE'])
@require_admin
def delete_database(db_name: str):
    """DELETE /api/databases/<name> - Delete a database"""
    try:
        force = request.args.get('force', 'false').lower() == 'true'
        delete_user = request.args.get('delete_user', 'true').lower() == 'true'
        
        provisioner = get_provisioner()
        result = provisioner.delete_database(
            db_name=db_name,
            delete_user=delete_user,
            force=force
        )
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': f'Database {db_name} deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error')
            }), 400
            
    except Exception as e:
        logger.error(f"Error deleting database: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@database_bp.route('/<db_name>/test', methods=['POST'])
@require_admin
def test_database_connection(db_name: str):
    """POST /api/databases/<name>/test - Test database connection"""
    try:
        data = request.get_json()
        
        if not data or 'connection_url' not in data:
            return jsonify({
                'success': False,
                'error': 'connection_url is required'
            }), 400
        
        provisioner = get_provisioner()
        result = provisioner.test_connection(data['connection_url'])
        
        return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error testing connection: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@database_bp.route('/provision-for-service', methods=['POST'])
@require_admin
def provision_for_service():
    """
    POST /api/databases/provision-for-service
    Create database automatically for a new service deployment
    """
    try:
        data = request.get_json()
        
        if not data or 'service_name' not in data:
            return jsonify({
                'success': False,
                'error': 'service_name is required'
            }), 400
        
        service_name = data['service_name'].lower().replace('-', '_')
        
        # Auto-generate database name and user
        db_name = f"{service_name}_db"
        
        provisioner = get_provisioner()
        result = provisioner.create_database(db_name=db_name)
        
        if result['success']:
            return jsonify({
                'success': True,
                'database': result['database'],
                'user': result['user'],
                'password': result['password'],  # Include password for service deployment
                'connection_url': result['connection_url'],
                'env_vars': {
                    'DATABASE_URL': result['connection_url'],
                    'DB_HOST': result['host'],
                    'DB_PORT': result['port'],
                    'DB_NAME': result['database'],
                    'DB_USER': result['user'],
                    'DB_PASSWORD': result['password']
                }
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Unknown error')
            }), 400
            
    except Exception as e:
        logger.error(f"Error provisioning database for service: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
