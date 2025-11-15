from celery import Celery, signals
from config import Config
import logging
import redis
from datetime import datetime
from functools import wraps
import traceback as tb
import time

logger = logging.getLogger(__name__)

celery_app = Celery(
    'jarvis_workflow_engine',
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND,
    include=['workers.workflow_worker', 'workers.analysis_worker', 'workers.google_tasks', 'workers.autonomous_worker']
)

def save_job_history(task_id, task_name, status, **kwargs):
    """Save job execution history to database"""
    try:
        from models import get_session
        from models.celery_job_history import CeleryJobHistory, JobStatus
        
        session = get_session()
        try:
            job = session.query(CeleryJobHistory).filter_by(task_id=task_id).first()
            
            if not job:
                job = CeleryJobHistory(
                    task_id=task_id,
                    task_name=task_name,
                    status=status,
                    queue=kwargs.get('queue'),
                    worker=kwargs.get('worker'),
                    args=kwargs.get('args'),
                    kwargs=kwargs.get('kwargs_data')
                )
                session.add(job)
            else:
                job.status = status
                for key, value in kwargs.items():
                    if hasattr(job, key) and value is not None:
                        setattr(job, key, value)
            
            session.commit()
        finally:
            session.close()
    except Exception as e:
        logger.error(f"Failed to save job history: {e}", extra={
            'component': 'celery_history',
            'task_id': task_id,
            'error': str(e)
        })

def move_to_dead_letter(task_id, task_name, reason, error_message=None):
    """Move permanently failed task to dead letter queue"""
    try:
        from models import get_session
        from models.celery_job_history import CeleryJobHistory, JobStatus
        
        session = get_session()
        try:
            job = session.query(CeleryJobHistory).filter_by(task_id=task_id).first()
            if job:
                job.is_dead_letter = 1
                job.dead_letter_reason = reason
                job.status = JobStatus.FAILURE
                if error_message:
                    job.error_message = error_message
                session.commit()
                
                logger.error(f"Task moved to dead letter queue: {task_name}", extra={
                    'component': 'celery_dlq',
                    'task_id': task_id,
                    'task_name': task_name,
                    'reason': reason
                })
        finally:
            session.close()
    except Exception as e:
        logger.error(f"Failed to move task to dead letter queue: {e}", extra={
            'component': 'celery_dlq',
            'task_id': task_id,
            'error': str(e)
        })

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

def get_queue_lengths():
    """Get queue lengths for all queues"""
    try:
        redis_client = redis.Redis.from_url(Config.CELERY_BROKER_URL)
        queue_lengths = {}
        
        queues = ['default', 'deployments', 'dns', 'analysis', 'google']
        for queue_name in queues:
            queue_lengths[queue_name] = redis_client.llen(queue_name)
        
        return queue_lengths
    except Exception as e:
        logger.error(f"Failed to get queue lengths: {e}")
        return {}

def get_active_tasks():
    """Get list of currently active tasks"""
    try:
        inspect = celery_app.control.inspect(timeout=2.0)
        active = inspect.active()
        if active:
            return active
        return {}
    except Exception as e:
        logger.error(f"Failed to get active tasks: {e}")
        return {}

celery_app.conf.update(
    task_serializer=Config.CELERY_TASK_SERIALIZER,
    result_serializer=Config.CELERY_RESULT_SERIALIZER,
    accept_content=Config.CELERY_ACCEPT_CONTENT,
    timezone=Config.CELERY_TIMEZONE,
    enable_utc=Config.CELERY_ENABLE_UTC,
    task_track_started=Config.CELERY_TASK_TRACK_STARTED,
    task_time_limit=5 * 60,
    task_soft_time_limit=4 * 60 + 30,
    worker_prefetch_multiplier=4,
    worker_max_tasks_per_child=1000,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_default_retry_delay=60,
    task_max_retries=3,
    task_retry_backoff=True,
    task_retry_backoff_max=600,
    task_retry_jitter=True,
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
        'autonomous.run_diagnostics': {'queue': 'autonomous'},
        'autonomous.run_remediation': {'queue': 'autonomous'},
        'autonomous.run_proactive_maintenance': {'queue': 'autonomous'},
        'autonomous.execute_single_action': {'queue': 'autonomous'},
    },
    task_default_queue='default',
    task_default_exchange='tasks',
    task_default_routing_key='task.default',
    beat_schedule={
        'autonomous-tier1-diagnostics': {
            'task': 'autonomous.run_diagnostics',
            'schedule': 300.0,
            'options': {'queue': 'autonomous'}
        },
        'autonomous-tier2-remediation': {
            'task': 'autonomous.run_remediation',
            'schedule': 900.0,
            'options': {'queue': 'autonomous'}
        },
        'autonomous-tier3-proactive': {
            'task': 'autonomous.run_proactive_maintenance',
            'schedule': 86400.0,
            'options': {'queue': 'autonomous'}
        },
    },
)

@signals.task_prerun.connect
def task_prerun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, **extra):
    """Handle task start - record in history"""
    from models.celery_job_history import JobStatus
    
    logger.info(f"Task starting: {task.name}", extra={
        'component': 'celery',
        'event': 'task_prerun',
        'task_id': task_id,
        'task_name': task.name
    })
    
    queue = task.request.delivery_info.get('routing_key', 'default') if hasattr(task, 'request') else 'default'
    worker = task.request.hostname if hasattr(task, 'request') else None
    
    save_job_history(
        task_id=task_id,
        task_name=task.name,
        status=JobStatus.STARTED,
        queue=queue,
        worker=worker,
        args=args,
        kwargs_data=kwargs,
        started_at=datetime.utcnow()
    )

@signals.task_postrun.connect
def task_postrun_handler(sender=None, task_id=None, task=None, args=None, kwargs=None, retval=None, state=None, **extra):
    """Handle task completion"""
    from models.celery_job_history import JobStatus
    from models import get_session
    from models.celery_job_history import CeleryJobHistory
    
    logger.info(f"Task completed: {task.name}", extra={
        'component': 'celery',
        'event': 'task_postrun',
        'task_id': task_id,
        'task_name': task.name,
        'state': state
    })
    
    try:
        session = get_session()
        try:
            job = session.query(CeleryJobHistory).filter_by(task_id=task_id).first()
            if job and job.started_at:
                execution_time = (datetime.utcnow() - job.started_at).total_seconds()
            else:
                execution_time = None
        finally:
            session.close()
    except Exception as e:
        logger.error(f"Failed to calculate execution time: {e}")
        execution_time = None
    
    save_job_history(
        task_id=task_id,
        task_name=task.name,
        status=JobStatus.SUCCESS if state == 'SUCCESS' else JobStatus.FAILURE,
        result=retval,
        completed_at=datetime.utcnow(),
        execution_time=execution_time
    )

@signals.task_failure.connect
def task_failure_handler(sender=None, task_id=None, exception=None, args=None, kwargs=None, traceback=None, einfo=None, **extra):
    """Handle task failure - check if max retries exceeded"""
    from models.celery_job_history import JobStatus
    from models import get_session
    from models.celery_job_history import CeleryJobHistory
    
    logger.error(f"Task failed: {sender.name} - {exception}", extra={
        'component': 'celery',
        'event': 'task_failure',
        'task_id': task_id,
        'task_name': sender.name,
        'error': str(exception)
    }, exc_info=einfo)
    
    try:
        session = get_session()
        try:
            job = session.query(CeleryJobHistory).filter_by(task_id=task_id).first()
            if job:
                if job.started_at:
                    execution_time = (datetime.utcnow() - job.started_at).total_seconds()
                else:
                    execution_time = None
                
                if job.retry_count >= job.max_retries:
                    move_to_dead_letter(
                        task_id=task_id,
                        task_name=sender.name,
                        reason=f"Max retries ({job.max_retries}) exceeded",
                        error_message=str(exception)
                    )
        finally:
            session.close()
    except Exception as e:
        logger.error(f"Failed to process task failure: {e}")
        execution_time = None
    
    save_job_history(
        task_id=task_id,
        task_name=sender.name,
        status=JobStatus.FAILURE,
        error_message=str(exception),
        traceback=str(einfo) if einfo else None,
        completed_at=datetime.utcnow(),
        execution_time=execution_time
    )

@signals.task_retry.connect
def task_retry_handler(sender=None, task_id=None, reason=None, einfo=None, **extra):
    """Handle task retry - increment retry count"""
    from models.celery_job_history import JobStatus
    from models import get_session
    from models.celery_job_history import CeleryJobHistory
    
    logger.warning(f"Task retrying: {sender.name} - {reason}", extra={
        'component': 'celery',
        'event': 'task_retry',
        'task_id': task_id,
        'task_name': sender.name,
        'reason': str(reason)
    })
    
    try:
        session = get_session()
        try:
            job = session.query(CeleryJobHistory).filter_by(task_id=task_id).first()
            if job:
                job.retry_count += 1
                job.status = JobStatus.RETRY
                job.error_message = str(reason)
                session.commit()
                
                logger.info(f"Task {task_id} retry count: {job.retry_count}/{job.max_retries}", extra={
                    'component': 'celery',
                    'task_id': task_id,
                    'retry_count': job.retry_count,
                    'max_retries': job.max_retries
                })
        finally:
            session.close()
    except Exception as e:
        logger.error(f"Failed to update retry count: {e}")

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

__all__ = ['celery_app', 'check_redis_health', 'check_worker_health', 'get_queue_lengths', 'get_active_tasks', 'save_job_history', 'move_to_dead_letter']
