from functools import wraps
from flask import request, jsonify, session, redirect, url_for, g
import os
import secrets
import logging
from typing import Optional, Dict

logger = logging.getLogger(__name__)

def generate_api_key():
    return secrets.token_urlsafe(32)


def get_jwt_from_request() -> Optional[str]:
    """Extract JWT token from request headers"""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]
    return None


def validate_jwt_token(token: str) -> Optional[Dict]:
    """Validate JWT token and return payload"""
    try:
        from utils.jwt_utils import jwt_service
        return jwt_service.validate_token(token)
    except Exception as e:
        logger.error(f"JWT validation error: {e}")
        return None


def validate_org_api_key(key: str) -> Optional[Dict]:
    """Validate organization API key"""
    try:
        from services.organization_service import organization_service
        return organization_service.validate_api_key(key)
    except Exception as e:
        logger.error(f"Org API key validation error: {e}")
        return None


def get_auth_context() -> Optional[Dict]:
    """
    Get authentication context from any supported method:
    1. Session (web UI)
    2. API key (X-API-Key header)
    3. Organization API key (X-API-Key header with org prefix)
    4. JWT token (Authorization: Bearer header)
    
    Returns dict with user_id, username, org_id, permissions, etc.
    """
    if session.get('authenticated'):
        return {
            'authenticated': True,
            'auth_method': 'session',
            'user_id': session.get('user_id'),
            'username': session.get('username', os.environ.get('WEB_USERNAME', 'admin')),
            'org_id': session.get('current_org_id'),
            'role': session.get('role', 'admin')
        }
    
    jwt_token = get_jwt_from_request()
    if jwt_token:
        payload = validate_jwt_token(jwt_token)
        if payload:
            return {
                'authenticated': True,
                'auth_method': 'jwt',
                'user_id': int(payload.get('sub')),
                'username': payload.get('username'),
                'org_id': payload.get('org_id'),
                'role': payload.get('role'),
                'permissions': payload.get('permissions', [])
            }
    
    api_key = request.headers.get('X-API-Key')
    if api_key:
        if api_key.startswith('hlh_'):
            key_info = validate_org_api_key(api_key)
            if key_info:
                return {
                    'authenticated': True,
                    'auth_method': 'org_api_key',
                    'user_id': key_info['api_key'].get('user_id'),
                    'org_id': key_info['api_key'].get('org_id'),
                    'api_key_id': key_info['api_key'].get('id'),
                    'api_key_name': key_info['api_key'].get('name'),
                    'permissions': key_info['api_key'].get('permissions', ['*']),
                    'organization': key_info.get('organization')
                }
        else:
            valid_api_key = os.environ.get('DASHBOARD_API_KEY')
            if valid_api_key and api_key == valid_api_key:
                return {
                    'authenticated': True,
                    'auth_method': 'global_api_key',
                    'username': 'api_user',
                    'role': 'admin'
                }
    
    return None


def make_api_response(success=True, data=None, message=None, status_code=200):
    """Standardized API response format"""
    response = {
        'success': success,
        'data': data,
        'message': message
    }
    return jsonify(response), status_code

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_context = get_auth_context()
        
        if auth_context:
            g.auth_context = auth_context
            return f(*args, **kwargs)
        
        # Authentication failed - log the attempt
        try:
            from services.security_monitor import security_monitor
            from services.activity_service import activity_service
            
            ip_address = request.remote_addr or 'unknown'
            result = security_monitor.log_failed_login(
                ip_address=ip_address,
                username=request.headers.get('X-API-Key', 'unknown')[:20] if api_key else 'api_key_auth',
                service='dashboard'
            )
            
            # Log activity if alert triggered
            if result.get('alert_triggered'):
                activity_service.log_activity(
                    'security',
                    f"Security alert: {result.get('count')} failed auth attempts from {ip_address}",
                    'shield-exclamation',
                    'danger'
                )
        except Exception as e:
            logger.error(f"Error logging failed auth attempt: {e}")
        
        return jsonify({'success': False, 'message': 'Unauthorized - Please log in'}), 401
    
    return decorated_function

def require_web_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return redirect(url_for('web.login'))
        return f(*args, **kwargs)
    
    return decorated_function
