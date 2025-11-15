from flask import Blueprint, jsonify, request, session
from services.docker_service import DockerService
from services.system_service import SystemService
from services.ai_service import AIService
from services.ssh_service import SSHService
from services.database_service import DatabaseService
from services.network_service import NetworkService
from services.domain_service import DomainService
from services.activity_service import activity_service
from utils.auth import require_auth
from utils.favicon_manager import get_favicon_manager
from config import Config
import logging
import os
import re
from datetime import datetime, timedelta
import redis

logger = logging.getLogger(__name__)

api_bp = Blueprint('api', __name__, url_prefix='/api')

docker_service = DockerService()
system_service = SystemService()
ai_service = AIService()
database_service = DatabaseService()
network_service = NetworkService()
domain_service = DomainService()
favicon_manager = get_favicon_manager()

ALLOWED_CONTAINER_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$')

def validate_container_name(name):
    if not ALLOWED_CONTAINER_NAME_PATTERN.match(name):
        raise ValueError("Invalid container name")
    return name

@api_bp.route('/system/info', methods=['GET'])
@require_auth
def get_system_info():
    try:
        info = system_service.get_system_info()
        return jsonify({'success': True, 'data': info})
    except Exception as e:
        logger.error(f"Error in /api/system/info: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/system/processes', methods=['GET'])
@require_auth
def get_processes():
    try:
        processes = system_service.get_process_list()
        return jsonify({'success': True, 'data': processes})
    except Exception as e:
        logger.error(f"Error in /api/system/processes: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/system/stats', methods=['GET'])
@require_auth
def get_system_stats():
    try:
        stats = system_service.get_realtime_stats()
        return jsonify({'success': True, 'data': stats})
    except Exception as e:
        logger.error(f"Error in /api/system/stats: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/system/disk', methods=['GET'])
@require_auth
def get_disk_info():
    try:
        disks = system_service.get_disk_partitions()
        return jsonify({'success': True, 'data': disks})
    except Exception as e:
        logger.error(f"Error in /api/system/disk: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/health/celery', methods=['GET'])
@require_auth
def celery_health():
    try:
        from celery_app import celery_app
        
        health_status = {
            'status': 'healthy',
            'timestamp': datetime.utcnow().isoformat(),
            'checks': {}
        }
        
        redis_healthy = False
        redis_error = None
        redis_info = {}
        
        try:
            redis_client = redis.Redis.from_url(Config.CELERY_BROKER_URL)
            redis_client.ping()
            redis_healthy = True
            
            info = redis_client.info()
            redis_info = {
                'connected_clients': info.get('connected_clients', 0),
                'used_memory_human': info.get('used_memory_human', 'Unknown'),
                'uptime_days': info.get('uptime_in_days', 0)
            }
            
            logger.info("Celery health check: Redis is healthy", extra={
                'component': 'celery_health',
                'redis_clients': redis_info['connected_clients']
            })
        except Exception as e:
            redis_error = str(e)
            logger.error(f"Celery health check: Redis connection failed - {redis_error}", extra={
                'component': 'celery_health',
                'error': redis_error
            })
        
        health_status['checks']['redis'] = {
            'status': 'healthy' if redis_healthy else 'unhealthy',
            'error': redis_error,
            'info': redis_info if redis_healthy else {}
        }
        
        workers_healthy = False
        workers_error = None
        worker_info = {}
        
        try:
            inspect = celery_app.control.inspect(timeout=2.0)
            active_workers = inspect.active()
            registered_tasks = inspect.registered()
            stats = inspect.stats()
            
            if active_workers is not None:
                workers_healthy = len(active_workers) > 0
                worker_info = {
                    'worker_count': len(active_workers) if active_workers else 0,
                    'workers': list(active_workers.keys()) if active_workers else [],
                    'registered_tasks': len(registered_tasks.get(list(active_workers.keys())[0], [])) if active_workers and registered_tasks else 0
                }
                
                logger.info(f"Celery health check: {worker_info['worker_count']} workers active", extra={
                    'component': 'celery_health',
                    'worker_count': worker_info['worker_count'],
                    'workers': worker_info['workers']
                })
            else:
                workers_error = "No workers responding"
                logger.warning("Celery health check: No workers responding", extra={
                    'component': 'celery_health'
                })
        except Exception as e:
            workers_error = str(e)
            logger.error(f"Celery health check: Worker inspection failed - {workers_error}", extra={
                'component': 'celery_health',
                'error': workers_error
            })
        
        health_status['checks']['workers'] = {
            'status': 'healthy' if workers_healthy else 'unhealthy',
            'error': workers_error,
            'info': worker_info if workers_healthy else {}
        }
        
        queue_healthy = False
        queue_error = None
        queue_info = {}
        
        if redis_healthy:
            try:
                redis_client = redis.Redis.from_url(Config.CELERY_BROKER_URL)
                
                queue_lengths = {}
                total_pending = 0
                for queue_name in ['default', 'deployments', 'dns', 'analysis', 'google']:
                    key = f'celery'
                    queue_length = redis_client.llen(queue_name)
                    queue_lengths[queue_name] = queue_length
                    total_pending += queue_length
                
                queue_healthy = total_pending < 100
                queue_info = {
                    'total_pending': total_pending,
                    'queues': queue_lengths,
                    'threshold': 100
                }
                
                if not queue_healthy:
                    queue_error = f"Queue depth ({total_pending}) exceeds threshold (100)"
                    logger.warning(f"Celery health check: High queue depth - {total_pending} tasks", extra={
                        'component': 'celery_health',
                        'queue_depth': total_pending
                    })
                else:
                    logger.info(f"Celery health check: Queue depth normal - {total_pending} tasks", extra={
                        'component': 'celery_health',
                        'queue_depth': total_pending
                    })
            except Exception as e:
                queue_error = str(e)
                logger.error(f"Celery health check: Queue inspection failed - {queue_error}", extra={
                    'component': 'celery_health',
                    'error': queue_error
                })
        else:
            queue_error = "Redis unavailable"
        
        health_status['checks']['queue'] = {
            'status': 'healthy' if queue_healthy else 'warning',
            'error': queue_error,
            'info': queue_info
        }
        
        stuck_tasks_healthy = True
        stuck_tasks_error = None
        stuck_tasks_info = {}
        
        if workers_healthy:
            try:
                inspect = celery_app.control.inspect(timeout=2.0)
                active_tasks = inspect.active()
                
                if active_tasks:
                    stuck_count = 0
                    stuck_tasks_list = []
                    now = datetime.utcnow()
                    
                    for worker, tasks in active_tasks.items():
                        for task in tasks:
                            task_id = task.get('id')
                            time_start = task.get('time_start')
                            
                            if time_start:
                                start_time = datetime.fromtimestamp(time_start)
                                if (now - start_time) > timedelta(minutes=5):
                                    stuck_count += 1
                                    stuck_tasks_list.append({
                                        'task_id': task_id,
                                        'worker': worker,
                                        'duration_minutes': (now - start_time).total_seconds() / 60
                                    })
                    
                    stuck_tasks_healthy = stuck_count == 0
                    stuck_tasks_info = {
                        'stuck_count': stuck_count,
                        'stuck_tasks': stuck_tasks_list[:10]
                    }
                    
                    if not stuck_tasks_healthy:
                        stuck_tasks_error = f"{stuck_count} tasks stuck for > 5 minutes"
                        logger.warning(f"Celery health check: {stuck_count} stuck tasks detected", extra={
                            'component': 'celery_health',
                            'stuck_count': stuck_count
                        })
            except Exception as e:
                stuck_tasks_error = str(e)
                logger.error(f"Celery health check: Stuck task inspection failed - {stuck_tasks_error}", extra={
                    'component': 'celery_health',
                    'error': stuck_tasks_error
                })
        
        health_status['checks']['stuck_tasks'] = {
            'status': 'healthy' if stuck_tasks_healthy else 'warning',
            'error': stuck_tasks_error,
            'info': stuck_tasks_info
        }
        
        all_healthy = redis_healthy and workers_healthy and queue_healthy and stuck_tasks_healthy
        health_status['status'] = 'healthy' if all_healthy else 'unhealthy'
        
        status_code = 200 if all_healthy else 503
        
        logger.info(f"Celery health check complete: {health_status['status']}", extra={
            'component': 'celery_health',
            'overall_status': health_status['status']
        })
        
        return jsonify(health_status), status_code
        
    except Exception as e:
        logger.error(f"Celery health check failed: {e}", exc_info=True, extra={
            'component': 'celery_health',
            'error': str(e)
        })
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }), 503

@api_bp.route('/containers', methods=['GET'])
@require_auth
def list_containers():
    try:
        containers = docker_service.list_all_containers()
        return jsonify({'success': True, 'data': containers})
    except Exception as e:
        logger.error(f"Error in /api/containers: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/containers/<container_name>/status', methods=['GET'])
@require_auth
def get_container_status(container_name):
    try:
        container_name = validate_container_name(container_name)
        status = docker_service.get_container_status(container_name)
        if status:
            return jsonify({'success': True, 'data': status})
        else:
            return jsonify({'success': False, 'message': 'Container not found'}), 404
    except Exception as e:
        logger.error(f"Error in /api/containers/{container_name}/status: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/containers/<container_name>/start', methods=['POST'])
@require_auth
def start_container(container_name):
    try:
        container_name = validate_container_name(container_name)
        result = docker_service.start_container(container_name)
        if result.get('success'):
            activity_service.log_activity(
                'container', 
                f'Container "{container_name}" started',
                'play-circle-fill',
                'success'
            )
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error starting container {container_name}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/containers/<container_name>/stop', methods=['POST'])
@require_auth
def stop_container(container_name):
    try:
        container_name = validate_container_name(container_name)
        result = docker_service.stop_container(container_name)
        if result.get('success'):
            activity_service.log_activity(
                'container',
                f'Container "{container_name}" stopped',
                'stop-circle-fill',
                'warning'
            )
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error stopping container {container_name}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/containers/<container_name>/restart', methods=['POST'])
@require_auth
def restart_container(container_name):
    try:
        container_name = validate_container_name(container_name)
        result = docker_service.restart_container(container_name)
        if result.get('success'):
            activity_service.log_activity(
                'container',
                f'Container "{container_name}" restarted',
                'arrow-clockwise',
                'info'
            )
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error restarting container {container_name}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/containers/<container_name>/logs', methods=['GET'])
@require_auth
def get_container_logs(container_name):
    try:
        container_name = validate_container_name(container_name)
        lines = min(request.args.get('lines', 100, type=int), 1000)
        logs = docker_service.get_container_logs(container_name, lines)
        if logs is not None:
            return jsonify({'success': True, 'data': logs})
        else:
            return jsonify({'success': False, 'message': 'Container not found or logs unavailable'}), 404
    except Exception as e:
        logger.error(f"Error getting logs for {container_name}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/services/status', methods=['GET'])
@require_auth
def get_services_status():
    try:
        services_status = []
        for service_id, service_info in Config.SERVICES.items():
            status_data = {
                'id': service_id,
                'name': service_info['name'],
                'domain': service_info['domain'],
                'type': service_info['type'],
                'status': 'unknown',
                'container_status': None
            }
            
            if service_info['type'] == 'container' and service_info['container']:
                container_status = docker_service.get_container_status(service_info['container'])
                if container_status:
                    status_data['status'] = container_status['status']
                    status_data['container_status'] = container_status
                else:
                    status_data['status'] = 'not_found'
            elif service_info['type'] == 'static':
                if os.path.exists(service_info['path']):
                    status_data['status'] = 'active'
                else:
                    status_data['status'] = 'not_found'
            
            services_status.append(status_data)
        
        return jsonify({'success': True, 'data': services_status})
    except Exception as e:
        logger.error(f"Error getting services status: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/ai/analyze-logs', methods=['POST'])
@require_auth
def analyze_logs():
    try:
        data = request.get_json()
        logs = data.get('logs', '')
        context = data.get('context', '')
        
        if not logs:
            return jsonify({'success': False, 'message': 'No logs provided'}), 400
        
        analysis = ai_service.analyze_logs(logs, context)
        return jsonify({'success': True, 'data': analysis})
    except Exception as e:
        logger.error(f"Error analyzing logs: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/ai/chat', methods=['POST'])
@require_auth
def ai_chat():
    try:
        data = request.get_json()
        message = data.get('message', '')
        history = data.get('history', [])
        
        if not message:
            return jsonify({'success': False, 'message': 'No message provided'}), 400
        
        response = ai_service.chat(message, history)
        return jsonify({'success': True, 'data': response})
    except Exception as e:
        logger.error(f"Error in AI chat: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/ai/troubleshoot', methods=['POST'])
@require_auth
def troubleshoot():
    try:
        data = request.get_json()
        issue = data.get('issue', '')
        service = data.get('service', '')
        
        if not issue:
            return jsonify({'success': False, 'message': 'No issue description provided'}), 400
        
        advice = ai_service.get_troubleshooting_advice(issue, service)
        return jsonify({'success': True, 'data': advice})
    except Exception as e:
        logger.error(f"Error getting troubleshooting advice: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

ALLOWED_COMMANDS = [
    'docker ps -a',
    'docker ps',
    'docker images',
    'docker system df',
    'docker stats --no-stream',
    'docker system prune -f',
    'df -h',
    'free -h',
    'uptime',
    'top -bn1',
    'systemctl status docker',
]

SAFE_DIRECTORIES = [
    '/var/log',
    '/home/evin/contain',
    '/var/www',
]

SHELL_OPERATORS = ['&&', '||', ';', '|', '>', '<', '>>']
DANGEROUS_PATTERNS = ['rm', 'mkfs', 'dd if=', 'dd of=', ':(){:|:&};:', 'chmod', '>/dev/', 'sudo', 'su ', 'exec', 'run', 'eval', '$(', '`', '..', '\n']

def validate_safe_path(path):
    path = path.strip()
    
    if '..' in path:
        raise ValueError("Path traversal detected")
    
    if path.startswith('/'):
        for safe_dir in SAFE_DIRECTORIES:
            if path.startswith(safe_dir):
                return True
        raise ValueError("Absolute path not in allowed directories")
    
    return True

def parse_docker_logs_command(command):
    parts = command.split()
    
    if parts[0] != 'docker' or parts[1] != 'logs':
        raise ValueError("Invalid docker logs command")
    
    if len(parts) != 3:
        raise ValueError("docker logs requires exactly one container name, no additional arguments")
    
    container_name = parts[2]
    validate_container_name(container_name)
    return True

def is_command_allowed(command):
    command_lower = command.lower().strip()
    
    for allowed_cmd in ALLOWED_COMMANDS:
        if command_lower == allowed_cmd.lower():
            return True
    
    if command_lower.startswith('docker logs '):
        return parse_docker_logs_command(command)
    
    return False

@api_bp.route('/scripts/execute', methods=['POST'])
@require_auth
def execute_script():
    try:
        data = request.get_json()
        command = data.get('command', '')
        
        if not command:
            return jsonify({'success': False, 'message': 'No command provided'}), 400
        
        for operator in SHELL_OPERATORS:
            if operator in command:
                logger.warning(f"Blocked command with shell operator: {command}")
                return jsonify({'success': False, 'message': f'Shell operators ({operator}) are not permitted'}), 403
        
        for pattern in DANGEROUS_PATTERNS:
            if pattern in command.lower():
                logger.warning(f"Blocked dangerous command pattern: {command}")
                return jsonify({'success': False, 'message': f'Command contains dangerous pattern: {pattern}'}), 403
        
        if not is_command_allowed(command):
            logger.warning(f"Blocked non-allowed command: {command}")
            return jsonify({'success': False, 'message': 'Command not in allowlist. Use the quick commands sidebar or contact administrator.'}), 403
        
        ssh_service = SSHService(
            Config.SSH_HOST,
            Config.SSH_PORT,
            Config.SSH_USER,
            Config.SSH_KEY_PATH
        )
        
        success, output, error = ssh_service.execute_command(command)
        ssh_service.disconnect()
        
        return jsonify({
            'success': success,
            'output': output,
            'error': error
        })
    except Exception as e:
        logger.error(f"Error executing script: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/databases', methods=['GET'])
@require_auth
def list_databases():
    try:
        databases = database_service.list_databases()
        return jsonify({'success': True, 'data': databases})
    except Exception as e:
        logger.error(f"Error listing databases: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/databases', methods=['POST'])
@require_auth
def create_database():
    try:
        data = request.get_json()
        
        if not data or 'db_type' not in data:
            return jsonify({'success': False, 'message': 'db_type is required'}), 400
        
        db_type = data.get('db_type')
        name = data.get('name', '')
        database_name = data.get('database_name', '')
        username = data.get('username', '')
        password = data.get('password')
        
        if not validate_container_name(name) if name else True:
            return jsonify({'success': False, 'message': 'Invalid container name'}), 400
        
        result = database_service.create_database(
            db_type=db_type,
            name=name,
            database_name=database_name,
            username=username,
            custom_password=password
        )
        
        return jsonify(result), 201
    except Exception as e:
        logger.error(f"Error creating database: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/databases/<container_name>', methods=['GET'])
@require_auth
def get_database_info(container_name):
    try:
        container_name = validate_container_name(container_name)
        info = database_service.get_database_info(container_name)
        return jsonify({'success': True, 'data': info})
    except Exception as e:
        logger.error(f"Error getting database info: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/databases/<container_name>', methods=['DELETE'])
@require_auth
def delete_database(container_name):
    try:
        container_name = validate_container_name(container_name)
        delete_volume = request.args.get('delete_volume', 'false').lower() == 'true'
        
        result = database_service.delete_database(container_name, delete_volume)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error deleting database: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/databases/<container_name>/backup', methods=['POST'])
@require_auth
def backup_database(container_name):
    try:
        container_name = validate_container_name(container_name)
        backup_path = request.get_json().get('backup_path', '/tmp') if request.get_json() else '/tmp'
        
        result = database_service.backup_database(container_name, backup_path)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error backing up database: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/databases/templates', methods=['GET'])
@require_auth
def get_database_templates():
    try:
        templates = []
        for db_type, template in database_service.db_templates.items():
            templates.append({
                'type': db_type,
                'image': template['image'],
                'port': template['default_port'],
                'env_vars': template['env_vars']
            })
        return jsonify({'success': True, 'data': templates})
    except Exception as e:
        logger.error(f"Error getting database templates: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/databases/<container_name>/connection-examples', methods=['GET'])
@require_auth
def get_connection_examples(container_name):
    try:
        container_name = validate_container_name(container_name)
        
        info = database_service.get_database_info(container_name)
        env = info.get('environment', {})
        db_type = info['type']
        
        # Extract credentials from environment variables based on db type
        password = 'YOUR_PASSWORD'
        username = None
        database = None
        
        if db_type == 'postgresql':
            password = env.get('POSTGRES_PASSWORD', password)
            username = env.get('POSTGRES_USER', 'postgres')
            database = env.get('POSTGRES_DB', 'postgres')
        elif db_type == 'mysql':
            password = env.get('MYSQL_ROOT_PASSWORD', password)
            username = 'root'
            database = env.get('MYSQL_DATABASE', 'mydb')
        elif db_type == 'mongodb':
            password = env.get('MONGO_INITDB_ROOT_PASSWORD', password)
            username = env.get('MONGO_INITDB_ROOT_USERNAME', 'admin')
            database = env.get('MONGO_INITDB_DATABASE', 'admin')
        
        # Get host port (the exposed port on localhost)
        ports = info.get('ports', {})
        # ports is a dict like {'5432/tcp': 5432} - get the first host port value
        port = list(ports.values())[0] if ports else 5432
        
        examples = database_service.get_connection_examples(
            db_type=db_type,
            container_name=container_name,
            host_port=int(port),
            password=password,
            username=username,
            database=database
        )
        
        return jsonify({'success': True, 'data': examples})
    except Exception as e:
        logger.error(f"Error getting connection examples: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/network/stats', methods=['GET'])
@require_auth
def get_network_stats():
    try:
        stats = network_service.get_network_stats()
        return jsonify({'success': True, 'data': stats})
    except Exception as e:
        logger.error(f"Error getting network stats: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/network/interfaces', methods=['GET'])
@require_auth
def get_network_interfaces():
    try:
        interfaces = network_service.get_interface_stats()
        return jsonify({'success': True, 'data': interfaces})
    except Exception as e:
        logger.error(f"Error getting network interfaces: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/network/connections', methods=['GET'])
@require_auth
def get_network_connections():
    try:
        connections = network_service.get_connections()
        return jsonify({'success': True, 'data': connections})
    except Exception as e:
        logger.error(f"Error getting network connections: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/network/ports', methods=['GET'])
@require_auth
def get_listening_ports():
    try:
        ports = network_service.get_listening_ports()
        return jsonify({'success': True, 'data': ports})
    except Exception as e:
        logger.error(f"Error getting listening ports: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/network/bandwidth', methods=['GET'])
@require_auth
def get_network_bandwidth():
    try:
        previous_stats = session.get('network_stats', {})
        bandwidth = network_service.get_bandwidth_delta(previous_stats)
        current_stats = network_service.get_network_stats()
        session['network_stats'] = current_stats
        
        return jsonify({'success': True, 'data': bandwidth})
    except Exception as e:
        logger.error(f"Error getting network bandwidth: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/domains', methods=['GET'])
@require_auth
def get_domains_status():
    try:
        summary = domain_service.get_summary()
        return jsonify({'success': True, 'data': summary})
    except Exception as e:
        logger.error(f"Error getting domain status: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/domains/<path:subdomain>/check', methods=['GET'])
@require_auth
def check_specific_domain(subdomain):
    try:
        domain_config = next((d for d in domain_service.DOMAINS if d['subdomain'] == subdomain), None)
        
        if not domain_config:
            return jsonify({'success': False, 'message': 'Domain not found'}), 404
        
        result = domain_service.check_domain_health(domain_config)
        return jsonify({'success': True, 'data': result})
    except Exception as e:
        logger.error(f"Error checking domain {subdomain}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/domains/ssl-certificates', methods=['GET'])
@require_auth
def get_ssl_certificates():
    try:
        certificates = domain_service.get_ssl_certificates()
        return jsonify({'success': True, 'data': certificates})
    except Exception as e:
        logger.error(f"Error getting SSL certificates: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/activity/recent', methods=['GET'])
@require_auth
def get_recent_activity():
    try:
        limit = min(request.args.get('limit', 20, type=int), 100)
        activities = activity_service.get_recent_activities(limit)
        return jsonify({'success': True, 'data': activities})
    except Exception as e:
        logger.error(f"Error fetching recent activity: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/services/<service_id>/favicon', methods=['POST'])
@require_auth
def upload_service_favicon(service_id):
    """
    Upload a custom favicon for a service
    
    Form data:
        favicon: Image file (.png, .ico, .jpg, .svg) max 2MB
    
    Returns:
        JSON with upload status and favicon path
    """
    try:
        if service_id not in Config.SERVICES:
            return jsonify({'success': False, 'message': 'Service not found'}), 404
        
        if 'favicon' not in request.files:
            return jsonify({'success': False, 'message': 'No favicon file provided'}), 400
        
        file = request.files['favicon']
        
        if not file.filename or file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400
        
        filename = str(file.filename).lower()
        file_ext = filename.rsplit('.', 1)[1] if '.' in filename else ''
        
        if file_ext not in Config.FAVICON_ALLOWED_EXTENSIONS:
            return jsonify({
                'success': False, 
                'message': f'Invalid file type. Allowed: {", ".join(Config.FAVICON_ALLOWED_EXTENSIONS)}'
            }), 400
        
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > Config.FAVICON_MAX_SIZE:
            return jsonify({
                'success': False, 
                'message': f'File too large. Maximum size is {Config.FAVICON_MAX_SIZE / (1024*1024)}MB'
            }), 400
        
        os.makedirs(Config.FAVICON_FOLDER, exist_ok=True)
        
        from werkzeug.utils import secure_filename
        safe_filename = f"{service_id}.{file_ext}"
        filepath = os.path.join(Config.FAVICON_FOLDER, safe_filename)
        
        if os.path.exists(filepath):
            os.remove(filepath)
        
        file.save(filepath)
        
        # Update in-memory config
        Config.SERVICES[service_id]['favicon'] = safe_filename
        
        # Persist to disk
        favicon_manager.set_favicon(service_id, safe_filename)
        
        activity_service.log_activity(
            'service',
            f'Custom favicon uploaded for {Config.SERVICES[service_id]["name"]}',
            'image',
            'success'
        )
        
        logger.info(f"Favicon uploaded for service {service_id}: {safe_filename}")
        
        return jsonify({
            'success': True,
            'message': 'Favicon uploaded successfully',
            'favicon': safe_filename,
            'favicon_url': f'/static/favicons/{safe_filename}'
        }), 200
    
    except Exception as e:
        logger.error(f"Error uploading favicon for {service_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'message': f'Upload failed: {str(e)}'}), 500

@api_bp.route('/services/<service_id>/favicon', methods=['GET'])
@require_auth
def get_service_favicon(service_id):
    """
    Get the favicon path for a service
    
    Returns:
        JSON with favicon information
    """
    try:
        if service_id not in Config.SERVICES:
            return jsonify({'success': False, 'message': 'Service not found'}), 404
        
        service = Config.SERVICES[service_id]
        favicon = service.get('favicon')
        
        if favicon:
            favicon_path = os.path.join(Config.FAVICON_FOLDER, favicon)
            if os.path.exists(favicon_path):
                return jsonify({
                    'success': True,
                    'favicon': favicon,
                    'favicon_url': f'/static/favicons/{favicon}',
                    'has_favicon': True
                })
        
        return jsonify({
            'success': True,
            'favicon': None,
            'favicon_url': None,
            'has_favicon': False
        })
    
    except Exception as e:
        logger.error(f"Error getting favicon for {service_id}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/services/<service_id>/favicon', methods=['DELETE'])
@require_auth
def delete_service_favicon(service_id):
    """
    Delete the custom favicon for a service
    
    Returns:
        JSON with deletion status
    """
    try:
        if service_id not in Config.SERVICES:
            return jsonify({'success': False, 'message': 'Service not found'}), 404
        
        service = Config.SERVICES[service_id]
        favicon = service.get('favicon')
        
        if favicon:
            favicon_path = os.path.join(Config.FAVICON_FOLDER, favicon)
            if os.path.exists(favicon_path):
                os.remove(favicon_path)
            
            # Update in-memory config
            Config.SERVICES[service_id]['favicon'] = None
            
            # Remove from persistent storage
            favicon_manager.delete_favicon(service_id)
            
            activity_service.log_activity(
                'service',
                f'Custom favicon removed for {service["name"]}',
                'trash',
                'warning'
            )
            
            logger.info(f"Favicon deleted for service {service_id}")
            
            return jsonify({
                'success': True,
                'message': 'Favicon deleted successfully'
            })
        
        return jsonify({
            'success': False,
            'message': 'No favicon to delete'
        }), 404
    
    except Exception as e:
        logger.error(f"Error deleting favicon for {service_id}: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
