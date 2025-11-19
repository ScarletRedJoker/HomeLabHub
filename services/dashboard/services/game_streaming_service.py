"""Game Streaming Service - Sunshine/Moonlight Integration"""
import os
import re
import socket
import subprocess
import logging
import requests
import uuid
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta
from config import Config

logger = logging.getLogger(__name__)


class GameStreamingService:
    """Service for managing Sunshine game streaming hosts and sessions"""
    
    # Sunshine API endpoints
    SUNSHINE_API_VERSION = "v1"
    SUNSHINE_DEFAULT_PORTS = {
        'https': 47984,
        'http': 47990,
        'webui': 47990,
        'video': 47998,
        'control': 47999,
        'audio': 48000,
        'mic': 48010
    }
    
    def __init__(self, db_service=None):
        """Initialize game streaming service"""
        self.db_service = db_service
        self.sunshine_host = Config.SUNSHINE_HOST
        self.sunshine_port = Config.SUNSHINE_PORT
        self.sunshine_api_key = Config.SUNSHINE_API_KEY
        self.auto_discover = Config.SUNSHINE_AUTO_DISCOVER
        
        logger.info("╔══════════════════════════════════════════════════════════════╗")
        logger.info("║ Game Streaming Service - INITIALIZING                        ║")
        logger.info("╠══════════════════════════════════════════════════════════════╣")
        logger.info(f"║ Sunshine Host: {self.sunshine_host or 'Not configured':<44} ║")
        logger.info(f"║ Sunshine Port: {self.sunshine_port:<44} ║")
        logger.info(f"║ Auto-Discovery: {str(self.auto_discover):<43} ║")
        logger.info("╚══════════════════════════════════════════════════════════════╝")
    
    def _get_sunshine_url(self, host_id: Optional[str] = None, host_ip: Optional[str] = None, 
                          port: Optional[int] = None, use_https: bool = False) -> str:
        """
        Build Sunshine API URL
        
        Prioritizes host-specific api_url from database if host_id provided,
        falls back to building URL from host_ip/port or Config defaults.
        
        Args:
            host_id: Host UUID (optional, uses database api_url if available)
            host_ip: Host IP address (optional, used if host_id not provided)
            port: Port number (defaults to configured port)
            use_https: Use HTTPS instead of HTTP
            
        Returns:
            Full URL to Sunshine API
        """
        from models.gaming import SunshineHost
        
        # Try to get host-specific URL from database
        if host_id and self.db_service and self.db_service.is_available:
            try:
                with self.db_service.get_session() as session:
                    host = session.query(SunshineHost).filter_by(id=host_id).first()
                    if host and host.api_url:
                        return host.api_url
                    if host and not host_ip:
                        host_ip = host.host_ip
            except Exception as e:
                logger.warning(f"Failed to get host-specific URL from database: {e}")
        
        # Fallback to building URL from parameters or Config
        if not host_ip:
            host_ip = self.sunshine_host or Config.SUNSHINE_HOST
        
        protocol = 'https' if use_https else 'http'
        port = port or self.sunshine_port
        return f"{protocol}://{host_ip}:{port}"
    
    def _get_sunshine_api_key(self, host_id: Optional[str] = None) -> Optional[str]:
        """
        Get Sunshine API key for a host
        
        Prioritizes host-specific API key from host_metadata,
        falls back to Config default.
        
        Args:
            host_id: Host UUID (optional)
            
        Returns:
            API key string or None
        """
        from models.gaming import SunshineHost
        
        # Try to get host-specific API key from database
        if host_id and self.db_service and self.db_service.is_available:
            try:
                with self.db_service.get_session() as session:
                    host = session.query(SunshineHost).filter_by(id=host_id).first()
                    if host and host.host_metadata:
                        api_key = host.host_metadata.get('sunshine_api_key')
                        if api_key:
                            return api_key
            except Exception as e:
                logger.warning(f"Failed to get host-specific API key from database: {e}")
        
        # Fallback to Config default
        return self.sunshine_api_key or Config.SUNSHINE_API_KEY
    
    def _make_sunshine_request(self, host_id: str, method: str, endpoint: str, **kwargs) -> Dict:
        """
        Centralized Sunshine API request handler with proper auth and TLS
        
        Features:
        - Uses per-host Sunshine API credentials from host_metadata
        - Proper SSL cert validation (or explicit per-host skip flag)
        - Unified auth header construction (Bearer or Basic based on host config)
        - Timeout handling with sensible defaults
        - Connection error handling with specific messages
        
        Args:
            host_id: Host UUID
            method: HTTP method (GET, POST, PUT, PATCH, DELETE)
            endpoint: API endpoint (e.g., '/api/config')
            **kwargs: Additional arguments to pass to requests.request()
        
        Returns:
            Dictionary with success status and data or error:
            {
                'success': bool,
                'data': dict (if successful),
                'error': str (if failed),
                'status_code': int (if failed)
            }
        """
        from models.gaming import SunshineHost
        from requests.auth import HTTPBasicAuth
        
        if not self.db_service or not self.db_service.is_available:
            return {
                'success': False,
                'error': 'Database service not available'
            }
        
        try:
            with self.db_service.get_session() as session:
                host = session.query(SunshineHost).filter_by(id=host_id).first()
                
                if not host:
                    return {
                        'success': False,
                        'error': f'Host {host_id} not found'
                    }
                
                # Get API URL and credentials
                api_url = self._get_sunshine_url(host_id)
                api_key = self._get_sunshine_api_key(host_id)
                
                # Get per-host SSL verification setting (default: False for self-signed certs)
                host_metadata = host.host_metadata or {}
                verify_ssl = host_metadata.get('sunshine_verify_ssl', False)
                
                # Build headers
                headers = kwargs.pop('headers', {})
                
                # Construct auth header based on configuration
                auth = None
                if api_key:
                    # Use Bearer token auth if API key is configured
                    headers['Authorization'] = f'Bearer {api_key}'
                else:
                    # Fall back to Basic auth if credentials are in host_metadata
                    username = host_metadata.get('sunshine_username')
                    password = host_metadata.get('sunshine_password')
                    if username and password:
                        auth = HTTPBasicAuth(username, password)
                
                # Set default timeout if not provided
                timeout = kwargs.pop('timeout', 10)
                
                # Make the request
                url = f"{api_url}{endpoint}"
                logger.debug(f"Making {method} request to {url} (verify_ssl={verify_ssl})")
                
                response = requests.request(
                    method,
                    url,
                    headers=headers,
                    auth=auth,
                    verify=verify_ssl,
                    timeout=timeout,
                    **kwargs
                )
                
                # Check for HTTP errors
                response.raise_for_status()
                
                # Try to parse JSON response
                try:
                    data = response.json()
                except ValueError:
                    # Not JSON, return text content
                    data = {'text': response.text}
                
                return {
                    'success': True,
                    'data': data,
                    'status_code': response.status_code
                }
                
        except requests.exceptions.ConnectionError as e:
            logger.error(f"Connection error to Sunshine host {host_id}: {e}")
            return {
                'success': False,
                'error': 'Cannot connect to Sunshine host',
                'error_details': str(e)
            }
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout connecting to Sunshine host {host_id}: {e}")
            return {
                'success': False,
                'error': 'Request timeout',
                'error_details': f'Connection timed out after {timeout}s'
            }
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response else None
            
            if status_code == 401:
                logger.error(f"Authentication failed for Sunshine host {host_id}")
                return {
                    'success': False,
                    'error': 'Authentication failed - check API key',
                    'status_code': 401
                }
            elif status_code == 404:
                return {
                    'success': False,
                    'error': f'Endpoint not found: {endpoint}',
                    'status_code': 404
                }
            else:
                logger.error(f"HTTP error {status_code} for Sunshine host {host_id}: {e}")
                return {
                    'success': False,
                    'error': f'HTTP {status_code}',
                    'error_details': str(e),
                    'status_code': status_code
                }
        except Exception as e:
            logger.error(f"Unexpected error making request to Sunshine host {host_id}: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unexpected error',
                'error_details': str(e)
            }
    
    def get_app_templates(self) -> Dict[str, List[Dict]]:
        """
        Returns categorized list of app templates for Windows applications
        
        This provides a comprehensive set of pre-configured templates for
        common Windows applications, organized by category.
        
        Returns:
            Dictionary with categories as keys, each containing a list of app templates:
            {
                'gaming': [...],
                'productivity': [...],
                'development': [...],
                'communication': [...],
                'utilities': [...],
                'desktop': [...]
            }
        """
        templates = {
            'gaming': [
                {
                    'name': 'Steam Big Picture',
                    'cmd': ['C:\\Program Files (x86)\\Steam\\steam.exe', '-bigpicture'],
                    'category': 'gaming',
                    'icon_url': 'https://cdn.cloudflare.steamstatic.com/store/home/store_icon.svg',
                    'description': 'Launch Steam in Big Picture mode'
                },
                {
                    'name': 'Epic Games Launcher',
                    'cmd': ['C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe'],
                    'category': 'gaming',
                    'icon_url': 'https://static-assets-prod.epicgames.com/epic-store/static/favicon.ico',
                    'description': 'Epic Games Store launcher'
                },
                {
                    'name': 'GOG Galaxy',
                    'cmd': ['C:\\Program Files (x86)\\GOG Galaxy\\GalaxyClient.exe'],
                    'category': 'gaming',
                    'description': 'GOG Galaxy game launcher'
                },
                {
                    'name': 'Xbox App',
                    'cmd': ['C:\\Program Files\\WindowsApps\\Microsoft.GamingApp_*\\XboxPcApp.exe'],
                    'category': 'gaming',
                    'description': 'Xbox Game Pass launcher'
                }
            ],
            'productivity': [
                {
                    'name': 'Microsoft Word',
                    'cmd': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE'],
                    'category': 'productivity',
                    'icon_url': 'https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/item-types/96/docx.svg',
                    'description': 'Microsoft Word document editor'
                },
                {
                    'name': 'Microsoft Excel',
                    'cmd': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE'],
                    'category': 'productivity',
                    'icon_url': 'https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/item-types/96/xlsx.svg',
                    'description': 'Microsoft Excel spreadsheet editor'
                },
                {
                    'name': 'Microsoft PowerPoint',
                    'cmd': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\POWERPNT.EXE'],
                    'category': 'productivity',
                    'icon_url': 'https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/item-types/96/pptx.svg',
                    'description': 'Microsoft PowerPoint presentation editor'
                },
                {
                    'name': 'Microsoft Outlook',
                    'cmd': ['C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE'],
                    'category': 'productivity',
                    'icon_url': 'https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/item-types/96/email.svg',
                    'description': 'Microsoft Outlook email client'
                },
                {
                    'name': 'Adobe Photoshop',
                    'cmd': ['C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe'],
                    'category': 'productivity',
                    'description': 'Adobe Photoshop image editor'
                },
                {
                    'name': 'Adobe Illustrator',
                    'cmd': ['C:\\Program Files\\Adobe\\Adobe Illustrator 2024\\Support Files\\Contents\\Windows\\Illustrator.exe'],
                    'category': 'productivity',
                    'description': 'Adobe Illustrator vector graphics editor'
                },
                {
                    'name': 'Adobe Premiere Pro',
                    'cmd': ['C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe'],
                    'category': 'productivity',
                    'description': 'Adobe Premiere Pro video editor'
                },
                {
                    'name': 'Adobe After Effects',
                    'cmd': ['C:\\Program Files\\Adobe\\Adobe After Effects 2024\\Support Files\\AfterFX.exe'],
                    'category': 'productivity',
                    'description': 'Adobe After Effects motion graphics and VFX'
                }
            ],
            'development': [
                {
                    'name': 'Visual Studio Code',
                    'cmd': ['C:\\Program Files\\Microsoft VS Code\\Code.exe'],
                    'category': 'development',
                    'icon_url': 'https://code.visualstudio.com/favicon.ico',
                    'description': 'Visual Studio Code text editor'
                },
                {
                    'name': 'Visual Studio 2022',
                    'cmd': ['C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\Common7\\IDE\\devenv.exe'],
                    'category': 'development',
                    'description': 'Visual Studio IDE'
                },
                {
                    'name': 'JetBrains IntelliJ IDEA',
                    'cmd': ['C:\\Program Files\\JetBrains\\IntelliJ IDEA\\bin\\idea64.exe'],
                    'category': 'development',
                    'icon_url': 'https://resources.jetbrains.com/storage/products/intellij-idea/img/meta/intellij-idea_logo_300x300.png',
                    'description': 'IntelliJ IDEA Java IDE'
                },
                {
                    'name': 'JetBrains PyCharm',
                    'cmd': ['C:\\Program Files\\JetBrains\\PyCharm\\bin\\pycharm64.exe'],
                    'category': 'development',
                    'description': 'PyCharm Python IDE'
                },
                {
                    'name': 'Git Bash',
                    'cmd': ['C:\\Program Files\\Git\\git-bash.exe'],
                    'category': 'development',
                    'description': 'Git Bash terminal'
                },
                {
                    'name': 'Docker Desktop',
                    'cmd': ['C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe'],
                    'category': 'development',
                    'description': 'Docker Desktop container platform'
                }
            ],
            'communication': [
                {
                    'name': 'Discord',
                    'cmd': ['%LocalAppData%\\Discord\\Update.exe', '--processStart', 'Discord.exe'],
                    'category': 'communication',
                    'icon_url': 'https://discord.com/assets/f8389ca1a741a115313bede9ac02e2c0.svg',
                    'description': 'Discord voice and chat app'
                },
                {
                    'name': 'Slack',
                    'cmd': ['%LocalAppData%\\slack\\slack.exe'],
                    'category': 'communication',
                    'icon_url': 'https://a.slack-edge.com/80588/marketing/img/meta/favicon-32.png',
                    'description': 'Slack team communication'
                },
                {
                    'name': 'Microsoft Teams',
                    'cmd': ['%LocalAppData%\\Microsoft\\Teams\\current\\Teams.exe'],
                    'category': 'communication',
                    'description': 'Microsoft Teams collaboration'
                },
                {
                    'name': 'Zoom',
                    'cmd': ['C:\\Program Files\\Zoom\\bin\\Zoom.exe'],
                    'category': 'communication',
                    'icon_url': 'https://st1.zoom.us/static/6.3.11701/image/new/topNav/Zoom_logo.svg',
                    'description': 'Zoom video conferencing'
                },
                {
                    'name': 'Skype',
                    'cmd': ['C:\\Program Files\\Microsoft\\Skype for Desktop\\Skype.exe'],
                    'category': 'communication',
                    'description': 'Skype video calling'
                }
            ],
            'browsers': [
                {
                    'name': 'Google Chrome',
                    'cmd': ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'],
                    'category': 'browsers',
                    'icon_url': 'https://www.google.com/chrome/static/images/favicons/favicon-96x96.png',
                    'description': 'Google Chrome web browser'
                },
                {
                    'name': 'Mozilla Firefox',
                    'cmd': ['C:\\Program Files\\Mozilla Firefox\\firefox.exe'],
                    'category': 'browsers',
                    'icon_url': 'https://www.mozilla.org/media/img/favicons/firefox/browser/favicon.196fdf3ca83c.svg',
                    'description': 'Mozilla Firefox web browser'
                },
                {
                    'name': 'Microsoft Edge',
                    'cmd': ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
                    'category': 'browsers',
                    'description': 'Microsoft Edge web browser'
                },
                {
                    'name': 'Opera',
                    'cmd': ['C:\\Program Files\\Opera\\opera.exe'],
                    'category': 'browsers',
                    'description': 'Opera web browser'
                },
                {
                    'name': 'Brave',
                    'cmd': ['C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'],
                    'category': 'browsers',
                    'description': 'Brave privacy-focused browser'
                }
            ],
            'utilities': [
                {
                    'name': 'File Explorer',
                    'cmd': ['explorer.exe'],
                    'category': 'utilities',
                    'description': 'Windows File Explorer'
                },
                {
                    'name': 'Task Manager',
                    'cmd': ['taskmgr.exe'],
                    'category': 'utilities',
                    'description': 'Windows Task Manager'
                },
                {
                    'name': 'PowerShell',
                    'cmd': ['powershell.exe'],
                    'category': 'utilities',
                    'description': 'Windows PowerShell terminal'
                },
                {
                    'name': 'Command Prompt',
                    'cmd': ['cmd.exe'],
                    'category': 'utilities',
                    'description': 'Windows Command Prompt'
                },
                {
                    'name': 'Windows Terminal',
                    'cmd': ['wt.exe'],
                    'category': 'utilities',
                    'description': 'Modern Windows Terminal'
                },
                {
                    'name': 'Notepad++',
                    'cmd': ['C:\\Program Files\\Notepad++\\notepad++.exe'],
                    'category': 'utilities',
                    'description': 'Notepad++ text editor'
                },
                {
                    'name': '7-Zip File Manager',
                    'cmd': ['C:\\Program Files\\7-Zip\\7zFM.exe'],
                    'category': 'utilities',
                    'description': '7-Zip archive manager'
                }
            ],
            'desktop': [
                {
                    'name': 'Full Windows Desktop',
                    'cmd': ['explorer.exe'],
                    'category': 'desktop',
                    'description': 'Stream full Windows desktop'
                }
            ]
        }
        
        return templates
    
    def scan_installed_apps(self, host_id: str) -> Dict:
        """
        Scans remote Windows host for installed applications via SSH
        
        Runs PowerShell commands to detect installed applications in common directories:
        - C:\\Program Files\\
        - C:\\Program Files (x86)\\
        - %LocalAppData%\\
        - Common executable locations
        
        Args:
            host_id: Host UUID
            
        Returns:
            Dictionary with scan results:
            {
                'success': bool,
                'apps': List[Dict] (detected applications),
                'count': int,
                'error': str (if failed)
            }
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            return {
                'success': False,
                'error': 'Database service not available'
            }
        
        try:
            # Get SSH connection details
            host_ip, ssh_service = self._get_ssh_connection(host_id)
            
            if not ssh_service:
                return {
                    'success': False,
                    'error': 'SSH service not available'
                }
            
            # PowerShell script to scan for installed applications
            powershell_script = r'''
$apps = @()

# Scan Program Files
$programFiles = "C:\Program Files"
$programFilesX86 = "C:\Program Files (x86)"

# Get executables from Program Files (depth 2 to avoid deep recursion)
Get-ChildItem -Path $programFiles -Filter *.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue | 
    Select-Object FullName, Name, @{Name='Size';Expression={$_.Length}}, LastWriteTime | 
    ForEach-Object {
        $apps += [PSCustomObject]@{
            name = $_.Name -replace '\.exe$', ''
            path = $_.FullName
            size = $_.Size
            modified = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
        }
    }

# Get executables from Program Files (x86)
if (Test-Path $programFilesX86) {
    Get-ChildItem -Path $programFilesX86 -Filter *.exe -Recurse -Depth 2 -ErrorAction SilentlyContinue | 
        Select-Object FullName, Name, @{Name='Size';Expression={$_.Length}}, LastWriteTime | 
        ForEach-Object {
            $apps += [PSCustomObject]@{
                name = $_.Name -replace '\.exe$', ''
                path = $_.FullName
                size = $_.Size
                modified = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')
            }
        }
}

# Convert to JSON
$apps | ConvertTo-Json -Compress
'''
            
            # Execute PowerShell script via SSH
            logger.info(f"Scanning for installed apps on host {host_ip}...")
            
            result = ssh_service.execute_command(
                host_ip,
                f'powershell -NoProfile -Command "{powershell_script}"',
                timeout=60
            )
            
            if not result['success']:
                return {
                    'success': False,
                    'error': 'Failed to execute scan command',
                    'error_details': result.get('error', 'Unknown error')
                }
            
            # Parse JSON output
            import json
            try:
                output = result.get('output', '').strip()
                
                if not output:
                    return {
                        'success': True,
                        'apps': [],
                        'count': 0,
                        'message': 'No applications found'
                    }
                
                apps_data = json.loads(output)
                
                # Ensure it's a list
                if not isinstance(apps_data, list):
                    apps_data = [apps_data]
                
                # Filter out system files and duplicates
                seen_paths = set()
                filtered_apps = []
                
                # Common app keywords to filter for
                app_keywords = [
                    'chrome', 'firefox', 'edge', 'opera', 'brave',
                    'code', 'studio', 'intellij', 'pycharm', 'eclipse',
                    'office', 'word', 'excel', 'powerpoint', 'outlook',
                    'photoshop', 'illustrator', 'premiere', 'afterfx',
                    'discord', 'slack', 'teams', 'zoom', 'skype',
                    'steam', 'epic', 'gog', 'xbox',
                    'notepad++', '7zfm', 'winrar'
                ]
                
                for app in apps_data:
                    path = app.get('path', '').lower()
                    name = app.get('name', '').lower()
                    
                    # Skip duplicates
                    if path in seen_paths:
                        continue
                    
                    # Skip system directories
                    if any(sys_dir in path for sys_dir in ['windows\\system32', 'windows\\syswow64', 'windowsapps']):
                        continue
                    
                    # Only include if it matches known app keywords or is in a root Program Files folder
                    is_root_app = path.count('\\') <= 4  # Not too deep in folder structure
                    matches_keyword = any(keyword in name for keyword in app_keywords)
                    
                    if is_root_app or matches_keyword:
                        seen_paths.add(path)
                        filtered_apps.append({
                            'name': app.get('name', 'Unknown').replace('.exe', ''),
                            'cmd': [app.get('path', '')],
                            'category': self._detect_app_category(app.get('name', '')),
                            'detected': True,
                            'size_mb': round(app.get('size', 0) / (1024 * 1024), 2),
                            'modified': app.get('modified', '')
                        })
                
                logger.info(f"Found {len(filtered_apps)} applications on host {host_ip}")
                
                return {
                    'success': True,
                    'apps': filtered_apps,
                    'count': len(filtered_apps),
                    'total_scanned': len(apps_data)
                }
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse scan results: {e}")
                return {
                    'success': False,
                    'error': 'Failed to parse scan results',
                    'error_details': str(e)
                }
                
        except Exception as e:
            logger.error(f"App scan failed for host {host_id}: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'App scan failed',
                'error_details': str(e)
            }
    
    def _detect_app_category(self, app_name: str) -> str:
        """
        Detect app category based on application name
        
        Args:
            app_name: Application name
            
        Returns:
            Category string
        """
        app_lower = app_name.lower()
        
        # Gaming
        if any(keyword in app_lower for keyword in ['steam', 'epic', 'gog', 'xbox', 'game']):
            return 'gaming'
        
        # Development
        if any(keyword in app_lower for keyword in ['code', 'studio', 'intellij', 'pycharm', 'eclipse', 'git', 'docker']):
            return 'development'
        
        # Productivity
        if any(keyword in app_lower for keyword in ['office', 'word', 'excel', 'powerpoint', 'outlook', 'photoshop', 'illustrator', 'premiere', 'afterfx']):
            return 'productivity'
        
        # Communication
        if any(keyword in app_lower for keyword in ['discord', 'slack', 'teams', 'zoom', 'skype']):
            return 'communication'
        
        # Browsers
        if any(keyword in app_lower for keyword in ['chrome', 'firefox', 'edge', 'opera', 'brave', 'browser']):
            return 'browsers'
        
        # Utilities (default)
        return 'utilities'
    
    def update_sunshine_quality_config(self, host_id: str, quality_preset: Dict) -> Dict:
        """
        Update Sunshine quality configuration via API
        
        This actually modifies the Sunshine server configuration to use the specified
        quality settings for encoding.
        
        Args:
            host_id: Host UUID
            quality_preset: Dictionary with quality settings:
                {
                    'resolution': '1920x1080',  # Video resolution
                    'fps': 60,                   # Target FPS
                    'bitrate': 20000,            # Bitrate in kbps
                    'encoder_preset': 'p6',      # NVENC preset (p1-p7)
                    'codec': 'h264'              # Codec: h264, h265, av1
                }
        
        Returns:
            Dictionary with result:
            {
                'success': bool,
                'message': str,
                'applied_config': dict (if successful),
                'error': str (if failed)
            }
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            return {
                'success': False,
                'error': 'Database service not available'
            }
        
        try:
            # Validate quality preset
            required_fields = ['resolution', 'fps', 'bitrate', 'encoder_preset', 'codec']
            for field in required_fields:
                if field not in quality_preset:
                    return {
                        'success': False,
                        'error': f'Missing required field: {field}'
                    }
            
            # Build Sunshine config payload
            # Note: Actual Sunshine config format may vary by version
            config_payload = {
                'video': {
                    'resolution': quality_preset['resolution'],
                    'fps': quality_preset['fps'],
                    'bitrate': quality_preset['bitrate'],
                    'encoder': quality_preset['codec'],
                    'encoder_preset': quality_preset['encoder_preset']
                }
            }
            
            # Make API request to update config
            result = self._make_sunshine_request(
                host_id,
                'POST',
                '/api/config',
                json=config_payload
            )
            
            if not result['success']:
                return result
            
            # Persist configuration to host_metadata for reuse
            with self.db_service.get_session() as session:
                host = session.query(SunshineHost).filter_by(id=host_id).first()
                
                if host:
                    host_metadata = host.host_metadata or {}
                    host_metadata['quality_config'] = quality_preset
                    host_metadata['quality_config_updated_at'] = datetime.utcnow().isoformat()
                    host.host_metadata = host_metadata
                    session.commit()
                    
                    logger.info(f"Quality configuration applied to Sunshine host {host_id}: {quality_preset}")
            
            return {
                'success': True,
                'message': 'Quality configuration applied successfully',
                'applied_config': quality_preset
            }
            
        except Exception as e:
            logger.error(f"Failed to update quality config for host {host_id}: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Failed to update configuration',
                'error_details': str(e)
            }
    
    def get_detailed_session_telemetry(self, host_id: str) -> Dict:
        """
        Get comprehensive session telemetry from Sunshine
        
        Combines data from:
        - Sunshine API (active sessions, encoder stats, client info)
        - SSH/nvidia-smi (GPU stats during session)
        - Database (historical metrics)
        
        Returns comprehensive telemetry including:
        - Active sessions with encoder stats (NVENC usage, quality, dropped frames)
        - Client IP/device info
        - Current bitrate/resolution/FPS from actual stream
        - Network stats (latency, packet loss)
        - Host GPU stats during session (temperature, utilization, VRAM)
        
        Args:
            host_id: Host UUID
        
        Returns:
            Dictionary with detailed telemetry:
            {
                'success': bool,
                'host_id': str,
                'host_ip': str,
                'telemetry': {
                    'active_sessions': [
                        {
                            'session_id': str,
                            'client_ip': str,
                            'client_device': str,
                            'resolution': str,
                            'fps': int,
                            'bitrate_kbps': int,
                            'encoder': str (NVENC/x264),
                            'codec': str,
                            'dropped_frames': int,
                            'dropped_frames_pct': float,
                            'latency_ms': float,
                            'packet_loss_pct': float,
                            'duration_seconds': int
                        }
                    ],
                    'gpu_stats': {
                        'temperature': int,
                        'utilization': int,
                        'vram_used': int,
                        'vram_total': int,
                        'encoder_utilization': int
                    },
                    'aggregate_stats': {
                        'total_sessions': int,
                        'avg_latency_ms': float,
                        'avg_bitrate_mbps': float,
                        'total_dropped_frames': int
                    }
                },
                'error': str (if failed)
            }
        """
        from models.gaming import SunshineHost, GameSession
        
        if not self.db_service or not self.db_service.is_available:
            return {
                'success': False,
                'error': 'Database service not available'
            }
        
        try:
            with self.db_service.get_session() as session:
                host = session.query(SunshineHost).filter_by(id=host_id).first()
                
                if not host:
                    return {
                        'success': False,
                        'error': f'Host {host_id} not found'
                    }
                
                host_ip = host.host_ip
            
            telemetry = {
                'active_sessions': [],
                'gpu_stats': {},
                'aggregate_stats': {}
            }
            
            # PART 1: Get active sessions from Sunshine API
            api_result = self._make_sunshine_request(host_id, 'GET', '/api/sessions')
            
            if api_result['success'] and 'data' in api_result:
                sessions_data = api_result['data']
                
                if isinstance(sessions_data, dict) and 'sessions' in sessions_data:
                    for sess in sessions_data['sessions']:
                        session_info = {
                            'session_id': sess.get('id', 'unknown'),
                            'client_ip': sess.get('client_ip'),
                            'client_device': sess.get('client_device'),
                            'resolution': sess.get('resolution'),
                            'fps': sess.get('fps'),
                            'bitrate_kbps': sess.get('bitrate'),
                            'encoder': sess.get('encoder', 'Unknown'),
                            'codec': sess.get('codec', 'h264'),
                            'dropped_frames': sess.get('dropped_frames', 0),
                            'dropped_frames_pct': sess.get('dropped_frames_pct', 0.0),
                            'latency_ms': sess.get('latency_ms'),
                            'packet_loss_pct': sess.get('packet_loss_pct', 0.0),
                            'duration_seconds': sess.get('duration_seconds', 0)
                        }
                        telemetry['active_sessions'].append(session_info)
            
            # PART 2: Get GPU stats via SSH (already implemented in get_performance_metrics_remote)
            perf_result = self.get_performance_metrics_remote(host_id)
            
            if perf_result['success'] and 'metrics' in perf_result:
                metrics = perf_result['metrics']
                telemetry['gpu_stats'] = {
                    'temperature': metrics.get('gpu_temperature'),
                    'utilization': metrics.get('gpu_utilization', 0),
                    'vram_used': metrics['vram']['used'] if metrics.get('vram') else None,
                    'vram_total': metrics['vram']['total'] if metrics.get('vram') else None,
                    'encoder_utilization': metrics.get('encoder_utilization', 0)
                }
                
                # If Sunshine API didn't return sessions, use SSH encoder stats
                if not telemetry['active_sessions'] and metrics.get('encoder_stats'):
                    enc_stats = metrics['encoder_stats']
                    if enc_stats.get('session_count', 0) > 0:
                        # Create placeholder session info from encoder stats
                        telemetry['active_sessions'].append({
                            'session_id': 'detected_via_nvidia_smi',
                            'client_ip': 'Unknown',
                            'client_device': 'Unknown',
                            'resolution': metrics.get('streaming_quality', {}).get('resolution') if metrics.get('streaming_quality') else None,
                            'fps': enc_stats.get('avg_fps'),
                            'bitrate_kbps': int(enc_stats.get('bitrate', 0) * 1000) if enc_stats.get('bitrate') else None,
                            'encoder': 'NVENC',
                            'codec': 'Unknown',
                            'dropped_frames': None,
                            'dropped_frames_pct': None,
                            'latency_ms': metrics.get('network_latency'),
                            'packet_loss_pct': None,
                            'duration_seconds': None
                        })
            
            # PART 3: Calculate aggregate stats
            if telemetry['active_sessions']:
                total_sessions = len(telemetry['active_sessions'])
                
                latencies = [s['latency_ms'] for s in telemetry['active_sessions'] if s.get('latency_ms')]
                bitrates = [s['bitrate_kbps'] for s in telemetry['active_sessions'] if s.get('bitrate_kbps')]
                dropped_frames = [s['dropped_frames'] for s in telemetry['active_sessions'] if s.get('dropped_frames') is not None]
                
                telemetry['aggregate_stats'] = {
                    'total_sessions': total_sessions,
                    'avg_latency_ms': round(sum(latencies) / len(latencies), 1) if latencies else None,
                    'avg_bitrate_mbps': round(sum(bitrates) / len(bitrates) / 1000, 2) if bitrates else None,
                    'total_dropped_frames': sum(dropped_frames) if dropped_frames else 0
                }
            else:
                telemetry['aggregate_stats'] = {
                    'total_sessions': 0,
                    'avg_latency_ms': None,
                    'avg_bitrate_mbps': None,
                    'total_dropped_frames': 0
                }
            
            logger.info(f"Retrieved detailed telemetry for host {host_id}: {len(telemetry['active_sessions'])} active sessions")
            
            return {
                'success': True,
                'host_id': host_id,
                'host_ip': host_ip,
                'telemetry': telemetry
            }
            
        except Exception as e:
            logger.error(f"Failed to get detailed telemetry for host {host_id}: {e}", exc_info=True)
            return {
                'success': False,
                'host_id': host_id,
                'error': 'Failed to retrieve telemetry',
                'error_details': str(e)
            }
    
    def persist_session_metrics(self, host_id: str, session_data: Dict) -> Dict:
        """
        Persist session metrics to GameSession database for history/analytics
        
        Args:
            host_id: Host UUID
            session_data: Session metrics dictionary (from get_detailed_session_telemetry)
        
        Returns:
            Dictionary with result:
            {
                'success': bool,
                'persisted_sessions': int,
                'error': str (if failed)
            }
        """
        from models.gaming import SunshineHost, GameSession
        
        if not self.db_service or not self.db_service.is_available:
            return {
                'success': False,
                'error': 'Database service not available'
            }
        
        try:
            with self.db_service.get_session() as db_session:
                host = db_session.query(SunshineHost).filter_by(id=host_id).first()
                
                if not host:
                    return {
                        'success': False,
                        'error': f'Host {host_id} not found'
                    }
                
                persisted_count = 0
                
                # Get active sessions from telemetry
                active_sessions = session_data.get('active_sessions', [])
                
                for sess in active_sessions:
                    # Check if session already exists in database
                    session_id_str = sess.get('session_id')
                    
                    if session_id_str and session_id_str != 'detected_via_nvidia_smi':
                        # Try to find existing session
                        existing_session = db_session.query(GameSession).filter_by(
                            id=session_id_str
                        ).first()
                        
                        if existing_session:
                            # Update existing session with latest metrics
                            existing_session.latency_ms = sess.get('latency_ms')
                            existing_session.fps = sess.get('fps')
                            existing_session.bitrate_mbps = sess.get('bitrate_kbps') / 1000.0 if sess.get('bitrate_kbps') else None
                            existing_session.resolution = sess.get('resolution')
                            
                            # Update game_metadata with detailed stats
                            metadata = existing_session.game_metadata or {}
                            metadata.update({
                                'encoder': sess.get('encoder'),
                                'codec': sess.get('codec'),
                                'dropped_frames': sess.get('dropped_frames'),
                                'dropped_frames_pct': sess.get('dropped_frames_pct'),
                                'packet_loss_pct': sess.get('packet_loss_pct'),
                                'last_updated': datetime.utcnow().isoformat()
                            })
                            existing_session.game_metadata = metadata
                            persisted_count += 1
                        else:
                            # Create new session
                            new_session = GameSession(
                                id=uuid.uuid4(),
                                session_type='moonlight',
                                host_ip=host.host_ip,
                                host_name=host.host_name,
                                status='active',
                                client_device=sess.get('client_device'),
                                resolution=sess.get('resolution'),
                                fps=sess.get('fps'),
                                bitrate_mbps=sess.get('bitrate_kbps') / 1000.0 if sess.get('bitrate_kbps') else None,
                                latency_ms=sess.get('latency_ms'),
                                game_metadata={
                                    'encoder': sess.get('encoder'),
                                    'codec': sess.get('codec'),
                                    'dropped_frames': sess.get('dropped_frames'),
                                    'dropped_frames_pct': sess.get('dropped_frames_pct'),
                                    'packet_loss_pct': sess.get('packet_loss_pct'),
                                    'client_ip': sess.get('client_ip')
                                },
                                started_at=datetime.utcnow()
                            )
                            db_session.add(new_session)
                            persisted_count += 1
                
                db_session.commit()
                
                logger.info(f"Persisted {persisted_count} session metrics for host {host_id}")
                
                return {
                    'success': True,
                    'persisted_sessions': persisted_count
                }
                
        except Exception as e:
            logger.error(f"Failed to persist session metrics for host {host_id}: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Failed to persist metrics',
                'error_details': str(e)
            }
    
    def auto_discover_hosts(self, network_range: Optional[str] = None) -> List[Dict]:
        """
        Auto-discover Sunshine hosts on the network using ARP/nmap
        
        Args:
            network_range: Network range to scan (e.g., "192.168.1.0/24")
            
        Returns:
            List of discovered hosts with their info
        """
        discovered_hosts = []
        
        try:
            # If no network range specified, try to determine from local IP
            if not network_range:
                network_range = self._get_local_network_range()
            
            logger.info(f"Starting network scan on {network_range}")
            
            # Method 1: Try nmap first (most reliable)
            hosts = self._scan_with_nmap(network_range)
            
            # Method 2: Fallback to ARP scan if nmap not available
            if not hosts:
                logger.info("nmap not available, falling back to ARP scan")
                hosts = self._scan_with_arp()
            
            # Test each host for Sunshine service
            for host_ip in hosts:
                try:
                    if self._test_sunshine_connection(host_ip):
                        host_info = self._get_sunshine_info(host_ip)
                        if host_info:
                            discovered_hosts.append(host_info)
                            logger.info(f"Discovered Sunshine host: {host_ip} - {host_info.get('host_name', 'Unknown')}")
                except Exception as e:
                    logger.debug(f"Host {host_ip} is not a Sunshine server: {e}")
                    continue
            
            logger.info(f"Discovery complete. Found {len(discovered_hosts)} Sunshine hosts")
            
        except Exception as e:
            logger.error(f"Host discovery failed: {e}")
        
        return discovered_hosts
    
    def _get_local_network_range(self) -> str:
        """
        Get local network range from current IP
        
        Returns:
            Network range in CIDR notation (e.g., "192.168.1.0/24")
        """
        try:
            # Get local IP
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            
            # Convert to /24 network
            ip_parts = local_ip.split('.')
            network_range = f"{ip_parts[0]}.{ip_parts[1]}.{ip_parts[2]}.0/24"
            
            logger.info(f"Detected local network range: {network_range}")
            return network_range
            
        except Exception as e:
            logger.error(f"Failed to detect local network: {e}")
            return "192.168.1.0/24"  # Default fallback
    
    def _scan_with_nmap(self, network_range: str) -> List[str]:
        """
        Scan network using nmap for Sunshine ports
        
        Args:
            network_range: Network range in CIDR notation
            
        Returns:
            List of IP addresses with Sunshine ports open
        """
        try:
            # Scan for Sunshine's HTTP port (47990)
            cmd = [
                'nmap',
                '-p', str(self.SUNSHINE_DEFAULT_PORTS['http']),
                '--open',
                '-T4',
                '-oG', '-',
                network_range
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            # Parse nmap output
            hosts = []
            for line in result.stdout.split('\n'):
                if 'Host:' in line and 'Ports:' in line:
                    match = re.search(r'Host: (\d+\.\d+\.\d+\.\d+)', line)
                    if match:
                        hosts.append(match.group(1))
            
            logger.info(f"nmap found {len(hosts)} hosts with port {self.SUNSHINE_DEFAULT_PORTS['http']} open")
            return hosts
            
        except FileNotFoundError:
            logger.warning("nmap not installed, skipping nmap scan")
            return []
        except subprocess.TimeoutExpired:
            logger.error("nmap scan timed out")
            return []
        except Exception as e:
            logger.error(f"nmap scan failed: {e}")
            return []
    
    def _scan_with_arp(self) -> List[str]:
        """
        Scan network using ARP table
        
        Returns:
            List of IP addresses from ARP table
        """
        try:
            # Get ARP table
            result = subprocess.run(
                ['arp', '-a'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            # Parse ARP output
            hosts = []
            for line in result.stdout.split('\n'):
                match = re.search(r'(\d+\.\d+\.\d+\.\d+)', line)
                if match:
                    hosts.append(match.group(1))
            
            logger.info(f"ARP scan found {len(hosts)} hosts")
            return hosts
            
        except Exception as e:
            logger.error(f"ARP scan failed: {e}")
            return []
    
    def _test_sunshine_connection(self, host_ip: str, timeout: int = 2) -> bool:
        """
        Test if host is running Sunshine
        
        Args:
            host_ip: Host IP address
            timeout: Connection timeout in seconds
            
        Returns:
            True if Sunshine is accessible, False otherwise
        """
        try:
            url = self._get_sunshine_url(host_ip=host_ip)
            response = requests.get(
                f"{url}/api/ping",
                timeout=timeout,
                verify=False
            )
            return response.status_code == 200
        except:
            # Also try the web UI endpoint
            try:
                url = self._get_sunshine_url(host_ip=host_ip)
                response = requests.get(url, timeout=timeout, verify=False)
                # Check if response contains "Sunshine" in HTML
                return response.status_code == 200 and 'sunshine' in response.text.lower()
            except:
                return False
    
    def _get_sunshine_info(self, host_ip: str) -> Optional[Dict]:
        """
        Get Sunshine server information
        
        Args:
            host_ip: Host IP address
            
        Returns:
            Dictionary with host information or None
        """
        try:
            url = self._get_sunshine_url(host_ip=host_ip)
            
            # Try to get system info from API
            try:
                response = requests.get(
                    f"{url}/api/config",
                    timeout=5,
                    verify=False
                )
                
                if response.status_code == 200:
                    config_data = response.json()
                    
                    return {
                        'host_ip': host_ip,
                        'host_name': config_data.get('hostname', self._get_hostname(host_ip)),
                        'api_url': url,
                        'gpu_model': config_data.get('gpu', {}).get('name'),
                        'version': config_data.get('version'),
                        'last_online': datetime.utcnow().isoformat()
                    }
            except:
                pass
            
            # Fallback: basic info
            return {
                'host_ip': host_ip,
                'host_name': self._get_hostname(host_ip),
                'api_url': url,
                'last_online': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to get Sunshine info from {host_ip}: {e}")
            return None
    
    def _get_hostname(self, host_ip: str) -> str:
        """
        Get hostname from IP address
        
        Args:
            host_ip: IP address
            
        Returns:
            Hostname or IP if lookup fails
        """
        try:
            return socket.gethostbyaddr(host_ip)[0]
        except:
            return host_ip
    
    def add_host_manual(self, host_ip: str, host_name: Optional[str] = None, 
                       ssh_user: Optional[str] = None, ssh_port: Optional[int] = None,
                       ssh_key_path: Optional[str] = None, sunshine_api_key: Optional[str] = None) -> Dict:
        """
        Manually add a Sunshine host
        
        Args:
            host_ip: Host IP address
            host_name: Optional hostname
            ssh_user: SSH username (optional, defaults to Config.SSH_USER)
            ssh_port: SSH port (optional, defaults to 22)
            ssh_key_path: SSH key path (optional, defaults to Config.SSH_KEY_PATH)
            sunshine_api_key: Sunshine API key (optional, defaults to Config.SUNSHINE_API_KEY)
            
        Returns:
            Host information dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        # Test connection first
        if not self._test_sunshine_connection(host_ip):
            raise ValueError(f"Cannot connect to Sunshine at {host_ip}")
        
        # Get host info
        host_info = self._get_sunshine_info(host_ip)
        if not host_info:
            raise ValueError(f"Failed to get info from Sunshine host {host_ip}")
        
        # Override hostname if provided
        if host_name:
            host_info['host_name'] = host_name
        
        # Build host_metadata with SSH credentials
        host_metadata = {}
        if ssh_user:
            host_metadata['ssh_user'] = ssh_user
        if ssh_port:
            host_metadata['ssh_port'] = ssh_port
        if ssh_key_path:
            host_metadata['ssh_key_path'] = ssh_key_path
        if sunshine_api_key:
            host_metadata['sunshine_api_key'] = sunshine_api_key
        
        # Save to database
        with self.db_service.get_session() as session:
            # Check if already exists
            existing = session.query(SunshineHost).filter_by(host_ip=host_ip).first()
            
            if existing:
                # Update existing
                existing.host_name = host_info.get('host_name')
                existing.api_url = host_info.get('api_url')
                existing.last_online = datetime.utcnow()
                existing.gpu_model = host_info.get('gpu_model')
                existing.host_metadata = host_metadata if host_metadata else existing.host_metadata
                session.commit()
                host = existing
            else:
                # Create new
                host = SunshineHost(
                    id=uuid.uuid4(),
                    host_ip=host_ip,
                    host_name=host_info.get('host_name'),
                    api_url=host_info.get('api_url'),
                    gpu_model=host_info.get('gpu_model'),
                    host_metadata=host_metadata if host_metadata else None,
                    last_online=datetime.utcnow()
                )
                session.add(host)
                session.commit()
            
            return host.to_dict()
    
    def get_hosts(self) -> List[Dict]:
        """
        Get all configured Sunshine hosts
        
        Returns:
            List of host dictionaries
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            return []
        
        with self.db_service.get_session() as session:
            hosts = session.query(SunshineHost).all()
            return [host.to_dict() for host in hosts]
    
    def update_host(self, host_id: str, updates: Dict) -> Dict:
        """
        Update host configuration
        
        Args:
            host_id: Host UUID
            updates: Dictionary of fields to update
                Supported fields: host_name, host_ip, api_url,
                ssh_user, ssh_port, ssh_key_path, sunshine_api_key
            
        Returns:
            Updated host dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            # Update basic fields
            allowed_fields = ['host_name', 'host_ip', 'api_url']
            for field, value in updates.items():
                if field in allowed_fields:
                    setattr(host, field, value)
            
            # Update SSH credentials in host_metadata
            ssh_fields = ['ssh_user', 'ssh_port', 'ssh_key_path', 'sunshine_api_key']
            ssh_updates = {k: v for k, v in updates.items() if k in ssh_fields and v is not None}
            
            if ssh_updates:
                # Merge with existing metadata
                current_metadata = host.host_metadata or {}
                current_metadata.update(ssh_updates)
                host.host_metadata = current_metadata
            
            host.updated_at = datetime.utcnow()
            session.commit()
            
            return host.to_dict()
    
    def delete_host(self, host_id: str) -> bool:
        """
        Delete a Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            True if deleted successfully
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            session.delete(host)
            session.commit()
            
            return True
    
    def initiate_pairing(self, host_id: str, pin: str) -> Dict:
        """
        Initiate pairing with a Sunshine host using PIN
        
        Args:
            host_id: Host UUID
            pin: 4-digit PIN from Moonlight client
            
        Returns:
            Pairing result dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                # Call Sunshine pairing API
                url = f"{host.api_url}/api/pin"
                response = requests.post(
                    url,
                    json={'pin': pin},
                    timeout=10,
                    verify=False
                )
                
                if response.status_code == 200:
                    # Pairing successful
                    host.is_paired = True
                    host.pairing_pin = None
                    host.last_online = datetime.utcnow()
                    session.commit()
                    
                    return {
                        'success': True,
                        'message': 'Pairing successful',
                        'host': host.to_dict()
                    }
                else:
                    return {
                        'success': False,
                        'message': f'Pairing failed: {response.text}',
                        'error_code': response.status_code
                    }
                    
            except Exception as e:
                logger.error(f"Pairing failed for host {host_id}: {e}")
                return {
                    'success': False,
                    'message': f'Pairing error: {str(e)}'
                }
    
    def get_applications(self, host_id: str) -> List[Dict]:
        """
        Get list of available applications/games from Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            List of application dictionaries
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                # Get apps from Sunshine API
                url = f"{host.api_url}/api/apps"
                response = requests.get(url, timeout=10, verify=False)
                
                if response.status_code == 200:
                    apps_data = response.json()
                    
                    # Update host with applications
                    host.applications = apps_data
                    host.last_online = datetime.utcnow()
                    session.commit()
                    
                    return apps_data
                else:
                    logger.error(f"Failed to get apps from {host.host_ip}: {response.status_code}")
                    return host.applications or []
                    
            except Exception as e:
                logger.error(f"Failed to get applications from host {host_id}: {e}")
                # Return cached applications if available
                return host.applications or []
    
    def check_health(self, host_id: str) -> Dict:
        """
        Check health of Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            Health status dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            # Test connection
            is_online = self._test_sunshine_connection(host.host_ip)
            
            health = {
                'host_id': str(host.id),
                'host_ip': host.host_ip,
                'is_online': is_online,
                'is_paired': host.is_paired,
                'last_online': host.last_online.isoformat() if host.last_online else None,
                'checked_at': datetime.utcnow().isoformat()
            }
            
            if is_online:
                # Update last_online timestamp
                host.last_online = datetime.utcnow()
                session.commit()
                
                # Try to get GPU info
                try:
                    info = self._get_sunshine_info(host.host_ip)
                    if info and info.get('gpu_model'):
                        health['gpu_model'] = info['gpu_model']
                        host.gpu_model = info['gpu_model']
                        session.commit()
                except:
                    pass
            
            return health
    
    def run_diagnostics(self, host_id: str) -> Dict:
        """
        Run comprehensive diagnostics on Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            Diagnostics results dictionary
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            diagnostics = {
                'host_id': str(host.id),
                'host_ip': host.host_ip,
                'host_name': host.host_name,
                'timestamp': datetime.utcnow().isoformat(),
                'tests': {}
            }
            
            # Test 1: Ping test
            diagnostics['tests']['ping'] = self._test_ping(host.host_ip)
            
            # Test 2: Port connectivity tests
            diagnostics['tests']['ports'] = self._test_ports(host.host_ip)
            
            # Test 3: Sunshine API test
            diagnostics['tests']['api'] = self._test_sunshine_api(host.host_ip)
            
            # Test 4: Network latency
            diagnostics['tests']['latency'] = self._test_latency(host.host_ip)
            
            # Overall status
            all_passed = all(
                test.get('success', False) 
                for test in diagnostics['tests'].values()
            )
            diagnostics['overall_status'] = 'healthy' if all_passed else 'issues_detected'
            
            return diagnostics
    
    def _test_ping(self, host_ip: str) -> Dict:
        """Test basic ping connectivity"""
        try:
            result = subprocess.run(
                ['ping', '-c', '3', '-W', '2', host_ip],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            success = result.returncode == 0
            
            # Parse average latency from ping output
            latency = None
            if success:
                match = re.search(r'avg = ([\d.]+)', result.stdout)
                if match:
                    latency = float(match.group(1))
            
            return {
                'success': success,
                'latency_ms': latency,
                'message': 'Ping successful' if success else 'Ping failed'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'Ping test failed'
            }
    
    def _test_ports(self, host_ip: str) -> Dict:
        """Test Sunshine port connectivity"""
        results = {}
        
        for port_name, port_num in self.SUNSHINE_DEFAULT_PORTS.items():
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                result = sock.connect_ex((host_ip, port_num))
                sock.close()
                
                results[port_name] = {
                    'port': port_num,
                    'open': result == 0,
                    'success': result == 0
                }
            except Exception as e:
                results[port_name] = {
                    'port': port_num,
                    'open': False,
                    'success': False,
                    'error': str(e)
                }
        
        all_success = all(r.get('success', False) for r in results.values())
        
        return {
            'success': all_success,
            'ports': results,
            'message': 'All ports accessible' if all_success else 'Some ports blocked'
        }
    
    def _test_sunshine_api(self, host_ip: str) -> Dict:
        """Test Sunshine API availability"""
        try:
            url = self._get_sunshine_url(host_ip=host_ip)
            response = requests.get(f"{url}/api/config", timeout=5, verify=False)
            
            success = response.status_code == 200
            
            return {
                'success': success,
                'status_code': response.status_code,
                'message': 'API accessible' if success else f'API returned {response.status_code}'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'API not accessible'
            }
    
    def _test_latency(self, host_ip: str) -> Dict:
        """Test network latency with multiple samples"""
        try:
            latencies = []
            url = self._get_sunshine_url(host_ip=host_ip)
            
            for _ in range(5):
                start = datetime.utcnow()
                try:
                    requests.get(f"{url}/api/ping", timeout=2, verify=False)
                    latency = (datetime.utcnow() - start).total_seconds() * 1000
                    latencies.append(latency)
                except:
                    pass
            
            if latencies:
                avg_latency = sum(latencies) / len(latencies)
                max_latency = max(latencies)
                min_latency = min(latencies)
                
                # Determine quality
                if avg_latency < 10:
                    quality = 'excellent'
                elif avg_latency < 30:
                    quality = 'good'
                elif avg_latency < 100:
                    quality = 'fair'
                else:
                    quality = 'poor'
                
                return {
                    'success': True,
                    'avg_ms': round(avg_latency, 2),
                    'min_ms': round(min_latency, 2),
                    'max_ms': round(max_latency, 2),
                    'quality': quality,
                    'message': f'Average latency: {avg_latency:.1f}ms ({quality})'
                }
            else:
                return {
                    'success': False,
                    'message': 'Could not measure latency'
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'message': 'Latency test failed'
            }
    
    def get_sessions(self, status: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """
        Get game streaming sessions
        
        Args:
            status: Filter by status ('active', 'disconnected', etc.)
            limit: Maximum number of sessions to return
            
        Returns:
            List of session dictionaries
        """
        from models.gaming import GameSession
        
        if not self.db_service or not self.db_service.is_available:
            return []
        
        with self.db_service.get_session() as session:
            query = session.query(GameSession)
            
            if status:
                query = query.filter_by(status=status)
            
            sessions = query.order_by(GameSession.started_at.desc()).limit(limit).all()
            return [s.to_dict() for s in sessions]
    
    def create_session(self, session_data: Dict) -> Dict:
        """
        Create a new game streaming session
        
        Args:
            session_data: Session information dictionary
            
        Returns:
            Created session dictionary
        """
        from models.gaming import GameSession
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            game_session = GameSession(
                id=uuid.uuid4(),
                session_type=session_data.get('session_type', 'moonlight'),
                user_id=session_data.get('user_id'),
                host_ip=session_data.get('host_ip'),
                host_name=session_data.get('host_name'),
                status='active',
                client_device=session_data.get('client_device'),
                resolution=session_data.get('resolution'),
                fps=session_data.get('fps'),
                bitrate_mbps=session_data.get('bitrate_mbps'),
                game_name=session_data.get('game_name'),
                metadata=session_data.get('metadata', {})
            )
            
            session.add(game_session)
            session.commit()
            
            return game_session.to_dict()
    
    def update_session(self, session_id: str, updates: Dict) -> Dict:
        """
        Update game streaming session
        
        Args:
            session_id: Session UUID
            updates: Dictionary of fields to update
            
        Returns:
            Updated session dictionary
        """
        from models.gaming import GameSession
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as db_session:
            game_session = db_session.query(GameSession).filter_by(id=session_id).first()
            
            if not game_session:
                raise ValueError(f"Session {session_id} not found")
            
            # Update allowed fields
            allowed_fields = ['status', 'latency_ms', 'fps', 'bitrate_mbps', 'resolution', 'game_name']
            for field, value in updates.items():
                if field in allowed_fields:
                    setattr(game_session, field, value)
            
            # Set ended_at if status is disconnected
            if updates.get('status') in ['disconnected', 'error']:
                game_session.ended_at = datetime.utcnow()
            
            db_session.commit()
            
            return game_session.to_dict()
    
    def _get_ssh_connection(self, host_id: str) -> Tuple[str, 'SSHService']:
        """
        Get SSH connection for a Sunshine host
        
        Uses per-host SSH credentials from host_metadata if available,
        falls back to Config defaults otherwise.
        
        Args:
            host_id: Host UUID
            
        Returns:
            Tuple of (host_ip, SSHService instance)
            
        Raises:
            ValueError: If host not found
            RuntimeError: If SSH connection fails
        """
        from models.gaming import SunshineHost
        from services.ssh_service import SSHService
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        # Get host from database
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            host_ip = host.host_ip
            host_metadata = host.host_metadata or {}
        
        # Use host-specific SSH credentials from host_metadata if available,
        # otherwise fall back to Config defaults
        ssh_host = host_ip
        ssh_port = host_metadata.get('ssh_port') or Config.SSH_PORT
        ssh_user = host_metadata.get('ssh_user') or Config.SSH_USER
        ssh_key_path = host_metadata.get('ssh_key_path') or Config.SSH_KEY_PATH
        
        # Validate key path exists if provided
        if ssh_key_path and not os.path.exists(ssh_key_path):
            logger.warning(f"SSH key path does not exist: {ssh_key_path}, attempting connection without key")
            ssh_key_path = None
        
        logger.debug(f"Connecting to {host_ip} via SSH - port: {ssh_port}, user: {ssh_user}, key: {ssh_key_path or 'password'}")
        
        ssh_service = SSHService(
            host=ssh_host,
            port=ssh_port,
            username=ssh_user,
            key_path=ssh_key_path
        )
        
        # Test connection
        if not ssh_service.connect():
            raise RuntimeError(f"Failed to connect to host {host_ip} via SSH")
        
        return host_ip, ssh_service
    
    def check_system_requirements_remote(self, host_id: str) -> Dict:
        """
        Check system requirements on remote Sunshine host via SSH
        Runs verify-nvenc.sh script if available, otherwise uses nvidia-smi
        
        Args:
            host_id: Host UUID
            
        Returns:
            Dictionary with system check results:
            {
                'success': bool,
                'host_id': str,
                'host_ip': str,
                'checks': {
                    'gpu': bool,
                    'gpu_model': str,
                    'driver': bool,
                    'driver_version': str,
                    'nvenc': bool,
                    'nvenc_sessions': int,
                    'vram_total': int,
                    'vram_used': int
                },
                'error': str (if failed),
                'error_details': str (if failed)
            }
        """
        try:
            host_ip, ssh = self._get_ssh_connection(host_id)
            
            checks = {
                'gpu': False,
                'gpu_model': None,
                'driver': False,
                'driver_version': None,
                'nvenc': False,
                'nvenc_sessions': 0,
                'vram_total': None,
                'vram_used': None
            }
            
            # Try running verify-nvenc.sh if it exists
            success, output, error = ssh.execute_command('bash ~/verify-nvenc.sh 2>&1')
            
            if not success:
                # Fallback to nvidia-smi if verify-nvenc.sh not found
                logger.info(f"verify-nvenc.sh not found on {host_ip}, using nvidia-smi fallback")
                success, output, error = ssh.execute_command(
                    'nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used --format=csv,noheader'
                )
                
                if not success:
                    ssh.disconnect()
                    
                    if 'nvidia-smi: command not found' in error or 'not found' in error:
                        return {
                            'success': False,
                            'host_id': host_id,
                            'host_ip': host_ip,
                            'error': 'NVIDIA drivers not installed',
                            'error_details': 'nvidia-smi command not found on remote host. Please install NVIDIA drivers.',
                            'checks': checks
                        }
                    elif 'No devices found' in error or 'no NVIDIA' in error.lower():
                        return {
                            'success': False,
                            'host_id': host_id,
                            'host_ip': host_ip,
                            'error': 'No NVIDIA GPU found',
                            'error_details': 'No NVIDIA GPU detected on remote host.',
                            'checks': checks
                        }
                    else:
                        return {
                            'success': False,
                            'host_id': host_id,
                            'host_ip': host_ip,
                            'error': 'GPU check failed',
                            'error_details': error,
                            'checks': checks
                        }
                
                # Parse nvidia-smi output
                if output:
                    parts = output.strip().split(',')
                    if len(parts) >= 4:
                        checks['gpu'] = True
                        checks['gpu_model'] = parts[0].strip()
                        checks['driver'] = True
                        checks['driver_version'] = parts[1].strip()
                        checks['vram_total'] = int(parts[2].strip().split()[0])  # Remove 'MiB'
                        checks['vram_used'] = int(parts[3].strip().split()[0])
                        
                        # Check if GPU supports NVENC
                        gpu_name = checks['gpu_model'].upper()
                        if any(x in gpu_name for x in ['RTX', 'GTX', 'QUADRO', 'TESLA']):
                            checks['nvenc'] = True
                
                # Get encoder stats if available
                success2, encoder_output, _ = ssh.execute_command(
                    'nvidia-smi --query-gpu=encoder.stats.sessionCount --format=csv,noheader 2>&1'
                )
                if success2 and encoder_output.strip().isdigit():
                    checks['nvenc_sessions'] = int(encoder_output.strip())
            
            else:
                # Parse verify-nvenc.sh output
                logger.info(f"Successfully ran verify-nvenc.sh on {host_ip}")
                
                # Extract GPU info from script output
                if '✓ PASSED' in output and 'GPU' in output:
                    checks['gpu'] = True
                    
                    # Extract GPU model
                    gpu_match = re.search(r'GPU:\s*(.+)', output)
                    if gpu_match:
                        checks['gpu_model'] = gpu_match.group(1).strip()
                    
                    # Extract driver version
                    driver_match = re.search(r'Driver:\s*(.+)|Driver version\s*(.+)', output)
                    if driver_match:
                        checks['driver'] = True
                        checks['driver_version'] = (driver_match.group(1) or driver_match.group(2)).strip()
                    
                    # Extract VRAM info
                    vram_total_match = re.search(r'VRAM Total:\s*(\d+)', output)
                    vram_used_match = re.search(r'VRAM Used:\s*(\d+)', output)
                    if vram_total_match:
                        checks['vram_total'] = int(vram_total_match.group(1))
                    if vram_used_match:
                        checks['vram_used'] = int(vram_used_match.group(1))
                    
                    # Check NVENC support
                    if 'NVENC' in output and '✓' in output:
                        checks['nvenc'] = True
                    
                    # Extract encoder sessions
                    enc_sessions_match = re.search(r'Active encoding sessions:\s*(\d+)', output)
                    if enc_sessions_match:
                        checks['nvenc_sessions'] = int(enc_sessions_match.group(1))
                
                # Check for failures
                if '✗ FAILED' in output:
                    error_msg = "System check failed"
                    if 'No NVIDIA GPU found' in output:
                        error_msg = "No NVIDIA GPU found"
                    elif 'nvidia-smi not found' in output:
                        error_msg = "NVIDIA drivers not installed"
                    elif 'NVENC' in output and 'FAILED' in output:
                        error_msg = "NVENC not supported"
                    
                    ssh.disconnect()
                    return {
                        'success': False,
                        'host_id': host_id,
                        'host_ip': host_ip,
                        'error': error_msg,
                        'error_details': output,
                        'checks': checks
                    }
            
            ssh.disconnect()
            
            # Determine overall success
            success = checks['gpu'] and checks['driver']
            
            return {
                'success': success,
                'host_id': host_id,
                'host_ip': host_ip,
                'checks': checks
            }
            
        except ValueError as e:
            logger.error(f"Host validation error: {e}")
            return {
                'success': False,
                'host_id': host_id,
                'error': 'Host not found',
                'error_details': str(e)
            }
        except RuntimeError as e:
            logger.error(f"SSH connection error: {e}")
            return {
                'success': False,
                'host_id': host_id,
                'error': 'Host unreachable',
                'error_details': f'Cannot connect to host via SSH: {str(e)}'
            }
        except Exception as e:
            logger.error(f"System check failed: {e}", exc_info=True)
            return {
                'success': False,
                'host_id': host_id,
                'error': 'System check failed',
                'error_details': str(e)
            }
    
    def get_performance_metrics_remote(self, host_id: str) -> Dict:
        """
        Get real-time performance metrics from remote Sunshine host via SSH
        
        Queries GPU metrics via nvidia-smi, then tries Sunshine API for session data,
        falling back to GameSession database if API unavailable.
        Supports partial success (GPU metrics work even if session data fails).
        
        Args:
            host_id: Host UUID
            
        Returns:
            Dictionary with performance metrics:
            {
                'success': bool,
                'host_id': str,
                'host_ip': str,
                'metrics': {
                    'active_sessions': int,
                    'gpu_utilization': int,
                    'encoder_utilization': int,
                    'vram': {'used': int, 'total': int},
                    'gpu_temperature': int,
                    'encoder_stats': {
                        'session_count': int,
                        'avg_fps': float,
                        'bitrate': float
                    },
                    'network_latency': float,
                    'streaming_quality': {'resolution': str, 'fps': int}
                },
                'partial': bool (True if some metrics failed),
                'warnings': list (non-critical errors),
                'error': str (if completely failed)
            }
        """
        from models.gaming import SunshineHost
        
        warnings = []
        gpu_metrics_available = False
        session_metrics_available = False
        
        try:
            host_ip, ssh = self._get_ssh_connection(host_id)
            
            # Get host info for API URL
            with self.db_service.get_session() as session:
                host = session.query(SunshineHost).filter_by(id=host_id).first()
                api_url = host.api_url if host else None
            
            metrics = {
                'active_sessions': 0,
                'gpu_utilization': 0,
                'encoder_utilization': 0,
                'vram': None,
                'gpu_temperature': None,
                'encoder_stats': {
                    'session_count': 0,
                    'avg_fps': None,
                    'bitrate': None
                },
                'network_latency': None,
                'streaming_quality': None
            }
            
            # === PART 1: Get GPU metrics using nvidia-smi ===
            try:
                success, output, error = ssh.execute_command(
                    'nvidia-smi --query-gpu=utilization.gpu,utilization.encoder,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits'
                )
                
                if success and output:
                    parts = output.strip().split(',')
                    if len(parts) >= 5:
                        metrics['gpu_utilization'] = int(parts[0].strip())
                        metrics['encoder_utilization'] = int(parts[1].strip())
                        metrics['vram'] = {
                            'used': int(parts[2].strip()),
                            'total': int(parts[3].strip())
                        }
                        metrics['gpu_temperature'] = int(parts[4].strip())
                        gpu_metrics_available = True
                else:
                    warnings.append('GPU metrics unavailable: nvidia-smi query failed')
                
                # Get encoder session count from nvidia-smi
                success2, encoder_output, _ = ssh.execute_command(
                    'nvidia-smi --query-gpu=encoder.stats.sessionCount,encoder.stats.averageFps --format=csv,noheader 2>&1'
                )
                
                if success2 and encoder_output:
                    enc_parts = encoder_output.strip().split(',')
                    if len(enc_parts) >= 1 and enc_parts[0].strip().isdigit():
                        metrics['encoder_stats']['session_count'] = int(enc_parts[0].strip())
                        metrics['active_sessions'] = metrics['encoder_stats']['session_count']
                    
                    if len(enc_parts) >= 2 and enc_parts[1].strip():
                        try:
                            metrics['encoder_stats']['avg_fps'] = float(enc_parts[1].strip())
                        except ValueError:
                            pass
                            
            except Exception as e:
                logger.warning(f"GPU metrics query failed: {e}")
                warnings.append(f'GPU metrics unavailable: {str(e)}')
            
            ssh.disconnect()
            
            # === PART 2: Try Sunshine API for session metrics ===
            sunshine_api_success = False
            if api_url:
                try:
                    logger.debug(f"Querying Sunshine API at {api_url}")
                    
                    # Get host-specific API key
                    api_key = self._get_sunshine_api_key(host_id)
                    
                    # Build headers with API key if available
                    headers = {}
                    if api_key:
                        headers['Authorization'] = f'Bearer {api_key}'
                    
                    # Try to get stats from Sunshine API
                    response = requests.get(
                        f"{api_url}/api/stats",
                        headers=headers,
                        timeout=5,
                        verify=False
                    )
                    
                    if response.status_code == 200:
                        stats_data = response.json()
                        
                        # Extract session metrics from API response
                        if 'sessions' in stats_data:
                            sessions_list = stats_data['sessions']
                            metrics['active_sessions'] = len(sessions_list)
                            
                            # Calculate average latency from active sessions
                            latencies = [s.get('latency_ms', 0) for s in sessions_list if s.get('latency_ms')]
                            if latencies:
                                metrics['network_latency'] = round(sum(latencies) / len(latencies), 1)
                            
                            # Get streaming quality from first active session
                            if sessions_list and sessions_list[0]:
                                first_session = sessions_list[0]
                                if first_session.get('resolution') or first_session.get('fps'):
                                    metrics['streaming_quality'] = {
                                        'resolution': first_session.get('resolution', 'Unknown'),
                                        'fps': first_session.get('fps')
                                    }
                                if first_session.get('bitrate_mbps'):
                                    metrics['encoder_stats']['bitrate'] = first_session['bitrate_mbps']
                            
                            sunshine_api_success = True
                            session_metrics_available = True
                            logger.debug("Successfully retrieved session metrics from Sunshine API")
                    else:
                        logger.debug(f"Sunshine API returned status {response.status_code}")
                        
                except requests.exceptions.ConnectionError:
                    logger.debug("Sunshine API not reachable, will try database fallback")
                    warnings.append('Sunshine API unavailable: Connection failed')
                except requests.exceptions.Timeout:
                    logger.debug("Sunshine API timeout, will try database fallback")
                    warnings.append('Sunshine API unavailable: Timeout')
                except Exception as e:
                    logger.debug(f"Sunshine API query failed: {e}")
                    warnings.append(f'Sunshine API unavailable: {str(e)}')
            
            # === PART 3: Fallback to GameSession database if API failed ===
            if not sunshine_api_success:
                try:
                    logger.debug("Falling back to GameSession database for session metrics")
                    
                    active_sessions = self.get_sessions(status='active', limit=100)
                    
                    # Filter sessions for this specific host
                    host_sessions = [s for s in active_sessions if s.get('host_ip') == host_ip]
                    
                    if host_sessions:
                        # Update active sessions count if we have database records
                        if not metrics['active_sessions']:
                            metrics['active_sessions'] = len(host_sessions)
                        
                        # Calculate average latency from sessions
                        latency_values = [s.get('latency_ms', 0) for s in host_sessions if s.get('latency_ms')]
                        if latency_values:
                            metrics['network_latency'] = round(sum(latency_values) / len(latency_values), 1)
                        
                        # Get streaming quality from most recent session
                        if host_sessions[0].get('resolution'):
                            resolution = host_sessions[0]['resolution']
                            metrics['streaming_quality'] = {
                                'resolution': resolution,
                                'fps': host_sessions[0].get('fps')
                            }
                        
                        # Get bitrate
                        if host_sessions[0].get('bitrate_mbps'):
                            metrics['encoder_stats']['bitrate'] = host_sessions[0]['bitrate_mbps']
                        
                        session_metrics_available = True
                        logger.debug(f"Retrieved session metrics from database: {len(host_sessions)} sessions")
                    else:
                        logger.debug("No active sessions found in database")
                        warnings.append('Session metrics unavailable: No active sessions')
                        
                except Exception as e:
                    logger.warning(f"Database session query failed: {e}")
                    warnings.append(f'Session metrics unavailable: {str(e)}')
            
            # Determine overall success
            partial = bool(warnings)
            success = gpu_metrics_available or session_metrics_available
            
            result = {
                'success': success,
                'host_id': host_id,
                'host_ip': host_ip,
                'metrics': metrics
            }
            
            if partial:
                result['partial'] = True
                result['warnings'] = warnings
            
            return result
            
        except ValueError as e:
            logger.error(f"Host validation error: {e}")
            return {
                'success': False,
                'host_id': host_id,
                'error': 'Host not found',
                'error_details': str(e)
            }
        except RuntimeError as e:
            logger.error(f"SSH connection error: {e}")
            return {
                'success': False,
                'host_id': host_id,
                'error': 'Host unreachable',
                'error_details': f'Cannot connect to host via SSH: {str(e)}'
            }
        except Exception as e:
            logger.error(f"Failed to get performance metrics: {e}", exc_info=True)
            return {
                'success': False,
                'host_id': host_id,
                'error': 'Metrics unavailable',
                'error_details': str(e)
            }
    
    def get_sunshine_apps(self, host_id: str) -> Dict:
        """
        Get all apps configured on Sunshine host via API
        
        Args:
            host_id: Host UUID
            
        Returns:
            Dictionary with apps list and metadata
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                url = f"{host.api_url}/api/apps"
                api_key = self._get_sunshine_api_key(host_id)
                
                headers = {}
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
                
                response = requests.get(
                    url,
                    headers=headers,
                    timeout=10,
                    verify=False
                )
                
                if response.status_code == 200:
                    apps_data = response.json()
                    
                    # Update host cache
                    host.applications = apps_data
                    host.last_online = datetime.utcnow()
                    session.commit()
                    
                    return {
                        'success': True,
                        'apps': apps_data if isinstance(apps_data, list) else apps_data.get('apps', []),
                        'count': len(apps_data) if isinstance(apps_data, list) else len(apps_data.get('apps', []))
                    }
                elif response.status_code == 401 or response.status_code == 403:
                    return {
                        'success': False,
                        'error': 'Authentication failed',
                        'error_details': 'Invalid or missing API key'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to retrieve apps',
                        'error_details': response.text
                    }
                    
            except requests.exceptions.ConnectionError:
                return {
                    'success': False,
                    'error': 'Connection failed',
                    'error_details': 'Cannot connect to Sunshine host'
                }
            except requests.exceptions.Timeout:
                return {
                    'success': False,
                    'error': 'Request timeout',
                    'error_details': 'Sunshine host did not respond in time'
                }
            except Exception as e:
                logger.error(f"Failed to get apps from host {host_id}: {e}")
                return {
                    'success': False,
                    'error': 'Unexpected error',
                    'error_details': str(e)
                }
    
    def add_sunshine_app(self, host_id: str, app_config: Dict) -> Dict:
        """
        Add new app to Sunshine host via API
        
        Args:
            host_id: Host UUID
            app_config: App configuration dictionary with fields:
                - name: App name (required)
                - cmd: Command/executable path (required)
                - image_path: Icon path (optional)
                - working_dir: Working directory (optional)
                - prep_cmd: Prep commands (optional)
                - detached: Detached commands (optional)
            
        Returns:
            Result dictionary with success status
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        # Validate required fields
        if not app_config.get('name'):
            raise ValueError("App name is required")
        if not app_config.get('cmd'):
            raise ValueError("Executable command is required")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                url = f"{host.api_url}/api/apps"
                api_key = self._get_sunshine_api_key(host_id)
                
                headers = {'Content-Type': 'application/json'}
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
                
                response = requests.post(
                    url,
                    json=app_config,
                    headers=headers,
                    timeout=10,
                    verify=False
                )
                
                if response.status_code in [200, 201]:
                    # Refresh apps cache
                    self.get_sunshine_apps(host_id)
                    
                    return {
                        'success': True,
                        'message': f"App '{app_config['name']}' added successfully",
                        'app': response.json() if response.text else app_config
                    }
                elif response.status_code == 401 or response.status_code == 403:
                    return {
                        'success': False,
                        'error': 'Authentication failed',
                        'error_details': 'Invalid or missing API key'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to add app',
                        'error_details': response.text
                    }
                    
            except requests.exceptions.ConnectionError:
                return {
                    'success': False,
                    'error': 'Connection failed',
                    'error_details': 'Cannot connect to Sunshine host'
                }
            except Exception as e:
                logger.error(f"Failed to add app to host {host_id}: {e}")
                return {
                    'success': False,
                    'error': 'Unexpected error',
                    'error_details': str(e)
                }
    
    def update_sunshine_app(self, host_id: str, app_index: int, app_config: Dict) -> Dict:
        """
        Update existing app on Sunshine host via API
        
        Args:
            host_id: Host UUID
            app_index: App index in Sunshine's app list
            app_config: Updated app configuration
            
        Returns:
            Result dictionary with success status
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                url = f"{host.api_url}/api/apps/{app_index}"
                api_key = self._get_sunshine_api_key(host_id)
                
                headers = {'Content-Type': 'application/json'}
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
                
                response = requests.put(
                    url,
                    json=app_config,
                    headers=headers,
                    timeout=10,
                    verify=False
                )
                
                if response.status_code == 200:
                    # Refresh apps cache
                    self.get_sunshine_apps(host_id)
                    
                    return {
                        'success': True,
                        'message': f"App updated successfully",
                        'app': response.json() if response.text else app_config
                    }
                elif response.status_code == 404:
                    return {
                        'success': False,
                        'error': 'App not found',
                        'error_details': f'No app found at index {app_index}'
                    }
                elif response.status_code == 401 or response.status_code == 403:
                    return {
                        'success': False,
                        'error': 'Authentication failed',
                        'error_details': 'Invalid or missing API key'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to update app',
                        'error_details': response.text
                    }
                    
            except requests.exceptions.ConnectionError:
                return {
                    'success': False,
                    'error': 'Connection failed',
                    'error_details': 'Cannot connect to Sunshine host'
                }
            except Exception as e:
                logger.error(f"Failed to update app on host {host_id}: {e}")
                return {
                    'success': False,
                    'error': 'Unexpected error',
                    'error_details': str(e)
                }
    
    def delete_sunshine_app(self, host_id: str, app_index: int) -> Dict:
        """
        Delete app from Sunshine host via API
        
        Args:
            host_id: Host UUID
            app_index: App index in Sunshine's app list
            
        Returns:
            Result dictionary with success status
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                url = f"{host.api_url}/api/apps/{app_index}"
                api_key = self._get_sunshine_api_key(host_id)
                
                headers = {}
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
                
                response = requests.delete(
                    url,
                    headers=headers,
                    timeout=10,
                    verify=False
                )
                
                if response.status_code in [200, 204]:
                    # Refresh apps cache
                    self.get_sunshine_apps(host_id)
                    
                    return {
                        'success': True,
                        'message': 'App deleted successfully'
                    }
                elif response.status_code == 404:
                    return {
                        'success': False,
                        'error': 'App not found',
                        'error_details': f'No app found at index {app_index}'
                    }
                elif response.status_code == 401 or response.status_code == 403:
                    return {
                        'success': False,
                        'error': 'Authentication failed',
                        'error_details': 'Invalid or missing API key'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to delete app',
                        'error_details': response.text
                    }
                    
            except requests.exceptions.ConnectionError:
                return {
                    'success': False,
                    'error': 'Connection failed',
                    'error_details': 'Cannot connect to Sunshine host'
                }
            except Exception as e:
                logger.error(f"Failed to delete app from host {host_id}: {e}")
                return {
                    'success': False,
                    'error': 'Unexpected error',
                    'error_details': str(e)
                }
    
    def start_sunshine_app(self, host_id: str, app_index: int) -> Dict:
        """
        Start streaming session for specific app remotely
        
        Args:
            host_id: Host UUID
            app_index: App index to launch
            
        Returns:
            Result dictionary with success status
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                url = f"{host.api_url}/api/apps/{app_index}/start"
                api_key = self._get_sunshine_api_key(host_id)
                
                headers = {}
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
                
                response = requests.post(
                    url,
                    headers=headers,
                    timeout=10,
                    verify=False
                )
                
                if response.status_code == 200:
                    return {
                        'success': True,
                        'message': 'App launched successfully',
                        'session': response.json() if response.text else {}
                    }
                elif response.status_code == 404:
                    return {
                        'success': False,
                        'error': 'App not found',
                        'error_details': f'No app found at index {app_index}'
                    }
                elif response.status_code == 401 or response.status_code == 403:
                    return {
                        'success': False,
                        'error': 'Authentication failed',
                        'error_details': 'Invalid or missing API key'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to start app',
                        'error_details': response.text
                    }
                    
            except requests.exceptions.ConnectionError:
                return {
                    'success': False,
                    'error': 'Connection failed',
                    'error_details': 'Cannot connect to Sunshine host'
                }
            except Exception as e:
                logger.error(f"Failed to start app on host {host_id}: {e}")
                return {
                    'success': False,
                    'error': 'Unexpected error',
                    'error_details': str(e)
                }
    
    def stop_sunshine_app(self, host_id: str) -> Dict:
        """
        Stop current streaming session on Sunshine host
        
        Args:
            host_id: Host UUID
            
        Returns:
            Result dictionary with success status
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                url = f"{host.api_url}/api/apps/close"
                api_key = self._get_sunshine_api_key(host_id)
                
                headers = {}
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
                
                response = requests.post(
                    url,
                    headers=headers,
                    timeout=10,
                    verify=False
                )
                
                if response.status_code == 200:
                    return {
                        'success': True,
                        'message': 'Streaming session stopped successfully'
                    }
                elif response.status_code == 401 or response.status_code == 403:
                    return {
                        'success': False,
                        'error': 'Authentication failed',
                        'error_details': 'Invalid or missing API key'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to stop streaming',
                        'error_details': response.text
                    }
                    
            except requests.exceptions.ConnectionError:
                return {
                    'success': False,
                    'error': 'Connection failed',
                    'error_details': 'Cannot connect to Sunshine host'
                }
            except Exception as e:
                logger.error(f"Failed to stop streaming on host {host_id}: {e}")
                return {
                    'success': False,
                    'error': 'Unexpected error',
                    'error_details': str(e)
                }
    
    def get_sunshine_config(self, host_id: str) -> Dict:
        """
        Get Sunshine configuration and active session info
        
        Args:
            host_id: Host UUID
            
        Returns:
            Configuration dictionary with active sessions
        """
        from models.gaming import SunshineHost
        
        if not self.db_service or not self.db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with self.db_service.get_session() as session:
            host = session.query(SunshineHost).filter_by(id=host_id).first()
            
            if not host:
                raise ValueError(f"Host {host_id} not found")
            
            try:
                url = f"{host.api_url}/api/config"
                api_key = self._get_sunshine_api_key(host_id)
                
                headers = {}
                if api_key:
                    headers['Authorization'] = f'Bearer {api_key}'
                
                response = requests.get(
                    url,
                    headers=headers,
                    timeout=10,
                    verify=False
                )
                
                if response.status_code == 200:
                    config_data = response.json()
                    
                    return {
                        'success': True,
                        'config': config_data,
                        'active_sessions': config_data.get('clients', [])
                    }
                elif response.status_code == 401 or response.status_code == 403:
                    return {
                        'success': False,
                        'error': 'Authentication failed',
                        'error_details': 'Invalid or missing API key'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Failed to get configuration',
                        'error_details': response.text
                    }
                    
            except requests.exceptions.ConnectionError:
                return {
                    'success': False,
                    'error': 'Connection failed',
                    'error_details': 'Cannot connect to Sunshine host'
                }
            except Exception as e:
                logger.error(f"Failed to get config from host {host_id}: {e}")
                return {
                    'success': False,
                    'error': 'Unexpected error',
                    'error_details': str(e)
                }
    
    def get_active_streaming_sessions(self, host_id: str) -> Dict:
        """
        Get currently active streaming sessions for a host
        
        Args:
            host_id: Host UUID
            
        Returns:
            Dictionary with active sessions list
        """
        # Try to get from Sunshine API first
        config_result = self.get_sunshine_config(host_id)
        
        if config_result.get('success'):
            sessions = config_result.get('active_sessions', [])
            return {
                'success': True,
                'sessions': sessions,
                'count': len(sessions),
                'source': 'sunshine_api'
            }
        
        # Fallback to database
        try:
            from models.gaming import GameSession, SunshineHost
            
            if not self.db_service or not self.db_service.is_available:
                return {
                    'success': False,
                    'error': 'Database unavailable',
                    'sessions': []
                }
            
            with self.db_service.get_session() as session:
                host = session.query(SunshineHost).filter_by(id=host_id).first()
                
                if not host:
                    raise ValueError(f"Host {host_id} not found")
                
                # Query active sessions from database
                active_sessions = session.query(GameSession).filter(
                    GameSession.host_ip == host.host_ip,
                    GameSession.status == 'active'
                ).all()
                
                return {
                    'success': True,
                    'sessions': [s.to_dict() for s in active_sessions],
                    'count': len(active_sessions),
                    'source': 'database'
                }
                
        except Exception as e:
            logger.error(f"Failed to get active sessions for host {host_id}: {e}")
            return {
                'success': False,
                'error': str(e),
                'sessions': []
            }


# Global service instance (will be initialized with db_service in __init__.py or when imported)
try:
    from services.db_service import db_service
    game_streaming_service = GameStreamingService(db_service=db_service)
except ImportError:
    # Fallback for module initialization
    game_streaming_service = GameStreamingService(db_service=None)
