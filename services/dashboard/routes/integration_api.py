"""
Integration Orchestrator API Routes
Provides endpoints for automatic integration discovery and provisioning.
"""

from flask import Blueprint, jsonify, request
from utils.auth import require_auth
from utils.rbac import require_permission
from models.rbac import Permission
from services.integration_orchestrator import integration_orchestrator
import logging

logger = logging.getLogger(__name__)

integration_bp = Blueprint('integration', __name__)


@integration_bp.route('/api/integrations/status', methods=['GET'])
@require_auth
def get_integration_status():
    """
    GET /api/integrations/status
    Get current status of all integrations
    """
    try:
        status = integration_orchestrator.get_status()
        return jsonify({'success': True, **status}), 200
    except Exception as e:
        logger.error(f"Error getting integration status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@integration_bp.route('/api/integrations/discover', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_RBAC)
def run_discovery():
    """
    POST /api/integrations/discover
    Run full integration discovery
    """
    try:
        results = integration_orchestrator.run_full_discovery()
        return jsonify({'success': True, **results}), 200
    except Exception as e:
        logger.error(f"Error running integration discovery: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@integration_bp.route('/api/integrations/discord/channels', methods=['GET'])
@require_auth
def get_discord_channels():
    """
    GET /api/integrations/discord/channels
    Get available Discord channels for webhook provisioning
    """
    try:
        channels = integration_orchestrator.get_available_discord_channels()
        return jsonify(channels), 200 if channels.get('success') else 500
    except Exception as e:
        logger.error(f"Error getting Discord channels: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@integration_bp.route('/api/integrations/discord/provision-webhook', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_RBAC)
def provision_discord_webhook():
    """
    POST /api/integrations/discord/provision-webhook
    Automatically provision a Discord webhook for notifications
    
    Optional body:
    {
        "channelId": "123...",  // Direct channel ID
        "guildId": "456...",    // Or guild + channel name
        "channelName": "alerts",
        "name": "Homelab Alerts"
    }
    """
    try:
        data = request.get_json() or {}
        
        result = integration_orchestrator.provision_discord_webhook(
            channel_id=data.get('channelId'),
            guild_id=data.get('guildId'),
            channel_name=data.get('channelName'),
            webhook_name=data.get('name', 'Homelab Alerts')
        )
        
        if result.get('success'):
            return jsonify(result), 200
        else:
            return jsonify(result), 400
            
    except Exception as e:
        logger.error(f"Error provisioning Discord webhook: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@integration_bp.route('/api/integrations/home-assistant/discover', methods=['POST'])
@require_auth
def discover_home_assistant():
    """
    POST /api/integrations/home-assistant/discover
    Discover Home Assistant on the network
    """
    try:
        result = integration_orchestrator.discover_home_assistant()
        return jsonify(result), 200 if result.get('success') else 404
    except Exception as e:
        logger.error(f"Error discovering Home Assistant: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@integration_bp.route('/api/integrations/ollama/discover', methods=['POST'])
@require_auth
def discover_ollama():
    """
    POST /api/integrations/ollama/discover
    Discover Ollama on the network
    """
    try:
        result = integration_orchestrator.discover_ollama()
        return jsonify(result), 200 if result.get('success') else 404
    except Exception as e:
        logger.error(f"Error discovering Ollama: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@integration_bp.route('/api/integrations/setup-wizard', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_RBAC)
def run_setup_wizard():
    """
    POST /api/integrations/setup-wizard
    Run the full setup wizard to auto-configure all integrations
    
    This is the "one-click" setup endpoint that:
    1. Discovers all available services
    2. Provisions Discord webhook automatically
    3. Configures Home Assistant (if discovered and token provided)
    4. Sets up Ollama connection (if discovered)
    """
    try:
        results = {
            'steps': [],
            'success': True
        }
        
        discovery = integration_orchestrator.run_full_discovery()
        results['discovery'] = discovery
        results['steps'].append({
            'step': 'discovery',
            'status': 'completed',
            'found': list(discovery.get('integrations', {}).keys())
        })
        
        discord_info = discovery.get('integrations', {}).get('discord', {})
        if discord_info.get('can_provision_webhook'):
            webhook_result = integration_orchestrator.provision_discord_webhook()
            if webhook_result.get('success'):
                results['steps'].append({
                    'step': 'discord_webhook',
                    'status': 'provisioned',
                    'channel': webhook_result.get('channel', {}).get('name'),
                    'guild': webhook_result.get('guild', {}).get('name')
                })
                results['discord_webhook_url'] = webhook_result.get('webhookUrl')
            else:
                results['steps'].append({
                    'step': 'discord_webhook',
                    'status': 'failed',
                    'error': webhook_result.get('error')
                })
        else:
            results['steps'].append({
                'step': 'discord_webhook',
                'status': 'skipped',
                'reason': 'No channels available or Discord bot not connected'
            })
        
        ha_info = discovery.get('integrations', {}).get('home_assistant', {})
        if ha_info.get('status') == 'discovered':
            results['steps'].append({
                'step': 'home_assistant',
                'status': 'discovered',
                'url': ha_info.get('url'),
                'needs_token': ha_info.get('needs_token', True),
                'action_required': 'Provide HOME_ASSISTANT_TOKEN to complete setup'
            })
        else:
            results['steps'].append({
                'step': 'home_assistant',
                'status': 'not_found'
            })
        
        ollama_info = discovery.get('integrations', {}).get('ollama', {})
        if ollama_info.get('status') == 'active':
            results['steps'].append({
                'step': 'ollama',
                'status': 'active',
                'url': ollama_info.get('url'),
                'models': ollama_info.get('models', [])
            })
        else:
            results['steps'].append({
                'step': 'ollama',
                'status': 'not_found',
                'action_required': 'Install Ollama on local host for local AI fallback'
            })
        
        return jsonify(results), 200
        
    except Exception as e:
        logger.error(f"Error running setup wizard: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
