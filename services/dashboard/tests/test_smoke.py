import pytest
import os
import sys


class TestSmokeDashboard:
    """Smoke tests for Dashboard - Quick validation without full setup"""
    
    def test_environment_configured(self):
        """Test that basic environment is set up"""
        assert sys.version_info >= (3, 9), "Python version should be 3.9+"
    
    def test_imports_work(self):
        """Test that core modules can be imported"""
        try:
            from flask import Flask
            assert Flask is not None
        except ImportError:
            pytest.fail("Flask import failed")
    
    def test_services_module_exists(self):
        """Test that services module structure exists"""
        import os
        services_path = os.path.join(os.path.dirname(__file__), '..', 'services')
        assert os.path.exists(services_path), "Services directory should exist"
    
    def test_routes_module_exists(self):
        """Test that routes module structure exists"""
        import os
        routes_path = os.path.join(os.path.dirname(__file__), '..', 'routes')
        assert os.path.exists(routes_path), "Routes directory should exist"
    
    def test_models_module_exists(self):
        """Test that models module structure exists"""
        import os
        models_path = os.path.join(os.path.dirname(__file__), '..', 'models')
        assert os.path.exists(models_path), "Models directory should exist"
    
    def test_pytest_working(self):
        """Test that pytest itself is working"""
        assert True, "Pytest is functional"
    
    def test_mock_functionality(self):
        """Test that mocking works"""
        from unittest.mock import Mock
        
        mock_obj = Mock()
        mock_obj.method.return_value = {'success': True}
        
        result = mock_obj.method()
        assert result['success'] is True
    
    def test_httpx_available(self):
        """Test that httpx is available for testing"""
        try:
            import httpx
            assert httpx is not None
        except ImportError:
            pytest.fail("httpx not available for testing")
    
    def test_async_support(self):
        """Test that async testing support is available"""
        import asyncio
        
        async def async_function():
            return "async works"
        
        loop = asyncio.get_event_loop()
        result = loop.run_until_complete(async_function())
        assert result == "async works"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
