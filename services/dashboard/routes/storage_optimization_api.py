"""Storage Optimization API Routes - MinIO Lifecycle Management"""
import logging
from flask import Blueprint, request, jsonify, session
from functools import wraps

from services.minio_lifecycle_service import minio_lifecycle_service

logger = logging.getLogger(__name__)

storage_optimization_bp = Blueprint('storage_optimization', __name__)


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@storage_optimization_bp.route('/api/storage/minio/buckets', methods=['GET'])
@login_required
def list_minio_buckets():
    """
    List all MinIO buckets
    
    Returns:
        JSON with list of buckets
    """
    try:
        result = minio_lifecycle_service.list_buckets()
        
        if not result.get('success'):
            return jsonify(result), 503
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error listing MinIO buckets: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_optimization_bp.route('/api/storage/minio/lifecycle', methods=['GET'])
@login_required
def get_lifecycle_policies():
    """
    Get lifecycle policies for a bucket
    
    Query params:
        bucket: Bucket name (required)
    
    Returns:
        JSON with lifecycle policies
    """
    try:
        bucket = request.args.get('bucket')
        
        if not bucket:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        result = minio_lifecycle_service.get_bucket_lifecycle(bucket)
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error getting lifecycle policies: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_optimization_bp.route('/api/storage/minio/lifecycle', methods=['POST'])
@login_required
def update_lifecycle_policies():
    """
    Update lifecycle policies for a bucket
    
    JSON body:
        bucket: Bucket name (required)
        rules: List of lifecycle rules (required)
            Example:
            [
                {
                    "id": "DeleteTempFiles",
                    "prefix": "temp/",
                    "expiration_days": 90,
                    "enabled": true
                },
                {
                    "id": "CleanupIncompleteUploads",
                    "abort_incomplete_days": 7,
                    "enabled": true
                }
            ]
    
    Returns:
        JSON with success status
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        bucket = data.get('bucket')
        rules = data.get('rules')
        
        if not bucket:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        if not rules or not isinstance(rules, list):
            return jsonify({
                'success': False,
                'error': 'Rules array is required'
            }), 400
        
        result = minio_lifecycle_service.set_bucket_lifecycle(bucket, rules)
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error updating lifecycle policies: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_optimization_bp.route('/api/storage/minio/lifecycle', methods=['DELETE'])
@login_required
def delete_lifecycle_policies():
    """
    Delete all lifecycle policies from a bucket
    
    Query params:
        bucket: Bucket name (required)
    
    Returns:
        JSON with success status
    """
    try:
        bucket = request.args.get('bucket')
        
        if not bucket:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        result = minio_lifecycle_service.delete_bucket_lifecycle(bucket)
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error deleting lifecycle policies: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_optimization_bp.route('/api/storage/minio/stats', methods=['GET'])
@login_required
def get_storage_stats():
    """
    Get storage statistics for a bucket
    
    Query params:
        bucket: Bucket name (required)
    
    Returns:
        JSON with storage statistics
    """
    try:
        bucket = request.args.get('bucket')
        
        if not bucket:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        result = minio_lifecycle_service.get_storage_stats(bucket)
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error getting storage stats: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_optimization_bp.route('/api/storage/minio/cleanup', methods=['POST'])
@login_required
def trigger_cleanup():
    """
    Manually trigger cleanup of old files
    
    JSON body:
        bucket: Bucket name (required)
        prefix: Object prefix to filter (default: "")
        days: Delete objects older than this many days (required)
    
    Returns:
        JSON with cleanup results
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        bucket = data.get('bucket')
        prefix = data.get('prefix', '')
        days = data.get('days')
        
        if not bucket:
            return jsonify({
                'success': False,
                'error': 'Bucket name is required'
            }), 400
        
        if days is None:
            return jsonify({
                'success': False,
                'error': 'Days parameter is required'
            }), 400
        
        try:
            days = int(days)
            if days < 1:
                raise ValueError("Days must be positive")
        except ValueError as e:
            return jsonify({
                'success': False,
                'error': f'Invalid days parameter: {str(e)}'
            }), 400
        
        result = minio_lifecycle_service.cleanup_old_files(bucket, prefix, days)
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error triggering cleanup: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
