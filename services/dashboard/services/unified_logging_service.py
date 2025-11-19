"""
Unified Logging Service
Centralized log collection and management for all homelab services
"""

import logging
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from sqlalchemy import select, func, and_, or_, delete, text
import docker

from services.db_service import db_service
from models.unified_log import UnifiedLog

logger = logging.getLogger(__name__)


class UnifiedLoggingService:
    """Service for managing unified logging across all services"""
    
    LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'WARNING', 'ERROR', 'FATAL', 'CRITICAL']
    LOG_RETENTION_DAYS = 30
    
    def __init__(self):
        self.docker_client = None
        self._init_docker()
    
    def _init_docker(self):
        """Initialize Docker client"""
        try:
            self.docker_client = docker.from_env()
            logger.info("Docker client initialized for log collection")
        except Exception as e:
            logger.warning(f"Failed to initialize Docker client: {e}")
            self.docker_client = None
    
    def is_available(self) -> bool:
        """Check if service is available"""
        return self.docker_client is not None and db_service.is_available
    
    def parse_log_level(self, message: str) -> str:
        """
        Extract log level from log message
        
        Args:
            message: Log message string
        
        Returns:
            Log level (DEBUG, INFO, WARN, ERROR, FATAL) or INFO as default
        """
        message_upper = message.upper()
        
        for level in self.LOG_LEVELS:
            if level in message_upper:
                if level == 'WARNING':
                    return 'WARN'
                elif level == 'CRITICAL':
                    return 'FATAL'
                return level
        
        return 'INFO'
    
    def parse_timestamp(self, log_line: str) -> Optional[datetime]:
        """
        Extract timestamp from log line
        
        Args:
            log_line: Raw log line
        
        Returns:
            Parsed datetime or None
        """
        timestamp_patterns = [
            r'\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}',
            r'\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2}',
            r'\w{3} \d{1,2} \d{2}:\d{2}:\d{2}',
        ]
        
        for pattern in timestamp_patterns:
            match = re.search(pattern, log_line)
            if match:
                timestamp_str = match.group(0)
                try:
                    for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y/%m/%d %H:%M:%S', '%b %d %H:%M:%S']:
                        try:
                            return datetime.strptime(timestamp_str, fmt)
                        except ValueError:
                            continue
                except Exception:
                    pass
        
        return None
    
    def store_log(self, service: str, message: str, container_id: Optional[str] = None,
                  log_level: Optional[str] = None, timestamp: Optional[datetime] = None,
                  extra_metadata: Optional[Dict] = None) -> bool:
        """
        Store a single log entry
        
        Args:
            service: Service name
            message: Log message
            container_id: Docker container ID
            log_level: Log level (auto-detected if None)
            timestamp: Log timestamp (current time if None)
            metadata: Additional metadata
        
        Returns:
            True if stored successfully
        """
        if not db_service.is_available:
            return False
        
        try:
            if log_level is None:
                log_level = self.parse_log_level(message)
            
            if timestamp is None:
                parsed_ts = self.parse_timestamp(message)
                timestamp = parsed_ts if parsed_ts else datetime.utcnow()
            
            log_entry = UnifiedLog(
                service=service,
                container_id=container_id,
                log_level=log_level,
                message=message,
                timestamp=timestamp,
                extra_metadata=extra_metadata
            )
            
            with db_service.get_session() as session:
                session.add(log_entry)
                session.commit()
            
            return True
        
        except Exception as e:
            logger.error(f"Error storing log: {e}")
            return False
    
    def store_logs_batch(self, log_entries: List[Dict[str, Any]]) -> int:
        """
        Store multiple log entries in a batch
        
        Args:
            log_entries: List of log entry dictionaries
        
        Returns:
            Number of logs successfully stored
        """
        if not db_service.is_available:
            return 0
        
        try:
            logs_to_insert = []
            
            for entry in log_entries:
                log_level = entry.get('log_level')
                if log_level is None:
                    log_level = self.parse_log_level(entry.get('message', ''))
                
                timestamp = entry.get('timestamp')
                if timestamp is None:
                    parsed_ts = self.parse_timestamp(entry.get('message', ''))
                    timestamp = parsed_ts if parsed_ts else datetime.utcnow()
                
                log = UnifiedLog(
                    service=entry['service'],
                    container_id=entry.get('container_id'),
                    log_level=log_level,
                    message=entry['message'],
                    timestamp=timestamp,
                    extra_metadata=entry.get('extra_metadata')
                )
                logs_to_insert.append(log)
            
            with db_service.get_session() as session:
                session.bulk_save_objects(logs_to_insert)
                session.commit()
            
            return len(logs_to_insert)
        
        except Exception as e:
            logger.error(f"Error storing batch logs: {e}")
            return 0
    
    def get_logs(self, service: Optional[str] = None, log_level: Optional[str] = None,
                 start_date: Optional[datetime] = None, end_date: Optional[datetime] = None,
                 search: Optional[str] = None, limit: int = 100, offset: int = 0) -> Dict[str, Any]:
        """
        Retrieve logs with filtering
        
        Args:
            service: Filter by service name
            log_level: Filter by log level
            start_date: Filter logs after this date
            end_date: Filter logs before this date
            search: Search in message content
            limit: Maximum number of logs to return
            offset: Offset for pagination
        
        Returns:
            Dict with logs and pagination info
        """
        if not db_service.is_available:
            return {'success': False, 'error': 'Database not available'}
        
        try:
            with db_service.get_session() as session:
                query = select(UnifiedLog)
                
                filters = []
                if service:
                    filters.append(UnifiedLog.service == service)
                if log_level:
                    filters.append(UnifiedLog.log_level == log_level.upper())
                if start_date:
                    filters.append(UnifiedLog.timestamp >= start_date)
                if end_date:
                    filters.append(UnifiedLog.timestamp <= end_date)
                if search:
                    filters.append(UnifiedLog.message.ilike(f'%{search}%'))
                
                if filters:
                    query = query.where(and_(*filters))
                
                count_query = select(func.count()).select_from(UnifiedLog)
                if filters:
                    count_query = count_query.where(and_(*filters))
                total = session.execute(count_query).scalar()
                
                query = query.order_by(UnifiedLog.timestamp.desc()).offset(offset).limit(limit)
                
                logs = session.execute(query).scalars().all()
                
                return {
                    'success': True,
                    'logs': [log.to_dict() for log in logs],
                    'pagination': {
                        'total': total,
                        'limit': limit,
                        'offset': offset,
                        'pages': (total + limit - 1) // limit if limit > 0 else 0
                    }
                }
        
        except Exception as e:
            logger.error(f"Error retrieving logs: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_log_stats(self) -> Dict[str, Any]:
        """
        Get log statistics by service and level
        
        Returns:
            Dict with statistics
        """
        if not db_service.is_available:
            return {'success': False, 'error': 'Database not available'}
        
        try:
            with db_service.get_session() as session:
                service_stats = session.execute(
                    select(
                        UnifiedLog.service,
                        UnifiedLog.log_level,
                        func.count(UnifiedLog.id).label('count')
                    ).group_by(UnifiedLog.service, UnifiedLog.log_level)
                ).all()
                
                stats_by_service = {}
                for service, level, count in service_stats:
                    if service not in stats_by_service:
                        stats_by_service[service] = {}
                    stats_by_service[service][level] = count
                
                total_logs = session.execute(
                    select(func.count()).select_from(UnifiedLog)
                ).scalar()
                
                oldest_log = session.execute(
                    select(UnifiedLog.timestamp).order_by(UnifiedLog.timestamp.asc()).limit(1)
                ).scalar()
                
                newest_log = session.execute(
                    select(UnifiedLog.timestamp).order_by(UnifiedLog.timestamp.desc()).limit(1)
                ).scalar()
                
                return {
                    'success': True,
                    'total_logs': total_logs,
                    'stats_by_service': stats_by_service,
                    'oldest_log': oldest_log.isoformat() if oldest_log else None,
                    'newest_log': newest_log.isoformat() if newest_log else None
                }
        
        except Exception as e:
            logger.error(f"Error getting log stats: {e}")
            return {'success': False, 'error': str(e)}
    
    def rotate_logs(self, retention_days: Optional[int] = None) -> Dict[str, Any]:
        """
        Delete logs older than retention period
        
        Args:
            retention_days: Number of days to keep (default: 30)
        
        Returns:
            Dict with deletion results
        """
        if not db_service.is_available:
            return {'success': False, 'error': 'Database not available'}
        
        if retention_days is None:
            retention_days = self.LOG_RETENTION_DAYS
        
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
            
            with db_service.get_session() as session:
                result = session.execute(
                    delete(UnifiedLog).where(UnifiedLog.timestamp < cutoff_date)
                )
                session.commit()
                deleted_count = result.rowcount
            
            logger.info(f"Log rotation: deleted {deleted_count} logs older than {cutoff_date}")
            
            return {
                'success': True,
                'deleted_count': deleted_count,
                'cutoff_date': cutoff_date.isoformat(),
                'retention_days': retention_days
            }
        
        except Exception as e:
            logger.error(f"Error rotating logs: {e}")
            return {'success': False, 'error': str(e)}


# Global service instance
unified_logging_service = UnifiedLoggingService()
