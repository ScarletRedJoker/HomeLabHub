from flask import Blueprint, render_template, request, jsonify, send_from_directory, redirect, url_for, session, make_response
from typing import List, Any
from utils.auth import require_web_auth
from models import get_session, UserPreferences
from sqlalchemy.exc import SQLAlchemyError
import os
import logging

# Import Config from parent directory
import sys
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))
from config import Config  # type: ignore[import]

logger = logging.getLogger(__name__)

web_bp = Blueprint('web', __name__)

# Import services for checking enabled status
from services.ai_service import AIService
try:
    from services.enhanced_domain_service import EnhancedDomainService
    enhanced_domain_service = EnhancedDomainService()
except:
    enhanced_domain_service = None
    
ai_service = AIService()

@web_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        # Get credentials from app config (supports DEMO_MODE)
        from flask import current_app
        expected_username = current_app.config.get('WEB_USERNAME')
        expected_password = current_app.config.get('WEB_PASSWORD')
        
        # Security: Require credentials to be set
        if not expected_username or not expected_password:
            logger.error("SECURITY ERROR: WEB_USERNAME or WEB_PASSWORD not configured!")
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

@web_bp.route('/aiassistant')
@require_web_auth
def ai_assistant_chat():
    response = make_response(render_template('ai_assistant_chat.html', 
                                            ai_enabled=ai_service.enabled))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/jarvis/ide')
@require_web_auth
def jarvis_ide():
    """Minimal Jarvis chat interface optimized for IDE use"""
    response = make_response(render_template('jarvis_ide.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/control-center')
@require_web_auth
def control_center():
    """Jarvis Control Center - Unified intelligence hub"""
    response = make_response(render_template('jarvis_control_center.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/agent-ops')
@require_web_auth
def agent_ops():
    """Agent Operations Feed - Inter-agent communication dashboard"""
    response = make_response(render_template('agent_ops.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

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

@web_bp.route('/domain-management')
@require_web_auth
def domain_management():
    domain_automation_enabled = enhanced_domain_service.enabled if enhanced_domain_service else False
    response = make_response(render_template('domain_management.html',
                                            domain_automation_enabled=domain_automation_enabled))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/dns')
@require_web_auth
def dns_management():
    """DNS management page"""
    response = make_response(render_template('dns_management.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/monitoring')
@require_web_auth
def monitoring():
    response = make_response(render_template('monitoring.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/game-connect')
def game_connect():
    response = make_response(render_template('game_connect.html',
                          windows_kvm_ip=Config.WINDOWS_KVM_IP))
    # Add proper cache headers to prevent Caddy caching
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/jarvis_code_review')
@require_web_auth
def jarvis_code_review():
    """Jarvis code review and task management interface"""
    response = make_response(render_template('jarvis_code_review.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/jarvis_demo')
@require_web_auth
def jarvis_demo():
    """Jarvis investor demo dashboard"""
    response = make_response(render_template('jarvis_demo.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/smart-home')
@require_web_auth
def smart_home_new():
    """Smart Home Control - Home Assistant Integration"""
    response = make_response(render_template('smart_home.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/ai-foundry')
@require_web_auth
def ai_foundry():
    """Local AI Foundry - Ollama Model Management"""
    response = make_response(render_template('ai_foundry.html'))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@web_bp.route('/api/preferences', methods=['GET'])
@require_web_auth
def get_preferences():
    """Get user preferences"""
    try:
        user_id = session.get('user_id', 'default_user')
        db_session = get_session()
        
        preferences = db_session.query(UserPreferences).filter_by(user_id=user_id).first()
        
        if not preferences:
            default_prefs = UserPreferences.get_default_preferences()
            return jsonify({'success': True, 'preferences': default_prefs})
        
        return jsonify({'success': True, 'preferences': preferences.to_dict()})
    except SQLAlchemyError as e:
        logger.error(f"Error getting preferences: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db_session.close()

@web_bp.route('/api/preferences', methods=['POST'])
@require_web_auth
def save_preferences():
    """Save user preferences"""
    try:
        user_id = session.get('user_id', 'default_user')
        data = request.get_json()
        db_session = get_session()
        
        preferences = db_session.query(UserPreferences).filter_by(user_id=user_id).first()
        
        if not preferences:
            preferences = UserPreferences(user_id=user_id)
            db_session.add(preferences)
        
        if 'dashboard_layout' in data:
            preferences.dashboard_layout = data['dashboard_layout']
        if 'widget_visibility' in data:
            preferences.widget_visibility = data['widget_visibility']
        if 'widget_order' in data:
            preferences.widget_order = data['widget_order']
        if 'active_preset' in data:
            preferences.active_preset = data['active_preset']
        if 'collapsed_categories' in data:
            preferences.collapsed_categories = data['collapsed_categories']
        if 'pinned_pages' in data:
            preferences.pinned_pages = data['pinned_pages']
        if 'recent_pages' in data:
            preferences.recent_pages = data['recent_pages']
        if 'theme' in data:
            preferences.theme = data['theme']
        if 'sidebar_collapsed' in data:
            preferences.sidebar_collapsed = data['sidebar_collapsed']
        if 'show_breadcrumbs' in data:
            preferences.show_breadcrumbs = data['show_breadcrumbs']
        if 'compact_mode' in data:
            preferences.compact_mode = data['compact_mode']
        if 'custom_shortcuts' in data:
            preferences.custom_shortcuts = data['custom_shortcuts']
        
        db_session.commit()
        
        return jsonify({'success': True, 'preferences': preferences.to_dict()})
    except SQLAlchemyError as e:
        logger.error(f"Error saving preferences: {str(e)}")
        db_session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db_session.close()

@web_bp.route('/api/preferences/preset/<preset_name>', methods=['POST'])
@require_web_auth
def apply_preset(preset_name):
    """Apply a predefined layout preset"""
    try:
        user_id = session.get('user_id', 'default_user')
        db_session = get_session()
        
        preset_config = UserPreferences.get_preset(preset_name)
        if not preset_config:
            return jsonify({'success': False, 'error': 'Invalid preset'}), 400
        
        preferences = db_session.query(UserPreferences).filter_by(user_id=user_id).first()
        
        if not preferences:
            preferences = UserPreferences(user_id=user_id)
            db_session.add(preferences)
        
        preferences.widget_visibility = preset_config.get('widget_visibility', {})
        preferences.widget_order = preset_config.get('widget_order', [])
        preferences.active_preset = preset_name
        
        db_session.commit()
        
        return jsonify({'success': True, 'preferences': preferences.to_dict()})
    except SQLAlchemyError as e:
        logger.error(f"Error applying preset: {str(e)}")
        db_session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db_session.close()

@web_bp.route('/api/preferences/category/<category_id>/toggle', methods=['POST'])
@require_web_auth
def toggle_category(category_id):
    """Toggle category collapsed state"""
    try:
        user_id = session.get('user_id', 'default_user')
        db_session = get_session()
        
        preferences = db_session.query(UserPreferences).filter_by(user_id=user_id).first()
        
        if not preferences:
            preferences = UserPreferences(user_id=user_id)
            db_session.add(preferences)
            db_session.flush()
        
        # Get current collapsed categories, handling SQLAlchemy column properly
        current_categories: Any = preferences.collapsed_categories
        if current_categories is None:
            collapsed_categories: List[str] = []
        elif isinstance(current_categories, list):
            collapsed_categories = list(current_categories)
        else:
            collapsed_categories = []
        
        if category_id in collapsed_categories:
            collapsed_categories.remove(category_id)
        else:
            collapsed_categories.append(category_id)
        
        # Assign the updated list back using setattr to avoid type issues
        setattr(preferences, 'collapsed_categories', collapsed_categories)
        db_session.commit()
        
        return jsonify({'success': True, 'collapsed': category_id in collapsed_categories})
    except SQLAlchemyError as e:
        logger.error(f"Error toggling category: {str(e)}")
        db_session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        db_session.close()

@web_bp.route('/marketplace')
@require_web_auth
def marketplace():
    """Container Marketplace - App Store for Homelab"""
    response = make_response(render_template('marketplace.html', services=Config.SERVICES))
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response
