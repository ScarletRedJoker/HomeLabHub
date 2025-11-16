"""
Test configuration for smoke tests.
Forces optional services to be disabled to prove graceful degradation.

This module runs BEFORE any test imports, ensuring environment variables
are cleared before the Flask app and services are initialized.
"""
import pytest
import os


@pytest.fixture(scope='session', autouse=True)
def disable_optional_services():
    """
    Force all optional services to be disabled for smoke tests.
    This proves graceful degradation works.
    
    This fixture runs BEFORE any app/service imports, ensuring that when
    the Flask app and its services (AIService, DomainService, etc.) are
    initialized, they see no optional credentials and properly disable themselves.
    """
    # Store original values for restoration after tests
    original_values = {}
    
    # Keys to disable - these are ALL optional services
    keys_to_disable = [
        'OPENAI_API_KEY',
        'AI_INTEGRATIONS_OPENAI_API_KEY',
        'AI_INTEGRATIONS_OPENAI_BASE_URL',
        'ZONEEDIT_USERNAME',
        'ZONEEDIT_PASSWORD',
        'ZONEEDIT_API_KEY',
        'ZONEEDIT_API_TOKEN',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
    ]
    
    # Clear all optional service credentials
    for key in keys_to_disable:
        if key in os.environ:
            original_values[key] = os.environ[key]
            del os.environ[key]
    
    # Set required test credentials
    if 'WEB_USERNAME' not in os.environ:
        os.environ['WEB_USERNAME'] = 'testuser'
    if 'WEB_PASSWORD' not in os.environ:
        os.environ['WEB_PASSWORD'] = 'testpass'
    
    yield  # Run all tests
    
    # Restore original values after all tests complete
    for key, value in original_values.items():
        os.environ[key] = value
