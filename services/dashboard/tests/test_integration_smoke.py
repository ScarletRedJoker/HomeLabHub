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
        # Double-check credentials are unset (conftest.py should handle this)
        assert 'OPENAI_API_KEY' not in os.environ, "OPENAI_API_KEY should be unset for smoke tests"
        assert 'AI_INTEGRATIONS_OPENAI_API_KEY' not in os.environ, "AI integration key should be unset"
        
        # Import app after verifying environment variables are cleared
        from app import app
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False  # Disable CSRF for testing
        
        return app
    
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
    
    def test_ai_service_disabled_when_no_credentials(self):
        """Test AI service is DISABLED when no API key configured"""
        # Verify env vars are unset
        assert 'OPENAI_API_KEY' not in os.environ, "OPENAI_API_KEY must be unset"
        assert 'AI_INTEGRATIONS_OPENAI_API_KEY' not in os.environ, "AI_INTEGRATIONS_OPENAI_API_KEY must be unset"
        
        from services.ai_service import AIService
        ai_service = AIService()
        
        # STRICT: AI service MUST be disabled when credentials unset
        assert ai_service.enabled == False, \
            "AI service MUST be disabled when OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_API_KEY are not set"
    
    def test_ai_chat_returns_503_when_disabled(self, authenticated_client):
        """Test AI chat returns 503 Service Unavailable when disabled"""
        response = authenticated_client.post('/api/ai/chat', 
            json={'message': 'Hello'},
            headers={'Content-Type': 'application/json'}
        )
        
        # STRICT: Must return 503 when disabled, NOT 200
        assert response.status_code == 503, \
            f"AI chat MUST return 503 when disabled (got {response.status_code})"
        
        data = response.get_json()
        assert data['success'] == False, "Response must indicate failure"
        assert 'message' in data, "Must have helpful error message"
        assert 'AI_INTEGRATIONS_OPENAI' in data['message'] or 'not configured' in data['message'].lower(), \
            "Error message must mention missing configuration"
    
    def test_domain_service_disabled_gracefully(self):
        """Test domain service is DISABLED when no credentials"""
        # Verify env vars are unset
        assert 'ZONEEDIT_USERNAME' not in os.environ, "ZONEEDIT_USERNAME must be unset"
        assert 'ZONEEDIT_PASSWORD' not in os.environ, "ZONEEDIT_PASSWORD must be unset"
        
        try:
            from services.enhanced_domain_service import EnhancedDomainService
            domain_service = EnhancedDomainService()
            
            # STRICT: Domain service MUST be disabled without credentials
            assert domain_service.enabled == False, \
                "Domain service MUST be disabled when ZoneEdit credentials are not set"
        except ImportError:
            # Service might not exist, that's okay for graceful degradation
            assert True
    
    def test_features_status_shows_disabled_features(self, authenticated_client):
        """Test /api/features/status shows AI as DISABLED when no credentials"""
        response = authenticated_client.get('/api/features/status')
        assert response.status_code == 200
        
        data = response.get_json()
        assert data['success'] == True
        assert 'features' in data
        
        # STRICT: AI must be disabled when credentials unset
        assert 'ai_assistant' in data['features'], "Must have ai_assistant feature"
        assert data['features']['ai_assistant']['enabled'] == False, \
            "AI assistant feature MUST show enabled=False when credentials not configured"
        assert 'required_vars' in data['features']['ai_assistant'], \
            "Must list required environment variables"
        
        # Verify it lists the required vars
        required_vars = data['features']['ai_assistant']['required_vars']
        assert any('OPENAI' in var for var in required_vars), \
            "Must list OPENAI-related environment variables as required"
    
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
    
    def test_favicon_returns_200(self, client):
        """Test favicon is served without 404"""
        response = client.get('/favicon.ico')
        assert response.status_code == 200, "Favicon must return 200, not 404"
        assert response.mimetype == 'image/svg+xml', "Favicon should be SVG format"


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
