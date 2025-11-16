from flask import Flask
from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect
import logging
from logging.handlers import RotatingFileHandler
import sys
import os
from datetime import timedelta
import structlog
import warnings
from cryptography.utils import CryptographyDeprecationWarning

# Suppress cryptography deprecation warnings from paramiko
warnings.filterwarnings('ignore', category=CryptographyDeprecationWarning)
from config import Config  # type: ignore
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
from routes.jarvis_approval_api import jarvis_approval_bp
from routes.logs_api import logs_api_bp
from routes.celery_analytics_api import celery_analytics_bp
from routes.autonomous_api import autonomous_bp
from routes.domain_api import domain_api_bp
from routes.jarvis_task_api import jarvis_task_bp
from routes.setup_api import setup_bp
from routes.dns_api import dns_bp
from routes.nas_api import nas_bp
from routes.marketplace_api import marketplace_bp
from routes.agent_api import agent_bp
from services.activity_service import activity_service
from services.db_service import db_service
from services.websocket_service import websocket_service
import redis

# Configure structlog for structured JSON logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

# Basic logging configuration (console) - for non-structlog loggers
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Create structlog logger with service metadata
logger = structlog.get_logger('dashboard')
logger = logger.bind(service='dashboard')

app = Flask(__name__, 
            template_folder='templates',
            static_folder='static')

app.config.from_object(Config)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=12)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_HTTPONLY'] = True

csrf = CSRFProtect(app)
limiter.init_app(app)
logger.info("✓ CSRF Protection and Rate Limiting initialized")

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
    "allow_headers": ["Content-Type", "X-API-Key"]
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
app.register_blueprint(jarvis_approval_bp)
app.register_blueprint(celery_analytics_bp)
app.register_blueprint(logs_api_bp)
app.register_blueprint(autonomous_bp)
app.register_blueprint(domain_api_bp)
app.register_blueprint(jarvis_task_bp)
app.register_blueprint(setup_bp)
app.register_blueprint(dns_bp)
app.register_blueprint(nas_bp)
app.register_blueprint(marketplace_bp)
app.register_blueprint(agent_bp)

# Initialize WebSocket service
websocket_service.init_app(app)
logger.info("✓ WebSocket service initialized")

# Initialize Jarvis Task WebSocket
from routes.jarvis_task_api import init_websocket
init_websocket(app)
logger.info("✓ Jarvis Task WebSocket initialized")

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

if db_service.is_available:
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
    logger.warning("⚠ Database service not available (JARVIS_DATABASE_URL not set)")
    logger.warning("  The dashboard will run without database-backed features")

logger.info("=" * 60)

# Auto-load marketplace catalog after migrations
if db_service.is_available:
    logger.info("=" * 60)
    logger.info("Loading Marketplace Catalog")
    logger.info("=" * 60)
    
    with app.app_context():
        try:
            from models.container_template import ContainerTemplate
            from services.marketplace_service import marketplace_service
            
            # Only load if catalog is empty
            session = get_session()
            template_count = session.query(ContainerTemplate).count()
            session.close()
            
            if template_count == 0:
                logger.info("Marketplace catalog is empty, loading templates from catalog file...")
                success, message = marketplace_service.load_catalog_templates()
                if success:
                    logger.info(f"✓ {message}")
                else:
                    logger.warning(f"⚠ Failed to load marketplace catalog: {message}")
            else:
                logger.info(f"✓ Marketplace catalog already loaded ({template_count} templates)")
        except Exception as e:
            logger.error(f"⚠ Error loading marketplace catalog: {e}")
    
    logger.info("=" * 60)

# Test Redis connection
logger.info("=" * 60)
logger.info("Testing Redis Connection")
logger.info("=" * 60)

try:
    redis_client = redis.from_url(Config.REDIS_URL)
    redis_client.ping()
    logger.info("✓ Redis connection successful")
    redis_info: dict = redis_client.info('server')  # type: ignore
    logger.info(f"  Redis version: {redis_info.get('redis_version', 'unknown')}")
    logger.info(f"  Redis URL: {Config.REDIS_URL}")
except Exception as e:
    logger.warning(f"⚠ Redis connection failed: {e}")
    logger.warning("  Workflow engine features will be unavailable")

logger.info("=" * 60)

activity_service.log_activity(
    'system',
    'Dashboard started successfully',
    'check-circle-fill',
    'success'
)

@app.route('/favicon.ico')
def favicon():
    """Serve favicon at root path to prevent 404 errors"""
    from flask import send_from_directory
    return send_from_directory(
        os.path.join(app.root_path, 'static'),
        'favicon.svg',
        mimetype='image/svg+xml'
    )

@app.route('/health')
def health():
    """Enhanced health check endpoint with service status and dependencies"""
    import time
    from datetime import datetime
    start_time = time.time()
    
    health_status = {
        'status': 'healthy',
        'uptime': int(time.time() - app.config.get('START_TIME', time.time())),
        'timestamp': datetime.utcnow().isoformat() + 'Z',
        'service': 'dashboard',
        'version': '1.0.0',
        'dependencies': {
            'database': {
                'status': 'down'
            },
            'redis': {
                'status': 'down'
            }
        },
        'memory': {
            'used': 0,
            'total': 0,
            'percentage': 0
        }
    }
    
    # Check database connection
    try:
        if db_service.is_available:
            db_start = time.time()
            db_status = db_service.health_check()
            health_status['dependencies']['database'] = {
                'status': 'up' if db_status['healthy'] else 'down',
                'latency': int((time.time() - db_start) * 1000),
                'error': db_status.get('error')
            }
            logger.debug('database_health_check', status='up', latency=health_status['dependencies']['database']['latency'])
        else:
            health_status['dependencies']['database']['error'] = 'Not configured'
            health_status['status'] = 'degraded'
    except Exception as e:
        health_status['dependencies']['database'] = {
            'status': 'down',
            'error': str(e)
        }
        health_status['status'] = 'degraded'
        logger.error('database_health_check_failed', error=str(e))
    
    # Check Redis connection
    try:
        redis_start = time.time()
        redis_client = redis.from_url(Config.REDIS_URL)
        redis_client.ping()
        health_status['dependencies']['redis'] = {
            'status': 'up',
            'latency': int((time.time() - redis_start) * 1000)
        }
        logger.debug('redis_health_check', status='up', latency=health_status['dependencies']['redis']['latency'])
    except Exception as e:
        health_status['dependencies']['redis'] = {
            'status': 'down',
            'error': str(e)
        }
        health_status['status'] = 'degraded'
        logger.error('redis_health_check_failed', error=str(e))
    
    # Get memory usage
    try:
        import psutil
        process = psutil.Process()
        mem_info = process.memory_info()
        health_status['memory'] = {
            'used': mem_info.rss,
            'total': psutil.virtual_memory().total,
            'percentage': int((mem_info.rss / psutil.virtual_memory().total) * 100)
        }
        
        if health_status['memory']['percentage'] > 90:
            health_status['status'] = 'degraded'
            logger.warning('high_memory_usage', percentage=health_status['memory']['percentage'])
    except ImportError:
        pass
    
    duration = int((time.time() - start_time) * 1000)
    logger.info('health_check_completed', status=health_status['status'], duration=duration)
    
    return health_status

if __name__ == '__main__':
    logger.info("Starting Homelab Dashboard...")
    logger.info(f"Dashboard will be available at http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
