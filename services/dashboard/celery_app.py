from celery import Celery, signals
from celery.schedules import crontab
from config import Config
import logging
import redis
from datetime import datetime
from functools import wraps

logger = logging.getLogger(__name__)

celery_app = Celery(
    'jarvis_workflow_engine',
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
    include=['workers.workflow_worker', 'workers.analysis_worker', 'workers.google_tasks', 'workers.plex_worker', 'workers.service_ops_worker', 'workers.storage_worker', 'workers.gaming_worker', 'workers.db_admin_worker', 'workers.nas_worker', 'workers.celery_tasks']
)

def check_redis_health():
    try:
        redis_client = redis.Redis.from_url(Config.CELERY_BROKER_URL)
        redis_client.ping()
        return True, None
    except Exception as e:
        logger.error(f"Redis health check failed: {e}", extra={
            'component': 'celery',
            'check_type': 'redis_health',
            'error': str(e)
        })
        return False, str(e)

def check_worker_health():
    try:
        inspect = celery_app.control.inspect(timeout=2.0)
        active_workers = inspect.active()
        
        if active_workers is None or len(active_workers) == 0:
            logger.warning("No Celery workers responding", extra={
                'component': 'celery',
                'check_type': 'worker_health'
            })
            return False, "No active workers"
        
        worker_count = len(active_workers)
        logger.info(f"Celery workers healthy: {worker_count} active", extra={
            'component': 'celery',
            'check_type': 'worker_health',
            'worker_count': worker_count,
            'workers': list(active_workers.keys())
        })
        return True, None
    except Exception as e:
        logger.error(f"Worker health check failed: {e}", extra={
            'component': 'celery',
            'check_type': 'worker_health',
            'error': str(e)
        })
        return False, str(e)

celery_app.conf.update(
    task_serializer=Config.CELERY_TASK_SERIALIZER,
    result_serializer=Config.CELERY_RESULT_SERIALIZER,
    accept_content=Config.CELERY_ACCEPT_CONTENT,
    timezone=Config.CELERY_TIMEZONE,
    enable_utc=Config.CELERY_ENABLE_UTC,
    task_track_started=Config.CELERY_TASK_TRACK_STARTED,
    task_time_limit=Config.CELERY_TASK_TIME_LIMIT,
    task_soft_time_limit=Config.CELERY_TASK_SOFT_TIME_LIMIT,
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    broker_connection_retry_on_startup=True,
    task_routes={
        'workers.workflow_worker.run_deployment_workflow': {'queue': 'deployments'},
        'workers.workflow_worker.run_dns_update_workflow': {'queue': 'dns'},
        'workers.workflow_worker.run_artifact_analysis_workflow': {'queue': 'analysis'},
        'workers.analysis_worker.analyze_artifact_task': {'queue': 'analysis'},
        'workers.analysis_worker.analyze_preview_task': {'queue': 'analysis'},
        'workers.google_tasks.poll_calendar_events': {'queue': 'google'},
        'workers.google_tasks.send_email_task': {'queue': 'google'},
        'workers.google_tasks.backup_to_drive_task': {'queue': 'google'},
        'workers.google_tasks.cleanup_old_backups': {'queue': 'google'},
        'workers.plex_worker.process_import_job': {'queue': 'plex'},
        'workers.plex_worker.move_file_to_plex': {'queue': 'plex'},
        'workers.plex_worker.trigger_plex_scan': {'queue': 'plex'},
        'workers.plex_worker.cleanup_old_imports': {'queue': 'plex'},
        'workers.plex_worker.batch_import': {'queue': 'plex'},
        'workers.service_ops_worker.collect_telemetry': {'queue': 'service_ops'},
        'workers.service_ops_worker.restart_service_async': {'queue': 'service_ops'},
        'workers.service_ops_worker.health_check_all': {'queue': 'service_ops'},
        'workers.service_ops_worker.cleanup_old_telemetry': {'queue': 'service_ops'},
        'workers.storage_worker.collect_storage_metrics': {'queue': 'storage'},
        'workers.storage_worker.scan_plex_directories': {'queue': 'storage'},
        'workers.storage_worker.check_database_sizes': {'queue': 'storage'},
        'workers.storage_worker.check_alert_thresholds': {'queue': 'storage'},
        'workers.storage_worker.cleanup_old_metrics': {'queue': 'storage'},
        'workers.gaming_worker.discover_sunshine_hosts': {'queue': 'gaming'},
        'workers.gaming_worker.check_sunshine_health': {'queue': 'gaming'},
        'workers.gaming_worker.monitor_active_sessions': {'queue': 'gaming'},
        'workers.gaming_worker.cleanup_stale_sessions': {'queue': 'gaming'},
        'workers.gaming_worker.refresh_host_applications': {'queue': 'gaming'},
        'workers.db_admin_worker.backup_database_async': {'queue': 'db_admin'},
        'workers.db_admin_worker.restore_database_async': {'queue': 'db_admin'},
        'workers.db_admin_worker.test_connection_async': {'queue': 'db_admin'},
        'workers.db_admin_worker.scheduled_backups': {'queue': 'db_admin'},
        'workers.db_admin_worker.cleanup_old_backups': {'queue': 'db_admin'},
        'workers.db_admin_worker.test_all_connections': {'queue': 'db_admin'},
        'workers.db_admin_worker.discover_and_add_databases': {'queue': 'db_admin'},
        'workers.nas_worker.run_nas_backup': {'queue': 'nas'},
        'workers.nas_worker.discover_nas_periodic': {'queue': 'nas'},
        'workers.nas_worker.check_mount_health': {'queue': 'nas'},
        'autonomous.health_check': {'queue': 'autonomous'},
        'autonomous.monitoring': {'queue': 'autonomous'},
        'autonomous.optimization': {'queue': 'autonomous'},
        'autonomous.security_scan': {'queue': 'autonomous'},
        'autonomous.efficiency_report': {'queue': 'autonomous'},
        'autonomous.security_summary': {'queue': 'autonomous'},
    },
    task_default_queue='default',
    task_default_exchange='tasks',
    task_default_routing_key='task.default',
    beat_schedule={
        'health-check-every-2-minutes': {
            'task': 'autonomous.health_check',
            'schedule': 120.0,
        },
        'monitoring-every-5-minutes': {
            'task': 'autonomous.monitoring',
            'schedule': 300.0,
        },
        'optimization-every-30-minutes': {
            'task': 'autonomous.optimization',
            'schedule': 1800.0,
        },
        'security-scan-every-hour': {
            'task': 'autonomous.security_scan',
            'schedule': 3600.0,
        },
        'efficiency-report-daily': {
            'task': 'autonomous.efficiency_report',
            'schedule': crontab(hour=2, minute=0),
        },
        'security-summary-daily': {
            'task': 'autonomous.security_summary',
            'schedule': crontab(hour=3, minute=0),
        },
    },
)

@signals.task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **extra):
    logger.info(f"Task starting: {task.name}", extra={
        'component': 'celery',
        'event': 'task_prerun',
        'task_id': task_id,
        'task_name': task.name
    })

@signals.task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, retval=None, state=None, **extra):
    logger.info(f"Task completed: {task.name}", extra={
        'component': 'celery',
        'event': 'task_postrun',
        'task_id': task_id,
        'task_name': task.name,
        'state': state
    })

@signals.task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, args=None, kwargs=None, traceback=None, einfo=None, **extra):
    logger.error(f"Task failed: {sender.name} - {exception}", extra={
        'component': 'celery',
        'event': 'task_failure',
        'task_id': task_id,
        'task_name': sender.name,
        'error': str(exception)
    }, exc_info=einfo)

@signals.task_retry.connect
def task_retry_handler(sender=None, task_id=None, reason=None, einfo=None, **extra):
    logger.warning(f"Task retrying: {sender.name} - {reason}", extra={
        'component': 'celery',
        'event': 'task_retry',
        'task_id': task_id,
        'task_name': sender.name,
        'reason': str(reason)
    })

@signals.worker_ready.connect
def worker_ready_handler(sender=None, **extra):
    logger.info("Celery worker ready", extra={
        'component': 'celery',
        'event': 'worker_ready',
        'hostname': sender.hostname if hasattr(sender, 'hostname') else 'unknown'
    })

@signals.worker_shutdown.connect
def worker_shutdown_handler(sender=None, **extra):
    logger.info("Celery worker shutting down", extra={
        'component': 'celery',
        'event': 'worker_shutdown',
        'hostname': sender.hostname if hasattr(sender, 'hostname') else 'unknown'
    })

logger.info("Celery app initialized with broker: %s", Config.CELERY_BROKER_URL)

__all__ = ['celery_app', 'check_redis_health', 'check_worker_health']
