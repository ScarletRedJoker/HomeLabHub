import docker
from docker.errors import DockerException, NotFound
from typing import Dict, List, Optional
import logging
import os

logger = logging.getLogger(__name__)

class DockerService:
    def __init__(self, docker_host: str = 'unix:///var/run/docker.sock'):
        try:
            self.client = docker.DockerClient(base_url=docker_host)
            self.client.ping()
            self.connected = True
            logger.info("Docker client connected successfully")
        except DockerException as e:
            # In development environments (like Replit), Docker isn't available
            # Only log as warning in production, debug in development
            if os.getenv('FLASK_ENV') == 'production':
                logger.warning(f"Failed to connect to Docker: {e}")
            else:
                logger.debug(f"Docker not available (expected in development): {e}")
            self.client = None
            self.connected = False
    
    def get_container_status(self, container_name: str) -> Optional[Dict]:
        if not self.connected:
            return None
        
        try:
            container = self.client.containers.get(container_name)
            stats = container.stats(stream=False)
            
            cpu_delta = stats['cpu_stats']['cpu_usage']['total_usage'] - \
                       stats['precpu_stats']['cpu_usage']['total_usage']
            system_delta = stats['cpu_stats']['system_cpu_usage'] - \
                          stats['precpu_stats']['system_cpu_usage']
            cpu_percent = (cpu_delta / system_delta) * 100.0 if system_delta > 0 else 0.0
            
            mem_usage = stats['memory_stats'].get('usage', 0)
            mem_limit = stats['memory_stats'].get('limit', 1)
            mem_percent = (mem_usage / mem_limit) * 100.0 if mem_limit > 0 else 0.0
            
            return {
                'name': container.name,
                'id': container.short_id,
                'status': container.status,
                'state': container.attrs['State'],
                'created': container.attrs['Created'],
                'image': container.image.tags[0] if container.image.tags else 'unknown',
                'cpu_percent': round(cpu_percent, 2),
                'memory_percent': round(mem_percent, 2),
                'memory_usage_mb': round(mem_usage / (1024 * 1024), 2),
                'memory_limit_mb': round(mem_limit / (1024 * 1024), 2),
                'ports': container.ports,
                'labels': container.labels
            }
        except NotFound:
            logger.warning(f"Container {container_name} not found")
            return None
        except Exception as e:
            logger.error(f"Error getting container status for {container_name}: {e}")
            return None
    
    def list_all_containers(self) -> List[Dict]:
        if not self.connected:
            return []
        
        try:
            containers = self.client.containers.list(all=True)
            return [{
                'name': c.name,
                'id': c.short_id,
                'status': c.status,
                'image': c.image.tags[0] if c.image.tags else 'unknown',
                'created': c.attrs['Created']
            } for c in containers]
        except Exception as e:
            logger.error(f"Error listing containers: {e}")
            return []
    
    def start_container(self, container_name: str) -> Dict:
        if not self.connected:
            return {'success': False, 'message': 'Docker not connected'}
        
        try:
            container = self.client.containers.get(container_name)
            container.start()
            logger.info(f"Started container {container_name}")
            return {'success': True, 'message': f'Container {container_name} started'}
        except NotFound:
            return {'success': False, 'message': f'Container {container_name} not found'}
        except Exception as e:
            logger.error(f"Error starting container {container_name}: {e}")
            return {'success': False, 'message': str(e)}
    
    def stop_container(self, container_name: str) -> Dict:
        if not self.connected:
            return {'success': False, 'message': 'Docker not connected'}
        
        try:
            container = self.client.containers.get(container_name)
            container.stop(timeout=10)
            logger.info(f"Stopped container {container_name}")
            return {'success': True, 'message': f'Container {container_name} stopped'}
        except NotFound:
            return {'success': False, 'message': f'Container {container_name} not found'}
        except Exception as e:
            logger.error(f"Error stopping container {container_name}: {e}")
            return {'success': False, 'message': str(e)}
    
    def restart_container(self, container_name: str) -> Dict:
        if not self.connected:
            return {'success': False, 'message': 'Docker not connected'}
        
        try:
            container = self.client.containers.get(container_name)
            container.restart(timeout=10)
            logger.info(f"Restarted container {container_name}")
            return {'success': True, 'message': f'Container {container_name} restarted'}
        except NotFound:
            return {'success': False, 'message': f'Container {container_name} not found'}
        except Exception as e:
            logger.error(f"Error restarting container {container_name}: {e}")
            return {'success': False, 'message': str(e)}
    
    def get_container_logs(self, container_name: str, lines: int = 100) -> Optional[str]:
        if not self.connected:
            return None
        
        try:
            container = self.client.containers.get(container_name)
            logs = container.logs(tail=lines, timestamps=True).decode('utf-8', errors='replace')
            return logs
        except NotFound:
            logger.warning(f"Container {container_name} not found")
            return None
        except Exception as e:
            logger.error(f"Error getting logs for {container_name}: {e}")
            return None
