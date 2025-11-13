from functools import wraps
from flask import request, jsonify, session, redirect, url_for
import os
import secrets

def generate_api_key():
    return secrets.token_urlsafe(32)

def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        session_authenticated = session.get('authenticated', False)
        
        valid_api_key = os.environ.get('DASHBOARD_API_KEY')
        
        if not valid_api_key:
            return jsonify({'success': False, 'message': 'API key not configured on server'}), 500
        
        if api_key == valid_api_key or session_authenticated:
            return f(*args, **kwargs)
        
        return jsonify({'success': False, 'message': 'Unauthorized - API key required'}), 401
    
    return decorated_function

def require_web_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('authenticated'):
            return redirect(url_for('web.login'))
        return f(*args, **kwargs)
    
    return decorated_function
