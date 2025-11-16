"""
Integration tests for Dashboard service on Replit
Tests all major features without external dependencies
"""
import pytest
import requests

BASE_URL = "http://localhost:5000"

class TestDashboardIntegration:
    """Integration tests for dashboard"""
    
    def test_login_page_loads(self):
        """Test login page is accessible"""
        response = requests.get(f"{BASE_URL}/login", allow_redirects=False)
        assert response.status_code == 200
        assert b"Homelab Dashboard" in response.content or b"Login" in response.content
    
    def test_demo_login_works(self):
        """Test demo login credentials work"""
        session = requests.Session()
        response = session.post(f"{BASE_URL}/login", data={
            'username': 'evin',
            'password': 'homelab'
        }, allow_redirects=True)
        assert response.status_code == 200
    
    def test_control_center_loads(self):
        """Test control center page"""
        session = requests.Session()
        session.post(f"{BASE_URL}/login", data={
            'username': 'evin',
            'password': 'homelab'
        })
        response = session.get(f"{BASE_URL}/control-center")
        assert response.status_code == 200
        assert b"Jarvis" in response.content or b"Control Center" in response.content
    
    def test_smart_home_api(self):
        """Test smart home API endpoints"""
        session = requests.Session()
        session.post(f"{BASE_URL}/login", data={
            'username': 'evin',
            'password': 'homelab'
        })
        
        response = session.get(f"{BASE_URL}/api/homeassistant/devices")
        assert response.status_code == 200
        data = response.json()
        assert 'devices' in data
    
    def test_ai_foundry_api(self):
        """Test AI foundry API endpoints"""
        session = requests.Session()
        session.post(f"{BASE_URL}/login", data={
            'username': 'evin',
            'password': 'homelab'
        })
        
        response = session.get(f"{BASE_URL}/api/ai-foundry/models")
        assert response.status_code == 200
        data = response.json()
        assert 'models' in data
    
    def test_marketplace_api(self):
        """Test marketplace API"""
        session = requests.Session()
        session.post(f"{BASE_URL}/login", data={
            'username': 'evin',
            'password': 'homelab'
        })
        
        response = session.get(f"{BASE_URL}/api/marketplace/templates")
        assert response.status_code == 200
        data = response.json()
        assert 'templates' in data
        assert len(data['templates']) > 0

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
