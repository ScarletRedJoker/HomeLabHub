"""
Jarvis Test Coordinator
Live testing endpoints for all HomeLabHub services
"""
from flask import Blueprint, jsonify, request
import requests
import os
from datetime import datetime
import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

jarvis_test_bp = Blueprint('jarvis_test', __name__, url_prefix='/api/jarvis/test')

DISCORD_BOT_URL = os.environ.get('DISCORD_BOT_URL', 'http://localhost:4000')
STREAM_BOT_URL = os.environ.get('STREAM_BOT_URL', 'http://localhost:3000')
DASHBOARD_URL = os.environ.get('DASHBOARD_URL', 'http://localhost:5000')

REQUEST_TIMEOUT = 10


def _check_service_health(name: str, url: str) -> Dict[str, Any]:
    """Check health of a single service"""
    try:
        response = requests.get(f"{url}/health", timeout=REQUEST_TIMEOUT)
        return {
            'service': name,
            'url': url,
            'status': 'healthy' if response.status_code == 200 else 'unhealthy',
            'status_code': response.status_code,
            'response': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text[:200],
            'response_time_ms': response.elapsed.total_seconds() * 1000,
            'checked_at': datetime.utcnow().isoformat()
        }
    except requests.exceptions.ConnectionError:
        return {
            'service': name,
            'url': url,
            'status': 'unreachable',
            'error': 'Connection refused - service may not be running',
            'checked_at': datetime.utcnow().isoformat()
        }
    except requests.exceptions.Timeout:
        return {
            'service': name,
            'url': url,
            'status': 'timeout',
            'error': f'Request timed out after {REQUEST_TIMEOUT}s',
            'checked_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            'service': name,
            'url': url,
            'status': 'error',
            'error': str(e),
            'checked_at': datetime.utcnow().isoformat()
        }


@jarvis_test_bp.route('/run', methods=['POST'])
def run_test_suite():
    """
    POST /api/jarvis/test/run
    Run a comprehensive test suite across all services
    
    Request body (optional):
    {
        "tests": ["health", "database", "discord", "stream-bot", "oauth"],
        "verbose": false
    }
    """
    try:
        data = request.get_json() or {}
        tests_to_run = data.get('tests', ['health', 'database', 'discord', 'stream-bot', 'oauth'])
        verbose = data.get('verbose', False)
        
        results = {
            'success': True,
            'tests': {},
            'summary': {
                'total': 0,
                'passed': 0,
                'failed': 0,
                'skipped': 0
            },
            'started_at': datetime.utcnow().isoformat()
        }
        
        if 'health' in tests_to_run:
            health_results = _run_health_tests()
            results['tests']['health'] = health_results
            results['summary']['total'] += len(health_results['services'])
            results['summary']['passed'] += sum(1 for s in health_results['services'] if s['status'] == 'healthy')
            results['summary']['failed'] += sum(1 for s in health_results['services'] if s['status'] != 'healthy')
        
        if 'database' in tests_to_run:
            db_result = _run_database_test()
            results['tests']['database'] = db_result
            results['summary']['total'] += 1
            if db_result['status'] == 'healthy':
                results['summary']['passed'] += 1
            else:
                results['summary']['failed'] += 1
        
        if 'discord' in tests_to_run:
            discord_result = _run_discord_test()
            results['tests']['discord'] = discord_result
            results['summary']['total'] += 1
            if discord_result.get('status') == 'healthy':
                results['summary']['passed'] += 1
            else:
                results['summary']['failed'] += 1
        
        if 'stream-bot' in tests_to_run:
            stream_result = _run_stream_bot_test()
            results['tests']['stream-bot'] = stream_result
            results['summary']['total'] += 1
            if stream_result.get('status') == 'healthy':
                results['summary']['passed'] += 1
            else:
                results['summary']['failed'] += 1
        
        if 'oauth' in tests_to_run:
            oauth_result = _run_oauth_test()
            results['tests']['oauth'] = oauth_result
            results['summary']['total'] += len(oauth_result.get('providers', []))
            results['summary']['passed'] += sum(1 for p in oauth_result.get('providers', []) if p.get('configured'))
            results['summary']['failed'] += sum(1 for p in oauth_result.get('providers', []) if not p.get('configured'))
        
        results['completed_at'] = datetime.utcnow().isoformat()
        results['success'] = results['summary']['failed'] == 0
        
        return jsonify(results), 200
        
    except Exception as e:
        logger.error(f"Test suite error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def _run_health_tests() -> Dict[str, Any]:
    """Run health checks on all services"""
    services = [
        ('dashboard', DASHBOARD_URL),
        ('discord-bot', DISCORD_BOT_URL),
        ('stream-bot', STREAM_BOT_URL)
    ]
    
    results = []
    for name, url in services:
        results.append(_check_service_health(name, url))
    
    all_healthy = all(r['status'] == 'healthy' for r in results)
    return {
        'status': 'healthy' if all_healthy else 'degraded',
        'services': results
    }


def _run_database_test() -> Dict[str, Any]:
    """Test database connectivity"""
    try:
        from services.db_service import db_service
        
        health = db_service.health_check()
        
        return {
            'status': 'healthy' if health.get('healthy') else 'unhealthy',
            'available': db_service.is_available,
            'details': health,
            'checked_at': datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            'status': 'error',
            'error': str(e),
            'checked_at': datetime.utcnow().isoformat()
        }


def _run_discord_test() -> Dict[str, Any]:
    """Test Discord Bot connectivity"""
    return _check_service_health('discord-bot', DISCORD_BOT_URL)


def _run_stream_bot_test() -> Dict[str, Any]:
    """Test Stream Bot connectivity"""
    return _check_service_health('stream-bot', STREAM_BOT_URL)


def _run_oauth_test() -> Dict[str, Any]:
    """Test OAuth configurations"""
    providers = []
    
    discord_configured = bool(os.environ.get('DISCORD_CLIENT_ID') and os.environ.get('DISCORD_CLIENT_SECRET'))
    providers.append({
        'provider': 'discord',
        'configured': discord_configured,
        'has_client_id': bool(os.environ.get('DISCORD_CLIENT_ID')),
        'has_client_secret': bool(os.environ.get('DISCORD_CLIENT_SECRET'))
    })
    
    twitch_configured = bool(os.environ.get('TWITCH_CLIENT_ID') and os.environ.get('TWITCH_CLIENT_SECRET'))
    providers.append({
        'provider': 'twitch',
        'configured': twitch_configured,
        'has_client_id': bool(os.environ.get('TWITCH_CLIENT_ID')),
        'has_client_secret': bool(os.environ.get('TWITCH_CLIENT_SECRET'))
    })
    
    spotify_configured = bool(os.environ.get('SPOTIFY_CLIENT_ID') and os.environ.get('SPOTIFY_CLIENT_SECRET'))
    providers.append({
        'provider': 'spotify',
        'configured': spotify_configured,
        'has_client_id': bool(os.environ.get('SPOTIFY_CLIENT_ID')),
        'has_client_secret': bool(os.environ.get('SPOTIFY_CLIENT_SECRET'))
    })
    
    google_configured = bool(os.environ.get('GOOGLE_CLIENT_ID') and os.environ.get('GOOGLE_CLIENT_SECRET'))
    providers.append({
        'provider': 'google',
        'configured': google_configured,
        'has_client_id': bool(os.environ.get('GOOGLE_CLIENT_ID')),
        'has_client_secret': bool(os.environ.get('GOOGLE_CLIENT_SECRET'))
    })
    
    github_configured = bool(os.environ.get('GITHUB_CLIENT_ID') and os.environ.get('GITHUB_CLIENT_SECRET'))
    providers.append({
        'provider': 'github',
        'configured': github_configured,
        'has_client_id': bool(os.environ.get('GITHUB_CLIENT_ID')),
        'has_client_secret': bool(os.environ.get('GITHUB_CLIENT_SECRET'))
    })
    
    all_configured = all(p['configured'] for p in providers)
    some_configured = any(p['configured'] for p in providers)
    
    return {
        'status': 'fully_configured' if all_configured else ('partially_configured' if some_configured else 'not_configured'),
        'providers': providers,
        'checked_at': datetime.utcnow().isoformat()
    }


@jarvis_test_bp.route('/health-all', methods=['GET'])
def check_all_health():
    """
    GET /api/jarvis/test/health-all
    Check health of all services
    """
    try:
        results = _run_health_tests()
        return jsonify({
            'success': True,
            **results
        }), 200
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_test_bp.route('/database', methods=['GET'])
def test_database():
    """
    GET /api/jarvis/test/database
    Test database connectivity
    """
    try:
        result = _run_database_test()
        status_code = 200 if result['status'] == 'healthy' else 503
        return jsonify({
            'success': result['status'] == 'healthy',
            **result
        }), status_code
    except Exception as e:
        logger.error(f"Database test error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_test_bp.route('/discord', methods=['GET'])
def test_discord_bot():
    """
    GET /api/jarvis/test/discord
    Test Discord Bot connectivity and status
    """
    try:
        result = _run_discord_test()
        status_code = 200 if result.get('status') == 'healthy' else 503
        return jsonify({
            'success': result.get('status') == 'healthy',
            **result
        }), status_code
    except Exception as e:
        logger.error(f"Discord test error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_test_bp.route('/stream-bot', methods=['GET'])
def test_stream_bot():
    """
    GET /api/jarvis/test/stream-bot
    Test Stream Bot connectivity
    """
    try:
        result = _run_stream_bot_test()
        status_code = 200 if result.get('status') == 'healthy' else 503
        return jsonify({
            'success': result.get('status') == 'healthy',
            **result
        }), status_code
    except Exception as e:
        logger.error(f"Stream bot test error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_test_bp.route('/oauth', methods=['GET'])
def test_oauth_configs():
    """
    GET /api/jarvis/test/oauth
    Test OAuth configurations
    """
    try:
        result = _run_oauth_test()
        return jsonify({
            'success': True,
            **result
        }), 200
    except Exception as e:
        logger.error(f"OAuth test error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_test_bp.route('/notifications', methods=['POST'])
def test_notifications():
    """
    POST /api/jarvis/test/notifications
    Test stream notification flow (mock)
    
    Request body:
    {
        "channel": "test-channel",
        "type": "stream_online",
        "mock": true
    }
    """
    try:
        data = request.get_json() or {}
        channel = data.get('channel', 'test-channel')
        notification_type = data.get('type', 'stream_online')
        mock = data.get('mock', True)
        
        notification = {
            'id': f"test-{datetime.utcnow().timestamp()}",
            'channel': channel,
            'type': notification_type,
            'title': f"Test notification for {channel}",
            'message': f"This is a mock {notification_type} notification",
            'mock': mock,
            'created_at': datetime.utcnow().isoformat()
        }
        
        if not mock:
            try:
                response = requests.post(
                    f"{STREAM_BOT_URL}/api/notifications/test",
                    json=notification,
                    timeout=REQUEST_TIMEOUT
                )
                notification['delivery'] = {
                    'sent': True,
                    'status_code': response.status_code,
                    'response': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text[:200]
                }
            except Exception as e:
                notification['delivery'] = {
                    'sent': False,
                    'error': str(e)
                }
        else:
            notification['delivery'] = {
                'sent': False,
                'reason': 'mock mode - notification not actually sent'
            }
        
        return jsonify({
            'success': True,
            'notification': notification
        }), 200
        
    except Exception as e:
        logger.error(f"Notification test error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_test_bp.route('/redis', methods=['GET'])
def test_redis():
    """
    GET /api/jarvis/test/redis
    Test Redis connectivity
    """
    try:
        import redis
        import os
        
        redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
        redis_client = redis.from_url(redis_url)
        redis_client.ping()
        
        info = redis_client.info('server')
        clients_info = redis_client.info('clients')
        
        return jsonify({
            'success': True,
            'status': 'healthy',
            'redis_version': info.get('redis_version', 'unknown') if isinstance(info, dict) else 'unknown',
            'uptime_seconds': info.get('uptime_in_seconds', 0) if isinstance(info, dict) else 0,
            'connected_clients': clients_info.get('connected_clients', 0) if isinstance(clients_info, dict) else 0,
            'checked_at': datetime.utcnow().isoformat()
        }), 200
        
    except Exception as e:
        logger.error(f"Redis test error: {e}")
        return jsonify({
            'success': False,
            'status': 'unhealthy',
            'error': str(e),
            'checked_at': datetime.utcnow().isoformat()
        }), 503


__all__ = ['jarvis_test_bp']
