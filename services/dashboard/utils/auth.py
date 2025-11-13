from functools import wraps
from flask import request, jsonify, session, redirect, url_for
import os
import secrets

def generate_api_key():
    return secrets.token_urlsafe(32)

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
        session_authenticated = session.get('authenticated', False)
        
        if session_authenticated:
            return f(*args, **kwargs)
        
        api_key = request.headers.get('X-API-Key')
        valid_api_key = os.environ.get('DASHBOARD_API_KEY')
        
        if api_key and valid_api_key and api_key == valid_api_key:
            return f(*args, **kwargs)
        
        return jsonify({'success': False, 'message': 'Unauthorized - Please log in'}), 401
    
    return decorated_function

def require_web_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return redirect(url_for('web.login'))
        return f(*args, **kwargs)
    
    return decorated_function
