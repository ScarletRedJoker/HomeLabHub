"""
Fleet Management API Routes
Remote server control via Tailscale VPN mesh
"""
from flask import Blueprint, jsonify, request, render_template
from services.fleet_service import fleet_manager
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from models.rbac import Permission
import logging
import re

logger = logging.getLogger(__name__)

fleet_bp = Blueprint('fleet', __name__)


@fleet_bp.route('/fleet-management')
@require_web_auth
def fleet_management_page():
    """Render Fleet Management page"""
    return render_template('fleet_management.html')

ALLOWED_HOST_ID_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$')
ALLOWED_CONTAINER_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$')


def validate_host_id(host_id: str) -> bool:
    """Validate host ID format"""
    if not host_id:
        return False
    return bool(ALLOWED_HOST_ID_PATTERN.match(host_id))


def validate_container_name(name: str) -> bool:
    """Validate container name format"""
    if not name:
        return False
    return bool(ALLOWED_CONTAINER_PATTERN.match(name))


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@fleet_bp.route('/api/fleet/hosts', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_hosts():
    """
    GET /api/fleet/hosts
    List all registered fleet hosts with their connection status
    
    Returns:
        JSON array of host objects with status
    """
    try:
        hosts = fleet_manager.list_hosts()
        return make_response(True, {
            'hosts': hosts,
            'count': len(hosts)
        })
    except Exception as e:
        logger.error(f"Error listing fleet hosts: {e}")
        return make_response(False, message=str(e), status_code=500)


@fleet_bp.route('/api/fleet/hosts/<host_id>/status', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_host_status(host_id):
    """
    GET /api/fleet/hosts/<host_id>/status
    Get detailed status of a specific host (CPU, RAM, disk, containers)
    
    Returns:
        JSON object with host status details
    """
    try:
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        status = fleet_manager.get_host_status(host_id)
        
        if not status:
            return make_response(False, message=f'Host {host_id} not found or offline', status_code=404)
        
        return make_response(True, status)
        
    except Exception as e:
        logger.error(f"Error getting host status for {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@fleet_bp.route('/api/fleet/hosts/<host_id>/command', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def execute_command(host_id):
    """
    POST /api/fleet/hosts/<host_id>/command
    Execute a shell command on a remote host
    
    Request body:
        {
            "command": "ls -la",
            "timeout": 30  // optional, seconds
        }
    
    Returns:
        JSON object with command output
    """
    try:
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        data = request.get_json() or {}
        command = data.get('command', '').strip()
        timeout = data.get('timeout')
        
        if not command:
            return make_response(False, message='Command is required', status_code=400)
        
        if len(command) > 1000:
            return make_response(False, message='Command too long (max 1000 chars)', status_code=400)
        
        logger.info(f"Executing command on {host_id}: {command[:50]}...")
        
        result = fleet_manager.execute_command(host_id, command, timeout or 60)
        
        if result.get('success'):
            return make_response(True, result)
        else:
            return make_response(False, data=result, message=result.get('error'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error executing command on {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@fleet_bp.route('/api/fleet/hosts/<host_id>/containers', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_containers(host_id):
    """
    GET /api/fleet/hosts/<host_id>/containers
    List Docker containers on a remote host
    
    Returns:
        JSON array of container objects
    """
    try:
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        containers = fleet_manager.get_containers(host_id)
        
        return make_response(True, {
            'containers': containers,
            'count': len(containers),
            'host_id': host_id
        })
        
    except Exception as e:
        logger.error(f"Error listing containers on {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@fleet_bp.route('/api/fleet/hosts/<host_id>/containers/<container_name>/action', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def container_action(host_id, container_name):
    """
    POST /api/fleet/hosts/<host_id>/containers/<name>/action
    Perform an action on a container (start, stop, restart, logs)
    
    Request body:
        {
            "action": "restart"  // start, stop, restart, logs
        }
    
    Returns:
        JSON object with action result
    """
    try:
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        if not validate_container_name(container_name):
            return make_response(False, message='Invalid container name format', status_code=400)
        
        data = request.get_json() or {}
        action = data.get('action', '').strip().lower()
        
        if action not in ['start', 'stop', 'restart', 'logs']:
            return make_response(False, message='Invalid action. Use: start, stop, restart, logs', status_code=400)
        
        logger.info(f"Container action on {host_id}: {action} {container_name}")
        
        result = fleet_manager.container_action(host_id, container_name, action)
        
        if result.get('success'):
            return make_response(True, result, message=f'Container {action} successful')
        else:
            return make_response(False, data=result, message=result.get('error'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error performing container action on {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@fleet_bp.route('/api/fleet/hosts/<host_id>/deploy', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def deploy_service(host_id):
    """
    POST /api/fleet/hosts/<host_id>/deploy
    Deploy a new service to a remote host
    
    Request body:
        {
            "image": "nginx:latest",
            "name": "my-nginx",
            "ports": ["80:80", "443:443"],
            "environment": {"KEY": "value"},
            "volumes": ["/host/path:/container/path"],
            "restart": "unless-stopped",
            "command": ""  // optional
        }
    
    Returns:
        JSON object with deployment result
    """
    try:
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        service_config = request.get_json() or {}
        
        if not service_config.get('image'):
            return make_response(False, message='Docker image is required', status_code=400)
        
        logger.info(f"Deploying service to {host_id}: {service_config.get('image')}")
        
        result = fleet_manager.deploy_service(host_id, service_config)
        
        if result.get('success'):
            return make_response(True, result, message=result.get('message', 'Deployment successful'))
        else:
            return make_response(False, data=result, message=result.get('error'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error deploying service to {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@fleet_bp.route('/api/fleet/hosts', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def add_host():
    """
    POST /api/fleet/hosts
    Add a new host to the fleet
    
    Request body:
        {
            "host_id": "my-server",
            "name": "My Server",
            "tailscale_ip": "100.x.x.x",
            "role": "custom",
            "ssh_user": "root",
            "ssh_port": 22,
            "description": "My custom server"
        }
    
    Returns:
        JSON object with new host details
    """
    try:
        host_data = request.get_json() or {}
        
        if not host_data.get('host_id'):
            return make_response(False, message='host_id is required', status_code=400)
        
        if not validate_host_id(host_data['host_id']):
            return make_response(False, message='Invalid host_id format', status_code=400)
        
        if not host_data.get('name'):
            return make_response(False, message='name is required', status_code=400)
        
        if not host_data.get('tailscale_ip'):
            return make_response(False, message='tailscale_ip is required', status_code=400)
        
        result = fleet_manager.add_host(host_data)
        
        if result.get('success'):
            return make_response(True, result.get('host'), message='Host added successfully')
        else:
            return make_response(False, message=result.get('error'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error adding host: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['fleet_bp']
