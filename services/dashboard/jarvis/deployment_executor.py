"""Deployment Executor - Manages docker-compose deployments"""
import os
import hashlib
import logging
import subprocess
from docker.errors import APIError, DockerException
from datetime import datetime
from typing import Dict, Optional
from .compose_templates import generate_compose_spec, compose_to_yaml
from models.jarvis import Project, ComposeSpec
from models.deployment import Deployment, DeploymentStatus
from services.db_service import db_service

logger = logging.getLogger(__name__)

try:
    import docker
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False
    logger.warning("Docker SDK not available")


class DeploymentExecutor:
    """Executes and manages docker-compose deployments"""
    
    def __init__(self, deployments_dir: str = "/tmp/jarvis_deployments"):
        """Initialize deployment executor
        
        Args:
            deployments_dir: Directory to store deployment files
        """
        # Docker SDK is optional - only needed for advanced features
        try:
            self.client = docker.from_env()
            logger.info("Docker SDK initialized successfully")
        except Exception as e:
            logger.warning(f"Docker SDK not available: {e}. CLI-only mode.")
            self.client = None
        
        self.deployments_dir = deployments_dir
        os.makedirs(deployments_dir, exist_ok=True)
        
        # Check docker compose CLI availability
        self._check_docker_compose_cli()
    
    def _check_docker_compose_cli(self):
        """Check if docker compose CLI is available"""
        try:
            result = subprocess.run(
                ['docker', 'compose', 'version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                logger.info(f"Docker Compose CLI available: {result.stdout.strip()}")
                self.compose_available = True
            else:
                logger.warning("Docker Compose CLI check failed")
                self.compose_available = False
        except (FileNotFoundError, subprocess.TimeoutExpired):
            logger.warning("Docker Compose CLI not found")
            self.compose_available = False
        
    def create_deployment(
        self,
        project_id: str,
        image_ref: str,
        domain: Optional[str] = None,
        container_port: int = 80,
        host_port: Optional[int] = None,
        environment: Optional[Dict[str, str]] = None,
        strategy: str = 'rolling'
    ) -> Deployment:
        """Create a new deployment
        
        Args:
            project_id: Project UUID
            image_ref: Docker image reference
            domain: Optional domain for Caddy proxy
            container_port: Port inside container (default: 80)
            host_port: Port on host (None = use Caddy)
            environment: Environment variables
            strategy: Deployment strategy (rolling, blue-green, recreate)
            
        Returns:
            Deployment model instance
            
        Raises:
            ValueError: If Docker or database not available
            RuntimeError: If deployment fails
        """
        if not self.compose_available:
            raise ValueError("Docker Compose CLI not available. Please install: https://docs.docker.com/compose/install/")
            
        if not db_service.is_available:
            raise ValueError("Database not available")
        
        with db_service.get_session() as session:
            # Load project INSIDE this session
            project = session.query(Project).filter_by(id=project_id).first()
            if not project:
                raise ValueError(f"Project {project_id} not found")
            
            # Generate compose spec
            compose_dict = generate_compose_spec(
                project_name=project.name,
                image_ref=image_ref,
                container_port=container_port,
                host_port=host_port,
                environment=environment,
                domain=domain
            )
            
            yaml_content = compose_to_yaml(compose_dict)
            checksum = hashlib.sha256(yaml_content.encode()).hexdigest()
            
            # Create ComposeSpec record
            compose_spec = ComposeSpec(
                project_id=project.id,
                version=1,  # TODO: Increment from latest
                yaml_content=yaml_content,
                checksum=checksum,
                services=compose_dict.get('services'),
                networks=compose_dict.get('networks'),
                is_active=True,
                created_by='jarvis'
            )
            session.add(compose_spec)
            session.commit()
            session.refresh(compose_spec)
            
            # Create Deployment record
            deployment = Deployment(
                workflow_id=None,  # TODO: Link to workflow if available
                service_name=project.name,
                service_type=project.project_type,
                domain=domain,
                status='deploying',
                rollout_strategy=strategy,
                compose_spec_id=compose_spec.id,
                configuration={'image_ref': image_ref}
            )
            session.add(deployment)
            session.commit()
            session.refresh(deployment)
            
            logger.info(f"Created deployment {deployment.id} for project {project.name}")
            
            # Execute deployment
            try:
                self._execute_deployment(deployment, compose_spec, yaml_content)
                
                deployment.status = DeploymentStatus.running
                session.commit()
                
                logger.info(f"Deployment {deployment.id} running successfully")
                
            except Exception as e:
                deployment.status = DeploymentStatus.failed
                session.commit()
                logger.error(f"Deployment {deployment.id} failed: {e}")
                raise
            
            return deployment
    
    def _execute_deployment(self, deployment: Deployment, compose_spec: ComposeSpec, yaml_content: str):
        """Execute the actual deployment
        
        Args:
            deployment: Deployment model instance
            compose_spec: ComposeSpec model instance
            yaml_content: YAML content for docker-compose
            
        Raises:
            RuntimeError: If deployment execution fails
        """
        # Write compose file to disk
        deployment_dir = os.path.join(self.deployments_dir, str(deployment.id))
        os.makedirs(deployment_dir, exist_ok=True)
        
        compose_file = os.path.join(deployment_dir, 'docker-compose.yml')
        with open(compose_file, 'w') as f:
            f.write(yaml_content)
        
        logger.info(f"Wrote compose file: {compose_file}")
        
        # Use docker-compose via subprocess (Docker Python SDK doesn't support compose)
        try:
            # Pull images first
            result = subprocess.run(
                ['docker', 'compose', '-f', compose_file, 'pull'],
                cwd=deployment_dir,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode != 0:
                raise RuntimeError(f"Docker compose pull failed: {result.stderr}")
            
            # Start services
            result = subprocess.run(
                ['docker', 'compose', '-f', compose_file, 'up', '-d'],
                cwd=deployment_dir,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode != 0:
                raise RuntimeError(f"Docker compose up failed: {result.stderr}")
            
            logger.info(f"Deployment executed: {result.stdout}")
            
        except subprocess.TimeoutExpired:
            raise RuntimeError("Deployment timed out")
        except FileNotFoundError:
            raise RuntimeError(
                "Docker Compose CLI not found. "
                "Install with: sudo apt-get install docker-compose-plugin "
                "or see https://docs.docker.com/compose/install/"
            )
    
    def stop_deployment(self, deployment_id: str):
        """Stop a running deployment
        
        Args:
            deployment_id: UUID of the deployment
            
        Raises:
            ValueError: If deployment not found
            RuntimeError: If stop operation fails
        """
        with db_service.get_session() as session:
            deployment = session.query(Deployment).filter_by(id=deployment_id).first()
            
            if not deployment:
                raise ValueError(f"Deployment {deployment_id} not found")
            
            deployment_dir = os.path.join(self.deployments_dir, str(deployment.id))
            compose_file = os.path.join(deployment_dir, 'docker-compose.yml')
            
            if not os.path.exists(compose_file):
                raise ValueError(f"Compose file not found for deployment {deployment_id}")
            
            result = subprocess.run(
                ['docker', 'compose', '-f', compose_file, 'down'],
                cwd=deployment_dir,
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                raise RuntimeError(f"Failed to stop deployment: {result.stderr}")
            
            deployment.status = 'stopped'
            session.commit()
            
            logger.info(f"Stopped deployment {deployment_id}")
    
    def get_deployment_logs(self, deployment_id: str, tail: int = 100) -> str:
        """Get logs from a deployment
        
        Args:
            deployment_id: UUID of the deployment
            tail: Number of log lines to return
            
        Returns:
            Log output as string
        """
        deployment_dir = os.path.join(self.deployments_dir, str(deployment_id))
        compose_file = os.path.join(deployment_dir, 'docker-compose.yml')
        
        if not os.path.exists(compose_file):
            return "Deployment not found"
        
        result = subprocess.run(
            ['docker', 'compose', '-f', compose_file, 'logs', '--tail', str(tail)],
            cwd=deployment_dir,
            capture_output=True,
            text=True
        )
        
        return result.stdout
