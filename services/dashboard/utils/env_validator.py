"""
Environment Variable Validator for Dashboard Service

Validates required and optional environment variables at startup.
In production mode, missing required secrets cause immediate exit.
In development mode, warnings are logged but startup continues.
"""
import os
import sys
import logging

logger = logging.getLogger(__name__)

REQUIRED_SECRETS = [
    'SESSION_SECRET',
    'JARVIS_DATABASE_URL',
    'WEB_USERNAME',
    'WEB_PASSWORD',
]

OPTIONAL_SECRETS = [
    'CLOUDFLARE_API_TOKEN',
    'OPENAI_API_KEY',
    'HOME_ASSISTANT_TOKEN',
]


def validate_environment() -> bool:
    """
    Validate required environment variables at startup.
    
    Returns:
        True if all required secrets are present, False otherwise.
        In production mode, exits the process if required secrets are missing.
    """
    is_production = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('ENVIRONMENT') == 'production'
    
    missing_required = []
    missing_optional = []
    
    for secret in REQUIRED_SECRETS:
        if not os.environ.get(secret):
            missing_required.append(secret)
    
    for secret in OPTIONAL_SECRETS:
        if not os.environ.get(secret):
            missing_optional.append(secret)
    
    if missing_required:
        error_msg = f"Missing required environment variables: {', '.join(missing_required)}"
        if is_production:
            logger.error("=" * 60)
            logger.error("FATAL: Environment validation failed!")
            logger.error(error_msg)
            logger.error("Dashboard cannot start without these secrets in production mode.")
            logger.error("=" * 60)
            sys.exit(1)
        else:
            logger.warning("=" * 60)
            logger.warning("WARNING: Environment validation failed!")
            logger.warning(error_msg)
            logger.warning("Continuing in development mode...")
            logger.warning("=" * 60)
    
    if missing_optional:
        logger.info(f"Optional secrets not configured: {', '.join(missing_optional)}")
        logger.info("Some features may be unavailable.")
    
    if not missing_required:
        logger.info("Environment validation passed: All required secrets present.")
    
    return len(missing_required) == 0
