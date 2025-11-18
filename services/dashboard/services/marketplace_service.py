"""
Marketplace Service
Handles deployment and management of marketplace applications
"""

import logging
import subprocess
import secrets
import string
import re
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime
import docker
from sqlalchemy import select
from services.caddy_manager import CaddyManager
from services.db_service import db_service

logger = logging.getLogger(__name__)


class MarketplaceService:
    """Service for deploying and managing marketplace applications"""
    
    def __init__(self, caddyfile_path: str = 'Caddyfile'):
        self.caddy_manager = CaddyManager(caddyfile_path)
        try:
            self.docker_client = docker.from_env()
        except Exception as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            self.docker_client = None
    
    def generate_secure_password(self, length: int = 24) -> str:
        """Generate a secure random password"""
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        # Ensure it has at least one of each type
        if not any(c.islower() for c in password):
            password = password[:-1] + secrets.choice(string.ascii_lowercase)
        if not any(c.isupper() for c in password):
            password = password[:-1] + secrets.choice(string.ascii_uppercase)
        if not any(c.isdigit() for c in password):
            password = password[:-1] + secrets.choice(string.digits)
        return password
    
    def check_port_available(self, port: int) -> bool:
        """Check if a port is available"""
        try:
            if not self.docker_client:
                return True  # Assume available if can't check
            
            # Check if any container is using this port
            containers = self.docker_client.containers.list()
            for container in containers:
                ports = container.attrs.get('NetworkSettings', {}).get('Ports', {})
                for port_mapping in ports.values():
                    if port_mapping:
                        for mapping in port_mapping:
                            if mapping.get('HostPort') == str(port):
                                logger.warning(f"Port {port} already in use by {container.name}")
                                return False
            return True
        except Exception as e:
            logger.error(f"Error checking port availability: {e}")
            return True  # Assume available on error
    
    def find_available_port(self, start_port: int = 8000, end_port: int = 9000) -> Optional[int]:
        """Find an available port in the given range"""
        for port in range(start_port, end_port):
            if self.check_port_available(port):
                return port
        return None
    
    def create_database(self, db_name: str, db_user: str, db_password: str, db_type: str = 'postgres') -> Tuple[bool, str]:
        """Create a database for an app using the existing PostgreSQL container"""
        try:
            if db_type.lower() != 'postgres':
                return False, f"Unsupported database type: {db_type}"
            
            if not self.docker_client:
                return False, "Docker client not available"
            
            # Find the PostgreSQL container
            postgres_container = None
            try:
                postgres_container = self.docker_client.containers.get('discord-bot-db')
            except docker.errors.NotFound:
                return False, "PostgreSQL container 'discord-bot-db' not found"
            
            # Create user and database
            commands = [
                f"psql -U postgres -c \"CREATE USER {db_user} WITH PASSWORD '{db_password}';\"",
                f"psql -U postgres -c \"CREATE DATABASE {db_name} OWNER {db_user};\"",
                f"psql -U postgres -c \"GRANT ALL PRIVILEGES ON DATABASE {db_name} TO {db_user};\""
            ]
            
            for cmd in commands:
                exit_code, output = postgres_container.exec_run(cmd, environment={'PGPASSWORD': 'postgres'})
                if exit_code != 0 and b'already exists' not in output:
                    logger.error(f"Database creation command failed: {output.decode()}")
                    # Continue anyway - might already exist
            
            logger.info(f"Database '{db_name}' created successfully for user '{db_user}'")
            return True, f"Database '{db_name}' created successfully"
            
        except Exception as e:
            logger.error(f"Error creating database: {e}")
            return False, str(e)
    
    def configure_reverse_proxy(self, domain: str, container_name: str, port: int) -> Tuple[bool, str]:
        """Add Caddy reverse proxy configuration for an app"""
        try:
            internal_url = f"http://{container_name}:{port}"
            self.caddy_manager.add_service(domain, internal_url)
            self.caddy_manager.save_config()
            
            # Reload Caddy to apply changes
            try:
                if self.docker_client:
                    caddy_container = self.docker_client.containers.get('caddy')
                    exit_code, output = caddy_container.exec_run('caddy reload --config /etc/caddy/Caddyfile')
                    if exit_code != 0:
                        logger.warning(f"Caddy reload returned non-zero: {output.decode()}")
            except Exception as e:
                logger.warning(f"Could not reload Caddy (config saved, manual reload needed): {e}")
            
            logger.info(f"Reverse proxy configured for {domain} -> {internal_url}")
            return True, f"Reverse proxy configured for {domain}"
            
        except Exception as e:
            logger.error(f"Error configuring reverse proxy: {e}")
            return False, str(e)
    
    def deploy_app(self, app_slug: str, user_config: Dict[str, Any]) -> Tuple[bool, str, Optional[int]]:
        """
        Deploy an app from the marketplace
        
        Returns:
            Tuple of (success, message, deployment_id)
        """
        try:
            if not db_service.is_available:
                return False, "Database service not available", None
            
            # Get app from database
            from models.marketplace import MarketplaceApp, DeployedApp
            
            with db_service.get_session() as session:
                app = session.execute(
                    select(MarketplaceApp).where(MarketplaceApp.slug == app_slug)
                ).scalar_one_or_none()
                
                if not app:
                    return False, f"App '{app_slug}' not found in marketplace", None
                
                # Generate container name
                container_name = f"marketplace-{app_slug}-{secrets.token_hex(4)}"
                
                # Validate and prepare port
                port = user_config.get('port', app.default_port)
                if not self.check_port_available(port):
                    # Try to find available port
                    port = self.find_available_port()
                    if not port:
                        return False, "No available ports in range 8000-9000", None
                    logger.info(f"Original port unavailable, using {port} instead")
                
                # Prepare environment variables
                env_vars = {}
                for key, template in app.env_template.items():
                    if key in user_config:
                        # User provided value
                        env_vars[key] = user_config[key]
                    elif template.get('generate'):
                        # Auto-generate secure password
                        env_vars[key] = self.generate_secure_password()
                    elif 'default' in template:
                        # Use default value
                        env_vars[key] = template['default']
                    elif template.get('required'):
                        return False, f"Missing required field: {key}", None
                
                # Add port to env_vars
                env_vars['PORT'] = port
                
                # Create database if needed
                if app.requires_database:
                    db_name = container_name.replace('-', '_')
                    db_user = db_name
                    db_password = env_vars.get('DB_PASSWORD', self.generate_secure_password())
                    env_vars['DB_PASSWORD'] = db_password
                    
                    success, message = self.create_database(db_name, db_user, db_password, app.db_type)
                    if not success:
                        logger.warning(f"Database creation warning: {message}")
                        # Continue anyway - might already exist
                
                # Create deployed app record
                deployed_app = DeployedApp(
                    app_id=app.id,
                    container_name=container_name,
                    domain=user_config.get('domain'),
                    port=port,
                    env_vars=env_vars,
                    status='deploying',
                    health_status='unknown'
                )
                session.add(deployed_app)
                session.flush()  # Get the ID
                deployment_id = deployed_app.id
                
                # Start Docker container
                try:
                    environment = []
                    config_template = app.config_template
                    
                    # Replace placeholders in environment variables
                    if 'services' in config_template:
                        service_name = list(config_template['services'].keys())[0]
                        service_config = config_template['services'][service_name]
                        
                        if 'environment' in service_config:
                            for env_line in service_config['environment']:
                                # Replace ${VAR} with actual values
                                for key, value in env_vars.items():
                                    env_line = env_line.replace(f'${{{key}}}', str(value))
                                environment.append(env_line)
                    
                    # Prepare volumes
                    volumes = {}
                    if 'volumes' in service_config:
                        for volume in service_config.get('volumes', []):
                            if ':' in volume:
                                parts = volume.split(':')
                                host_path = parts[0]
                                container_path = parts[1]
                                
                                # Create named volume if it's not a bind mount
                                if not host_path.startswith('/') and not host_path.startswith('.'):
                                    volume_name = f"{container_name}_data"
                                    volumes[volume_name] = {'bind': container_path, 'mode': 'rw'}
                    
                    # Deploy container
                    if not self.docker_client:
                        deployed_app.status = 'failed'
                        deployed_app.error_message = "Docker client not available"
                        session.commit()
                        return False, "Docker client not available", deployment_id
                    
                    container = self.docker_client.containers.run(
                        app.docker_image,
                        name=container_name,
                        environment=environment,
                        ports={f'{port}/tcp': port},
                        volumes=volumes,
                        network='homelab',
                        restart_policy={'Name': 'unless-stopped'},
                        detach=True
                    )
                    
                    logger.info(f"Container {container_name} started successfully")
                    
                    # Configure reverse proxy if domain provided
                    if user_config.get('domain'):
                        success, message = self.configure_reverse_proxy(
                            user_config['domain'],
                            container_name,
                            port
                        )
                        if not success:
                            logger.warning(f"Reverse proxy configuration warning: {message}")
                    
                    # Update status
                    deployed_app.status = 'running'
                    deployed_app.health_status = 'healthy'
                    session.commit()
                    
                    return True, f"App '{app.name}' deployed successfully", deployment_id
                    
                except Exception as e:
                    logger.error(f"Error starting container: {e}")
                    deployed_app.status = 'failed'
                    deployed_app.error_message = str(e)
                    session.commit()
                    return False, f"Deployment failed: {str(e)}", deployment_id
                    
        except Exception as e:
            logger.error(f"Error deploying app: {e}")
            return False, str(e), None
    
    def get_deployed_apps(self) -> List[Dict[str, Any]]:
        """Get all deployed apps"""
        try:
            if not db_service.is_available:
                return []
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                deployed_apps = session.execute(select(DeployedApp)).scalars().all()
                return [app.to_dict() for app in deployed_apps]
                
        except Exception as e:
            logger.error(f"Error getting deployed apps: {e}")
            return []
    
    def get_deployed_app(self, deployment_id: int) -> Optional[Dict[str, Any]]:
        """Get a specific deployed app"""
        try:
            if not db_service.is_available:
                return None
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                app = session.get(DeployedApp, deployment_id)
                return app.to_dict() if app else None
                
        except Exception as e:
            logger.error(f"Error getting deployed app: {e}")
            return None
    
    def start_app(self, deployment_id: int) -> Tuple[bool, str]:
        """Start a stopped app"""
        try:
            if not self.docker_client:
                return False, "Docker client not available"
            
            if not db_service.is_available:
                return False, "Database service not available"
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                app = session.get(DeployedApp, deployment_id)
                if not app:
                    return False, "Deployed app not found"
                
                container = self.docker_client.containers.get(app.container_name)
                container.start()
                
                app.status = 'running'
                app.health_status = 'healthy'
                app.last_check = datetime.utcnow()
                session.commit()
                
                return True, "App started successfully"
                
        except Exception as e:
            logger.error(f"Error starting app: {e}")
            return False, str(e)
    
    def stop_app(self, deployment_id: int) -> Tuple[bool, str]:
        """Stop a running app"""
        try:
            if not self.docker_client:
                return False, "Docker client not available"
            
            if not db_service.is_available:
                return False, "Database service not available"
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                app = session.get(DeployedApp, deployment_id)
                if not app:
                    return False, "Deployed app not found"
                
                container = self.docker_client.containers.get(app.container_name)
                container.stop()
                
                app.status = 'stopped'
                app.health_status = 'unknown'
                app.last_check = datetime.utcnow()
                session.commit()
                
                return True, "App stopped successfully"
                
        except Exception as e:
            logger.error(f"Error stopping app: {e}")
            return False, str(e)
    
    def restart_app(self, deployment_id: int) -> Tuple[bool, str]:
        """Restart an app"""
        try:
            if not self.docker_client:
                return False, "Docker client not available"
            
            if not db_service.is_available:
                return False, "Database service not available"
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                app = session.get(DeployedApp, deployment_id)
                if not app:
                    return False, "Deployed app not found"
                
                container = self.docker_client.containers.get(app.container_name)
                container.restart()
                
                app.status = 'running'
                app.health_status = 'healthy'
                app.last_check = datetime.utcnow()
                session.commit()
                
                return True, "App restarted successfully"
                
        except Exception as e:
            logger.error(f"Error restarting app: {e}")
            return False, str(e)
    
    def remove_app(self, deployment_id: int, remove_volumes: bool = False) -> Tuple[bool, str]:
        """Remove a deployed app"""
        try:
            if not self.docker_client:
                return False, "Docker client not available"
            
            if not db_service.is_available:
                return False, "Database service not available"
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                app = session.get(DeployedApp, deployment_id)
                if not app:
                    return False, "Deployed app not found"
                
                container_name = app.container_name
                domain = app.domain
                
                # Stop and remove container
                try:
                    container = self.docker_client.containers.get(container_name)
                    container.stop()
                    container.remove(v=remove_volumes)
                except docker.errors.NotFound:
                    logger.warning(f"Container {container_name} not found, continuing with cleanup")
                
                # Remove from Caddy if domain was configured
                if domain:
                    try:
                        self.caddy_manager.remove_service(domain)
                        self.caddy_manager.save_config()
                        
                        # Reload Caddy
                        caddy_container = self.docker_client.containers.get('caddy')
                        caddy_container.exec_run('caddy reload --config /etc/caddy/Caddyfile')
                    except Exception as e:
                        logger.warning(f"Could not remove Caddy config: {e}")
                
                # Remove from database
                session.delete(app)
                session.commit()
                
                return True, "App removed successfully"
                
        except Exception as e:
            logger.error(f"Error removing app: {e}")
            return False, str(e)
    
    def get_app_logs(self, deployment_id: int, tail: int = 100) -> Tuple[bool, str]:
        """Get logs for a deployed app"""
        try:
            if not self.docker_client:
                return False, "Docker client not available"
            
            if not db_service.is_available:
                return False, "Database service not available"
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                app = session.get(DeployedApp, deployment_id)
                if not app:
                    return False, "Deployed app not found"
                
                container = self.docker_client.containers.get(app.container_name)
                logs = container.logs(tail=tail).decode('utf-8')
                
                return True, logs
                
        except Exception as e:
            logger.error(f"Error getting app logs: {e}")
            return False, str(e)
    
    def check_app_health(self, deployment_id: int) -> Tuple[bool, str, str]:
        """Check health status of a deployed app"""
        try:
            if not self.docker_client:
                return False, "Docker client not available", "unknown"
            
            if not db_service.is_available:
                return False, "Database service not available", "unknown"
            
            from models.marketplace import DeployedApp
            
            with db_service.get_session() as session:
                app = session.get(DeployedApp, deployment_id)
                if not app:
                    return False, "Deployed app not found", "unknown"
                
                try:
                    container = self.docker_client.containers.get(app.container_name)
                    container.reload()
                    
                    status = container.status
                    health = 'healthy' if status == 'running' else 'unhealthy'
                    
                    # Update database
                    app.status = status
                    app.health_status = health
                    app.last_check = datetime.utcnow()
                    session.commit()
                    
                    return True, f"Container is {status}", health
                    
                except docker.errors.NotFound:
                    app.status = 'stopped'
                    app.health_status = 'unhealthy'
                    app.last_check = datetime.utcnow()
                    session.commit()
                    
                    return False, "Container not found", "unhealthy"
                    
        except Exception as e:
            logger.error(f"Error checking app health: {e}")
            return False, str(e), "unknown"
