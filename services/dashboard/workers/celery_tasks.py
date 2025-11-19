"""Celery Periodic Tasks for Autonomous Operations"""
from celery import shared_task
from celery.schedules import crontab
import logging

from services.dashboard.services.autonomous_monitor import AutonomousMonitor
from services.dashboard.services.continuous_optimizer import ContinuousOptimizer
from services.dashboard.services.autonomous_security import AutonomousSecurity

logger = logging.getLogger(__name__)


# Initialize autonomous services
autonomous_monitor = AutonomousMonitor()
continuous_optimizer = ContinuousOptimizer()
autonomous_security = AutonomousSecurity()


@shared_task(name='autonomous.health_check')
def autonomous_health_check():
    """
    Quick health check - runs every 2 minutes
    Checks critical systems and creates immediate alerts
    """
    logger.info("Running autonomous health check...")
    
    try:
        summary = autonomous_monitor.get_system_summary()
        logger.info(f"System summary: {summary}")
        return {
            'success': True,
            'summary': summary
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.monitoring')
def autonomous_monitoring_task():
    """
    Comprehensive monitoring - runs every 5 minutes
    Performs deep health checks and creates repair tasks
    """
    logger.info("Running autonomous monitoring task...")
    
    try:
        results = autonomous_monitor.run_health_check()
        
        issues_count = len(results.get('issues_detected', []))
        tasks_count = len(results.get('tasks_created', []))
        
        logger.info(f"Monitoring complete. Issues: {issues_count}, Tasks created: {tasks_count}")
        
        return {
            'success': True,
            'issues_detected': issues_count,
            'tasks_created': tasks_count,
            'timestamp': results.get('timestamp')
        }
    except Exception as e:
        logger.error(f"Autonomous monitoring failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.optimization')
def autonomous_optimization_task():
    """
    Performance optimization - runs every 30 minutes
    Analyzes system performance and suggests improvements
    """
    logger.info("Running autonomous optimization task...")
    
    try:
        results = continuous_optimizer.run_optimization_analysis()
        
        recommendations_count = len(results.get('recommendations', []))
        
        logger.info(f"Optimization analysis complete. Recommendations: {recommendations_count}")
        
        return {
            'success': True,
            'recommendations': recommendations_count,
            'efficiency_score': results.get('resource_optimization', {}).get('efficiency_score', 0),
            'timestamp': results.get('timestamp')
        }
    except Exception as e:
        logger.error(f"Autonomous optimization failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.security_scan')
def autonomous_security_scan_task():
    """
    Security scanning - runs every hour
    Scans for vulnerabilities and security issues
    """
    logger.info("Running autonomous security scan...")
    
    try:
        results = autonomous_security.run_security_scan()
        
        security_issues = len(results.get('security_issues', []))
        
        logger.info(f"Security scan complete. Issues: {security_issues}")
        
        return {
            'success': True,
            'security_issues': security_issues,
            'timestamp': results.get('timestamp')
        }
    except Exception as e:
        logger.error(f"Autonomous security scan failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.efficiency_report')
def autonomous_efficiency_report():
    """
    Generate efficiency trends report - runs daily
    Analyzes performance trends over time
    """
    logger.info("Generating efficiency trends report...")
    
    try:
        trends = continuous_optimizer.get_efficiency_trends()
        
        logger.info(f"Efficiency trends: {trends}")
        
        return {
            'success': True,
            'trends': trends
        }
    except Exception as e:
        logger.error(f"Efficiency report failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='autonomous.security_summary')
def autonomous_security_summary():
    """
    Generate security summary - runs daily
    Provides overview of security posture
    """
    logger.info("Generating security summary...")
    
    try:
        summary = autonomous_security.get_security_summary()
        
        logger.info(f"Security summary: {summary}")
        
        return {
            'success': True,
            'summary': summary
        }
    except Exception as e:
        logger.error(f"Security summary failed: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e)
        }


# Celery Beat schedule configuration
# Add this to your celery_app configuration
AUTONOMOUS_BEAT_SCHEDULE = {
    'health-check-every-2-minutes': {
        'task': 'autonomous.health_check',
        'schedule': 120.0,  # Every 2 minutes
    },
    'monitoring-every-5-minutes': {
        'task': 'autonomous.monitoring',
        'schedule': 300.0,  # Every 5 minutes
    },
    'optimization-every-30-minutes': {
        'task': 'autonomous.optimization',
        'schedule': 1800.0,  # Every 30 minutes
    },
    'security-scan-every-hour': {
        'task': 'autonomous.security_scan',
        'schedule': 3600.0,  # Every hour
    },
    'efficiency-report-daily': {
        'task': 'autonomous.efficiency_report',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM
    },
    'security-summary-daily': {
        'task': 'autonomous.security_summary',
        'schedule': crontab(hour=3, minute=0),  # Daily at 3 AM
    },
}


__all__ = [
    'autonomous_health_check',
    'autonomous_monitoring_task',
    'autonomous_optimization_task',
    'autonomous_security_scan_task',
    'autonomous_efficiency_report',
    'autonomous_security_summary',
    'AUTONOMOUS_BEAT_SCHEDULE'
]
