"""API endpoints for Jarvis Autonomous Operations Dashboard

This module provides REST API endpoints for the autonomous operations dashboard,
displaying real-time autonomous actions, metrics, and interventions.
"""

from flask import Blueprint, jsonify, request, render_template
from datetime import datetime, timedelta
import logging
from typing import Optional

from models import JarvisAction, ActionStatus, get_session
from services.db_service import db_service
from utils.auth import require_auth
from jarvis.autonomous_agent import AutonomousAgent
from jarvis.policy_engine import PolicyEngine
from workers.autonomous_worker import (
    run_tier1_diagnostics,
    run_tier2_remediation,
    run_tier3_proactive,
    execute_autonomous_action
)

logger = logging.getLogger(__name__)

autonomous_bp = Blueprint('autonomous', __name__, url_prefix='/jarvis/autonomous')

agent = AutonomousAgent()
policy_engine = PolicyEngine()


@autonomous_bp.route('/', methods=['GET'])
@require_auth
def autonomous_dashboard():
    """Render the autonomous operations dashboard"""
    return render_template('jarvis_autonomous.html')


@autonomous_bp.route('/api/feed', methods=['GET'])
@require_auth
def get_action_feed():
    """Get real-time feed of autonomous actions
    
    Query params:
        - limit: Max number of results (default: 50)
        - offset: Offset for pagination (default: 0)
        - tier: Filter by tier (1, 2, or 3)
        - hours: Filter by last N hours (default: 24)
    """
    try:
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        tier = request.args.get('tier', type=int)
        hours = int(request.args.get('hours', 24))
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            cutoff_time = datetime.utcnow() - timedelta(hours=hours)
            
            query = session.query(JarvisAction).filter(
                JarvisAction.created_at >= cutoff_time
            )
            
            if tier:
                query = query.filter(JarvisAction.action_metadata['tier'].astext == str(tier))
            
            query = query.filter(
                JarvisAction.action_metadata['autonomous'].astext == 'true'
            )
            
            query = query.order_by(JarvisAction.created_at.desc())
            
            total_count = query.count()
            actions = query.offset(offset).limit(limit).all()
            
            return jsonify({
                'success': True,
                'data': {
                    'actions': [action.to_dict() for action in actions],
                    'total': total_count,
                    'limit': limit,
                    'offset': offset
                }
            })
            
    except Exception as e:
        logger.error(f"Error fetching autonomous action feed: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/stats', methods=['GET'])
@require_auth
def get_autonomous_stats():
    """Get statistics about autonomous operations"""
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            hours_24_ago = datetime.utcnow() - timedelta(hours=24)
            
            total_autonomous = session.query(JarvisAction).filter(
                JarvisAction.created_at >= hours_24_ago,
                JarvisAction.action_metadata['autonomous'].astext == 'true'
            ).count()
            
            successful = session.query(JarvisAction).filter(
                JarvisAction.created_at >= hours_24_ago,
                JarvisAction.action_metadata['autonomous'].astext == 'true',
                JarvisAction.status == ActionStatus.EXECUTED
            ).count()
            
            failed = session.query(JarvisAction).filter(
                JarvisAction.created_at >= hours_24_ago,
                JarvisAction.action_metadata['autonomous'].astext == 'true',
                JarvisAction.status == ActionStatus.FAILED
            ).count()
            
            tier1 = session.query(JarvisAction).filter(
                JarvisAction.created_at >= hours_24_ago,
                JarvisAction.action_metadata['autonomous'].astext == 'true',
                JarvisAction.action_metadata['tier'].astext == '1'
            ).count()
            
            tier2 = session.query(JarvisAction).filter(
                JarvisAction.created_at >= hours_24_ago,
                JarvisAction.action_metadata['autonomous'].astext == 'true',
                JarvisAction.action_metadata['tier'].astext == '2'
            ).count()
            
            tier3 = session.query(JarvisAction).filter(
                JarvisAction.created_at >= hours_24_ago,
                JarvisAction.action_metadata['autonomous'].astext == 'true',
                JarvisAction.action_metadata['tier'].astext == '3'
            ).count()
            
            success_rate = (successful / total_autonomous * 100) if total_autonomous > 0 else 0
            
            metrics = agent.get_metrics()
            
            return jsonify({
                'success': True,
                'data': {
                    'last_24_hours': {
                        'total': total_autonomous,
                        'successful': successful,
                        'failed': failed,
                        'success_rate': round(success_rate, 2)
                    },
                    'by_tier': {
                        'tier1_diagnose': tier1,
                        'tier2_remediate': tier2,
                        'tier3_proactive': tier3
                    },
                    'agent_metrics': metrics,
                    'timestamp': datetime.utcnow().isoformat()
                }
            })
            
    except Exception as e:
        logger.error(f"Error fetching autonomous stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/actions/available', methods=['GET'])
@require_auth
def get_available_actions():
    """Get list of all available autonomous actions"""
    try:
        actions = policy_engine.list_all_actions()
        
        return jsonify({
            'success': True,
            'data': {
                'actions': actions,
                'total': len(actions)
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching available actions: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/actions/<action_name>/execute', methods=['POST'])
@require_auth
def trigger_autonomous_action(action_name: str):
    """Manually trigger an autonomous action
    
    Request body:
        - dry_run: bool (default: false)
    """
    try:
        data = request.get_json() or {}
        dry_run = data.get('dry_run', False)
        
        task = execute_autonomous_action.delay(action_name, dry_run)
        
        return jsonify({
            'success': True,
            'data': {
                'task_id': task.id,
                'action_name': action_name,
                'dry_run': dry_run,
                'status': 'queued'
            },
            'message': f'Action {action_name} queued for execution'
        }), 202
        
    except Exception as e:
        logger.error(f"Error triggering action {action_name}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/diagnostics/run', methods=['POST'])
@require_auth
def trigger_diagnostics():
    """Manually trigger Tier 1 diagnostics"""
    try:
        task = run_tier1_diagnostics.delay()
        
        return jsonify({
            'success': True,
            'data': {
                'task_id': task.id,
                'tier': 1,
                'status': 'queued'
            },
            'message': 'Tier 1 diagnostics queued'
        }), 202
        
    except Exception as e:
        logger.error(f"Error triggering diagnostics: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/remediation/run', methods=['POST'])
@require_auth
def trigger_remediation():
    """Manually trigger Tier 2 remediation"""
    try:
        task = run_tier2_remediation.delay()
        
        return jsonify({
            'success': True,
            'data': {
                'task_id': task.id,
                'tier': 2,
                'status': 'queued'
            },
            'message': 'Tier 2 remediation queued'
        }), 202
        
    except Exception as e:
        logger.error(f"Error triggering remediation: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/proactive/run', methods=['POST'])
@require_auth
def trigger_proactive():
    """Manually trigger Tier 3 proactive maintenance"""
    try:
        task = run_tier3_proactive.delay()
        
        return jsonify({
            'success': True,
            'data': {
                'task_id': task.id,
                'tier': 3,
                'status': 'queued'
            },
            'message': 'Tier 3 proactive maintenance queued'
        }), 202
        
    except Exception as e:
        logger.error(f"Error triggering proactive maintenance: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/policy/stats', methods=['GET'])
@require_auth
def get_policy_stats():
    """Get policy engine statistics"""
    try:
        stats = policy_engine.get_policy_stats()
        
        return jsonify({
            'success': True,
            'data': stats
        })
        
    except Exception as e:
        logger.error(f"Error fetching policy stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@autonomous_bp.route('/api/circuit-breaker/reset/<action_name>', methods=['POST'])
@require_auth
def reset_circuit_breaker(action_name: str):
    """Manually reset a circuit breaker for an action"""
    try:
        policy_engine.reset_circuit_breaker(action_name)
        
        return jsonify({
            'success': True,
            'message': f'Circuit breaker reset for {action_name}'
        })
        
    except Exception as e:
        logger.error(f"Error resetting circuit breaker: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500
