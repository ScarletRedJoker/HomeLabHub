"""Command Whitelist/Blacklist Configuration for Jarvis Safe Execution

This module defines what commands Jarvis is allowed to execute with different
permission levels. It implements a defense-in-depth approach with multiple
layers of validation.
"""

import re
from typing import Dict, List, Tuple, Optional
from enum import Enum


class CommandRiskLevel(Enum):
    """Risk levels for command execution"""
    SAFE = "safe"
    LOW_RISK = "low_risk"
    MEDIUM_RISK = "medium_risk"
    HIGH_RISK = "high_risk"
    DESTRUCTIVE = "destructive"
    FORBIDDEN = "forbidden"


class CommandWhitelist:
    """Command whitelist/blacklist configuration with pattern matching"""
    
    FORBIDDEN_COMMANDS = [
        r'^rm\s+-rf\s+/',
        r'^rm\s+-rf\s+/\*',
        r'^dd\s+if=',
        r'>\s*/dev/sd[a-z]',
        r'mkfs\.',
        r'fdisk',
        r'parted',
        r'^:\(\)\{.*\|\:&\};:',
        r'chmod\s+777\s+/',
        r'chown\s+-R\s+\w+\s+/',
        r'init\s+0',
        r'init\s+6',
        r'shutdown',
        r'reboot',
        r'halt',
        r'poweroff',
        r'kill\s+-9\s+1',
        r'killall\s+-9',
        r'pkill\s+-9\s+.*',
        r'iptables\s+-F',
        r'iptables\s+-X',
        r'/dev/null\s*>\s*/dev/sd',
        r'wget.*\|\s*sh',
        r'curl.*\|\s*bash',
        r'eval\s+.*',
        r'exec\s+.*sh',
        r'nc\s+-e',
        r'nc\s+-c',
        r'ncat\s+-e',
        r'/proc/sys/kernel',
        r'sysctl\s+-w',
    ]
    
    SAFE_COMMANDS = {
        'ls': {
            'patterns': [r'^ls(\s+-[alhLRt]+)?(\s+[\w\./\-]+)*$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'List directory contents',
            'requires_approval': False
        },
        'cat': {
            'patterns': [r'^cat(\s+[\w\./\-]+)+$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Display file contents',
            'requires_approval': False
        },
        'head': {
            'patterns': [r'^head(\s+-n\s+\d+)?(\s+[\w\./\-]+)+$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Display first lines of file',
            'requires_approval': False
        },
        'tail': {
            'patterns': [r'^tail(\s+-n\s+\d+)?(\s+-f)?(\s+[\w\./\-]+)+$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Display last lines of file',
            'requires_approval': False
        },
        'pwd': {
            'patterns': [r'^pwd$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Print working directory',
            'requires_approval': False
        },
        'echo': {
            'patterns': [r'^echo\s+.*$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Print text',
            'requires_approval': False
        },
        'date': {
            'patterns': [r'^date(\s+.*)?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Display date/time',
            'requires_approval': False
        },
        'whoami': {
            'patterns': [r'^whoami$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Display current user',
            'requires_approval': False
        },
        'hostname': {
            'patterns': [r'^hostname$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Display hostname',
            'requires_approval': False
        },
        'uptime': {
            'patterns': [r'^uptime$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show system uptime',
            'requires_approval': False
        },
        'df': {
            'patterns': [r'^df(\s+-[hkT]+)?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show disk usage',
            'requires_approval': False
        },
        'free': {
            'patterns': [r'^free(\s+-[hm]+)?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show memory usage',
            'requires_approval': False
        },
        'ps': {
            'patterns': [r'^ps(\s+(aux|ef|-))?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show running processes',
            'requires_approval': False
        },
        'top': {
            'patterns': [r'^top(\s+-[bn]\s+\d+)?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show system resources',
            'requires_approval': False
        },
        'docker ps': {
            'patterns': [r'^docker\s+ps(\s+-a)?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'List Docker containers',
            'requires_approval': False
        },
        'docker images': {
            'patterns': [r'^docker\s+images$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'List Docker images',
            'requires_approval': False
        },
        'docker logs': {
            'patterns': [r'^docker\s+logs(\s+--tail\s+\d+)?(\s+-f)?\s+[\w\-]+$'],
            'risk_level': CommandRiskLevel.LOW_RISK,
            'description': 'View Docker container logs',
            'requires_approval': False
        },
        'docker inspect': {
            'patterns': [r'^docker\s+inspect\s+[\w\-]+$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Inspect Docker container/image',
            'requires_approval': False
        },
        'git status': {
            'patterns': [r'^git\s+status$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show git status',
            'requires_approval': False
        },
        'git log': {
            'patterns': [r'^git\s+log(\s+--oneline)?(\s+-n\s+\d+)?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show git log',
            'requires_approval': False
        },
        'git diff': {
            'patterns': [r'^git\s+diff(\s+[\w\./\-]+)?$'],
            'risk_level': CommandRiskLevel.SAFE,
            'description': 'Show git diff',
            'requires_approval': False
        },
    }
    
    MEDIUM_RISK_COMMANDS = {
        'docker compose up': {
            'patterns': [r'^docker\s+compose(\s+-f\s+[\w\./\-]+)?\s+up(\s+-d)?(\s+[\w\-]+)?$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Start Docker Compose services',
            'requires_approval': True
        },
        'docker compose down': {
            'patterns': [r'^docker\s+compose(\s+-f\s+[\w\./\-]+)?\s+down$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Stop Docker Compose services',
            'requires_approval': True
        },
        'docker compose restart': {
            'patterns': [r'^docker\s+compose(\s+-f\s+[\w\./\-]+)?\s+restart(\s+[\w\-]+)?$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Restart Docker Compose services',
            'requires_approval': True
        },
        'docker stop': {
            'patterns': [r'^docker\s+stop\s+[\w\-]+$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Stop Docker container',
            'requires_approval': True
        },
        'docker start': {
            'patterns': [r'^docker\s+start\s+[\w\-]+$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Start Docker container',
            'requires_approval': True
        },
        'docker restart': {
            'patterns': [r'^docker\s+restart\s+[\w\-]+$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Restart Docker container',
            'requires_approval': True
        },
        'systemctl status': {
            'patterns': [r'^systemctl\s+status\s+[\w\-\.]+$'],
            'risk_level': CommandRiskLevel.LOW_RISK,
            'description': 'Check systemd service status',
            'requires_approval': False
        },
        'systemctl restart': {
            'patterns': [r'^systemctl\s+restart\s+[\w\-\.]+$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Restart systemd service',
            'requires_approval': True
        },
        'mkdir': {
            'patterns': [r'^mkdir(\s+-p)?\s+[\w\./\-]+$'],
            'risk_level': CommandRiskLevel.LOW_RISK,
            'description': 'Create directory',
            'requires_approval': False
        },
        'touch': {
            'patterns': [r'^touch\s+[\w\./\-]+$'],
            'risk_level': CommandRiskLevel.LOW_RISK,
            'description': 'Create file',
            'requires_approval': False
        },
        'cp': {
            'patterns': [r'^cp(\s+-[rp]+)?\s+[\w\./\-]+\s+[\w\./\-]+$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Copy files',
            'requires_approval': True
        },
        'mv': {
            'patterns': [r'^mv\s+[\w\./\-]+\s+[\w\./\-]+$'],
            'risk_level': CommandRiskLevel.MEDIUM_RISK,
            'description': 'Move files',
            'requires_approval': True
        },
    }
    
    HIGH_RISK_COMMANDS = {
        'docker rm': {
            'patterns': [r'^docker\s+rm(\s+-f)?\s+[\w\-]+$'],
            'risk_level': CommandRiskLevel.HIGH_RISK,
            'description': 'Remove Docker container',
            'requires_approval': True
        },
        'docker rmi': {
            'patterns': [r'^docker\s+rmi(\s+-f)?\s+[\w\-/:\.]+$'],
            'risk_level': CommandRiskLevel.HIGH_RISK,
            'description': 'Remove Docker image',
            'requires_approval': True
        },
        'docker volume rm': {
            'patterns': [r'^docker\s+volume\s+rm\s+[\w\-]+$'],
            'risk_level': CommandRiskLevel.HIGH_RISK,
            'description': 'Remove Docker volume',
            'requires_approval': True
        },
        'rm': {
            'patterns': [r'^rm(\s+-[rf]+)?\s+[\w\./\-]+$'],
            'risk_level': CommandRiskLevel.HIGH_RISK,
            'description': 'Remove files (non-root)',
            'requires_approval': True
        },
        'git push': {
            'patterns': [r'^git\s+push(\s+origin)?(\s+[\w\-]+)?$'],
            'risk_level': CommandRiskLevel.HIGH_RISK,
            'description': 'Push to git repository',
            'requires_approval': True
        },
        'systemctl stop': {
            'patterns': [r'^systemctl\s+stop\s+[\w\-\.]+$'],
            'risk_level': CommandRiskLevel.HIGH_RISK,
            'description': 'Stop systemd service',
            'requires_approval': True
        },
    }
    
    @classmethod
    def validate_command(cls, command: str) -> Tuple[bool, CommandRiskLevel, str, bool]:
        """Validate a command against whitelist/blacklist
        
        Args:
            command: The command to validate
            
        Returns:
            Tuple of (is_allowed, risk_level, reason, requires_approval)
        """
        command = command.strip()
        
        if not command:
            return False, CommandRiskLevel.FORBIDDEN, "Empty command", False
        
        for pattern in cls.FORBIDDEN_COMMANDS:
            if re.match(pattern, command, re.IGNORECASE):
                return False, CommandRiskLevel.FORBIDDEN, f"Forbidden command pattern: {pattern}", False
        
        all_commands = {
            **cls.SAFE_COMMANDS,
            **cls.MEDIUM_RISK_COMMANDS,
            **cls.HIGH_RISK_COMMANDS
        }
        
        for cmd_name, config in all_commands.items():
            for pattern in config['patterns']:
                if re.match(pattern, command):
                    return (
                        True,
                        config['risk_level'],
                        f"Matched: {cmd_name}",
                        config['requires_approval']
                    )
        
        return False, CommandRiskLevel.FORBIDDEN, "Command not in whitelist", False
    
    @classmethod
    def get_command_info(cls, command: str) -> Optional[Dict]:
        """Get detailed information about a command
        
        Args:
            command: The command to look up
            
        Returns:
            Dictionary with command info or None if not found
        """
        is_allowed, risk_level, reason, requires_approval = cls.validate_command(command)
        
        return {
            'command': command,
            'is_allowed': is_allowed,
            'risk_level': risk_level.value,
            'reason': reason,
            'requires_approval': requires_approval
        }
    
    @classmethod
    def list_safe_commands(cls) -> List[str]:
        """Get list of all safe commands"""
        return list(cls.SAFE_COMMANDS.keys())
    
    @classmethod
    def list_all_allowed_commands(cls) -> Dict[str, List[str]]:
        """Get categorized list of all allowed commands"""
        return {
            'safe': list(cls.SAFE_COMMANDS.keys()),
            'medium_risk': list(cls.MEDIUM_RISK_COMMANDS.keys()),
            'high_risk': list(cls.HIGH_RISK_COMMANDS.keys())
        }
