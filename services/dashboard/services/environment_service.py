"""
Environment Control Plane Service
Unified service for managing multi-environment homelab infrastructure
"""
import os
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)


class EnvironmentType(Enum):
    LOCAL = "local"
    CLOUD = "cloud"


class HealthStatus(Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class EnvironmentConfig:
    env_id: str
    name: str
    description: str
    env_type: str
    hostname: str
    ip_address: str
    services: List[str]
    databases: List[str]
    storage_backends: List[str]


ENVIRONMENTS: Dict[str, EnvironmentConfig] = {
    'local': EnvironmentConfig(
        env_id='local',
        name='Local Homelab',
        description='On-premise Ubuntu server with media, gaming, and smart home services',
        env_type='local',
        hostname='host.evindrake.net',
        ip_address='192.168.0.177',
        services=[
            'plex', 'homeassistant', 'minio', 'sunshine', 
            'cloudflared', 'redis', 'caddy'
        ],
        databases=['postgres-local'],
        storage_backends=['minio', 'nas']
    ),
    'linode': EnvironmentConfig(
        env_id='linode',
        name='Linode Cloud',
        description='Cloud server running dashboard, Discord bot, and stream services',
        env_type='cloud',
        hostname='linode.evindrake.net',
        ip_address=os.environ.get('TAILSCALE_LINODE_HOST', ''),
        services=[
            'dashboard', 'discord-bot', 'stream-bot', 'n8n',
            'postgres', 'redis', 'caddy', 'celery'
        ],
        databases=['postgres-jarvis', 'postgres-discord'],
        storage_backends=['local-storage']
    )
}


class EnvironmentService:
    """Manages multi-environment homelab infrastructure"""
    
    def __init__(self):
        self._fleet_manager = None
        self._db_service = None
    
    @property
    def fleet_manager(self):
        if self._fleet_manager is None:
            try:
                from services.fleet_service import fleet_manager
                self._fleet_manager = fleet_manager
            except Exception as e:
                logger.warning(f"Fleet manager not available: {e}")
        return self._fleet_manager
    
    @property
    def db_service(self):
        if self._db_service is None:
            try:
                from services.db_service import db_service
                self._db_service = db_service
            except Exception as e:
                logger.warning(f"DB service not available: {e}")
        return self._db_service
    
    def list_environments(self) -> List[Dict]:
        """Get all configured environments with basic status"""
        environments = []
        
        for env_id, config in ENVIRONMENTS.items():
            env_data = asdict(config)
            env_data['status'] = self._get_quick_status(env_id)
            env_data['last_check'] = datetime.now(timezone.utc).isoformat()
            environments.append(env_data)
        
        return environments
    
    def get_environment(self, env_id: str) -> Optional[Dict]:
        """Get detailed environment information"""
        if env_id not in ENVIRONMENTS:
            return None
        
        config = ENVIRONMENTS[env_id]
        env_data = asdict(config)
        
        env_data['status'] = self._get_quick_status(env_id)
        env_data['last_check'] = datetime.now(timezone.utc).isoformat()
        
        host_status = self._get_host_status(env_id)
        if host_status:
            env_data['host_status'] = host_status
        
        return env_data
    
    def get_environment_status(self, env_id: str) -> Dict:
        """Get comprehensive status for an environment"""
        if env_id not in ENVIRONMENTS:
            return {'error': f'Environment {env_id} not found'}
        
        config = ENVIRONMENTS[env_id]
        
        status = {
            'env_id': env_id,
            'name': config.name,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'overall_health': HealthStatus.UNKNOWN.value,
            'host': self._get_host_status(env_id),
            'services': self._get_services_status(env_id),
            'databases': self._get_database_status(env_id),
            'storage': self._get_storage_status(env_id),
        }
        
        status['overall_health'] = self._calculate_overall_health(status)
        
        return status
    
    def _get_quick_status(self, env_id: str) -> str:
        """Get quick health status without full checks"""
        if not self.fleet_manager:
            return HealthStatus.UNKNOWN.value
        
        try:
            hosts = self.fleet_manager.list_hosts()
            for host in hosts:
                if host.get('host_id') == env_id:
                    if host.get('online'):
                        return HealthStatus.HEALTHY.value
                    else:
                        return HealthStatus.UNHEALTHY.value
        except Exception as e:
            logger.warning(f"Error checking quick status for {env_id}: {e}")
        
        return HealthStatus.UNKNOWN.value
    
    def _get_host_status(self, env_id: str) -> Optional[Dict]:
        """Get host system status (CPU, RAM, disk)"""
        if not self.fleet_manager:
            return None
        
        try:
            status = self.fleet_manager.get_host_status(env_id)
            if status:
                return {
                    'online': status.get('online', False),
                    'uptime_since': status.get('uptime_since'),
                    'cpu_percent': status.get('cpu_percent', 0),
                    'cpu_cores': status.get('cpu_cores', 0),
                    'memory_percent': status.get('memory_percent', 0),
                    'memory_used_gb': status.get('memory_used_gb', 0),
                    'memory_total_gb': status.get('memory_total_gb', 0),
                    'disk_percent': status.get('disk_percent', 0),
                    'disk_used_gb': status.get('disk_used_gb', 0),
                    'disk_total_gb': status.get('disk_total_gb', 0),
                }
        except Exception as e:
            logger.error(f"Error getting host status for {env_id}: {e}")
        
        return None
    
    def _get_services_status(self, env_id: str) -> Dict:
        """Get Docker container/service status for environment"""
        if not self.fleet_manager:
            return {'available': False, 'error': 'Fleet manager not available'}
        
        try:
            containers = self.fleet_manager.get_containers(env_id)
            
            running = 0
            stopped = 0
            unhealthy = 0
            services = []
            
            for container in containers:
                state = container.get('state', '').lower()
                status_text = container.get('status', '')
                
                service_info = {
                    'name': container.get('name'),
                    'image': container.get('image'),
                    'state': state,
                    'status': status_text,
                }
                
                if state == 'running':
                    running += 1
                    if 'unhealthy' in status_text.lower():
                        unhealthy += 1
                        service_info['health'] = 'unhealthy'
                    elif 'healthy' in status_text.lower():
                        service_info['health'] = 'healthy'
                    else:
                        service_info['health'] = 'unknown'
                else:
                    stopped += 1
                    service_info['health'] = 'stopped'
                
                services.append(service_info)
            
            return {
                'available': True,
                'total': len(containers),
                'running': running,
                'stopped': stopped,
                'unhealthy': unhealthy,
                'services': services
            }
            
        except Exception as e:
            logger.error(f"Error getting services for {env_id}: {e}")
            return {'available': False, 'error': str(e)}
    
    def _get_database_status(self, env_id: str) -> Dict:
        """Check database connectivity for environment"""
        config = ENVIRONMENTS.get(env_id)
        if not config:
            return {'available': False, 'error': 'Environment not found'}
        
        db_status = {
            'available': True,
            'databases': []
        }
        
        if env_id == 'linode' and self.db_service:
            try:
                health = self.db_service.health_check()
                db_status['databases'].append({
                    'name': 'jarvis-platform',
                    'type': 'postgresql',
                    'healthy': health.get('healthy', False),
                    'message': health.get('message', 'Unknown status')
                })
            except Exception as e:
                db_status['databases'].append({
                    'name': 'jarvis-platform',
                    'type': 'postgresql',
                    'healthy': False,
                    'message': str(e)
                })
        
        if env_id == 'local' and self.fleet_manager:
            try:
                result = self.fleet_manager.execute_command(
                    env_id,
                    'docker ps --filter "name=postgres" --format "{{.Names}}: {{.Status}}"',
                    timeout=10
                )
                if result.get('success'):
                    output = result.get('output', '').strip()
                    if output:
                        for line in output.split('\n'):
                            if line:
                                parts = line.split(':')
                                name = parts[0].strip() if parts else 'postgres'
                                status = parts[1].strip() if len(parts) > 1 else 'Unknown'
                                db_status['databases'].append({
                                    'name': name,
                                    'type': 'postgresql',
                                    'healthy': 'Up' in status,
                                    'message': status
                                })
            except Exception as e:
                logger.warning(f"Error checking database for {env_id}: {e}")
        
        return db_status
    
    def _get_storage_status(self, env_id: str) -> Dict:
        """Get storage status (MinIO, NAS) for environment"""
        config = ENVIRONMENTS.get(env_id)
        if not config:
            return {'available': False, 'error': 'Environment not found'}
        
        storage_status = {
            'available': True,
            'backends': []
        }
        
        if 'minio' in config.storage_backends:
            try:
                from config import Config
                storage_status['backends'].append({
                    'name': 'MinIO',
                    'type': 'object-storage',
                    'endpoint': Config.MINIO_ENDPOINT,
                    'healthy': True,
                    'message': 'Configured'
                })
            except Exception as e:
                storage_status['backends'].append({
                    'name': 'MinIO',
                    'type': 'object-storage',
                    'healthy': False,
                    'message': str(e)
                })
        
        if 'nas' in config.storage_backends:
            try:
                from config import Config
                storage_status['backends'].append({
                    'name': 'NAS (Zyxel)',
                    'type': 'network-storage',
                    'ip': Config.NAS_IP,
                    'healthy': True,
                    'message': 'Configured'
                })
            except Exception as e:
                storage_status['backends'].append({
                    'name': 'NAS',
                    'type': 'network-storage',
                    'healthy': False,
                    'message': str(e)
                })
        
        return storage_status
    
    def _calculate_overall_health(self, status: Dict) -> str:
        """Calculate overall health based on component status"""
        host = status.get('host')
        services = status.get('services', {})
        databases = status.get('databases', {})
        
        if not host or not host.get('online'):
            return HealthStatus.UNHEALTHY.value
        
        issues = 0
        
        if services.get('unhealthy', 0) > 0:
            issues += 1
        if services.get('stopped', 0) > services.get('running', 1):
            issues += 1
        
        for db in databases.get('databases', []):
            if not db.get('healthy'):
                issues += 1
        
        if host.get('cpu_percent', 0) > 90:
            issues += 1
        if host.get('memory_percent', 0) > 90:
            issues += 1
        if host.get('disk_percent', 0) > 90:
            issues += 1
        
        if issues == 0:
            return HealthStatus.HEALTHY.value
        elif issues <= 2:
            return HealthStatus.DEGRADED.value
        else:
            return HealthStatus.UNHEALTHY.value
    
    def run_health_checks(self, env_id: str) -> Dict:
        """Run comprehensive health checks for an environment"""
        if env_id not in ENVIRONMENTS:
            return {'success': False, 'error': f'Environment {env_id} not found'}
        
        checks = []
        
        host_status = self._get_host_status(env_id)
        if host_status:
            checks.append({
                'name': 'Host Connectivity',
                'status': 'passed' if host_status.get('online') else 'failed',
                'message': 'Host is online' if host_status.get('online') else 'Host is offline'
            })
            
            cpu = host_status.get('cpu_percent', 0)
            checks.append({
                'name': 'CPU Usage',
                'status': 'passed' if cpu < 80 else 'warning' if cpu < 90 else 'failed',
                'message': f'CPU at {cpu}%'
            })
            
            mem = host_status.get('memory_percent', 0)
            checks.append({
                'name': 'Memory Usage',
                'status': 'passed' if mem < 80 else 'warning' if mem < 90 else 'failed',
                'message': f'Memory at {mem}%'
            })
            
            disk = host_status.get('disk_percent', 0)
            checks.append({
                'name': 'Disk Usage',
                'status': 'passed' if disk < 80 else 'warning' if disk < 90 else 'failed',
                'message': f'Disk at {disk}%'
            })
        else:
            checks.append({
                'name': 'Host Connectivity',
                'status': 'failed',
                'message': 'Could not connect to host'
            })
        
        services = self._get_services_status(env_id)
        if services.get('available'):
            running = services.get('running', 0)
            total = services.get('total', 0)
            unhealthy = services.get('unhealthy', 0)
            
            checks.append({
                'name': 'Docker Services',
                'status': 'passed' if running == total and unhealthy == 0 else 'warning' if running > 0 else 'failed',
                'message': f'{running}/{total} running, {unhealthy} unhealthy'
            })
        
        databases = self._get_database_status(env_id)
        for db in databases.get('databases', []):
            checks.append({
                'name': f'Database: {db.get("name")}',
                'status': 'passed' if db.get('healthy') else 'failed',
                'message': db.get('message', 'Unknown')
            })
        
        passed = sum(1 for c in checks if c['status'] == 'passed')
        warnings = sum(1 for c in checks if c['status'] == 'warning')
        failed = sum(1 for c in checks if c['status'] == 'failed')
        
        overall = 'healthy' if failed == 0 and warnings == 0 else 'degraded' if failed == 0 else 'unhealthy'
        
        return {
            'success': True,
            'env_id': env_id,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'overall': overall,
            'summary': {
                'passed': passed,
                'warnings': warnings,
                'failed': failed,
                'total': len(checks)
            },
            'checks': checks
        }
    
    def trigger_deployment(self, env_id: str, options: Optional[Dict] = None) -> Dict:
        """Trigger deployment on an environment"""
        if env_id not in ENVIRONMENTS:
            return {'success': False, 'error': f'Environment {env_id} not found'}
        
        if not self.fleet_manager:
            return {'success': False, 'error': 'Fleet manager not available'}
        
        bootstrap_script = '/opt/homelab/HomeLabHub/deploy/scripts/bootstrap.sh'
        
        try:
            check_result = self.fleet_manager.execute_command(
                env_id,
                f'test -f {bootstrap_script} && echo "exists"',
                timeout=10,
                bypass_whitelist=True
            )
            
            if 'exists' not in check_result.get('output', ''):
                return {
                    'success': False,
                    'error': f'Bootstrap script not found at {bootstrap_script}'
                }
            
            result = self.fleet_manager.execute_command(
                env_id,
                f'bash {bootstrap_script} 2>&1',
                timeout=600,
                bypass_whitelist=True
            )
            
            return {
                'success': result.get('success', False),
                'env_id': env_id,
                'output': result.get('output', '')[:5000],
                'exit_code': result.get('exit_code'),
                'error': result.get('error'),
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
            
        except Exception as e:
            logger.error(f"Deployment failed for {env_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_recent_activity(self, env_id: Optional[str] = None, limit: int = 20) -> List[Dict]:
        """Get recent activity/alerts for environments"""
        activities = []
        
        if self.db_service and self.db_service.is_available:
            try:
                from models.fleet import FleetCommand
                from sqlalchemy import select, desc
                
                with self.db_service.get_session() as session:
                    query = select(FleetCommand).order_by(desc(FleetCommand.executed_at)).limit(limit)
                    
                    if env_id:
                        query = query.where(FleetCommand.host_id == env_id)
                    
                    commands = session.execute(query).scalars().all()
                    
                    for cmd in commands:
                        activities.append({
                            'type': 'command',
                            'env_id': cmd.host_id,
                            'command': cmd.command[:100],
                            'success': cmd.exit_code == 0,
                            'timestamp': cmd.executed_at.isoformat() if cmd.executed_at else None,
                            'duration_ms': cmd.duration_ms
                        })
            except Exception as e:
                logger.warning(f"Could not fetch activity from database: {e}")
        
        return activities


environment_service = EnvironmentService()
