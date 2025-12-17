"""
Integration Orchestrator Service
Automatically discovers and provisions integrations for the homelab platform.
"""

import os
import logging
import requests
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class IntegrationOrchestrator:
    """
    Orchestrates automatic discovery and provisioning of integrations.
    Eliminates manual configuration for services like Discord, Home Assistant, Ollama.
    """
    
    def __init__(self):
        self.discord_bot_url = os.environ.get('DISCORD_BOT_URL', 'http://discord-bot:5000')
        self.homelabhub_api_key = os.environ.get('HOMELABHUB_API_KEY', os.environ.get('SERVICE_AUTH_TOKEN', ''))
        self.tailscale_local = os.environ.get('TAILSCALE_LOCAL_HOST', '')
        
        self._cached_webhook_url: Optional[str] = None
        self._integration_status: Dict[str, Dict] = {}
    
    def _get_headers(self) -> Dict[str, str]:
        """Get headers for homelabhub API calls"""
        return {
            'Content-Type': 'application/json',
            'X-Homelabhub-Key': self.homelabhub_api_key
        }
    
    def get_available_discord_channels(self) -> Dict[str, Any]:
        """Get list of Discord channels available for webhook provisioning"""
        try:
            response = requests.get(
                f"{self.discord_bot_url}/api/homelabhub/available-channels",
                headers=self._get_headers(),
                timeout=10
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.warning(f"Failed to get Discord channels: {response.status_code}")
                return {'success': False, 'error': response.text}
        except requests.RequestException as e:
            logger.error(f"Error contacting Discord bot: {e}")
            return {'success': False, 'error': str(e)}
    
    def provision_discord_webhook(
        self, 
        channel_id: Optional[str] = None,
        guild_id: Optional[str] = None,
        channel_name: Optional[str] = None,
        webhook_name: str = "Homelab Alerts"
    ) -> Dict[str, Any]:
        """
        Automatically provision a Discord webhook for notifications.
        
        Can specify either:
        - channel_id: Direct channel ID
        - guild_id + channel_name: Find channel by name in guild
        - Neither: Auto-select first available channel with webhook permissions
        """
        try:
            if not channel_id and not (guild_id and channel_name):
                channels_result = self.get_available_discord_channels()
                if channels_result.get('success') and channels_result.get('channels'):
                    for channel in channels_result['channels']:
                        if channel.get('canCreateWebhook'):
                            channel_id = channel['id']
                            logger.info(f"Auto-selected channel: {channel['name']} in {channel['guild']['name']}")
                            break
                
                if not channel_id:
                    return {
                        'success': False,
                        'error': 'No channels available for webhook creation'
                    }
            
            payload = {'name': webhook_name}
            if channel_id:
                payload['channelId'] = channel_id
            elif guild_id and channel_name:
                payload['guildId'] = guild_id
                payload['channelName'] = channel_name
            
            response = requests.post(
                f"{self.discord_bot_url}/api/homelabhub/provision-webhook",
                headers=self._get_headers(),
                json=payload,
                timeout=15
            )
            
            if response.status_code == 200:
                result = response.json()
                self._cached_webhook_url = result.get('webhookUrl')
                
                self._integration_status['discord_webhook'] = {
                    'status': 'active',
                    'provisioned_at': datetime.utcnow().isoformat(),
                    'webhook_id': result.get('webhookId'),
                    'channel': result.get('channel'),
                    'guild': result.get('guild')
                }
                
                logger.info(f"Successfully provisioned Discord webhook in #{result.get('channel', {}).get('name')}")
                return result
            else:
                error_data = response.json() if response.content else {'error': response.text}
                logger.error(f"Failed to provision webhook: {error_data}")
                return {'success': False, **error_data}
                
        except requests.RequestException as e:
            logger.error(f"Error provisioning Discord webhook: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_discord_webhook_url(self) -> Optional[str]:
        """Get the Discord webhook URL, provisioning if needed"""
        if os.environ.get('DISCORD_WEBHOOK_URL'):
            return os.environ.get('DISCORD_WEBHOOK_URL')
        
        if self._cached_webhook_url:
            return self._cached_webhook_url
        
        result = self.provision_discord_webhook()
        if result.get('success'):
            return result.get('webhookUrl')
        
        return None
    
    def discover_home_assistant(self) -> Dict[str, Any]:
        """Attempt to discover Home Assistant on the network"""
        ha_urls_to_try = [
            f"http://{self.tailscale_local}:8123",
            "http://homeassistant:8123",
            "http://192.168.0.177:8123",
            "http://home.local:8123",
        ]
        
        for url in ha_urls_to_try:
            if not url or url.startswith('http://:'):
                continue
            try:
                response = requests.get(f"{url}/api/", timeout=3)
                if response.status_code in [200, 401]:
                    self._integration_status['home_assistant'] = {
                        'status': 'discovered',
                        'url': url,
                        'discovered_at': datetime.utcnow().isoformat()
                    }
                    return {
                        'success': True,
                        'url': url,
                        'needs_token': response.status_code == 401
                    }
            except:
                continue
        
        return {'success': False, 'error': 'Home Assistant not found on network'}
    
    def discover_ollama(self) -> Dict[str, Any]:
        """Attempt to discover Ollama on the network"""
        ollama_urls_to_try = [
            f"http://{self.tailscale_local}:11434",
            "http://ollama:11434",
            "http://192.168.0.177:11434",
            "http://localhost:11434",
        ]
        
        for url in ollama_urls_to_try:
            if not url or url.startswith('http://:'):
                continue
            try:
                response = requests.get(f"{url}/api/tags", timeout=3)
                if response.status_code == 200:
                    data = response.json()
                    models = data.get('models', [])
                    self._integration_status['ollama'] = {
                        'status': 'active',
                        'url': url,
                        'models': [m.get('name') for m in models],
                        'discovered_at': datetime.utcnow().isoformat()
                    }
                    return {
                        'success': True,
                        'url': url,
                        'models': models
                    }
            except:
                continue
        
        return {'success': False, 'error': 'Ollama not found on network'}
    
    def run_full_discovery(self) -> Dict[str, Any]:
        """Run full integration discovery and provisioning"""
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'integrations': {}
        }
        
        discord_channels = self.get_available_discord_channels()
        if discord_channels.get('success'):
            results['integrations']['discord'] = {
                'status': 'available',
                'channels': len(discord_channels.get('channels', [])),
                'can_provision_webhook': any(
                    c.get('canCreateWebhook') for c in discord_channels.get('channels', [])
                )
            }
        else:
            results['integrations']['discord'] = {
                'status': 'unavailable',
                'error': discord_channels.get('error')
            }
        
        ha_result = self.discover_home_assistant()
        results['integrations']['home_assistant'] = {
            'status': 'discovered' if ha_result.get('success') else 'not_found',
            'url': ha_result.get('url'),
            'needs_token': ha_result.get('needs_token', False)
        }
        
        ollama_result = self.discover_ollama()
        results['integrations']['ollama'] = {
            'status': 'active' if ollama_result.get('success') else 'not_found',
            'url': ollama_result.get('url'),
            'models': [m.get('name', m) if isinstance(m, dict) else m for m in ollama_result.get('models', [])]
        }
        
        return results
    
    def get_status(self) -> Dict[str, Any]:
        """Get current integration status"""
        return {
            'integrations': self._integration_status,
            'discord_webhook_configured': bool(self.get_discord_webhook_url()),
            'timestamp': datetime.utcnow().isoformat()
        }


integration_orchestrator = IntegrationOrchestrator()
