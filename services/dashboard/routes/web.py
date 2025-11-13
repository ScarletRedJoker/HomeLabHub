from flask import Blueprint, render_template, request, jsonify, send_from_directory, redirect, url_for, session
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
        
        # Get credentials from environment
        expected_username = os.environ.get('WEB_USERNAME', 'evin')
        expected_password = os.environ.get('WEB_PASSWORD', 'homelab')
        
        # Debug logging
        logger.info(f"Login attempt - Username: {username}")
        
        if username == expected_username and password == expected_password:
            session['authenticated'] = True
            session.permanent = True
            logger.info("Login successful")
            return redirect(url_for('web.index'))
        else:
            logger.warning("Login failed - invalid credentials")
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
    return render_template('dashboard.html', services=Config.SERVICES)

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
    return render_template('dashboard.html')

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
