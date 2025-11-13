import subprocess
import json
from typing import Dict, List, Optional
import logging
import os

logger = logging.getLogger(__name__)

class DockerService:
    def __init__(self):
        # No cached connection check - let each call fail naturally if Docker unavailable
        # This allows automatic recovery if Docker becomes available later
        pass
    
    def get_container_status(self, container_name: str) -> Optional[Dict]:
        """Get detailed status of a specific container"""
        
        try:
            # Get container details
            result = subprocess.run(
                ['docker', 'inspect', container_name],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.warning(f"Container {container_name} not found")
                return None
            
            container_data = json.loads(result.stdout)[0]
            
            # Get stats
            stats_result = subprocess.run(
                ['docker', 'stats', container_name, '--no-stream', '--format', '{{json .}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            stats_data = {}
            if stats_result.returncode == 0 and stats_result.stdout.strip():
                stats_data = json.loads(stats_result.stdout.strip())
            
            # Parse CPU and memory
            cpu_percent = 0.0
            mem_percent = 0.0
            mem_usage_mb = 0.0
            mem_limit_mb = 0.0
            
            if stats_data:
                cpu_str = stats_data.get('CPUPerc', '0%').replace('%', '')
                mem_str = stats_data.get('MemPerc', '0%').replace('%', '')
                
                try:
                    cpu_percent = float(cpu_str)
                    mem_percent = float(mem_str)
                except ValueError:
                    pass
                
                # Parse memory usage (format: "123.4MiB / 1.5GiB")
                mem_usage_str = stats_data.get('MemUsage', '0B / 0B')
                if ' / ' in mem_usage_str:
                    usage_part, limit_part = mem_usage_str.split(' / ')
                    mem_usage_mb = self._parse_memory(usage_part)
                    mem_limit_mb = self._parse_memory(limit_part)
            
            return {
                'name': container_data['Name'].lstrip('/'),
                'id': container_data['Id'][:12],
                'status': container_data['State']['Status'],
                'state': container_data['State'],
                'created': container_data['Created'],
                'image': container_data['Config']['Image'],
                'cpu_percent': round(cpu_percent, 2),
                'memory_percent': round(mem_percent, 2),
                'memory_usage_mb': round(mem_usage_mb, 2),
                'memory_limit_mb': round(mem_limit_mb, 2),
                'ports': self._format_ports(container_data.get('NetworkSettings', {}).get('Ports', {})),
                'labels': container_data['Config'].get('Labels', {})
            }
        except Exception as e:
            logger.error(f"Error getting container status for {container_name}: {e}")
            return None
    
    def list_all_containers(self) -> List[Dict]:
        """List all containers (running and stopped)"""
        try:
            result = subprocess.run(
                ['docker', 'ps', '-a', '--format', '{{json .}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.error(f"Error listing containers: {result.stderr}")
                return []
            
            containers = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    data = json.loads(line)
                    containers.append({
                        'name': data['Names'],
                        'id': data['ID'][:12],
                        'status': data['State'],
                        'image': data['Image'],
                        'created': data['CreatedAt']
                    })
            
            return containers
        except Exception as e:
            logger.error(f"Error listing containers: {e}")
            return []
    
    def start_container(self, container_name: str) -> Dict:
        """Start a stopped container"""
        try:
            result = subprocess.run(
                ['docker', 'start', container_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info(f"Started container {container_name}")
                return {'success': True, 'message': f'Container {container_name} started'}
            else:
                error = result.stderr.strip()
                if 'No such container' in error:
                    return {'success': False, 'message': f'Container {container_name} not found'}
                return {'success': False, 'message': error}
        except Exception as e:
            logger.error(f"Error starting container {container_name}: {e}")
            return {'success': False, 'message': str(e)}
    
    def stop_container(self, container_name: str) -> Dict:
        """Stop a running container"""
        try:
            result = subprocess.run(
                ['docker', 'stop', '-t', '10', container_name],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            if result.returncode == 0:
                logger.info(f"Stopped container {container_name}")
                return {'success': True, 'message': f'Container {container_name} stopped'}
            else:
                error = result.stderr.strip()
                if 'No such container' in error:
                    return {'success': False, 'message': f'Container {container_name} not found'}
                return {'success': False, 'message': error}
        except Exception as e:
            logger.error(f"Error stopping container {container_name}: {e}")
            return {'success': False, 'message': str(e)}
    
    def restart_container(self, container_name: str) -> Dict:
        """Restart a container"""
        try:
            result = subprocess.run(
                ['docker', 'restart', '-t', '10', container_name],
                capture_output=True,
                text=True,
                timeout=25
            )
            
            if result.returncode == 0:
                logger.info(f"Restarted container {container_name}")
                return {'success': True, 'message': f'Container {container_name} restarted'}
            else:
                error = result.stderr.strip()
                if 'No such container' in error:
                    return {'success': False, 'message': f'Container {container_name} not found'}
                return {'success': False, 'message': error}
        except Exception as e:
            logger.error(f"Error restarting container {container_name}: {e}")
            return {'success': False, 'message': str(e)}
    
    def get_container_logs(self, container_name: str, lines: int = 100) -> Optional[str]:
        """Get logs from a container"""
        try:
            result = subprocess.run(
                ['docker', 'logs', '--tail', str(lines), '--timestamps', container_name],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                return result.stdout
            else:
                logger.warning(f"Error getting logs for {container_name}: {result.stderr}")
                return None
        except Exception as e:
            logger.error(f"Error getting logs for {container_name}: {e}")
            return None
    
    def _parse_memory(self, mem_str: str) -> float:
        """Parse memory string like '123.4MiB' or '1.5GiB' to MB"""
        mem_str = mem_str.strip()
        try:
            if 'GiB' in mem_str:
                return float(mem_str.replace('GiB', '')) * 1024
            elif 'MiB' in mem_str:
                return float(mem_str.replace('MiB', ''))
            elif 'KiB' in mem_str:
                return float(mem_str.replace('KiB', '')) / 1024
            elif 'B' in mem_str:
                return float(mem_str.replace('B', '')) / (1024 * 1024)
            else:
                return 0.0
        except ValueError:
            return 0.0
    
    def _format_ports(self, ports_data: Dict) -> Dict:
        """Format port mappings from Docker inspect output"""
        formatted = {}
        for container_port, bindings in ports_data.items():
            if bindings:
                for binding in bindings:
                    host_port = binding.get('HostPort', '')
                    if host_port:
                        formatted[container_port] = host_port
        return formatted
