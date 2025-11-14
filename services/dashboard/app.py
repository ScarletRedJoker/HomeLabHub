from flask import Flask
from flask_cors import CORS
from flask_wtf.csrf import CSRFProtect
import logging
from logging.handlers import RotatingFileHandler
import sys
import os
from datetime import timedelta
from config import Config
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

# Test Redis connection
logger.info("=" * 60)
logger.info("Testing Redis Connection")
logger.info("=" * 60)

try:
    redis_client = redis.from_url(Config.REDIS_URL)
    redis_client.ping()
    logger.info("✓ Redis connection successful")
    redis_info = redis_client.info('server')
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
