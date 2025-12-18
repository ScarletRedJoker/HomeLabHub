"""
Fleet Manager - SSH execution for remote homelab hosts
Enables Jarvis to execute commands on Linode and local Ubuntu server
"""
import os
import logging
import subprocess
from typing import Dict, Optional, Any
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class HostConfig:
    name: str
    ip: str
    user: str
    port: int = 22

FLEET_HOSTS = {
    'linode': HostConfig(
        name='Linode Cloud Server',
        ip=os.environ.get('TAILSCALE_LINODE_HOST', os.environ.get('LINODE_HOST', '100.66.61.51')),
        user=os.environ.get('FLEET_LINODE_SSH_USER', os.environ.get('LINODE_SSH_USER', 'root')),
        port=22
    ),
    'ubuntu': HostConfig(
        name='Local Ubuntu Server',
        ip=os.environ.get('TAILSCALE_LOCAL_HOST', os.environ.get('UBUNTU_HOST', '100.110.227.25')),
        user=os.environ.get('FLEET_LOCAL_SSH_USER', os.environ.get('SSH_USER', 'evin')),
        port=22
    )
}

SSH_KEY_PATH = os.environ.get('FLEET_SSH_KEY_PATH', os.environ.get('SSH_KEY_PATH', '/root/.ssh/id_rsa'))

class FleetManager:
    """Manages SSH connections to fleet hosts"""
    
    def __init__(self):
        self.hosts = FLEET_HOSTS
        self.ssh_timeout = 30
        self.enabled = self._check_ssh_available()
    
    def _check_ssh_available(self) -> bool:
        """Check if SSH client is available"""
        try:
            result = subprocess.run(['which', 'ssh'], capture_output=True, timeout=5)
            return result.returncode == 0
        except Exception:
            return False
    
    def execute_command(self, host: str, command: str) -> Dict[str, Any]:
        """Execute a command on a remote host via SSH"""
        if not self.enabled:
            return {
                'success': False,
                'output': '',
                'error': 'SSH client not available'
            }
        
        if host not in self.hosts:
            return {
                'success': False,
                'output': '',
                'error': f'Unknown host: {host}. Available: {list(self.hosts.keys())}'
            }
        
        host_config = self.hosts[host]
        
        ssh_cmd = [
            'ssh',
            '-o', 'StrictHostKeyChecking=accept-new',
            '-o', 'ConnectTimeout=10',
            '-o', 'BatchMode=yes',
            '-p', str(host_config.port),
        ]
        
        if os.path.exists(SSH_KEY_PATH):
            ssh_cmd.extend(['-i', SSH_KEY_PATH])
        
        ssh_cmd.extend([
            f'{host_config.user}@{host_config.ip}',
            command
        ])
        
        try:
            logger.info(f"Executing on {host}: {command[:100]}...")
            result = subprocess.run(
                ssh_cmd,
                capture_output=True,
                text=True,
                timeout=self.ssh_timeout
            )
            
            output = result.stdout + result.stderr
            success = result.returncode == 0
            
            logger.info(f"Command on {host} {'succeeded' if success else 'failed'}")
            
            return {
                'success': success,
                'output': output,
                'error': None if success else f'Exit code: {result.returncode}',
                'host': host
            }
            
        except subprocess.TimeoutExpired:
            logger.error(f"SSH timeout on {host}")
            return {
                'success': False,
                'output': '',
                'error': f'SSH command timed out after {self.ssh_timeout}s'
            }
        except Exception as e:
            logger.error(f"SSH error on {host}: {e}")
            return {
                'success': False,
                'output': '',
                'error': str(e)
            }
    
    def check_host_connectivity(self, host: str) -> Dict[str, Any]:
        """Check if a host is reachable"""
        return self.execute_command(host, 'echo "connected" && hostname')
    
    def get_host_status(self, host: str) -> Dict[str, Any]:
        """Get basic status of a host"""
        result = self.execute_command(host, 'uptime && free -h | head -2 && df -h / | tail -1')
        return {
            'host': host,
            'reachable': result['success'],
            'info': result['output'] if result['success'] else result['error']
        }
    
    def list_hosts(self) -> Dict[str, Dict]:
        """List all configured hosts"""
        return {
            name: {
                'name': config.name,
                'ip': config.ip,
                'user': config.user
            }
            for name, config in self.hosts.items()
        }
