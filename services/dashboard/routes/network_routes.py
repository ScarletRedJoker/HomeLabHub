"""
Network Discovery API Routes
Auto-discovery and management of network resources
"""
from flask import Blueprint, jsonify, request
from services.network_discovery import network_discovery, run_startup_discovery
from utils.auth import require_auth
from utils.rbac import require_permission
from models.rbac import Permission
from datetime import datetime, timezone
import logging
import os

logger = logging.getLogger(__name__)

network_bp = Blueprint('network', __name__)


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@network_bp.route('/api/network/status', methods=['GET'])
@require_auth
def get_network_status():
    """
    GET /api/network/status
    Returns current network resource status from cache
    
    Returns:
        JSON object with discovered network resources
    """
    try:
        config = network_discovery.get_network_config(force_refresh=False)
        
        status = config.pop('_discovery_status', {})
        timestamp = config.pop('_timestamp', '')
        
        return make_response(True, {
            'config': config,
            'status': status,
            'timestamp': timestamp,
            'env_hints': network_discovery.env_hints
        })
    except Exception as e:
        logger.error(f"Error getting network status: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/discover', methods=['GET', 'POST'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def run_discovery():
    """
    GET/POST /api/network/discover
    Triggers a full network discovery and returns results
    
    Query params:
        force - Force refresh (bypass cache)
        type - Specific discovery type: nas, host, kvm, all (default: all)
    
    Returns:
        JSON object with discovery results
    """
    try:
        force = request.args.get('force', 'false').lower() == 'true'
        discovery_type = request.args.get('type', 'all').lower()
        
        if force:
            network_discovery.cache.invalidate()
        
        if discovery_type == 'nas':
            result = network_discovery.discover_nas(force_refresh=True)
            return make_response(True, {'nas': result})
        
        elif discovery_type == 'host':
            host_name = request.args.get('name', 'local')
            result = network_discovery.discover_host(resource_name=host_name)
            return make_response(True, {host_name: result})
        
        elif discovery_type == 'kvm':
            result = network_discovery.discover_kvm(force_refresh=True)
            return make_response(True, {'kvm': result})
        
        else:
            results = network_discovery.run_full_discovery()
            return make_response(True, results)
        
    except Exception as e:
        logger.error(f"Error running network discovery: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/resources', methods=['GET'])
@require_auth
def list_resources():
    """
    GET /api/network/resources
    List all discovered/registered network resources from database
    
    Returns:
        JSON array of network resources
    """
    try:
        from services.db_service import db_service
        from models.network_resource import NetworkResource
        
        if not db_service.is_available:
            return make_response(False, message='Database not available', status_code=503)
        
        with db_service.get_session() as session:
            resources = NetworkResource.get_all(session)
            return make_response(True, {
                'resources': [r.to_dict() for r in resources],
                'count': len(resources)
            })
    except Exception as e:
        logger.error(f"Error listing network resources: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/resources', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def create_or_update_resource():
    """
    POST /api/network/resources
    Create or update a network resource (manual endpoint override)
    
    Request body:
        {
            "name": "my-nas",
            "resource_type": "nas",
            "preferred_endpoint": "192.168.0.100",
            "ports": {"smb": 445, "ssh": 22}
        }
    
    Returns:
        JSON object with the created/updated resource
    """
    try:
        from services.db_service import db_service
        from models.network_resource import NetworkResource
        
        if not db_service.is_available:
            return make_response(False, message='Database not available', status_code=503)
        
        data = request.get_json() or {}
        
        name = data.get('name')
        resource_type = data.get('resource_type')
        
        if not name:
            return make_response(False, message='name is required', status_code=400)
        if not resource_type:
            return make_response(False, message='resource_type is required', status_code=400)
        
        with db_service.get_session() as session:
            resource = NetworkResource.upsert(
                session,
                name=name,
                resource_type=resource_type,
                preferred_endpoint=data.get('preferred_endpoint'),
                discovered_endpoints=data.get('discovered_endpoints', []),
                health_status=data.get('health_status', 'unknown'),
                discovery_method='manual',
                ports=data.get('ports', {}),
                resource_metadata=data.get('metadata', {})
            )
            session.commit()
            session.refresh(resource)
            
            network_discovery.cache.invalidate()
            
            return make_response(True, resource.to_dict(), message='Resource saved successfully')
    except Exception as e:
        logger.error(f"Error creating/updating network resource: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/resources/<resource_id>', methods=['DELETE'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def delete_resource(resource_id):
    """
    DELETE /api/network/resources/<resource_id>
    Delete a network resource
    
    Returns:
        JSON object with deletion status
    """
    try:
        from services.db_service import db_service
        from models.network_resource import NetworkResource
        from sqlalchemy import select
        import uuid
        
        if not db_service.is_available:
            return make_response(False, message='Database not available', status_code=503)
        
        with db_service.get_session() as session:
            try:
                resource_uuid = uuid.UUID(resource_id)
            except ValueError:
                return make_response(False, message='Invalid resource ID', status_code=400)
            
            resource = session.execute(
                select(NetworkResource).where(NetworkResource.id == resource_uuid)
            ).scalar_one_or_none()
            
            if not resource:
                return make_response(False, message='Resource not found', status_code=404)
            
            session.delete(resource)
            session.commit()
            
            network_discovery.cache.invalidate()
            
            return make_response(True, message='Resource deleted successfully')
    except Exception as e:
        logger.error(f"Error deleting network resource: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/health', methods=['GET'])
@require_auth
def health_check():
    """
    GET /api/network/health
    Quick health check of all registered resources
    
    Returns:
        JSON object with health status of all resources
    """
    try:
        results = network_discovery.health_check_all()
        return make_response(True, results)
    except Exception as e:
        logger.error(f"Error running health check: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/probe', methods=['POST'])
@require_auth
def probe_endpoint():
    """
    POST /api/network/probe
    Probe a specific endpoint
    
    Request body:
        {
            "ip": "192.168.0.176",
            "port": 445,
            "timeout": 2.0
        }
    
    Returns:
        JSON object with probe result
    """
    try:
        data = request.get_json() or {}
        ip = data.get('ip')
        port = data.get('port')
        timeout = data.get('timeout', 2.0)
        
        if not ip:
            return make_response(False, message='ip is required', status_code=400)
        if not port:
            return make_response(False, message='port is required', status_code=400)
        
        is_open = network_discovery.probe_endpoint(ip, int(port), float(timeout))
        
        return make_response(True, {
            'ip': ip,
            'port': port,
            'open': is_open,
            'status': 'open' if is_open else 'closed',
            'timestamp': datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        logger.error(f"Error probing endpoint: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/discovery-logs', methods=['GET'])
@require_auth
def get_discovery_logs():
    """
    GET /api/network/discovery-logs
    Get recent network discovery logs
    
    Query params:
        limit - Max results (default 50)
        type - Filter by discovery type (nas, host, service)
    
    Returns:
        JSON array of discovery log entries
    """
    try:
        from services.db_service import db_service
        from models.network_resource import NetworkDiscoveryLog
        from sqlalchemy import select
        
        if not db_service.is_available:
            return make_response(False, message='Database not available', status_code=503)
        
        limit = min(int(request.args.get('limit', 50)), 200)
        discovery_type = request.args.get('type')
        
        with db_service.get_session() as session:
            query = select(NetworkDiscoveryLog).order_by(NetworkDiscoveryLog.created_at.desc()).limit(limit)
            
            if discovery_type:
                query = query.where(NetworkDiscoveryLog.discovery_type == discovery_type)
            
            logs = session.execute(query).scalars().all()
            
            return make_response(True, {
                'logs': [log.to_dict() for log in logs],
                'count': len(logs)
            })
    except Exception as e:
        logger.error(f"Error getting discovery logs: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/config', methods=['GET'])
@require_auth
def get_config():
    """
    GET /api/network/config
    Get the current network configuration (environment variables)
    
    Returns:
        JSON object with network configuration
    """
    try:
        config = {
            'NAS_IP': os.environ.get('NAS_IP', network_discovery.env_hints.get('nas', '')),
            'LOCAL_HOST_IP': os.environ.get('LOCAL_HOST_IP', network_discovery.env_hints.get('local_host', '')),
            'LINODE_HOST_IP': os.environ.get('LINODE_HOST_IP', network_discovery.env_hints.get('linode_host', '')),
            'KVM_HOST_IP': os.environ.get('KVM_HOST_IP', network_discovery.env_hints.get('kvm_host', '')),
            'TAILSCALE_LOCAL_HOST': os.environ.get('TAILSCALE_LOCAL_HOST', ''),
            'TAILSCALE_LINODE_HOST': os.environ.get('TAILSCALE_LINODE_HOST', ''),
        }
        
        return make_response(True, config)
    except Exception as e:
        logger.error(f"Error getting network config: {e}")
        return make_response(False, message=str(e), status_code=500)


@network_bp.route('/api/network/refresh', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def refresh_config():
    """
    POST /api/network/refresh
    Refresh network configuration by running discovery and updating env vars
    
    Returns:
        JSON object with new configuration
    """
    try:
        network_discovery.cache.invalidate()
        config = run_startup_discovery()
        
        return make_response(True, {
            'config': config,
            'message': 'Network configuration refreshed'
        })
    except Exception as e:
        logger.error(f"Error refreshing network config: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['network_bp']
