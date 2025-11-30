"""
Jarvis Website Builder API Routes
Endpoints for autonomous website generation
"""
from flask import Blueprint, jsonify, request, render_template
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

jarvis_builder_bp = Blueprint('jarvis_builder', __name__, url_prefix='/api/jarvis/builder')


@jarvis_builder_bp.route('/start', methods=['POST'])
def start_project():
    """
    POST /api/jarvis/builder/start
    
    Start a new website builder project
    
    Request body:
    {
        "name": "My Website",
        "description": "A landing page for my SaaS product",
        "domain": "mysite.com" (optional)
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        name = data.get('name')
        description = data.get('description')
        domain = data.get('domain')
        
        if not name:
            return jsonify({
                'success': False,
                'error': 'Project name is required'
            }), 400
        
        if not description:
            return jsonify({
                'success': False,
                'error': 'Project description is required'
            }), 400
        
        result = jarvis_website_builder.start_project(name, description, domain)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error starting project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/plan', methods=['POST'])
def plan_project():
    """
    POST /api/jarvis/builder/plan
    
    Generate AI project plan
    
    Request body:
    {
        "project_id": "uuid",
        "description": "Detailed description of the website"
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        project_id = data.get('project_id')
        description = data.get('description')
        
        if not project_id:
            return jsonify({
                'success': False,
                'error': 'project_id is required'
            }), 400
        
        if not description:
            return jsonify({
                'success': False,
                'error': 'description is required'
            }), 400
        
        result = jarvis_website_builder.plan_project(project_id, description)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error planning project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/generate', methods=['POST'])
def generate_component():
    """
    POST /api/jarvis/builder/generate
    
    Generate code for a component (page, backend, database)
    
    Request body:
    {
        "project_id": "uuid",
        "component_type": "page|backend|database",
        "spec": { component specification }
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        project_id = data.get('project_id')
        component_type = data.get('component_type', 'page')
        spec = data.get('spec', {})
        
        if not project_id:
            return jsonify({
                'success': False,
                'error': 'project_id is required'
            }), 400
        
        if component_type == 'page':
            result = jarvis_website_builder.generate_page(project_id, spec)
        elif component_type == 'backend':
            result = jarvis_website_builder.generate_backend(project_id, spec)
        elif component_type == 'database':
            result = jarvis_website_builder.generate_database_schema(project_id, spec)
        else:
            return jsonify({
                'success': False,
                'error': f'Unknown component type: {component_type}'
            }), 400
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error generating component: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/approve', methods=['POST'])
def approve_checkpoint():
    """
    POST /api/jarvis/builder/approve
    
    Approve a checkpoint to continue building
    
    Request body:
    {
        "checkpoint_id": "uuid"
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        checkpoint_id = data.get('checkpoint_id')
        
        if not checkpoint_id:
            return jsonify({
                'success': False,
                'error': 'checkpoint_id is required'
            }), 400
        
        result = jarvis_website_builder.approve_checkpoint(checkpoint_id)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error approving checkpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/reject', methods=['POST'])
def reject_checkpoint():
    """
    POST /api/jarvis/builder/reject
    
    Reject a checkpoint with feedback
    
    Request body:
    {
        "checkpoint_id": "uuid",
        "feedback": "Please change..."
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        checkpoint_id = data.get('checkpoint_id')
        feedback = data.get('feedback', '')
        
        if not checkpoint_id:
            return jsonify({
                'success': False,
                'error': 'checkpoint_id is required'
            }), 400
        
        result = jarvis_website_builder.reject_checkpoint(checkpoint_id, feedback)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error rejecting checkpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/deploy/preview', methods=['POST'])
def deploy_preview():
    """
    POST /api/jarvis/builder/deploy/preview
    
    Deploy project to preview subdomain
    
    Request body:
    {
        "project_id": "uuid"
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({
                'success': False,
                'error': 'project_id is required'
            }), 400
        
        result = jarvis_website_builder.deploy_preview(project_id)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error deploying preview: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/deploy/production', methods=['POST'])
def deploy_production():
    """
    POST /api/jarvis/builder/deploy/production
    
    Deploy project to production domain
    
    Request body:
    {
        "project_id": "uuid",
        "domain": "mysite.com"
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        project_id = data.get('project_id')
        domain = data.get('domain')
        
        if not project_id:
            return jsonify({
                'success': False,
                'error': 'project_id is required'
            }), 400
        
        if not domain:
            return jsonify({
                'success': False,
                'error': 'domain is required'
            }), 400
        
        result = jarvis_website_builder.deploy_production(project_id, domain)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error deploying to production: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/projects', methods=['GET'])
def list_projects():
    """
    GET /api/jarvis/builder/projects
    
    List all builder projects
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        result = jarvis_website_builder.list_projects()
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/project/<project_id>', methods=['GET'])
def get_project(project_id):
    """
    GET /api/jarvis/builder/project/<id>
    
    Get project details and status
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        result = jarvis_website_builder.get_project_status(project_id)
        
        status_code = 200 if result.get('success') else 404
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error getting project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/check-in', methods=['POST'])
def check_in():
    """
    POST /api/jarvis/builder/check-in
    
    Create a checkpoint for user approval
    
    Request body:
    {
        "project_id": "uuid",
        "step": "step_name",
        "current_state": { state data }
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        
        data = request.get_json() or {}
        project_id = data.get('project_id')
        step = data.get('step')
        current_state = data.get('current_state', {})
        
        if not project_id:
            return jsonify({
                'success': False,
                'error': 'project_id is required'
            }), 400
        
        if not step:
            return jsonify({
                'success': False,
                'error': 'step is required'
            }), 400
        
        result = jarvis_website_builder.check_in(project_id, step, current_state)
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Error creating checkpoint: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_builder_bp.route('/build-all', methods=['POST'])
def build_all():
    """
    POST /api/jarvis/builder/build-all
    
    Trigger full autonomous build (generates all pages and backend)
    
    Request body:
    {
        "project_id": "uuid"
    }
    """
    try:
        from services.jarvis_website_builder import jarvis_website_builder
        from models import get_session
        from models.builder_project import BuilderProject, BuilderProjectStatus
        
        data = request.get_json() or {}
        project_id = data.get('project_id')
        
        if not project_id:
            return jsonify({
                'success': False,
                'error': 'project_id is required'
            }), 400
        
        session = get_session()
        project = session.query(BuilderProject).filter_by(id=project_id).first()
        
        if not project:
            session.close()
            return jsonify({
                'success': False,
                'error': 'Project not found'
            }), 404
        
        if not project.plan:
            session.close()
            return jsonify({
                'success': False,
                'error': 'Project has no plan. Run /plan first.'
            }), 400
        
        project.status = BuilderProjectStatus.BUILDING
        session.commit()
        
        results = {
            'pages': [],
            'backend': None,
            'database': None
        }
        
        for page_spec in project.plan.get('pages', []):
            page_result = jarvis_website_builder.generate_page(project_id, page_spec)
            results['pages'].append({
                'name': page_spec.get('name'),
                'success': page_result.get('success'),
                'error': page_result.get('error')
            })
        
        if project.plan.get('api_endpoints'):
            backend_result = jarvis_website_builder.generate_backend(project_id, {
                'endpoints': project.plan.get('api_endpoints', []),
                'models': project.plan.get('database_models', [])
            })
            results['backend'] = {
                'success': backend_result.get('success'),
                'error': backend_result.get('error')
            }
        
        if project.plan.get('database_models'):
            db_result = jarvis_website_builder.generate_database_schema(project_id, {
                'models': project.plan.get('database_models', [])
            })
            results['database'] = {
                'success': db_result.get('success'),
                'error': db_result.get('error')
            }
        
        project = session.query(BuilderProject).filter_by(id=project_id).first()
        project.status = BuilderProjectStatus.REVIEWING
        project.current_step = 'build_complete'
        session.commit()
        
        final_result = project.to_dict()
        session.close()
        
        return jsonify({
            'success': True,
            'project': final_result,
            'build_results': results,
            'message': 'Build complete! Ready for review.'
        }), 200
        
    except Exception as e:
        logger.error(f"Error in build-all: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
