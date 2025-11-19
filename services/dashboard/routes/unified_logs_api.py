"""Unified Logs API Routes - Centralized log retrieval and management"""
import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session
from functools import wraps
from flask_sock import Sock
import json
import time

from services.unified_logging_service import unified_logging_service
from workers.log_collector import collect_container_logs, rotate_old_logs

logger = logging.getLogger(__name__)

unified_logs_bp = Blueprint('unified_logs', __name__)
sock = Sock()


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@unified_logs_bp.route('/api/logs', methods=['GET'])
@login_required
def get_logs():
    """
    Retrieve logs with filtering and pagination
    
    Query params:
        service: Filter by service name (optional)
        level: Filter by log level (optional)
        start_date: Filter logs after this date (ISO format, optional)
        end_date: Filter logs before this date (ISO format, optional)
        search: Search in message content (optional)
        limit: Max logs to return (default: 100, max: 1000)
        offset: Offset for pagination (default: 0)
    
    Returns:
        JSON with logs and pagination info
    """
    try:
        service = request.args.get('service')
        log_level = request.args.get('level')
        search = request.args.get('search')
        
        limit = int(request.args.get('limit', 100))
        limit = min(limit, 1000)
        offset = int(request.args.get('offset', 0))
        
        start_date = None
        if request.args.get('start_date'):
            try:
                start_date = datetime.fromisoformat(request.args.get('start_date'))
            except ValueError:
                return jsonify({
                    'success': False,
                    'error': 'Invalid start_date format. Use ISO format.'
                }), 400
        
        end_date = None
        if request.args.get('end_date'):
            try:
                end_date = datetime.fromisoformat(request.args.get('end_date'))
            except ValueError:
                return jsonify({
                    'success': False,
                    'error': 'Invalid end_date format. Use ISO format.'
                }), 400
        
        result = unified_logging_service.get_logs(
            service=service,
            log_level=log_level,
            start_date=start_date,
            end_date=end_date,
            search=search,
            limit=limit,
            offset=offset
        )
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error retrieving logs: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@unified_logs_bp.route('/api/logs/stats', methods=['GET'])
@login_required
def get_log_stats():
    """
    Get log statistics by service and level
    
    Returns:
        JSON with log statistics
    """
    try:
        result = unified_logging_service.get_log_stats()
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error getting log stats: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@unified_logs_bp.route('/api/logs/cleanup', methods=['DELETE'])
@login_required
def cleanup_logs():
    """
    Trigger log rotation (delete old logs)
    
    Query params:
        retention_days: Number of days to keep logs (default: 30)
    
    Returns:
        JSON with deletion results
    """
    try:
        retention_days = int(request.args.get('retention_days', 30))
        
        if retention_days < 1:
            return jsonify({
                'success': False,
                'error': 'retention_days must be at least 1'
            }), 400
        
        result = unified_logging_service.rotate_logs(retention_days)
        
        if not result.get('success'):
            return jsonify(result), 500
        
        return jsonify(result)
    
    except ValueError:
        return jsonify({
            'success': False,
            'error': 'Invalid retention_days parameter'
        }), 400
    except Exception as e:
        logger.error(f"Error cleaning up logs: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@unified_logs_bp.route('/api/logs/collect', methods=['POST'])
@login_required
def trigger_log_collection():
    """
    Manually trigger log collection from containers
    
    Returns:
        JSON with collection results
    """
    try:
        result = collect_container_logs.delay()
        
        return jsonify({
            'success': True,
            'message': 'Log collection task queued',
            'task_id': result.id
        })
    
    except Exception as e:
        logger.error(f"Error triggering log collection: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@unified_logs_bp.route('/api/logs/export', methods=['GET'])
@login_required
def export_logs():
    """
    Export logs to JSON format
    
    Query params: Same as /api/logs GET endpoint
    
    Returns:
        JSON file with logs
    """
    try:
        service = request.args.get('service')
        log_level = request.args.get('level')
        search = request.args.get('search')
        
        limit = int(request.args.get('limit', 1000))
        limit = min(limit, 10000)
        
        start_date = None
        if request.args.get('start_date'):
            try:
                start_date = datetime.fromisoformat(request.args.get('start_date'))
            except ValueError:
                pass
        
        end_date = None
        if request.args.get('end_date'):
            try:
                end_date = datetime.fromisoformat(request.args.get('end_date'))
            except ValueError:
                pass
        
        result = unified_logging_service.get_logs(
            service=service,
            log_level=log_level,
            start_date=start_date,
            end_date=end_date,
            search=search,
            limit=limit,
            offset=0
        )
        
        if not result.get('success'):
            return jsonify(result), 500
        
        export_data = {
            'exported_at': datetime.utcnow().isoformat(),
            'filters': {
                'service': service,
                'log_level': log_level,
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'search': search
            },
            'total_logs': len(result.get('logs', [])),
            'logs': result.get('logs', [])
        }
        
        return jsonify(export_data), 200, {
            'Content-Disposition': f'attachment; filename=logs_export_{datetime.utcnow().strftime("%Y%m%d_%H%M%S")}.json',
            'Content-Type': 'application/json'
        }
    
    except Exception as e:
        logger.error(f"Error exporting logs: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def init_websocket(app):
    """Initialize WebSocket support for real-time log streaming"""
    sock.init_app(app)
    
    @sock.route('/api/logs/stream')
    def stream_logs(ws):
        """
        WebSocket endpoint for real-time log streaming
        
        Clients can send filter criteria as JSON:
        {
            "service": "stream-bot",
            "level": "ERROR"
        }
        """
        if 'logged_in' not in session:
            ws.close(reason='Authentication required')
            return
        
        filters = {}
        last_id = 0
        
        try:
            while True:
                try:
                    data = ws.receive(timeout=1)
                    if data:
                        filters = json.loads(data)
                        logger.info(f"WebSocket filters updated: {filters}")
                except Exception:
                    pass
                
                result = unified_logging_service.get_logs(
                    service=filters.get('service'),
                    log_level=filters.get('level'),
                    limit=50,
                    offset=0
                )
                
                if result.get('success'):
                    logs = result.get('logs', [])
                    
                    new_logs = [log for log in logs if log['id'] > last_id]
                    
                    if new_logs:
                        ws.send(json.dumps({
                            'type': 'logs',
                            'data': new_logs
                        }))
                        
                        last_id = max(log['id'] for log in new_logs)
                
                time.sleep(2)
        
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
            ws.close()
