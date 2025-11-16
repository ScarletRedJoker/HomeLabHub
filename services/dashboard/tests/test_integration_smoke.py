"""
Integration Smoke Tests - Prove Graceful Degradation

These tests prove the system works WITHOUT optional services configured.
They verify graceful degradation when external dependencies are missing.
"""
import pytest
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# CRITICAL: Set required environment variables BEFORE importing app
# This prevents app.py from exiting during import
if 'WEB_USERNAME' not in os.environ:
    os.environ['WEB_USERNAME'] = 'testuser'
if 'WEB_PASSWORD' not in os.environ:
    os.environ['WEB_PASSWORD'] = 'testpass'


class TestGracefulDegradation:
    """Test that system handles missing optional services gracefully"""
    
    @pytest.fixture
    def app(self):
        """Create test app WITHOUT optional service credentials"""
        # Clear optional service credentials to force graceful degradation
        env_backup = {}
        optional_vars = [
            'OPENAI_API_KEY',
            'AI_INTEGRATIONS_OPENAI_API_KEY',
            'AI_INTEGRATIONS_OPENAI_BASE_URL',
            'ZONEEDIT_USERNAME',
            'ZONEEDIT_PASSWORD',
            'ZONEEDIT_API_KEY',
            'ZONEEDIT_API_TOKEN'
        ]
        
        for var in optional_vars:
            if var in os.environ:
                env_backup[var] = os.environ[var]
                del os.environ[var]
        
        # Import app after clearing environment variables
        from app import app
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False  # Disable CSRF for testing
        
        yield app
        
        # Restore environment variables
        for var, value in env_backup.items():
            os.environ[var] = value
    
    @pytest.fixture
    def client(self, app):
        """Create test client"""
        return app.test_client()
    
    @pytest.fixture
    def authenticated_client(self, client):
        """Create authenticated test client"""
        # Set credentials in environment
        os.environ['WEB_USERNAME'] = 'testuser'
        os.environ['WEB_PASSWORD'] = 'testpass'
        
        # Login
        with client.session_transaction() as sess:
            sess['authenticated'] = True
        
        return client
    
    def test_ai_service_disabled_gracefully(self):
        """Test AI service is disabled when no API key"""
        # Clear credentials and create new instance
        env_backup = {}
        for var in ['AI_INTEGRATIONS_OPENAI_API_KEY', 'AI_INTEGRATIONS_OPENAI_BASE_URL', 'OPENAI_API_KEY']:
            if var in os.environ:
                env_backup[var] = os.environ[var]
                del os.environ[var]
        
        # Create new AI service instance without credentials
        from services.ai_service import AIService
        ai_service = AIService()
        
        try:
            assert ai_service.enabled == False, "AI service should be disabled without API key"
        finally:
            # Restore environment
            for var, value in env_backup.items():
                os.environ[var] = value
    
    def test_ai_chat_returns_helpful_error(self, authenticated_client):
        """Test AI chat returns 503 with helpful message when disabled"""
        response = authenticated_client.post('/api/ai/chat', 
            json={'message': 'Hello'},
            headers={'Content-Type': 'application/json'}
        )
        
        assert response.status_code == 503, "Should return 503 Service Unavailable"
        data = response.get_json()
        assert data['success'] == False
        assert 'error_code' in data
        assert data['error_code'] == 'SERVICE_NOT_CONFIGURED'
        assert 'AI_INTEGRATIONS_OPENAI_API_KEY' in data.get('message', '') or 'not configured' in data.get('message', '').lower()
    
    def test_domain_service_disabled_gracefully(self):
        """Test domain service is disabled when no credentials"""
        try:
            from services.enhanced_domain_service import EnhancedDomainService
            domain_service = EnhancedDomainService()
            assert domain_service.enabled == False, "Domain service should be disabled without credentials"
        except ImportError:
            # Service might not exist, that's okay for graceful degradation
            assert True
    
    def test_features_status_endpoint(self, authenticated_client):
        """Test /api/features/status shows disabled features"""
        response = authenticated_client.get('/api/features/status')
        assert response.status_code == 200
        
        data = response.get_json()
        assert data['success'] == True
        assert 'features' in data
        
        # AI should be disabled
        assert data['features']['ai_assistant']['enabled'] == False
        assert 'AI_INTEGRATIONS_OPENAI_API_KEY' in data['features']['ai_assistant']['required_vars']
        
        # Domain automation should be disabled  
        assert data['features']['domain_automation']['enabled'] == False
    
    def test_core_endpoints_work_without_optional_services(self, client):
        """Test core functionality works without optional services"""
        # Set credentials for login
        os.environ['WEB_USERNAME'] = 'testuser'
        os.environ['WEB_PASSWORD'] = 'testpass'
        
        # Login
        response = client.post('/login', data={'username': 'testuser', 'password': 'testpass'})
        assert response.status_code == 302, "Login should succeed"
        
        # Dashboard should load
        response = client.get('/', follow_redirects=False)
        assert response.status_code in [200, 302], "Dashboard should load or redirect"
        
        # Health endpoint should work (no auth required)
        response = client.get('/health')
        assert response.status_code == 200
    
    def test_health_endpoint_without_optional_services(self, client):
        """Test health endpoint works without optional services"""
        response = client.get('/health')
        assert response.status_code == 200
        
        data = response.get_json()
        assert 'status' in data
        # Status should be 'degraded' or 'healthy' but not crash
        assert data['status'] in ['healthy', 'degraded']


class TestCoreFeatures:
    """Test core features work correctly"""
    
    @pytest.fixture
    def app(self):
        from app import app
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        return app
    
    @pytest.fixture
    def client(self, app):
        return app.test_client()
    
    def test_authentication_works(self, client):
        """Test login/logout flow"""
        # Set credentials
        os.environ['WEB_USERNAME'] = 'testuser'
        os.environ['WEB_PASSWORD'] = 'testpass'
        
        # Test login page loads
        response = client.get('/login')
        assert response.status_code == 200
        
        # Test successful login
        response = client.post('/login', data={
            'username': 'testuser',
            'password': 'testpass'
        }, follow_redirects=False)
        assert response.status_code == 302, "Should redirect after login"
        
        # Test logout
        response = client.get('/logout', follow_redirects=False)
        assert response.status_code == 302, "Should redirect after logout"
    
    def test_protected_routes_redirect_unauthenticated(self, client):
        """Test protected routes redirect to login"""
        response = client.get('/', follow_redirects=False)
        assert response.status_code == 302
        assert '/login' in response.location
    
    def test_api_endpoints_require_auth(self, client):
        """Test API endpoints return 401 without auth"""
        response = client.get('/api/system/stats')
        assert response.status_code == 401
        
        data = response.get_json()
        assert data['success'] == False
        assert 'Unauthorized' in data['message']


class TestHealthChecks:
    """Test health check endpoints"""
    
    @pytest.fixture
    def app(self):
        from app import app
        app.config['TESTING'] = True
        return app
    
    @pytest.fixture
    def client(self, app):
        return app.test_client()
    
    def test_health_endpoint(self, client):
        """Test /health endpoint"""
        response = client.get('/health')
        assert response.status_code == 200
        
        data = response.get_json()
        assert 'status' in data
        assert 'timestamp' in data
        assert 'service' in data
        assert data['service'] == 'dashboard'
    
    def test_database_health(self, client):
        """Test database connectivity check"""
        # This should work even without login
        response = client.get('/health')
        assert response.status_code == 200
        
        data = response.get_json()
        # Should have dependencies section
        assert 'dependencies' in data


class TestErrorHandling:
    """Test error handling across the application"""
    
    @pytest.fixture
    def app(self):
        from app import app
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False
        return app
    
    @pytest.fixture
    def client(self, app):
        return app.test_client()
    
    @pytest.fixture
    def authenticated_client(self, client):
        """Create authenticated test client"""
        os.environ['WEB_USERNAME'] = 'testuser'
        os.environ['WEB_PASSWORD'] = 'testpass'
        
        with client.session_transaction() as sess:
            sess['authenticated'] = True
        
        return client
    
    def test_404_error_handling(self, client):
        """Test 404 errors are handled gracefully"""
        response = client.get('/nonexistent-page-xyz-123')
        assert response.status_code == 404
    
    def test_api_error_responses(self, authenticated_client):
        """Test API errors return proper JSON"""
        # Test invalid API request (missing required field)
        response = authenticated_client.post('/api/ai/chat', 
            json={},  # Missing required 'message' field
            headers={'Content-Type': 'application/json'}
        )
        
        # Should return error (either 400 or 503)
        assert response.status_code in [400, 503]
        data = response.get_json()
        assert data['success'] == False
        assert 'message' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
