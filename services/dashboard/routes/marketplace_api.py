"""
Marketplace API Routes
API endpoints for Docker marketplace/store
"""

from flask import Blueprint, jsonify, request
from services.marketplace_service import MarketplaceService
from services.db_service import db_service
from services.cache_service import cache_service
from utils.auth import require_auth
from sqlalchemy import select
import logging

logger = logging.getLogger(__name__)

marketplace_bp = Blueprint('marketplace', __name__, url_prefix='/api/marketplace')

# Initialize marketplace service
marketplace_service = MarketplaceService()


@marketplace_bp.route('/apps', methods=['GET'])
@require_auth
def list_apps():
    """List all marketplace apps"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'message': 'Database service not available'}), 503
        
        from models.marketplace import MarketplaceApp
        
        category = request.args.get('category')
        search = request.args.get('search')
        
        # Build cache key based on parameters
        cache_key = f"marketplace:apps:cat={category or 'all'}:search={search or 'none'}"
        
        # Try to get from cache
        cached = cache_service.get(cache_key)
        if cached:
            logger.debug(f"Returning cached marketplace apps for {cache_key}")
            return jsonify(cached)
        
        with db_service.get_session() as session:
            query = select(MarketplaceApp)
            
            if category:
                query = query.where(MarketplaceApp.category == category)
            
            if search:
                search_term = f"%{search}%"
                query = query.where(
                    (MarketplaceApp.name.ilike(search_term)) |
                    (MarketplaceApp.description.ilike(search_term))
                )
            
            # Order by popularity
            query = query.order_by(MarketplaceApp.popularity.desc())
            
            apps = session.execute(query).scalars().all()
            
            result = {
                'success': True,
                'data': {
                    'apps': [app.to_dict() for app in apps],
                    'count': len(apps)
                }
            }
            
            # Cache for 1 hour
            cache_service.set(cache_key, result, ttl=cache_service.TTL_1_HOUR)
            
            return jsonify(result)
    except Exception as e:
        logger.error(f"Error listing apps: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/apps/<slug>', methods=['GET'])
@require_auth
def get_app(slug):
    """Get details of a specific app"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'message': 'Database service not available'}), 503
        
        from models.marketplace import MarketplaceApp
        
        with db_service.get_session() as session:
            app = session.execute(
                select(MarketplaceApp).where(MarketplaceApp.slug == slug)
            ).scalar_one_or_none()
            
            if not app:
                return jsonify({'success': False, 'message': 'App not found'}), 404
            
            return jsonify({
                'success': True,
                'data': app.to_dict()
            })
    except Exception as e:
        logger.error(f"Error getting app: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deploy/<slug>', methods=['POST'])
@require_auth
def deploy_app(slug):
    """Deploy an app from marketplace"""
    try:
        # Invalidate marketplace apps cache on deployment
        cache_service.invalidate_marketplace_apps()
        
        data = request.get_json() or {}
        
        # Validate required fields based on app template
        # Port and domain are optional (auto-assigned/generated)
        
        success, message, deployment_id = marketplace_service.deploy_app(slug, data)
        
        if success:
            return jsonify({
                'success': True,
                'message': message,
                'data': {'deployment_id': deployment_id}
            })
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error deploying app: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed', methods=['GET'])
@require_auth
def list_deployed_apps():
    """List all deployed apps"""
    try:
        deployed_apps = marketplace_service.get_deployed_apps()
        
        return jsonify({
            'success': True,
            'data': {
                'deployed_apps': deployed_apps,
                'count': len(deployed_apps)
            }
        })
    except Exception as e:
        logger.error(f"Error listing deployed apps: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed/<int:deployment_id>', methods=['GET'])
@require_auth
def get_deployed_app(deployment_id):
    """Get details of a deployed app"""
    try:
        app = marketplace_service.get_deployed_app(deployment_id)
        
        if not app:
            return jsonify({'success': False, 'message': 'Deployed app not found'}), 404
        
        return jsonify({
            'success': True,
            'data': app
        })
    except Exception as e:
        logger.error(f"Error getting deployed app: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed/<int:deployment_id>/start', methods=['POST'])
@require_auth
def start_app(deployment_id):
    """Start a stopped app"""
    try:
        success, message = marketplace_service.start_app(deployment_id)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error starting app: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed/<int:deployment_id>/stop', methods=['POST'])
@require_auth
def stop_app(deployment_id):
    """Stop a running app"""
    try:
        success, message = marketplace_service.stop_app(deployment_id)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error stopping app: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed/<int:deployment_id>/restart', methods=['POST'])
@require_auth
def restart_app(deployment_id):
    """Restart an app"""
    try:
        success, message = marketplace_service.restart_app(deployment_id)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error restarting app: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed/<int:deployment_id>', methods=['DELETE'])
@require_auth
def remove_app(deployment_id):
    """Remove a deployed app"""
    try:
        remove_volumes = request.args.get('remove_volumes', 'false').lower() == 'true'
        
        success, message = marketplace_service.remove_app(deployment_id, remove_volumes)
        
        if success:
            return jsonify({'success': True, 'message': message})
        else:
            return jsonify({'success': False, 'message': message}), 400
            
    except Exception as e:
        logger.error(f"Error removing app: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed/<int:deployment_id>/logs', methods=['GET'])
@require_auth
def get_app_logs(deployment_id):
    """Get logs for a deployed app"""
    try:
        tail = int(request.args.get('tail', 100))
        
        success, logs = marketplace_service.get_app_logs(deployment_id, tail)
        
        if success:
            return jsonify({
                'success': True,
                'data': {'logs': logs}
            })
        else:
            return jsonify({'success': False, 'message': logs}), 400
            
    except Exception as e:
        logger.error(f"Error getting app logs: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/deployed/<int:deployment_id>/health', methods=['GET'])
@require_auth
def check_app_health(deployment_id):
    """Check health of a deployed app"""
    try:
        success, message, health = marketplace_service.check_app_health(deployment_id)
        
        return jsonify({
            'success': success,
            'message': message,
            'data': {'health_status': health}
        })
    except Exception as e:
        logger.error(f"Error checking app health: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500


@marketplace_bp.route('/categories', methods=['GET'])
@require_auth
def get_categories():
    """Get all app categories"""
    try:
        if not db_service.is_available:
            return jsonify({'success': False, 'message': 'Database service not available'}), 503
        
        from models.marketplace import MarketplaceApp
        from sqlalchemy import distinct
        
        with db_service.get_session() as session:
            categories = session.execute(
                select(distinct(MarketplaceApp.category)).where(MarketplaceApp.category.isnot(None))
            ).scalars().all()
            
            return jsonify({
                'success': True,
                'data': {'categories': list(categories)}
            })
    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500
