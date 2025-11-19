"""
Health Check Routes for Dashboard Service
Provides health status endpoint for monitoring and Docker healthcheck
"""
from flask import Blueprint, jsonify
import time
import redis
import docker
from datetime import datetime
from models import get_engine
import logging

health_bp = Blueprint('health', __name__)
logger = logging.getLogger(__name__)

# Track service start time for uptime calculation
service_start_time = time.time()

@health_bp.route('/api/health', methods=['GET'])
def health_check():
    """
    Comprehensive health check endpoint for dashboard service
    Returns detailed health status of all dependencies
    """
    try:
        checks = {}
        overall_status = "healthy"
        
        # Check database connectivity
        try:
            engine = get_engine()
            with engine.connect() as conn:
                conn.execute("SELECT 1")
            checks['database'] = 'healthy'
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            checks['database'] = 'unhealthy'
            overall_status = 'degraded'
        
        # Check Redis connectivity
        try:
            import os
            redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
            redis_client = redis.from_url(redis_url)
            redis_client.ping()
            checks['redis'] = 'healthy'
        except Exception as e:
            logger.error(f"Redis health check failed: {e}")
            checks['redis'] = 'unhealthy'
            overall_status = 'degraded'
        
        # Check MinIO connectivity
        try:
            import os
            from minio import Minio
            
            minio_endpoint = os.environ.get('MINIO_ENDPOINT', 'localhost:9000')
            minio_user = os.environ.get('MINIO_ROOT_USER', 'admin')
            minio_password = os.environ.get('MINIO_ROOT_PASSWORD', 'minio_admin_password')
            
            # Remove http:// or https:// prefix if present
            minio_endpoint = minio_endpoint.replace('http://', '').replace('https://', '')
            
            # Determine if we should use secure connection
            secure = minio_endpoint.startswith('https') or ':443' in minio_endpoint
            
            minio_client = Minio(
                minio_endpoint,
                access_key=minio_user,
                secret_key=minio_password,
                secure=secure
            )
            
            # List buckets as a simple health check
            list(minio_client.list_buckets())
            checks['minio'] = 'healthy'
        except Exception as e:
            logger.warning(f"MinIO health check failed: {e}")
            checks['minio'] = 'degraded'
            # MinIO being down shouldn't make the whole service unhealthy
        
        # Check Docker connectivity
        try:
            docker_client = docker.from_env()
            docker_client.ping()
            checks['docker'] = 'healthy'
        except Exception as e:
            logger.error(f"Docker health check failed: {e}")
            checks['docker'] = 'unhealthy'
            overall_status = 'degraded'
        
        # Check Celery worker connectivity
        try:
            import os
            redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
            redis_client = redis.from_url(redis_url)
            
            # Check if there are active Celery workers
            # We use Redis to inspect Celery stats
            from celery import Celery
            celery_app = Celery('homelab')
            celery_app.config_from_object({
                'broker_url': redis_url,
                'result_backend': redis_url,
            })
            
            # Get active workers
            inspect = celery_app.control.inspect(timeout=2.0)
            active_workers = inspect.active()
            
            if active_workers:
                checks['celery'] = 'healthy'
            else:
                checks['celery'] = 'no_workers'
                overall_status = 'degraded'
        except Exception as e:
            logger.warning(f"Celery health check failed: {e}")
            checks['celery'] = 'unknown'
        
        # Calculate uptime
        uptime_seconds = int(time.time() - service_start_time)
        
        return jsonify({
            'status': overall_status,
            'service': 'dashboard',
            'uptime': uptime_seconds,
            'checks': checks,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200 if overall_status == 'healthy' else 503
        
    except Exception as e:
        logger.error(f"Health check endpoint failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'service': 'dashboard',
            'uptime': int(time.time() - service_start_time),
            'checks': {
                'error': str(e)
            },
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 503

@health_bp.route('/health', methods=['GET'])
def simple_health():
    """
    Simple health check endpoint for Docker healthcheck
    Returns 200 OK if service is running
    """
    return jsonify({
        'status': 'healthy',
        'service': 'dashboard',
        'timestamp': datetime.utcnow().isoformat() + 'Z'
    }), 200
