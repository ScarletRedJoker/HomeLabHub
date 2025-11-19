"""Storage Monitoring API Routes"""
import logging
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session, render_template
from functools import wraps

from services.storage_monitor import storage_monitor
from services.db_service import db_service
from services.cache_service import cache_service
from workers.storage_worker import (
    collect_storage_metrics,
    scan_plex_directories,
    check_database_sizes,
    check_alert_thresholds
)

logger = logging.getLogger(__name__)

storage_bp = Blueprint('storage', __name__)


def login_required(f):
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            return jsonify({'error': 'Authentication required'}), 401
        return f(*args, **kwargs)
    return decorated_function


@storage_bp.route('/storage')
@login_required
def storage_page():
    """Render storage monitoring page"""
    return render_template('storage.html')


@storage_bp.route('/api/storage/metrics', methods=['GET'])
@login_required
def get_current_metrics():
    """
    Get current storage usage across all types
    
    Returns:
        JSON with current metrics for Plex, databases, Docker, and MinIO
    """
    try:
        # Try to get from cache first
        cache_key = 'storage:metrics:current'
        cached = cache_service.get(cache_key)
        if cached:
            logger.debug("Returning cached storage metrics")
            return jsonify(cached)
        
        # Query database if not cached
        metrics = storage_monitor.get_current_metrics()
        
        result = {
            'success': True,
            'metrics': metrics,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        # Cache for 5 minutes
        cache_service.set(cache_key, result, ttl=cache_service.TTL_5_MIN)
        
        return jsonify(result)
    
    except Exception as e:
        logger.error(f"Error getting current metrics: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/trends', methods=['GET'])
@login_required
def get_storage_trends():
    """
    Get historical storage data for trend analysis
    
    Query params:
        days: Number of days to retrieve (default: 7, max: 90)
        metric_type: Filter by metric type (optional)
        
    Returns:
        JSON with historical metrics
    """
    try:
        days = int(request.args.get('days', 7))
        days = min(days, 90)  # Cap at 90 days
        metric_type = request.args.get('metric_type')
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageMetric
        from sqlalchemy import select, and_
        
        with db_service.get_session() as session:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            query = select(StorageMetric).where(
                StorageMetric.timestamp >= cutoff_date
            )
            
            if metric_type:
                query = query.where(StorageMetric.metric_type == metric_type)
            
            query = query.order_by(StorageMetric.timestamp.asc())
            
            metrics = session.execute(query).scalars().all()
            
            # Group by metric type and name for easier charting
            grouped_data = {}
            for metric in metrics:
                key = f"{metric.metric_type}_{metric.metric_name}"
                if key not in grouped_data:
                    grouped_data[key] = {
                        'metric_type': metric.metric_type,
                        'metric_name': metric.metric_name,
                        'data_points': []
                    }
                
                grouped_data[key]['data_points'].append({
                    'timestamp': metric.timestamp.isoformat(),
                    'size_bytes': metric.size_bytes,
                    'size_gb': metric.to_dict()['size_gb'],
                    'usage_percent': metric.usage_percent
                })
            
            return jsonify({
                'success': True,
                'days': days,
                'trends': list(grouped_data.values()),
                'total_data_points': len(metrics)
            })
    
    except Exception as e:
        logger.error(f"Error getting storage trends: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/plex', methods=['GET'])
@login_required
def get_plex_breakdown():
    """
    Get detailed Plex media storage breakdown
    
    Returns:
        JSON with Plex media usage by type
    """
    try:
        plex_data = storage_monitor.scan_plex_media()
        
        # Add growth trends for each media type
        for media_type in plex_data.keys():
            trend = storage_monitor.calculate_growth_trend('plex_media', media_type, days=7)
            plex_data[media_type]['trend'] = trend
        
        return jsonify({
            'success': True,
            'plex_media': plex_data,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting Plex breakdown: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/databases', methods=['GET'])
@login_required
def get_database_sizes():
    """
    Get PostgreSQL database sizes
    
    Returns:
        JSON with database sizes
    """
    try:
        db_sizes = storage_monitor.get_database_sizes()
        
        # Add growth trends for each database
        for db_name in db_sizes.keys():
            trend = storage_monitor.calculate_growth_trend('postgres_db', db_name, days=7)
            db_sizes[db_name]['trend'] = trend
        
        return jsonify({
            'success': True,
            'databases': db_sizes,
            'timestamp': datetime.utcnow().isoformat()
        })
    
    except Exception as e:
        logger.error(f"Error getting database sizes: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/alerts', methods=['GET'])
@login_required
def get_alert_configurations():
    """
    Get all storage alert configurations
    
    Query params:
        page: Page number (default: 1)
        per_page: Items per page (default: 50, max: 100)
    
    Returns:
        JSON with alert configurations
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageAlert
        from sqlalchemy import select, func
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        per_page = min(int(request.args.get('per_page', 50)), 100)
        
        with db_service.get_session() as session:
            # Get total count
            total = session.execute(
                select(func.count()).select_from(StorageAlert)
            ).scalar()
            
            # Get paginated results
            alerts = session.execute(
                select(StorageAlert)
                .order_by(StorageAlert.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            ).scalars().all()
            
            return jsonify({
                'success': True,
                'alerts': [alert.to_dict() for alert in alerts],
                'pagination': {
                    'page': page,
                    'per_page': per_page,
                    'total': total,
                    'pages': (total + per_page - 1) // per_page
                }
            })
    
    except Exception as e:
        logger.error(f"Error getting alert configurations: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/alerts', methods=['POST'])
@login_required
def create_or_update_alert():
    """
    Create or update storage alert threshold
    
    JSON body:
        metric_type: Type of metric (e.g., 'plex_media', 'postgres_db')
        metric_name: Name of specific metric
        threshold_percent: Alert threshold percentage (0-100)
        alert_enabled: Whether alert is enabled (boolean)
        
    Returns:
        JSON with created/updated alert
    """
    try:
        # Invalidate alerts cache on mutation
        cache_service.delete_pattern('storage:alerts:*')
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        required_fields = ['metric_type', 'metric_name', 'threshold_percent']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageAlert
        from sqlalchemy import select, and_
        
        with db_service.get_session() as session:
            # Check if alert already exists
            existing_alert = session.execute(
                select(StorageAlert).where(
                    and_(
                        StorageAlert.metric_type == data['metric_type'],
                        StorageAlert.metric_name == data['metric_name']
                    )
                )
            ).scalar_one_or_none()
            
            if existing_alert:
                # Update existing alert
                existing_alert.threshold_percent = float(data['threshold_percent'])
                existing_alert.alert_enabled = data.get('alert_enabled', True)
                existing_alert.updated_at = datetime.utcnow()
                alert = existing_alert
            else:
                # Create new alert
                alert = StorageAlert(
                    metric_type=data['metric_type'],
                    metric_name=data['metric_name'],
                    threshold_percent=float(data['threshold_percent']),
                    alert_enabled=data.get('alert_enabled', True)
                )
                session.add(alert)
            
            session.commit()
            
            return jsonify({
                'success': True,
                'alert': alert.to_dict(),
                'message': 'Alert configuration saved'
            })
    
    except Exception as e:
        logger.error(f"Error creating/updating alert: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/alerts/<alert_id>', methods=['DELETE'])
@login_required
def delete_alert(alert_id):
    """
    Delete a storage alert configuration
    
    Returns:
        JSON with success status
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        from models.storage import StorageAlert
        from sqlalchemy import select
        import uuid
        
        with db_service.get_session() as session:
            alert = session.execute(
                select(StorageAlert).where(StorageAlert.id == uuid.UUID(alert_id))
            ).scalar_one_or_none()
            
            if not alert:
                return jsonify({
                    'success': False,
                    'error': 'Alert not found'
                }), 404
            
            session.delete(alert)
            session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Alert deleted successfully'
            })
    
    except Exception as e:
        logger.error(f"Error deleting alert: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/scan', methods=['POST'])
@login_required
def trigger_manual_scan():
    """
    Trigger a manual storage scan
    
    Query params:
        scan_type: Type of scan (all, plex, databases, docker, minio) - default: all
        
    Returns:
        JSON with task IDs
    """
    try:
        scan_type = request.args.get('scan_type', 'all')
        
        task_ids = {}
        
        if scan_type in ['all', 'plex']:
            task = scan_plex_directories.delay()
            task_ids['plex_scan'] = task.id
        
        if scan_type in ['all', 'databases']:
            task = check_database_sizes.delay()
            task_ids['database_scan'] = task.id
        
        if scan_type == 'all':
            task = collect_storage_metrics.delay()
            task_ids['full_scan'] = task.id
        
        return jsonify({
            'success': True,
            'message': 'Storage scan triggered',
            'scan_type': scan_type,
            'task_ids': task_ids
        })
    
    except Exception as e:
        logger.error(f"Error triggering manual scan: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@storage_bp.route('/api/storage/cleanup-suggestions', methods=['GET'])
@login_required
def get_cleanup_suggestions():
    """
    Get intelligent cleanup suggestions
    
    Returns:
        JSON with cleanup recommendations
    """
    try:
        suggestions = storage_monitor.generate_cleanup_suggestions()
        
        # Sort by priority
        priority_order = {'high': 0, 'medium': 1, 'low': 2}
        suggestions.sort(key=lambda x: priority_order.get(x['priority'], 3))
        
        return jsonify({
            'success': True,
            'suggestions': suggestions,
            'total_suggestions': len(suggestions)
        })
    
    except Exception as e:
        logger.error(f"Error getting cleanup suggestions: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['storage_bp']
