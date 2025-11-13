import os
import secrets

class Config:
    """Configuration for Homelab Dashboard"""
    
    # Flask settings
    SECRET_KEY = os.environ.get('SESSION_SECRET') or secrets.token_urlsafe(32)
    
    # Docker settings
    DOCKER_HOST = os.environ.get('DOCKER_HOST', 'unix:///var/run/docker.sock')
    
    # SSH settings for remote execution
    SSH_HOST = os.environ.get('SSH_HOST', 'localhost')
    SSH_PORT = int(os.environ.get('SSH_PORT', '22'))
    SSH_USER = os.environ.get('SSH_USER', 'root')
    SSH_KEY_PATH = os.environ.get('SSH_KEY_PATH', '/root/.ssh/id_rsa')
    
    # Service paths
    STATIC_SITE_PATH = os.environ.get('STATIC_SITE_PATH', '/var/www/scarletredjoker')
    
    # URLs
    NOVNC_URL = os.environ.get('NOVNC_URL', 'https://vnc.evindrake.net')
    WINDOWS_KVM_IP = os.environ.get('WINDOWS_KVM_IP', '')
    
    # Services configuration (used for dashboard UI)
    SERVICES = {
        'discord-bot': {
            'name': 'Discord Ticket Bot',
            'url': 'https://bot.rig-city.com',
            'container': 'discord-bot',
            'description': 'Discord ticket system with web dashboard'
        },
        'stream-bot': {
            'name': 'Stream Bot',
            'url': 'https://stream.rig-city.com',
            'container': 'stream-bot',
            'description': 'AI-powered Snapple facts for Twitch and Kick'
        },
        'n8n': {
            'name': 'n8n Automation',
            'url': 'https://n8n.evindrake.net',
            'container': 'n8n',
            'description': 'Workflow automation platform'
        },
        'plex': {
            'name': 'Plex Media Server',
            'url': 'https://plex.evindrake.net',
            'container': 'plex-server',
            'description': 'Media streaming server'
        },
        'static-site': {
            'name': 'ScarletRedJoker',
            'url': 'https://scarletredjoker.com',
            'container': 'scarletredjoker-web',
            'description': 'Personal portfolio website'
        },
        'vnc': {
            'name': 'VNC Desktop',
            'url': 'https://vnc.evindrake.net',
            'container': 'vnc-desktop',
            'description': 'Remote desktop access'
        }
    }
