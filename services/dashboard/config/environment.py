"""
Environment-aware configuration module for dashboard service.
Detects whether running on Replit or production Ubuntu server.
"""

import os
from dataclasses import dataclass
from typing import Optional


@dataclass
class OpenAIConfig:
    """OpenAI API configuration"""
    api_key: str
    base_url: str
    model: str = "gpt-3.5-turbo"


@dataclass
class DatabaseConfig:
    """Database connection configuration"""
    url: str


def is_replit() -> bool:
    """Detect if running on Replit environment"""
    return (
        os.getenv("REPL_ID") is not None
        or os.getenv("REPLIT_CONNECTORS_HOSTNAME") is not None
    )


def get_openai_config() -> OpenAIConfig:
    """
    Get OpenAI configuration based on environment.
    
    - On Replit: Uses AI_INTEGRATIONS_* variables (Replit AI Integrations)
    - On Production: Uses OPENAI_API_KEY directly
    """
    if is_replit():
        # Replit AI Integrations (no API key needed)
        api_key = os.getenv("AI_INTEGRATIONS_OPENAI_API_KEY", "")
        base_url = os.getenv("AI_INTEGRATIONS_OPENAI_BASE_URL", "")
        
        if not api_key or not base_url:
            raise ValueError(
                "Running on Replit but AI_INTEGRATIONS_* env vars are missing. "
                "Please set up the OpenAI integration."
            )
        
        # the newest OpenAI model is "gpt-5" which was released August 7, 2025.
        # do not change this unless explicitly requested by the user
        model = os.getenv("AI_MODEL", "gpt-5")
        
    else:
        # Production environment - use self-managed API key
        api_key = os.getenv("OPENAI_API_KEY", "")
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        model = os.getenv("AI_MODEL", "gpt-3.5-turbo")
        
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY is required in production environment. "
                "Please add it to your .env file."
            )
    
    return OpenAIConfig(api_key=api_key, base_url=base_url, model=model)


def get_database_url(service_name: str) -> str:
    """
    Get database URL for a service.
    
    Args:
        service_name: Name of the service (e.g., 'jarvis', 'discord', 'streambot')
    
    Returns:
        Fully resolved database connection string
    """
    # Map service names to their database URLs
    url_mapping = {
        "jarvis": "JARVIS_DATABASE_URL",
        "discord": "DISCORD_DATABASE_URL",
        "streambot": "STREAMBOT_DATABASE_URL",
    }
    
    env_var = url_mapping.get(service_name.lower())
    if not env_var:
        raise ValueError(f"Unknown service: {service_name}")
    
    db_url = os.getenv(env_var)
    if not db_url:
        raise ValueError(
            f"{env_var} is not set. Please configure database connection."
        )
    
    # Verify it's not an unexpanded variable
    if "${" in db_url:
        raise ValueError(
            f"{env_var} contains unexpanded variable: {db_url}. "
            f"Please set the fully resolved connection string."
        )
    
    return db_url


def get_plex_config() -> dict:
    """Get Plex server configuration"""
    plex_url = os.getenv("PLEX_URL")
    plex_token = os.getenv("PLEX_TOKEN")
    
    if not plex_url or not plex_token:
        raise ValueError(
            "Plex configuration incomplete. "
            "PLEX_URL and PLEX_TOKEN are required."
        )
    
    return {
        "url": plex_url,
        "token": plex_token,
    }


# Environment info for debugging
def get_environment_info() -> dict:
    """Get current environment information for debugging"""
    return {
        "is_replit": is_replit(),
        "has_ai_integrations": bool(os.getenv("AI_INTEGRATIONS_OPENAI_BASE_URL")),
        "has_openai_key": bool(os.getenv("OPENAI_API_KEY")),
        "has_jarvis_db": bool(os.getenv("JARVIS_DATABASE_URL")),
        "has_plex_config": bool(os.getenv("PLEX_URL") and os.getenv("PLEX_TOKEN")),
    }
