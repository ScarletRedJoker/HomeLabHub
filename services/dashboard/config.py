import os
import secrets

class Config:
    """Configuration for Homelab Dashboard"""
    
    # Flask settings
    SECRET_KEY = os.environ.get('SESSION_SECRET') or secrets.token_urlsafe(32)
    
    # Database settings (Jarvis Platform)
    JARVIS_DATABASE_URL = os.environ.get('JARVIS_DATABASE_URL')
    
    # Redis settings
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    
    # Celery settings
    CELERY_BROKER_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    CELERY_RESULT_BACKEND = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    CELERY_TASK_SERIALIZER = 'json'
    CELERY_RESULT_SERIALIZER = 'json'
    CELERY_ACCEPT_CONTENT = ['json']
    CELERY_TIMEZONE = 'America/New_York'
    CELERY_ENABLE_UTC = True
    CELERY_TASK_TRACK_STARTED = True
    CELERY_TASK_TIME_LIMIT = 30 * 60
    CELERY_TASK_SOFT_TIME_LIMIT = 25 * 60
    
    # WebSocket settings
    WEBSOCKET_PING_INTERVAL = 25
    WEBSOCKET_PING_TIMEOUT = 60
    DASHBOARD_API_KEY = os.environ.get('DASHBOARD_API_KEY', secrets.token_urlsafe(32))
    
    # Docker settings
    DOCKER_HOST = os.environ.get('DOCKER_HOST', 'unix:///var/run/docker.sock')
    
    # SSH settings for remote execution
    SSH_HOST = os.environ.get('SSH_HOST', 'localhost')
    SSH_PORT = int(os.environ.get('SSH_PORT', '22'))
    SSH_USER = os.environ.get('SSH_USER', 'root')
    SSH_KEY_PATH = os.environ.get('SSH_KEY_PATH', '/root/.ssh/id_rsa')
    
    # Service paths
    STATIC_SITE_PATH = os.environ.get('STATIC_SITE_PATH', '/var/www/scarletredjoker')
    
    # URLs
    NOVNC_URL = os.environ.get('NOVNC_URL', 'https://vnc.evindrake.net')
    WINDOWS_KVM_IP = os.environ.get('WINDOWS_KVM_IP', '')
    
    # Home Assistant configuration
    HOME_ASSISTANT_URL = os.environ.get('HOME_ASSISTANT_URL', 'https://home.evindrake.net')
    HOME_ASSISTANT_TOKEN = os.environ.get('HOME_ASSISTANT_TOKEN')
    HOME_ASSISTANT_VERIFY_SSL = os.environ.get('HOME_ASSISTANT_VERIFY_SSL', 'True').lower() == 'true'
    HOME_ASSISTANT_TIMEOUT_CONNECT = int(os.environ.get('HOME_ASSISTANT_TIMEOUT_CONNECT', '10'))
    HOME_ASSISTANT_TIMEOUT_READ = int(os.environ.get('HOME_ASSISTANT_TIMEOUT_READ', '30'))
    HOME_ASSISTANT_HEALTH_CHECK_INTERVAL = int(os.environ.get('HOME_ASSISTANT_HEALTH_CHECK_INTERVAL', '300'))  # 5 minutes
    HOME_ASSISTANT_MAX_RETRIES = int(os.environ.get('HOME_ASSISTANT_MAX_RETRIES', '3'))
    
    # MinIO configuration
    MINIO_ENDPOINT = os.environ.get('MINIO_ENDPOINT', 'minio:9000')
    MINIO_ACCESS_KEY = os.environ.get('MINIO_ROOT_USER', 'admin')
    MINIO_SECRET_KEY = os.environ.get('MINIO_ROOT_PASSWORD', 'minio_admin_password')
    MINIO_SECURE = os.environ.get('MINIO_SECURE', 'False').lower() == 'true'
    
    # Upload limits
    MAX_UPLOAD_SIZE = int(os.environ.get('MAX_UPLOAD_SIZE', 500 * 1024 * 1024))  # 500MB default
    ALLOWED_EXTENSIONS = os.environ.get('ALLOWED_EXTENSIONS', 'zip,tar,gz,html,css,js,py,php,java,go,rs,dockerfile,sh,bash').split(',')
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER', '/tmp/jarvis_uploads')
    
    # Favicon settings
    FAVICON_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'favicons')
    FAVICON_MAX_SIZE = 2 * 1024 * 1024  # 2MB
    FAVICON_ALLOWED_EXTENSIONS = {'png', 'ico', 'jpg', 'jpeg', 'svg'}
    
    # Services configuration (used for dashboard UI)
    SERVICES = {
        'discord-bot': {
            'name': 'Discord Ticket Bot',
            'url': 'https://bot.rig-city.com',
            'container': 'discord-bot',
            'description': 'Discord ticket system with web dashboard',
            'favicon': None
        },
        'stream-bot': {
            'name': 'Stream Bot',
            'url': 'https://stream.rig-city.com',
            'container': 'stream-bot',
            'description': 'AI-powered Snapple facts for Twitch and Kick',
            'favicon': None
        },
        'n8n': {
            'name': 'n8n Automation',
            'url': 'https://n8n.evindrake.net',
            'container': 'n8n',
            'description': 'Workflow automation platform',
            'favicon': None
        },
        'plex': {
            'name': 'Plex Media Server',
            'url': 'https://plex.evindrake.net',
            'container': 'plex-server',
            'description': 'Media streaming server',
            'favicon': None
        },
        'static-site': {
            'name': 'ScarletRedJoker',
            'url': 'https://scarletredjoker.com',
            'container': 'scarletredjoker-web',
            'description': 'Personal portfolio website',
            'favicon': None
        },
        'vnc': {
            'name': 'VNC Desktop',
            'url': 'https://vnc.evindrake.net',
            'container': 'vnc-desktop',
            'description': 'Remote desktop access',
            'favicon': None
        }
    }
