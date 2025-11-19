"""Autonomous Monitoring Service - Continuous Health Monitoring & Self-Healing"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import subprocess
import json

from services.docker_service import DockerService
from services.db_service import db_service
from services.agent_orchestrator import AgentOrchestrator

logger = logging.getLogger(__name__)


class AutonomousMonitor:
    """
    Continuously monitors system health and automatically creates tasks for issues.
    Implements self-healing for common problems.
    """
    
    def __init__(self):
        self.docker_service = DockerService()
        self.orchestrator = AgentOrchestrator()
        self.last_check_time: Optional[datetime] = None
        self.issue_history: List[Dict[str, Any]] = []
    
    def run_health_check(self) -> Dict[str, Any]:
        """Run complete system health check"""
        logger.info("Starting autonomous health check...")
        
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'containers': self._check_container_health(),
            'database': self._check_database_health(),
            'network': self._check_network_health(),
            'disk': self._check_disk_space(),
            'issues_detected': [],
            'tasks_created': []
        }
        
        # Analyze results and create tasks for issues
        self._analyze_and_respond(results)
        
        self.last_check_time = datetime.utcnow()
        logger.info(f"Health check complete. Issues detected: {len(results['issues_detected'])}")
        
        return results
    
    def _check_container_health(self) -> Dict[str, Any]:
        """Check health of all containers"""
        containers_status = {
            'healthy': [],
            'unhealthy': [],
            'stopped': [],
            'restarting': []
        }
        
        try:
            containers = self.docker_service.list_all_containers()
            
            for container in containers:
                name = container.get('name', 'unknown')
                status = container.get('status', 'unknown').lower()
                
                # Get detailed status
                details = self.docker_service.get_container_status(name)
                
                if not details:
                    containers_status['unhealthy'].append({
                        'name': name,
                        'issue': 'Failed to get container details'
                    })
                    continue
                
                state = details.get('state', {})
                
                if status == 'running':
                    # Check if container is healthy
                    health = state.get('Health', {})
                    if health and health.get('Status') == 'unhealthy':
                        containers_status['unhealthy'].append({
                            'name': name,
                            'issue': 'Container is unhealthy',
                            'health_log': health.get('Log', [])[-1:] if health.get('Log') else []
                        })
                    else:
                        # Check resource usage
                        cpu_percent = details.get('cpu_percent', 0)
                        mem_percent = details.get('memory_percent', 0)
                        
                        if cpu_percent > 90:
                            containers_status['unhealthy'].append({
                                'name': name,
                                'issue': f'High CPU usage: {cpu_percent}%',
                                'cpu_percent': cpu_percent
                            })
                        elif mem_percent > 90:
                            containers_status['unhealthy'].append({
                                'name': name,
                                'issue': f'High memory usage: {mem_percent}%',
                                'mem_percent': mem_percent
                            })
                        else:
                            containers_status['healthy'].append({
                                'name': name,
                                'cpu': cpu_percent,
                                'memory': mem_percent
                            })
                
                elif status in ['exited', 'dead']:
                    containers_status['stopped'].append({
                        'name': name,
                        'exit_code': state.get('ExitCode'),
                        'error': state.get('Error', '')
                    })
                
                elif status == 'restarting':
                    containers_status['restarting'].append({
                        'name': name,
                        'restart_count': state.get('RestartCount', 0)
                    })
        
        except Exception as e:
            logger.error(f"Error checking container health: {e}", exc_info=True)
            containers_status['error'] = str(e)
        
        return containers_status
    
    def _check_database_health(self) -> Dict[str, Any]:
        """Check database connections and health"""
        db_status = {
            'available': db_service.is_available,
            'issues': []
        }
        
        if not db_service.is_available:
            db_status['issues'].append({
                'severity': 'critical',
                'message': 'Database service not available'
            })
            return db_status
        
        try:
            # Test database connection
            with db_service.get_session() as session:
                result = session.execute("SELECT 1").fetchone()
                if result and result[0] == 1:
                    db_status['connection'] = 'healthy'
                else:
                    db_status['issues'].append({
                        'severity': 'warning',
                        'message': 'Database connection test failed'
                    })
            
            # Check for long-running queries (if we can access pg_stat_activity)
            try:
                with db_service.get_session() as session:
                    long_queries = session.execute("""
                        SELECT pid, now() - query_start as duration, query
                        FROM pg_stat_activity
                        WHERE state = 'active'
                        AND now() - query_start > interval '5 minutes'
                        LIMIT 5
                    """).fetchall()
                    
                    if long_queries:
                        db_status['issues'].append({
                            'severity': 'warning',
                            'message': f'{len(long_queries)} long-running queries detected',
                            'queries': [{'pid': q[0], 'duration': str(q[1])} for q in long_queries]
                        })
            except Exception:
                # Permission issue or not PostgreSQL - skip this check
                pass
        
        except Exception as e:
            logger.error(f"Error checking database health: {e}", exc_info=True)
            db_status['issues'].append({
                'severity': 'error',
                'message': f'Database health check failed: {str(e)}'
            })
        
        return db_status
    
    def _check_network_health(self) -> Dict[str, Any]:
        """Check network connectivity"""
        network_status = {
            'internet': False,
            'dns': False,
            'issues': []
        }
        
        try:
            # Check internet connectivity
            result = subprocess.run(
                ['ping', '-c', '1', '-W', '2', '8.8.8.8'],
                capture_output=True,
                timeout=5
            )
            network_status['internet'] = result.returncode == 0
            
            if not network_status['internet']:
                network_status['issues'].append({
                    'severity': 'critical',
                    'message': 'No internet connectivity'
                })
            
            # Check DNS resolution
            result = subprocess.run(
                ['nslookup', 'google.com'],
                capture_output=True,
                timeout=5
            )
            network_status['dns'] = result.returncode == 0
            
            if not network_status['dns']:
                network_status['issues'].append({
                    'severity': 'warning',
                    'message': 'DNS resolution failing'
                })
        
        except Exception as e:
            logger.error(f"Error checking network health: {e}", exc_info=True)
            network_status['issues'].append({
                'severity': 'error',
                'message': f'Network check failed: {str(e)}'
            })
        
        return network_status
    
    def _check_disk_space(self) -> Dict[str, Any]:
        """Check disk space usage"""
        disk_status = {
            'usage_percent': 0,
            'available_gb': 0,
            'issues': []
        }
        
        try:
            result = subprocess.run(
                ['df', '-h', '/'],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if result.returncode == 0:
                lines = result.stdout.strip().split('\n')
                if len(lines) > 1:
                    parts = lines[1].split()
                    usage_str = parts[4].rstrip('%')
                    available = parts[3]
                    
                    disk_status['usage_percent'] = int(usage_str)
                    disk_status['available'] = available
                    
                    if disk_status['usage_percent'] > 90:
                        disk_status['issues'].append({
                            'severity': 'critical',
                            'message': f'Disk usage critical: {disk_status["usage_percent"]}%'
                        })
                    elif disk_status['usage_percent'] > 80:
                        disk_status['issues'].append({
                            'severity': 'warning',
                            'message': f'Disk usage high: {disk_status["usage_percent"]}%'
                        })
        
        except Exception as e:
            logger.error(f"Error checking disk space: {e}", exc_info=True)
            disk_status['issues'].append({
                'severity': 'error',
                'message': f'Disk check failed: {str(e)}'
            })
        
        return disk_status
    
    def _analyze_and_respond(self, results: Dict[str, Any]):
        """Analyze health check results and create tasks or auto-heal"""
        
        # Check for stopped containers
        stopped = results['containers'].get('stopped', [])
        for container in stopped:
            # Attempt auto-restart for containers that exited normally
            if container.get('exit_code') == 0:
                logger.info(f"Attempting to auto-restart container: {container['name']}")
                if self._auto_restart_container(container['name']):
                    results['tasks_created'].append({
                        'action': 'auto_heal',
                        'target': container['name'],
                        'result': 'Container restarted successfully'
                    })
                else:
                    # Create task for manual intervention
                    self._create_repair_task(
                        f"Container {container['name']} stopped",
                        'container',
                        {
                            'container_name': container['name'],
                            'exit_code': container.get('exit_code'),
                            'error': container.get('error')
                        },
                        requires_approval=False
                    )
                    results['issues_detected'].append(container)
            else:
                # Non-zero exit code - needs investigation
                self._create_repair_task(
                    f"Container {container['name']} crashed with exit code {container.get('exit_code')}",
                    'container',
                    {
                        'container_name': container['name'],
                        'exit_code': container.get('exit_code'),
                        'error': container.get('error')
                    },
                    requires_approval=True
                )
                results['issues_detected'].append(container)
        
        # Check for unhealthy containers
        unhealthy = results['containers'].get('unhealthy', [])
        for container in unhealthy:
            self._create_repair_task(
                f"Container {container['name']} is unhealthy: {container['issue']}",
                'container',
                container,
                requires_approval=True
            )
            results['issues_detected'].append(container)
        
        # Check for database issues
        db_issues = results['database'].get('issues', [])
        for issue in db_issues:
            if issue['severity'] == 'critical':
                self._create_repair_task(
                    f"Database critical issue: {issue['message']}",
                    'database',
                    issue,
                    requires_approval=True
                )
                results['issues_detected'].append(issue)
        
        # Check for network issues
        network_issues = results['network'].get('issues', [])
        for issue in network_issues:
            if issue['severity'] == 'critical':
                self._create_repair_task(
                    f"Network critical issue: {issue['message']}",
                    'network',
                    issue,
                    requires_approval=False
                )
                results['issues_detected'].append(issue)
        
        # Check for disk space issues
        disk_issues = results['disk'].get('issues', [])
        for issue in disk_issues:
            if issue['severity'] == 'critical':
                self._create_repair_task(
                    f"Disk space critical: {issue['message']}",
                    'system',
                    issue,
                    requires_approval=True
                )
                results['issues_detected'].append(issue)
    
    def _auto_restart_container(self, container_name: str) -> bool:
        """Attempt to automatically restart a container"""
        try:
            result = self.docker_service.start_container(container_name)
            return result.get('success', False)
        except Exception as e:
            logger.error(f"Failed to auto-restart container {container_name}: {e}")
            return False
    
    def _create_repair_task(self, description: str, task_type: str, 
                           context: Dict, requires_approval: bool = True):
        """Create a task for the agent swarm to fix an issue"""
        try:
            task = self.orchestrator.create_task(
                description=description,
                task_type='repair',
                priority=8 if context.get('severity') == 'critical' else 5,
                context={
                    'issue_type': task_type,
                    'details': context,
                    'detected_at': datetime.utcnow().isoformat(),
                    'requires_approval': requires_approval
                }
            )
            
            if task:
                logger.info(f"Created repair task {task.id}: {description}")
                return task.id
            else:
                logger.error(f"Failed to create repair task: {description}")
                return None
        except Exception as e:
            logger.error(f"Error creating repair task: {e}", exc_info=True)
            return None
    
    def get_system_summary(self) -> Dict[str, Any]:
        """Get comprehensive system health summary for reporting"""
        try:
            # Run quick health checks
            container_health = self._check_container_health()
            database_health = self._check_database_health()
            network_health = self._check_network_health()
            disk_status = self._check_disk_space()
            
            # Count issues and tasks
            issues_found = (
                len(container_health.get('unhealthy', [])) +
                len(container_health.get('stopped', [])) +
                len(container_health.get('restarting', [])) +
                len(database_health.get('issues', [])) +
                len(network_health.get('issues', [])) +
                len(disk_status.get('issues', []))
            )
            
            # Tasks created (from history if available)
            tasks_created = len(self.issue_history) if hasattr(self, 'issue_history') else 0
            
            return {
                'timestamp': datetime.utcnow().isoformat(),
                'last_check': self.last_check_time.isoformat() if self.last_check_time else None,
                'container_health': {
                    'total': len(container_health.get('healthy', [])) + len(container_health.get('unhealthy', [])) + len(container_health.get('stopped', [])),
                    'healthy': len(container_health.get('healthy', [])),
                    'unhealthy': len(container_health.get('unhealthy', [])),
                    'stopped': len(container_health.get('stopped', [])),
                    'restarting': len(container_health.get('restarting', []))
                },
                'database_health': {
                    'available': database_health.get('available', False),
                    'connection': database_health.get('connection', 'unknown'),
                    'issues_count': len(database_health.get('issues', []))
                },
                'network_health': {
                    'internet': network_health.get('internet', False),
                    'dns': network_health.get('dns', False),
                    'issues_count': len(network_health.get('issues', []))
                },
                'disk_status': {
                    'usage_percent': disk_status.get('usage_percent', 0),
                    'available': disk_status.get('available', 'unknown'),
                    'issues_count': len(disk_status.get('issues', []))
                },
                'issues_found': issues_found,
                'tasks_created': tasks_created
            }
        except Exception as e:
            logger.error(f"Error getting system summary: {e}", exc_info=True)
            return {
                'error': str(e),
                'timestamp': datetime.utcnow().isoformat(),
                'container_health': {},
                'database_health': {},
                'network_health': {},
                'disk_status': {},
                'issues_found': 0,
                'tasks_created': 0
            }
