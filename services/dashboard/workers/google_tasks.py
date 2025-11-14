"""Celery Workers for Google Services Background Tasks"""
import logging
import os
import tempfile
import shutil
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from celery import Task
from celery_app import celery_app
from services.google.calendar_service import calendar_service
from services.google.gmail_service import gmail_service
from services.google.drive_service import drive_service
from services.home_assistant_service import home_assistant_service
from services.db_service import db_service
from services.websocket_service import websocket_service
from models.google_integration import (
    CalendarAutomation,
    EmailNotification,
    DriveBackup,
    AutomationStatus,
    EmailNotificationStatus,
    BackupStatus
)

logger = logging.getLogger(__name__)


class GoogleTask(Task):
    """Base class for Google service tasks with error handling"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3, 'countdown': 5}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        logger.error(f"Google task {task_id} failed: {exc}")
        
        # Publish failure event
        try:
            websocket_service.publish_event('google_services', {
                'type': 'task_failed',
                'task_id': task_id,
                'error': str(exc),
                'timestamp': datetime.utcnow().isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to publish failure event: {e}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success"""
        logger.info(f"Google task {task_id} completed successfully")


@celery_app.task(base=GoogleTask, bind=True, name='workers.google_tasks.poll_calendar_events')
def poll_calendar_events(self):
    """
    Poll calendar events and trigger Home Assistant automations
    
    This task should be run periodically (e.g., every 5 minutes)
    to check for upcoming events that match automation criteria.
    """
    logger.info("Polling calendar events for automation triggers")
    
    if not db_service.is_available:
        logger.error("Database service not available")
        return {'error': 'Database unavailable'}
    
    try:
        triggered_count = 0
        error_count = 0
        
        with db_service.get_session() as session:
            # Get all active automations
            automations = session.query(CalendarAutomation).filter_by(
                status=AutomationStatus.active
            ).all()
            
            logger.info(f"Found {len(automations)} active calendar automations")
            
            for automation in automations:
                try:
                    # Get upcoming events that match automation keywords
                    matching_events = calendar_service.get_upcoming_automation_events(
                        automation_keywords=automation.event_keywords,
                        lead_time_minutes=automation.lead_time_minutes,
                        calendar_id=automation.calendar_id
                    )
                    
                    for event in matching_events:
                        # Check if we should trigger automation for this event
                        event_start = datetime.fromisoformat(event['start'].replace('Z', '+00:00'))
                        time_to_event = (event_start - datetime.utcnow()).total_seconds() / 60
                        
                        # Trigger if within lead time window
                        if 0 <= time_to_event <= automation.lead_time_minutes:
                            logger.info(f"Triggering automation '{automation.name}' for event: {event['summary']}")
                            
                            # Call Home Assistant service if configured
                            if (automation.ha_service_domain and
                                automation.ha_service_name and
                                home_assistant_service.enabled):
                                
                                result = home_assistant_service.call_service(
                                    domain=automation.ha_service_domain,
                                    service=automation.ha_service_name,
                                    **automation.ha_service_data
                                )
                                
                                if result:
                                    automation.last_triggered = datetime.utcnow()
                                    automation.trigger_count += 1
                                    triggered_count += 1
                                    
                                    # Publish event
                                    websocket_service.publish_event('google_services', {
                                        'type': 'automation_triggered',
                                        'automation_id': str(automation.id),
                                        'automation_name': automation.name,
                                        'event_summary': event['summary'],
                                        'timestamp': datetime.utcnow().isoformat()
                                    })
                                else:
                                    logger.error(f"Failed to call HA service for automation: {automation.name}")
                                    automation.last_error = "Failed to call Home Assistant service"
                                    error_count += 1
                
                except Exception as e:
                    logger.error(f"Error processing automation '{automation.name}': {e}", exc_info=True)
                    automation.last_error = str(e)
                    automation.status = AutomationStatus.error
                    error_count += 1
            
            session.commit()
        
        result = {
            'triggered_count': triggered_count,
            'error_count': error_count,
            'total_automations': len(automations),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Calendar polling complete: {triggered_count} triggered, {error_count} errors")
        return result
    
    except Exception as e:
        logger.error(f"Error polling calendar events: {e}", exc_info=True)
        raise


@celery_app.task(base=GoogleTask, bind=True, name='workers.google_tasks.send_email_task')
def send_email_task(
    self,
    to: str,
    subject: str,
    body: str,
    template_type: str = 'custom',
    html: bool = True,
    cc: Optional[List[str]] = None,
    bcc: Optional[List[str]] = None,
    **template_vars
):
    """
    Send email via Gmail asynchronously
    
    Args:
        to: Recipient email address
        subject: Email subject
        body: Email body
        template_type: Template type (deployment, ssl_expiry, error, backup, custom)
        html: Whether to send HTML email
        cc: CC recipients
        bcc: BCC recipients
        **template_vars: Template variables for subject formatting
    """
    logger.info(f"Sending email to {to}: {subject}")
    
    notification_id = None
    
    try:
        # Create notification record
        if db_service.is_available:
            with db_service.get_session() as session:
                notification = EmailNotification(
                    recipient=to,
                    subject=subject,
                    template_type=template_type,
                    status=EmailNotificationStatus.pending,
                    metadata=template_vars
                )
                session.add(notification)
                session.commit()
                notification_id = notification.id
        
        # Send email
        result = gmail_service.send_email(
            to=to,
            subject=subject,
            body=body,
            template_type=template_type,
            html=html,
            cc=cc,
            bcc=bcc,
            **template_vars
        )
        
        # Update notification record
        if db_service.is_available and notification_id:
            with db_service.get_session() as session:
                notification = session.query(EmailNotification).filter_by(id=notification_id).first()
                if notification:
                    notification.status = EmailNotificationStatus.sent
                    notification.gmail_message_id = result['id']
                    notification.gmail_thread_id = result['threadId']
                    notification.sent_at = datetime.utcnow()
                    session.commit()
        
        # Publish event
        websocket_service.publish_event('google_services', {
            'type': 'email_sent',
            'recipient': to,
            'subject': subject,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        logger.info(f"Email sent successfully to {to}")
        return result
    
    except Exception as e:
        logger.error(f"Error sending email to {to}: {e}", exc_info=True)
        
        # Update notification record with error
        if db_service.is_available and notification_id:
            try:
                with db_service.get_session() as session:
                    notification = session.query(EmailNotification).filter_by(id=notification_id).first()
                    if notification:
                        notification.status = EmailNotificationStatus.failed
                        notification.error_message = str(e)
                        notification.retry_count += 1
                        session.commit()
            except Exception as db_error:
                logger.error(f"Error updating notification status: {db_error}")
        
        raise


@celery_app.task(base=GoogleTask, bind=True, name='workers.google_tasks.backup_to_drive_task')
def backup_to_drive_task(
    self,
    file_paths: List[str],
    description: Optional[str] = None,
    created_by: str = 'system',
    backup_type: str = 'manual',
    retention_days: Optional[int] = None
):
    """
    Upload backup files to Google Drive
    
    Args:
        file_paths: List of file paths to backup
        description: Backup description
        created_by: User who created the backup
        backup_type: Type of backup (manual, automated)
        retention_days: Number of days to retain backup
    """
    logger.info(f"Starting Drive backup: {len(file_paths)} files")
    
    uploaded_count = 0
    failed_count = 0
    total_size = 0
    
    try:
        for file_path in file_paths:
            backup_id = None
            
            try:
                if not os.path.exists(file_path):
                    logger.error(f"File not found: {file_path}")
                    failed_count += 1
                    continue
                
                file_size = os.path.getsize(file_path)
                file_name = os.path.basename(file_path)
                
                # Create backup record
                if db_service.is_available:
                    with db_service.get_session() as session:
                        backup = DriveBackup(
                            drive_file_id='pending',
                            file_name=file_name,
                            description=description,
                            file_size=file_size,
                            local_path=file_path,
                            status=BackupStatus.uploading,
                            backup_type=backup_type,
                            retention_days=retention_days,
                            created_by=created_by
                        )
                        
                        if retention_days:
                            backup.auto_delete_at = datetime.utcnow() + timedelta(days=retention_days)
                        
                        session.add(backup)
                        session.commit()
                        backup_id = backup.id
                
                # Upload to Drive
                result = drive_service.upload_backup(
                    file_path=file_path,
                    description=description
                )
                
                # Update backup record
                if db_service.is_available and backup_id:
                    with db_service.get_session() as session:
                        backup = session.query(DriveBackup).filter_by(id=backup_id).first()
                        if backup:
                            backup.drive_file_id = result['id']
                            backup.status = BackupStatus.completed
                            backup.uploaded_at = datetime.utcnow()
                            backup.web_view_link = result.get('webViewLink')
                            backup.drive_folder_id = drive_service._backup_folder_id
                            session.commit()
                
                uploaded_count += 1
                total_size += file_size
                
                logger.info(f"Uploaded backup: {file_name} ({file_size} bytes)")
                
                # Publish event
                websocket_service.publish_event('google_services', {
                    'type': 'backup_uploaded',
                    'file_name': file_name,
                    'file_size': file_size,
                    'drive_file_id': result['id'],
                    'timestamp': datetime.utcnow().isoformat()
                })
            
            except Exception as e:
                logger.error(f"Error uploading {file_path}: {e}", exc_info=True)
                failed_count += 1
                
                # Update backup record with error
                if db_service.is_available and backup_id:
                    try:
                        with db_service.get_session() as session:
                            backup = session.query(DriveBackup).filter_by(id=backup_id).first()
                            if backup:
                                backup.status = BackupStatus.failed
                                backup.error_message = str(e)
                                session.commit()
                    except Exception as db_error:
                        logger.error(f"Error updating backup status: {db_error}")
        
        result = {
            'uploaded_count': uploaded_count,
            'failed_count': failed_count,
            'total_size': total_size,
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Drive backup complete: {uploaded_count} uploaded, {failed_count} failed")
        return result
    
    except Exception as e:
        logger.error(f"Error during Drive backup: {e}", exc_info=True)
        raise


@celery_app.task(base=GoogleTask, bind=True, name='workers.google_tasks.cleanup_old_backups')
def cleanup_old_backups(self, retention_days: int = 30):
    """
    Clean up old backups from Google Drive
    
    Args:
        retention_days: Number of days to retain backups (default: 30)
    """
    logger.info(f"Starting backup cleanup: retention = {retention_days} days")
    
    try:
        # Cleanup from Drive
        result = drive_service.cleanup_old_backups(retention_days=retention_days)
        
        # Update database records for deleted backups
        if db_service.is_available and result['deleted_count'] > 0:
            try:
                with db_service.get_session() as session:
                    cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
                    
                    old_backups = session.query(DriveBackup).filter(
                        DriveBackup.uploaded_at < cutoff_date,
                        DriveBackup.deleted == False
                    ).all()
                    
                    for backup in old_backups:
                        backup.deleted = True
                    
                    session.commit()
                    logger.info(f"Marked {len(old_backups)} backups as deleted in database")
            except Exception as e:
                logger.error(f"Error updating backup records: {e}")
        
        # Publish event
        websocket_service.publish_event('google_services', {
            'type': 'backups_cleaned',
            'deleted_count': result['deleted_count'],
            'deleted_size': result['deleted_size'],
            'retention_days': retention_days,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        logger.info(f"Cleanup complete: {result['deleted_count']} backups deleted ({result['deleted_size']} bytes)")
        return result
    
    except Exception as e:
        logger.error(f"Error during backup cleanup: {e}", exc_info=True)
        raise


@celery_app.task(base=GoogleTask, bind=True, name='workers.google_tasks.send_deployment_notification')
def send_deployment_notification(
    self,
    to: str,
    service_name: str,
    status: str,
    details: str,
    deployment_url: Optional[str] = None
):
    """
    Send deployment notification email
    
    Args:
        to: Recipient email
        service_name: Name of deployed service
        status: Deployment status (success/failed)
        details: Deployment details
        deployment_url: Optional URL to deployment
    """
    logger.info(f"Sending deployment notification for {service_name}")
    
    try:
        result = gmail_service.send_deployment_notification(
            to=to,
            service_name=service_name,
            status=status,
            details=details,
            deployment_url=deployment_url
        )
        
        logger.info(f"Deployment notification sent to {to}")
        return result
    
    except Exception as e:
        logger.error(f"Error sending deployment notification: {e}", exc_info=True)
        raise


@celery_app.task(base=GoogleTask, bind=True, name='workers.google_tasks.send_error_notification')
def send_error_notification(
    self,
    to: str,
    error_type: str,
    error_message: str,
    stack_trace: Optional[str] = None
):
    """
    Send error notification email
    
    Args:
        to: Recipient email
        error_type: Type of error
        error_message: Error message
        stack_trace: Optional stack trace
    """
    logger.info(f"Sending error notification: {error_type}")
    
    try:
        result = gmail_service.send_error_notification(
            to=to,
            error_type=error_type,
            error_message=error_message,
            stack_trace=stack_trace
        )
        
        logger.info(f"Error notification sent to {to}")
        return result
    
    except Exception as e:
        logger.error(f"Error sending error notification: {e}", exc_info=True)
        raise


# Schedule periodic tasks
@celery_app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    """Setup periodic tasks for Google services"""
    
    # Poll calendar events every 5 minutes
    sender.add_periodic_task(
        300.0,  # 5 minutes
        poll_calendar_events.s(),
        name='poll-calendar-events-every-5min'
    )
    
    # Cleanup old backups daily
    sender.add_periodic_task(
        86400.0,  # 24 hours
        cleanup_old_backups.s(retention_days=30),
        name='cleanup-old-backups-daily'
    )
    
    logger.info("Google services periodic tasks configured")
