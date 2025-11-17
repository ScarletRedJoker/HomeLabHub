from flask import Blueprint, render_template, request, jsonify, send_from_directory, redirect, url_for, session, make_response
from utils.auth import require_web_auth
from config import Config
import os
import logging

logger = logging.getLogger(__name__)

web_bp = Blueprint('web', __name__)

@web_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # Get credentials from environment (NO DEFAULTS for security)
        expected_username = os.environ.get('WEB_USERNAME')
        expected_password = os.environ.get('WEB_PASSWORD')
        
        # Security: Require credentials to be set in environment
        if not expected_username or not expected_password:
            logger.error("SECURITY ERROR: WEB_USERNAME or WEB_PASSWORD not set in environment!")
            return render_template('login.html', error='Server configuration error. Contact administrator.')
        
        # Debug logging (never log passwords!)
        logger.info(f"Login attempt - Username: {username}")
        
        if username == expected_username and password == expected_password:
            session['authenticated'] = True
            session.permanent = True
            logger.info("Login successful")
            return redirect(url_for('web.index'))
        else:
            logger.warning("Login failed - invalid credentials")
            
            # Log failed login attempt for security monitoring
            try:
                from services.security_monitor import security_monitor
                from services.activity_service import activity_service
                
                ip_address = request.remote_addr or 'unknown'
                result = security_monitor.log_failed_login(
                    ip_address=ip_address,
                    username=username or 'unknown',
                    service='dashboard'
                )
                
                # Log activity if alert triggered
                if result.get('alert_triggered'):
                    activity_service.log_activity(
                        'security',
                        f"Security alert: {result.get('count')} failed login attempts from {ip_address}",
                        'shield-exclamation',
                        'danger'
                    )
            except Exception as e:
                logger.error(f"Error logging failed login attempt: {e}")
            
            return render_template('login.html', error='Invalid username or password')
    
    return render_template('login.html')

@web_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('web.login'))

@web_bp.route('/')
@require_web_auth
def index():
    return render_template('index.html', services=Config.SERVICES)

@web_bp.route('/dashboard')
@require_web_auth
def dashboard():
    response = make_response(render_template('dashboard.html', services=Config.SERVICES))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/logs')
@require_web_auth
def logs():
    return render_template('logs.html', services=Config.SERVICES)

@web_bp.route('/ai-assistant')
@require_web_auth
def ai_assistant():
    return render_template('ai_assistant.html')

@web_bp.route('/file-manager')
@require_web_auth
def file_manager():
    return render_template('file_manager.html', 
                          site_path=Config.STATIC_SITE_PATH)

@web_bp.route('/remote-desktop')
@require_web_auth
def remote_desktop():
    return render_template('remote_desktop.html', 
                          novnc_url=Config.NOVNC_URL)

@web_bp.route('/scripts')
@require_web_auth
def scripts():
    return render_template('scripts.html')

@web_bp.route('/containers')
@require_web_auth
def containers():
    return render_template('containers.html')

@web_bp.route('/system')
@require_web_auth
def system():
    response = make_response(render_template('system.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/databases')
@require_web_auth
def databases():
    return render_template('databases.html')

@web_bp.route('/game-streaming')
@require_web_auth
def game_streaming():
    return render_template('game_streaming.html', 
                          windows_kvm_ip=Config.WINDOWS_KVM_IP)

@web_bp.route('/network')
@require_web_auth
def network():
    return render_template('network.html')

@web_bp.route('/domains')
@require_web_auth
def domains():
    return render_template('domains.html')

@web_bp.route('/game-connect')
def game_connect():
    response = make_response(render_template('game_connect.html',
                          windows_kvm_ip=Config.WINDOWS_KVM_IP))
    # Add proper cache headers to prevent Caddy caching
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response
