"""
Workflow Builder API Routes
CRUD operations and execution for automation workflows
"""
from flask import Blueprint, jsonify, request, render_template
from datetime import datetime
import logging
import uuid

logger = logging.getLogger(__name__)

workflow_bp = Blueprint('workflow', __name__, url_prefix='/api/workflows')
workflow_web_bp = Blueprint('workflow_web', __name__)

try:
    from utils.auth import require_auth, require_web_auth
except ImportError:
    def require_auth(f):
        return f
    def require_web_auth(f):
        return f


def get_db_session():
    """Get database session with error handling"""
    try:
        from services.db_service import db_service
        if not db_service.is_available:
            return None
        return db_service.get_session()
    except Exception as e:
        logger.error(f"Database error: {e}")
        return None


@workflow_web_bp.route('/workflows')
@require_web_auth
def workflows_page():
    """Render the workflow builder page"""
    return render_template('workflows.html')


@workflow_bp.route('/node-types', methods=['GET'])
@require_auth
def get_node_types():
    """
    GET /api/workflows/node-types
    Get all available node types and their schemas
    """
    try:
        from services.workflow_engine import workflow_engine
        return jsonify({
            'success': True,
            'node_types': workflow_engine.get_node_types(),
            'schemas': workflow_engine.get_node_schemas()
        })
    except Exception as e:
        logger.error(f"Error getting node types: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('', methods=['GET'])
@require_auth
def list_workflows():
    """
    GET /api/workflows
    List all automation workflows
    """
    try:
        from models.automation_workflow import AutomationWorkflow
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            workflows = session.query(AutomationWorkflow).order_by(
                AutomationWorkflow.updated_at.desc()
            ).all()
            
            return jsonify({
                'success': True,
                'workflows': [w.to_dict() for w in workflows]
            })
    except Exception as e:
        logger.error(f"Error listing workflows: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('', methods=['POST'])
@require_auth
def create_workflow():
    """
    POST /api/workflows
    Create a new automation workflow
    """
    try:
        from models.automation_workflow import AutomationWorkflow, TriggerType
        
        data = request.get_json() or {}
        name = data.get('name')
        
        if not name:
            return jsonify({
                'success': False,
                'error': 'Workflow name is required'
            }), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        trigger_type_str = data.get('trigger_type', 'manual')
        try:
            trigger_type = TriggerType(trigger_type_str)
        except ValueError:
            trigger_type = TriggerType.MANUAL
        
        with session_ctx as session:
            workflow = AutomationWorkflow(
                name=name,
                description=data.get('description', ''),
                user_id=data.get('user_id'),
                nodes_json=data.get('nodes', []),
                edges_json=data.get('edges', []),
                enabled=data.get('enabled', True),
                trigger_type=trigger_type,
                trigger_config=data.get('trigger_config')
            )
            session.add(workflow)
            session.flush()
            result = workflow.to_dict()
            
        return jsonify({
            'success': True,
            'workflow': result,
            'message': 'Workflow created successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/<workflow_id>', methods=['GET'])
@require_auth
def get_workflow(workflow_id):
    """
    GET /api/workflows/<id>
    Get workflow details
    """
    try:
        from models.automation_workflow import AutomationWorkflow
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            workflow = session.query(AutomationWorkflow).filter_by(id=workflow_id).first()
            
            if not workflow:
                return jsonify({
                    'success': False,
                    'error': 'Workflow not found'
                }), 404
            
            result = workflow.to_dict()
            result['executions'] = [e.to_dict() for e in workflow.executions[:10]]
            
            return jsonify({
                'success': True,
                'workflow': result
            })
            
    except Exception as e:
        logger.error(f"Error getting workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/<workflow_id>', methods=['PUT'])
@require_auth
def update_workflow(workflow_id):
    """
    PUT /api/workflows/<id>
    Update workflow
    """
    try:
        from models.automation_workflow import AutomationWorkflow, TriggerType
        
        data = request.get_json() or {}
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            workflow = session.query(AutomationWorkflow).filter_by(id=workflow_id).first()
            
            if not workflow:
                return jsonify({
                    'success': False,
                    'error': 'Workflow not found'
                }), 404
            
            if 'name' in data:
                workflow.name = data['name']
            if 'description' in data:
                workflow.description = data['description']
            if 'nodes' in data:
                workflow.nodes_json = data['nodes']
            if 'edges' in data:
                workflow.edges_json = data['edges']
            if 'enabled' in data:
                workflow.enabled = data['enabled']
            if 'trigger_type' in data:
                try:
                    workflow.trigger_type = TriggerType(data['trigger_type'])
                except ValueError:
                    pass
            if 'trigger_config' in data:
                workflow.trigger_config = data['trigger_config']
            
            session.flush()
            result = workflow.to_dict()
            
        return jsonify({
            'success': True,
            'workflow': result,
            'message': 'Workflow updated successfully'
        })
        
    except Exception as e:
        logger.error(f"Error updating workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/<workflow_id>', methods=['DELETE'])
@require_auth
def delete_workflow(workflow_id):
    """
    DELETE /api/workflows/<id>
    Delete workflow
    """
    try:
        from models.automation_workflow import AutomationWorkflow
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            workflow = session.query(AutomationWorkflow).filter_by(id=workflow_id).first()
            
            if not workflow:
                return jsonify({
                    'success': False,
                    'error': 'Workflow not found'
                }), 404
            
            session.delete(workflow)
            
        return jsonify({
            'success': True,
            'message': 'Workflow deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"Error deleting workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/<workflow_id>/execute', methods=['POST'])
@require_auth
def execute_workflow(workflow_id):
    """
    POST /api/workflows/<id>/execute
    Manually trigger workflow execution
    """
    try:
        from models.automation_workflow import AutomationWorkflow, WorkflowExecution, ExecutionStatus
        from services.workflow_engine import workflow_engine
        
        data = request.get_json() or {}
        trigger_data = data.get('trigger_data', {})
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            workflow = session.query(AutomationWorkflow).filter_by(id=workflow_id).first()
            
            if not workflow:
                return jsonify({
                    'success': False,
                    'error': 'Workflow not found'
                }), 404
            
            if not workflow.enabled:
                return jsonify({
                    'success': False,
                    'error': 'Workflow is disabled'
                }), 400
            
            execution = WorkflowExecution(
                workflow_id=workflow.id,
                status=ExecutionStatus.RUNNING,
                trigger_data=trigger_data
            )
            session.add(execution)
            session.flush()
            execution_id = execution.id
            
            workflow_data = {
                'nodes': workflow.nodes_json,
                'edges': workflow.edges_json
            }
            
            try:
                result = workflow_engine.execute_workflow(workflow_data, trigger_data)
                
                execution.status = ExecutionStatus.COMPLETED if result['success'] else ExecutionStatus.FAILED
                execution.completed_at = datetime.utcnow()
                execution.result_json = result.get('output')
                execution.node_results = result.get('node_results', {})
                if not result['success']:
                    execution.error = result.get('error')
                
                workflow.last_run = datetime.utcnow()
                workflow.run_count += 1
                
            except Exception as exec_error:
                execution.status = ExecutionStatus.FAILED
                execution.completed_at = datetime.utcnow()
                execution.error = str(exec_error)
                result = {
                    'success': False,
                    'error': str(exec_error),
                    'node_results': {}
                }
            
            session.flush()
            execution_dict = execution.to_dict()
            
        return jsonify({
            'success': True,
            'execution': execution_dict,
            'result': result
        })
        
    except Exception as e:
        logger.error(f"Error executing workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/<workflow_id>/executions', methods=['GET'])
@require_auth
def get_executions(workflow_id):
    """
    GET /api/workflows/<id>/executions
    Get execution history for a workflow
    """
    try:
        from models.automation_workflow import AutomationWorkflow, WorkflowExecution
        
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            workflow = session.query(AutomationWorkflow).filter_by(id=workflow_id).first()
            
            if not workflow:
                return jsonify({
                    'success': False,
                    'error': 'Workflow not found'
                }), 404
            
            executions = session.query(WorkflowExecution).filter_by(
                workflow_id=workflow_id
            ).order_by(
                WorkflowExecution.started_at.desc()
            ).offset(offset).limit(limit).all()
            
            total = session.query(WorkflowExecution).filter_by(
                workflow_id=workflow_id
            ).count()
            
            return jsonify({
                'success': True,
                'executions': [e.to_dict() for e in executions],
                'total': total,
                'limit': limit,
                'offset': offset
            })
            
    except Exception as e:
        logger.error(f"Error getting executions: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/validate', methods=['POST'])
@require_auth
def validate_workflow():
    """
    POST /api/workflows/validate
    Validate workflow structure before saving
    """
    try:
        from services.workflow_engine import workflow_engine
        
        data = request.get_json() or {}
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])
        
        valid, errors = workflow_engine.validate_workflow(nodes, edges)
        
        return jsonify({
            'success': True,
            'valid': valid,
            'errors': errors
        })
        
    except Exception as e:
        logger.error(f"Error validating workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/<workflow_id>/toggle', methods=['POST'])
@require_auth
def toggle_workflow(workflow_id):
    """
    POST /api/workflows/<id>/toggle
    Enable/disable workflow
    """
    try:
        from models.automation_workflow import AutomationWorkflow
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            workflow = session.query(AutomationWorkflow).filter_by(id=workflow_id).first()
            
            if not workflow:
                return jsonify({
                    'success': False,
                    'error': 'Workflow not found'
                }), 404
            
            workflow.enabled = not workflow.enabled
            session.flush()
            
            return jsonify({
                'success': True,
                'enabled': workflow.enabled,
                'message': f"Workflow {'enabled' if workflow.enabled else 'disabled'}"
            })
            
    except Exception as e:
        logger.error(f"Error toggling workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@workflow_bp.route('/<workflow_id>/duplicate', methods=['POST'])
@require_auth
def duplicate_workflow(workflow_id):
    """
    POST /api/workflows/<id>/duplicate
    Create a copy of an existing workflow
    """
    try:
        from models.automation_workflow import AutomationWorkflow
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            original = session.query(AutomationWorkflow).filter_by(id=workflow_id).first()
            
            if not original:
                return jsonify({
                    'success': False,
                    'error': 'Workflow not found'
                }), 404
            
            copy = AutomationWorkflow(
                name=f"{original.name} (Copy)",
                description=original.description,
                user_id=original.user_id,
                nodes_json=original.nodes_json,
                edges_json=original.edges_json,
                enabled=False,
                trigger_type=original.trigger_type,
                trigger_config=original.trigger_config
            )
            session.add(copy)
            session.flush()
            result = copy.to_dict()
            
        return jsonify({
            'success': True,
            'workflow': result,
            'message': 'Workflow duplicated successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error duplicating workflow: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
