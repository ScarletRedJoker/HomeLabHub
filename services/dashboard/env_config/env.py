"""
Environment Configuration for Replit vs Ubuntu
Automatically detects environment and applies appropriate settings
"""
import os
from pathlib import Path

# Environment Detection
IS_REPLIT = os.path.exists('/home/runner') or os.getenv('REPLIT_WORKSPACE') is not None
IS_UBUNTU = not IS_REPLIT

class EnvironmentConfig:
    """Base configuration"""
    # Detect environment
    ENVIRONMENT = 'replit' if IS_REPLIT else 'ubuntu'
    
    # Demo mode defaults
    DEMO_MODE = os.getenv('DEMO_MODE', 'true' if IS_REPLIT else 'false').lower() == 'true'
    
    # Database configuration
    if IS_REPLIT:
        # Use Replit's managed Postgres if available, otherwise SQLite
        DATABASE_URL = os.getenv('DATABASE_URL')
        if not DATABASE_URL:
            # Fallback to SQLite for testing
            DATABASE_URL = 'sqlite:///jarvis_replit.db'
    else:
        # Ubuntu production
        DATABASE_URL = os.getenv('JARVIS_DATABASE_URL', 'postgresql://jarvis:password@localhost/jarvis_dashboard')
    
    # Redis configuration
    REDIS_ENABLED = not IS_REPLIT
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0') if not IS_REPLIT else None
    
    # Celery configuration  
    CELERY_ENABLED = not IS_REPLIT
    CELERY_BROKER_URL = REDIS_URL if CELERY_ENABLED else None
    
    # Docker configuration
    DOCKER_ENABLED = not IS_REPLIT
    
    # Logging configuration
    if IS_REPLIT:
        # Console-only logging for Replit
        LOG_TO_FILE = False
        LOG_LEVEL = 'INFO'
    else:
        # File + console logging for Ubuntu
        LOG_TO_FILE = True
        LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    # File paths
    if IS_REPLIT:
        BASE_DIR = Path('/home/runner/workspace/services/dashboard')
    else:
        BASE_DIR = Path('/home/evin/contain/HomeLabHub/services/dashboard')
    
    # Testing configuration
    TESTING = os.getenv('TESTING', 'false').lower() == 'true'
    
    @classmethod
    def is_replit(cls):
        return IS_REPLIT
    
    @classmethod
    def is_ubuntu(cls):
        return IS_UBUNTU
    
    @classmethod
    def summary(cls):
        """Print configuration summary"""
        db_display = cls.DATABASE_URL or '[Not Configured]'
        if cls.DATABASE_URL and '@' in cls.DATABASE_URL:
            db_display = cls.DATABASE_URL.split('@')[-1]
        
        return {
            'environment': cls.ENVIRONMENT,
            'demo_mode': cls.DEMO_MODE,
            'database': db_display,
            'redis_enabled': cls.REDIS_ENABLED,
            'celery_enabled': cls.CELERY_ENABLED,
            'docker_enabled': cls.DOCKER_ENABLED,
            'testing': cls.TESTING
        }

# Export as Config for convenience
Config = EnvironmentConfig
