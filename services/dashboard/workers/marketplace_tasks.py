"""
Marketplace Celery Tasks
Background tasks for marketplace app installation and management
"""

import logging
import subprocess
from pathlib import Path
from celery_app import celery_app
from services.db_service import db_service

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name='marketplace.install_app')
def install_marketplace_app(self, deployment_id: str):
    """
    Background task to install marketplace app from template
    
    Args:
        deployment_id: UUID of the deployment record
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        logger.info(f"Starting marketplace installation for deployment {deployment_id}")
        
        if not db_service.is_available:
            logger.error("Database service not available")
            return False
        
        from models.marketplace import MarketplaceDeployment
        
        with db_service.get_session() as session:
            deployment = session.get(MarketplaceDeployment, deployment_id)
            
            if not deployment:
                logger.error(f"Deployment {deployment_id} not found")
                return False
            
            compose_path = Path(deployment.compose_path)
            deployment_dir = compose_path.parent
            
            if not compose_path.exists():
                error_msg = f"Docker compose file not found: {compose_path}"
                logger.error(error_msg)
                deployment.status = 'error'
                deployment.error_message = error_msg
                session.commit()
                return False
            
            # Run docker-compose up in deployment directory
            logger.info(f"Running docker-compose up for {deployment_id} in {deployment_dir}")
            
            result = subprocess.run(
                ['docker-compose', 'up', '-d'],
                cwd=deployment_dir,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully installed deployment {deployment_id}")
                deployment.status = 'running'
                deployment.error_message = None
                session.commit()
                return True
            else:
                error_msg = f"docker-compose failed: {result.stderr}"
                logger.error(error_msg)
                deployment.status = 'error'
                deployment.error_message = error_msg
                session.commit()
                return False
    
    except Exception as e:
        error_msg = f"Error installing marketplace app: {str(e)}"
        logger.error(error_msg, exc_info=True)
        
        try:
            if db_service.is_available:
                from models.marketplace import MarketplaceDeployment
                with db_service.get_session() as session:
                    deployment = session.get(MarketplaceDeployment, deployment_id)
                    if deployment:
                        deployment.status = 'error'
                        deployment.error_message = error_msg
                        session.commit()
        except Exception as db_error:
            logger.error(f"Failed to update deployment status: {db_error}")
        
        return False


@celery_app.task(bind=True, name='marketplace.uninstall_app')
def uninstall_marketplace_app(self, deployment_id: str, remove_volumes: bool = False):
    """
    Background task to uninstall marketplace app
    
    Args:
        deployment_id: UUID of the deployment record
        remove_volumes: Whether to remove Docker volumes
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        logger.info(f"Starting marketplace uninstall for deployment {deployment_id}")
        
        if not db_service.is_available:
            logger.error("Database service not available")
            return False
        
        from models.marketplace import MarketplaceDeployment
        import shutil
        
        with db_service.get_session() as session:
            deployment = session.get(MarketplaceDeployment, deployment_id)
            
            if not deployment:
                logger.error(f"Deployment {deployment_id} not found")
                return False
            
            compose_path = Path(deployment.compose_path)
            deployment_dir = compose_path.parent
            
            if compose_path.exists():
                # Run docker-compose down
                logger.info(f"Running docker-compose down for {deployment_id}")
                
                cmd = ['docker-compose', 'down']
                if remove_volumes:
                    cmd.append('-v')
                
                result = subprocess.run(
                    cmd,
                    cwd=deployment_dir,
                    capture_output=True,
                    text=True
                )
                
                if result.returncode != 0:
                    logger.warning(f"docker-compose down returned non-zero: {result.stderr}")
            
            # Remove deployment directory
            if deployment_dir.exists():
                logger.info(f"Removing deployment directory: {deployment_dir}")
                shutil.rmtree(deployment_dir)
            
            # Delete deployment record
            session.delete(deployment)
            session.commit()
            
            logger.info(f"Successfully uninstalled deployment {deployment_id}")
            return True
    
    except Exception as e:
        logger.error(f"Error uninstalling marketplace app: {e}", exc_info=True)
        return False
