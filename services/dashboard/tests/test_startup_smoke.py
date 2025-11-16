"""
Startup Smoke Test

Proves the application starts cleanly without crashing.
Tests that all imports work and services initialize gracefully.
"""
import pytest
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# CRITICAL: Set required environment variables BEFORE importing app
# This prevents app.py from exiting during import
if 'WEB_USERNAME' not in os.environ:
    os.environ['WEB_USERNAME'] = 'testuser'
if 'WEB_PASSWORD' not in os.environ:
    os.environ['WEB_PASSWORD'] = 'testpass'


def test_python_version():
    """Test Python version is compatible"""
    assert sys.version_info >= (3, 9), "Python version should be 3.9+"


def test_application_imports():
    """Test all critical imports work without errors"""
    try:
        # Core Flask app
        from app import app
        assert app is not None
        
        # Services
        from services.ai_service import AIService
        from services.system_service import SystemService
        from services.docker_service import DockerService
        
        # Try optional service (should not crash if unavailable)
        try:
            from services.enhanced_domain_service import EnhancedDomainService
        except ImportError:
            pass  # Optional dependency, graceful degradation
        
        # Integrations
        from integrations.zoneedit_service import ZoneEditService
        
        # Models
        from models import get_session
        
        # Routes
        from routes.api import api_bp
        from routes.web import web_bp
        
        assert True
    except Exception as e:
        pytest.fail(f"Failed to import application modules: {e}")


def test_application_structure():
    """Test Flask app is properly configured"""
    try:
        from app import app
        assert app is not None
        assert app.name == 'app'
        assert hasattr(app, 'config')
        assert hasattr(app, 'blueprints')
    except Exception as e:
        pytest.fail(f"Failed to verify Flask application structure: {e}")


def test_services_initialize_gracefully():
    """Test all services initialize without crashing"""
    try:
        # Clear optional credentials to test graceful degradation
        optional_vars = [
            'AI_INTEGRATIONS_OPENAI_API_KEY',
            'AI_INTEGRATIONS_OPENAI_BASE_URL',
            'ZONEEDIT_USERNAME',
            'ZONEEDIT_PASSWORD'
        ]
        
        env_backup = {}
        for var in optional_vars:
            if var in os.environ:
                env_backup[var] = os.environ[var]
                del os.environ[var]
        
        # Import and initialize services
        from services.ai_service import AIService
        from services.system_service import SystemService
        from services.docker_service import DockerService
        
        ai_service = AIService()
        system_service = SystemService()
        docker_service = DockerService()
        
        # Services should initialize even if disabled
        assert ai_service is not None
        assert system_service is not None
        assert docker_service is not None
        
        # AI service should have 'enabled' property
        assert hasattr(ai_service, 'enabled')
        assert isinstance(ai_service.enabled, bool)
        
        # Try enhanced domain service (optional)
        try:
            from services.enhanced_domain_service import EnhancedDomainService
            domain_service = EnhancedDomainService()
            assert domain_service is not None
            assert hasattr(domain_service, 'enabled')
        except ImportError:
            pass  # Optional dependency
        
        # Restore environment
        for var, value in env_backup.items():
            os.environ[var] = value
        
    except Exception as e:
        pytest.fail(f"Services failed to initialize: {e}")


def test_database_service_available():
    """Test database service is available"""
    try:
        from services.db_service import db_service
        assert db_service is not None
        assert hasattr(db_service, 'is_available')
        # Don't fail if database is not available, just check service exists
    except Exception as e:
        pytest.fail(f"Database service failed to initialize: {e}")


def test_config_loads():
    """Test configuration loads properly"""
    try:
        from config import Config  # type: ignore
        assert Config is not None
        assert hasattr(Config, 'SECRET_KEY')
        assert hasattr(Config, 'REDIS_URL')
        assert hasattr(Config, 'SERVICES')
    except Exception as e:
        pytest.fail(f"Configuration failed to load: {e}")


def test_blueprints_registered():
    """Test all blueprints are registered"""
    try:
        from app import app
        
        # Check critical blueprints are registered
        blueprint_names = list(app.blueprints.keys())
        
        assert 'api' in blueprint_names, "API blueprint should be registered"
        assert 'web' in blueprint_names, "Web blueprint should be registered"
        
    except Exception as e:
        pytest.fail(f"Blueprint verification failed: {e}")


def test_environment_variables():
    """Test critical environment variables are handled"""
    try:
        # Test that missing optional vars don't crash
        from services.ai_service import AIService
        
        # Clear optional vars
        if 'AI_INTEGRATIONS_OPENAI_API_KEY' in os.environ:
            del os.environ['AI_INTEGRATIONS_OPENAI_API_KEY']
        
        # Should initialize without crashing
        service = AIService()
        assert service is not None
        assert service.enabled == False
        
    except Exception as e:
        pytest.fail(f"Environment variable handling failed: {e}")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
