from flask import Flask
from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect
import logging
from logging.handlers import RotatingFileHandler
import sys
import os
from datetime import timedelta
from config import Config  # type: ignore[import]
from routes.api import api_bp
from routes.web import web_bp
from routes.deployment_api import deployment_bp
from routes.deployment_routes import jarvis_deployment_bp
from routes.websocket_routes import ws_bp
from routes.upload_routes import upload_bp
from routes.analysis_routes import analysis_bp
from routes.artifact_routes import artifact_bp
from routes.jarvis_voice_api import jarvis_voice_bp
from routes.smart_home_api import smart_home_bp, limiter
from routes.google_services_api import google_services_bp
from routes.marketplace_api import marketplace_bp
from routes.ollama_api import ollama_bp
from routes.agent_api import agent_bp
from routes.plex_routes import plex_bp
from routes.service_ops_routes import service_ops_bp
from routes.storage_routes import storage_bp
from routes.game_streaming_routes import game_streaming_bp
from routes.db_admin_routes import db_admin_bp
from routes.nas_routes import nas_bp
from routes.health_routes import health_bp
from routes.health_monitoring_api import health_monitoring_bp
from routes.storage_optimization_api import storage_optimization_bp
from routes.unified_logs_api import unified_logs_bp
from routes.ai_chat_api import ai_chat_bp
from routes.database_routes import database_bp
from routes.jarvis_control_plane import jarvis_control_bp
from routes.docker_api import docker_bp
from routes.audit_api import audit_bp
from routes.jarvis_ai_api import jarvis_ai_bp
from routes.dns_routes import dns_bp
from routes.fleet_routes import fleet_bp
from routes.jarvis_code_routes import jarvis_code_bp
from routes.jarvis_builder_routes import jarvis_builder_bp
from routes.jarvis_codebase_routes import jarvis_codebase_bp
from routes.setup_routes import setup_bp
from routes.jarvis_infrastructure_api import jarvis_infrastructure_bp
from routes.ops_center_routes import ops_center_bp
from routes.remediation_routes import remediation_bp
from routes.environment_api import environment_bp
from routes.deployment_wizard_routes import deployment_wizard_bp
from routes.database_console_routes import database_console_bp
from routes.storage_dashboard_routes import storage_dashboard_bp
from routes.kvm_routes import kvm_bp
from routes.notification_routes import notification_bp
from routes.organization_routes import org_bp
from routes.network_routes import network_bp
from routes.integration_api import integration_bp
from routes.presence_api import presence_bp
from routes.studio_routes import studio_bp, studio_web_bp
from routes.monitoring_routes import monitoring_bp, monitoring_web_bp
from routes.alert_routes import alert_bp, alert_web_bp
from routes.activity_routes import activity_bp, activity_web_bp
from routes.workflow_routes import workflow_bp, workflow_web_bp
# DISABLED: Subscription/licensing features removed per user request - "Remove subscriptions and don't block access. I never wanted that."
# from routes.subscription_api import subscription_bp
from services.activity_service import activity_service
from services.db_service import db_service
from services.websocket_service import websocket_service
import redis

# Basic logging configuration (console)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)

app = Flask(__name__, 
            template_folder='templates',
            static_folder='static')

app.config.from_object(Config)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True

csrf = CSRFProtect(app)

# Exempt API endpoints that support API key authentication (X-API-Key header)
# These are stateless JSON APIs that don't use session-based CSRF tokens
csrf.exempt(health_bp)  # Read-only health checks
csrf.exempt(ai_chat_bp)  # AI chat API (supports API key auth)
csrf.exempt(api_bp)  # Main API routes (supports API key auth)
csrf.exempt(service_ops_bp)  # Service operations API
csrf.exempt(jarvis_voice_bp)  # Jarvis voice commands API
csrf.exempt(jarvis_control_bp)  # Jarvis control plane API
csrf.exempt(agent_bp)  # Agent swarm API
csrf.exempt(plex_bp)  # Plex media management API
csrf.exempt(storage_bp)  # Storage monitoring API
csrf.exempt(ollama_bp)  # Ollama LLM API
csrf.exempt(deployment_bp)  # Deployment API
csrf.exempt(jarvis_deployment_bp)  # Jarvis deployment API
csrf.exempt(artifact_bp)  # Artifact builder API
csrf.exempt(database_bp)  # Database management API
csrf.exempt(health_monitoring_bp)  # Health monitoring API
csrf.exempt(docker_bp)  # Docker management API
csrf.exempt(audit_bp)  # Audit logs API
csrf.exempt(jarvis_ai_bp)  # Jarvis AI API (remediation, anomalies, enhanced chat)
csrf.exempt(nas_bp)  # NAS management API
csrf.exempt(dns_bp)  # DNS management API (Cloudflare)
csrf.exempt(fleet_bp)  # Fleet management API (remote host control)
csrf.exempt(jarvis_code_bp)  # Jarvis Code API (AI code generation and deployment)
csrf.exempt(jarvis_builder_bp)  # Jarvis Website Builder API (autonomous website generation)
csrf.exempt(setup_bp)  # Setup wizard API (configuration management)
csrf.exempt(jarvis_infrastructure_bp)  # Jarvis Infrastructure API (IaC, deployment planning, cost estimation)
csrf.exempt(ops_center_bp)  # Ops Center API (remote env management, deployment)
csrf.exempt(remediation_bp)  # Remediation API (AI-powered service remediation)
csrf.exempt(kvm_bp)  # KVM Gaming API (Windows VM control)
csrf.exempt(notification_bp)  # Notification Center API
csrf.exempt(org_bp)  # Organization API (multi-tenant management)
csrf.exempt(network_bp)  # Network Discovery API
csrf.exempt(integration_bp)  # Integration Orchestrator API
csrf.exempt(presence_bp)  # Homelab Presence API (Discord Rich Presence)
csrf.exempt(studio_bp)  # Nebula Studio API (Project Workspace Manager)
csrf.exempt(monitoring_bp)  # System Monitoring API (real-time metrics)
csrf.exempt(alert_bp)  # Monitoring Alerts API (threshold-based alerting)
csrf.exempt(activity_bp)  # Activity Feed API (cross-service activity logging)
csrf.exempt(workflow_bp)  # Workflow Builder API (visual automation)

limiter.init_app(app)
logger.info("✓ CSRF Protection and Rate Limiting initialized")
logger.info("✓ API endpoints exempted from CSRF (use API key for auth)")

# Production logging configuration
if not app.debug and os.environ.get('FLASK_ENV') == 'production':
    # Create logs directory if it doesn't exist
    log_dir = os.path.join(os.path.dirname(__file__), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    # Rotating file handler for production
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, 'app.log'),
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setFormatter(logging.Formatter(
        '[%(asctime)s] %(levelname)s in %(module)s: %(message)s'
    ))
    file_handler.setLevel(logging.INFO)
    app.logger.addHandler(file_handler)
    app.logger.setLevel(logging.INFO)
    
    logger.info("Production logging enabled - logs saved to logs/app.log")

# CRITICAL: Validate required environment variables
missing_vars = []
if not os.environ.get('WEB_USERNAME'):
    missing_vars.append('WEB_USERNAME')
if not os.environ.get('WEB_PASSWORD'):
    missing_vars.append('WEB_PASSWORD')

if missing_vars:
    logger.error("=" * 60)
    logger.error("CRITICAL: Missing required environment variables!")
    logger.error(f"Missing: {', '.join(missing_vars)}")
    logger.error("Set these in your .env file before starting the dashboard.")
    logger.error("Example:")
    logger.error("  WEB_USERNAME=your_username")
    logger.error("  WEB_PASSWORD=your_secure_password")
    logger.error("=" * 60)
    sys.exit(1)

# Only show API key warning in development, not in production
# (Production deployment via deploy.sh automatically generates the key)
if not os.environ.get('DASHBOARD_API_KEY') and os.environ.get('FLASK_ENV') != 'production':
    logger.warning("=" * 60)
    logger.warning("DEVELOPMENT: DASHBOARD_API_KEY not set")
    logger.warning("For production deployment, use: ./deploy.sh")
    logger.warning("For manual setup, generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'")
    logger.warning("=" * 60)

CORS(app, resources={r"/api/*": {
    "origins": [
        "https://host.evindrake.net",
        "http://localhost:5000",
        "http://127.0.0.1:5000"
    ],
    "supports_credentials": True,
    "allow_headers": ["Content-Type", "X-API-Key", "Authorization"]
}})

app.register_blueprint(api_bp)
app.register_blueprint(web_bp)
app.register_blueprint(deployment_bp)
app.register_blueprint(jarvis_deployment_bp)
app.register_blueprint(ws_bp)
app.register_blueprint(upload_bp)
app.register_blueprint(analysis_bp)
app.register_blueprint(artifact_bp)
app.register_blueprint(jarvis_voice_bp)
app.register_blueprint(smart_home_bp)
app.register_blueprint(google_services_bp)
app.register_blueprint(marketplace_bp)
app.register_blueprint(ollama_bp)
app.register_blueprint(agent_bp)
app.register_blueprint(plex_bp)
app.register_blueprint(service_ops_bp)
app.register_blueprint(storage_bp)
app.register_blueprint(game_streaming_bp)
app.register_blueprint(db_admin_bp)
app.register_blueprint(nas_bp)
app.register_blueprint(health_bp)
app.register_blueprint(health_monitoring_bp)
app.register_blueprint(storage_optimization_bp)
app.register_blueprint(unified_logs_bp)
app.register_blueprint(ai_chat_bp)
app.register_blueprint(database_bp)
app.register_blueprint(jarvis_control_bp)
app.register_blueprint(docker_bp)
app.register_blueprint(audit_bp)
app.register_blueprint(jarvis_ai_bp)
app.register_blueprint(dns_bp)
app.register_blueprint(fleet_bp)
app.register_blueprint(jarvis_code_bp)
app.register_blueprint(jarvis_builder_bp)
app.register_blueprint(jarvis_codebase_bp)
app.register_blueprint(setup_bp)
app.register_blueprint(jarvis_infrastructure_bp)
app.register_blueprint(ops_center_bp)
app.register_blueprint(remediation_bp)
app.register_blueprint(environment_bp)
app.register_blueprint(deployment_wizard_bp)
app.register_blueprint(database_console_bp)
app.register_blueprint(storage_dashboard_bp)
app.register_blueprint(kvm_bp)
app.register_blueprint(notification_bp)
app.register_blueprint(org_bp)
app.register_blueprint(network_bp)
app.register_blueprint(integration_bp)
app.register_blueprint(presence_bp)
app.register_blueprint(studio_bp)
app.register_blueprint(studio_web_bp)
app.register_blueprint(monitoring_bp)
app.register_blueprint(monitoring_web_bp)
app.register_blueprint(alert_bp)
app.register_blueprint(alert_web_bp)
app.register_blueprint(activity_bp)
app.register_blueprint(activity_web_bp)
app.register_blueprint(workflow_bp)
app.register_blueprint(workflow_web_bp)
# DISABLED: Subscription blueprint disabled - no subscription/licensing checks
# app.register_blueprint(subscription_bp)

# Initialize WebSocket service
websocket_service.init_app(app)
logger.info("✓ WebSocket service initialized")

# Load persisted favicon configurations
logger.info("Loading service favicon configurations...")
try:
    from utils.favicon_manager import get_favicon_manager
    favicon_manager = get_favicon_manager()
    persisted_favicons = favicon_manager.load_favicons()
    
    # Update Config.SERVICES with persisted favicons
    for service_id, favicon_filename in persisted_favicons.items():
        if service_id in Config.SERVICES:
            Config.SERVICES[service_id]['favicon'] = favicon_filename
            logger.info(f"  Loaded favicon for {service_id}: {favicon_filename}")
    
    logger.info(f"✓ Loaded {len(persisted_favicons)} favicon configurations")
except Exception as e:
    logger.warning(f"⚠ Failed to load favicon configurations: {e}")

# Initialize database and run migrations
logger.info("=" * 60)
logger.info("Initializing Jarvis Platform Database")
logger.info("=" * 60)

run_migrations_flag = os.environ.get('RUN_MIGRATIONS', 'true').lower() == 'true'

if db_service.is_available:
    if run_migrations_flag:
        logger.info("Database service is available, running migrations...")
        if db_service.run_migrations():
            logger.info("✓ Database migrations completed successfully")
            db_status = db_service.health_check()
            if db_status['healthy']:
                logger.info("✓ Database health check passed")
                migration_status = db_service.get_migration_status()
                if migration_status.get('available'):
                    logger.info(f"✓ Current migration: {migration_status.get('current_revision', 'None')}")
                    logger.info(f"✓ Latest migration: {migration_status.get('head_revision', 'None')}")
            else:
                logger.warning(f"⚠ Database health check failed: {db_status.get('error')}")
        else:
            logger.warning("⚠ Database migrations failed or skipped")
    else:
        logger.info("RUN_MIGRATIONS=false - Skipping migrations (Celery worker mode)")
        db_status = db_service.health_check()
        if db_status['healthy']:
            logger.info("✓ Database connection verified")
        else:
            logger.warning(f"⚠ Database health check failed: {db_status.get('error')}")
else:
    logger.warning("⚠ Database service not available (JARVIS_DATABASE_URL not set)")
    logger.warning("  The dashboard will run without database-backed features")

logger.info("=" * 60)

# Test Redis connection
logger.info("=" * 60)
logger.info("Testing Redis Connection")
logger.info("=" * 60)

try:
    redis_client = redis.from_url(Config.REDIS_URL)
    redis_client.ping()
    logger.info("✓ Redis connection successful")
    redis_info_result = redis_client.info('server')
    redis_info: dict = redis_info_result if isinstance(redis_info_result, dict) else {}
    logger.info(f"  Redis version: {redis_info.get('redis_version', 'unknown')}")
    logger.info(f"  Redis URL: {Config.REDIS_URL}")
except Exception as e:
    logger.warning(f"⚠ Redis connection failed: {e}")
    logger.warning("  Workflow engine features will be unavailable")

logger.info("=" * 60)

# Initialize marketplace catalog
logger.info("=" * 60)
logger.info("Initializing Marketplace Catalog")
logger.info("=" * 60)

if db_service.is_available:
    try:
        import json
        from models.marketplace import MarketplaceApp
        from sqlalchemy import select
        
        with db_service.get_session() as session:
            # Check if catalog is already loaded
            existing_apps = session.execute(select(MarketplaceApp)).scalars().all()
            
            if len(existing_apps) == 0:
                logger.info("Loading marketplace catalog from data/marketplace_apps.json...")
                catalog_path = os.path.join(os.path.dirname(__file__), 'data', 'marketplace_apps.json')
                
                if os.path.exists(catalog_path):
                    with open(catalog_path, 'r') as f:
                        apps_data = json.load(f)
                    
                    for app_data in apps_data:
                        app = MarketplaceApp(
                            slug=app_data['slug'],
                            name=app_data['name'],
                            category=app_data['category'],
                            description=app_data['description'],
                            long_description=app_data.get('long_description'),
                            icon_url=app_data.get('icon_url'),
                            screenshot_url=app_data.get('screenshot_url'),
                            docker_image=app_data['docker_image'],
                            default_port=app_data['default_port'],
                            requires_database=app_data.get('requires_database', False),
                            db_type=app_data.get('db_type'),
                            config_template=app_data['config_template'],
                            env_template=app_data['env_template'],
                            popularity=app_data.get('popularity', 0)
                        )
                        session.add(app)
                    
                    session.commit()
                    logger.info(f"✓ Loaded {len(apps_data)} apps into marketplace catalog")
                else:
                    logger.warning(f"⚠ Catalog file not found: {catalog_path}")
            else:
                logger.info(f"✓ Marketplace catalog already initialized with {len(existing_apps)} apps")
                
    except Exception as e:
        logger.error(f"⚠ Failed to initialize marketplace catalog: {e}")
else:
    logger.warning("⚠ Skipping marketplace catalog initialization (database not available)")

logger.info("=" * 60)

# Auto-initialize setup wizard settings from environment variables
if db_service.is_available:
    try:
        from models.settings import SystemSetting
        
        with db_service.get_session() as session:
            settings_to_init = [
                ('setup.fleet_ssh.key_path', os.environ.get('FLEET_SSH_KEY_PATH', '/root/.ssh/id_rsa')),
                ('setup.fleet_ssh.linode_user', os.environ.get('FLEET_LINODE_SSH_USER', 'root')),
                ('setup.fleet_ssh.local_user', os.environ.get('FLEET_LOCAL_SSH_USER', 'evin')),
                ('setup.tailscale.linode_ip', os.environ.get('TAILSCALE_LINODE_HOST', '')),
                ('setup.tailscale.local_ip', os.environ.get('TAILSCALE_LOCAL_HOST', '')),
                ('setup.cloud_storage.endpoint', os.environ.get('MINIO_ENDPOINT', '')),
                ('setup.cloud_storage.provider', 'minio'),
            ]
            
            for key, value in settings_to_init:
                if value:
                    existing = session.query(SystemSetting).filter(SystemSetting.key == key).first()
                    if not existing:
                        SystemSetting.set_value(session, key, value, category='setup')
                        logger.info(f"✓ Auto-initialized setting: {key}")
            
        logger.info("✓ Setup wizard settings initialized from environment")
    except Exception as e:
        logger.warning(f"⚠ Could not auto-initialize setup settings: {e}")

activity_service.log_activity(
    'system',
    'Dashboard started successfully',
    'check-circle-fill',
    'success'
)

@app.route('/health')
def health():
    """Health check endpoint with service status"""
    health_status = {
        'status': 'healthy',
        'message': 'Homelab Dashboard is running',
        'services': {
            'database': db_service.is_available,
            'redis': False,
            'websocket': True
        }
    }
    
    try:
        redis_client = redis.from_url(Config.REDIS_URL)
        redis_client.ping()
        health_status['services']['redis'] = True
    except:
        pass
    
    return health_status

if __name__ == '__main__':
    logger.info("Starting Homelab Dashboard...")
    logger.info(f"Dashboard will be available at http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
