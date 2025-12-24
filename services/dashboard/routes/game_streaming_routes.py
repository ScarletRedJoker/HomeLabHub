"""Game Streaming API Routes"""
import logging
from flask import Blueprint, request, jsonify, session, render_template
from functools import wraps

from services.game_streaming_service import game_streaming_service
from workers.gaming_worker import (
    discover_sunshine_hosts,
    check_sunshine_health,
    monitor_active_sessions
)

logger = logging.getLogger(__name__)

game_streaming_bp = Blueprint('game_streaming', __name__)


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@game_streaming_bp.route('/game-streaming')
@login_required
def game_streaming_page():
    """Render game streaming page"""
    from services.dashboard.config import Config
    return render_template(
        'game_streaming.html',
        windows_kvm_ip=Config.WINDOWS_KVM_IP or Config.SUNSHINE_HOST or 'Not configured'
    )


@game_streaming_bp.route('/api/gaming/hosts', methods=['GET'])
@login_required
def get_hosts():
    """
    Get all configured Sunshine hosts
    
    Returns:
        JSON array of hosts
    """
    try:
        hosts = game_streaming_service.get_hosts()
        return jsonify({
            'success': True,
            'hosts': hosts,
            'count': len(hosts)
        })
    except Exception as e:
        logger.error(f"Failed to get hosts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/discover', methods=['POST'])
@login_required
def discover_hosts():
    """
    Trigger network discovery for Sunshine hosts
    
    JSON body (optional):
        network_range: Network range to scan (e.g., "192.168.1.0/24")
        async: Run async in background (default: true)
    
    Returns:
        JSON with discovered hosts or task ID
    """
    try:
        data = request.get_json() or {}
        network_range = data.get('network_range')
        run_async = data.get('async', True)
        
        if run_async:
            # Run discovery in background
            task = discover_sunshine_hosts.delay(network_range)
            
            return jsonify({
                'success': True,
                'message': 'Discovery started in background',
                'task_id': task.id,
                'async': True
            })
        else:
            # Run discovery synchronously
            discovered = game_streaming_service.auto_discover_hosts(network_range)
            
            # Save discovered hosts to database
            saved_hosts = []
            for host_info in discovered:
                try:
                    host = game_streaming_service.add_host_manual(
                        host_info['host_ip'],
                        host_info.get('host_name')
                    )
                    saved_hosts.append(host)
                except Exception as e:
                    logger.error(f"Failed to save discovered host {host_info['host_ip']}: {e}")
            
            return jsonify({
                'success': True,
                'discovered': discovered,
                'saved': saved_hosts,
                'count': len(saved_hosts),
                'async': False
            })
            
    except Exception as e:
        logger.error(f"Host discovery failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts', methods=['POST'])
@login_required
def add_host():
    """
    Manually add a Sunshine host
    
    JSON body:
        host_ip: Host IP address (required)
        host_name: Host name (optional)
        ssh_user: SSH username (optional, defaults to Config.SSH_USER)
        ssh_port: SSH port (optional, defaults to 22)
        ssh_key_path: SSH key path (optional, defaults to Config.SSH_KEY_PATH)
        sunshine_api_key: Sunshine API key (optional, defaults to Config.SUNSHINE_API_KEY)
    
    Returns:
        JSON with added host information
    """
    try:
        data = request.get_json()
        
        if not data or 'host_ip' not in data:
            return jsonify({
                'success': False,
                'error': 'host_ip is required'
            }), 400
        
        host_ip = data['host_ip']
        host_name = data.get('host_name')
        ssh_user = data.get('ssh_user')
        ssh_port = data.get('ssh_port')
        ssh_key_path = data.get('ssh_key_path')
        sunshine_api_key = data.get('sunshine_api_key')
        
        host = game_streaming_service.add_host_manual(
            host_ip, 
            host_name,
            ssh_user=ssh_user,
            ssh_port=ssh_port,
            ssh_key_path=ssh_key_path,
            sunshine_api_key=sunshine_api_key
        )
        
        return jsonify({
            'success': True,
            'message': f'Host {host_ip} added successfully',
            'host': host
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Failed to add host: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>', methods=['PUT'])
@login_required
def update_host(host_id):
    """
    Update host configuration
    
    JSON body:
        host_name: New host name (optional)
        host_ip: New IP address (optional)
        api_url: Sunshine API URL (optional)
        ssh_user: SSH username (optional)
        ssh_port: SSH port (optional)
        ssh_key_path: SSH key path (optional)
        sunshine_api_key: Sunshine API key (optional)
    
    Returns:
        JSON with updated host information
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No update data provided'
            }), 400
        
        host = game_streaming_service.update_host(host_id, data)
        
        return jsonify({
            'success': True,
            'message': 'Host updated successfully',
            'host': host
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to update host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>', methods=['DELETE'])
@login_required
def delete_host(host_id):
    """
    Delete a Sunshine host
    
    Returns:
        JSON confirmation
    """
    try:
        game_streaming_service.delete_host(host_id)
        
        return jsonify({
            'success': True,
            'message': 'Host deleted successfully'
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to delete host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/pair', methods=['POST'])
@login_required
def pair_host():
    """
    Pair with a Sunshine host using PIN
    
    JSON body:
        host_id: Host UUID (required)
        pin: 4-digit PIN from Moonlight (required)
    
    Returns:
        JSON with pairing result
    """
    try:
        data = request.get_json()
        
        if not data or 'host_id' not in data or 'pin' not in data:
            return jsonify({
                'success': False,
                'error': 'host_id and pin are required'
            }), 400
        
        host_id = data['host_id']
        pin = data['pin']
        
        result = game_streaming_service.initiate_pairing(host_id, pin)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Pairing failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions', methods=['GET'])
@login_required
def get_sessions():
    """
    Get game streaming sessions
    
    Query params:
        status: Filter by status (optional)
        limit: Max sessions to return (default: 50)
    
    Returns:
        JSON array of sessions
    """
    try:
        status = request.args.get('status')
        limit = int(request.args.get('limit', 50))
        
        sessions = game_streaming_service.get_sessions(status, limit)
        
        return jsonify({
            'success': True,
            'sessions': sessions,
            'count': len(sessions)
        })
        
    except Exception as e:
        logger.error(f"Failed to get sessions: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions', methods=['POST'])
@login_required
def create_session():
    """
    Create a new game streaming session
    
    JSON body:
        host_ip: Host IP (required)
        host_name: Host name (optional)
        session_type: Type of streaming (default: moonlight)
        client_device: Client device name (optional)
        game_name: Game being played (optional)
        resolution: Stream resolution (optional)
        fps: Stream FPS (optional)
        bitrate_mbps: Stream bitrate (optional)
    
    Returns:
        JSON with created session
    """
    try:
        data = request.get_json()
        
        if not data or 'host_ip' not in data:
            return jsonify({
                'success': False,
                'error': 'host_ip is required'
            }), 400
        
        # Add user info
        data['user_id'] = session.get('username', 'unknown')
        
        session_obj = game_streaming_service.create_session(data)
        
        return jsonify({
            'success': True,
            'message': 'Session created',
            'session': session_obj
        })
        
    except Exception as e:
        logger.error(f"Failed to create session: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions/<session_id>', methods=['PUT'])
@login_required
def update_session(session_id):
    """
    Update a game streaming session
    
    JSON body:
        status: Session status (optional)
        latency_ms: Latency in ms (optional)
        fps: Current FPS (optional)
        bitrate_mbps: Current bitrate (optional)
        resolution: Resolution (optional)
        game_name: Game name (optional)
    
    Returns:
        JSON with updated session
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No update data provided'
            }), 400
        
        session_obj = game_streaming_service.update_session(session_id, data)
        
        return jsonify({
            'success': True,
            'message': 'Session updated',
            'session': session_obj
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to update session {session_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/sessions/start', methods=['POST'])
@login_required
def start_streaming_session(host_id):
    """
    Start a new streaming session for a host
    
    JSON body:
        app_name: Name of app/game being streamed (required)
        client_info: Client device information (optional)
            {
                'device_name': str,
                'device_type': str,
                'resolution': str,
                'user_id': str
            }
    
    Returns:
        JSON with session_id and session details
    """
    try:
        data = request.get_json() or {}
        
        if not data.get('app_name'):
            return jsonify({
                'success': False,
                'error': 'app_name is required'
            }), 400
        
        app_name = data['app_name']
        client_info = data.get('client_info', {})
        
        # Add user_id from session if not provided
        if 'user_id' not in client_info:
            client_info['user_id'] = session.get('username', 'unknown')
        
        result = game_streaming_service.create_streaming_session(
            host_id, 
            app_name, 
            client_info
        )
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to start streaming session: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions/<session_id>/stop', methods=['POST'])
@login_required
def stop_streaming_session(session_id):
    """
    Stop an active streaming session
    
    Returns:
        JSON with final session statistics
    """
    try:
        result = game_streaming_service.end_streaming_session(session_id)
        
        if result['success']:
            return jsonify(result)
        else:
            return jsonify(result), 400
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to stop streaming session {session_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/sessions/current', methods=['GET'])
@login_required
def get_current_streaming_session(host_id):
    """
    Get current active session for a host
    
    Returns:
        JSON with active session or null
    """
    try:
        result = game_streaming_service.get_current_session(host_id)
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Failed to get current session for host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/sessions/<session_id>/stats', methods=['PUT'])
@login_required
def update_streaming_session_stats(session_id):
    """
    Update session statistics (called periodically from telemetry)
    
    JSON body:
        bitrate: Current bitrate in Mbps (optional)
        fps: Current FPS (optional)
        latency: Current latency in ms (optional)
        dropped_frames: Number of dropped frames (optional)
        total_frames: Total frames (optional)
        resolution: Current resolution (optional)
    
    Returns:
        JSON success response
    """
    try:
        data = request.get_json() or {}
        
        game_streaming_service.update_session_stats(session_id, data)
        
        return jsonify({
            'success': True,
            'message': 'Session stats updated'
        })
        
    except Exception as e:
        logger.error(f"Failed to update session stats for {session_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/diagnostics', methods=['POST'])
@login_required
def run_diagnostics():
    """
    Run diagnostics on a Sunshine host
    
    JSON body:
        host_id: Host UUID (required)
    
    Returns:
        JSON with diagnostic results
    """
    try:
        data = request.get_json()
        
        if not data or 'host_id' not in data:
            return jsonify({
                'success': False,
                'error': 'host_id is required'
            }), 400
        
        host_id = data['host_id']
        
        diagnostics = game_streaming_service.run_diagnostics(host_id)
        
        return jsonify({
            'success': True,
            'diagnostics': diagnostics
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Diagnostics failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/apps', methods=['GET'])
@login_required
def get_applications():
    """
    Get available applications/games from a Sunshine host
    
    Query params:
        host_id: Host UUID (required)
    
    Returns:
        JSON array of applications
    """
    try:
        host_id = request.args.get('host_id')
        
        if not host_id:
            return jsonify({
                'success': False,
                'error': 'host_id parameter is required'
            }), 400
        
        apps = game_streaming_service.get_applications(host_id)
        
        return jsonify({
            'success': True,
            'applications': apps,
            'count': len(apps)
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to get applications: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/health/<host_id>', methods=['GET'])
@login_required
def check_host_health(host_id):
    """
    Check health status of a Sunshine host
    
    Returns:
        JSON with health status
    """
    try:
        health = game_streaming_service.check_health(host_id)
        
        return jsonify({
            'success': True,
            'health': health
        })
        
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/system-check', methods=['GET'])
@login_required
def system_check():
    """
    Check system requirements for Sunshine installation on REMOTE host
    Used by the Setup Wizard to verify GPU, drivers, and NVENC support via SSH
    
    Query params:
        host_id: UUID of the Sunshine host to check (required)
    
    Returns:
        JSON with system check results including error states
    """
    try:
        host_id = request.args.get('host_id')
        
        if not host_id:
            return jsonify({
                'success': False,
                'error': 'Missing required parameter',
                'error_details': 'host_id parameter is required'
            }), 400
        
        # Run remote system check via SSH
        result = game_streaming_service.check_system_requirements_remote(host_id)
        
        # Return the result (includes success, error, checks, etc.)
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"System check failed: {e}")
        return jsonify({
            'success': False,
            'error': 'System check failed',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/performance-metrics', methods=['GET'])
@login_required
def get_performance_metrics():
    """
    Get real-time performance metrics for game streaming from REMOTE host
    Queries the specified Sunshine host via SSH for GPU stats, encoder utilization, etc.
    
    Query params:
        host_id: UUID of the Sunshine host to monitor (required)
    
    Returns:
        JSON with performance metrics including host_id and error states
    """
    try:
        host_id = request.args.get('host_id')
        
        if not host_id:
            return jsonify({
                'success': False,
                'error': 'Missing required parameter',
                'error_details': 'host_id parameter is required'
            }), 400
        
        # Get remote performance metrics via SSH
        result = game_streaming_service.get_performance_metrics_remote(host_id)
        
        # Return the result (includes success, error, metrics, host_id, etc.)
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Failed to get performance metrics: {e}")
        return jsonify({
            'success': False,
            'error': 'Metrics unavailable',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/apps', methods=['GET'])
@login_required
def get_host_apps(host_id):
    """
    Get all apps configured on Sunshine host via API
    
    Returns:
        JSON with apps list
    """
    try:
        result = game_streaming_service.get_sunshine_apps(host_id)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Host not found',
            'error_details': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to get apps for host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/apps', methods=['POST'])
@login_required
def add_host_app(host_id):
    """
    Add new app to Sunshine host
    
    JSON body:
        name: App name (required)
        cmd: Executable command/path (required)
        image_path: Icon path (optional)
        working_dir: Working directory (optional)
        prep_cmd: Prep commands (optional)
        detached: Detached commands (optional)
    
    Returns:
        JSON with result
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No app configuration provided'
            }), 400
        
        result = game_streaming_service.add_sunshine_app(host_id, data)
        
        if result.get('success'):
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400
    except Exception as e:
        logger.error(f"Failed to add app to host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/apps/<int:app_index>', methods=['PUT'])
@login_required
def update_host_app(host_id, app_index):
    """
    Update existing app on Sunshine host
    
    JSON body:
        name: App name (optional)
        cmd: Executable command/path (optional)
        image_path: Icon path (optional)
        working_dir: Working directory (optional)
        prep_cmd: Prep commands (optional)
        detached: Detached commands (optional)
    
    Returns:
        JSON with result
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No update data provided'
            }), 400
        
        result = game_streaming_service.update_sunshine_app(host_id, app_index, data)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to update app on host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/apps/<int:app_index>', methods=['DELETE'])
@login_required
def delete_host_app(host_id, app_index):
    """
    Delete app from Sunshine host
    
    Returns:
        JSON with result
    """
    try:
        result = game_streaming_service.delete_sunshine_app(host_id, app_index)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to delete app from host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/apps/<int:app_index>/start', methods=['POST'])
@login_required
def start_host_app(host_id, app_index):
    """
    Start streaming session for specific app remotely
    
    Returns:
        JSON with result
    """
    try:
        result = game_streaming_service.start_sunshine_app(host_id, app_index)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to start app on host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/apps/stop', methods=['POST'])
@login_required
def stop_host_app(host_id):
    """
    Stop current streaming session on Sunshine host
    
    Returns:
        JSON with result
    """
    try:
        result = game_streaming_service.stop_sunshine_app(host_id)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to stop streaming on host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/app-templates', methods=['GET'])
@login_required
def get_app_templates():
    """
    Get categorized list of Windows application templates
    
    Returns comprehensive templates for:
    - Gaming (Steam, Epic, GOG, Xbox)
    - Productivity (Office, Adobe)
    - Development (VS Code, Visual Studio, IntelliJ)
    - Communication (Discord, Slack, Teams, Zoom)
    - Browsers (Chrome, Firefox, Edge, Opera, Brave)
    - Utilities (File Explorer, PowerShell, etc.)
    - Desktop (Full desktop streaming)
    
    Returns:
        JSON with categorized templates:
        {
            'success': True,
            'templates': {
                'gaming': [...],
                'productivity': [...],
                ...
            },
            'categories': ['gaming', 'productivity', ...],
            'total_count': int
        }
    """
    try:
        templates = game_streaming_service.get_app_templates()
        
        # Count total templates
        total_count = sum(len(apps) for apps in templates.values())
        
        return jsonify({
            'success': True,
            'templates': templates,
            'categories': list(templates.keys()),
            'total_count': total_count
        })
        
    except Exception as e:
        logger.error(f"Failed to get app templates: {e}")
        return jsonify({
            'success': False,
            'error': 'Failed to load app templates',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/scan-apps', methods=['POST'])
@login_required
def scan_installed_apps(host_id):
    """
    Scan remote Windows host for installed applications via SSH
    
    This endpoint:
    1. Connects to the Sunshine host via SSH
    2. Runs PowerShell scripts to scan Program Files, Program Files (x86), and LocalAppData
    3. Detects installed applications
    4. Returns a list of detected apps with auto-populated paths and categories
    
    Args:
        host_id: Host UUID
    
    Returns:
        JSON with detected applications:
        {
            'success': True,
            'apps': [
                {
                    'name': 'Google Chrome',
                    'cmd': ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
                    'category': 'browsers',
                    'detected': True,
                    'size_mb': 123.45,
                    'modified': '2025-11-15 10:30:00'
                },
                ...
            ],
            'count': 15,
            'total_scanned': 234,
            'message': 'Scan complete'
        }
    
    Notes:
        - Requires SSH access to be configured on the Sunshine host
        - Scan can take 30-60 seconds depending on installed apps
        - Only returns common applications, filters out system files
    """
    try:
        result = game_streaming_service.scan_installed_apps(host_id)
        
        if result.get('success'):
            return jsonify(result)
        else:
            # Return error with appropriate status code
            status_code = 500
            
            if 'SSH service not available' in result.get('error', ''):
                status_code = 503
                result['help'] = 'Please configure SSH access to the Sunshine host in host settings'
            elif 'not found' in result.get('error', '').lower():
                status_code = 404
            
            return jsonify(result), status_code
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to scan apps on host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'App scan failed',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/sessions/active', methods=['GET'])
@login_required
def get_active_sessions(host_id):
    """
    Get currently active streaming sessions for a host
    
    Returns:
        JSON with active sessions
    """
    try:
        result = game_streaming_service.get_active_streaming_sessions(host_id)
        
        return jsonify(result)
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'sessions': []
        }), 404
    except Exception as e:
        logger.error(f"Failed to get active sessions for host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e),
            'sessions': []
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/quality-config', methods=['PUT'])
@login_required
def update_quality_config(host_id):
    """
    Update Sunshine quality configuration via API
    
    This endpoint ACTUALLY configures the Sunshine server's encoding settings
    instead of just providing recommendations to the client.
    
    JSON body:
        preset: str ('ultra', 'high', 'balanced', 'performance') OR custom config:
        {
            'resolution': '1920x1080',
            'fps': 60,
            'bitrate': 20000,  # kbps
            'encoder_preset': 'p6',  # NVENC preset (p1-p7)
            'codec': 'h264'  # h264, h265, or av1
        }
    
    Returns:
        JSON with result including applied configuration
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No configuration data provided'
            }), 400
        
        # Define quality presets
        QUALITY_PRESETS = {
            'ultra': {
                'resolution': '3840x2160',
                'fps': 60,
                'bitrate': 80000,
                'encoder_preset': 'p6',
                'codec': 'h265'
            },
            'high': {
                'resolution': '2560x1440',
                'fps': 60,
                'bitrate': 40000,
                'encoder_preset': 'p6',
                'codec': 'h265'
            },
            'balanced': {
                'resolution': '1920x1080',
                'fps': 60,
                'bitrate': 20000,
                'encoder_preset': 'p6',
                'codec': 'h264'
            },
            'performance': {
                'resolution': '1920x1080',
                'fps': 30,
                'bitrate': 10000,
                'encoder_preset': 'p4',
                'codec': 'h264'
            }
        }
        
        # Check if using named preset or custom config
        if 'preset' in data:
            preset_name = data['preset']
            if preset_name not in QUALITY_PRESETS:
                return jsonify({
                    'success': False,
                    'error': f'Invalid preset: {preset_name}',
                    'available_presets': list(QUALITY_PRESETS.keys())
                }), 400
            
            quality_config = QUALITY_PRESETS[preset_name]
        else:
            # Use custom configuration
            quality_config = data
        
        # Apply configuration to Sunshine
        result = game_streaming_service.update_sunshine_quality_config(host_id, quality_config)
        
        if result['success']:
            return jsonify(result)
        else:
            status_code = 400
            if 'status_code' in result:
                status_code = result['status_code']
            elif 'Authentication failed' in result.get('error', ''):
                status_code = 401
            elif 'Cannot connect' in result.get('error', ''):
                status_code = 503
            
            return jsonify(result), status_code
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Host not found',
            'error_details': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to update quality config for host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/quality-config', methods=['GET'])
@login_required
def get_quality_config(host_id):
    """
    Get current Sunshine quality configuration
    
    Returns the currently applied quality settings for the host
    
    Returns:
        JSON with current configuration
    """
    try:
        from models.gaming import SunshineHost
        from services.db_service import db_service
        
        if not db_service or not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 500
        
        with db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                return jsonify({
                    'success': False,
                    'error': 'Host not found'
                }), 404
            
            host_metadata = host.host_metadata or {}
            quality_config = host_metadata.get('quality_config')
            
            if quality_config:
                return jsonify({
                    'success': True,
                    'config': quality_config,
                    'updated_at': host_metadata.get('quality_config_updated_at')
                })
            else:
                return jsonify({
                    'success': True,
                    'config': None,
                    'message': 'No quality configuration set (using Sunshine defaults)'
                })
                
    except Exception as e:
        logger.error(f"Failed to get quality config for host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Unexpected error',
            'error_details': str(e)
        }), 500


@game_streaming_bp.route('/api/gaming/hosts/<host_id>/telemetry', methods=['GET'])
@login_required
def get_session_telemetry(host_id):
    """
    Get detailed session telemetry for a Sunshine host
    
    This returns REAL metrics from Sunshine API and nvidia-smi including:
    - Active sessions with encoder stats (NVENC usage, quality, dropped frames)
    - Client IP/device info
    - Current bitrate/resolution/FPS from actual stream
    - Network stats (latency, packet loss)
    - Host GPU stats during session (temperature, utilization, VRAM)
    
    Query params:
        persist: bool (default: false) - Whether to persist metrics to database
    
    Returns:
        JSON with comprehensive telemetry data
    """
    try:
        persist = request.args.get('persist', 'false').lower() == 'true'
        
        # Get detailed telemetry
        result = game_streaming_service.get_detailed_session_telemetry(host_id)
        
        if not result['success']:
            status_code = 500
            if 'Host not found' in result.get('error', ''):
                status_code = 404
            elif 'unreachable' in result.get('error', '').lower():
                status_code = 503
            
            return jsonify(result), status_code
        
        # Persist to database if requested
        if persist and result['success']:
            persist_result = game_streaming_service.persist_session_metrics(
                host_id,
                result.get('telemetry', {})
            )
            
            if persist_result['success']:
                result['persisted'] = True
                result['persisted_sessions'] = persist_result.get('persisted_sessions', 0)
            else:
                logger.warning(f"Failed to persist metrics: {persist_result.get('error')}")
        
        return jsonify(result)
            
    except ValueError as e:
        return jsonify({
            'success': False,
            'error': 'Host not found',
            'error_details': str(e)
        }), 404
    except Exception as e:
        logger.error(f"Failed to get telemetry for host {host_id}: {e}")
        return jsonify({
            'success': False,
            'error': 'Telemetry unavailable',
            'error_details': str(e)
        }), 500
