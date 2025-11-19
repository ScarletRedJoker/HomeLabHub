"""
Log Collector Worker
Collects logs from Docker containers and stores them in unified logging system
"""

import logging
import time
from datetime import datetime
from typing import List, Dict, Any, Optional
import docker
from celery import shared_task

from services.unified_logging_service import unified_logging_service

logger = logging.getLogger(__name__)


class LogCollector:
    """Collects logs from Docker containers"""
    
    CONTAINERS_TO_MONITOR = [
        'stream-bot',
        'discord-bot',
        'homelab-dashboard',
        'homelab-celery-worker',
        'discord-bot-db',
        'homelab-minio',
        'homelab-redis',
        'caddy',
        'homeassistant',
        'plex',
        'n8n'
    ]
    
    POLL_INTERVAL = 10
    BATCH_SIZE = 100
    
    def __init__(self):
        self.docker_client = None
        self.last_timestamps = {}
        self._init_docker()
    
    def _init_docker(self):
        """Initialize Docker client"""
        try:
            self.docker_client = docker.from_env()
            logger.info("Docker client initialized for log collection")
        except Exception as e:
            logger.error(f"Failed to initialize Docker client: {e}")
            self.docker_client = None
    
    def is_available(self) -> bool:
        """Check if collector is available"""
        return self.docker_client is not None and unified_logging_service.is_available()
    
    def get_container_logs(self, container_name: str, since: Optional[datetime] = None) -> List[str]:
        """
        Get logs from a Docker container
        
        Args:
            container_name: Name of the container
            since: Get logs since this timestamp
        
        Returns:
            List of log lines
        """
        if not self.docker_client:
            return []
        
        try:
            container = self.docker_client.containers.get(container_name)
            
            kwargs = {
                'stdout': True,
                'stderr': True,
                'tail': 1000,
                'timestamps': True
            }
            
            if since:
                kwargs['since'] = since
            
            logs = container.logs(**kwargs)
            
            if isinstance(logs, bytes):
                logs = logs.decode('utf-8', errors='ignore')
            
            return [line.strip() for line in logs.split('\n') if line.strip()]
        
        except docker.errors.NotFound:
            logger.debug(f"Container not found: {container_name}")
            return []
        except Exception as e:
            logger.error(f"Error getting logs from {container_name}: {e}")
            return []
    
    def parse_docker_log_line(self, log_line: str) -> Dict[str, Any]:
        """
        Parse a Docker log line with timestamp
        
        Args:
            log_line: Raw log line from Docker
        
        Returns:
            Dict with parsed timestamp and message
        """
        if ' ' not in log_line:
            return {
                'timestamp': datetime.utcnow(),
                'message': log_line
            }
        
        timestamp_str, message = log_line.split(' ', 1)
        
        try:
            timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
            timestamp = timestamp.replace(tzinfo=None)
        except Exception:
            timestamp = datetime.utcnow()
        
        return {
            'timestamp': timestamp,
            'message': message
        }
    
    def collect_logs_from_container(self, container_name: str) -> List[Dict[str, Any]]:
        """
        Collect and parse logs from a single container
        
        Args:
            container_name: Name of the container
        
        Returns:
            List of parsed log entries
        """
        since = self.last_timestamps.get(container_name)
        
        log_lines = self.get_container_logs(container_name, since)
        
        if not log_lines:
            return []
        
        parsed_logs = []
        latest_timestamp = since or datetime.min
        
        try:
            container = self.docker_client.containers.get(container_name)
            container_id = container.id
        except Exception:
            container_id = None
        
        for log_line in log_lines:
            parsed = self.parse_docker_log_line(log_line)
            
            if parsed['timestamp'] > latest_timestamp:
                latest_timestamp = parsed['timestamp']
            
            parsed_logs.append({
                'service': container_name,
                'container_id': container_id,
                'message': parsed['message'],
                'timestamp': parsed['timestamp'],
                'log_level': None,
                'extra_metadata': None
            })
        
        self.last_timestamps[container_name] = latest_timestamp
        
        return parsed_logs
    
    def collect_all_logs(self) -> int:
        """
        Collect logs from all monitored containers
        
        Returns:
            Number of logs collected
        """
        if not self.is_available():
            logger.warning("Log collector not available")
            return 0
        
        all_logs = []
        
        for container_name in self.CONTAINERS_TO_MONITOR:
            try:
                logs = self.collect_logs_from_container(container_name)
                all_logs.extend(logs)
            except Exception as e:
                logger.error(f"Error collecting logs from {container_name}: {e}")
                continue
        
        if not all_logs:
            return 0
        
        for i in range(0, len(all_logs), self.BATCH_SIZE):
            batch = all_logs[i:i + self.BATCH_SIZE]
            count = unified_logging_service.store_logs_batch(batch)
            logger.debug(f"Stored {count} logs in batch")
        
        logger.info(f"Collected {len(all_logs)} logs from {len(self.CONTAINERS_TO_MONITOR)} containers")
        return len(all_logs)


log_collector = LogCollector()


@shared_task(name='workers.log_collector.collect_container_logs')
def collect_container_logs():
    """
    Celery task to collect logs from all containers
    Runs periodically to aggregate logs
    """
    try:
        count = log_collector.collect_all_logs()
        logger.info(f"Log collection task completed: {count} logs collected")
        return {
            'success': True,
            'logs_collected': count,
            'timestamp': datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error in log collection task: {e}")
        return {
            'success': False,
            'error': str(e)
        }


@shared_task(name='workers.log_collector.rotate_old_logs')
def rotate_old_logs(retention_days: int = 30):
    """
    Celery task to rotate (delete) old logs
    
    Args:
        retention_days: Number of days to keep logs
    """
    try:
        result = unified_logging_service.rotate_logs(retention_days)
        if result.get('success'):
            logger.info(f"Log rotation completed: {result.get('deleted_count')} logs deleted")
        else:
            logger.error(f"Log rotation failed: {result.get('error')}")
        return result
    except Exception as e:
        logger.error(f"Error in log rotation task: {e}")
        return {
            'success': False,
            'error': str(e)
        }
