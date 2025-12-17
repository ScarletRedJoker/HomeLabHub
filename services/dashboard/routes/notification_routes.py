"""
Notification Center Routes
API and web routes for task queue and alert management
"""
from flask import Blueprint, jsonify, request, render_template
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission, get_current_user
from models.rbac import Permission
from services.notification_service import notification_service
import logging

logger = logging.getLogger(__name__)

notification_bp = Blueprint('notifications', __name__, url_prefix='/notifications')


@notification_bp.route('/')
@require_web_auth
def notification_center():
    """Render Notification Center page"""
    return render_template('notification_center.html')


@notification_bp.route('/api/alerts', methods=['GET'])
@require_auth
def get_alerts():
    """Get recent alerts"""
    try:
        unread_only = request.args.get('unread_only', 'false').lower() == 'true'
        severity = request.args.get('severity')
        limit = int(request.args.get('limit', 50))
        
        alerts = notification_service.get_alerts(
            unread_only=unread_only,
            severity=severity,
            limit=limit
        )
        
        return jsonify({
            'success': True,
            'alerts': alerts,
            'unread_count': notification_service.get_unread_count()
        })
    except Exception as e:
        logger.error(f"Error getting alerts: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/alerts', methods=['POST'])
@require_auth
def create_alert():
    """Create and send alert"""
    try:
        data = request.get_json() or {}
        
        title = data.get('title')
        message = data.get('message')
        severity = data.get('severity', 'info')
        channels = data.get('channels', ['discord', 'web'])
        source = data.get('source')
        metadata = data.get('metadata')
        
        if not title or not message:
            return jsonify({'success': False, 'error': 'Title and message are required'}), 400
        
        result = notification_service.send_alert(
            title=title,
            message=message,
            severity=severity,
            channels=channels,
            source=source,
            metadata=metadata
        )
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error creating alert: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/alerts/<int:alert_id>/read', methods=['POST'])
@require_auth
def mark_alert_read(alert_id):
    """Mark an alert as read"""
    try:
        result = notification_service.mark_alert_read(alert_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error marking alert read: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/alerts/<int:alert_id>/dismiss', methods=['POST'])
@require_auth
def dismiss_alert(alert_id):
    """Dismiss an alert"""
    try:
        result = notification_service.dismiss_alert(alert_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error dismissing alert: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/alerts/read-all', methods=['POST'])
@require_auth
def mark_all_alerts_read():
    """Mark all alerts as read"""
    try:
        result = notification_service.mark_all_alerts_read()
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error marking all alerts read: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/unread-count', methods=['GET'])
@require_auth
def get_unread_count():
    """Get count of unread alerts"""
    try:
        count = notification_service.get_unread_count()
        return jsonify({'success': True, 'count': count})
    except Exception as e:
        logger.error(f"Error getting unread count: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/tasks', methods=['GET'])
@require_auth
def get_tasks():
    """Get all tasks"""
    try:
        status = request.args.get('status')
        priority = request.args.get('priority')
        overdue_only = request.args.get('overdue', 'false').lower() == 'true'
        limit = int(request.args.get('limit', 50))
        
        tasks = notification_service.get_tasks(
            status=status,
            priority=priority,
            overdue_only=overdue_only,
            limit=limit
        )
        
        return jsonify({
            'success': True,
            'tasks': tasks,
            'stats': notification_service.get_task_stats()
        })
    except Exception as e:
        logger.error(f"Error getting tasks: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/tasks', methods=['POST'])
@require_auth
def create_task():
    """Create new task"""
    try:
        data = request.get_json() or {}
        
        title = data.get('title')
        description = data.get('description')
        task_type = data.get('task_type', 'approval_required')
        priority = data.get('priority', 'medium')
        sla_hours = int(data.get('sla_hours', 24))
        assigned_to = data.get('assigned_to')
        instructions = data.get('instructions')
        metadata = data.get('metadata')
        
        if not title or not description:
            return jsonify({'success': False, 'error': 'Title and description are required'}), 400
        
        result = notification_service.create_task(
            title=title,
            description=description,
            task_type=task_type,
            priority=priority,
            sla_hours=sla_hours,
            assigned_to=assigned_to,
            instructions=instructions,
            metadata=metadata
        )
        
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error creating task: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/tasks/<task_id>/start', methods=['POST'])
@require_auth
def start_task(task_id):
    """Mark task as in progress"""
    try:
        result = notification_service.start_task(task_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error starting task: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/tasks/<task_id>/complete', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def complete_task(task_id):
    """Complete a task"""
    try:
        data = request.get_json() or {}
        notes = data.get('notes')
        
        result = notification_service.complete_task(task_id, notes=notes)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error completing task: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/tasks/<task_id>/dismiss', methods=['POST'])
@require_auth
def dismiss_task(task_id):
    """Dismiss a task"""
    try:
        data = request.get_json() or {}
        notes = data.get('notes')
        
        result = notification_service.dismiss_task(task_id, notes=notes)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error dismissing task: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/tasks/stats', methods=['GET'])
@require_auth
def get_task_stats():
    """Get task queue statistics"""
    try:
        stats = notification_service.get_task_stats()
        return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        logger.error(f"Error getting task stats: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/settings', methods=['GET'])
@require_auth
def get_notification_settings():
    """Get notification preferences"""
    try:
        user = get_current_user()
        user_id = user.get('user_id', 'default') if user else 'default'
        
        settings = notification_service.get_notification_settings(user_id)
        return jsonify({'success': True, 'settings': settings})
    except Exception as e:
        logger.error(f"Error getting notification settings: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@notification_bp.route('/api/settings', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def update_notification_settings():
    """Update notification preferences"""
    try:
        user = get_current_user()
        user_id = user.get('user_id', 'default') if user else 'default'
        
        data = request.get_json() or {}
        
        result = notification_service.update_notification_settings(user_id, data)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error updating notification settings: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


__all__ = ['notification_bp']
