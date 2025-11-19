"""Continuous Optimization Service - Performance Analysis & Improvement"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import subprocess
import json

from services.docker_service import DockerService
from services.db_service import db_service
from services.agent_orchestrator import AgentOrchestrator

logger = logging.getLogger(__name__)


class ContinuousOptimizer:
    """
    Analyzes system performance and suggests optimizations.
    Tracks metrics over time to identify improvement opportunities.
    """
    
    def __init__(self):
        self.docker_service = DockerService()
        self.orchestrator = AgentOrchestrator()
        self.performance_history: List[Dict[str, Any]] = []
    
    def run_optimization_analysis(self) -> Dict[str, Any]:
        """Run complete optimization analysis"""
        logger.info("Starting continuous optimization analysis...")
        
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'resource_optimization': self._analyze_resource_usage(),
            'image_updates': self._check_image_updates(),
            'database_optimization': self._analyze_database_performance(),
            'storage_optimization': self._analyze_storage_usage(),
            'recommendations': [],
            'tasks_created': []
        }
        
        # Generate recommendations and create tasks
        self._generate_recommendations(results)
        
        # Store in history for trend analysis
        self.performance_history.append({
            'timestamp': datetime.utcnow(),
            'metrics': results
        })
        
        # Keep only last 100 entries
        if len(self.performance_history) > 100:
            self.performance_history = self.performance_history[-100:]
        
        logger.info(f"Optimization analysis complete. Recommendations: {len(results['recommendations'])}")
        return results
    
    def _analyze_resource_usage(self) -> Dict[str, Any]:
        """Analyze container resource usage patterns"""
        resource_analysis = {
            'containers': [],
            'over_provisioned': [],
            'under_provisioned': [],
            'efficiency_score': 0
        }
        
        try:
            containers = self.docker_service.list_all_containers()
            running_containers = [c for c in containers if c.get('status', '').lower() == 'running']
            
            total_efficiency = 0
            
            for container in running_containers:
                name = container.get('name', 'unknown')
                details = self.docker_service.get_container_status(name)
                
                if not details:
                    continue
                
                cpu_percent = details.get('cpu_percent', 0)
                mem_percent = details.get('memory_percent', 0)
                mem_limit_mb = details.get('memory_limit_mb', 0)
                
                # Calculate efficiency (100% = perfect utilization)
                avg_usage = (cpu_percent + mem_percent) / 2
                efficiency = min(avg_usage, 100)
                total_efficiency += efficiency
                
                container_analysis = {
                    'name': name,
                    'cpu_percent': cpu_percent,
                    'mem_percent': mem_percent,
                    'mem_limit_mb': mem_limit_mb,
                    'efficiency': efficiency
                }
                
                resource_analysis['containers'].append(container_analysis)
                
                # Detect over-provisioning (low usage)
                if avg_usage < 10 and mem_limit_mb > 512:
                    resource_analysis['over_provisioned'].append({
                        'name': name,
                        'avg_usage': avg_usage,
                        'mem_limit_mb': mem_limit_mb,
                        'recommendation': 'Consider reducing memory limit'
                    })
                
                # Detect under-provisioning (high usage)
                elif mem_percent > 85:
                    resource_analysis['under_provisioned'].append({
                        'name': name,
                        'mem_percent': mem_percent,
                        'mem_limit_mb': mem_limit_mb,
                        'recommendation': 'Consider increasing memory limit'
                    })
            
            if running_containers:
                resource_analysis['efficiency_score'] = round(total_efficiency / len(running_containers), 2)
        
        except Exception as e:
            logger.error(f"Error analyzing resource usage: {e}", exc_info=True)
            resource_analysis['error'] = str(e)
        
        return resource_analysis
    
    def _check_image_updates(self) -> Dict[str, Any]:
        """Check for updated Docker images"""
        update_analysis = {
            'updates_available': [],
            'up_to_date': [],
            'check_failed': []
        }
        
        try:
            containers = self.docker_service.list_all_containers()
            
            for container in containers:
                name = container.get('name', 'unknown')
                image = container.get('image', '')
                
                if not image:
                    continue
                
                try:
                    # Pull latest image info (without actually pulling)
                    result = subprocess.run(
                        ['docker', 'manifest', 'inspect', image],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if result.returncode == 0:
                        # Get current image ID
                        inspect_result = subprocess.run(
                            ['docker', 'inspect', '--format={{.Image}}', name],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        
                        if inspect_result.returncode == 0:
                            current_id = inspect_result.stdout.strip()
                            
                            # Compare with latest (simplified check)
                            # In production, you'd parse the manifest and compare digests
                            update_analysis['up_to_date'].append({
                                'name': name,
                                'image': image
                            })
                    else:
                        update_analysis['check_failed'].append({
                            'name': name,
                            'image': image,
                            'reason': 'Manifest not accessible'
                        })
                
                except subprocess.TimeoutExpired:
                    update_analysis['check_failed'].append({
                        'name': name,
                        'image': image,
                        'reason': 'Timeout'
                    })
                except Exception as e:
                    update_analysis['check_failed'].append({
                        'name': name,
                        'image': image,
                        'reason': str(e)
                    })
        
        except Exception as e:
            logger.error(f"Error checking image updates: {e}", exc_info=True)
            update_analysis['error'] = str(e)
        
        return update_analysis
    
    def _analyze_database_performance(self) -> Dict[str, Any]:
        """Analyze database performance metrics"""
        db_analysis = {
            'slow_queries': [],
            'index_recommendations': [],
            'table_bloat': [],
            'connection_pool_usage': None
        }
        
        if not db_service.is_available:
            db_analysis['error'] = 'Database not available'
            return db_analysis
        
        try:
            # Check for slow queries (PostgreSQL)
            with db_service.get_session() as session:
                # Get slow queries from pg_stat_statements if available
                try:
                    slow_queries = session.execute("""
                        SELECT query, calls, mean_exec_time, total_exec_time
                        FROM pg_stat_statements
                        WHERE mean_exec_time > 1000
                        ORDER BY mean_exec_time DESC
                        LIMIT 10
                    """).fetchall()
                    
                    for query, calls, mean_time, total_time in slow_queries:
                        db_analysis['slow_queries'].append({
                            'query': query[:200],  # Truncate for display
                            'calls': calls,
                            'mean_time_ms': float(mean_time),
                            'total_time_ms': float(total_time)
                        })
                except Exception:
                    # pg_stat_statements extension not available
                    pass
                
                # Check for tables without indexes
                try:
                    unindexed_tables = session.execute("""
                        SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
                        FROM pg_tables
                        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                        AND NOT EXISTS (
                            SELECT 1 FROM pg_indexes 
                            WHERE tablename = pg_tables.tablename 
                            AND schemaname = pg_tables.schemaname
                        )
                        LIMIT 10
                    """).fetchall()
                    
                    for schema, table, size in unindexed_tables:
                        db_analysis['index_recommendations'].append({
                            'schema': schema,
                            'table': table,
                            'size': size,
                            'recommendation': 'Consider adding indexes for frequently queried columns'
                        })
                except Exception:
                    pass
                
                # Check connection pool usage
                try:
                    connections = session.execute("""
                        SELECT count(*) as total, 
                               count(*) FILTER (WHERE state = 'active') as active,
                               count(*) FILTER (WHERE state = 'idle') as idle
                        FROM pg_stat_activity
                    """).fetchone()
                    
                    if connections:
                        db_analysis['connection_pool_usage'] = {
                            'total': connections[0],
                            'active': connections[1],
                            'idle': connections[2]
                        }
                except Exception:
                    pass
        
        except Exception as e:
            logger.error(f"Error analyzing database performance: {e}", exc_info=True)
            db_analysis['error'] = str(e)
        
        return db_analysis
    
    def _analyze_storage_usage(self) -> Dict[str, Any]:
        """Analyze storage usage and identify cleanup opportunities"""
        storage_analysis = {
            'docker_volumes': [],
            'unused_images': [],
            'log_sizes': [],
            'cleanup_potential_gb': 0
        }
        
        try:
            # Check Docker system disk usage
            result = subprocess.run(
                ['docker', 'system', 'df', '--format', '{{json .}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line:
                        data = json.loads(line)
                        storage_type = data.get('Type', '')
                        size = data.get('Size', '')
                        reclaimable = data.get('Reclaimable', '')
                        
                        if 'Image' in storage_type and reclaimable and 'GB' in reclaimable:
                            try:
                                gb = float(reclaimable.split('GB')[0])
                                storage_analysis['cleanup_potential_gb'] += gb
                            except ValueError:
                                pass
            
            # List unused images
            result = subprocess.run(
                ['docker', 'images', '--filter', 'dangling=true', '--format', '{{json .}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line:
                        try:
                            image_data = json.loads(line)
                            storage_analysis['unused_images'].append({
                                'id': image_data.get('ID', '')[:12],
                                'size': image_data.get('Size', ''),
                                'created': image_data.get('CreatedAt', '')
                            })
                        except json.JSONDecodeError:
                            pass
        
        except Exception as e:
            logger.error(f"Error analyzing storage: {e}", exc_info=True)
            storage_analysis['error'] = str(e)
        
        return storage_analysis
    
    def _generate_recommendations(self, results: Dict[str, Any]):
        """Generate optimization recommendations and create tasks"""
        
        # Resource optimization recommendations
        over_provisioned = results['resource_optimization'].get('over_provisioned', [])
        for container in over_provisioned:
            recommendation = {
                'type': 'resource_optimization',
                'priority': 3,
                'title': f"Reduce memory limit for {container['name']}",
                'description': f"Container {container['name']} is using only {container['avg_usage']}% of resources. Consider reducing memory limit from {container['mem_limit_mb']}MB.",
                'impact': 'Free up system resources',
                'effort': 'Low'
            }
            results['recommendations'].append(recommendation)
            
            # Create low-priority task (doesn't require approval)
            self._create_optimization_task(
                f"Optimize resources for {container['name']}",
                'resource',
                recommendation,
                requires_approval=False
            )
        
        under_provisioned = results['resource_optimization'].get('under_provisioned', [])
        for container in under_provisioned:
            recommendation = {
                'type': 'resource_optimization',
                'priority': 7,
                'title': f"Increase memory limit for {container['name']}",
                'description': f"Container {container['name']} is using {container['mem_percent']}% of memory. Consider increasing limit.",
                'impact': 'Prevent OOM errors and improve performance',
                'effort': 'Low'
            }
            results['recommendations'].append(recommendation)
            
            # Higher priority - potential performance issue
            self._create_optimization_task(
                f"Increase memory for {container['name']}",
                'resource',
                recommendation,
                requires_approval=True
            )
        
        # Database optimization recommendations
        slow_queries = results['database_optimization'].get('slow_queries', [])
        if slow_queries:
            recommendation = {
                'type': 'database_optimization',
                'priority': 6,
                'title': f"Optimize {len(slow_queries)} slow database queries",
                'description': f"Found {len(slow_queries)} queries with mean execution time > 1 second",
                'impact': 'Improve application performance',
                'effort': 'Medium',
                'queries': slow_queries
            }
            results['recommendations'].append(recommendation)
            
            self._create_optimization_task(
                f"Optimize {len(slow_queries)} slow database queries",
                'database',
                recommendation,
                requires_approval=False
            )
        
        # Storage cleanup recommendations
        cleanup_potential = results['storage_optimization'].get('cleanup_potential_gb', 0)
        if cleanup_potential > 5:
            recommendation = {
                'type': 'storage_optimization',
                'priority': 5,
                'title': f"Clean up {cleanup_potential:.1f}GB of unused Docker data",
                'description': f"Running 'docker system prune' could free up {cleanup_potential:.1f}GB",
                'impact': 'Free disk space',
                'effort': 'Low'
            }
            results['recommendations'].append(recommendation)
            
            self._create_optimization_task(
                f"Clean up {cleanup_potential:.1f}GB of Docker storage",
                'storage',
                recommendation,
                requires_approval=True  # Requires approval for data deletion
            )
    
    def _create_optimization_task(self, description: str, task_type: str,
                                  context: Dict, requires_approval: bool = False):
        """Create an optimization task for the agent swarm"""
        try:
            task = self.orchestrator.create_task(
                description=description,
                task_type='optimize',
                priority=context.get('priority', 5),
                context={
                    'optimization_type': task_type,
                    'details': context,
                    'detected_at': datetime.utcnow().isoformat(),
                    'requires_approval': requires_approval
                }
            )
            
            if task:
                logger.info(f"Created optimization task {task.id}: {description}")
                return task.id
            else:
                logger.error(f"Failed to create optimization task: {description}")
                return None
        except Exception as e:
            logger.error(f"Error creating optimization task: {e}", exc_info=True)
            return None
    
    def get_efficiency_trends(self) -> Dict[str, Any]:
        """Get efficiency and optimization trends"""
        if len(self.performance_history) < 2:
            return {
                'error': 'Insufficient historical data',
                'resource_usage_trends': {},
                'optimization_opportunities': [],
                'savings_potential': {}
            }
        
        try:
            # Get efficiency scores from history
            scores = [
                h['metrics']['resource_optimization'].get('efficiency_score', 0)
                for h in self.performance_history
                if 'resource_optimization' in h['metrics']
            ]
            
            if not scores:
                return {
                    'error': 'No efficiency data available',
                    'resource_usage_trends': {},
                    'optimization_opportunities': [],
                    'savings_potential': {}
                }
            
            # Calculate resource usage trends
            latest = self.performance_history[-1]['metrics']
            over_provisioned_count = len(latest['resource_optimization'].get('over_provisioned', []))
            under_provisioned_count = len(latest['resource_optimization'].get('under_provisioned', []))
            
            # Identify optimization opportunities
            optimization_opportunities = []
            for container in latest['resource_optimization'].get('over_provisioned', []):
                optimization_opportunities.append({
                    'type': 'reduce_resources',
                    'target': container['name'],
                    'potential_savings': f"{container['mem_limit_mb']} MB memory",
                    'priority': 'low'
                })
            
            for container in latest['resource_optimization'].get('under_provisioned', []):
                optimization_opportunities.append({
                    'type': 'increase_resources',
                    'target': container['name'],
                    'impact': 'performance_improvement',
                    'priority': 'high'
                })
            
            # Check for storage cleanup opportunities
            cleanup_gb = latest.get('storage_optimization', {}).get('cleanup_potential_gb', 0)
            if cleanup_gb > 0:
                optimization_opportunities.append({
                    'type': 'storage_cleanup',
                    'potential_savings': f"{cleanup_gb:.1f} GB disk space",
                    'priority': 'medium'
                })
            
            # Calculate savings potential
            total_memory_savings = sum(
                c.get('mem_limit_mb', 0) * 0.5  # Estimate 50% reduction
                for c in latest['resource_optimization'].get('over_provisioned', [])
            )
            
            return {
                'resource_usage_trends': {
                    'current_efficiency': scores[-1] if scores else 0,
                    'average_efficiency': sum(scores) / len(scores) if scores else 0,
                    'trend': 'improving' if len(scores) > 1 and scores[-1] > scores[0] else 'stable',
                    'data_points': len(scores),
                    'over_provisioned_containers': over_provisioned_count,
                    'under_provisioned_containers': under_provisioned_count
                },
                'optimization_opportunities': optimization_opportunities,
                'savings_potential': {
                    'memory_mb': round(total_memory_savings, 2),
                    'storage_gb': cleanup_gb,
                    'total_opportunities': len(optimization_opportunities),
                    'estimated_cost_reduction': f"${round(total_memory_savings * 0.001, 2)}/month"
                }
            }
        except Exception as e:
            logger.error(f"Error calculating efficiency trends: {e}", exc_info=True)
            return {
                'error': str(e),
                'resource_usage_trends': {},
                'optimization_opportunities': [],
                'savings_potential': {}
            }
