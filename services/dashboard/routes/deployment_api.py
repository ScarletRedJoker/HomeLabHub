"""
Deployment API Routes
API endpoints for service deployment and management
"""

from flask import Blueprint, jsonify, request
from services.deployment_service import DeploymentService
from services.service_templates import ServiceTemplateLibrary
from utils.auth import require_auth
import logging

logger = logging.getLogger(__name__)

deployment_bp = Blueprint('deployment', __name__, url_prefix='/api/deployment')

# Initialize deployment service
deployment_service = DeploymentService()
template_library = ServiceTemplateLibrary()


@deployment_bp.route('/templates', methods=['GET'])
@require_auth
def list_templates():
    """List all available service templates"""
    try:
        category = request.args.get('category')
        templates = template_library.list_templates(category)
        
        return jsonify({
            'success': True,
            'data': {
                'templates': [
                    {
                        'id': t.id,
                        'name': t.name,
                        'description': t.description,
                        'category': t.category,
                        'image': t.image,
                        'requires_subdomain': t.requires_subdomain,
                        'requires_database': t.requires_database,
                        'environment_vars': t.environment_vars
                    }
                    for t in templates
                ],
                'categories': template_library.get_categories()
            }
        })
    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/templates/<template_id>', methods=['GET'])
@require_auth
def get_template(template_id):
    """Get details of a specific template"""
    try:
        template = template_library.get_template(template_id)
        if not template:
            return jsonify({'success': False, 'message': 'Template not found'}), 404
        
        return jsonify({
            'success': True,
            'data': {
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'category': template.category,
                'image': template.image,
                'environment_vars': template.environment_vars,
                'volumes': template.volumes,
                'ports': template.ports,
                'requires_subdomain': template.requires_subdomain,
                'requires_database': template.requires_database
            }
        })
    except Exception as e:
        logger.error(f"Error getting template: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/deploy', methods=['POST'])
@require_auth
def deploy_service():
    """Deploy a new service from a template"""
    try:
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['template_id', 'service_name']
        missing = [f for f in required_fields if f not in data]
        if missing:
            return jsonify({
                'success': False,
                'message': f"Missing required fields: {', '.join(missing)}"
            }), 400
        
        template_id = data['template_id']
        service_name = data['service_name']
        domain = data.get('domain')
        environment_vars = data.get('environment_vars', {})
        custom_config = data.get('custom_config', {})
        
        # Deploy the service
        success, message = deployment_service.deploy_service(
            template_id=template_id,
            service_name=service_name,
            domain=domain,
            environment_vars=environment_vars,
            custom_config=custom_config
        )
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'data': {'service_name': service_name, 'domain': domain}
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error deploying service: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/services', methods=['GET'])
@require_auth
def list_services():
    """List all deployed services"""
    try:
        services = deployment_service.list_all_services()
        return jsonify({
            'success': True,
            'data': {'services': services}
        })
    except Exception as e:
        logger.error(f"Error listing services: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/services/<service_name>', methods=['GET'])
@require_auth
def get_service(service_name):
    """Get detailed information about a service"""
    try:
        status = deployment_service.get_service_status(service_name)
        if not status:
            return jsonify({'success': False, 'message': 'Service not found'}), 404
        
        return jsonify({
            'success': True,
            'data': status
        })
    except Exception as e:
        logger.error(f"Error getting service status: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/services/<service_name>', methods=['DELETE'])
@require_auth
def remove_service(service_name):
    """Remove a deployed service"""
    try:
        remove_volumes = request.args.get('remove_volumes', 'false').lower() == 'true'
        
        success, message = deployment_service.remove_service(service_name, remove_volumes)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error removing service: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/services/<service_name>', methods=['PATCH'])
@require_auth
def update_service(service_name):
    """Update a service configuration"""
    try:
        data = request.get_json()
        updates = data.get('updates', {})
        
        success, message = deployment_service.update_service(service_name, updates)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error updating service: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/services/<service_name>/rebuild', methods=['POST'])
@require_auth
def rebuild_service(service_name):
    """Rebuild and restart a service"""
    try:
        success, message = deployment_service.rebuild_service(service_name)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error rebuilding service: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/environment', methods=['GET'])
@require_auth
def list_environment_vars():
    """List environment variables"""
    try:
        prefix = request.args.get('prefix')
        variables = deployment_service.env.list_variables(prefix)
        
        # Mask sensitive values
        masked_vars = {}
        for key, value in variables.items():
            if any(keyword in key.lower() for keyword in ['password', 'secret', 'key', 'token']):
                masked_vars[key] = '***REDACTED***'
            else:
                masked_vars[key] = value
        
        return jsonify({
            'success': True,
            'data': {'variables': masked_vars}
        })
    except Exception as e:
        logger.error(f"Error listing environment variables: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/environment', methods=['POST'])
@require_auth
def set_environment_var():
    """Set an environment variable"""
    try:
        data = request.get_json()
        key = data.get('key')
        value = data.get('value')
        comment = data.get('comment')
        
        if not key or not value:
            return jsonify({'success': False, 'message': 'Key and value are required'}), 400
        
        deployment_service.env.set(key, value, comment)
        deployment_service.env.save_env()
        
        return jsonify({'success': True, 'message': f'Environment variable {key} set successfully'})
    except Exception as e:
        logger.error(f"Error setting environment variable: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@deployment_bp.route('/environment/<key>', methods=['DELETE'])
@require_auth
def delete_environment_var(key):
    """Delete an environment variable"""
    try:
        success = deployment_service.env.delete(key)
        if success:
            deployment_service.env.save_env()
            return jsonify({'success': True, 'message': f'Environment variable {key} deleted successfully'})
        else:
            return jsonify({'success': False, 'message': 'Variable not found'}), 404
    except Exception as e:
        logger.error(f"Error deleting environment variable: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
