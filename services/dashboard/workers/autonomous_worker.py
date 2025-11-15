"""Autonomous worker for Jarvis - Scheduled autonomous actions

This worker runs scheduled autonomous tasks using Celery Beat:
- Tier 1 diagnostics every 5 minutes
- Tier 2 remediation every 15 minutes (conditional)
- Tier 3 proactive maintenance daily
"""

from celery import Task
from celery_app import celery_app
import logging
from datetime import datetime
from typing import Dict, List

logger = logging.getLogger(__name__)


class AutonomousTask(Task):
    """Base task for autonomous actions with error handling"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 2}
    retry_backoff = True


@celery_app.task(base=AutonomousTask, name='autonomous.run_diagnostics')
def run_tier1_diagnostics() -> Dict:
    """Run Tier 1 diagnostic actions (every 5 minutes)
    
    Returns:
        Dictionary with diagnostics results
    """
    try:
        from jarvis.autonomous_agent import AutonomousAgent
        
        logger.info("🔍 Starting Tier 1 diagnostics...")
        
        agent = AutonomousAgent()
        results = agent.run_diagnostics(dry_run=False)
        
        successful = sum(1 for r in results if r.success)
        failed = sum(1 for r in results if not r.success)
        
        logger.info(
            f"✅ Tier 1 diagnostics completed: "
            f"{successful} successful, {failed} failed, "
            f"total={len(results)}"
        )
        
        return {
            'tier': 1,
            'total_actions': len(results),
            'successful': successful,
            'failed': failed,
            'timestamp': datetime.utcnow().isoformat(),
            'results': [r.to_dict() for r in results]
        }
        
    except Exception as e:
        logger.error(f"❌ Error in Tier 1 diagnostics: {e}", exc_info=True)
        raise


@celery_app.task(base=AutonomousTask, name='autonomous.run_remediation')
def run_tier2_remediation() -> Dict:
    """Run Tier 2 remediation actions (every 15 minutes, conditional)
    
    Returns:
        Dictionary with remediation results
    """
    try:
        from jarvis.autonomous_agent import AutonomousAgent
        
        logger.info("🔧 Starting Tier 2 remediation...")
        
        agent = AutonomousAgent()
        results = agent.run_remediation(dry_run=False)
        
        successful = sum(1 for r in results if r.success)
        failed = sum(1 for r in results if not r.success)
        
        logger.info(
            f"✅ Tier 2 remediation completed: "
            f"{successful} successful, {failed} failed, "
            f"total={len(results)}"
        )
        
        return {
            'tier': 2,
            'total_actions': len(results),
            'successful': successful,
            'failed': failed,
            'timestamp': datetime.utcnow().isoformat(),
            'results': [r.to_dict() for r in results]
        }
        
    except Exception as e:
        logger.error(f"❌ Error in Tier 2 remediation: {e}", exc_info=True)
        raise


@celery_app.task(base=AutonomousTask, name='autonomous.run_proactive_maintenance')
def run_tier3_proactive() -> Dict:
    """Run Tier 3 proactive maintenance (daily at 2 AM)
    
    Returns:
        Dictionary with proactive maintenance results
    """
    try:
        from jarvis.autonomous_agent import AutonomousAgent
        
        logger.info("🚀 Starting Tier 3 proactive maintenance...")
        
        agent = AutonomousAgent()
        results = agent.run_proactive_maintenance(dry_run=False)
        
        successful = sum(1 for r in results if r.success)
        failed = sum(1 for r in results if not r.success)
        
        logger.info(
            f"✅ Tier 3 proactive maintenance completed: "
            f"{successful} successful, {failed} failed, "
            f"total={len(results)}"
        )
        
        return {
            'tier': 3,
            'total_actions': len(results),
            'successful': successful,
            'failed': failed,
            'timestamp': datetime.utcnow().isoformat(),
            'results': [r.to_dict() for r in results]
        }
        
    except Exception as e:
        logger.error(f"❌ Error in Tier 3 proactive maintenance: {e}", exc_info=True)
        raise


@celery_app.task(base=AutonomousTask, name='autonomous.execute_single_action')
def execute_autonomous_action(action_name: str, dry_run: bool = False) -> Dict:
    """Execute a single autonomous action on demand
    
    Args:
        action_name: Name of the action to execute
        dry_run: If True, only validate without executing
        
    Returns:
        Dictionary with execution result
    """
    try:
        from jarvis.autonomous_agent import AutonomousAgent
        
        logger.info(f"⚡ Executing autonomous action: {action_name} (dry_run={dry_run})")
        
        agent = AutonomousAgent()
        result = agent.execute_action(action_name, dry_run=dry_run)
        
        if result.success:
            logger.info(f"✅ Action {action_name} completed successfully")
        else:
            logger.warning(f"⚠️ Action {action_name} failed: {result.error}")
        
        return result.to_dict()
        
    except Exception as e:
        logger.error(f"❌ Error executing {action_name}: {e}", exc_info=True)
        raise


@celery_app.task(name='autonomous.get_metrics')
def get_autonomous_metrics() -> Dict:
    """Get autonomous execution metrics
    
    Returns:
        Dictionary with metrics
    """
    try:
        from jarvis.autonomous_agent import AutonomousAgent
        
        agent = AutonomousAgent()
        metrics = agent.get_metrics()
        
        logger.info(f"📊 Autonomous metrics retrieved: success_rate={metrics.get('success_rate')}%")
        
        return metrics
        
    except Exception as e:
        logger.error(f"❌ Error getting autonomous metrics: {e}", exc_info=True)
        return {'error': str(e)}
