"""Agent Swarm API Routes - Multi-Agent Collaboration Endpoints"""
from flask import Blueprint, jsonify, request
from services.agent_orchestrator import AgentOrchestrator
from utils.auth import require_web_auth
import logging

logger = logging.getLogger(__name__)

agent_bp = Blueprint('agent_api', __name__, url_prefix='/api/agents')

orchestrator = AgentOrchestrator()

@agent_bp.route('/list', methods=['GET'])
@require_web_auth
def list_agents():
    """List all agents in the swarm"""
    try:
        agents = orchestrator.list_agents()
        return jsonify({"success": True, "agents": agents})
    except Exception as e:
        logger.error(f"Error listing agents: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks', methods=['GET'])
@require_web_auth
def list_tasks():
    """List all agent tasks"""
    try:
        status = request.args.get('status')
        tasks = orchestrator.list_tasks(status)
        return jsonify({"success": True, "tasks": tasks})
    except Exception as e:
        logger.error(f"Error listing tasks: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/create', methods=['POST'])
@require_web_auth
def create_task():
    """Create a new task for the agent swarm"""
    try:
        data = request.json
        if not data:
            return jsonify({"success": False, "message": "No data provided"}), 400
        
        description = data.get('description')
        task_type = data.get('task_type', 'diagnose')
        priority = data.get('priority', 5)
        context = data.get('context', {})
        
        if not description:
            return jsonify({"success": False, "message": "Description required"}), 400
        
        task = orchestrator.create_task(description, task_type, priority, context)
        
        if not task:
            return jsonify({"success": False, "message": "Failed to create task"}), 500
        
        return jsonify({
            "success": True,
            "task_id": task.id,
            "message": "Task created successfully"
        })
    except Exception as e:
        logger.error(f"Error creating task: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/<int:task_id>/execute', methods=['POST'])
@require_web_auth
def execute_task(task_id):
    """Execute a task with agent collaboration"""
    try:
        result = orchestrator.execute_task(task_id)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error executing task {task_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/<int:task_id>', methods=['GET'])
@require_web_auth
def get_task(task_id):
    """Get task details including agent conversations"""
    try:
        task_data = orchestrator.get_task_details(task_id)
        
        if not task_data:
            return jsonify({"success": False, "message": "Task not found"}), 404
        
        return jsonify({
            "success": True,
            "task": task_data
        })
    except Exception as e:
        logger.error(f"Error getting task {task_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/pending', methods=['GET'])
@require_web_auth
def get_pending_tasks():
    """Get all tasks requiring approval"""
    try:
        from services.db_service import db_service
        from models.agent import AgentTask
        
        with db_service.get_session() as session:
            # Get tasks that require approval and are not approved/rejected
            pending_tasks = session.query(AgentTask).filter(
                AgentTask.status.in_(['pending', 'planning', 'ready']),
            ).order_by(AgentTask.priority.desc(), AgentTask.created_at.desc()).all()
            
            # Filter tasks requiring approval from context
            tasks_requiring_approval = []
            for task in pending_tasks:
                context = task.context or {}
                if context.get('requires_approval', False) and not context.get('approved', False):
                    tasks_requiring_approval.append({
                        'id': task.id,
                        'description': task.description,
                        'task_type': task.task_type,
                        'priority': task.priority,
                        'status': task.status,
                        'created_at': task.created_at.isoformat() if task.created_at else None,
                        'context': context,
                        'execution_log': task.execution_log or []
                    })
            
            return jsonify({
                "success": True,
                "tasks": tasks_requiring_approval,
                "count": len(tasks_requiring_approval)
            })
    except Exception as e:
        logger.error(f"Error getting pending tasks: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/<int:task_id>/approve', methods=['POST'])
@require_web_auth
def approve_task(task_id):
    """Approve a task for execution"""
    try:
        from services.db_service import db_service
        from models.agent import AgentTask
        from datetime import datetime
        
        data = request.json or {}
        approval_notes = data.get('notes', '')
        
        # Authorization check - user must be authenticated (enforced by decorator)
        # In production, you'd also check specific permissions/roles here
        
        with db_service.get_session() as session:
            task = session.query(AgentTask).filter_by(id=task_id).first()
            
            if not task:
                return jsonify({"success": False, "message": "Task not found"}), 404
            
            # Check if task has already been approved
            context = task.context or {}
            if context.get('approved', False):
                logger.warning(f"Task {task_id} already approved")
                return jsonify({
                    "success": False,
                    "message": "Task has already been approved"
                }), 400
            
            # Check if task has been rejected
            if context.get('rejected', False):
                logger.warning(f"Task {task_id} already rejected, cannot approve")
                return jsonify({
                    "success": False,
                    "message": "Task has been rejected and cannot be approved"
                }), 400
            
            # Update task context to mark as approved
            context['approved'] = True
            context['approved_at'] = datetime.utcnow().isoformat()
            context['approval_notes'] = approval_notes
            task.context = context
            
            # Add to execution log with proper datetime serialization
            execution_log = task.execution_log or []
            execution_log.append({
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'approved',
                'notes': approval_notes
            })
            task.execution_log = execution_log
            
            session.commit()
            
            logger.info(f"Task {task_id} approved by authenticated user")
            
            return jsonify({
                "success": True,
                "message": "Task approved successfully",
                "task_id": task_id
            })
    except Exception as e:
        logger.error(f"Error approving task {task_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/<int:task_id>/reject', methods=['POST'])
@require_web_auth
def reject_task(task_id):
    """Reject a task and prevent execution"""
    try:
        from services.db_service import db_service
        from models.agent import AgentTask
        from datetime import datetime
        
        data = request.json or {}
        rejection_reason = data.get('reason', 'No reason provided')
        
        # Authorization check - user must be authenticated (enforced by decorator)
        # In production, you'd also check specific permissions/roles here
        
        with db_service.get_session() as session:
            task = session.query(AgentTask).filter_by(id=task_id).first()
            
            if not task:
                return jsonify({"success": False, "message": "Task not found"}), 404
            
            # Check if task has already been rejected
            context = task.context or {}
            if context.get('rejected', False):
                logger.warning(f"Task {task_id} already rejected")
                return jsonify({
                    "success": False,
                    "message": "Task has already been rejected"
                }), 400
            
            # Check if task has already been approved and started
            if task.status in ['in_progress', 'completed']:
                logger.warning(f"Task {task_id} already {task.status}, cannot reject")
                return jsonify({
                    "success": False,
                    "message": f"Task is already {task.status} and cannot be rejected"
                }), 400
            
            # Update task status to rejected
            task.status = 'rejected'
            task.completed_at = datetime.utcnow()
            
            # Update context with proper datetime serialization
            context['rejected'] = True
            context['rejected_at'] = datetime.utcnow().isoformat()
            context['rejection_reason'] = rejection_reason
            task.context = context
            
            # Add to execution log with proper datetime serialization
            execution_log = task.execution_log or []
            execution_log.append({
                'timestamp': datetime.utcnow().isoformat(),
                'action': 'rejected',
                'reason': rejection_reason
            })
            task.execution_log = execution_log
            
            session.commit()
            
            logger.info(f"Task {task_id} rejected by authenticated user: {rejection_reason}")
            
            return jsonify({
                "success": True,
                "message": "Task rejected successfully",
                "task_id": task_id
            })
    except Exception as e:
        logger.error(f"Error rejecting task {task_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@agent_bp.route('/tasks/<int:task_id>/status', methods=['GET'])
@require_web_auth
def get_task_status(task_id):
    """Get task status and full execution log"""
    try:
        from services.db_service import db_service
        from models.agent import AgentTask
        
        with db_service.get_session() as session:
            task = session.query(AgentTask).filter_by(id=task_id).first()
            
            if not task:
                return jsonify({"success": False, "message": "Task not found"}), 404
            
            # Get task details with full log
            task_status = {
                'id': task.id,
                'description': task.description,
                'task_type': task.task_type,
                'priority': task.priority,
                'status': task.status,
                'created_at': task.created_at.isoformat() if task.created_at else None,
                'completed_at': task.completed_at.isoformat() if task.completed_at else None,
                'assigned_agent': task.assigned_agent,
                'context': task.context or {},
                'execution_log': task.execution_log or [],
                'result': task.result
            }
            
            return jsonify({
                "success": True,
                "task": task_status
            })
    except Exception as e:
        logger.error(f"Error getting task status {task_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500
