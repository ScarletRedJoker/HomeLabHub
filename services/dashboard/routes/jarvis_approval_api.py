"""API endpoints for Jarvis approval workflow

This module provides REST API endpoints for managing Jarvis actions that
require human approval before execution.
"""

from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from typing import Optional
import logging

from models import JarvisAction, ActionStatus, ActionType
from models import get_session
from utils.auth import require_auth
from jarvis.safe_executor import SafeCommandExecutor
from services.db_service import db_service


logger = logging.getLogger(__name__)

jarvis_approval_bp = Blueprint('jarvis_approval', __name__, url_prefix='/api/jarvis/actions')

safe_executor = SafeCommandExecutor()


@jarvis_approval_bp.route('/pending', methods=['GET'])
@require_auth
def get_pending_actions():
    """Get all pending actions requiring approval
    
    Query params:
        - limit: Max number of results (default: 50)
        - offset: Offset for pagination (default: 0)
        - action_type: Filter by action type
    """
    try:
        limit = int(request.args.get('limit', 50))
        offset = int(request.args.get('offset', 0))
        action_type = request.args.get('action_type')
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            query = session.query(JarvisAction).filter(
                JarvisAction.status == ActionStatus.PENDING
            )
            
            if action_type:
                try:
                    action_type_enum = ActionType(action_type)
                    query = query.filter(JarvisAction.action_type == action_type_enum)
                except ValueError:
                    return jsonify({
                        'success': False,
                        'message': f'Invalid action_type: {action_type}'
                    }), 400
            
            query = query.order_by(JarvisAction.requested_at.desc())
            
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
        logger.error(f"Error fetching pending actions: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@jarvis_approval_bp.route('/<action_id>', methods=['GET'])
@require_auth
def get_action(action_id):
    """Get details of a specific action"""
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            action = session.query(JarvisAction).filter_by(id=action_id).first()
            
            if not action:
                return jsonify({
                    'success': False,
                    'message': f'Action {action_id} not found'
                }), 404
            
            return jsonify({
                'success': True,
                'data': action.to_dict()
            })
            
    except Exception as e:
        logger.error(f"Error fetching action {action_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@jarvis_approval_bp.route('/<action_id>/approve', methods=['POST'])
@require_auth
def approve_action(action_id):
    """Approve a pending action
    
    Request body:
        - execute_immediately: bool (default: false)
    """
    try:
        data = request.get_json() or {}
        execute_immediately = data.get('execute_immediately', False)
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            action = session.query(JarvisAction).filter_by(id=action_id).first()
            
            if not action:
                return jsonify({
                    'success': False,
                    'message': f'Action {action_id} not found'
                }), 404
            
            if not action.can_approve():
                return jsonify({
                    'success': False,
                    'message': f'Action cannot be approved (current status: {action.status})'
                }), 400
            
            if action.is_expired():
                action.status = ActionStatus.CANCELLED
                session.commit()
                return jsonify({
                    'success': False,
                    'message': 'Action has expired'
                }), 400
            
            user = request.headers.get('X-User', 'admin')
            
            action.status = ActionStatus.APPROVED
            action.approved_by = user
            action.approved_at = datetime.utcnow()
            
            session.commit()
            session.refresh(action)
            
            result = {
                'success': True,
                'data': action.to_dict(),
                'message': f'Action approved by {user}'
            }
            
            if execute_immediately and action.action_type == ActionType.COMMAND_EXECUTION:
                try:
                    exec_result = safe_executor.execute(
                        command=action.command,
                        user=user
                    )
                    
                    action.status = ActionStatus.EXECUTED if exec_result.success else ActionStatus.FAILED
                    action.executed_at = datetime.utcnow()
                    action.execution_result = exec_result.to_dict()
                    action.execution_time_ms = int(exec_result.execution_time_ms)
                    
                    session.commit()
                    session.refresh(action)
                    
                    result['execution'] = exec_result.to_dict()
                    result['data'] = action.to_dict()
                    
                except Exception as e:
                    logger.error(f"Error executing action {action_id}: {e}", exc_info=True)
                    action.status = ActionStatus.FAILED
                    action.execution_result = {'error': str(e)}
                    session.commit()
                    result['execution_error'] = str(e)
            
            return jsonify(result)
            
    except Exception as e:
        logger.error(f"Error approving action {action_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@jarvis_approval_bp.route('/<action_id>/reject', methods=['POST'])
@require_auth
def reject_action(action_id):
    """Reject a pending action
    
    Request body:
        - reason: string (required)
    """
    try:
        data = request.get_json() or {}
        reason = data.get('reason', 'No reason provided')
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            action = session.query(JarvisAction).filter_by(id=action_id).first()
            
            if not action:
                return jsonify({
                    'success': False,
                    'message': f'Action {action_id} not found'
                }), 404
            
            if not action.can_reject():
                return jsonify({
                    'success': False,
                    'message': f'Action cannot be rejected (current status: {action.status})'
                }), 400
            
            user = request.headers.get('X-User', 'admin')
            
            action.status = ActionStatus.REJECTED
            action.rejected_by = user
            action.rejected_at = datetime.utcnow()
            action.rejection_reason = reason
            
            session.commit()
            session.refresh(action)
            
            return jsonify({
                'success': True,
                'data': action.to_dict(),
                'message': f'Action rejected by {user}'
            })
            
    except Exception as e:
        logger.error(f"Error rejecting action {action_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@jarvis_approval_bp.route('/<action_id>/execute', methods=['POST'])
@require_auth
def execute_action(action_id):
    """Execute an approved action"""
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            action = session.query(JarvisAction).filter_by(id=action_id).first()
            
            if not action:
                return jsonify({
                    'success': False,
                    'message': f'Action {action_id} not found'
                }), 404
            
            if not action.can_execute():
                return jsonify({
                    'success': False,
                    'message': f'Action cannot be executed (current status: {action.status})'
                }), 400
            
            if action.action_type != ActionType.COMMAND_EXECUTION:
                return jsonify({
                    'success': False,
                    'message': f'Action type {action.action_type} not supported for execution yet'
                }), 400
            
            user = request.headers.get('X-User', 'admin')
            
            try:
                exec_result = safe_executor.execute(
                    command=action.command,
                    user=user
                )
                
                action.status = ActionStatus.EXECUTED if exec_result.success else ActionStatus.FAILED
                action.executed_at = datetime.utcnow()
                action.execution_result = exec_result.to_dict()
                action.execution_time_ms = int(exec_result.execution_time_ms)
                
                session.commit()
                session.refresh(action)
                
                return jsonify({
                    'success': True,
                    'data': action.to_dict(),
                    'execution': exec_result.to_dict()
                })
                
            except Exception as e:
                logger.error(f"Error executing action {action_id}: {e}", exc_info=True)
                action.status = ActionStatus.FAILED
                action.execution_result = {'error': str(e)}
                session.commit()
                
                return jsonify({
                    'success': False,
                    'message': str(e)
                }), 500
            
    except Exception as e:
        logger.error(f"Error in execute_action {action_id}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@jarvis_approval_bp.route('/create', methods=['POST'])
@require_auth
def create_action():
    """Create a new action requiring approval
    
    Request body:
        - action_type: string (required)
        - command: string (required for COMMAND_EXECUTION)
        - description: string (required)
        - risk_level: string (optional, auto-detected for commands)
        - metadata: object (optional)
        - expires_in_hours: number (optional, default: 24)
    """
    try:
        data = request.get_json() or {}
        
        if not data.get('action_type'):
            return jsonify({
                'success': False,
                'message': 'action_type is required'
            }), 400
        
        if not data.get('description'):
            return jsonify({
                'success': False,
                'message': 'description is required'
            }), 400
        
        try:
            action_type = ActionType(data['action_type'])
        except ValueError:
            return jsonify({
                'success': False,
                'message': f'Invalid action_type: {data["action_type"]}'
            }), 400
        
        if action_type == ActionType.COMMAND_EXECUTION and not data.get('command'):
            return jsonify({
                'success': False,
                'message': 'command is required for COMMAND_EXECUTION type'
            }), 400
        
        risk_level = data.get('risk_level')
        if not risk_level and action_type == ActionType.COMMAND_EXECUTION:
            cmd_info = safe_executor.get_command_info(data['command'])
            risk_level = cmd_info['risk_level']
        
        expires_in_hours = data.get('expires_in_hours', 24)
        expires_at = datetime.utcnow() + timedelta(hours=expires_in_hours)
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            action = JarvisAction(
                action_type=action_type,
                command=data.get('command'),
                description=data['description'],
                risk_level=risk_level or 'unknown',
                requested_by=request.headers.get('X-User', 'system'),
                action_metadata=data.get('metadata'),
                expires_at=expires_at
            )
            
            session.add(action)
            session.commit()
            session.refresh(action)
            
            return jsonify({
                'success': True,
                'data': action.to_dict(),
                'message': 'Action created successfully'
            }), 201
            
    except Exception as e:
        logger.error(f"Error creating action: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500


@jarvis_approval_bp.route('/stats', methods=['GET'])
@require_auth
def get_stats():
    """Get statistics about Jarvis actions"""
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'message': 'Database not available'
            }), 503
        
        with db_service.get_session() as session:
            total = session.query(JarvisAction).count()
            pending = session.query(JarvisAction).filter_by(status=ActionStatus.PENDING).count()
            approved = session.query(JarvisAction).filter_by(status=ActionStatus.APPROVED).count()
            rejected = session.query(JarvisAction).filter_by(status=ActionStatus.REJECTED).count()
            executed = session.query(JarvisAction).filter_by(status=ActionStatus.EXECUTED).count()
            failed = session.query(JarvisAction).filter_by(status=ActionStatus.FAILED).count()
            
            return jsonify({
                'success': True,
                'data': {
                    'total': total,
                    'pending': pending,
                    'approved': approved,
                    'rejected': rejected,
                    'executed': executed,
                    'failed': failed
                }
            })
            
    except Exception as e:
        logger.error(f"Error fetching stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'message': str(e)
        }), 500
