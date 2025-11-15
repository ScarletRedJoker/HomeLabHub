from flask import Blueprint, jsonify, render_template, request
from utils.auth import require_auth
from models import get_session
from models.celery_job_history import CeleryJobHistory, JobStatus
from datetime import datetime, timedelta
from sqlalchemy import func, desc, Integer
import logging

logger = logging.getLogger(__name__)

celery_analytics_bp = Blueprint('celery_analytics', __name__)

@celery_analytics_bp.route('/celery/analytics')
@require_auth
def celery_analytics_page():
    """Render Celery analytics dashboard"""
    return render_template('celery_analytics.html')

@celery_analytics_bp.route('/api/celery/analytics')
@require_auth
def get_celery_analytics():
    """Get comprehensive Celery job analytics"""
    try:
        hours = int(request.args.get('hours', 24))
        session = get_session()
        
        try:
            cutoff = datetime.utcnow() - timedelta(hours=hours)
            
            total_jobs = session.query(func.count(CeleryJobHistory.id)).filter(
                CeleryJobHistory.created_at >= cutoff
            ).scalar() or 0
            
            successful_jobs = session.query(func.count(CeleryJobHistory.id)).filter(
                CeleryJobHistory.created_at >= cutoff,
                CeleryJobHistory.status == JobStatus.SUCCESS
            ).scalar() or 0
            
            failed_jobs = session.query(func.count(CeleryJobHistory.id)).filter(
                CeleryJobHistory.created_at >= cutoff,
                CeleryJobHistory.status == JobStatus.FAILURE
            ).scalar() or 0
            
            retry_jobs = session.query(func.count(CeleryJobHistory.id)).filter(
                CeleryJobHistory.created_at >= cutoff,
                CeleryJobHistory.status == JobStatus.RETRY
            ).scalar() or 0
            
            dead_letter_jobs = session.query(func.count(CeleryJobHistory.id)).filter(
                CeleryJobHistory.is_dead_letter == 1
            ).scalar() or 0
            
            success_rate = (successful_jobs / total_jobs * 100) if total_jobs > 0 else 100.0
            
            avg_execution_time = session.query(func.avg(CeleryJobHistory.execution_time)).filter(
                CeleryJobHistory.created_at >= cutoff,
                CeleryJobHistory.status == JobStatus.SUCCESS,
                CeleryJobHistory.execution_time.isnot(None)
            ).scalar() or 0.0
            
            hourly_stats = session.query(
                func.date_trunc('hour', CeleryJobHistory.created_at).label('hour'),
                func.count(CeleryJobHistory.id).label('total'),
                func.sum(func.cast(CeleryJobHistory.status == JobStatus.SUCCESS, Integer)).label('success'),
                func.sum(func.cast(CeleryJobHistory.status == JobStatus.FAILURE, Integer)).label('failure'),
                func.avg(CeleryJobHistory.execution_time).label('avg_execution_time')
            ).filter(
                CeleryJobHistory.created_at >= cutoff
            ).group_by(
                func.date_trunc('hour', CeleryJobHistory.created_at)
            ).order_by(
                func.date_trunc('hour', CeleryJobHistory.created_at)
            ).all()
            
            task_stats = session.query(
                CeleryJobHistory.task_name,
                func.count(CeleryJobHistory.id).label('total'),
                func.sum(func.cast(CeleryJobHistory.status == JobStatus.SUCCESS, Integer)).label('success'),
                func.sum(func.cast(CeleryJobHistory.status == JobStatus.FAILURE, Integer)).label('failure'),
                func.avg(CeleryJobHistory.execution_time).label('avg_time')
            ).filter(
                CeleryJobHistory.created_at >= cutoff
            ).group_by(
                CeleryJobHistory.task_name
            ).order_by(
                func.count(CeleryJobHistory.id).desc()
            ).limit(10).all()
            
            most_failing = session.query(
                CeleryJobHistory.task_name,
                func.count(CeleryJobHistory.id).label('total'),
                func.sum(func.cast(CeleryJobHistory.status == JobStatus.FAILURE, Integer)).label('failures')
            ).filter(
                CeleryJobHistory.created_at >= cutoff,
                CeleryJobHistory.status == JobStatus.FAILURE
            ).group_by(
                CeleryJobHistory.task_name
            ).order_by(
                func.sum(func.cast(CeleryJobHistory.status == JobStatus.FAILURE, Integer)).desc()
            ).limit(10).all()
            
            recent_failures = session.query(CeleryJobHistory).filter(
                CeleryJobHistory.status == JobStatus.FAILURE
            ).order_by(
                desc(CeleryJobHistory.created_at)
            ).limit(20).all()
            
            dead_letter_tasks = session.query(CeleryJobHistory).filter(
                CeleryJobHistory.is_dead_letter == 1
            ).order_by(
                desc(CeleryJobHistory.created_at)
            ).limit(20).all()
            
            return jsonify({
                'success': True,
                'data': {
                    'summary': {
                        'total_jobs': total_jobs,
                        'successful_jobs': successful_jobs,
                        'failed_jobs': failed_jobs,
                        'retry_jobs': retry_jobs,
                        'dead_letter_jobs': dead_letter_jobs,
                        'success_rate': round(success_rate, 2),
                        'avg_execution_time': round(avg_execution_time, 2)
                    },
                    'hourly_stats': [
                        {
                            'hour': stat.hour.isoformat(),
                            'total': stat.total,
                            'success': stat.success or 0,
                            'failure': stat.failure or 0,
                            'avg_execution_time': round(stat.avg_execution_time or 0, 2)
                        }
                        for stat in hourly_stats
                    ],
                    'task_stats': [
                        {
                            'task_name': stat.task_name,
                            'total': stat.total,
                            'success': stat.success or 0,
                            'failure': stat.failure or 0,
                            'avg_time': round(stat.avg_time or 0, 2)
                        }
                        for stat in task_stats
                    ],
                    'most_failing': [
                        {
                            'task_name': stat.task_name,
                            'total': stat.total,
                            'failures': stat.failures or 0
                        }
                        for stat in most_failing
                    ],
                    'recent_failures': [job.to_dict() for job in recent_failures],
                    'dead_letter_queue': [job.to_dict() for job in dead_letter_tasks]
                }
            })
            
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Failed to get Celery analytics: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@celery_analytics_bp.route('/api/celery/queue/stats')
@require_auth
def get_queue_stats():
    """Get real-time queue statistics"""
    try:
        from celery_app import get_queue_lengths, get_active_tasks, celery_app
        import redis
        from config import Config
        
        queue_lengths = get_queue_lengths()
        active_tasks = get_active_tasks()
        
        total_pending = sum(queue_lengths.values())
        total_active = sum(len(tasks) for tasks in active_tasks.values())
        
        inspect = celery_app.control.inspect(timeout=2.0)
        reserved = inspect.reserved()
        
        total_reserved = 0
        if reserved:
            total_reserved = sum(len(tasks) for tasks in reserved.values())
        
        worker_count = len(active_tasks) if active_tasks else 0
        
        redis_client = redis.Redis.from_url(Config.CELERY_BROKER_URL)
        failed_count = redis_client.llen('celery_failed') if redis_client else 0
        
        return jsonify({
            'success': True,
            'data': {
                'queue_lengths': queue_lengths,
                'total_pending': total_pending,
                'total_active': total_active,
                'total_reserved': total_reserved,
                'total_failed': failed_count,
                'worker_count': worker_count,
                'alert': total_pending > 100,
                'alert_message': f'Queue backlog: {total_pending} pending jobs' if total_pending > 100 else None
            }
        })
        
    except Exception as e:
        logger.error(f"Failed to get queue stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
