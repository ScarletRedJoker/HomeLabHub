from flask import Flask
from flask_cors import CORS
import logging
import sys
import os
from datetime import timedelta
from config import Config
from routes.api import api_bp
from routes.web import web_bp
from routes.deployment_api import deployment_bp

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

# Only show API key warning in development, not in production
# (Production deployment via deploy.sh automatically generates the key)
if not os.environ.get('DASHBOARD_API_KEY') and os.environ.get('FLASK_ENV') != 'production':
    logger.warning("=" * 60)
    logger.warning("DEVELOPMENT: DASHBOARD_API_KEY not set")
    logger.warning("For production deployment, use: ./deploy.sh")
    logger.warning("For manual setup, generate with: python -c 'import secrets; print(secrets.token_urlsafe(32))'")
    logger.warning("=" * 60)

CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

app.register_blueprint(api_bp)
app.register_blueprint(web_bp)
app.register_blueprint(deployment_bp)

@app.route('/health')
def health():
    return {'status': 'healthy', 'message': 'Homelab Dashboard is running'}

if __name__ == '__main__':
    logger.info("Starting Homelab Dashboard...")
    logger.info(f"Dashboard will be available at http://0.0.0.0:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
