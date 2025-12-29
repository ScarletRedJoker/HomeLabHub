"""
Monitoring Alerts API Routes
Threshold-based alerting and notification endpoints
"""
from flask import Blueprint, jsonify, request, render_template
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

alert_bp = Blueprint('alerts', __name__, url_prefix='/api/alerts')
alert_web_bp = Blueprint('alerts_web', __name__)

try:
    from utils.auth import require_auth
except ImportError:
    def require_auth(f):
        return f


@alert_web_bp.route('/alerts')
@require_auth
def alerts_page():
    """Render the monitoring alerts dashboard page"""
    return render_template('alerts.html')


@alert_bp.route('', methods=['GET'])
@require_auth
def list_alerts():
    """
    GET /api/alerts
    List all monitoring alerts
    """
    try:
        from services.alert_service import alert_service
        
        enabled_only = request.args.get('enabled_only', 'false').lower() == 'true'
        alerts = alert_service.get_all_alerts(enabled_only=enabled_only)
        
        return jsonify({
            'success': True,
            'alerts': alerts
        })
    except Exception as e:
        logger.error(f"Error listing alerts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('', methods=['POST'])
@require_auth
def create_alert():
    """
    POST /api/alerts
    Create a new monitoring alert
    
    Request body:
    {
        "name": "High CPU Usage",
        "description": "Alert when CPU exceeds 80%",
        "alert_type": "cpu|memory|disk|service|custom",
        "condition": "gt|lt|eq|ne|gte|lte",
        "threshold": 80.0,
        "target": "/dev/sda1",
        "enabled": true,
        "cooldown_minutes": 5,
        "notifications": [
            {
                "notification_type": "discord_webhook",
                "destination": "https://discord.com/api/webhooks/...",
                "enabled": true
            }
        ]
    }
    """
    try:
        from services.alert_service import alert_service
        
        data = request.get_json() or {}
        
        if not data.get('name'):
            return jsonify({
                'success': False,
                'error': 'Alert name is required'
            }), 400
        
        result = alert_service.create_alert(data)
        
        if result.get('success'):
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except Exception as e:
        logger.error(f"Error creating alert: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/<alert_id>', methods=['GET'])
@require_auth
def get_alert(alert_id):
    """
    GET /api/alerts/<id>
    Get a specific alert by ID
    """
    try:
        from services.alert_service import alert_service
        
        alert = alert_service.get_alert_by_id(alert_id)
        
        if not alert:
            return jsonify({
                'success': False,
                'error': 'Alert not found'
            }), 404
        
        return jsonify({
            'success': True,
            'alert': alert
        })
    except Exception as e:
        logger.error(f"Error getting alert {alert_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/<alert_id>', methods=['PUT'])
@require_auth
def update_alert(alert_id):
    """
    PUT /api/alerts/<id>
    Update an existing alert
    """
    try:
        from services.alert_service import alert_service
        
        data = request.get_json() or {}
        result = alert_service.update_alert(alert_id, data)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400 if result.get('error') == 'Alert not found' else 500
            
    except Exception as e:
        logger.error(f"Error updating alert {alert_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/<alert_id>', methods=['DELETE'])
@require_auth
def delete_alert(alert_id):
    """
    DELETE /api/alerts/<id>
    Delete an alert
    """
    try:
        from services.alert_service import alert_service
        
        result = alert_service.delete_alert(alert_id)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"Error deleting alert {alert_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/<alert_id>/toggle', methods=['POST'])
@require_auth
def toggle_alert(alert_id):
    """
    POST /api/alerts/<id>/toggle
    Toggle an alert's enabled status
    """
    try:
        from services.alert_service import alert_service
        
        alert = alert_service.get_alert_by_id(alert_id)
        if not alert:
            return jsonify({
                'success': False,
                'error': 'Alert not found'
            }), 404
        
        result = alert_service.update_alert(alert_id, {'enabled': not alert.get('enabled', True)})
        return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error toggling alert {alert_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/history', methods=['GET'])
@require_auth
def get_history():
    """
    GET /api/alerts/history
    Get alert history, optionally filtered by alert_id
    """
    try:
        from services.alert_service import alert_service
        
        alert_id = request.args.get('alert_id')
        limit = int(request.args.get('limit', 100))
        
        history = alert_service.get_alert_history(alert_id=alert_id, limit=limit)
        
        return jsonify({
            'success': True,
            'history': history
        })
    except Exception as e:
        logger.error(f"Error getting alert history: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/history/<history_id>/acknowledge', methods=['POST'])
@require_auth
def acknowledge_history(history_id):
    """
    POST /api/alerts/history/<id>/acknowledge
    Acknowledge an alert history entry
    """
    try:
        from services.alert_service import alert_service
        
        data = request.get_json() or {}
        user = data.get('user', 'system')
        
        result = alert_service.acknowledge_alert(history_id, user=user)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"Error acknowledging alert {history_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/history/<history_id>/resolve', methods=['POST'])
@require_auth
def resolve_history(history_id):
    """
    POST /api/alerts/history/<id>/resolve
    Mark an alert as resolved
    """
    try:
        from services.alert_service import alert_service
        
        result = alert_service.resolve_alert(history_id)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 404
            
    except Exception as e:
        logger.error(f"Error resolving alert {history_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/<alert_id>/test', methods=['POST'])
@require_auth
def test_notification(alert_id):
    """
    POST /api/alerts/<id>/test
    Send a test notification for an alert
    """
    try:
        from services.alert_service import alert_service
        
        result = alert_service.test_notification(alert_id)
        
        if result.get('success'):
            return jsonify(result)
        else:
            return jsonify(result), 400
            
    except Exception as e:
        logger.error(f"Error testing notification for {alert_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/check', methods=['POST'])
@require_auth
def check_alerts():
    """
    POST /api/alerts/check
    Manually trigger an alert check
    """
    try:
        from services.alert_service import alert_service
        
        result = alert_service.check_all_alerts()
        return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error checking alerts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    """
    GET /api/alerts/stats
    Get alert statistics
    """
    try:
        from services.alert_service import alert_service
        
        stats = alert_service.get_stats()
        stats['monitor_running'] = alert_service.is_monitor_running()
        
        return jsonify({
            'success': True,
            'stats': stats
        })
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/monitor/start', methods=['POST'])
@require_auth
def start_monitor():
    """
    POST /api/alerts/monitor/start
    Start the background alert monitoring thread
    
    Optional body: {"interval": 60}
    """
    try:
        from services.alert_service import alert_service
        
        data = request.get_json() or {}
        interval = data.get('interval')
        
        result = alert_service.start_background_monitor(interval=interval)
        return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error starting monitor: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/monitor/stop', methods=['POST'])
@require_auth
def stop_monitor():
    """
    POST /api/alerts/monitor/stop
    Stop the background alert monitoring thread
    """
    try:
        from services.alert_service import alert_service
        
        result = alert_service.stop_background_monitor()
        return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error stopping monitor: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@alert_bp.route('/monitor/status', methods=['GET'])
@require_auth
def monitor_status():
    """
    GET /api/alerts/monitor/status
    Get the status of the background monitor
    """
    try:
        from services.alert_service import alert_service
        
        return jsonify({
            'success': True,
            'running': alert_service.is_monitor_running()
        })
    except Exception as e:
        logger.error(f"Error getting monitor status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
