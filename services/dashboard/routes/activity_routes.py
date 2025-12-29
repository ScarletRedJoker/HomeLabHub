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
            result = activity_service.get_events_grouped_by_date(
                limit=limit,
                source_service=source,
                severity=severity
            )
        else:
            result = activity_service.get_events(
                limit=limit,
                offset=offset,
                source_service=source,
                event_type=event_type,
                severity=severity,
                user_id=user_id,
                start_date=start_date,
                end_date=end_date
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
