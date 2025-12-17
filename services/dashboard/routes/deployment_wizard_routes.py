"""
Deployment Wizard Routes - Guided step-by-step service deployment
Multi-step wizard for deploying services to local or Linode environments
"""
from flask import Blueprint, jsonify, request, render_template
from services.fleet_service import fleet_manager
from services.environment_service import environment_service, ENVIRONMENTS
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from models.rbac import Permission
import logging
import json
import os
import uuid
import secrets
import string
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

deployment_wizard_bp = Blueprint('deployment_wizard', __name__)

ALLOWED_HOST_IDS = ['linode', 'local']
MARKETPLACE_JSON_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'marketplace_apps.json')

wizard_deployments: Dict[str, Dict] = {}


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


def validate_host_id(host_id: str) -> Tuple[bool, str]:
    """Validate that host_id is in allowed list"""
    if not host_id:
        return False, 'host_id is required'
    if host_id not in ALLOWED_HOST_IDS:
        return False, f'Invalid host_id. Must be one of: {", ".join(ALLOWED_HOST_IDS)}'
    return True, ''


def load_marketplace_apps() -> List[Dict]:
    """Load marketplace apps from JSON file"""
    try:
        with open(MARKETPLACE_JSON_PATH, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load marketplace apps: {e}")
        return []


def generate_password(length: int = 24) -> str:
    """Generate a secure random password"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))


def generate_docker_compose(template: Dict, config: Dict) -> str:
    """Generate docker-compose.yml content from template and config"""
    container_name = config.get('container_name', template['slug'])
    
    compose = {
        'version': '3.8',
        'services': {},
        'networks': {
            'homelab': {
                'external': True
            }
        },
        'volumes': {}
    }
    
    config_template = template.get('config_template', {})
    services = config_template.get('services', {})
    
    for service_name, service_config in services.items():
        service = {}
        
        service['image'] = service_config.get('image', template.get('docker_image', 'alpine:latest'))
        service['container_name'] = container_name
        
        ports = service_config.get('ports', [])
        resolved_ports = []
        for port in ports:
            resolved = port.replace('${PORT}', str(config.get('PORT', template.get('default_port', 8080))))
            resolved = resolved.replace('${SSH_PORT}', str(config.get('SSH_PORT', 2222)))
            resolved_ports.append(resolved)
        if resolved_ports:
            service['ports'] = resolved_ports
        
        env_list = service_config.get('environment', [])
        resolved_env = []
        for env in env_list:
            resolved = env
            for key, value in config.items():
                resolved = resolved.replace(f'${{{key}}}', str(value))
            resolved = resolved.replace('${CONTAINER_NAME}', container_name)
            resolved_env.append(resolved)
        if resolved_env:
            service['environment'] = resolved_env
        
        volumes = service_config.get('volumes', [])
        resolved_volumes = []
        for vol in volumes:
            resolved = vol.replace('${CONTAINER_NAME}', container_name)
            resolved_volumes.append(resolved)
            if ':' in resolved:
                vol_name = resolved.split(':')[0]
                if not vol_name.startswith('/'):
                    compose['volumes'][vol_name] = {}
        if resolved_volumes:
            service['volumes'] = resolved_volumes
        
        service['restart'] = service_config.get('restart', 'unless-stopped')
        service['networks'] = service_config.get('networks', ['homelab'])
        
        compose['services'][service_name] = service
    
    import yaml
    return yaml.dump(compose, default_flow_style=False, sort_keys=False)


@deployment_wizard_bp.route('/deployment-wizard')
@require_web_auth
def deployment_wizard_page():
    """Render the deployment wizard page"""
    return render_template('deployment_wizard.html')


@deployment_wizard_bp.route('/api/deployment/wizard/environments', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_environments():
    """Get available deployment environments with status"""
    try:
        environments = []
        
        for env_id in ALLOWED_HOST_IDS:
            env_data = environment_service.get_environment(env_id)
            if env_data:
                health = environment_service.run_health_checks(env_id)
                environments.append({
                    'env_id': env_id,
                    'name': env_data.get('name', env_id),
                    'description': env_data.get('description', ''),
                    'env_type': env_data.get('env_type', 'unknown'),
                    'hostname': env_data.get('hostname', ''),
                    'status': env_data.get('status', 'unknown'),
                    'health': health.get('overall', 'unknown'),
                    'health_summary': health.get('summary', {}),
                })
        
        return make_response(True, {'environments': environments})
        
    except Exception as e:
        logger.error(f"Error getting environments: {e}")
        return make_response(False, message=str(e), status_code=500)


@deployment_wizard_bp.route('/api/deployment/wizard/templates', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_templates():
    """Get available deployment templates from marketplace"""
    try:
        apps = load_marketplace_apps()
        
        category = request.args.get('category')
        if category and category != 'all':
            apps = [app for app in apps if app.get('category') == category]
        
        categories = list(set(app.get('category', 'other') for app in load_marketplace_apps()))
        
        templates = []
        for app in apps:
            templates.append({
                'slug': app['slug'],
                'name': app['name'],
                'category': app.get('category', 'other'),
                'description': app.get('description', ''),
                'long_description': app.get('long_description', ''),
                'icon_url': app.get('icon_url', ''),
                'docker_image': app.get('docker_image', ''),
                'default_port': app.get('default_port', 8080),
                'requires_database': app.get('requires_database', False),
                'db_type': app.get('db_type'),
                'popularity': app.get('popularity', 0),
                'env_template': app.get('env_template', {}),
            })
        
        templates.sort(key=lambda x: x['popularity'], reverse=True)
        
        return make_response(True, {
            'templates': templates,
            'categories': sorted(categories),
            'total': len(templates)
        })
        
    except Exception as e:
        logger.error(f"Error getting templates: {e}")
        return make_response(False, message=str(e), status_code=500)


@deployment_wizard_bp.route('/api/deployment/wizard/template/<slug>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_template_details(slug: str):
    """Get detailed template information including env vars"""
    try:
        apps = load_marketplace_apps()
        template = next((app for app in apps if app['slug'] == slug), None)
        
        if not template:
            return make_response(False, message=f'Template {slug} not found', status_code=404)
        
        return make_response(True, {'template': template})
        
    except Exception as e:
        logger.error(f"Error getting template {slug}: {e}")
        return make_response(False, message=str(e), status_code=500)


@deployment_wizard_bp.route('/api/deployment/wizard/preflight', methods=['POST'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def run_preflight_checks():
    """
    Run preflight checks before deployment
    
    Request body:
        {
            "host_id": "local" | "linode",
            "template_slug": "nextcloud",
            "config": {
                "PORT": 8080,
                "ADMIN_PASSWORD": "...",
                ...
            }
        }
    """
    try:
        data = request.get_json() or {}
        host_id = data.get('host_id')
        template_slug = data.get('template_slug')
        config = data.get('config', {})
        
        valid, error = validate_host_id(host_id)
        if not valid:
            return make_response(False, message=error, status_code=400)
        
        if not template_slug:
            return make_response(False, message='template_slug is required', status_code=400)
        
        apps = load_marketplace_apps()
        template = next((app for app in apps if app['slug'] == template_slug), None)
        if not template:
            return make_response(False, message=f'Template {template_slug} not found', status_code=404)
        
        checks = []
        all_passed = True
        
        host_status = fleet_manager.get_host_status(host_id)
        if host_status and host_status.get('online'):
            checks.append({
                'name': 'Host Connectivity',
                'status': 'passed',
                'message': f'{ENVIRONMENTS[host_id].name} is online',
                'icon': 'bi-wifi'
            })
        else:
            checks.append({
                'name': 'Host Connectivity',
                'status': 'failed',
                'message': f'Cannot reach {host_id} host',
                'severity': 'critical',
                'icon': 'bi-wifi-off'
            })
            all_passed = False
        
        docker_result = fleet_manager.execute_command(
            host_id,
            'docker info --format "{{.ServerVersion}}"',
            timeout=30,
            bypass_whitelist=True
        )
        
        if docker_result.get('success') and docker_result.get('output', '').strip():
            docker_version = docker_result.get('output', '').strip()
            checks.append({
                'name': 'Docker Engine',
                'status': 'passed',
                'message': f'Docker {docker_version} is running',
                'icon': 'bi-box-seam'
            })
        else:
            checks.append({
                'name': 'Docker Engine',
                'status': 'failed',
                'message': 'Docker daemon is not running or not accessible',
                'severity': 'critical',
                'icon': 'bi-box-seam'
            })
            all_passed = False
        
        disk_result = fleet_manager.execute_command(
            host_id,
            "df -BG / | awk 'NR==2 {print $4}' | tr -d 'G'",
            timeout=30,
            bypass_whitelist=True
        )
        
        if disk_result.get('success'):
            try:
                available_gb = int(disk_result.get('output', '0').strip())
                if available_gb < 5:
                    checks.append({
                        'name': 'Disk Space',
                        'status': 'failed',
                        'message': f'Only {available_gb}GB available - need at least 5GB',
                        'severity': 'critical',
                        'icon': 'bi-hdd'
                    })
                    all_passed = False
                elif available_gb < 10:
                    checks.append({
                        'name': 'Disk Space',
                        'status': 'warning',
                        'message': f'{available_gb}GB available - low space warning',
                        'icon': 'bi-hdd'
                    })
                else:
                    checks.append({
                        'name': 'Disk Space',
                        'status': 'passed',
                        'message': f'{available_gb}GB available',
                        'icon': 'bi-hdd'
                    })
            except ValueError:
                checks.append({
                    'name': 'Disk Space',
                    'status': 'warning',
                    'message': 'Could not determine available space',
                    'icon': 'bi-hdd'
                })
        
        port = config.get('PORT', template.get('default_port', 8080))
        port_check = fleet_manager.execute_command(
            host_id,
            f'ss -tlnp | grep ":{port} " || echo "port_free"',
            timeout=15,
            bypass_whitelist=True
        )
        
        if port_check.get('success'):
            output = port_check.get('output', '')
            if 'port_free' in output:
                checks.append({
                    'name': 'Port Availability',
                    'status': 'passed',
                    'message': f'Port {port} is available',
                    'icon': 'bi-ethernet'
                })
            else:
                checks.append({
                    'name': 'Port Availability',
                    'status': 'failed',
                    'message': f'Port {port} is already in use',
                    'severity': 'critical',
                    'icon': 'bi-ethernet'
                })
                all_passed = False
        
        env_template = template.get('env_template', {})
        missing_required = []
        for key, spec in env_template.items():
            if spec.get('required') and not config.get(key):
                if not spec.get('generate'):
                    missing_required.append(spec.get('label', key))
        
        if missing_required:
            checks.append({
                'name': 'Configuration',
                'status': 'failed',
                'message': f'Missing required fields: {", ".join(missing_required)}',
                'severity': 'critical',
                'icon': 'bi-gear'
            })
            all_passed = False
        else:
            checks.append({
                'name': 'Configuration',
                'status': 'passed',
                'message': 'All required configuration provided',
                'icon': 'bi-gear'
            })
        
        if template.get('requires_database'):
            db_check = fleet_manager.execute_command(
                host_id,
                'docker ps --filter "name=postgres" --format "{{.Names}}: {{.Status}}" | head -1',
                timeout=15,
                bypass_whitelist=True
            )
            
            if db_check.get('success') and db_check.get('output', '').strip():
                checks.append({
                    'name': 'Database',
                    'status': 'passed',
                    'message': f'PostgreSQL container found',
                    'icon': 'bi-database'
                })
            else:
                checks.append({
                    'name': 'Database',
                    'status': 'warning',
                    'message': 'No PostgreSQL container found - may need to create one',
                    'icon': 'bi-database'
                })
        
        network_check = fleet_manager.execute_command(
            host_id,
            'docker network ls --format "{{.Name}}" | grep -w homelab || echo "not_found"',
            timeout=15,
            bypass_whitelist=True
        )
        
        if network_check.get('success'):
            output = network_check.get('output', '')
            if 'not_found' in output:
                checks.append({
                    'name': 'Docker Network',
                    'status': 'warning',
                    'message': 'homelab network not found - will be created',
                    'icon': 'bi-diagram-3'
                })
            else:
                checks.append({
                    'name': 'Docker Network',
                    'status': 'passed',
                    'message': 'homelab network exists',
                    'icon': 'bi-diagram-3'
                })
        
        passed = sum(1 for c in checks if c['status'] == 'passed')
        warnings = sum(1 for c in checks if c['status'] == 'warning')
        failed = sum(1 for c in checks if c['status'] == 'failed')
        
        return make_response(True, {
            'ready': all_passed,
            'checks': checks,
            'summary': {
                'passed': passed,
                'warnings': warnings,
                'failed': failed,
                'total': len(checks)
            }
        })
        
    except Exception as e:
        logger.error(f"Error running preflight checks: {e}")
        return make_response(False, message=str(e), status_code=500)


@deployment_wizard_bp.route('/api/deployment/wizard/deploy', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def execute_deployment():
    """
    Execute the deployment
    
    Request body:
        {
            "host_id": "local" | "linode",
            "template_slug": "nextcloud",
            "container_name": "my-nextcloud",
            "config": {
                "PORT": 8080,
                "ADMIN_PASSWORD": "...",
                ...
            }
        }
    """
    try:
        data = request.get_json() or {}
        host_id = data.get('host_id')
        template_slug = data.get('template_slug')
        container_name = data.get('container_name', template_slug)
        config = data.get('config', {})
        
        valid, error = validate_host_id(host_id)
        if not valid:
            return make_response(False, message=error, status_code=400)
        
        if not template_slug:
            return make_response(False, message='template_slug is required', status_code=400)
        
        apps = load_marketplace_apps()
        template = next((app for app in apps if app['slug'] == template_slug), None)
        if not template:
            return make_response(False, message=f'Template {template_slug} not found', status_code=404)
        
        task_id = str(uuid.uuid4())
        
        wizard_deployments[task_id] = {
            'task_id': task_id,
            'host_id': host_id,
            'template': template_slug,
            'container_name': container_name,
            'status': 'starting',
            'started_at': datetime.now(timezone.utc).isoformat(),
            'logs': [],
            'steps': [],
            'current_step': 0,
            'total_steps': 5,
        }
        
        def add_log(message: str, level: str = 'info'):
            wizard_deployments[task_id]['logs'].append({
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'level': level,
                'message': message
            })
        
        def update_step(step: int, name: str, status: str):
            wizard_deployments[task_id]['current_step'] = step
            wizard_deployments[task_id]['steps'].append({
                'step': step,
                'name': name,
                'status': status,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
        
        try:
            add_log(f'Starting deployment of {template["name"]} to {host_id}')
            update_step(1, 'Checking prerequisites', 'running')
            wizard_deployments[task_id]['status'] = 'running'
            
            network_result = fleet_manager.execute_command(
                host_id,
                'docker network create homelab 2>/dev/null || true',
                timeout=30,
                bypass_whitelist=True
            )
            add_log('Ensured homelab network exists')
            update_step(1, 'Checking prerequisites', 'completed')
            
            update_step(2, 'Generating configuration', 'running')
            
            env_template = template.get('env_template', {})
            final_config = {'container_name': container_name}
            
            for key, spec in env_template.items():
                if key in config and config[key]:
                    final_config[key] = config[key]
                elif spec.get('generate') and spec.get('type') == 'password':
                    final_config[key] = generate_password()
                    add_log(f'Generated password for {key}')
                elif spec.get('default') is not None:
                    final_config[key] = spec['default']
            
            try:
                compose_content = generate_docker_compose(template, final_config)
                add_log('Generated docker-compose.yml')
            except Exception as e:
                add_log(f'Failed to generate docker-compose: {e}', 'error')
                raise
            
            update_step(2, 'Generating configuration', 'completed')
            
            update_step(3, 'Transferring files', 'running')
            
            deploy_dir = f'/opt/homelab/apps/{container_name}'
            mkdir_result = fleet_manager.execute_command(
                host_id,
                f'mkdir -p {deploy_dir}',
                timeout=30,
                bypass_whitelist=True
            )
            
            if not mkdir_result.get('success'):
                raise Exception(f'Failed to create deployment directory: {mkdir_result.get("error")}')
            
            escaped_compose = compose_content.replace("'", "'\"'\"'")
            write_result = fleet_manager.execute_command(
                host_id,
                f"cat > {deploy_dir}/docker-compose.yml << 'EOFCOMPOSE'\n{compose_content}\nEOFCOMPOSE",
                timeout=30,
                bypass_whitelist=True
            )
            
            if not write_result.get('success'):
                raise Exception(f'Failed to write docker-compose.yml: {write_result.get("error")}')
            
            add_log(f'Created deployment directory at {deploy_dir}')
            update_step(3, 'Transferring files', 'completed')
            
            update_step(4, 'Pulling image and starting container', 'running')
            
            pull_result = fleet_manager.execute_command(
                host_id,
                f'cd {deploy_dir} && docker compose pull 2>&1',
                timeout=300,
                bypass_whitelist=True
            )
            add_log(f'Pulled Docker image: {template.get("docker_image")}')
            
            up_result = fleet_manager.execute_command(
                host_id,
                f'cd {deploy_dir} && docker compose up -d 2>&1',
                timeout=120,
                bypass_whitelist=True
            )
            
            if not up_result.get('success'):
                add_log(f'Failed to start container: {up_result.get("error")}', 'error')
                raise Exception(f'Failed to start container: {up_result.get("error")}')
            
            add_log('Container started successfully')
            update_step(4, 'Pulling image and starting container', 'completed')
            
            update_step(5, 'Verifying deployment', 'running')
            
            import time
            time.sleep(3)
            
            verify_result = fleet_manager.execute_command(
                host_id,
                f'docker ps --filter "name={container_name}" --format "{{{{.Status}}}}"',
                timeout=30,
                bypass_whitelist=True
            )
            
            if verify_result.get('success') and 'Up' in verify_result.get('output', ''):
                add_log('Container is running and healthy')
                update_step(5, 'Verifying deployment', 'completed')
                wizard_deployments[task_id]['status'] = 'completed'
                wizard_deployments[task_id]['completed_at'] = datetime.now(timezone.utc).isoformat()
                
                port = final_config.get('PORT', template.get('default_port', 8080))
                wizard_deployments[task_id]['result'] = {
                    'container_name': container_name,
                    'image': template.get('docker_image'),
                    'port': port,
                    'access_url': f'http://{ENVIRONMENTS[host_id].hostname}:{port}',
                    'deploy_dir': deploy_dir,
                }
            else:
                add_log('Container may not be running correctly', 'warning')
                update_step(5, 'Verifying deployment', 'warning')
                wizard_deployments[task_id]['status'] = 'completed_with_warnings'
            
        except Exception as e:
            add_log(f'Deployment failed: {str(e)}', 'error')
            wizard_deployments[task_id]['status'] = 'failed'
            wizard_deployments[task_id]['error'] = str(e)
        
        return make_response(True, {
            'task_id': task_id,
            'status': wizard_deployments[task_id]['status'],
            'message': f'Deployment of {template["name"]} initiated'
        })
        
    except Exception as e:
        logger.error(f"Error executing deployment: {e}")
        return make_response(False, message=str(e), status_code=500)


@deployment_wizard_bp.route('/api/deployment/wizard/status/<task_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_deployment_status(task_id: str):
    """Get deployment task status and logs"""
    try:
        deployment = wizard_deployments.get(task_id)
        
        if not deployment:
            return make_response(False, message=f'Deployment {task_id} not found', status_code=404)
        
        return make_response(True, {'deployment': deployment})
        
    except Exception as e:
        logger.error(f"Error getting deployment status: {e}")
        return make_response(False, message=str(e), status_code=500)


@deployment_wizard_bp.route('/api/deployment/wizard/health/<host_id>/<container_name>', methods=['POST'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def run_health_check(host_id: str, container_name: str):
    """Run health check on a deployed container"""
    try:
        valid, error = validate_host_id(host_id)
        if not valid:
            return make_response(False, message=error, status_code=400)
        
        result = fleet_manager.execute_command(
            host_id,
            f'docker inspect --format "{{{{.State.Health.Status}}}}" {container_name} 2>/dev/null || docker inspect --format "{{{{.State.Status}}}}" {container_name}',
            timeout=30,
            bypass_whitelist=True
        )
        
        if not result.get('success'):
            return make_response(False, message='Container not found or not accessible', status_code=404)
        
        status = result.get('output', '').strip()
        
        logs_result = fleet_manager.execute_command(
            host_id,
            f'docker logs --tail 20 {container_name} 2>&1',
            timeout=30,
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'container_name': container_name,
            'status': status,
            'healthy': status in ['healthy', 'running'],
            'logs': logs_result.get('output', '')[-2000:] if logs_result.get('success') else None
        })
        
    except Exception as e:
        logger.error(f"Error running health check: {e}")
        return make_response(False, message=str(e), status_code=500)


@deployment_wizard_bp.route('/api/deployment/wizard/generate-password', methods=['POST'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def api_generate_password():
    """Generate a secure random password"""
    try:
        data = request.get_json() or {}
        length = min(max(data.get('length', 24), 12), 64)
        
        return make_response(True, {'password': generate_password(length)})
        
    except Exception as e:
        logger.error(f"Error generating password: {e}")
        return make_response(False, message=str(e), status_code=500)
