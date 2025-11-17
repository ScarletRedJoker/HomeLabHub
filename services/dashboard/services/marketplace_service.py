"""
Marketplace Service - Container App Store for Homelab
Provides one-click deployment of curated applications
"""

import logging
import json
import os
import secrets
import string
from typing import Dict, List, Tuple, Optional, Any
from datetime import datetime
from pathlib import Path

from models import (
    get_session,
    ContainerTemplate,
    DeployedContainer,
    ContainerStatus
)
from services.docker_service import DockerService
from services.compose_manager import ComposeManager
from services.caddy_manager import CaddyManager

logger = logging.getLogger(__name__)


class MarketplaceService:
    """Container marketplace orchestration service"""
    
    def __init__(self):
        self.docker_service = DockerService()
        self.compose_manager = ComposeManager()
        self.caddy_manager = CaddyManager()
        self.catalog_path = Path(__file__).parent.parent / 'data' / 'marketplace_catalog.json'
    
    def _generate_password(self, length: int = 32) -> str:
        """Generate a secure random password"""
        alphabet = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(length))
    
    def load_catalog_templates(self) -> Tuple[bool, str]:
        """Load templates from marketplace catalog into database"""
        session = get_session()
        try:
            if not self.catalog_path.exists():
                return False, f"Catalog file not found: {self.catalog_path}"
            
            with open(self.catalog_path, 'r') as f:
                catalog = json.load(f)
            
            templates_data = catalog.get('templates', [])
            loaded = 0
            
            for template_data in templates_data:
                # Check if template already exists
                existing = session.query(ContainerTemplate).filter_by(
                    name=template_data['name']
                ).first()
                
                if existing:
                    logger.info(f"Template {template_data['name']} already exists, skipping")
                    continue
                
                # Create new template
                template = ContainerTemplate(
                    name=template_data['name'],
                    display_name=template_data['display_name'],
                    description=template_data.get('description'),
                    category=template_data['category'],
                    icon_url=template_data.get('icon_url'),
                    docker_image=template_data['docker_image'],
                    compose_template=template_data['compose_template'],
                    required_ports=template_data.get('required_ports', []),
                    required_volumes=template_data.get('required_volumes', []),
                    environment_vars=template_data.get('environment_vars', {}),
                    author=template_data.get('author'),
                    version=template_data.get('version', 'latest'),
                    homepage_url=template_data.get('homepage_url'),
                    documentation_url=template_data.get('documentation_url'),
                    downloads=0,
                    rating=template_data.get('rating', 0.0),
                    featured=template_data.get('featured', False),
                    depends_on=template_data.get('depends_on', []),
                    conflicts_with=template_data.get('conflicts_with', [])
                )
                
                session.add(template)
                loaded += 1
            
            session.commit()
            logger.info(f"Loaded {loaded} templates from catalog")
            return True, f"Successfully loaded {loaded} templates"
            
        except Exception as e:
            session.rollback()
            logger.error(f"Error loading catalog templates: {e}")
            return False, f"Error loading templates: {str(e)}"
        finally:
            session.close()
    
    def get_featured_templates(self) -> List[dict]:
        """Get featured marketplace apps"""
        session = get_session()
        try:
            templates = session.query(ContainerTemplate).filter_by(
                featured=True
            ).order_by(ContainerTemplate.rating.desc()).all()
            
            return [template.to_dict() for template in templates]
        finally:
            session.close()
    
    def get_templates_by_category(self, category: str) -> List[dict]:
        """Get apps by category"""
        session = get_session()
        try:
            if category.lower() == 'all':
                templates = session.query(ContainerTemplate).order_by(
                    ContainerTemplate.rating.desc()
                ).all()
            else:
                templates = session.query(ContainerTemplate).filter_by(
                    category=category
                ).order_by(ContainerTemplate.rating.desc()).all()
            
            return [template.to_dict() for template in templates]
        finally:
            session.close()
    
    def search_templates(self, query: str) -> List[dict]:
        """Search marketplace templates"""
        session = get_session()
        try:
            query_lower = query.lower()
            templates = session.query(ContainerTemplate).filter(
                (ContainerTemplate.name.ilike(f'%{query_lower}%')) |
                (ContainerTemplate.display_name.ilike(f'%{query_lower}%')) |
                (ContainerTemplate.description.ilike(f'%{query_lower}%'))
            ).order_by(ContainerTemplate.rating.desc()).all()
            
            return [template.to_dict() for template in templates]
        finally:
            session.close()
    
    def get_template_details(self, template_id: str) -> Optional[dict]:
        """Get full template info with dependencies"""
        session = get_session()
        try:
            template = session.query(ContainerTemplate).filter_by(
                id=template_id
            ).first()
            
            if not template:
                return None
            
            return template.to_dict()
        finally:
            session.close()
    
    def _check_port_conflicts(self, required_ports: List[int]) -> Tuple[bool, Optional[str]]:
        """Check if required ports are available"""
        containers = self.docker_service.list_all_containers()
        
        for container in containers:
            if container.get('status') != 'running':
                continue
            
            container_ports = container.get('ports', [])
            for port_mapping in container_ports:
                if isinstance(port_mapping, dict):
                    host_port = port_mapping.get('HostPort')
                    if host_port and int(host_port) in required_ports:
                        return False, f"Port {host_port} already in use by {container['name']}"
        
        return True, None
    
    def _resolve_dependencies(self, template: ContainerTemplate) -> Tuple[bool, Optional[str]]:
        """Check and resolve template dependencies"""
        if not template.depends_on:
            return True, None
        
        for dep in template.depends_on:
            # Check if dependency service exists in compose file
            if dep == 'postgres':
                # Check if postgres/discord-bot-db is running
                service = self.compose_manager.get_service('discord-bot-db')
                if not service:
                    return False, "PostgreSQL database service not available. Required for this app."
            
            elif dep == 'redis':
                # Check if Redis is running
                service = self.compose_manager.get_service('redis')
                if not service:
                    return False, "Redis service not available. Required for this app."
            
            elif dep == 'ollama':
                # Check if Ollama is deployed
                session = get_session()
                try:
                    ollama_deployment = session.query(DeployedContainer).filter_by(
                        container_name='ollama'
                    ).first()
                    if not ollama_deployment or ollama_deployment.status != ContainerStatus.running:
                        return False, "Ollama must be deployed and running first. Install Ollama from the marketplace."
                finally:
                    session.close()
        
        return True, None
    
    def _generate_container_config(
        self,
        template: ContainerTemplate,
        container_name: str,
        subdomain: Optional[str],
        custom_env: Dict[str, str]
    ) -> Dict[str, Any]:
        """Generate Docker Compose service configuration"""
        config = dict(template.compose_template)
        
        # Auto-generate passwords for environment variables
        env_vars = config.get('environment', {})
        generated_passwords = {}
        
        for env_var, description in template.environment_vars.items():
            if env_var not in custom_env:
                # Auto-generate password
                password = self._generate_password()
                env_vars[env_var] = password
                generated_passwords[env_var] = password
        
        # Apply custom environment variables
        env_vars.update(custom_env)
        
        # Replace placeholders
        if subdomain:
            for key, value in env_vars.items():
                if isinstance(value, str):
                    env_vars[key] = value.replace('${SUBDOMAIN}', subdomain)
                    env_vars[key] = env_vars[key].replace('${DOMAIN}', os.environ.get('PRIMARY_DOMAIN', 'localhost'))
        
        config['environment'] = env_vars
        config['container_name'] = container_name
        
        # Ensure networks are included
        if 'networks' not in config:
            config['networks'] = ['homelab']
        
        return config, generated_passwords
    
    def deploy_container(
        self,
        template_id: str,
        subdomain: str,
        custom_config: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, Dict[str, Any]]:
        """
        Deploy container from template
        
        Workflow:
        1. Validate template and inputs
        2. Check dependencies
        3. Check port conflicts
        4. Generate docker-compose service config
        5. Add to unified compose file
        6. Create Caddy reverse proxy config
        7. Start container
        8. Monitor health
        9. Return deployment info
        """
        session = get_session()
        deployed_container = None
        
        try:
            # 1. Get template
            template = session.query(ContainerTemplate).filter_by(id=template_id).first()
            if not template:
                return False, {'error': 'Template not found'}
            
            # Generate container name
            container_name = f"marketplace-{template.name}-{subdomain}" if subdomain else f"marketplace-{template.name}"
            
            # Check if already deployed
            existing = session.query(DeployedContainer).filter_by(
                container_name=container_name
            ).first()
            if existing:
                return False, {'error': f'Container with name {container_name} already exists'}
            
            # 2. Resolve dependencies
            deps_ok, deps_error = self._resolve_dependencies(template)
            if not deps_ok:
                return False, {'error': deps_error}
            
            # 3. Check port conflicts
            required_ports = template.required_ports or []
            ports_ok, port_error = self._check_port_conflicts(required_ports)
            if not ports_ok:
                return False, {'error': port_error}
            
            # 4. Generate container configuration
            custom_env = custom_config.get('environment', {}) if custom_config else {}
            container_config, generated_passwords = self._generate_container_config(
                template, container_name, subdomain, custom_env
            )
            
            # Create deployment record
            deployed_container = DeployedContainer(
                template_id=template.id,
                container_name=container_name,
                subdomain=subdomain,
                status=ContainerStatus.deploying,
                custom_env=custom_env,
                custom_volumes=custom_config.get('volumes', {}) if custom_config else {},
                custom_ports=custom_config.get('ports', {}) if custom_config else {}
            )
            session.add(deployed_container)
            session.flush()  # Get ID without committing
            
            # 5. Add service to compose file
            logger.info(f"Adding service {container_name} to compose file")
            self.compose_manager.add_service(container_name, container_config)
            
            # Add required volumes
            for volume in template.required_volumes or []:
                if volume not in self.compose_manager.config.get('volumes', {}):
                    self.compose_manager.add_volume(volume)
            
            # Save compose file
            self.compose_manager.save_config()
            
            # 6. Create Caddy reverse proxy config if subdomain provided
            access_url = None
            if subdomain:
                domain = os.environ.get('PRIMARY_DOMAIN', 'localhost')
                access_url = f"https://{subdomain}.{domain}"
                
                # Detect internal port from config
                internal_port = required_ports[0] if required_ports else 80
                deployed_container.internal_port = internal_port
                deployed_container.access_url = access_url
                
                # Add Caddy config
                success = self.caddy_manager.add_subdomain(
                    subdomain=subdomain,
                    service_name=container_name,
                    port=internal_port
                )
                
                if success:
                    logger.info(f"Added Caddy config for {subdomain}")
            
            # 7. Start container with docker-compose
            logger.info(f"Starting container {container_name}")
            result = self.docker_service.compose_up(service_name=container_name)
            
            if not result.get('success'):
                deployed_container.status = ContainerStatus.failed
                deployed_container.error_message = result.get('message', 'Failed to start container')
                session.commit()
                return False, {
                    'error': 'Failed to start container',
                    'details': result.get('message')
                }
            
            # 8. Update deployment status
            deployed_container.status = ContainerStatus.running
            deployed_container.health_status = 'starting'
            
            # Increment download counter
            template.downloads += 1
            
            session.commit()
            
            # 9. Return deployment info
            return True, {
                'deployment_id': str(deployed_container.id),
                'container_name': container_name,
                'access_url': access_url,
                'status': 'running',
                'generated_passwords': generated_passwords,
                'message': f'Successfully deployed {template.display_name}'
            }
            
        except Exception as e:
            session.rollback()
            logger.error(f"Error deploying container: {e}", exc_info=True)
            
            if deployed_container:
                deployed_container.status = ContainerStatus.failed
                deployed_container.error_message = str(e)
                try:
                    session.commit()
                except:
                    pass
            
            return False, {
                'error': 'Deployment failed',
                'details': str(e)
            }
        finally:
            session.close()
    
    def get_deployments(self) -> List[dict]:
        """List all deployed containers"""
        session = get_session()
        try:
            deployments = session.query(DeployedContainer).order_by(
                DeployedContainer.deployed_at.desc()
            ).all()
            
            return [deployment.to_dict() for deployment in deployments]
        finally:
            session.close()
    
    def get_deployment_status(self, deployment_id: str) -> Optional[dict]:
        """Get deployment status and metrics"""
        session = get_session()
        try:
            deployment = session.query(DeployedContainer).filter_by(
                id=deployment_id
            ).first()
            
            if not deployment:
                return None
            
            # Get live container status
            container_status = self.docker_service.get_container_status(
                deployment.container_name
            )
            
            result = deployment.to_dict()
            if container_status:
                result['container_status'] = container_status
            
            return result
        finally:
            session.close()
    
    def stop_container(self, deployment_id: str) -> Tuple[bool, str]:
        """Stop deployed container"""
        session = get_session()
        try:
            deployment = session.query(DeployedContainer).filter_by(
                id=deployment_id
            ).first()
            
            if not deployment:
                return False, "Deployment not found"
            
            # Stop container
            result = self.docker_service.stop_container(deployment.container_name)
            
            if result.get('success'):
                deployment.status = ContainerStatus.stopped
                deployment.stopped_at = datetime.utcnow()
                session.commit()
                return True, f"Container {deployment.container_name} stopped successfully"
            else:
                return False, result.get('message', 'Failed to stop container')
        except Exception as e:
            session.rollback()
            logger.error(f"Error stopping container: {e}")
            return False, str(e)
        finally:
            session.close()
    
    def remove_container(self, deployment_id: str) -> Tuple[bool, str]:
        """Remove container and cleanup resources"""
        session = get_session()
        try:
            deployment = session.query(DeployedContainer).filter_by(
                id=deployment_id
            ).first()
            
            if not deployment:
                return False, "Deployment not found"
            
            container_name = deployment.container_name
            subdomain = deployment.subdomain
            
            # 1. Stop and remove container
            logger.info(f"Removing container {container_name}")
            stop_result = self.docker_service.stop_container(container_name)
            remove_result = self.docker_service.remove_container(container_name)
            
            # 2. Remove from compose file
            self.compose_manager.remove_service(container_name)
            self.compose_manager.save_config()
            
            # 3. Remove Caddy config if subdomain was used
            if subdomain:
                self.caddy_manager.remove_subdomain(subdomain)
            
            # 4. Remove deployment record
            session.delete(deployment)
            session.commit()
            
            return True, f"Container {container_name} removed successfully"
            
        except Exception as e:
            session.rollback()
            logger.error(f"Error removing container: {e}")
            return False, str(e)
        finally:
            session.close()


# Global marketplace service instance
marketplace_service = MarketplaceService()
