"""
Docker Lifecycle API Routes
Complete Docker container management endpoints with multi-host support
"""
from flask import Blueprint, jsonify, request, render_template
from services.docker_service import DockerService
from services.fleet_service import fleet_manager
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from models.rbac import Permission
import logging
import re
import json
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)

docker_bp = Blueprint('docker', __name__, url_prefix='/api/docker')

docker_service = DockerService()

ALLOWED_CONTAINER_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$')
ALLOWED_HOST_ID_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$')

CONTAINER_TEMPLATES = {
    'nginx': {
        'name': 'nginx-proxy',
        'image': 'nginx:alpine',
        'ports': ['80:80', '443:443'],
        'description': 'Lightweight web server and reverse proxy',
        'icon': 'bi-box',
        'category': 'web'
    },
    'portainer': {
        'name': 'portainer',
        'image': 'portainer/portainer-ce:latest',
        'ports': ['9000:9000', '9443:9443'],
        'volumes': ['/var/run/docker.sock:/var/run/docker.sock', 'portainer_data:/data'],
        'description': 'Docker management UI',
        'icon': 'bi-grid-3x3-gap',
        'category': 'management'
    },
    'postgres': {
        'name': 'postgres-db',
        'image': 'postgres:16-alpine',
        'ports': ['5432:5432'],
        'environment': {'POSTGRES_PASSWORD': 'changeme', 'POSTGRES_DB': 'app'},
        'volumes': ['postgres_data:/var/lib/postgresql/data'],
        'description': 'PostgreSQL database server',
        'icon': 'bi-hdd-stack',
        'category': 'database'
    },
    'redis': {
        'name': 'redis-cache',
        'image': 'redis:alpine',
        'ports': ['6379:6379'],
        'description': 'In-memory cache and message broker',
        'icon': 'bi-database',
        'category': 'database'
    },
    'traefik': {
        'name': 'traefik',
        'image': 'traefik:v3.0',
        'ports': ['80:80', '443:443', '8080:8080'],
        'volumes': ['/var/run/docker.sock:/var/run/docker.sock:ro'],
        'command': '--api.insecure=true --providers.docker',
        'description': 'Cloud-native reverse proxy',
        'icon': 'bi-shuffle',
        'category': 'web'
    },
    'watchtower': {
        'name': 'watchtower',
        'image': 'containrrr/watchtower:latest',
        'volumes': ['/var/run/docker.sock:/var/run/docker.sock'],
        'environment': {'WATCHTOWER_CLEANUP': 'true', 'WATCHTOWER_POLL_INTERVAL': '86400'},
        'description': 'Automatic container updates',
        'icon': 'bi-arrow-repeat',
        'category': 'management'
    },
    'prometheus': {
        'name': 'prometheus',
        'image': 'prom/prometheus:latest',
        'ports': ['9090:9090'],
        'volumes': ['prometheus_data:/prometheus'],
        'description': 'Metrics collection and monitoring',
        'icon': 'bi-graph-up',
        'category': 'monitoring'
    },
    'grafana': {
        'name': 'grafana',
        'image': 'grafana/grafana:latest',
        'ports': ['3000:3000'],
        'volumes': ['grafana_data:/var/lib/grafana'],
        'environment': {'GF_SECURITY_ADMIN_PASSWORD': 'admin'},
        'description': 'Analytics and visualization platform',
        'icon': 'bi-bar-chart-line',
        'category': 'monitoring'
    },
    'mariadb': {
        'name': 'mariadb',
        'image': 'mariadb:11',
        'ports': ['3306:3306'],
        'environment': {'MARIADB_ROOT_PASSWORD': 'changeme', 'MARIADB_DATABASE': 'app'},
        'volumes': ['mariadb_data:/var/lib/mysql'],
        'description': 'MySQL-compatible database',
        'icon': 'bi-hdd-stack',
        'category': 'database'
    },
    'mongo': {
        'name': 'mongodb',
        'image': 'mongo:7',
        'ports': ['27017:27017'],
        'volumes': ['mongo_data:/data/db'],
        'description': 'NoSQL document database',
        'icon': 'bi-database-fill',
        'category': 'database'
    },
    'adminer': {
        'name': 'adminer',
        'image': 'adminer:latest',
        'ports': ['8081:8080'],
        'description': 'Database management web UI',
        'icon': 'bi-table',
        'category': 'database'
    },
    'uptime-kuma': {
        'name': 'uptime-kuma',
        'image': 'louislam/uptime-kuma:latest',
        'ports': ['3001:3001'],
        'volumes': ['uptime-kuma:/app/data'],
        'description': 'Self-hosted uptime monitoring',
        'icon': 'bi-heart-pulse',
        'category': 'monitoring'
    },
    'caddy': {
        'name': 'caddy',
        'image': 'caddy:alpine',
        'ports': ['80:80', '443:443'],
        'volumes': ['caddy_data:/data', 'caddy_config:/config'],
        'description': 'Web server with automatic HTTPS',
        'icon': 'bi-shield-check',
        'category': 'web'
    },
    'n8n': {
        'name': 'n8n',
        'image': 'n8nio/n8n:latest',
        'ports': ['5678:5678'],
        'volumes': ['n8n_data:/home/node/.n8n'],
        'description': 'Workflow automation tool',
        'icon': 'bi-diagram-3',
        'category': 'automation'
    },
    'heimdall': {
        'name': 'heimdall',
        'image': 'lscr.io/linuxserver/heimdall:latest',
        'ports': ['8082:80'],
        'volumes': ['heimdall_config:/config'],
        'environment': {'PUID': '1000', 'PGID': '1000'},
        'description': 'Application dashboard',
        'icon': 'bi-grid-1x2',
        'category': 'management'
    },
    'plex': {
        'name': 'plex',
        'image': 'lscr.io/linuxserver/plex:latest',
        'ports': ['32400:32400'],
        'volumes': ['plex_config:/config', '/media:/media'],
        'environment': {'PUID': '1000', 'PGID': '1000', 'VERSION': 'docker'},
        'description': 'Plex Media Server',
        'icon': 'bi-film',
        'category': 'media'
    },
    'homeassistant': {
        'name': 'homeassistant',
        'image': 'ghcr.io/home-assistant/home-assistant:stable',
        'ports': ['8123:8123'],
        'volumes': ['homeassistant_config:/config', '/etc/localtime:/etc/localtime:ro'],
        'environment': {},
        'description': 'Home Assistant smart home platform',
        'icon': 'bi-house-heart',
        'category': 'automation'
    },
    'nginx-proxy-manager': {
        'name': 'nginx-proxy-manager',
        'image': 'jc21/nginx-proxy-manager:latest',
        'ports': ['80:80', '443:443', '81:81'],
        'volumes': ['npm_data:/data', 'npm_letsencrypt:/etc/letsencrypt'],
        'environment': {},
        'description': 'Nginx Proxy Manager with Let\'s Encrypt',
        'icon': 'bi-shield-lock',
        'category': 'web'
    },
    'jellyfin': {
        'name': 'jellyfin',
        'image': 'lscr.io/linuxserver/jellyfin:latest',
        'ports': ['8096:8096'],
        'volumes': ['jellyfin_config:/config', '/media:/media'],
        'environment': {'PUID': '1000', 'PGID': '1000'},
        'description': 'Free software media system',
        'icon': 'bi-play-circle',
        'category': 'media'
    },
    'nextcloud': {
        'name': 'nextcloud',
        'image': 'nextcloud:latest',
        'ports': ['8888:80'],
        'volumes': ['nextcloud_data:/var/www/html'],
        'environment': {},
        'description': 'Self-hosted cloud storage',
        'icon': 'bi-cloud-upload',
        'category': 'storage'
    },
    'vaultwarden': {
        'name': 'vaultwarden',
        'image': 'vaultwarden/server:latest',
        'ports': ['8089:80'],
        'volumes': ['vaultwarden_data:/data'],
        'environment': {},
        'description': 'Bitwarden-compatible password manager',
        'icon': 'bi-key',
        'category': 'security'
    },
    'pihole': {
        'name': 'pihole',
        'image': 'pihole/pihole:latest',
        'ports': ['53:53/tcp', '53:53/udp', '8084:80'],
        'volumes': ['pihole_etc:/etc/pihole', 'pihole_dnsmasq:/etc/dnsmasq.d'],
        'environment': {'WEBPASSWORD': 'admin'},
        'description': 'Network-wide ad blocking',
        'icon': 'bi-shield-x',
        'category': 'network'
    }
}


def validate_container_id(container_id: str) -> bool:
    """Validate container ID/name format"""
    if not container_id:
        return False
    if len(container_id) > 64:
        return False
    if ALLOWED_CONTAINER_NAME_PATTERN.match(container_id):
        return True
    if re.match(r'^[a-f0-9]{12,64}$', container_id):
        return True
    return False


def validate_host_id(host_id: str) -> bool:
    """Validate host ID format"""
    if not host_id:
        return False
    return bool(ALLOWED_HOST_ID_PATTERN.match(host_id))


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@docker_bp.route('/containers', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_containers():
    """
    GET /api/docker/containers
    List all Docker containers with status
    
    Query params:
        all: bool - Include stopped containers (default: true)
        status: str - Filter by status (running, stopped, paused)
    
    Returns:
        JSON array of container objects with status
    """
    try:
        show_all = request.args.get('all', 'true').lower() == 'true'
        status_filter = request.args.get('status', None)
        
        containers = docker_service.list_all_containers()
        
        if status_filter:
            containers = [c for c in containers if c.get('status', '').lower() == status_filter.lower()]
        
        enriched_containers = []
        for container in containers:
            container_name = container.get('name', '')
            detailed = docker_service.get_container_status(container_name)
            if detailed:
                enriched_containers.append(detailed)
            else:
                enriched_containers.append(container)
        
        return make_response(True, {
            'containers': enriched_containers,
            'count': len(enriched_containers)
        })
        
    except Exception as e:
        logger.error(f"Error listing containers: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_container(container_id):
    """
    GET /api/docker/containers/<id>
    Get detailed status of a specific container
    
    Returns:
        JSON object with container details
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        container = docker_service.get_container_status(container_id)
        
        if not container:
            return make_response(False, message=f'Container {container_id} not found', status_code=404)
        
        return make_response(True, container)
        
    except Exception as e:
        logger.error(f"Error getting container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>/start', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def start_container(container_id):
    """
    POST /api/docker/containers/<id>/start
    Start a stopped container
    
    Returns:
        JSON object with operation result
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        logger.info(f"Starting container: {container_id}")
        result = docker_service.start_container(container_id)
        
        if result.get('success'):
            return make_response(True, message=result.get('message'))
        else:
            return make_response(False, message=result.get('message'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error starting container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>/stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def stop_container(container_id):
    """
    POST /api/docker/containers/<id>/stop
    Stop a running container
    
    Query params:
        timeout: int - Seconds to wait before killing (default: 10)
    
    Returns:
        JSON object with operation result
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        logger.info(f"Stopping container: {container_id}")
        result = docker_service.stop_container(container_id)
        
        if result.get('success'):
            return make_response(True, message=result.get('message'))
        else:
            return make_response(False, message=result.get('message'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error stopping container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/containers/<container_id>/restart', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def restart_container(container_id):
    """
    POST /api/docker/containers/<id>/restart
    Restart a container
    
    Query params:
        timeout: int - Seconds to wait before killing (default: 10)
    
    Returns:
        JSON object with operation result
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        logger.info(f"Restarting container: {container_id}")
        result = docker_service.restart_container(container_id)
        
        if result.get('success'):
            return make_response(True, message=result.get('message'))
        else:
            return make_response(False, message=result.get('message'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error restarting container {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/logs/<container_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_LOGS)
def get_container_logs(container_id):
    """
    GET /api/docker/logs/<id>
    Get logs from a container
    
    Query params:
        lines: int - Number of lines to retrieve (default: 100, max: 1000)
        since: str - Show logs since timestamp (e.g., 2023-01-01T00:00:00)
        follow: bool - Stream logs (not supported via REST, use WebSocket)
    
    Returns:
        JSON object with log text
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        lines = request.args.get('lines', 100, type=int)
        lines = min(lines, 1000)
        
        logs = docker_service.get_container_logs(container_id, lines=lines)
        
        if logs is None:
            return make_response(False, message=f'Could not retrieve logs for {container_id}', status_code=404)
        
        log_lines = logs.split('\n') if logs else []
        
        return make_response(True, {
            'container_id': container_id,
            'logs': logs,
            'lines': len(log_lines),
            'requested_lines': lines
        })
        
    except Exception as e:
        logger.error(f"Error getting logs for {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/logs/download-all', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_LOGS)
def download_all_logs():
    """
    GET /api/docker/logs/download-all
    Download logs from ALL containers as a single file
    
    Query params:
        lines: int - Number of lines per container (default: 500, max: 2000)
        format: str - Output format: 'text' or 'json' (default: 'text')
    
    Returns:
        Text file with all container logs separated by headers
    """
    from flask import Response
    from datetime import datetime
    import json
    
    try:
        lines = request.args.get('lines', 500, type=int)
        lines = min(lines, 2000)
        output_format = request.args.get('format', 'text')
        
        containers = docker_service.list_all_containers()
        
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        
        if output_format == 'json':
            all_logs = {
                'generated_at': datetime.now().isoformat(),
                'lines_per_container': lines,
                'containers': []
            }
            
            for container in containers:
                container_name = container.get('name', 'unknown')
                logs = docker_service.get_container_logs(container_name, lines=lines) or 'No logs available'
                
                all_logs['containers'].append({
                    'name': container_name,
                    'status': container.get('status', 'unknown'),
                    'logs': logs
                })
            
            content = json.dumps(all_logs, indent=2)
            filename = f'all_container_logs_{timestamp}.json'
            mimetype = 'application/json'
        else:
            output_lines = []
            output_lines.append("=" * 80)
            output_lines.append(f"NEBULA COMMAND - ALL CONTAINER LOGS")
            output_lines.append(f"Generated: {datetime.now().isoformat()}")
            output_lines.append(f"Lines per container: {lines}")
            output_lines.append(f"Total containers: {len(containers)}")
            output_lines.append("=" * 80)
            output_lines.append("")
            
            for container in containers:
                container_name = container.get('name', 'unknown')
                container_status = container.get('status', 'unknown')
                
                output_lines.append("")
                output_lines.append("#" * 80)
                output_lines.append(f"# CONTAINER: {container_name}")
                output_lines.append(f"# STATUS: {container_status}")
                output_lines.append("#" * 80)
                output_lines.append("")
                
                logs = docker_service.get_container_logs(container_name, lines=lines)
                if logs:
                    output_lines.append(logs)
                else:
                    output_lines.append("(No logs available)")
                
                output_lines.append("")
            
            output_lines.append("")
            output_lines.append("=" * 80)
            output_lines.append("END OF LOG EXPORT")
            output_lines.append("=" * 80)
            
            content = '\n'.join(output_lines)
            filename = f'all_container_logs_{timestamp}.txt'
            mimetype = 'text/plain'
        
        response = Response(content, mimetype=mimetype)
        response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
        response.headers['Content-Length'] = len(content)
        
        return response
        
    except Exception as e:
        logger.error(f"Error downloading all logs: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/stats', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_resource_stats():
    """
    GET /api/docker/stats
    Get resource usage statistics for all containers
    
    Returns:
        JSON object with aggregated stats
    """
    try:
        containers = docker_service.list_all_containers()
        
        stats = []
        total_cpu = 0.0
        total_memory_mb = 0.0
        running_count = 0
        stopped_count = 0
        
        for container in containers:
            container_name = container.get('name', '')
            detailed = docker_service.get_container_status(container_name)
            
            if detailed:
                is_running = detailed.get('status') == 'running'
                if is_running:
                    running_count += 1
                    total_cpu += detailed.get('cpu_percent', 0)
                    total_memory_mb += detailed.get('memory_usage_mb', 0)
                else:
                    stopped_count += 1
                
                stats.append({
                    'name': detailed.get('name'),
                    'id': detailed.get('id'),
                    'status': detailed.get('status'),
                    'cpu_percent': detailed.get('cpu_percent', 0),
                    'memory_usage_mb': detailed.get('memory_usage_mb', 0),
                    'memory_limit_mb': detailed.get('memory_limit_mb', 0),
                    'memory_percent': detailed.get('memory_percent', 0)
                })
        
        return make_response(True, {
            'containers': stats,
            'summary': {
                'total': len(containers),
                'running': running_count,
                'stopped': stopped_count,
                'total_cpu_percent': round(total_cpu, 2),
                'total_memory_mb': round(total_memory_mb, 2)
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting resource stats: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/stats/<container_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_container_stats(container_id):
    """
    GET /api/docker/stats/<id>
    Get resource usage for a specific container
    
    Returns:
        JSON object with container resource usage
    """
    try:
        if not validate_container_id(container_id):
            return make_response(False, message='Invalid container ID format', status_code=400)
        
        detailed = docker_service.get_container_status(container_id)
        
        if not detailed:
            return make_response(False, message=f'Container {container_id} not found', status_code=404)
        
        return make_response(True, {
            'container': {
                'name': detailed.get('name'),
                'id': detailed.get('id'),
                'status': detailed.get('status'),
                'cpu_percent': detailed.get('cpu_percent', 0),
                'memory_usage_mb': detailed.get('memory_usage_mb', 0),
                'memory_limit_mb': detailed.get('memory_limit_mb', 0),
                'memory_percent': detailed.get('memory_percent', 0),
                'ports': detailed.get('ports', {}),
                'image': detailed.get('image'),
                'created': detailed.get('created')
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting stats for {container_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/unified/containers', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_unified_containers():
    """
    GET /api/docker/unified/containers
    Get containers from ALL configured hosts in a unified view
    
    Query params:
        host: str - Filter by host_id (optional, 'all' for all hosts)
    
    Returns:
        JSON with containers aggregated from all hosts
    """
    try:
        host_filter = request.args.get('host', 'all')
        all_containers = []
        host_status = {}
        
        hosts = fleet_manager.list_hosts()
        
        def fetch_host_containers(host):
            host_id = host.get('host_id')
            if not host.get('online'):
                return host_id, [], {'online': False, 'error': 'Host offline'}
            
            try:
                containers = fleet_manager.get_containers(host_id)
                return host_id, containers, {'online': True, 'container_count': len(containers)}
            except Exception as e:
                logger.error(f"Error fetching containers from {host_id}: {e}")
                return host_id, [], {'online': False, 'error': str(e)}
        
        # Log hosts for debugging
        logger.info(f"Unified containers - hosts available: {[(h.get('host_id'), h.get('name')) for h in hosts]}")
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            if host_filter == 'all':
                futures = {executor.submit(fetch_host_containers, host): host for host in hosts}
            else:
                target_hosts = [h for h in hosts if h['host_id'] == host_filter]
                futures = {executor.submit(fetch_host_containers, host): host for host in target_hosts}
            
            for future in as_completed(futures):
                host_id, containers, status = future.result()
                host_status[host_id] = status
                host_name = next((h['name'] for h in hosts if h['host_id'] == host_id), host_id)
                logger.info(f"Processing {len(containers)} containers from host_id={host_id}, host_name={host_name}")
                for container in containers:
                    container['host_id'] = host_id
                    container['host_name'] = host_name
                    all_containers.append(container)
        
        running = sum(1 for c in all_containers if c.get('state', '').lower() == 'running')
        stopped = len(all_containers) - running
        
        return make_response(True, {
            'containers': all_containers,
            'hosts': host_status,
            'summary': {
                'total_containers': len(all_containers),
                'running': running,
                'stopped': stopped,
                'hosts_online': sum(1 for h in host_status.values() if h.get('online')),
                'hosts_total': len(hosts)
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting unified containers: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/unified/<host_id>/<container_name>/action', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def unified_container_action(host_id, container_name):
    """
    POST /api/docker/unified/<host_id>/<container_name>/action
    Perform action on container across any host
    
    Request body:
        {"action": "start|stop|restart|logs"}
    
    Returns:
        JSON with action result
    """
    try:
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        if not validate_container_id(container_name):
            return make_response(False, message='Invalid container name format', status_code=400)
        
        data = request.get_json() or {}
        action = data.get('action', '').strip().lower()
        
        if action not in ['start', 'stop', 'restart', 'logs']:
            return make_response(False, message='Invalid action. Use: start, stop, restart, logs', status_code=400)
        
        logger.info(f"Unified container action: {action} {container_name} on {host_id}")
        
        result = fleet_manager.container_action(host_id, container_name, action)
        
        if result.get('success'):
            return make_response(True, result, message=f'Container {action} successful')
        else:
            return make_response(False, data=result, message=result.get('error'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error in unified container action: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/unified/<host_id>/<container_name>/logs', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_LOGS)
def get_unified_container_logs(host_id, container_name):
    """
    GET /api/docker/unified/<host_id>/<container_name>/logs
    Get logs for a container on any host
    
    Query params:
        lines: int - Number of lines (default: 100)
    
    Returns:
        JSON with container logs
    """
    try:
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        if not validate_container_id(container_name):
            return make_response(False, message='Invalid container name format', status_code=400)
        
        lines = request.args.get('lines', 100, type=int)
        lines = min(lines, 1000)
        
        result = fleet_manager.container_action(host_id, container_name, 'logs')
        
        if result.get('success'):
            return make_response(True, {
                'container': container_name,
                'host_id': host_id,
                'logs': result.get('output', ''),
                'lines': lines
            })
        else:
            return make_response(False, message=result.get('error', 'Failed to get logs'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error getting unified container logs: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/templates', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_templates():
    """
    GET /api/docker/templates
    List available container templates for one-click deployment
    
    Returns:
        JSON with template catalog
    """
    try:
        templates_list = []
        for template_id, template in CONTAINER_TEMPLATES.items():
            templates_list.append({
                'id': template_id,
                'name': template.get('name'),
                'image': template.get('image'),
                'description': template.get('description', ''),
                'icon': template.get('icon', 'bi-box'),
                'category': template.get('category', 'other'),
                'ports': template.get('ports', [])
            })
        
        categories = list(set(t['category'] for t in templates_list))
        
        return make_response(True, {
            'templates': templates_list,
            'categories': categories,
            'count': len(templates_list)
        })
        
    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/templates/<template_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_template(template_id):
    """
    GET /api/docker/templates/<template_id>
    Get full template details
    
    Returns:
        JSON with template configuration
    """
    try:
        if template_id not in CONTAINER_TEMPLATES:
            return make_response(False, message=f'Template {template_id} not found', status_code=404)
        
        template = CONTAINER_TEMPLATES[template_id].copy()
        template['id'] = template_id
        
        return make_response(True, template)
        
    except Exception as e:
        logger.error(f"Error getting template {template_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/templates/<template_id>/deploy', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def deploy_template(template_id):
    """
    POST /api/docker/templates/<template_id>/deploy
    Deploy a container from template to a specific host
    
    Request body:
        {
            "host_id": "local",
            "overrides": {
                "name": "custom-name",
                "ports": ["8080:80"],
                "environment": {"KEY": "value"}
            }
        }
    
    Returns:
        JSON with deployment result
    """
    try:
        if template_id not in CONTAINER_TEMPLATES:
            return make_response(False, message=f'Template {template_id} not found', status_code=404)
        
        data = request.get_json() or {}
        host_id = data.get('host_id')
        overrides = data.get('overrides', {})
        
        if not host_id:
            return make_response(False, message='host_id is required', status_code=400)
        
        if not validate_host_id(host_id):
            return make_response(False, message='Invalid host ID format', status_code=400)
        
        template = CONTAINER_TEMPLATES[template_id].copy()
        
        service_config = {
            'image': template.get('image'),
            'name': overrides.get('name', template.get('name')),
            'ports': overrides.get('ports', template.get('ports', [])),
            'volumes': overrides.get('volumes', template.get('volumes', [])),
            'environment': {**template.get('environment', {}), **overrides.get('environment', {})},
            'restart': overrides.get('restart', 'unless-stopped'),
            'command': overrides.get('command', template.get('command', ''))
        }
        
        logger.info(f"Deploying template {template_id} to {host_id}: {service_config['name']}")
        
        result = fleet_manager.deploy_service(host_id, service_config)
        
        if result.get('success'):
            return make_response(True, result, message=f'Deployed {template_id} as {service_config["name"]}')
        else:
            return make_response(False, data=result, message=result.get('error'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error deploying template {template_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@docker_bp.route('/unified/stats', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_unified_stats():
    """
    GET /api/docker/unified/stats
    Get resource statistics from all hosts
    
    Returns:
        JSON with aggregated resource usage
    """
    try:
        hosts = fleet_manager.list_hosts()
        all_stats = []
        
        def fetch_host_stats(host):
            host_id = host.get('host_id')
            if not host.get('online'):
                return None
            
            try:
                status = fleet_manager.get_host_status(host_id)
                if status:
                    status['host_id'] = host_id
                    status['host_name'] = host.get('name', host_id)
                return status
            except Exception as e:
                logger.error(f"Error fetching stats from {host_id}: {e}")
                return None
        
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(fetch_host_stats, host) for host in hosts]
            for future in as_completed(futures):
                result = future.result()
                if result:
                    all_stats.append(result)
        
        total_cpu = sum(s.get('cpu_percent', 0) for s in all_stats)
        total_memory_used = sum(s.get('memory_used_gb', 0) for s in all_stats)
        total_memory = sum(s.get('memory_total_gb', 0) for s in all_stats)
        total_containers = sum(s.get('container_count', 0) for s in all_stats)
        running_containers = sum(s.get('containers_running', 0) for s in all_stats)
        
        return make_response(True, {
            'hosts': all_stats,
            'summary': {
                'hosts_online': len(all_stats),
                'total_cpu_percent': round(total_cpu / len(all_stats), 2) if all_stats else 0,
                'total_memory_used_gb': round(total_memory_used, 2),
                'total_memory_gb': round(total_memory, 2),
                'total_containers': total_containers,
                'running_containers': running_containers
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting unified stats: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['docker_bp']
