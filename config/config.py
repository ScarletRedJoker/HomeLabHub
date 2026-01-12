import os
import secrets

class Config:
    SECRET_KEY = os.environ.get('SESSION_SECRET', secrets.token_hex(32))
    
    SESSION_COOKIE_SECURE = os.environ.get('FLASK_ENV') != 'development'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    
    DOCKER_HOST = os.environ.get('DOCKER_HOST', 'unix:///var/run/docker.sock')
    
    SSH_HOST = os.environ.get('SSH_HOST', 'localhost')
    SSH_PORT = int(os.environ.get('SSH_PORT', 22))
    SSH_USER = os.environ.get('SSH_USER', 'evin')
    SSH_KEY_PATH = os.environ.get('SSH_KEY_PATH', os.path.expanduser('~/.ssh/id_rsa'))
    
    SERVICES = {
        'discord_bot': {
            'name': 'Discord Ticket Bot',
            'container': 'discordticketbot',
            'path': '/home/evin/contain/DiscordTicketBot',
            'domain': 'bot.evindrake.net',
            'type': 'container'
        },
        'plex': {
            'name': 'Plex Server',
            'container': 'plex-server',
            'path': '/home/evin/contain/plex-server',
            'domain': 'plex.evindrake.net',
            'type': 'container'
        },
        'n8n': {
            'name': 'n8n Automation',
            'container': 'n8n',
            'path': '/home/evin/contain/n8n',
            'domain': 'n8n.evindrake.net',
            'type': 'container'
        },
        'scarletredjoker': {
            'name': 'Scarlet Red Joker Website',
            'container': None,
            'path': '/var/www/scarletredjoker',
            'domain': 'scarletredjoker.com',
            'type': 'static'
        }
    }
    
    STATIC_SITE_PATH = os.environ.get('STATIC_SITE_PATH', '/var/www/scarletredjoker')
    
    NOVNC_URL = os.environ.get('NOVNC_URL', 'http://localhost:6080/vnc.html')
    
    # Game Streaming Configuration
    WINDOWS_KVM_IP = os.environ.get('WINDOWS_KVM_IP', '192.168.1.XXX')
    
    AI_INTEGRATIONS_OPENAI_API_KEY = os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY')
    AI_INTEGRATIONS_OPENAI_BASE_URL = os.environ.get('AI_INTEGRATIONS_OPENAI_BASE_URL')
    
    MAX_LOG_LINES = 500
    LOG_REFRESH_INTERVAL = 2000
