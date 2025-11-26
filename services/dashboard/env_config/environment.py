"""
Environment-aware configuration module for dashboard service.
Detects whether running on Replit, Docker, or standalone.

This module provides intelligent environment detection and configuration
resolution for services that need different settings based on deployment context.
"""

import os
import socket
from dataclasses import dataclass
from typing import Optional


@dataclass
class OpenAIConfig:
    """OpenAI API configuration"""
    api_key: str
    base_url: str
    model: str = "gpt-4o"


@dataclass
class DatabaseConfig:
    """Database connection configuration"""
    url: str


@dataclass
class PlexConfig:
    """Plex server configuration"""
    url: str
    token: str
    is_internal: bool = False


def is_replit() -> bool:
    """Detect if running on Replit environment"""
    return (
        os.getenv("REPL_ID") is not None
        or os.getenv("REPLIT_CONNECTORS_HOSTNAME") is not None
    )


def is_docker() -> bool:
    """
    Detect if running inside a Docker container.
    
    Checks multiple indicators:
    1. /.dockerenv file exists (standard Docker marker)
    2. /proc/1/cgroup contains 'docker' or 'containerd'
    3. DOCKER_CONTAINER env var is set
    """
    if os.getenv("DOCKER_CONTAINER"):
        return True
    
    if os.path.exists("/.dockerenv"):
        return True
    
    try:
        with open("/proc/1/cgroup", "r") as f:
            content = f.read()
            if "docker" in content or "containerd" in content:
                return True
    except (FileNotFoundError, PermissionError):
        pass
    
    return False


def can_resolve_hostname(hostname: str) -> bool:
    """
    Check if a hostname can be resolved (useful for Docker network detection).
    
    Args:
        hostname: The hostname to check
        
    Returns:
        True if hostname resolves to an IP address
    """
    try:
        socket.gethostbyname(hostname)
        return True
    except socket.gaierror:
        return False


def get_openai_config() -> OpenAIConfig:
    """
    Get OpenAI configuration based on environment.
    
    - On Replit: Uses AI_INTEGRATIONS_* variables (Replit AI Integrations)
    - On Production: Uses OPENAI_API_KEY directly
    """
    if is_replit():
        api_key = os.getenv("AI_INTEGRATIONS_OPENAI_API_KEY", "")
        base_url = os.getenv("AI_INTEGRATIONS_OPENAI_BASE_URL", "")
        
        if not api_key or not base_url:
            raise ValueError(
                "Running on Replit but AI_INTEGRATIONS_* env vars are missing. "
                "Please set up the OpenAI integration."
            )
        
        model = os.getenv("AI_MODEL", "gpt-4o")
        
    else:
        api_key = os.getenv("OPENAI_API_KEY", "")
        base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
        model = os.getenv("AI_MODEL", "gpt-4o")
        
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
    
    if "${" in db_url:
        raise ValueError(
            f"{env_var} contains unexpanded variable: {db_url}. "
            f"Please set the fully resolved connection string."
        )
    
    return db_url


def get_plex_config() -> PlexConfig:
    """
    Get Plex server configuration with intelligent URL resolution.
    
    When running inside Docker:
    - Automatically uses internal Docker network URL (http://plex-server:32400)
    - Falls back to configured PLEX_URL if internal hostname not resolvable
    
    When running outside Docker (Replit, standalone):
    - Uses PLEX_URL from environment
    - Returns config even if Plex not reachable (for development)
    
    Returns:
        PlexConfig with url, token, and is_internal flag
        
    Raises:
        ValueError if PLEX_TOKEN is not configured
    """
    plex_token = os.getenv("PLEX_TOKEN")
    plex_url_env = os.getenv("PLEX_URL")
    
    if not plex_token:
        raise ValueError(
            "PLEX_TOKEN is required. Get it from your Plex server: "
            "docker exec plex-server cat '/config/Library/Application Support/Plex Media Server/Preferences.xml' | grep -oP 'PlexOnlineToken=\"\\K[^\"]+'"
        )
    
    internal_plex_hostname = "plex-server"
    internal_plex_url = f"http://{internal_plex_hostname}:32400"
    
    if is_docker():
        if can_resolve_hostname(internal_plex_hostname):
            return PlexConfig(
                url=internal_plex_url,
                token=plex_token,
                is_internal=True
            )
        else:
            alt_hostname = "plex"
            if can_resolve_hostname(alt_hostname):
                return PlexConfig(
                    url=f"http://{alt_hostname}:32400",
                    token=plex_token,
                    is_internal=True
                )
    
    if plex_url_env:
        if is_docker() and plex_url_env.startswith("https://"):
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                f"PLEX_URL is set to external URL ({plex_url_env}) but running inside Docker. "
                f"This may cause authentication issues. Consider using internal URL: {internal_plex_url}"
            )
        
        return PlexConfig(
            url=plex_url_env,
            token=plex_token,
            is_internal=False
        )
    
    return PlexConfig(
        url=internal_plex_url,
        token=plex_token,
        is_internal=True
    )


def get_internal_service_url(service_name: str, default_port: int) -> str:
    """
    Get the internal URL for a Docker service.
    
    This is useful for service-to-service communication within Docker network.
    
    Args:
        service_name: Docker service/container name
        default_port: Default port for the service
        
    Returns:
        Internal URL (e.g., http://plex-server:32400)
    """
    if is_docker() and can_resolve_hostname(service_name):
        return f"http://{service_name}:{default_port}"
    
    return f"http://localhost:{default_port}"


def get_environment_info() -> dict:
    """Get current environment information for debugging"""
    return {
        "is_replit": is_replit(),
        "is_docker": is_docker(),
        "has_ai_integrations": bool(os.getenv("AI_INTEGRATIONS_OPENAI_BASE_URL")),
        "has_openai_key": bool(os.getenv("OPENAI_API_KEY")),
        "has_jarvis_db": bool(os.getenv("JARVIS_DATABASE_URL")),
        "has_plex_token": bool(os.getenv("PLEX_TOKEN")),
        "plex_url_env": os.getenv("PLEX_URL", "not set"),
        "can_resolve_plex": can_resolve_hostname("plex-server") if is_docker() else None,
    }
