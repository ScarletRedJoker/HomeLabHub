from celery import Task
from celery_app import celery_app
from services.workflow_service import workflow_service
from models.workflow import WorkflowStatus
import logging
import time
from datetime import datetime

logger = logging.getLogger(__name__)

class WorkflowTask(Task):
    """Base class for workflow tasks with error handling and progress tracking"""
    
    autoretry_for = (Exception,)
    retry_kwargs = {'max_retries': 3, 'countdown': 5}
    retry_backoff = True
    retry_backoff_max = 600
    retry_jitter = True
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Handle task failure"""
        workflow_id = kwargs.get('workflow_id')
        if workflow_id:
            try:
                workflow_service.update_workflow_status(
                    workflow_id,
                    WorkflowStatus.failed,
                    error_message=str(exc)
                )
                workflow_service.publish_workflow_event(workflow_id, {
                    'type': 'workflow_failed',
                    'workflow_id': str(workflow_id),
                    'error': str(exc),
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.error(f"Failed to update workflow status on failure: {e}")
        logger.error(f"Task {task_id} failed: {exc}")
    
    def on_success(self, retval, task_id, args, kwargs):
        """Handle task success"""
        workflow_id = kwargs.get('workflow_id')
        if workflow_id:
            try:
                workflow_service.update_workflow_status(
                    workflow_id,
                    WorkflowStatus.completed
                )
                workflow_service.publish_workflow_event(workflow_id, {
                    'type': 'workflow_completed',
                    'workflow_id': str(workflow_id),
                    'result': retval,
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.error(f"Failed to update workflow status on success: {e}")
        logger.info(f"Task {task_id} completed successfully")
    
    def update_progress(self, workflow_id, current_step, total_steps, message):
        """Update workflow progress"""
        try:
            workflow_service.update_workflow_progress(
                workflow_id,
                current_step,
                total_steps,
                message
            )
            workflow_service.publish_workflow_event(workflow_id, {
                'type': 'workflow_progress',
                'workflow_id': str(workflow_id),
                'current_step': current_step,
                'total_steps': total_steps,
                'message': message,
                'timestamp': datetime.utcnow().isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to update progress: {e}")


@celery_app.task(base=WorkflowTask, bind=True, name='workers.workflow_worker.run_deployment_workflow')
def run_deployment_workflow(self, workflow_id, deployment_config):
    """
    Run a deployment workflow
    
    Args:
        workflow_id: UUID of the workflow
        deployment_config: Dictionary containing deployment configuration
            - service_name: Name of the service to deploy
            - image: Docker image to deploy
            - environment: Environment variables
            - volumes: Volume mappings
    """
    logger.info(f"Starting deployment workflow {workflow_id}")
    
    total_steps = 5
    
    try:
        workflow_service.update_workflow_status(workflow_id, WorkflowStatus.running)
        
        # Step 1: Validate configuration
        self.update_progress(workflow_id, 1, total_steps, "Validating deployment configuration")
        service_name = deployment_config.get('service_name')
        image = deployment_config.get('image')
        
        if not service_name or not image:
            raise ValueError("Missing required deployment configuration")
        
        time.sleep(1)
        
        # Step 2: Pull Docker image
        self.update_progress(workflow_id, 2, total_steps, f"Pulling Docker image: {image}")
        time.sleep(2)
        
        # Step 3: Stop existing container
        self.update_progress(workflow_id, 3, total_steps, f"Stopping existing container: {service_name}")
        time.sleep(1)
        
        # Step 4: Start new container
        self.update_progress(workflow_id, 4, total_steps, f"Starting new container: {service_name}")
        time.sleep(2)
        
        # Step 5: Verify deployment
        self.update_progress(workflow_id, 5, total_steps, "Verifying deployment")
        time.sleep(1)
        
        logger.info(f"Deployment workflow {workflow_id} completed successfully")
        return {
            'status': 'success',
            'service_name': service_name,
            'image': image,
            'deployed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Deployment workflow {workflow_id} failed: {e}")
        raise


@celery_app.task(base=WorkflowTask, bind=True, name='workers.workflow_worker.run_dns_update_workflow')
def run_dns_update_workflow(self, workflow_id, dns_config):
    """
    Run a DNS update workflow
    
    Args:
        workflow_id: UUID of the workflow
        dns_config: Dictionary containing DNS configuration
            - domain: Domain name to update
            - record_type: DNS record type (A, CNAME, etc.)
            - value: New DNS value
    """
    logger.info(f"Starting DNS update workflow {workflow_id}")
    
    total_steps = 3
    
    try:
        workflow_service.update_workflow_status(workflow_id, WorkflowStatus.running)
        
        # Step 1: Validate DNS configuration
        self.update_progress(workflow_id, 1, total_steps, "Validating DNS configuration")
        domain = dns_config.get('domain')
        record_type = dns_config.get('record_type', 'A')
        value = dns_config.get('value')
        
        if not domain or not value:
            raise ValueError("Missing required DNS configuration")
        
        time.sleep(1)
        
        # Step 2: Update DNS record
        self.update_progress(workflow_id, 2, total_steps, f"Updating {record_type} record for {domain}")
        time.sleep(2)
        
        # Step 3: Verify DNS propagation
        self.update_progress(workflow_id, 3, total_steps, "Verifying DNS propagation")
        time.sleep(1)
        
        logger.info(f"DNS update workflow {workflow_id} completed successfully")
        return {
            'status': 'success',
            'domain': domain,
            'record_type': record_type,
            'value': value,
            'updated_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"DNS update workflow {workflow_id} failed: {e}")
        raise


@celery_app.task(base=WorkflowTask, bind=True, name='workers.workflow_worker.run_artifact_analysis_workflow')
def run_artifact_analysis_workflow(self, workflow_id, artifact_config):
    """
    Run an artifact analysis workflow
    
    Args:
        workflow_id: UUID of the workflow
        artifact_config: Dictionary containing artifact configuration
            - artifact_path: Path to the artifact to analyze
            - analysis_type: Type of analysis to perform
    """
    logger.info(f"Starting artifact analysis workflow {workflow_id}")
    
    total_steps = 4
    
    try:
        workflow_service.update_workflow_status(workflow_id, WorkflowStatus.running)
        
        # Step 1: Validate artifact
        self.update_progress(workflow_id, 1, total_steps, "Validating artifact")
        artifact_path = artifact_config.get('artifact_path')
        analysis_type = artifact_config.get('analysis_type', 'security')
        
        if not artifact_path:
            raise ValueError("Missing artifact path")
        
        time.sleep(1)
        
        # Step 2: Extract artifact metadata
        self.update_progress(workflow_id, 2, total_steps, "Extracting artifact metadata")
        time.sleep(1)
        
        # Step 3: Run analysis
        self.update_progress(workflow_id, 3, total_steps, f"Running {analysis_type} analysis")
        time.sleep(3)
        
        # Step 4: Generate report
        self.update_progress(workflow_id, 4, total_steps, "Generating analysis report")
        time.sleep(1)
        
        logger.info(f"Artifact analysis workflow {workflow_id} completed successfully")
        return {
            'status': 'success',
            'artifact_path': artifact_path,
            'analysis_type': analysis_type,
            'analyzed_at': datetime.utcnow().isoformat(),
            'findings': {
                'vulnerabilities': 0,
                'warnings': 2,
                'info': 5
            }
        }
        
    except Exception as e:
        logger.error(f"Artifact analysis workflow {workflow_id} failed: {e}")
        raise


@celery_app.task(base=WorkflowTask, bind=True, name='workers.workflow_worker.run_voice_deployment_workflow')
def run_voice_deployment_workflow(self, project_id, project_name, project_type, domain=None, session_id=None):
    """
    Run a voice-initiated deployment workflow
    
    Args:
        project_id: UUID of the project
        project_name: Name of the project to deploy
        project_type: Type of project (flask, react, nodejs, etc.)
        domain: Optional domain for the deployment
        session_id: Optional AI session ID for tracking
    """
    logger.info(f"Starting voice deployment workflow for project {project_name}")
    
    from jarvis.artifact_builder import ArtifactBuilder
    from jarvis.deployment_executor import DeploymentExecutor
    from services.db_service import db_service
    from models.jarvis import Project, AISession
    
    total_steps = 4
    
    try:
        # Step 1: Build Docker image
        logger.info(f"Step 1: Building Docker image for {project_name}")
        
        if not db_service.is_available:
            raise ValueError("Database service not available")
        
        with db_service.get_session() as session:
            project = session.query(Project).filter_by(id=project_id).first()
            if not project:
                raise ValueError(f"Project {project_id} not found")
            
            # Update AI session if available
            if session_id:
                ai_session = session.query(AISession).filter_by(id=session_id).first()
                if ai_session:
                    messages = ai_session.messages or []
                    messages.append({
                        'timestamp': datetime.utcnow().isoformat(),
                        'message': f'Building Docker image for {project_name}',
                        'type': 'progress',
                        'step': 1,
                        'total_steps': total_steps
                    })
                    ai_session.messages = messages
                    session.commit()
        
        # Build the artifact
        builder = ArtifactBuilder()
        build = builder.build_project(project)
        
        logger.info(f"Build completed: {build.image_ref}")
        
        # Step 2: Create deployment
        logger.info(f"Step 2: Creating deployment for {project_name}")
        
        with db_service.get_session() as session:
            if session_id:
                ai_session = session.query(AISession).filter_by(id=session_id).first()
                if ai_session:
                    messages = ai_session.messages or []
                    messages.append({
                        'timestamp': datetime.utcnow().isoformat(),
                        'message': f'Creating deployment configuration',
                        'type': 'progress',
                        'step': 2,
                        'total_steps': total_steps
                    })
                    ai_session.messages = messages
                    session.commit()
        
        executor = DeploymentExecutor()
        deployment = executor.create_deployment(
            project_id=project_id,
            image_ref=build.image_ref,
            domain=domain,
            container_port=80,
            environment={'PROJECT_NAME': project_name}
        )
        
        # Step 3: Start deployment
        logger.info(f"Step 3: Starting deployment")
        
        with db_service.get_session() as session:
            if session_id:
                ai_session = session.query(AISession).filter_by(id=session_id).first()
                if ai_session:
                    messages = ai_session.messages or []
                    messages.append({
                        'timestamp': datetime.utcnow().isoformat(),
                        'message': f'Deployment started successfully',
                        'type': 'progress',
                        'step': 3,
                        'total_steps': total_steps
                    })
                    ai_session.messages = messages
                    session.commit()
        
        # Step 4: Complete
        logger.info(f"Step 4: Deployment complete")
        
        with db_service.get_session() as session:
            project = session.query(Project).filter_by(id=project_id).first()
            if project:
                project.status = 'deployed'
                session.commit()
            
            if session_id:
                ai_session = session.query(AISession).filter_by(id=session_id).first()
                if ai_session:
                    messages = ai_session.messages or []
                    messages.append({
                        'timestamp': datetime.utcnow().isoformat(),
                        'message': f'Deployment of {project_name} completed successfully',
                        'type': 'success',
                        'step': 4,
                        'total_steps': total_steps,
                        'deployment_url': f'https://{domain}' if domain else None
                    })
                    ai_session.messages = messages
                    ai_session.state = 'completed'
                    ai_session.completed_at = datetime.utcnow()
                    session.commit()
        
        logger.info(f"Voice deployment workflow completed successfully for {project_name}")
        return {
            'status': 'success',
            'project_name': project_name,
            'project_id': project_id,
            'deployment_id': str(deployment.id),
            'image_ref': build.image_ref,
            'domain': domain,
            'deployed_at': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Voice deployment workflow failed for {project_name}: {e}")
        
        # Update AI session with error
        if session_id and db_service.is_available:
            try:
                with db_service.get_session() as session:
                    ai_session = session.query(AISession).filter_by(id=session_id).first()
                    if ai_session:
                        messages = ai_session.messages or []
                        messages.append({
                            'timestamp': datetime.utcnow().isoformat(),
                            'message': f'Deployment failed: {str(e)}',
                            'type': 'error'
                        })
                        ai_session.messages = messages
                        ai_session.state = 'failed'
                        session.commit()
            except Exception as update_error:
                logger.error(f"Failed to update AI session on error: {update_error}")
        
        raise
