"""Google Services API Routes with CSRF Protection and Rate Limiting"""
from flask import Blueprint, jsonify, request, render_template
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import generate_csrf
import logging
from typing import Dict, Any
from datetime import datetime, timedelta

from services.google.orchestrator import google_orchestrator
from services.google.calendar_service import calendar_service
from services.google.gmail_service import gmail_service
from services.google.drive_service import drive_service
from services.db_service import db_service
from services.websocket_service import websocket_service
from models.google_integration import (
    GoogleServiceStatus,
    CalendarAutomation,
    EmailNotification,
    DriveBackup,
    ServiceConnectionStatus,
    AutomationStatus,
    EmailNotificationStatus,
    BackupStatus
)
from utils.auth import require_auth

logger = logging.getLogger(__name__)

google_services_bp = Blueprint('google_services', __name__, url_prefix='/google')

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["500 per hour"],
    storage_uri="memory://"
)


def add_security_headers(response):
    """Add security headers to response"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    return response


@google_services_bp.after_request
def after_request(response):
    """Add security headers to all responses"""
    return add_security_headers(response)


@google_services_bp.route('/')
@require_auth
def google_services_dashboard():
    """Render Google services dashboard"""
    return render_template('google_services.html')


@google_services_bp.route('/api/csrf-token', methods=['GET'])
@require_auth
def get_csrf_token():
    """Get CSRF token for client-side requests"""
    try:
        token = generate_csrf()
        return jsonify({
            'success': True,
            'csrf_token': token
        }), 200
    except Exception as e:
        logger.error(f"Error generating CSRF token: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/status', methods=['GET'])
@require_auth
@limiter.limit("60 per minute")
def get_status():
    """Get overall status of all Google services"""
    try:
        status = google_orchestrator.get_status()
        
        # Update database status
        if db_service.is_available:
            with db_service.get_session() as session:
                for service_name, service_status in status['services'].items():
                    db_status = session.query(GoogleServiceStatus).filter_by(
                        service_name=service_name
                    ).first()
                    
                    if not db_status:
                        db_status = GoogleServiceStatus(service_name=service_name)
                        session.add(db_status)
                    
                    db_status.status = (
                        ServiceConnectionStatus.connected
                        if service_status.get('connected')
                        else ServiceConnectionStatus.disconnected
                    )
                    
                    if service_status.get('connected'):
                        db_status.last_connected = datetime.utcnow()
                        db_status.error_count = 0
                        db_status.last_error = None
                    elif service_status.get('error'):
                        db_status.last_error = service_status.get('error')
                        db_status.error_count += 1
                    
                    db_status.connection_metadata = service_status
                
                session.commit()
        
        return jsonify({
            'success': True,
            'status': status,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting Google services status: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/service/<service>/health', methods=['GET'])
@require_auth
@limiter.limit("30 per minute")
def check_service_health(service: str):
    """Check health of a specific service"""
    try:
        health = google_orchestrator.check_service_health(service)
        
        return jsonify({
            'success': True,
            'health': health,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    
    except Exception as e:
        logger.error(f"Error checking {service} health: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/configuration', methods=['GET'])
@require_auth
def get_configuration():
    """Get current configuration for all services"""
    try:
        config = google_orchestrator.get_configuration()
        
        return jsonify({
            'success': True,
            'configuration': config
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting configuration: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/reset', methods=['POST'])
@require_auth
@limiter.limit("10 per hour")
def reset_connections():
    """Reset all service connections (clear cached tokens)"""
    try:
        result = google_orchestrator.reset_connections()
        
        websocket_service.publish_event('google_services', {
            'type': 'connections_reset',
            'result': result,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'result': result
        }), 200
    
    except Exception as e:
        logger.error(f"Error resetting connections: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# Calendar Automation Routes


@google_services_bp.route('/api/calendar/calendars', methods=['GET'])
@require_auth
def list_calendars():
    """List all available calendars"""
    try:
        calendars = calendar_service.list_calendars()
        
        return jsonify({
            'success': True,
            'calendars': calendars,
            'count': len(calendars)
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing calendars: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/calendar/events', methods=['GET'])
@require_auth
def list_calendar_events():
    """List calendar events"""
    try:
        calendar_id = request.args.get('calendar_id', 'primary')
        days_ahead = int(request.args.get('days_ahead', 7))
        
        time_max = datetime.utcnow() + timedelta(days=days_ahead)
        
        events = calendar_service.list_events(
            calendar_id=calendar_id,
            time_max=time_max,
            max_results=100
        )
        
        return jsonify({
            'success': True,
            'events': events,
            'count': len(events)
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing calendar events: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/calendar/automations', methods=['GET'])
@require_auth
def get_calendar_automations():
    """Get all calendar automations"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database unavailable'}), 503
        
        with db_service.get_session() as session:
            automations = session.query(CalendarAutomation).all()
            
            return jsonify({
                'success': True,
                'automations': [auto.to_dict() for auto in automations],
                'count': len(automations)
            }), 200
    
    except Exception as e:
        logger.error(f"Error getting calendar automations: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/calendar/automations', methods=['POST'])
@require_auth
@limiter.limit("20 per hour")
def create_calendar_automation():
    """Create new calendar automation"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        required_fields = ['name', 'event_keywords']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database unavailable'}), 503
        
        with db_service.get_session() as session:
            automation = CalendarAutomation(
                name=data['name'],
                description=data.get('description'),
                calendar_id=data.get('calendar_id', 'primary'),
                event_keywords=data['event_keywords'],
                ha_automation_id=data.get('ha_automation_id'),
                ha_service_domain=data.get('ha_service_domain'),
                ha_service_name=data.get('ha_service_name'),
                ha_service_data=data.get('ha_service_data', {}),
                lead_time_minutes=data.get('lead_time_minutes', 15),
                lag_time_minutes=data.get('lag_time_minutes', 0),
                status=AutomationStatus.active,
                created_by=request.remote_addr
            )
            
            session.add(automation)
            session.commit()
            
            result = automation.to_dict()
        
        websocket_service.publish_event('google_services', {
            'type': 'automation_created',
            'automation': result,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'automation': result
        }), 201
    
    except Exception as e:
        logger.error(f"Error creating calendar automation: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/calendar/automations/<automation_id>', methods=['PUT'])
@require_auth
@limiter.limit("20 per hour")
def update_calendar_automation(automation_id: str):
    """Update calendar automation"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database unavailable'}), 503
        
        with db_service.get_session() as session:
            automation = session.query(CalendarAutomation).filter_by(id=automation_id).first()
            
            if not automation:
                return jsonify({'success': False, 'error': 'Automation not found'}), 404
            
            # Update fields
            updateable_fields = [
                'name', 'description', 'calendar_id', 'event_keywords',
                'ha_automation_id', 'ha_service_domain', 'ha_service_name',
                'ha_service_data', 'lead_time_minutes', 'lag_time_minutes', 'status'
            ]
            
            for field in updateable_fields:
                if field in data:
                    if field == 'status':
                        setattr(automation, field, AutomationStatus(data[field]))
                    else:
                        setattr(automation, field, data[field])
            
            session.commit()
            result = automation.to_dict()
        
        websocket_service.publish_event('google_services', {
            'type': 'automation_updated',
            'automation': result,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'automation': result
        }), 200
    
    except Exception as e:
        logger.error(f"Error updating calendar automation: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/calendar/automations/<automation_id>', methods=['DELETE'])
@require_auth
@limiter.limit("20 per hour")
def delete_calendar_automation(automation_id: str):
    """Delete calendar automation"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database unavailable'}), 503
        
        with db_service.get_session() as session:
            automation = session.query(CalendarAutomation).filter_by(id=automation_id).first()
            
            if not automation:
                return jsonify({'success': False, 'error': 'Automation not found'}), 404
            
            session.delete(automation)
            session.commit()
        
        websocket_service.publish_event('google_services', {
            'type': 'automation_deleted',
            'automation_id': automation_id,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        return jsonify({
            'success': True,
            'message': 'Automation deleted'
        }), 200
    
    except Exception as e:
        logger.error(f"Error deleting calendar automation: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# Gmail Routes


@google_services_bp.route('/api/gmail/send', methods=['POST'])
@require_auth
@limiter.limit("30 per hour")
def send_email():
    """Send email via Gmail"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400
        
        required_fields = ['to', 'subject', 'body']
        for field in required_fields:
            if field not in data:
                return jsonify({'success': False, 'error': f'Missing required field: {field}'}), 400
        
        # Send email
        result = gmail_service.send_email(
            to=data['to'],
            subject=data['subject'],
            body=data['body'],
            template_type=data.get('template_type', 'custom'),
            html=data.get('html', True),
            cc=data.get('cc'),
            bcc=data.get('bcc'),
            **data.get('template_vars', {})
        )
        
        # Log to database
        if db_service.is_available:
            with db_service.get_session() as session:
                notification = EmailNotification(
                    recipient=data['to'],
                    subject=result['subject'],
                    template_type=data.get('template_type', 'custom'),
                    status=EmailNotificationStatus.sent,
                    gmail_message_id=result['id'],
                    gmail_thread_id=result['threadId'],
                    sent_at=datetime.utcnow(),
                    metadata=data.get('template_vars', {})
                )
                session.add(notification)
                session.commit()
        
        return jsonify({
            'success': True,
            'email': result
        }), 200
    
    except Exception as e:
        logger.error(f"Error sending email: {e}", exc_info=True)
        
        # Log failure to database
        if db_service.is_available:
            try:
                with db_service.get_session() as session:
                    notification = EmailNotification(
                        recipient=data.get('to', 'unknown'),
                        subject=data.get('subject', 'unknown'),
                        template_type=data.get('template_type', 'custom'),
                        status=EmailNotificationStatus.failed,
                        error_message=str(e),
                        metadata=data.get('template_vars', {})
                    )
                    session.add(notification)
                    session.commit()
            except:
                pass
        
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/gmail/notifications', methods=['GET'])
@require_auth
def get_email_notifications():
    """Get email notification history"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database unavailable'}), 503
        
        limit = int(request.args.get('limit', 50))
        
        with db_service.get_session() as session:
            notifications = session.query(EmailNotification).order_by(
                EmailNotification.created_at.desc()
            ).limit(limit).all()
            
            return jsonify({
                'success': True,
                'notifications': [n.to_dict() for n in notifications],
                'count': len(notifications)
            }), 200
    
    except Exception as e:
        logger.error(f"Error getting email notifications: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


# Google Drive Routes


@google_services_bp.route('/api/drive/backups', methods=['GET'])
@require_auth
def list_backups():
    """List backup files in Google Drive"""
    try:
        backups = drive_service.list_backups()
        
        return jsonify({
            'success': True,
            'backups': backups,
            'count': len(backups)
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing backups: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/drive/backups/history', methods=['GET'])
@require_auth
def get_backup_history():
    """Get backup history from database"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database unavailable'}), 503
        
        limit = int(request.args.get('limit', 100))
        
        with db_service.get_session() as session:
            backups = session.query(DriveBackup).filter_by(
                deleted=False
            ).order_by(DriveBackup.created_at.desc()).limit(limit).all()
            
            return jsonify({
                'success': True,
                'backups': [b.to_dict() for b in backups],
                'count': len(backups)
            }), 200
    
    except Exception as e:
        logger.error(f"Error getting backup history: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/drive/storage', methods=['GET'])
@require_auth
def get_storage_info():
    """Get Drive storage information"""
    try:
        storage = drive_service.get_storage_info()
        
        return jsonify({
            'success': True,
            'storage': storage
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting storage info: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@google_services_bp.route('/api/drive/backups/<backup_id>', methods=['DELETE'])
@require_auth
@limiter.limit("20 per hour")
def delete_backup(backup_id: str):
    """Delete a backup file"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'error': 'Database unavailable'}), 503
        
        with db_service.get_session() as session:
            backup = session.query(DriveBackup).filter_by(id=backup_id).first()
            
            if not backup:
                return jsonify({'success': False, 'error': 'Backup not found'}), 404
            
            # Delete from Drive
            success = drive_service.delete_backup(backup.drive_file_id)
            
            if success:
                backup.deleted = True
                backup.status = BackupStatus.failed
                session.commit()
            
            return jsonify({
                'success': success,
                'message': 'Backup deleted' if success else 'Failed to delete backup'
            }), 200 if success else 500
    
    except Exception as e:
        logger.error(f"Error deleting backup: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
