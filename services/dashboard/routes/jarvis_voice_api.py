"""Jarvis Voice API - Home Assistant Integration Endpoints"""
from flask import Blueprint, jsonify, request
from datetime import datetime
import logging
import uuid
import re
from sqlalchemy import func

from models.jarvis import Project, ArtifactBuild, SSLCertificate, AISession
from models.deployment import Deployment
from services.db_service import db_service
from services.ai_service import AIService
from jarvis.artifact_builder import ArtifactBuilder
from jarvis.deployment_executor import DeploymentExecutor
from jarvis.personality_profile import PersonalityOrchestrator, PersonalityMode
from celery_app import celery_app
from utils.auth import require_auth

logger = logging.getLogger(__name__)

try:
    import docker
    from docker.errors import DockerException, NotFound, APIError
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False
    docker = None
    logger.warning("Docker SDK not available")

jarvis_voice_bp = Blueprint('jarvis_voice', __name__, url_prefix='/api/jarvis')

ai_service = AIService()
artifact_builder = ArtifactBuilder()
deployment_executor = DeploymentExecutor()
personality = PersonalityOrchestrator()

# Validation patterns for security
ALLOWED_PROJECT_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$')
ALLOWED_DOMAIN_PATTERN = re.compile(r'^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$')
ALLOWED_DB_NAME_PATTERN = re.compile(r'^[a-z0-9][a-z0-9_]{0,63}$')

def validate_project_name(name):
    """Validate project name to prevent injection attacks"""
    if not name or not isinstance(name, str):
        raise ValueError("Invalid project name")
    name = name.strip()
    if not ALLOWED_PROJECT_NAME_PATTERN.match(name):
        raise ValueError("Project name must start with alphanumeric character and contain only letters, numbers, hyphens, and underscores (max 64 chars)")
    if '..' in name or '/' in name or '\\' in name:
        raise ValueError("Project name contains invalid characters")
    return name

def validate_domain(domain):
    """Validate domain name to prevent injection attacks"""
    if not domain or not isinstance(domain, str):
        raise ValueError("Invalid domain")
    domain = domain.lower().strip()
    if not ALLOWED_DOMAIN_PATTERN.match(domain):
        raise ValueError("Invalid domain format")
    if len(domain) > 253:
        raise ValueError("Domain too long")
    return domain

def validate_db_name(name):
    """Validate database name to prevent injection attacks"""
    if not name or not isinstance(name, str):
        raise ValueError("Invalid database name")
    name = name.lower().strip().replace(' ', '_').replace('-', '_')
    if not ALLOWED_DB_NAME_PATTERN.match(name):
        raise ValueError("Database name must start with alphanumeric character and contain only lowercase letters, numbers, and underscores (max 64 chars)")
    return name


@jarvis_voice_bp.route('/voice/deploy', methods=['POST'])
@require_auth
def deploy_project():
    """
    Deploy a website/project using voice commands
    
    Expected input:
    {
        "command": "deploy",
        "params": {
            "project_name": str,
            "project_type": str,
            "domain": str (optional)
        }
    }
    
    Returns:
    {
        "session_id": str,
        "status": "started",
        "message": str,
        "project_id": str,
        "task_id": str
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
        
        params = data.get('params', {})
        project_name = params.get('project_name')
        project_type = params.get('project_type')
        domain = params.get('domain')
        
        if not project_name or not project_type:
            return jsonify({
                'success': False,
                'error': 'Missing required parameters: project_name and project_type'
            }), 400
        
        # Validate inputs to prevent injection attacks
        try:
            project_name = validate_project_name(project_name)
            if domain:
                domain = validate_domain(domain)
        except ValueError as e:
            return jsonify({
                'success': False,
                'error': f'Input validation failed: {str(e)}'
            }), 400
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as session:
            # Create or get project
            project = session.query(Project).filter_by(name=project_name).first()
            
            if not project:
                # Create new project
                project = Project(
                    name=project_name,
                    path=f"/home/evin/contain/{project_name}",
                    project_type=project_type,
                    status='deploying',
                    config={'domain': domain} if domain else {}
                )
                session.add(project)
                session.commit()
                session.refresh(project)
                logger.info(f"Created new project: {project_name}")
            else:
                project.status = 'deploying'
                session.commit()
                logger.info(f"Found existing project: {project_name}")
            
            # Create AI session for tracking
            ai_session = AISession(
                session_type='deployment',
                state='active',
                intent='deploy_project',
                target_project_id=project.id,
                context={
                    'project_name': project_name,
                    'project_type': project_type,
                    'domain': domain,
                    'initiated_via': 'voice'
                },
                messages=[{
                    'timestamp': datetime.utcnow().isoformat(),
                    'message': f"Deploying {project_name} ({project_type})",
                    'type': 'system'
                }]
            )
            session.add(ai_session)
            session.commit()
            session.refresh(ai_session)
            
            # Trigger async Celery task for deployment
            from workers.workflow_worker import run_voice_deployment_workflow
            
            task = run_voice_deployment_workflow.apply_async(
                kwargs={
                    'project_id': str(project.id),
                    'project_name': project_name,
                    'project_type': project_type,
                    'domain': domain,
                    'session_id': str(ai_session.id)
                },
                queue='deployments'
            )
            
            logger.info(f"Started deployment task {task.id} for project {project_name}")
            
            enhanced = personality.enhance_deployment_response(
                success=True,
                project_name=project_name,
                status='started'
            )
            
            return jsonify({
                'success': True,
                'session_id': str(ai_session.id),
                'status': 'started',
                'message': enhanced['message'],
                'project_id': str(project.id),
                'task_id': task.id
            }), 202
    
    except ValueError as ve:
        error_msg = personality.wrap_error('validation_error', str(ve))
        logger.error(f"Validation error in voice deploy: {ve}")
        return jsonify({
            'success': False,
            'error': error_msg
        }), 400
    except Exception as e:
        error_msg = personality.wrap_error('deploy_failed', str(e))
        logger.error(f"Error in voice deploy endpoint: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500


@jarvis_voice_bp.route('/voice/database', methods=['POST'])
@require_auth
def create_database():
    """
    Create a database container using Docker
    
    Expected input:
    {
        "db_type": str (postgres/mysql/mongodb),
        "db_name": str
    }
    
    Returns:
    {
        "session_id": str,
        "status": "created",
        "connection_string": str,
        "container_name": str
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
        
        db_type = data.get('db_type', '').lower()
        db_name_raw = data.get('db_name', '')
        
        if db_type not in ['postgres', 'mysql', 'mongodb']:
            return jsonify({
                'success': False,
                'error': 'Invalid db_type. Must be postgres, mysql, or mongodb'
            }), 400
        
        if not db_name_raw:
            return jsonify({
                'success': False,
                'error': 'db_name is required'
            }), 400
        
        # Validate database name to prevent injection attacks
        try:
            db_name = validate_db_name(db_name_raw)
        except ValueError as e:
            return jsonify({
                'success': False,
                'error': f'Input validation failed: {str(e)}'
            }), 400
        
        # Generate unique container name
        container_name = f"{db_type}_{db_name}"
        session_id = str(uuid.uuid4())
        
        # Docker configurations for different database types
        db_configs = {
            'postgres': {
                'image': 'postgres:15-alpine',
                'env': {
                    'POSTGRES_DB': db_name,
                    'POSTGRES_USER': 'admin',
                    'POSTGRES_PASSWORD': 'admin123'
                },
                'port': 5432,
                'connection_string': f'postgresql://admin:admin123@{container_name}:5432/{db_name}'
            },
            'mysql': {
                'image': 'mysql:8.0',
                'env': {
                    'MYSQL_DATABASE': db_name,
                    'MYSQL_ROOT_PASSWORD': 'rootpass',
                    'MYSQL_USER': 'admin',
                    'MYSQL_PASSWORD': 'admin123'
                },
                'port': 3306,
                'connection_string': f'mysql://admin:admin123@{container_name}:3306/{db_name}'
            },
            'mongodb': {
                'image': 'mongo:7',
                'env': {
                    'MONGO_INITDB_DATABASE': db_name,
                    'MONGO_INITDB_ROOT_USERNAME': 'admin',
                    'MONGO_INITDB_ROOT_PASSWORD': 'admin123'
                },
                'port': 27017,
                'connection_string': f'mongodb://admin:admin123@{container_name}:27017/{db_name}'
            }
        }
        
        config = db_configs[db_type]
        
        if not DOCKER_AVAILABLE or docker is None:
            return jsonify({
                'success': False,
                'error': 'Docker SDK not available'
            }), 503
        
        # Create Docker container
        try:
            client = docker.from_env()
            
            # Check if container already exists
            try:
                existing = client.containers.get(container_name)
                logger.info(f"Container {container_name} already exists")
                
                enhanced = personality.enhance_database_response(
                    success=True,
                    db_name=db_name,
                    db_type=db_type
                )
                
                return jsonify({
                    'success': True,
                    'session_id': session_id,
                    'status': 'exists',
                    'message': enhanced['message'],
                    'connection_string': config['connection_string'],
                    'container_name': container_name,
                    'db_type': db_type
                }), 200
            except NotFound:
                pass
            
            # Create new container
            container = client.containers.run(
                config['image'],
                name=container_name,
                environment=config['env'],
                network='homelab',
                detach=True,
                restart_policy={'Name': 'unless-stopped'}
            )
            
            logger.info(f"Created {db_type} database container: {container_name}")
            
            # Get container ID safely
            container_id = container.id if hasattr(container, 'id') else 'unknown'
            if isinstance(container_id, str) and len(container_id) > 12:
                container_id = container_id[:12]
            
            enhanced = personality.enhance_database_response(
                success=True,
                db_name=db_name,
                db_type=db_type
            )
            
            return jsonify({
                'success': True,
                'session_id': session_id,
                'status': 'created',
                'message': enhanced['message'],
                'connection_string': config['connection_string'],
                'container_name': container_name,
                'container_id': str(container_id),
                'db_type': db_type,
                'port': config['port']
            }), 201
        
        except (DockerException, APIError) as e:
            error_msg = personality.wrap_error('docker_error', str(e))
            logger.error(f"Docker error creating database: {e}")
            return jsonify({
                'success': False,
                'error': error_msg
            }), 500
    
    except ValueError as ve:
        error_msg = personality.wrap_error('validation_error', str(ve))
        logger.error(f"Validation error in voice database: {ve}")
        return jsonify({
            'success': False,
            'error': error_msg
        }), 400
    except Exception as e:
        error_msg = personality.wrap_error('database_error', str(e))
        logger.error(f"Error in voice database endpoint: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500


@jarvis_voice_bp.route('/voice/ssl', methods=['POST'])
@require_auth
def manage_ssl():
    """
    Manage SSL certificates
    
    Expected input:
    {
        "domain": str,
        "action": str (create/renew/check)
    }
    
    Returns:
    {
        "success": bool,
        "status": str,
        "domain": str,
        "expires_at": str (optional),
        "message": str
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
        
        domain_raw = data.get('domain', '')
        action = data.get('action', 'check').lower()
        
        if not domain_raw:
            return jsonify({
                'success': False,
                'error': 'domain is required'
            }), 400
        
        # Validate domain to prevent injection attacks
        try:
            domain = validate_domain(domain_raw)
        except ValueError as e:
            return jsonify({
                'success': False,
                'error': f'Input validation failed: {str(e)}'
            }), 400
        
        if action not in ['create', 'renew', 'check']:
            return jsonify({
                'success': False,
                'error': 'action must be create, renew, or check'
            }), 400
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database service not available'
            }), 503
        
        with db_service.get_session() as session:
            cert = session.query(SSLCertificate).filter_by(domain=domain).first()
            
            if action == 'check':
                if not cert:
                    enhanced = personality.enhance_ssl_response(
                        success=False,
                        domain=domain,
                        action='check'
                    )
                    return jsonify({
                        'success': True,
                        'status': 'not_found',
                        'domain': domain,
                        'message': f'No SSL certificate found for {domain}'
                    }), 404
                
                enhanced = personality.enhance_ssl_response(
                    success=True,
                    domain=domain,
                    action='check'
                )
                
                return jsonify({
                    'success': True,
                    'status': cert.status,
                    'domain': domain,
                    'expires_at': cert.expires_at.isoformat() if cert.expires_at else None,
                    'issued_at': cert.issued_at.isoformat() if cert.issued_at else None,
                    'provider': cert.provider,
                    'auto_renew': cert.auto_renew,
                    'message': enhanced['message']
                }), 200
            
            elif action == 'create':
                if cert:
                    error_msg = personality.wrap_error('general_error', f'SSL certificate for {domain} already exists')
                    return jsonify({
                        'success': False,
                        'status': 'exists',
                        'domain': domain,
                        'message': error_msg
                    }), 409
                
                # Create new SSL certificate record
                cert = SSLCertificate(
                    domain=domain,
                    status='pending',
                    provider='letsencrypt',
                    auto_renew=True
                )
                session.add(cert)
                session.commit()
                session.refresh(cert)
                
                logger.info(f"Created SSL certificate record for {domain}")
                
                enhanced = personality.enhance_ssl_response(
                    success=True,
                    domain=domain,
                    action='create'
                )
                
                return jsonify({
                    'success': True,
                    'status': 'pending',
                    'domain': domain,
                    'message': enhanced['message'],
                    'certificate_id': str(cert.id)
                }), 201
            
            elif action == 'renew':
                if not cert:
                    error_msg = personality.wrap_error('general_error', f'No SSL certificate found for {domain}')
                    return jsonify({
                        'success': False,
                        'status': 'not_found',
                        'domain': domain,
                        'message': error_msg
                    }), 404
                
                # Update renewal status
                cert.status = 'renewing'
                cert.last_renewal_attempt = datetime.utcnow()
                session.commit()
                
                logger.info(f"Initiated SSL renewal for {domain}")
                
                enhanced = personality.enhance_ssl_response(
                    success=True,
                    domain=domain,
                    action='renew'
                )
                
                return jsonify({
                    'success': True,
                    'status': 'renewing',
                    'domain': domain,
                    'message': enhanced['message'],
                    'last_renewal_attempt': cert.last_renewal_attempt.isoformat()
                }), 200
    
    except ValueError as ve:
        error_msg = personality.wrap_error('validation_error', str(ve))
        logger.error(f"Validation error in voice SSL: {ve}")
        return jsonify({
            'success': False,
            'error': error_msg
        }), 400
    except Exception as e:
        error_msg = personality.wrap_error('general_error', str(e))
        logger.error(f"Error in voice SSL endpoint: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500


@jarvis_voice_bp.route('/voice/query', methods=['POST'])
@require_auth
def conversational_query():
    """
    Conversational Q&A with AI assistant
    
    Expected input:
    {
        "session_id": str (optional),
        "message": str
    }
    
    Returns:
    {
        "success": bool,
        "response": str,
        "session_id": str
    }
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No JSON data provided'}), 400
        
        message = data.get('message', '').strip()
        session_id = data.get('session_id')
        
        if not message:
            return jsonify({
                'success': False,
                'error': 'message is required'
            }), 400
        
        if not ai_service.enabled:
            return jsonify({
                'success': False,
                'error': 'AI service is not available. Please check OpenAI API configuration.'
            }), 503
        
        if not db_service.is_available:
            # Fallback to stateless chat if database unavailable
            response = ai_service.chat(message)
            return jsonify({
                'success': True,
                'response': response,
                'session_id': None,
                'warning': 'Database unavailable - session not persisted'
            }), 200
        
        with db_service.get_session() as session:
            # Get or create AI session
            is_new_session = False
            if session_id:
                ai_session = session.query(AISession).filter_by(id=session_id).first()
                if not ai_session:
                    return jsonify({
                        'success': False,
                        'error': f'Session {session_id} not found'
                    }), 404
            else:
                # Create new session
                is_new_session = True
                ai_session = AISession(
                    session_type='conversational',
                    state='active',
                    intent='voice_query',
                    messages=[]
                )
                session.add(ai_session)
                session.commit()
                session.refresh(ai_session)
            
            # Get conversation history
            conversation_history = ai_session.messages or []
            
            # Add greeting for new sessions
            greeting = ""
            if is_new_session:
                greeting = personality.get_greeting() + " "
            
            # Add user message to history
            user_msg = {
                'role': 'user',
                'content': message,
                'timestamp': datetime.utcnow().isoformat()
            }
            conversation_history.append(user_msg)
            
            # Get AI response using conversation history
            # Extract just role and content for AI service
            ai_messages = [{'role': msg['role'], 'content': msg['content']} 
                          for msg in conversation_history if 'role' in msg and 'content' in msg]
            
            response_text = ai_service.chat(message, ai_messages[:-1])
            
            # Prepend greeting for new sessions
            if greeting:
                response_text = greeting + response_text
            
            # Add assistant response to history
            assistant_msg = {
                'role': 'assistant',
                'content': response_text,
                'timestamp': datetime.utcnow().isoformat()
            }
            conversation_history.append(assistant_msg)
            
            # Update session
            ai_session.messages = conversation_history
            ai_session.updated_at = datetime.utcnow()
            session.commit()
            
            logger.info(f"Processed query for session {ai_session.id}")
            
            return jsonify({
                'success': True,
                'response': response_text,
                'session_id': str(ai_session.id),
                'message_count': len(conversation_history)
            }), 200
    
    except Exception as e:
        error_msg = personality.wrap_error('general_error', str(e))
        logger.error(f"Error in voice query endpoint: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': error_msg
        }), 500


@jarvis_voice_bp.route('/status', methods=['GET'])
@require_auth
def get_jarvis_status():
    """
    Get overall Jarvis system status
    
    Returns:
    {
        "success": bool,
        "status": "online",
        "statistics": {
            "active_deployments": int,
            "pending_builds": int,
            "ssl_certificates": int,
            "total_projects": int,
            "active_ai_sessions": int
        },
        "services": {
            "database": bool,
            "ai": bool,
            "docker": bool,
            "celery": bool
        }
    }
    """
    try:
        statistics = {
            'active_deployments': 0,
            'pending_builds': 0,
            'ssl_certificates': 0,
            'total_projects': 0,
            'active_ai_sessions': 0
        }
        
        # Check service availability
        services = {
            'database': db_service.is_available,
            'ai': ai_service.enabled,
            'docker': False,
            'celery': False
        }
        
        # Check Docker
        try:
            docker_client = docker.from_env()
            docker_client.ping()
            services['docker'] = True
        except:
            pass
        
        # Check Celery
        try:
            celery_inspect = celery_app.control.inspect()
            stats = celery_inspect.stats()
            services['celery'] = stats is not None and len(stats) > 0
        except:
            pass
        
        # Get database statistics if available
        if db_service.is_available:
            try:
                with db_service.get_session() as session:
                    statistics['total_projects'] = session.query(func.count(Project.id)).scalar() or 0
                    
                    statistics['pending_builds'] = session.query(func.count(ArtifactBuild.id)).filter(
                        ArtifactBuild.status.in_(['pending', 'building'])
                    ).scalar() or 0
                    
                    statistics['active_deployments'] = session.query(func.count(Deployment.id)).filter(
                        Deployment.status == 'running'
                    ).scalar() or 0
                    
                    statistics['ssl_certificates'] = session.query(func.count(SSLCertificate.id)).filter(
                        SSLCertificate.status == 'active'
                    ).scalar() or 0
                    
                    statistics['active_ai_sessions'] = session.query(func.count(AISession.id)).filter(
                        AISession.state == 'active'
                    ).scalar() or 0
            except Exception as e:
                logger.warning(f"Error fetching statistics: {e}")
        
        return jsonify({
            'success': True,
            'status': 'online',
            'statistics': statistics,
            'services': services,
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    
    except Exception as e:
        logger.error(f"Error in status endpoint: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'status': 'error',
            'error': str(e)
        }), 500
