"""
Setup Wizard Routes
Comprehensive configuration wizard for all required services
"""
from flask import Blueprint, jsonify, request, render_template
from utils.auth import require_auth, require_web_auth
import logging
import os
import re
import requests

logger = logging.getLogger(__name__)

setup_bp = Blueprint('setup', __name__)

TAILSCALE_IP_PATTERN = re.compile(r'^100\.\d{1,3}\.\d{1,3}\.\d{1,3}$')
PRIVATE_IP_PATTERN = re.compile(r'^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$')
ALLOWED_HOST_IDS = ['linode', 'local']
ALLOWED_STORAGE_ENDPOINTS = [
    'play.min.io',
    's3.amazonaws.com',
    's3.backblazeb2.com',
]

def is_valid_tailscale_or_private_ip(ip: str) -> bool:
    """Check if IP is a valid Tailscale or private network IP"""
    if not ip:
        return False
    return bool(TAILSCALE_IP_PATTERN.match(ip) or PRIVATE_IP_PATTERN.match(ip))

def is_safe_storage_endpoint(endpoint: str) -> bool:
    """Check if storage endpoint is from allowed list or user's own domain"""
    if not endpoint:
        return False
    try:
        from urllib.parse import urlparse
        parsed = urlparse(endpoint)
        host = parsed.netloc or parsed.path
        host = host.split(':')[0]
        for allowed in ALLOWED_STORAGE_ENDPOINTS:
            if host.endswith(allowed):
                return True
        if is_valid_tailscale_or_private_ip(host):
            return True
        if host.endswith('.evindrake.net') or host.endswith('.rig-city.com'):
            return True
        return False
    except Exception:
        return False


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@setup_bp.route('/setup-wizard')
@require_web_auth
def setup_wizard_page():
    """Render Setup Wizard page"""
    return render_template('setup_wizard.html')


@setup_bp.route('/api/setup/status', methods=['GET'])
@require_auth
def get_setup_status():
    """
    GET /api/setup/status
    Get configuration status for all services
    """
    try:
        status = {
            'cloudflare': {
                'configured': bool(os.environ.get('CLOUDFLARE_API_TOKEN')),
                'name': 'Cloudflare DNS',
                'icon': 'bi-cloud',
            },
            'tailscale': {
                'configured': bool(os.environ.get('TAILSCALE_LINODE_HOST') or os.environ.get('TAILSCALE_LOCAL_HOST')),
                'linode_ip': os.environ.get('TAILSCALE_LINODE_HOST', ''),
                'local_ip': os.environ.get('TAILSCALE_LOCAL_HOST', ''),
                'name': 'Tailscale VPN',
                'icon': 'bi-diagram-3',
            },
            'fleet_ssh': {
                'configured': bool(os.environ.get('FLEET_SSH_KEY_PATH')),
                'key_path': os.environ.get('FLEET_SSH_KEY_PATH', '~/.ssh/id_rsa'),
                'linode_user': os.environ.get('FLEET_LINODE_SSH_USER', 'root'),
                'local_user': os.environ.get('FLEET_LOCAL_SSH_USER', 'evin'),
                'name': 'Fleet SSH Keys',
                'icon': 'bi-key',
            },
            'cloud_storage': {
                'configured': bool(os.environ.get('MINIO_ENDPOINT') or os.environ.get('B2_ENDPOINT')),
                'endpoint': os.environ.get('MINIO_ENDPOINT') or os.environ.get('B2_ENDPOINT', ''),
                'access_key_set': bool(os.environ.get('MINIO_ACCESS_KEY') or os.environ.get('B2_ACCESS_KEY_ID')),
                'name': 'Cloud Storage',
                'icon': 'bi-cloud-arrow-up',
            },
            'openai': {
                'configured': bool(os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY') or os.environ.get('OPENAI_API_KEY')),
                'name': 'OpenAI API',
                'icon': 'bi-robot',
            },
        }
        
        configured_count = sum(1 for s in status.values() if s.get('configured'))
        total_count = len(status)
        
        return make_response(True, {
            'services': status,
            'summary': {
                'configured': configured_count,
                'total': total_count,
                'percentage': int((configured_count / total_count) * 100) if total_count > 0 else 0
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting setup status: {e}")
        return make_response(False, message=str(e), status_code=500)


@setup_bp.route('/api/setup/test/cloudflare', methods=['POST'])
@require_auth
def test_cloudflare():
    """
    POST /api/setup/test/cloudflare
    Test Cloudflare API connection
    """
    try:
        data = request.get_json() or {}
        api_token = data.get('api_token') or os.environ.get('CLOUDFLARE_API_TOKEN')
        
        if not api_token:
            return make_response(False, message="API token is required", status_code=400)
        
        response = requests.get(
            "https://api.cloudflare.com/client/v4/user/tokens/verify",
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        result = response.json()
        
        if result.get('success'):
            zones_response = requests.get(
                "https://api.cloudflare.com/client/v4/zones",
                headers={
                    "Authorization": f"Bearer {api_token}",
                    "Content-Type": "application/json"
                },
                timeout=10
            )
            zones_result = zones_response.json()
            zone_count = len(zones_result.get('result', [])) if zones_result.get('success') else 0
            
            return make_response(True, {
                'status': 'active',
                'zones_count': zone_count,
                'message': f'Connected successfully. Found {zone_count} DNS zones.'
            })
        else:
            errors = result.get('errors', [])
            error_msg = errors[0].get('message') if errors else 'Invalid token'
            return make_response(False, message=f"Verification failed: {error_msg}", status_code=401)
            
    except requests.exceptions.Timeout:
        return make_response(False, message="Connection timed out", status_code=504)
    except Exception as e:
        logger.error(f"Error testing Cloudflare: {e}")
        return make_response(False, message=str(e), status_code=500)


@setup_bp.route('/api/setup/test/tailscale', methods=['POST'])
@require_auth
def test_tailscale():
    """
    POST /api/setup/test/tailscale
    Test Tailscale connectivity to configured hosts (only Tailscale/private IPs)
    """
    try:
        data = request.get_json() or {}
        linode_ip = data.get('linode_ip') or os.environ.get('TAILSCALE_LINODE_HOST', '')
        local_ip = data.get('local_ip') or os.environ.get('TAILSCALE_LOCAL_HOST', '')
        
        results = {
            'linode': {'ip': linode_ip, 'reachable': False},
            'local': {'ip': local_ip, 'reachable': False}
        }
        
        import socket
        
        for host_key, ip in [('linode', linode_ip), ('local', local_ip)]:
            if ip:
                if not is_valid_tailscale_or_private_ip(ip):
                    results[host_key]['error'] = 'Only Tailscale (100.x.x.x) or private network IPs allowed'
                    continue
                    
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    sock.settimeout(5)
                    result = sock.connect_ex((ip, 22))
                    sock.close()
                    results[host_key]['reachable'] = (result == 0)
                except Exception as e:
                    results[host_key]['error'] = str(e)
        
        success = any(r.get('reachable') for r in results.values())
        message = "At least one host is reachable" if success else "No hosts are reachable"
        
        return make_response(success, data=results, message=message)
        
    except Exception as e:
        logger.error(f"Error testing Tailscale: {e}")
        return make_response(False, message=str(e), status_code=500)


@setup_bp.route('/api/setup/test/ssh', methods=['POST'])
@require_auth
def test_ssh():
    """
    POST /api/setup/test/ssh
    Test SSH connection to fleet hosts (only 'linode' or 'local' allowed)
    """
    try:
        data = request.get_json() or {}
        host_id = data.get('host_id', 'linode')
        
        if host_id not in ALLOWED_HOST_IDS:
            return make_response(False, message=f"Invalid host_id. Allowed: {', '.join(ALLOWED_HOST_IDS)}", status_code=400)
        
        try:
            from services.fleet_service import fleet_manager
            
            result = fleet_manager.execute_command(host_id, 'echo "SSH connection successful"', timeout=10)
            
            if result.get('success'):
                return make_response(True, {
                    'host_id': host_id,
                    'connected': True,
                    'output': result.get('stdout', '').strip()
                }, message=f"SSH connection to {host_id} successful")
            else:
                return make_response(False, {
                    'host_id': host_id,
                    'connected': False,
                    'error': result.get('error', 'Unknown error')
                }, message=f"SSH connection failed: {result.get('error')}")
                
        except ImportError:
            return make_response(False, message="Fleet service not available", status_code=503)
            
    except Exception as e:
        logger.error(f"Error testing SSH: {e}")
        return make_response(False, message=str(e), status_code=500)


@setup_bp.route('/api/setup/test/storage', methods=['POST'])
@require_auth
def test_storage():
    """
    POST /api/setup/test/storage
    Test cloud storage connection (MinIO/S3/B2) - only allowed endpoints
    """
    try:
        data = request.get_json() or {}
        endpoint = data.get('endpoint') or os.environ.get('MINIO_ENDPOINT') or os.environ.get('B2_ENDPOINT')
        access_key = data.get('access_key') or os.environ.get('MINIO_ACCESS_KEY') or os.environ.get('B2_ACCESS_KEY_ID')
        secret_key = data.get('secret_key') or os.environ.get('MINIO_SECRET_KEY') or os.environ.get('B2_SECRET_ACCESS_KEY')
        
        if not all([endpoint, access_key, secret_key]):
            return make_response(False, message="Endpoint, access key, and secret key are required", status_code=400)
        
        if not is_safe_storage_endpoint(endpoint):
            return make_response(False, message="Storage endpoint not allowed. Use AWS S3, Backblaze B2, or local MinIO on private network.", status_code=400)
        
        try:
            from minio import Minio
            from urllib.parse import urlparse
            
            parsed = urlparse(endpoint)
            host = parsed.netloc or parsed.path
            secure = parsed.scheme == 'https' if parsed.scheme else True
            
            client = Minio(
                host,
                access_key=access_key,
                secret_key=secret_key,
                secure=secure
            )
            
            buckets = list(client.list_buckets())
            
            return make_response(True, {
                'connected': True,
                'buckets_count': len(buckets),
                'buckets': [b.name for b in buckets[:10]]
            }, message=f"Connected successfully. Found {len(buckets)} buckets.")
            
        except ImportError:
            return make_response(False, message="MinIO client not installed", status_code=503)
        except Exception as e:
            return make_response(False, message=f"Connection failed: {str(e)}", status_code=400)
            
    except Exception as e:
        logger.error(f"Error testing storage: {e}")
        return make_response(False, message=str(e), status_code=500)


@setup_bp.route('/api/setup/test/openai', methods=['POST'])
@require_auth
def test_openai():
    """
    POST /api/setup/test/openai
    Test OpenAI API connection
    """
    try:
        data = request.get_json() or {}
        api_key = data.get('api_key') or os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY') or os.environ.get('OPENAI_API_KEY')
        
        if not api_key:
            return make_response(False, message="API key is required", status_code=400)
        
        base_url = os.environ.get('AI_INTEGRATIONS_OPENAI_BASE_URL', 'https://api.openai.com/v1')
        
        response = requests.get(
            f"{base_url}/models",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        if response.status_code == 200:
            result = response.json()
            models = result.get('data', [])
            gpt4_available = any('gpt-4' in m.get('id', '') for m in models)
            
            return make_response(True, {
                'connected': True,
                'models_count': len(models),
                'gpt4_available': gpt4_available
            }, message=f"Connected successfully. Found {len(models)} available models.")
        elif response.status_code == 401:
            return make_response(False, message="Invalid API key", status_code=401)
        else:
            return make_response(False, message=f"API error: {response.status_code}", status_code=response.status_code)
            
    except requests.exceptions.Timeout:
        return make_response(False, message="Connection timed out", status_code=504)
    except Exception as e:
        logger.error(f"Error testing OpenAI: {e}")
        return make_response(False, message=str(e), status_code=500)


@setup_bp.route('/api/setup/save', methods=['POST'])
@require_auth
def save_config():
    """
    POST /api/setup/save
    Save configuration (writes to database/config)
    Note: Environment variables cannot be set at runtime,
    this saves to a config file or database for reference
    """
    try:
        data = request.get_json() or {}
        service = data.get('service')
        config = data.get('config', {})
        
        if not service:
            return make_response(False, message="Service name is required", status_code=400)
        
        try:
            from services.db_service import db_service
            from models.settings import SystemSetting
            from sqlalchemy import select
            
            if db_service.is_available:
                with db_service.get_session() as session:
                    for key, value in config.items():
                        setting_key = f"setup.{service}.{key}"
                        
                        existing = session.execute(
                            select(SystemSetting).where(SystemSetting.key == setting_key)
                        ).scalar_one_or_none()
                        
                        if existing:
                            existing.value = str(value) if value else ''
                        else:
                            new_setting = SystemSetting(
                                key=setting_key,
                                value=str(value) if value else '',
                                category='setup'
                            )
                            session.add(new_setting)
                    
                    session.commit()
                    
                return make_response(True, message=f"Configuration saved for {service}")
            else:
                return make_response(False, message="Database not available", status_code=503)
                
        except ImportError:
            logger.warning("Database service not available, config not persisted")
            return make_response(True, message="Configuration validated (not persisted - database unavailable)")
            
    except Exception as e:
        logger.error(f"Error saving config: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['setup_bp']
