"""
Service Deployment Orchestrator
Manages the full lifecycle of service deployment
"""

import logging
import subprocess
from typing import Dict, Any, Optional, List, Tuple
from .service_templates import ServiceTemplateLibrary, ServiceTemplate
from .compose_manager import ComposeManager
from .caddy_manager import CaddyManager
from .env_manager import EnvManager

logger = logging.getLogger(__name__)


class DeploymentService:
    """Orchestrate service deployments"""
    
    def __init__(self, 
                 compose_path: str = 'docker-compose.unified.yml',
                 caddyfile_path: str = 'Caddyfile',
                 env_path: str = '.env'):
        self.templates = ServiceTemplateLibrary()
        self.compose = ComposeManager(compose_path)
        self.caddy = CaddyManager(caddyfile_path)
        self.env = EnvManager(env_path)
    
    def deploy_service(self, 
                      template_id: str,
                      service_name: str,
                      domain: Optional[str] = None,
                      environment_vars: Optional[Dict[str, str]] = None,
                      custom_config: Optional[Dict[str, Any]] = None) -> Tuple[bool, str]:
        """
        Deploy a new service from a template with atomic rollback on failure
        
        Args:
            template_id: ID of the service template to use
            service_name: Name for the service instance
            domain: Optional subdomain (e.g., 'myservice.example.com')
            environment_vars: Environment variables for the service
            custom_config: Optional custom configuration overrides
        
        Returns:
            Tuple of (success, message)
        """
        # Track what we've modified for rollback
        compose_modified = False
        env_modified = False
        caddy_modified = False
        
        # Import dependencies needed for deployment and rollback
        import os
        import shutil
        import secrets
        
        try:
            # Get template
            template = self.templates.get_template(template_id)
            if not template:
                return False, f"Template '{template_id}' not found"
            
            # Validate service name doesn't exist
            if self.compose.get_service(service_name):
                return False, f"Service '{service_name}' already exists"
            
            # Prepare complete environment variables (template defaults + user-provided + auto-generated)
            complete_env_vars = self._prepare_environment_vars(template, service_name, environment_vars or {})
            
            # Build service configuration with complete environment variables
            service_config = self._build_service_config(
                template, service_name, complete_env_vars, custom_config or {}
            )
            
            # Add service to docker-compose
            if not self.compose.add_service(service_name, service_config):
                return False, f"Failed to add service to compose file"
            
            # Add volumes if needed
            for volume in service_config.get('volumes', []):
                if ':' in volume:
                    volume_name = volume.split(':')[0]
                    if not volume_name.startswith('/') and not volume_name.startswith('.'):
                        self.compose.add_volume(volume_name)
            
            # Save compose file (creates backup automatically)
            self.compose.save_config()
            compose_modified = True  # Mark immediately after save
            
            # Verify backup was created
            compose_backup = f"{self.compose.compose_file_path}.backup"
            if not os.path.exists(compose_backup):
                raise RuntimeError(f"Failed to create backup: {compose_backup}")
            
            # Add environment variables to .env file
            for key, value in complete_env_vars.items():
                env_key = f"{service_name.upper().replace('-', '_')}_{key}"
                self.env.set(env_key, value)
            
            # Save .env file (creates backup automatically)
            self.env.save_env()
            env_modified = True  # Mark immediately after save
            
            # Verify backup was created
            env_backup = f"{self.env.env_file_path}.backup"
            if not os.path.exists(env_backup):
                raise RuntimeError(f"Failed to create backup: {env_backup}")
            
            # Add Caddy reverse proxy if needed
            if template.requires_subdomain and domain:
                # Use template metadata for correct proxy configuration
                internal_url = f"{template.proxy_protocol}://{service_name}:{template.proxy_port}"
                self.caddy.add_service(domain, internal_url, template.custom_caddy_config)
                self.caddy.save_config()
                caddy_modified = True  # Mark immediately after save
                
                # Verify backup was created
                caddy_backup = f"{self.caddy.caddyfile_path}.backup"
                if not os.path.exists(caddy_backup):
                    raise RuntimeError(f"Failed to create backup: {caddy_backup}")
            
            logger.info(f"Service '{service_name}' deployed successfully")
            return True, f"Service '{service_name}' deployed successfully"
            
        except Exception as e:
            logger.error(f"Error deploying service: {e}")
            
            # Rollback changes by restoring from backups
            rollback_errors = []
            
            if compose_modified:
                try:
                    logger.warning("Rolling back docker-compose changes...")
                    backup_path = f"{self.compose.compose_file_path}.backup"
                    if os.path.exists(backup_path):
                        shutil.copy2(backup_path, self.compose.compose_file_path)
                        self.compose.load_config()  # Reload from restored file - errors bubble up
                        logger.info("Restored docker-compose from backup")
                    else:
                        rollback_errors.append("Compose backup file not found")
                except Exception as rollback_error:
                    rollback_errors.append(f"Compose rollback: {str(rollback_error)}")
            
            if env_modified:
                try:
                    logger.warning("Rolling back environment variable changes...")
                    backup_path = f"{self.env.env_file_path}.backup"
                    if os.path.exists(backup_path):
                        shutil.copy2(backup_path, self.env.env_file_path)
                        self.env.load_env()  # Reload from restored file - errors bubble up
                        logger.info("Restored .env from backup")
                    else:
                        rollback_errors.append("Env backup file not found")
                except Exception as rollback_error:
                    rollback_errors.append(f"Env rollback: {str(rollback_error)}")
            
            if caddy_modified:
                try:
                    logger.warning("Rolling back Caddy configuration...")
                    backup_path = f"{self.caddy.caddyfile_path}.backup"
                    if os.path.exists(backup_path):
                        shutil.copy2(backup_path, self.caddy.caddyfile_path)
                        self.caddy.load_config()  # Reload from restored file - errors bubble up
                        logger.info("Restored Caddyfile from backup")
                    else:
                        rollback_errors.append("Caddy backup file not found")
                except Exception as rollback_error:
                    rollback_errors.append(f"Caddy rollback: {str(rollback_error)}")
            
            if rollback_errors:
                logger.error(f"Rollback had errors: {'; '.join(rollback_errors)}")
                return False, f"Deployment failed: {str(e)}. Rollback had errors: {'; '.join(rollback_errors)}"
            
            logger.info("Rollback completed successfully")
            
            return False, f"Deployment failed and rolled back: {str(e)}"
    
    def _prepare_environment_vars(self,
                                  template: ServiceTemplate,
                                  service_name: str,
                                  user_provided: Dict[str, str]) -> Dict[str, str]:
        """
        Prepare complete environment variables including defaults and auto-generated secrets
        
        Returns:
            Complete dictionary of environment variables ready for deployment
        """
        import secrets
        
        complete_vars = {}
        
        for key, meta in template.environment_vars.items():
            # Priority: user-provided > auto-generate > default
            if key in user_provided:
                # User provided a value
                complete_vars[key] = user_provided[key]
            elif meta.get('generate'):
                # Auto-generate secret
                secret_length = meta.get('secret_length', 32)
                complete_vars[key] = secrets.token_urlsafe(secret_length)
                logger.info(f"Auto-generated secret for {key}")
            elif 'default' in meta:
                # Use template default
                complete_vars[key] = meta['default']
            elif meta.get('required'):
                # Required but not provided - this will cause deployment to fail
                logger.warning(f"Required environment variable {key} not provided and has no default")
        
        return complete_vars
    
    def _build_service_config(self,
                             template: ServiceTemplate,
                             service_name: str,
                             environment_vars: Dict[str, str],
                             custom_config: Dict[str, Any]) -> Dict[str, Any]:
        """Build the docker-compose service configuration with complete environment variables"""
        config: Dict[str, Any] = {
            'image': template.image,
            'container_name': service_name,
            'restart': 'unless-stopped'
        }
        
        # Add environment variables - ALL of them (includes defaults + generated + user-provided)
        if environment_vars:
            env_list = []
            for key, value in environment_vars.items():
                env_list.append(f"{key}={value}")
            config['environment'] = env_list
        
        # Add volumes (replace placeholder with actual service name)
        if template.volumes:
            config['volumes'] = [
                vol.replace('{service_name}', service_name) 
                for vol in template.volumes
            ]
        
        # Add ports
        if template.ports:
            config['ports'] = template.ports
        
        # Add healthcheck
        if template.healthcheck:
            config['healthcheck'] = template.healthcheck
        
        # Add dependencies
        if template.depends_on:
            config['depends_on'] = template.depends_on
        
        # Add networks
        if template.networks:
            config['networks'] = template.networks
        
        # Merge custom configuration
        if custom_config:
            config.update(custom_config)
        
        return config
    
    def remove_service(self, service_name: str, remove_volumes: bool = False) -> Tuple[bool, str]:
        """
        Remove a deployed service
        
        Args:
            service_name: Name of the service to remove
            remove_volumes: Whether to also remove associated volumes
        
        Returns:
            Tuple of (success, message)
        """
        try:
            # Get service config before removing
            service_config = self.compose.get_service(service_name)
            if not service_config:
                return False, f"Service '{service_name}' not found"
            
            # Remove from docker-compose
            if not self.compose.remove_service(service_name):
                return False, f"Failed to remove service from compose file"
            
            # Remove volumes if requested
            if remove_volumes and 'volumes' in service_config:
                for volume in service_config['volumes']:
                    if ':' in volume:
                        volume_name = volume.split(':')[0]
                        if not volume_name.startswith('/'):
                            # This is a named volume
                            # Note: We don't remove from compose.volumes as other services might use it
                            pass
            
            self.compose.save_config()
            
            logger.info(f"Service '{service_name}' removed successfully")
            return True, f"Service '{service_name}' removed successfully"
            
        except Exception as e:
            logger.error(f"Error removing service: {e}")
            return False, str(e)
    
    def update_service(self, 
                      service_name: str,
                      updates: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Update an existing service configuration
        
        Args:
            service_name: Name of the service to update
            updates: Dictionary of configuration updates
        
        Returns:
            Tuple of (success, message)
        """
        try:
            service_config = self.compose.get_service(service_name)
            if not service_config:
                return False, f"Service '{service_name}' not found"
            
            # Merge updates
            service_config.update(updates)
            
            # Save configuration
            if not self.compose.update_service(service_name, service_config):
                return False, f"Failed to update service configuration"
            
            self.compose.save_config()
            
            logger.info(f"Service '{service_name}' updated successfully")
            return True, f"Service '{service_name}' updated successfully"
            
        except Exception as e:
            logger.error(f"Error updating service: {e}")
            return False, str(e)
    
    def get_service_status(self, service_name: str) -> Optional[Dict[str, Any]]:
        """Get the current status and configuration of a service"""
        config = self.compose.get_service(service_name)
        if not config:
            return None
        
        # Try to get runtime status from Docker
        try:
            result = subprocess.run(
                ['docker', 'inspect', service_name],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                import json
                runtime_info = json.loads(result.stdout)[0]
                status = {
                    'name': service_name,
                    'config': config,
                    'state': runtime_info['State'],
                    'created': runtime_info['Created'],
                    'image': runtime_info['Config']['Image']
                }
            else:
                status = {
                    'name': service_name,
                    'config': config,
                    'state': {'Running': False},
                    'message': 'Container not found'
                }
        except Exception as e:
            status = {
                'name': service_name,
                'config': config,
                'state': {'Running': False},
                'error': str(e)
            }
        
        return status
    
    def rebuild_service(self, service_name: str) -> Tuple[bool, str]:
        """Rebuild and restart a service"""
        try:
            result = subprocess.run(
                ['docker', 'compose', '-f', self.compose.compose_file_path, 'up', '-d', '--build', service_name],
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                return True, f"Service '{service_name}' rebuilt successfully"
            else:
                return False, f"Failed to rebuild service: {result.stderr}"
                
        except Exception as e:
            logger.error(f"Error rebuilding service: {e}")
            return False, str(e)
    
    def list_all_services(self) -> List[Dict[str, Any]]:
        """List all deployed services with their status"""
        services = []
        for service_name in self.compose.list_services():
            status = self.get_service_status(service_name)
            if status:
                services.append(status)
        return services
