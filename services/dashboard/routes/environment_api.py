"""
Environment Control Plane API Routes
Unified API for managing multi-environment homelab infrastructure
"""
from flask import Blueprint, jsonify, request, render_template
from services.environment_service import environment_service
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from models.rbac import Permission
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

environment_bp = Blueprint('environment', __name__)


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@environment_bp.route('/command-center')
@require_web_auth
def command_center_page():
    """Render Command Center page"""
    return render_template('command_center.html')


@environment_bp.route('/api/environments', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_environments():
    """
    GET /api/environments
    List all configured environments with status summary
    
    Returns:
        JSON array of environment objects with basic status
    """
    try:
        environments = environment_service.list_environments()
        return make_response(True, {
            'environments': environments,
            'count': len(environments),
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        logger.error(f"Error listing environments: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/<env_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_environment(env_id):
    """
    GET /api/environments/<env_id>
    Get detailed environment information
    
    Returns:
        JSON object with environment details
    """
    try:
        environment = environment_service.get_environment(env_id)
        
        if not environment:
            return make_response(False, message=f'Environment {env_id} not found', status_code=404)
        
        return make_response(True, environment)
    except Exception as e:
        logger.error(f"Error getting environment {env_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/<env_id>/status', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_environment_status(env_id):
    """
    GET /api/environments/<env_id>/status
    Get comprehensive status for an environment
    
    Returns:
        JSON object with full environment status (host, services, databases, storage)
    """
    try:
        status = environment_service.get_environment_status(env_id)
        
        if 'error' in status:
            return make_response(False, message=status['error'], status_code=404)
        
        return make_response(True, status)
    except Exception as e:
        logger.error(f"Error getting environment status for {env_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/<env_id>/services', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_environment_services(env_id):
    """
    GET /api/environments/<env_id>/services
    Get Docker container/service status for environment
    
    Returns:
        JSON object with services list and counts
    """
    try:
        services_status = environment_service._get_services_status(env_id)
        
        if not services_status.get('available'):
            return make_response(False, 
                                 message=services_status.get('error', 'Services not available'), 
                                 status_code=500)
        
        return make_response(True, {
            'env_id': env_id,
            **services_status
        })
    except Exception as e:
        logger.error(f"Error getting services for {env_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/<env_id>/health', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def run_health_checks(env_id):
    """
    GET /api/environments/<env_id>/health
    Run comprehensive health checks for an environment
    
    Returns:
        JSON object with health check results
    """
    try:
        result = environment_service.run_health_checks(env_id)
        
        if not result.get('success'):
            return make_response(False, message=result.get('error'), status_code=404)
        
        return make_response(True, result)
    except Exception as e:
        logger.error(f"Error running health checks for {env_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/<env_id>/deploy', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def trigger_deployment(env_id):
    """
    POST /api/environments/<env_id>/deploy
    Trigger deployment on an environment
    
    Request body (optional):
        {
            "services": ["service1", "service2"],  // Optional: specific services to deploy
            "force": true  // Optional: force redeploy
        }
    
    Returns:
        JSON object with deployment result
    """
    try:
        options = request.get_json() or {}
        
        result = environment_service.trigger_deployment(env_id, options)
        
        if not result.get('success'):
            return make_response(False, 
                                 data=result, 
                                 message=result.get('error'), 
                                 status_code=500)
        
        logger.info(f"Deployment triggered for {env_id}")
        return make_response(True, result, message='Deployment triggered successfully')
    except Exception as e:
        logger.error(f"Error triggering deployment for {env_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/activity', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_activity():
    """
    GET /api/environments/activity
    Get recent activity/alerts across environments
    
    Query params:
        env_id: string (optional) - Filter to specific environment
        limit: int (optional, default: 20) - Number of activities to return
    
    Returns:
        JSON array of activity entries
    """
    try:
        env_id = request.args.get('env_id')
        limit = int(request.args.get('limit', 20))
        
        activities = environment_service.get_recent_activity(env_id, limit)
        
        return make_response(True, {
            'activities': activities,
            'count': len(activities)
        })
    except Exception as e:
        logger.error(f"Error getting activity: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/<env_id>/restart-service', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def restart_service(env_id):
    """
    POST /api/environments/<env_id>/restart-service
    Restart a specific service/container in an environment
    
    Request body:
        {
            "service": "container-name"
        }
    
    Returns:
        JSON object with restart result
    """
    try:
        data = request.get_json() or {}
        service_name = data.get('service')
        
        if not service_name:
            return make_response(False, message='Service name is required', status_code=400)
        
        from services.fleet_service import fleet_manager
        
        result = fleet_manager.container_action(env_id, service_name, 'restart')
        
        if result.get('success'):
            logger.info(f"Restarted {service_name} on {env_id}")
            return make_response(True, result, message=f'Service {service_name} restarted successfully')
        else:
            return make_response(False, data=result, message=result.get('error'), status_code=500)
            
    except Exception as e:
        logger.error(f"Error restarting service on {env_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@environment_bp.route('/api/environments/<env_id>/logs', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_service_logs(env_id):
    """
    GET /api/environments/<env_id>/logs
    Get logs for a specific service/container
    
    Query params:
        service: string (required) - Container name
        lines: int (optional, default: 100) - Number of lines to return
    
    Returns:
        JSON object with logs
    """
    try:
        service_name = request.args.get('service')
        lines = int(request.args.get('lines', 100))
        
        if not service_name:
            return make_response(False, message='Service name is required', status_code=400)
        
        from services.fleet_service import fleet_manager
        
        result = fleet_manager.execute_command(
            env_id,
            f'docker logs --tail {lines} {service_name}',
            timeout=30
        )
        
        if result.get('success'):
            return make_response(True, {
                'service': service_name,
                'env_id': env_id,
                'logs': result.get('output', ''),
                'lines': lines
            })
        else:
            return make_response(False, data=result, message=result.get('error'), status_code=500)
            
    except Exception as e:
        logger.error(f"Error getting logs from {env_id}: {e}")
        return make_response(False, message=str(e), status_code=500)
