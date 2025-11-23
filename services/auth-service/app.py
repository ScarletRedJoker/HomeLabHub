#!/usr/bin/env python3
"""
Auth Service - JWT Token Generation and Validation
Simple authentication service for API Gateway
"""
import os
import jwt
import hashlib
import secrets
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from functools import wraps

app = Flask(__name__)

# Configuration
JWT_SECRET = os.getenv('JWT_SECRET', 'change-me-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_HOURS = int(os.getenv('JWT_EXPIRY_HOURS', '24'))

# Service tokens (stored in memory, loaded from env)
SERVICE_TOKENS = {}

def load_service_tokens():
    """Load service tokens from environment variables"""
    global SERVICE_TOKENS
    for key, value in os.environ.items():
        if key.startswith('SERVICE_TOKEN_'):
            service_name = key.replace('SERVICE_TOKEN_', '').lower()
            SERVICE_TOKENS[service_name] = value
    
    app.logger.info(f"Loaded {len(SERVICE_TOKENS)} service tokens")

@app.before_request
def before_request():
    """Initialize service tokens on first request"""
    if not SERVICE_TOKENS:
        load_service_tokens()

def require_service_token(f):
    """Decorator to require service-to-service authentication"""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Missing or invalid Authorization header'}), 401
        
        token = auth_header.split(' ')[1]
        
        # Check if it's a valid service token
        if token not in SERVICE_TOKENS.values():
            return jsonify({'error': 'Invalid service token'}), 401
        
        return f(*args, **kwargs)
    
    return decorated

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'auth-service',
        'version': '1.0.0',
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/v1/auth/login', methods=['POST'])
def login():
    """
    User login - generates JWT token
    
    Request:
        {
            "username": "user",
            "password": "pass"
        }
    
    Response:
        {
            "token": "jwt.token.here",
            "expires_at": "2025-11-24T00:00:00Z"
        }
    """
    data = request.get_json()
    
    if not data or 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Missing username or password'}), 400
    
    username = data['username']
    password = data['password']
    
    # Simple username/password validation (integrate with dashboard in production)
    # For MVP, check against environment variables
    valid_username = os.getenv('WEB_USERNAME', 'admin')
    valid_password = os.getenv('WEB_PASSWORD', 'admin')
    
    if username != valid_username or password != valid_password:
        return jsonify({'error': 'Invalid credentials'}), 401
    
    # Generate JWT token
    expires_at = datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS)
    
    payload = {
        'sub': username,
        'iat': datetime.utcnow(),
        'exp': expires_at,
        'type': 'user',
        'roles': ['user', 'admin'] if username == valid_username else ['user']
    }
    
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    
    return jsonify({
        'token': token,
        'expires_at': expires_at.isoformat() + 'Z',
        'user': {
            'username': username,
            'roles': payload['roles']
        }
    })

@app.route('/api/v1/auth/validate', methods=['POST'])
def validate():
    """
    Validate JWT token (called by Traefik ForwardAuth middleware)
    
    Request Headers:
        Authorization: Bearer <token>
    
    Response:
        200 OK - token valid, sets X-User-Id header
        401 Unauthorized - token invalid
    """
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing or invalid Authorization header'}), 401
    
    token = auth_header.split(' ')[1]
    
    try:
        # Decode and validate token
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        
        # Return success with user info in headers (for Traefik)
        return '', 200, {
            'X-User-Id': payload.get('sub'),
            'X-User-Roles': ','.join(payload.get('roles', [])),
            'X-Token-Type': payload.get('type', 'unknown')
        }
    
    except jwt.ExpiredSignatureError:
        return jsonify({'error': 'Token expired'}), 401
    except jwt.InvalidTokenError as e:
        return jsonify({'error': f'Invalid token: {str(e)}'}), 401

@app.route('/api/v1/auth/service-token/generate', methods=['POST'])
@require_service_token
def generate_service_token():
    """
    Generate a new service-to-service authentication token
    
    Request:
        {
            "service_name": "discord-bot"
        }
    
    Response:
        {
            "service_name": "discord-bot",
            "token": "generated-token-here",
            "note": "Add to .env as SERVICE_TOKEN_DISCORD_BOT=<token>"
        }
    """
    data = request.get_json()
    
    if not data or 'service_name' not in data:
        return jsonify({'error': 'Missing service_name'}), 400
    
    service_name = data['service_name']
    
    # Generate secure random token
    token = secrets.token_urlsafe(32)
    
    # Store in memory (should be persisted in production)
    SERVICE_TOKENS[service_name] = token
    
    return jsonify({
        'service_name': service_name,
        'token': token,
        'env_var': f'SERVICE_TOKEN_{service_name.upper().replace("-", "_")}',
        'note': f'Add to .env as SERVICE_TOKEN_{service_name.upper().replace("-", "_")}={token}'
    })

@app.route('/api/v1/auth/service-token/validate', methods=['POST'])
def validate_service_token():
    """
    Validate service-to-service token
    
    Request Headers:
        Authorization: Bearer <service-token>
    
    Response:
        200 OK - token valid
        401 Unauthorized - token invalid
    """
    auth_header = request.headers.get('Authorization', '')
    
    if not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Missing or invalid Authorization header'}), 401
    
    token = auth_header.split(' ')[1]
    
    # Check if token exists in our service tokens
    service_name = None
    for name, stored_token in SERVICE_TOKENS.items():
        if stored_token == token:
            service_name = name
            break
    
    if not service_name:
        return jsonify({'error': 'Invalid service token'}), 401
    
    return '', 200, {
        'X-Service-Name': service_name,
        'X-Token-Type': 'service'
    }

@app.route('/api/v1/auth/tokens', methods=['GET'])
@require_service_token
def list_tokens():
    """
    List all registered service tokens
    
    Response:
        {
            "services": ["discord-bot", "stream-bot", ...],
            "count": 2
        }
    """
    return jsonify({
        'services': list(SERVICE_TOKENS.keys()),
        'count': len(SERVICE_TOKENS)
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', '8000'))
    debug = os.getenv('DEBUG', 'false').lower() == 'true'
    
    app.logger.info(f"Starting auth service on port {port}")
    app.logger.info(f"JWT expiry: {JWT_EXPIRY_HOURS} hours")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
