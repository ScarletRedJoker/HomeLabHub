"""
Ops Center Routes - Remote Secrets Manager and Deployment Control
Manage remote .env files and run deployments without SSH
"""
from flask import Blueprint, jsonify, request, render_template
from services.fleet_service import fleet_manager
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from models.rbac import Permission
import logging
import re
from typing import Dict, List, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

ops_center_bp = Blueprint('ops_center', __name__)

ALLOWED_HOST_IDS = ['linode', 'local']
ENV_PATH = '/opt/homelab/HomeLabHub/.env'
BOOTSTRAP_SCRIPT = '/opt/homelab/HomeLabHub/deploy/scripts/bootstrap.sh'
VERIFY_SCRIPT = '/opt/homelab/HomeLabHub/deploy/scripts/verify-deployment.sh'

SENSITIVE_KEY_PATTERNS = [
    re.compile(r'.*password.*', re.IGNORECASE),
    re.compile(r'.*secret.*', re.IGNORECASE),
    re.compile(r'.*key.*', re.IGNORECASE),
    re.compile(r'.*token.*', re.IGNORECASE),
    re.compile(r'.*credential.*', re.IGNORECASE),
    re.compile(r'.*api_key.*', re.IGNORECASE),
    re.compile(r'.*auth.*', re.IGNORECASE),
]

REQUIRED_ENV_VARS = [
    'WEB_USERNAME',
    'WEB_PASSWORD',
    'JARVIS_DATABASE_URL',
    'REDIS_URL',
    'SECRET_KEY',
]

deployment_status: Dict[str, Dict] = {}


def validate_host_id(host_id: str) -> Tuple[bool, str]:
    """Validate that host_id is in allowed list"""
    if not host_id:
        return False, 'host_id is required'
    if host_id not in ALLOWED_HOST_IDS:
        return False, f'Invalid host_id. Must be one of: {", ".join(ALLOWED_HOST_IDS)}'
    return True, ''


def is_sensitive_key(key: str) -> bool:
    """Check if a key is sensitive and should be masked"""
    for pattern in SENSITIVE_KEY_PATTERNS:
        if pattern.match(key):
            return True
    return False


def mask_value(value: str, show_chars: int = 4) -> str:
    """Mask a sensitive value, showing only first few chars"""
    if len(value) <= show_chars:
        return '*' * len(value)
    return value[:show_chars] + '*' * (len(value) - show_chars)


def parse_env_content(content: str) -> Dict[str, str]:
    """Parse .env file content into dictionary"""
    variables = {}
    for line in content.split('\n'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            key, value = line.split('=', 1)
            key = key.strip()
            value = value.strip()
            if value.startswith('"') and value.endswith('"'):
                value = value[1:-1]
            elif value.startswith("'") and value.endswith("'"):
                value = value[1:-1]
            variables[key] = value
    return variables


def serialize_env(variables: Dict[str, str], comments: Dict[str, str] = None) -> str:
    """Serialize dictionary to .env format"""
    lines = []
    lines.append("# Homelab Environment Variables")
    lines.append("# Managed by Nebula Command Ops Center")
    lines.append(f"# Last updated: {datetime.now().isoformat()}\n")
    
    groups = {}
    for key in sorted(variables.keys()):
        prefix = key.split('_')[0] if '_' in key else 'GENERAL'
        if prefix not in groups:
            groups[prefix] = []
        groups[prefix].append(key)
    
    for group, keys in sorted(groups.items()):
        lines.append(f"\n# {group} Configuration")
        for key in keys:
            value = variables[key]
            if ' ' in value or '"' in value or "'" in value:
                value = f'"{value}"'
            lines.append(f"{key}={value}")
    
    return '\n'.join(lines)


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@ops_center_bp.route('/ops-center')
@require_web_auth
def ops_center_page():
    """Render Ops Center page"""
    return render_template('ops_center.html')


@ops_center_bp.route('/api/ops/remote-env/<host_id>', methods=['GET'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def get_remote_env(host_id):
    """
    GET /api/ops/remote-env/<host_id>
    Read .env file from remote server
    
    Query params:
        mask_secrets: bool (default: true) - Whether to mask sensitive values
    
    Returns:
        JSON object with env variables (sensitive values masked by default)
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        result = fleet_manager.execute_command(
            host_id,
            f'cat {ENV_PATH}',
            timeout=30,
            bypass_whitelist=True
        )
        
        if not result.get('success'):
            error_msg = result.get('error', 'Failed to read .env file')
            if 'No such file' in error_msg or result.get('exit_code') == 1:
                return make_response(False, message=f'.env file not found at {ENV_PATH}', status_code=404)
            return make_response(False, message=error_msg, status_code=500)
        
        content = result.get('output', '')
        variables = parse_env_content(content)
        
        mask_secrets = request.args.get('mask_secrets', 'true').lower() != 'false'
        
        display_vars = {}
        for key, value in variables.items():
            if mask_secrets and is_sensitive_key(key):
                display_vars[key] = {
                    'value': mask_value(value),
                    'masked': True,
                    'is_sensitive': True
                }
            else:
                display_vars[key] = {
                    'value': value,
                    'masked': False,
                    'is_sensitive': is_sensitive_key(key)
                }
        
        return make_response(True, {
            'host_id': host_id,
            'env_path': ENV_PATH,
            'variables': display_vars,
            'count': len(variables),
            'raw_content': content if not mask_secrets else None
        })
        
    except Exception as e:
        logger.error(f"Error reading remote env for {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/remote-env/<host_id>', methods=['PUT'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def update_remote_env(host_id):
    """
    PUT /api/ops/remote-env/<host_id>
    Write .env file to remote server
    
    Request body:
        {
            "variables": {"KEY": "value", ...},  // Full replacement
            // OR
            "content": "RAW_ENV_CONTENT"  // Raw .env content
        }
    
    Returns:
        JSON object with result
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        data = request.get_json() or {}
        
        if 'content' in data:
            env_content = data['content']
        elif 'variables' in data:
            variables = data['variables']
            if not isinstance(variables, dict):
                return make_response(False, message='variables must be a dictionary', status_code=400)
            env_content = serialize_env(variables)
        else:
            return make_response(False, message='Either "content" or "variables" is required', status_code=400)
        
        backup_result = fleet_manager.execute_command(
            host_id,
            f'cp {ENV_PATH} {ENV_PATH}.backup.$(date +%Y%m%d_%H%M%S)',
            timeout=30,
            bypass_whitelist=True
        )
        
        if not backup_result.get('success'):
            logger.warning(f"Failed to backup .env on {host_id}: {backup_result.get('error')}")
        
        escaped_content = env_content.replace("'", "'\"'\"'")
        write_result = fleet_manager.execute_command(
            host_id,
            f"echo '{escaped_content}' > {ENV_PATH}",
            timeout=30,
            bypass_whitelist=True
        )
        
        if not write_result.get('success'):
            return make_response(False, message=f"Failed to write .env: {write_result.get('error')}", status_code=500)
        
        logger.info(f"Updated remote .env on {host_id}")
        
        return make_response(True, {
            'host_id': host_id,
            'env_path': ENV_PATH,
            'backup_created': backup_result.get('success', False)
        }, message='Environment variables updated successfully')
        
    except Exception as e:
        logger.error(f"Error updating remote env for {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/remote-env/<host_id>/validate', methods=['POST'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def validate_remote_env(host_id):
    """
    POST /api/ops/remote-env/<host_id>/validate
    Validate that .env file has all required variables
    
    Request body (optional):
        {
            "required_vars": ["VAR1", "VAR2"]  // Override default required vars
        }
    
    Returns:
        JSON object with validation result
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        data = request.get_json() or {}
        required_vars = data.get('required_vars', REQUIRED_ENV_VARS)
        
        result = fleet_manager.execute_command(
            host_id,
            f'cat {ENV_PATH}',
            timeout=30,
            bypass_whitelist=True
        )
        
        if not result.get('success'):
            return make_response(False, message='Failed to read .env file', status_code=500)
        
        content = result.get('output', '')
        variables = parse_env_content(content)
        
        missing = []
        empty = []
        present = []
        
        for var in required_vars:
            if var not in variables:
                missing.append(var)
            elif not variables[var].strip():
                empty.append(var)
            else:
                present.append(var)
        
        is_valid = len(missing) == 0 and len(empty) == 0
        
        return make_response(is_valid, {
            'host_id': host_id,
            'valid': is_valid,
            'required_count': len(required_vars),
            'present_count': len(present),
            'missing': missing,
            'empty': empty,
            'present': present,
            'total_vars': len(variables)
        }, message='Validation complete' if is_valid else f'Missing: {", ".join(missing)}' if missing else f'Empty: {", ".join(empty)}')
        
    except Exception as e:
        logger.error(f"Error validating remote env for {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/deploy/<host_id>', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def run_deployment(host_id):
    """
    POST /api/ops/deploy/<host_id>
    Run bootstrap.sh deployment script on remote server
    
    Returns:
        JSON object with deployment result
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        deployment_status[host_id] = {
            'status': 'running',
            'started_at': datetime.now().isoformat(),
            'logs': '',
            'exit_code': None
        }
        
        check_result = fleet_manager.execute_command(
            host_id,
            f'test -f {BOOTSTRAP_SCRIPT} && echo "exists"',
            timeout=10,
            bypass_whitelist=True
        )
        
        if 'exists' not in check_result.get('output', ''):
            deployment_status[host_id]['status'] = 'failed'
            deployment_status[host_id]['error'] = f'Bootstrap script not found at {BOOTSTRAP_SCRIPT}'
            return make_response(False, message=f'Bootstrap script not found at {BOOTSTRAP_SCRIPT}', status_code=404)
        
        result = fleet_manager.execute_command(
            host_id,
            f'bash {BOOTSTRAP_SCRIPT} 2>&1',
            timeout=600,
            bypass_whitelist=True
        )
        
        deployment_status[host_id]['status'] = 'completed' if result.get('success') else 'failed'
        deployment_status[host_id]['completed_at'] = datetime.now().isoformat()
        deployment_status[host_id]['logs'] = result.get('output', '')
        deployment_status[host_id]['exit_code'] = result.get('exit_code')
        deployment_status[host_id]['error'] = result.get('error')
        
        if result.get('success'):
            logger.info(f"Deployment completed on {host_id}")
            return make_response(True, {
                'host_id': host_id,
                'status': 'completed',
                'exit_code': result.get('exit_code'),
                'logs': result.get('output', '')[:5000]
            }, message='Deployment completed successfully')
        else:
            logger.error(f"Deployment failed on {host_id}: {result.get('error')}")
            return make_response(False, {
                'host_id': host_id,
                'status': 'failed',
                'exit_code': result.get('exit_code'),
                'logs': result.get('output', '')[:5000],
                'error': result.get('error')
            }, message='Deployment failed', status_code=500)
        
    except Exception as e:
        logger.error(f"Error running deployment on {host_id}: {e}")
        deployment_status[host_id] = {
            'status': 'failed',
            'error': str(e)
        }
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/deploy/<host_id>/status', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_deployment_status(host_id):
    """
    GET /api/ops/deploy/<host_id>/status
    Get deployment status and logs
    
    Returns:
        JSON object with deployment status
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        status = deployment_status.get(host_id)
        
        if not status:
            return make_response(True, {
                'host_id': host_id,
                'status': 'idle',
                'message': 'No deployment has been run'
            })
        
        return make_response(True, {
            'host_id': host_id,
            **status
        })
        
    except Exception as e:
        logger.error(f"Error getting deployment status for {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/deploy/<host_id>/verify', methods=['POST'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def verify_deployment(host_id):
    """
    POST /api/ops/deploy/<host_id>/verify
    Run verify-deployment.sh on remote server
    
    Returns:
        JSON object with verification result
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        check_result = fleet_manager.execute_command(
            host_id,
            f'test -f {VERIFY_SCRIPT} && echo "exists"',
            timeout=10,
            bypass_whitelist=True
        )
        
        if 'exists' not in check_result.get('output', ''):
            return make_response(False, message=f'Verify script not found at {VERIFY_SCRIPT}', status_code=404)
        
        result = fleet_manager.execute_command(
            host_id,
            f'bash {VERIFY_SCRIPT} 2>&1',
            timeout=120,
            bypass_whitelist=True
        )
        
        if result.get('success'):
            logger.info(f"Verification passed on {host_id}")
            return make_response(True, {
                'host_id': host_id,
                'verified': True,
                'output': result.get('output', '')
            }, message='Deployment verification passed')
        else:
            logger.warning(f"Verification failed on {host_id}")
            return make_response(False, {
                'host_id': host_id,
                'verified': False,
                'output': result.get('output', ''),
                'error': result.get('error')
            }, message='Deployment verification failed', status_code=400)
        
    except Exception as e:
        logger.error(f"Error verifying deployment on {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/deploy/<host_id>/preflight', methods=['POST'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def preflight_check(host_id):
    """
    POST /api/ops/deploy/<host_id>/preflight
    Run pre-flight checks before deployment
    
    Checks:
        - Environment variables are valid
        - Docker is running
        - Disk space is available
        - Required ports are not in use
        - Network connectivity
    
    Returns:
        JSON object with preflight check results
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    checks = []
    all_passed = True
    
    try:
        env_result = fleet_manager.execute_command(
            host_id,
            f'cat {ENV_PATH}',
            timeout=30,
            bypass_whitelist=True
        )
        
        if env_result.get('success'):
            content = env_result.get('output', '')
            variables = parse_env_content(content)
            
            missing = [var for var in REQUIRED_ENV_VARS if var not in variables]
            empty = [var for var in REQUIRED_ENV_VARS if var in variables and not variables[var].strip()]
            
            if missing or empty:
                checks.append({
                    'name': 'Environment Variables',
                    'status': 'failed',
                    'message': f'Missing: {", ".join(missing)}' if missing else f'Empty: {", ".join(empty)}',
                    'severity': 'critical'
                })
                all_passed = False
            else:
                checks.append({
                    'name': 'Environment Variables',
                    'status': 'passed',
                    'message': f'All {len(REQUIRED_ENV_VARS)} required variables present'
                })
        else:
            checks.append({
                'name': 'Environment Variables',
                'status': 'failed',
                'message': f'.env file not found or unreadable at {ENV_PATH}',
                'severity': 'critical'
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
                'name': 'Docker Daemon',
                'status': 'passed',
                'message': f'Docker version {docker_version} is running'
            })
        else:
            checks.append({
                'name': 'Docker Daemon',
                'status': 'failed',
                'message': 'Docker daemon is not running or not accessible',
                'severity': 'critical'
            })
            all_passed = False
        
        disk_result = fleet_manager.execute_command(
            host_id,
            "df -h / | awk 'NR==2 {print $5}' | tr -d '%'",
            timeout=30,
            bypass_whitelist=True
        )
        
        if disk_result.get('success'):
            try:
                disk_usage = int(disk_result.get('output', '0').strip())
                if disk_usage >= 95:
                    checks.append({
                        'name': 'Disk Space',
                        'status': 'failed',
                        'message': f'Disk usage at {disk_usage}% - critical',
                        'severity': 'critical'
                    })
                    all_passed = False
                elif disk_usage >= 85:
                    checks.append({
                        'name': 'Disk Space',
                        'status': 'warning',
                        'message': f'Disk usage at {disk_usage}% - consider cleanup'
                    })
                else:
                    checks.append({
                        'name': 'Disk Space',
                        'status': 'passed',
                        'message': f'Disk usage at {disk_usage}% - OK'
                    })
            except ValueError:
                checks.append({
                    'name': 'Disk Space',
                    'status': 'warning',
                    'message': 'Could not parse disk usage'
                })
        else:
            checks.append({
                'name': 'Disk Space',
                'status': 'warning',
                'message': 'Could not check disk space'
            })
        
        mem_result = fleet_manager.execute_command(
            host_id,
            "free | awk '/Mem:/ {printf \"%.0f\", $3/$2 * 100}'",
            timeout=30,
            bypass_whitelist=True
        )
        
        if mem_result.get('success'):
            try:
                mem_usage = int(mem_result.get('output', '0').strip())
                if mem_usage >= 95:
                    checks.append({
                        'name': 'Memory',
                        'status': 'warning',
                        'message': f'Memory usage at {mem_usage}% - consider freeing memory'
                    })
                else:
                    checks.append({
                        'name': 'Memory',
                        'status': 'passed',
                        'message': f'Memory usage at {mem_usage}% - OK'
                    })
            except ValueError:
                checks.append({
                    'name': 'Memory',
                    'status': 'warning',
                    'message': 'Could not parse memory usage'
                })
        else:
            checks.append({
                'name': 'Memory',
                'status': 'warning',
                'message': 'Could not check memory usage'
            })
        
        script_result = fleet_manager.execute_command(
            host_id,
            f'test -f {BOOTSTRAP_SCRIPT} && test -x {BOOTSTRAP_SCRIPT} && echo "ready"',
            timeout=10,
            bypass_whitelist=True
        )
        
        if 'ready' in script_result.get('output', ''):
            checks.append({
                'name': 'Bootstrap Script',
                'status': 'passed',
                'message': 'Bootstrap script exists and is executable'
            })
        else:
            perm_result = fleet_manager.execute_command(
                host_id,
                f'test -f {BOOTSTRAP_SCRIPT} && echo "exists"',
                timeout=10,
                bypass_whitelist=True
            )
            if 'exists' in perm_result.get('output', ''):
                checks.append({
                    'name': 'Bootstrap Script',
                    'status': 'warning',
                    'message': 'Bootstrap script exists but may not be executable'
                })
            else:
                checks.append({
                    'name': 'Bootstrap Script',
                    'status': 'failed',
                    'message': f'Bootstrap script not found at {BOOTSTRAP_SCRIPT}',
                    'severity': 'critical'
                })
                all_passed = False
        
        net_result = fleet_manager.execute_command(
            host_id,
            'curl -s --connect-timeout 5 -o /dev/null -w "%{http_code}" https://github.com',
            timeout=15,
            bypass_whitelist=True
        )
        
        if net_result.get('success'):
            status_code = net_result.get('output', '').strip()
            if status_code.startswith('2') or status_code.startswith('3'):
                checks.append({
                    'name': 'Network Connectivity',
                    'status': 'passed',
                    'message': 'External network access available'
                })
            else:
                checks.append({
                    'name': 'Network Connectivity',
                    'status': 'warning',
                    'message': f'Network check returned status {status_code}'
                })
        else:
            checks.append({
                'name': 'Network Connectivity',
                'status': 'warning',
                'message': 'Could not verify external network access'
            })
        
        passed_count = sum(1 for c in checks if c['status'] == 'passed')
        warning_count = sum(1 for c in checks if c['status'] == 'warning')
        failed_count = sum(1 for c in checks if c['status'] == 'failed')
        
        logger.info(f"Pre-flight checks on {host_id}: {passed_count} passed, {warning_count} warnings, {failed_count} failed")
        
        return make_response(all_passed, {
            'host_id': host_id,
            'ready': all_passed,
            'checks': checks,
            'summary': {
                'passed': passed_count,
                'warning': warning_count,
                'failed': failed_count,
                'total': len(checks)
            }
        }, message='Pre-flight checks completed' if all_passed else 'Some pre-flight checks failed')
        
    except Exception as e:
        logger.error(f"Error running pre-flight checks on {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/deploy/<host_id>/rollback', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def rollback_deployment(host_id):
    """
    POST /api/ops/deploy/<host_id>/rollback
    Rollback to previous deployment by restoring .env backup and restarting services
    
    Request body (optional):
        {
            "backup_file": "specific_backup_file_name"  // Use specific backup
        }
    
    Returns:
        JSON object with rollback result
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        data = request.get_json() or {}
        specific_backup = data.get('backup_file')
        
        if specific_backup:
            backup_file = f"{ENV_PATH}.{specific_backup}"
        else:
            list_result = fleet_manager.execute_command(
                host_id,
                f'ls -t {ENV_PATH}.backup.* 2>/dev/null | head -1',
                timeout=30,
                bypass_whitelist=True
            )
            
            if not list_result.get('success') or not list_result.get('output', '').strip():
                return make_response(False, message='No backup files found to rollback to', status_code=404)
            
            backup_file = list_result.get('output', '').strip()
        
        check_result = fleet_manager.execute_command(
            host_id,
            f'test -f {backup_file} && echo "exists"',
            timeout=10,
            bypass_whitelist=True
        )
        
        if 'exists' not in check_result.get('output', ''):
            return make_response(False, message=f'Backup file not found: {backup_file}', status_code=404)
        
        pre_backup_result = fleet_manager.execute_command(
            host_id,
            f'cp {ENV_PATH} {ENV_PATH}.pre-rollback.$(date +%Y%m%d_%H%M%S)',
            timeout=30,
            bypass_whitelist=True
        )
        
        if not pre_backup_result.get('success'):
            logger.warning(f"Failed to create pre-rollback backup on {host_id}")
        
        restore_result = fleet_manager.execute_command(
            host_id,
            f'cp {backup_file} {ENV_PATH}',
            timeout=30,
            bypass_whitelist=True
        )
        
        if not restore_result.get('success'):
            return make_response(False, message=f"Failed to restore backup: {restore_result.get('error')}", status_code=500)
        
        restart_result = fleet_manager.execute_command(
            host_id,
            'cd /opt/homelab/HomeLabHub && docker compose down && docker compose up -d',
            timeout=300,
            bypass_whitelist=True
        )
        
        restart_success = restart_result.get('success', False)
        restart_output = restart_result.get('output', '')
        
        logger.info(f"Rollback completed on {host_id} using backup: {backup_file}")
        
        return make_response(True, {
            'host_id': host_id,
            'rolled_back': True,
            'backup_used': backup_file,
            'pre_rollback_backup': pre_backup_result.get('success', False),
            'services_restarted': restart_success,
            'restart_output': restart_output[:2000] if restart_output else ''
        }, message=f'Rollback completed successfully using {backup_file}')
        
    except Exception as e:
        logger.error(f"Error rolling back deployment on {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/deploy/<host_id>/backups', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_backups(host_id):
    """
    GET /api/ops/deploy/<host_id>/backups
    List available .env backup files for rollback
    
    Returns:
        JSON object with list of backup files
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        list_result = fleet_manager.execute_command(
            host_id,
            f'ls -lt {ENV_PATH}.backup.* {ENV_PATH}.pre-rollback.* 2>/dev/null | head -20',
            timeout=30,
            bypass_whitelist=True
        )
        
        backups = []
        if list_result.get('success') and list_result.get('output', '').strip():
            for line in list_result.get('output', '').strip().split('\n'):
                parts = line.split()
                if len(parts) >= 9:
                    filename = parts[-1]
                    date_str = ' '.join(parts[5:8])
                    size = parts[4]
                    
                    backup_type = 'pre-rollback' if 'pre-rollback' in filename else 'backup'
                    
                    backups.append({
                        'filename': filename,
                        'date': date_str,
                        'size': size,
                        'type': backup_type
                    })
        
        return make_response(True, {
            'host_id': host_id,
            'backups': backups,
            'count': len(backups)
        })
        
    except Exception as e:
        logger.error(f"Error listing backups on {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/hosts', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def list_ops_hosts():
    """
    GET /api/ops/hosts
    List hosts available for ops operations with their status
    
    Returns:
        JSON array of host objects
    """
    try:
        hosts = []
        for host_id in ALLOWED_HOST_IDS:
            host_config = fleet_manager._get_host_config(host_id)
            if not host_config:
                continue
            
            host_data = {
                'host_id': host_id,
                'name': host_config.get('name', host_id),
                'description': host_config.get('description', ''),
                'role': host_config.get('role', 'unknown'),
                'status': 'unknown',
                'online': False
            }
            
            status = fleet_manager.get_host_status(host_id)
            if status:
                host_data['status'] = 'online'
                host_data['online'] = True
                host_data['cpu_percent'] = status.get('cpu_percent', 0)
                host_data['memory_percent'] = status.get('memory_percent', 0)
                host_data['disk_percent'] = status.get('disk_percent', 0)
                host_data['containers_running'] = status.get('containers_running', 0)
                host_data['container_count'] = status.get('container_count', 0)
            else:
                host_data['status'] = 'offline'
            
            hosts.append(host_data)
        
        return make_response(True, {
            'hosts': hosts,
            'count': len(hosts)
        })
        
    except Exception as e:
        logger.error(f"Error listing ops hosts: {e}")
        return make_response(False, message=str(e), status_code=500)


@ops_center_bp.route('/api/ops/health/<host_id>', methods=['GET'])
@require_auth
@require_permission(Permission.VIEW_DOCKER)
def get_service_health(host_id):
    """
    GET /api/ops/health/<host_id>
    Get service health status from remote server
    
    Returns:
        JSON object with service health info
    """
    valid, error = validate_host_id(host_id)
    if not valid:
        return make_response(False, message=error, status_code=400)
    
    try:
        result = fleet_manager.execute_command(
            host_id,
            "docker ps --format '{{.Names}}|{{.Status}}|{{.State}}'",
            timeout=30,
            bypass_whitelist=True
        )
        
        if not result.get('success'):
            return make_response(False, message='Failed to get container status', status_code=500)
        
        services = []
        for line in result.get('output', '').strip().split('\n'):
            if not line:
                continue
            parts = line.split('|')
            if len(parts) >= 3:
                name = parts[0]
                status = parts[1]
                state = parts[2]
                
                is_healthy = 'healthy' in status.lower() or state.lower() == 'running'
                
                services.append({
                    'name': name,
                    'status': status,
                    'state': state,
                    'healthy': is_healthy
                })
        
        healthy_count = sum(1 for s in services if s['healthy'])
        
        return make_response(True, {
            'host_id': host_id,
            'services': services,
            'total': len(services),
            'healthy': healthy_count,
            'unhealthy': len(services) - healthy_count
        })
        
    except Exception as e:
        logger.error(f"Error getting service health for {host_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['ops_center_bp']
