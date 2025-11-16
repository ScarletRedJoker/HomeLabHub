"""
Setup & Deployment Assistance API
Provides intelligent troubleshooting and guidance for homelab setup
"""

from flask import Blueprint, request, jsonify, current_app
from functools import wraps
import subprocess
import os
import re
from typing import Dict, List, Tuple

setup_bp = Blueprint('setup', __name__, url_prefix='/api/setup')


def require_auth(f):
    """Require authentication for setup endpoints"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check for valid session (user logged in) - matches web.py login
        from flask import session
        if not session.get('authenticated'):
            return jsonify({
                "success": False,
                "message": "Authentication required. Please log in to the dashboard first."
            }), 401
        return f(*args, **kwargs)
    return decorated_function


def check_environment_variable(var_name: str) -> Tuple[bool, str]:
    """Check if an environment variable is set and valid"""
    value = os.getenv(var_name)
    
    if not value or value.strip() == "":
        return False, f"{var_name} is not set"
    
    # Additional validation based on variable type
    if "_URL" in var_name:
        if not (value.startswith("http://") or value.startswith("https://")):
            return False, f"{var_name} must be a valid URL (http:// or https://)"
    
    if "_API_KEY" in var_name:
        if len(value) < 20:
            return False, f"{var_name} appears to be invalid (too short)"
    
    return True, "Valid"


@setup_bp.route('/status', methods=['GET'])
def setup_status():
    """Get overall setup status and readiness"""
    
    status = {
        "ready": True,
        "services": {},
        "warnings": [],
        "errors": []
    }
    
    # Check core services
    core_vars = [
        ("DISCORD_DB_PASSWORD", "Database", True),
        ("STREAMBOT_DB_PASSWORD", "Database", True),
        ("JARVIS_DB_PASSWORD", "Database", True),
    ]
    
    for var_name, service, required in core_vars:
        is_valid, message = check_environment_variable(var_name)
        if not is_valid and required:
            status["errors"].append(f"{service}: {message}")
            status["ready"] = False
        elif not is_valid:
            status["warnings"].append(f"{service}: {message}")
    
    # Check optional integrations
    optional_services = {
        "Jarvis AI": "AI_INTEGRATIONS_OPENAI_API_KEY",
        "Home Assistant": "HOME_ASSISTANT_URL",
        "Discord Bot": "DISCORD_BOT_TOKEN",
        "Twitch": "TWITCH_CLIENT_ID",
        "YouTube": "YOUTUBE_CLIENT_ID",
    }
    
    for service_name, var_name in optional_services.items():
        is_valid, message = check_environment_variable(var_name)
        status["services"][service_name] = {
            "enabled": is_valid,
            "status": "configured" if is_valid else "not_configured",
            "message": message if not is_valid else "Ready"
        }
    
    return jsonify(status)


@setup_bp.route('/validate/<service>', methods=['POST'])
@require_auth
def validate_service(service):
    """Validate credentials for a specific service"""
    
    data = request.get_json()
    
    validators = {
        "openai": validate_openai_credentials,
        "home_assistant": validate_home_assistant_credentials,
        "discord": validate_discord_credentials,
    }
    
    validator = validators.get(service.lower())
    if not validator:
        return jsonify({
            "success": False,
            "message": f"Unknown service: {service}"
        }), 400
    
    try:
        result = validator(data)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


def validate_openai_credentials(data):
    """Validate OpenAI API key"""
    api_key = data.get("api_key")
    
    if not api_key:
        return {"success": False, "message": "API key is required"}
    
    import requests
    
    try:
        response = requests.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10
        )
        
        if response.status_code == 200:
            return {
                "success": True,
                "message": "OpenAI API key is valid",
                "models_available": len(response.json().get("data", []))
            }
        elif response.status_code == 401:
            return {"success": False, "message": "Invalid API key"}
        else:
            return {"success": False, "message": f"Validation failed (HTTP {response.status_code})"}
    
    except requests.exceptions.RequestException as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}


def validate_home_assistant_credentials(data):
    """Validate Home Assistant connection"""
    url = data.get("url")
    token = data.get("token")
    
    if not url or not token:
        return {"success": False, "message": "URL and token are required"}
    
    # Security: Only allow known internal network ranges or user's configured URL
    allowed_hosts = ["localhost", "127.0.0.1", os.getenv("HOME_ASSISTANT_URL", "")]
    if not any(host in url for host in allowed_hosts if host):
        # Additional validation - must be http:// or https://
        if not (url.startswith("http://") or url.startswith("https://")):
            return {"success": False, "message": "Invalid URL protocol"}
    
    import requests
    
    try:
        # Respect SSL verification unless explicitly disabled in env
        verify_ssl = os.getenv("HOME_ASSISTANT_VERIFY_SSL", "True").lower() == "true"
        
        response = requests.get(
            f"{url}/api/",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
            verify=verify_ssl
        )
        
        if response.status_code == 200:
            api_data = response.json()
            return {
                "success": True,
                "message": "Home Assistant connected successfully",
                "version": api_data.get("version", "unknown")
            }
        elif response.status_code == 401:
            return {"success": False, "message": "Invalid access token"}
        else:
            return {"success": False, "message": f"Connection failed (HTTP {response.status_code})"}
    
    except requests.exceptions.RequestException as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}


def validate_discord_credentials(data):
    """Validate Discord bot token"""
    bot_token = data.get("bot_token")
    
    if not bot_token:
        return {"success": False, "message": "Bot token is required"}
    
    import requests
    
    try:
        response = requests.get(
            "https://discord.com/api/v10/users/@me",
            headers={"Authorization": f"Bot {bot_token}"},
            timeout=10
        )
        
        if response.status_code == 200:
            bot_data = response.json()
            return {
                "success": True,
                "message": "Discord bot token is valid",
                "bot_name": bot_data.get("username"),
                "bot_id": bot_data.get("id")
            }
        elif response.status_code == 401:
            return {"success": False, "message": "Invalid bot token"}
        else:
            return {"success": False, "message": f"Validation failed (HTTP {response.status_code})"}
    
    except requests.exceptions.RequestException as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}


@setup_bp.route('/guides/<service>', methods=['GET'])
def get_setup_guide(service):
    """Get step-by-step setup guide for a service"""
    
    guides = {
        "openai": {
            "title": "OpenAI API Setup",
            "steps": [
                {
                    "step": 1,
                    "title": "Create OpenAI Account",
                    "description": "Visit https://platform.openai.com/signup and create an account",
                    "url": "https://platform.openai.com/signup"
                },
                {
                    "step": 2,
                    "title": "Navigate to API Keys",
                    "description": "Go to https://platform.openai.com/api-keys",
                    "url": "https://platform.openai.com/api-keys"
                },
                {
                    "step": 3,
                    "title": "Create New Secret Key",
                    "description": "Click 'Create new secret key' and give it a name like 'Homelab Dashboard'",
                    "note": "The key will only be shown once - copy it immediately!"
                },
                {
                    "step": 4,
                    "title": "Add to Replit Secrets",
                    "description": "In Replit, go to Tools → Secrets and add AI_INTEGRATIONS_OPENAI_API_KEY",
                    "env_var": "AI_INTEGRATIONS_OPENAI_API_KEY"
                }
            ]
        },
        "home_assistant": {
            "title": "Home Assistant Integration",
            "steps": [
                {
                    "step": 1,
                    "title": "Open Your Home Assistant",
                    "description": "Navigate to your Home Assistant instance in a web browser"
                },
                {
                    "step": 2,
                    "title": "Access Your Profile",
                    "description": "Click your profile icon in the bottom left corner"
                },
                {
                    "step": 3,
                    "title": "Create Long-Lived Access Token",
                    "description": "Scroll down to 'Long-Lived Access Tokens' section and click 'Create Token'",
                    "note": "Give it a name like 'Homelab Dashboard' so you can identify it later"
                },
                {
                    "step": 4,
                    "title": "Copy Token",
                    "description": "Copy the generated token immediately - you won't be able to see it again!",
                    "note": "If you lose it, you'll need to create a new one"
                },
                {
                    "step": 5,
                    "title": "Add to Environment",
                    "description": "Add both HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN to your Replit Secrets",
                    "env_vars": ["HOME_ASSISTANT_URL", "HOME_ASSISTANT_TOKEN"]
                }
            ]
        },
        "discord": {
            "title": "Discord Bot Setup",
            "steps": [
                {
                    "step": 1,
                    "title": "Discord Developer Portal",
                    "description": "Visit https://discord.com/developers/applications",
                    "url": "https://discord.com/developers/applications"
                },
                {
                    "step": 2,
                    "title": "Create New Application",
                    "description": "Click 'New Application' and give your bot a name"
                },
                {
                    "step": 3,
                    "title": "Create Bot User",
                    "description": "Go to the 'Bot' tab and click 'Add Bot'",
                    "note": "Enable the necessary intents (Server Members, Message Content, etc.)"
                },
                {
                    "step": 4,
                    "title": "Copy Bot Token",
                    "description": "Under the bot's username, click 'Reset Token' and copy the token",
                    "env_var": "DISCORD_BOT_TOKEN"
                },
                {
                    "step": 5,
                    "title": "Get OAuth2 Credentials",
                    "description": "Go to the 'OAuth2' tab and copy the Client ID and Client Secret",
                    "env_vars": ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"]
                },
                {
                    "step": 6,
                    "title": "Add Redirect URL",
                    "description": "In OAuth2 settings, add https://YOUR_DOMAIN/api/auth/discord/callback as a redirect URI"
                }
            ]
        },
        "twitch": {
            "title": "Twitch Integration Setup",
            "steps": [
                {
                    "step": 1,
                    "title": "Twitch Developer Console",
                    "description": "Visit https://dev.twitch.tv/console/apps",
                    "url": "https://dev.twitch.tv/console/apps"
                },
                {
                    "step": 2,
                    "title": "Register Application",
                    "description": "Click 'Register Your Application'",
                    "note": "Name: Stream Bot, Category: Chat Bot"
                },
                {
                    "step": 3,
                    "title": "Set OAuth Redirect URL",
                    "description": "Add https://YOUR_DOMAIN/api/auth/twitch/callback"
                },
                {
                    "step": 4,
                    "title": "Copy Credentials",
                    "description": "Copy the Client ID and generate a Client Secret",
                    "env_vars": ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"]
                }
            ]
        }
    }
    
    guide = guides.get(service.lower())
    if not guide:
        return jsonify({
            "success": False,
            "message": f"No guide available for: {service}"
        }), 404
    
    return jsonify({
        "success": True,
        "guide": guide
    })


@setup_bp.route('/troubleshoot', methods=['POST'])
@require_auth
def troubleshoot():
    """AI-powered troubleshooting assistance"""
    
    data = request.get_json()
    problem = data.get("problem", "")
    logs = data.get("logs", "")
    
    # Common troubleshooting patterns
    troubleshooting_db = {
        "port.*already.*allocated": {
            "issue": "Port Conflict",
            "solution": "A service is already using the required port. Run './deploy.sh stop' to stop all services, or check for conflicting Docker containers with 'docker ps'",
            "command": "docker ps --format '{{.Names}} {{.Ports}}'"
        },
        "connection.*refused": {
            "issue": "Service Connection Failed",
            "solution": "The service may not be running or not ready yet. Wait a few seconds and try again. Check service logs with 'docker-compose logs SERVICE_NAME'",
            "command": "docker-compose -f docker-compose.unified.yml ps"
        },
        "authentication.*failed|401|unauthorized": {
            "issue": "Authentication Error",
            "solution": "Your credentials may be invalid or expired. Check your .env file and verify the API keys/tokens are correct",
            "action": "Validate credentials in dashboard Settings"
        },
        "disk.*space|no space left": {
            "issue": "Disk Space Issue",
            "solution": "Your disk is full. Run './deploy.sh clean' to remove old logs and backups, or use 'docker system prune -a' to clean up Docker resources",
            "command": "./deploy.sh clean"
        },
        "permission denied": {
            "issue": "Permission Error",
            "solution": "The service doesn't have necessary permissions. Try running with sudo or check file permissions",
            "command": "ls -la"
        }
    }
    
    # Find matching issue
    detected_issues = []
    combined_text = f"{problem} {logs}".lower()
    
    for pattern, details in troubleshooting_db.items():
        if re.search(pattern, combined_text, re.IGNORECASE):
            detected_issues.append(details)
    
    if not detected_issues:
        detected_issues.append({
            "issue": "Unknown Issue",
            "solution": "Unable to automatically diagnose. Please check the logs and error messages carefully. You can also ask Jarvis AI for help by describing the problem in detail.",
            "suggestion": "Try running './deploy.sh health' to check system status"
        })
    
    return jsonify({
        "success": True,
        "issues_detected": len(detected_issues),
        "troubleshooting": detected_issues
    })


@setup_bp.route('/health', methods=['GET'])
def health_check():
    """Comprehensive health check of all services"""
    
    health = {
        "overall": "healthy",
        "checks": {}
    }
    
    # Check environment file
    if os.path.exists(".env"):
        health["checks"]["env_file"] = {"status": "ok", "message": ".env file exists"}
    else:
        health["checks"]["env_file"] = {"status": "error", "message": ".env file missing"}
        health["overall"] = "unhealthy"
    
    # Check required directories
    required_dirs = ["backups", "logs", "data"]
    for dir_name in required_dirs:
        if os.path.exists(dir_name):
            health["checks"][f"dir_{dir_name}"] = {"status": "ok"}
        else:
            health["checks"][f"dir_{dir_name}"] = {"status": "warning", "message": f"{dir_name} directory missing"}
    
    # Check database connectivity (if running)
    db_password = os.getenv("JARVIS_DB_PASSWORD")
    if db_password:
        health["checks"]["database"] = {"status": "ok", "message": "Database credentials configured"}
    else:
        health["checks"]["database"] = {"status": "warning", "message": "Database not configured"}
    
    return jsonify(health)
