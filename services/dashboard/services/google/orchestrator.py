"""Google Services Orchestrator - Centralized coordination for all Google services"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime
from .google_client import google_client_manager
from .calendar_service import calendar_service
from .gmail_service import gmail_service
from .drive_service import drive_service

logger = logging.getLogger(__name__)


class GoogleServicesOrchestrator:
    """Orchestrates and coordinates all Google services"""
    
    SERVICES = ['calendar', 'gmail', 'drive']
    
    def __init__(self):
        """Initialize orchestrator"""
        self.client_manager = google_client_manager
        self.calendar = calendar_service
        self.gmail = gmail_service
        self.drive = drive_service
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get overall status of all Google services
        
        Returns:
            Status dictionary with connection info for all services
        """
        status = {
            'timestamp': datetime.utcnow().isoformat(),
            'services': {},
            'overall_status': 'disconnected'
        }
        
        connected_count = 0
        
        for service in self.SERVICES:
            try:
                connection_test = self.client_manager.test_connection(service)
                status['services'][service] = connection_test
                
                if connection_test.get('connected'):
                    connected_count += 1
            
            except Exception as e:
                logger.error(f"Error testing {service}: {e}")
                status['services'][service] = {
                    'connected': False,
                    'service': service,
                    'error': str(e)
                }
        
        # Determine overall status
        if connected_count == len(self.SERVICES):
            status['overall_status'] = 'connected'
        elif connected_count > 0:
            status['overall_status'] = 'partial'
        else:
            status['overall_status'] = 'disconnected'
        
        status['connected_count'] = connected_count
        status['total_services'] = len(self.SERVICES)
        
        return status
    
    def check_service_health(self, service: str) -> Dict[str, Any]:
        """
        Check health of a specific service
        
        Args:
            service: Service name (calendar, gmail, drive)
            
        Returns:
            Health check result
        """
        try:
            if service not in self.SERVICES:
                return {
                    'healthy': False,
                    'service': service,
                    'error': f'Unknown service: {service}'
                }
            
            connection_test = self.client_manager.test_connection(service)
            
            health = {
                'healthy': connection_test.get('connected', False),
                'service': service,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            # Add service-specific health checks
            if service == 'calendar' and connection_test.get('connected'):
                try:
                    calendars = self.calendar.list_calendars()
                    health['calendars_count'] = len(calendars)
                except Exception as e:
                    health['warning'] = f"Connected but error listing calendars: {e}"
            
            elif service == 'gmail' and connection_test.get('connected'):
                health['email'] = connection_test.get('email')
            
            elif service == 'drive' and connection_test.get('connected'):
                try:
                    storage = self.drive.get_storage_info()
                    health['storage_usage_percent'] = (
                        (storage['usage'] / storage['limit'] * 100)
                        if storage['limit'] > 0 else 0
                    )
                except Exception as e:
                    health['warning'] = f"Connected but error getting storage: {e}"
            
            return health
        
        except Exception as e:
            logger.error(f"Error checking health for {service}: {e}")
            return {
                'healthy': False,
                'service': service,
                'error': str(e)
            }
    
    def get_configuration(self) -> Dict[str, Any]:
        """
        Get current configuration for all services
        
        Returns:
            Configuration dictionary
        """
        return {
            'replit_connectors_configured': bool(self.client_manager.replit_hostname),
            'redis_configured': bool(self.client_manager.redis_client),
            'services': {
                'calendar': {
                    'connector': self.client_manager.SERVICE_CONNECTORS['calendar'],
                    'enabled': True
                },
                'gmail': {
                    'connector': self.client_manager.SERVICE_CONNECTORS['gmail'],
                    'enabled': True
                },
                'drive': {
                    'connector': self.client_manager.SERVICE_CONNECTORS['drive'],
                    'enabled': True,
                    'backup_folder': self.drive.BACKUP_FOLDER_NAME
                }
            },
            'token_cache_ttl': self.client_manager.TOKEN_CACHE_TTL
        }
    
    def reset_connections(self) -> Dict[str, Any]:
        """
        Reset all service connections (clear cached tokens)
        
        Returns:
            Reset result
        """
        cleared_count = 0
        errors = []
        
        if self.client_manager.redis_client:
            try:
                for service in self.SERVICES:
                    cache_key = self.client_manager._get_cache_key(service)
                    if self.client_manager.redis_client.delete(cache_key):
                        cleared_count += 1
                        logger.info(f"Cleared cached token for {service}")
            except Exception as e:
                logger.error(f"Error clearing cache: {e}")
                errors.append(str(e))
        
        # Reset folder cache for Drive
        self.drive._backup_folder_id = None
        
        return {
            'cleared_count': cleared_count,
            'errors': errors,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def send_status_notification(
        self,
        to: str,
        include_details: bool = True
    ) -> Dict[str, Any]:
        """
        Send email notification with service status
        
        Args:
            to: Recipient email
            include_details: Whether to include detailed status
            
        Returns:
            Send result
        """
        try:
            status = self.get_status()
            
            # Build email content
            overall_emoji = '✅' if status['overall_status'] == 'connected' else '⚠️'
            
            content = f"""
<p style="font-size: 16px; color: #111827; margin-bottom: 20px;">
    Google Services Status Report: {overall_emoji} <strong>{status['overall_status'].upper()}</strong>
</p>

<p style="font-size: 14px; color: #6b7280;">
    {status['connected_count']} of {status['total_services']} services connected
</p>
"""
            
            if include_details:
                for service_name, service_status in status['services'].items():
                    connected = service_status.get('connected', False)
                    emoji = '✅' if connected else '❌'
                    
                    content += f"""
<div style="background-color: #f9fafb; border-left: 4px solid {'#10b981' if connected else '#ef4444'}; padding: 15px; margin: 15px 0; border-radius: 4px;">
    <h4 style="margin: 0 0 8px 0; color: #374151; font-size: 14px; text-transform: uppercase;">
        {emoji} {service_name.title()}
    </h4>
    <p style="margin: 0; color: #6b7280; font-size: 13px;">
        Status: <strong>{('Connected' if connected else 'Disconnected')}</strong>
    </p>
"""
                    
                    if connected:
                        if service_name == 'gmail' and 'email' in service_status:
                            content += f"<p style=\"margin: 5px 0 0 0; color: #6b7280; font-size: 13px;\">Account: {service_status['email']}</p>"
                        elif service_name == 'calendar' and 'calendars' in service_status:
                            content += f"<p style=\"margin: 5px 0 0 0; color: #6b7280; font-size: 13px;\">Calendars: {service_status['calendars']}</p>"
                    else:
                        error = service_status.get('error', 'Unknown error')
                        content += f"<p style=\"margin: 5px 0 0 0; color: #dc2626; font-size: 12px;\">Error: {error}</p>"
                    
                    content += "</div>"
            
            return self.gmail.send_email(
                to=to,
                subject="Google Services Status",
                body=content,
                template_type='custom',
                html=True
            )
        
        except Exception as e:
            logger.error(f"Error sending status notification: {e}", exc_info=True)
            raise


# Initialize global orchestrator
google_orchestrator = GoogleServicesOrchestrator()
