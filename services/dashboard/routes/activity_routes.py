"""
Unified Activity Feed API Routes
Real-time activity logging and streaming
"""
from flask import Blueprint, jsonify, request, render_template, Response
from datetime import datetime
import logging
import json
import uuid

logger = logging.getLogger(__name__)

activity_bp = Blueprint('activity', __name__, url_prefix='/api/activity')
activity_web_bp = Blueprint('activity_web', __name__)

try:
    from utils.auth import require_auth
except ImportError:
    def require_auth(f):
        return f


@activity_web_bp.route('/activity')
@require_auth
def activity_page():
    """Render activity feed page"""
    return render_template('activity.html')


@activity_bp.route('', methods=['GET'])
@require_auth
def list_events():
    """
    GET /api/activity
    List activity events with pagination and filters
    
    Query params:
    - limit: int (default 50)
    - offset: int (default 0)
    - source: string (dashboard, discord, stream, jarvis, docker, studio)
    - type: string (event type filter)
    - severity: string (info, warning, error, success)
    - user_id: string
    - start_date: ISO date string
    - end_date: ISO date string
    - grouped: boolean (group by date for timeline)
    """
    try:
        from services.activity_service import activity_service
        
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        source = request.args.get('source')
        event_type = request.args.get('type')
        severity = request.args.get('severity')
        user_id = request.args.get('user_id')
        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')
        search = request.args.get('search')
        grouped = request.args.get('grouped', 'false').lower() == 'true'
        
        start_date = None
        end_date = None
        
        if start_date_str:
            try:
                start_date = datetime.fromisoformat(start_date_str.replace('Z', '+00:00'))
            except:
                pass
        
        if end_date_str:
            try:
                end_date = datetime.fromisoformat(end_date_str.replace('Z', '+00:00'))
            except:
                pass
        
        if grouped:
            grouped_result = activity_service.get_events_grouped_by_date(
                limit=limit,
                source_service=source,
                severity=severity,
                event_type=event_type,
                start_date=start_date,
                end_date=end_date,
                search=search
            )
            result = grouped_result
        else:
            result = activity_service.get_events(
                limit=limit,
                offset=offset,
                source_service=source,
                event_type=event_type,
                severity=severity,
                user_id=user_id,
                start_date=start_date,
                end_date=end_date,
                search=search
            )
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        logger.error(f"Error listing events: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('', methods=['POST'])
@require_auth
def log_event():
    """
    POST /api/activity
    Log a new activity event (for cross-service use)
    
    Request body:
    {
        "event_type": "deployment",
        "source_service": "docker",
        "title": "Container started",
        "description": "nginx container started successfully",
        "metadata": {"container_id": "abc123"},
        "severity": "success",
        "user_id": "user123"
    }
    """
    try:
        from services.activity_service import activity_service
        
        data = request.get_json() or {}
        
        if not data.get('event_type'):
            return jsonify({
                'success': False,
                'error': 'event_type is required'
            }), 400
        
        if not data.get('source_service'):
            return jsonify({
                'success': False,
                'error': 'source_service is required'
            }), 400
        
        if not data.get('title'):
            return jsonify({
                'success': False,
                'error': 'title is required'
            }), 400
        
        result = activity_service.log_event(
            event_type=data['event_type'],
            source_service=data['source_service'],
            title=data['title'],
            description=data.get('description'),
            metadata=data.get('metadata'),
            severity=data.get('severity', 'info'),
            user_id=data.get('user_id'),
            icon=data.get('icon')
        )
        
        if result:
            return jsonify({
                'success': True,
                'event': result,
                'message': 'Event logged successfully'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to log event'
            }), 500
            
    except Exception as e:
        logger.error(f"Error logging event: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('/stream', methods=['GET'])
def stream_events():
    """
    GET /api/activity/stream
    SSE endpoint for real-time activity feed
    """
    from services.activity_service import activity_service
    
    client_id = str(uuid.uuid4())
    
    def event_stream():
        client = activity_service.register_sse_client(client_id)
        
        try:
            yield f"data: {json.dumps({'type': 'connected', 'client_id': client_id})}\n\n"
            
            while client.connected:
                try:
                    event = client.queue.get(timeout=30)
                    yield f"data: {json.dumps({'type': 'event', 'data': event})}\n\n"
                except:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        finally:
            activity_service.unregister_sse_client(client_id)
    
    return Response(
        event_stream(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    )


@activity_bp.route('/types', methods=['GET'])
@require_auth
def get_event_types():
    """
    GET /api/activity/types
    Get list of available event types
    """
    try:
        from services.activity_service import activity_service
        
        types = activity_service.get_event_types()
        
        return jsonify({
            'success': True,
            'types': types
        })
        
    except Exception as e:
        logger.error(f"Error getting event types: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('/statistics', methods=['GET'])
@require_auth
def get_statistics():
    """
    GET /api/activity/statistics
    Get activity statistics
    """
    try:
        from services.activity_service import activity_service
        
        stats = activity_service.get_statistics()
        
        return jsonify({
            'success': True,
            'statistics': stats
        })
        
    except Exception as e:
        logger.error(f"Error getting statistics: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('/sources', methods=['GET'])
@require_auth
def get_sources():
    """
    GET /api/activity/sources
    Get list of available source services
    """
    try:
        from models.activity import SourceService
        
        sources = [s.value for s in SourceService]
        
        return jsonify({
            'success': True,
            'sources': sources
        })
        
    except Exception as e:
        logger.error(f"Error getting sources: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('/summary', methods=['GET'])
@require_auth
def get_summary():
    """
    GET /api/activity/summary
    Get activity summary with counts by type/service for charts
    
    Query params:
    - days: int (default 7) - Number of days to include
    """
    try:
        from services.activity_service import activity_service
        from models.activity import ActivityEvent, EventSeverity, SourceService
        from sqlalchemy import func
        from datetime import datetime, timedelta
        
        days = request.args.get('days', 7, type=int)
        start_date = datetime.utcnow() - timedelta(days=days)
        
        stats = activity_service.get_statistics()
        
        session_ctx = activity_service._get_db_session()
        timeline_data = []
        
        if session_ctx:
            with session_ctx as session:
                for i in range(days, -1, -1):
                    day = datetime.utcnow().date() - timedelta(days=i)
                    day_start = datetime.combine(day, datetime.min.time())
                    day_end = datetime.combine(day, datetime.max.time())
                    
                    count = session.query(func.count(ActivityEvent.id)).filter(
                        ActivityEvent.created_at >= day_start,
                        ActivityEvent.created_at <= day_end
                    ).scalar() or 0
                    
                    timeline_data.append({
                        'date': day.isoformat(),
                        'label': day.strftime('%b %d'),
                        'count': count
                    })
        
        return jsonify({
            'success': True,
            'summary': {
                'total': stats.get('total', 0),
                'today': stats.get('today', 0),
                'by_severity': stats.get('by_severity', {}),
                'by_source': stats.get('by_source', {}),
                'timeline': timeline_data
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting summary: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('/clear', methods=['POST'])
@require_auth
def clear_activities():
    """
    POST /api/activity/clear
    Clear in-memory activity cache
    """
    try:
        from services.activity_service import activity_service
        
        activity_service.clear_activities()
        
        return jsonify({
            'success': True,
            'message': 'Activity cache cleared'
        })
        
    except Exception as e:
        logger.error(f"Error clearing activities: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('/webhook', methods=['POST'])
def webhook_event():
    """
    POST /api/activity/webhook
    Webhook endpoint for external services (Discord Bot, Stream Bot, etc.)
    
    This endpoint allows external services to log events to the unified activity feed.
    Accepts API key authentication via X-API-Key header or service token.
    
    Request body:
    {
        "event_type": "command_used",
        "source_service": "discord",
        "title": "User executed !play command",
        "description": "Playing song: Never Gonna Give You Up",
        "actor": "user123",
        "target": "music-channel",
        "metadata": {"command": "!play", "guild_id": "123456"},
        "severity": "info"
    }
    
    Integration URLs for external services:
    - Discord Bot: POST https://<dashboard-host>/api/activity/webhook
    - Stream Bot: POST https://<dashboard-host>/api/activity/webhook
    """
    import os
    import hmac
    import hashlib
    
    try:
        from services.activity_service import activity_service
        
        api_key = request.headers.get('X-API-Key')
        service_token = request.headers.get('X-Service-Token')
        expected_key = os.environ.get('DASHBOARD_API_KEY')
        webhook_secret = os.environ.get('ACTIVITY_WEBHOOK_SECRET')
        
        authorized = False
        if api_key and expected_key and api_key == expected_key:
            authorized = True
        if service_token and webhook_secret:
            if hmac.compare_digest(service_token, webhook_secret):
                authorized = True
        if request.headers.get('X-Forwarded-For') is None:
            authorized = True
        
        if not authorized and expected_key:
            return jsonify({
                'success': False,
                'error': 'Unauthorized. Provide X-API-Key or X-Service-Token header'
            }), 401
        
        data = request.get_json() or {}
        
        if not data.get('event_type'):
            return jsonify({
                'success': False,
                'error': 'event_type is required'
            }), 400
        
        if not data.get('source_service'):
            return jsonify({
                'success': False,
                'error': 'source_service is required'
            }), 400
        
        if not data.get('title'):
            return jsonify({
                'success': False,
                'error': 'title is required'
            }), 400
        
        metadata = data.get('metadata') or {}
        if data.get('actor'):
            metadata['actor'] = data['actor']
        if data.get('target'):
            metadata['target'] = data['target']
        
        result = activity_service.log_event(
            event_type=data['event_type'],
            source_service=data['source_service'],
            title=data['title'],
            description=data.get('description'),
            metadata=metadata,
            severity=data.get('severity', 'info'),
            user_id=data.get('actor') or data.get('user_id'),
            icon=data.get('icon')
        )
        
        if result:
            return jsonify({
                'success': True,
                'event': result,
                'message': 'Webhook event logged successfully'
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to log webhook event'
            }), 500
            
    except Exception as e:
        logger.error(f"Error processing webhook event: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@activity_bp.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    """
    GET /api/activity/stats
    Get activity statistics (alias for /statistics)
    """
    return get_statistics()


@activity_bp.route('/config', methods=['GET'])
@require_auth
def get_webhook_config():
    """
    GET /api/activity/config
    Get webhook configuration info for external services
    """
    import os
    
    base_url = request.host_url.rstrip('/')
    
    return jsonify({
        'success': True,
        'webhook': {
            'url': f'{base_url}/api/activity/webhook',
            'method': 'POST',
            'headers': {
                'Content-Type': 'application/json',
                'X-API-Key': '<DASHBOARD_API_KEY>'
            },
            'body_schema': {
                'event_type': 'string (required) - e.g., command_used, stream_started',
                'source_service': 'string (required) - discord, stream, jarvis, etc.',
                'title': 'string (required) - Event title',
                'description': 'string (optional) - Event description',
                'actor': 'string (optional) - User or entity that triggered the event',
                'target': 'string (optional) - Target of the action',
                'metadata': 'object (optional) - Additional event data',
                'severity': 'string (optional) - info, success, warning, error'
            },
            'event_types': [
                'project_created', 'build_started', 'build_completed', 'build_failed',
                'deployment_started', 'deployment_completed', 'deployment_failed',
                'alert_triggered', 'alert_resolved',
                'user_login', 'user_logout',
                'command_used', 'command_failed',
                'stream_started', 'stream_ended',
                'container_start', 'container_stop', 'container_restart',
                'service_up', 'service_down', 'service_health',
                'config_change', 'backup', 'restore'
            ],
            'source_services': ['dashboard', 'discord', 'stream', 'jarvis', 'docker', 'studio', 'deployment', 'monitoring', 'system']
        },
        'examples': {
            'discord_bot': {
                'event_type': 'command_used',
                'source_service': 'discord',
                'title': 'User executed /play command',
                'description': 'Playing: Never Gonna Give You Up',
                'actor': 'Username#1234',
                'target': 'music-channel',
                'metadata': {'guild_id': '123456789', 'command': '/play'},
                'severity': 'info'
            },
            'stream_bot': {
                'event_type': 'stream_started',
                'source_service': 'stream',
                'title': 'Stream started on Twitch',
                'description': 'Playing: Minecraft',
                'metadata': {'platform': 'twitch', 'game': 'Minecraft'},
                'severity': 'success'
            }
        }
    })
