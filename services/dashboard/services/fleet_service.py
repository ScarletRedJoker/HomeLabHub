"""
Fleet Manager Service
Remote server management via Tailscale VPN mesh using SSH
"""
import os
import logging
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import paramiko
import socket

logger = logging.getLogger(__name__)


class FleetManager:
    """Manages remote hosts in the homelab fleet via SSH over Tailscale"""
    
    DEFAULT_HOSTS = {
        'linode': {
            'host_id': 'linode',
            'name': 'Linode Cloud Server',
            'tailscale_ip': os.environ.get('TAILSCALE_LINODE_HOST', ''),
            'role': 'cloud',
            'ssh_user': os.environ.get('FLEET_LINODE_SSH_USER', 'root'),
            'ssh_port': 22,
            'description': 'Cloud server for Discord Bot, Stream Bot, and Dashboard',
        },
        'local': {
            'host_id': 'local',
            'name': 'Local Ubuntu Host',
            'tailscale_ip': os.environ.get('TAILSCALE_LOCAL_HOST', ''),
            'role': 'local',
            'ssh_user': os.environ.get('FLEET_LOCAL_SSH_USER', 'evin'),
            'ssh_port': 22,
            'description': 'Local gaming/media server with Plex, Home Assistant, MinIO',
        },
    }
    
    def __init__(self):
        self.ssh_timeout = 10
        self.command_timeout = 60
        self._ssh_clients: Dict[str, paramiko.SSHClient] = {}
        self.ssh_key_path = os.environ.get('FLEET_SSH_KEY_PATH', os.path.expanduser('~/.ssh/id_rsa'))
    
    def _get_host_config(self, host_id: str) -> Optional[Dict]:
        """Get host configuration by ID"""
        if host_id in self.DEFAULT_HOSTS:
            config = self.DEFAULT_HOSTS[host_id].copy()
            if not config.get('tailscale_ip'):
                return None
            return config
        
        try:
            from services.db_service import db_service
            from models.fleet import FleetHost
            from sqlalchemy import select
            
            if db_service.is_available:
                with db_service.get_session() as session:
                    host = session.execute(
                        select(FleetHost).where(FleetHost.host_id == host_id)
                    ).scalar_one_or_none()
                    if host:
                        return host.to_dict()
        except Exception as e:
            logger.warning(f"Could not fetch host from database: {e}")
        
        return None
    
    def _get_ssh_client(self, host_id: str) -> Optional[paramiko.SSHClient]:
        """Get or create SSH client for a host"""
        config = self._get_host_config(host_id)
        if not config:
            logger.error(f"Host {host_id} not found or not configured")
            return None
        
        tailscale_ip = config.get('tailscale_ip')
        if not tailscale_ip:
            logger.error(f"No Tailscale IP configured for host {host_id}")
            return None
        
        try:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            ssh_key_path = config.get('ssh_key_path') or self.ssh_key_path
            
            connect_kwargs = {
                'hostname': tailscale_ip,
                'port': config.get('ssh_port', 22),
                'username': config.get('ssh_user', 'root'),
                'timeout': self.ssh_timeout,
            }
            
            if os.path.exists(ssh_key_path):
                connect_kwargs['key_filename'] = ssh_key_path
            else:
                ssh_password = os.environ.get(f'FLEET_{host_id.upper()}_SSH_PASSWORD')
                if ssh_password:
                    connect_kwargs['password'] = ssh_password
                else:
                    logger.warning(f"No SSH key or password found for host {host_id}")
            
            client.connect(**connect_kwargs)
            logger.info(f"SSH connection established to {host_id} ({tailscale_ip})")
            return client
            
        except socket.timeout:
            logger.error(f"SSH connection to {host_id} timed out")
            return None
        except paramiko.AuthenticationException as e:
            logger.error(f"SSH authentication failed for {host_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"Failed to connect to {host_id}: {e}")
            return None
    
    def list_hosts(self) -> List[Dict]:
        """Get all registered hosts with their connection status"""
        hosts = []
        
        for host_id, config in self.DEFAULT_HOSTS.items():
            if not config.get('tailscale_ip'):
                continue
            
            host_data = config.copy()
            host_data['status'] = 'unknown'
            host_data['online'] = False
            
            try:
                client = self._get_ssh_client(host_id)
                if client:
                    host_data['status'] = 'online'
                    host_data['online'] = True
                    client.close()
                else:
                    host_data['status'] = 'offline'
            except Exception as e:
                host_data['status'] = 'error'
                host_data['error'] = str(e)
            
            hosts.append(host_data)
        
        try:
            from services.db_service import db_service
            from models.fleet import FleetHost
            from sqlalchemy import select
            
            if db_service.is_available:
                with db_service.get_session() as session:
                    db_hosts = session.execute(select(FleetHost).where(FleetHost.is_active == True)).scalars().all()
                    for host in db_hosts:
                        if host.host_id not in [h['host_id'] for h in hosts]:
                            host_data = host.to_dict()
                            host_data['status'] = 'unknown'
                            host_data['online'] = False
                            try:
                                client = self._get_ssh_client(host.host_id)
                                if client:
                                    host_data['status'] = 'online'
                                    host_data['online'] = True
                                    client.close()
                            except:
                                host_data['status'] = 'offline'
                            hosts.append(host_data)
        except Exception as e:
            logger.warning(f"Could not fetch hosts from database: {e}")
        
        return hosts
    
    def get_host_status(self, host_id: str) -> Optional[Dict]:
        """Get detailed host info including CPU, RAM, disk, and containers"""
        client = self._get_ssh_client(host_id)
        if not client:
            return None
        
        try:
            status = {
                'host_id': host_id,
                'online': True,
                'timestamp': datetime.now(timezone.utc).isoformat(),
            }
            
            _, stdout, _ = client.exec_command('uptime -s', timeout=self.command_timeout)
            uptime_since = stdout.read().decode().strip()
            status['uptime_since'] = uptime_since
            
            _, stdout, _ = client.exec_command(
                "grep 'cpu ' /proc/stat | awk '{usage=($2+$4)*100/($2+$4+$5)} END {print usage}'",
                timeout=self.command_timeout
            )
            cpu_percent = stdout.read().decode().strip()
            try:
                status['cpu_percent'] = round(float(cpu_percent), 2)
            except:
                status['cpu_percent'] = 0.0
            
            _, stdout, _ = client.exec_command("nproc", timeout=self.command_timeout)
            status['cpu_cores'] = int(stdout.read().decode().strip() or 0)
            
            _, stdout, _ = client.exec_command(
                "free -b | grep Mem | awk '{print $2,$3,$4}'",
                timeout=self.command_timeout
            )
            mem_output = stdout.read().decode().strip().split()
            if len(mem_output) >= 3:
                total = int(mem_output[0])
                used = int(mem_output[1])
                status['memory_total_gb'] = round(total / (1024**3), 2)
                status['memory_used_gb'] = round(used / (1024**3), 2)
                status['memory_percent'] = round((used / total) * 100, 2) if total > 0 else 0
            
            _, stdout, _ = client.exec_command(
                "df -B1 / | tail -1 | awk '{print $2,$3,$5}'",
                timeout=self.command_timeout
            )
            disk_output = stdout.read().decode().strip().split()
            if len(disk_output) >= 3:
                total = int(disk_output[0])
                used = int(disk_output[1])
                status['disk_total_gb'] = round(total / (1024**3), 2)
                status['disk_used_gb'] = round(used / (1024**3), 2)
                status['disk_percent'] = int(disk_output[2].replace('%', ''))
            
            _, stdout, _ = client.exec_command(
                "docker ps -a --format '{{json .}}' 2>/dev/null || echo ''",
                timeout=self.command_timeout
            )
            containers_output = stdout.read().decode().strip()
            containers = []
            if containers_output:
                import json
                for line in containers_output.split('\n'):
                    if line:
                        try:
                            containers.append(json.loads(line))
                        except:
                            pass
            status['container_count'] = len(containers)
            status['containers_running'] = sum(1 for c in containers if 'Up' in c.get('Status', ''))
            
            client.close()
            return status
            
        except Exception as e:
            logger.error(f"Failed to get status for {host_id}: {e}")
            client.close()
            return None
    
    def execute_command(self, host_id: str, command: str, timeout: int = None) -> Dict:
        """Execute a shell command on a remote host"""
        start_time = time.time()
        
        if not command or not command.strip():
            return {'success': False, 'error': 'Empty command'}
        
        dangerous_patterns = ['rm -rf /', 'mkfs', ':(){', 'dd if=/dev/zero']
        for pattern in dangerous_patterns:
            if pattern in command:
                return {'success': False, 'error': f'Dangerous command pattern detected: {pattern}'}
        
        client = self._get_ssh_client(host_id)
        if not client:
            return {'success': False, 'error': f'Cannot connect to host {host_id}'}
        
        try:
            cmd_timeout = timeout or self.command_timeout
            _, stdout, stderr = client.exec_command(command, timeout=cmd_timeout)
            
            exit_code = stdout.channel.recv_exit_status()
            output = stdout.read().decode('utf-8', errors='replace')
            error_output = stderr.read().decode('utf-8', errors='replace')
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            try:
                from services.db_service import db_service
                from models.fleet import FleetCommand
                
                if db_service.is_available:
                    with db_service.get_session() as session:
                        cmd_log = FleetCommand(
                            host_id=host_id,
                            command=command,
                            output=output[:10000] if output else None,
                            exit_code=exit_code,
                            duration_ms=duration_ms,
                        )
                        session.add(cmd_log)
                        session.commit()
            except Exception as e:
                logger.warning(f"Could not log command to database: {e}")
            
            client.close()
            
            return {
                'success': exit_code == 0,
                'exit_code': exit_code,
                'output': output,
                'error': error_output if error_output else None,
                'duration_ms': duration_ms,
            }
            
        except socket.timeout:
            client.close()
            return {'success': False, 'error': 'Command execution timed out'}
        except Exception as e:
            client.close()
            return {'success': False, 'error': str(e)}
    
    def get_containers(self, host_id: str) -> List[Dict]:
        """List Docker containers on a remote host"""
        result = self.execute_command(
            host_id,
            "docker ps -a --format '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.State}}|{{.Ports}}'"
        )
        
        if not result.get('success'):
            return []
        
        containers = []
        for line in result.get('output', '').strip().split('\n'):
            if not line:
                continue
            parts = line.split('|')
            if len(parts) >= 5:
                containers.append({
                    'id': parts[0],
                    'name': parts[1],
                    'image': parts[2],
                    'status': parts[3],
                    'state': parts[4],
                    'ports': parts[5] if len(parts) > 5 else '',
                })
        
        return containers
    
    def container_action(self, host_id: str, container: str, action: str) -> Dict:
        """Start, stop, or restart a container on a remote host"""
        valid_actions = ['start', 'stop', 'restart', 'logs']
        if action not in valid_actions:
            return {'success': False, 'error': f'Invalid action. Must be one of: {valid_actions}'}
        
        if action == 'logs':
            result = self.execute_command(
                host_id,
                f"docker logs --tail 100 {container}"
            )
        else:
            result = self.execute_command(
                host_id,
                f"docker {action} {container}"
            )
        
        return result
    
    def deploy_service(self, host_id: str, service_config: Dict) -> Dict:
        """Deploy a service to a remote host using docker-compose or docker run"""
        if not service_config:
            return {'success': False, 'error': 'No service configuration provided'}
        
        image = service_config.get('image')
        name = service_config.get('name')
        
        if not image:
            return {'success': False, 'error': 'Docker image is required'}
        
        if not name:
            name = image.split('/')[-1].split(':')[0]
        
        env_vars = service_config.get('environment', {})
        ports = service_config.get('ports', [])
        volumes = service_config.get('volumes', [])
        restart_policy = service_config.get('restart', 'unless-stopped')
        
        cmd_parts = [f'docker run -d --name {name}']
        cmd_parts.append(f'--restart {restart_policy}')
        
        for key, value in env_vars.items():
            cmd_parts.append(f'-e {key}="{value}"')
        
        for port in ports:
            cmd_parts.append(f'-p {port}')
        
        for volume in volumes:
            cmd_parts.append(f'-v {volume}')
        
        cmd_parts.append(image)
        
        if service_config.get('command'):
            cmd_parts.append(service_config['command'])
        
        command = ' '.join(cmd_parts)
        
        result = self.execute_command(host_id, command, timeout=120)
        
        if result.get('success'):
            result['message'] = f'Service {name} deployed successfully'
            result['container_id'] = result.get('output', '').strip()[:12]
        
        return result
    
    def add_host(self, host_data: Dict) -> Dict:
        """Add a new host to the fleet"""
        try:
            from services.db_service import db_service
            from models.fleet import FleetHost
            
            if not db_service.is_available:
                return {'success': False, 'error': 'Database not available'}
            
            with db_service.get_session() as session:
                host = FleetHost(
                    host_id=host_data['host_id'],
                    name=host_data['name'],
                    tailscale_ip=host_data['tailscale_ip'],
                    role=host_data.get('role', 'custom'),
                    ssh_user=host_data.get('ssh_user', 'root'),
                    ssh_port=host_data.get('ssh_port', 22),
                    ssh_key_path=host_data.get('ssh_key_path'),
                    description=host_data.get('description'),
                    host_metadata=host_data.get('metadata'),
                )
                session.add(host)
                session.commit()
                
                return {'success': True, 'host': host.to_dict()}
                
        except Exception as e:
            logger.error(f"Failed to add host: {e}")
            return {'success': False, 'error': str(e)}


fleet_manager = FleetManager()
