"""Unified Activity Service - Cross-service activity logging and real-time feed"""
import logging
from datetime import datetime, timedelta
from collections import deque
from threading import Lock
from typing import Optional, List, Dict, Any
import json
import queue

logger = logging.getLogger(__name__)


class SSEClient:
    """Server-Sent Events client connection"""
    def __init__(self, client_id: str):
        self.client_id = client_id
        self.queue = queue.Queue()
        self.connected = True
    
    def send(self, data: dict):
        if self.connected:
            self.queue.put(data)
    
    def disconnect(self):
        self.connected = False


class ActivityService:
    """Unified activity service with database persistence and SSE support"""
    
    EVENT_ICONS = {
        'deployment': 'rocket-takeoff',
        'container_start': 'play-circle',
        'container_stop': 'stop-circle',
        'container_restart': 'arrow-repeat',
        'container_error': 'exclamation-triangle',
        'build': 'hammer',
        'build_success': 'check-circle',
        'build_failed': 'x-circle',
        'service_health': 'heart-pulse',
        'service_up': 'arrow-up-circle',
        'service_down': 'arrow-down-circle',
        'alert': 'bell',
        'warning': 'exclamation-circle',
        'error': 'x-octagon',
        'user_action': 'person',
        'ai_response': 'robot',
        'code_generation': 'code-slash',
        'file_upload': 'cloud-upload',
        'backup': 'archive',
        'restore': 'cloud-download',
        'config_change': 'gear',
        'login': 'box-arrow-in-right',
        'logout': 'box-arrow-right',
        'discord_event': 'discord',
        'stream_event': 'broadcast',
        'studio_event': 'terminal',
        'monitoring': 'activity',
        'default': 'info-circle'
    }
    
    def __init__(self, max_activities=100):
        self.max_activities = max_activities
        self.activities = deque(maxlen=max_activities)
        self.lock = Lock()
        self.sse_clients: Dict[str, SSEClient] = {}
        self.sse_lock = Lock()
    
    def _get_db_session(self):
        """Get database session with error handling"""
        try:
            from services.db_service import db_service
            if not db_service.is_available:
                return None
            return db_service.get_session()
        except Exception as e:
            logger.error(f"Database error: {e}")
            return None
    
    def get_icon(self, event_type: str) -> str:
        """Get Bootstrap icon class for event type"""
        return self.EVENT_ICONS.get(event_type, self.EVENT_ICONS['default'])
    
    def log_activity(self, activity_type: str, message: str, icon: str = None, level: str = 'info'):
        """Legacy method - log activity to in-memory store (backwards compatible)"""
        with self.lock:
            activity = {
                'timestamp': datetime.now().isoformat(),
                'type': activity_type,
                'message': message,
                'icon': icon or self.get_icon(activity_type),
                'level': level,
                'time_ago': 'just now'
            }
            self.activities.appendleft(activity)
            logger.info(f"Activity logged: {activity_type} - {message}")
    
    def log_event(
        self,
        event_type: str,
        source_service: str,
        title: str,
        description: str = None,
        metadata: dict = None,
        severity: str = 'info',
        user_id: str = None,
        icon: str = None,
        actor: str = None,
        target: str = None
    ) -> Optional[Dict[str, Any]]:
        """Log unified activity event to database"""
        try:
            from models.activity import ActivityEvent, EventSeverity, SourceService
            
            valid_severities = ['info', 'warning', 'error', 'success']
            severity_val = severity.lower() if severity and severity.lower() in valid_severities else 'info'
            
            valid_sources = ['dashboard', 'discord', 'stream', 'jarvis', 'docker', 'studio', 'system', 'deployment', 'monitoring']
            source_val = source_service.lower() if source_service and source_service.lower() in valid_sources else 'dashboard'
            
            event_actor = actor or (metadata.get('actor') if metadata else None) or user_id
            event_target = target or (metadata.get('target') if metadata else None)
            
            session_ctx = self._get_db_session()
            if not session_ctx:
                self.log_activity(event_type, title, icon, severity)
                return {'success': True, 'fallback': 'in_memory'}
            
            with session_ctx as session:
                event = ActivityEvent(
                    event_type=event_type,
                    source_service=source_val,
                    title=title,
                    description=description,
                    event_metadata=metadata or {},
                    severity=severity_val,
                    user_id=user_id,
                    icon=icon or self.get_icon(event_type),
                    actor=event_actor,
                    target=event_target
                )
                session.add(event)
                session.flush()
                event_dict = event.to_dict()
            
            self.log_activity(event_type, title, icon or self.get_icon(event_type), severity)
            self._broadcast_event(event_dict)
            
            return event_dict
            
        except Exception as e:
            logger.error(f"Error logging event: {e}")
            self.log_activity(event_type, title, icon, severity)
            return None
    
    def get_events(
        self,
        limit: int = 50,
        offset: int = 0,
        source_service: str = None,
        event_type: str = None,
        severity: str = None,
        user_id: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        search: str = None
    ) -> Dict[str, Any]:
        """Query events with filters and pagination"""
        try:
            from models.activity import ActivityEvent, EventSeverity, SourceService
            
            session_ctx = self._get_db_session()
            if not session_ctx:
                return {
                    'events': self.get_recent_activities(limit),
                    'total': len(self.activities),
                    'limit': limit,
                    'offset': offset,
                    'fallback': 'in_memory'
                }
            
            with session_ctx as session:
                query = session.query(ActivityEvent)
                
                if source_service:
                    for src in SourceService:
                        if src.value == source_service:
                            query = query.filter(ActivityEvent.source_service == src)
                            break
                
                if event_type:
                    query = query.filter(ActivityEvent.event_type == event_type)
                
                if severity:
                    for s in EventSeverity:
                        if s.value == severity:
                            query = query.filter(ActivityEvent.severity == s)
                            break
                
                if user_id:
                    query = query.filter(ActivityEvent.user_id == user_id)
                
                if start_date:
                    query = query.filter(ActivityEvent.created_at >= start_date)
                
                if end_date:
                    query = query.filter(ActivityEvent.created_at <= end_date)
                
                if search:
                    search_term = f"%{search}%"
                    query = query.filter(
                        (ActivityEvent.title.ilike(search_term)) |
                        (ActivityEvent.description.ilike(search_term)) |
                        (ActivityEvent.event_type.ilike(search_term))
                    )
                
                total = query.count()
                
                events = query.order_by(ActivityEvent.created_at.desc()).offset(offset).limit(limit).all()
                
                return {
                    'events': [e.to_dict() for e in events],
                    'total': total,
                    'limit': limit,
                    'offset': offset,
                    'has_more': (offset + limit) < total
                }
                
        except Exception as e:
            logger.error(f"Error querying events: {e}")
            return {
                'events': self.get_recent_activities(limit),
                'total': len(self.activities),
                'limit': limit,
                'offset': offset,
                'error': str(e)
            }
    
    def get_events_grouped_by_date(
        self,
        limit: int = 100,
        source_service: str = None,
        severity: str = None,
        event_type: str = None,
        start_date: datetime = None,
        end_date: datetime = None,
        search: str = None
    ) -> Dict[str, List[Dict]]:
        """Get events grouped by date for timeline view"""
        result = self.get_events(
            limit=limit,
            source_service=source_service,
            severity=severity,
            event_type=event_type,
            start_date=start_date,
            end_date=end_date,
            search=search
        )
        
        grouped = {}
        for event in result.get('events', []):
            created_at = event.get('created_at', '')
            if created_at:
                try:
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    date_key = dt.strftime('%Y-%m-%d')
                    
                    if date_key not in grouped:
                        grouped[date_key] = {
                            'date': date_key,
                            'display_date': self._format_date_label(dt),
                            'events': []
                        }
                    
                    event['time_display'] = dt.strftime('%H:%M')
                    event['time_ago'] = self._get_time_ago(dt)
                    grouped[date_key]['events'].append(event)
                except:
                    pass
        
        return {
            'grouped': list(grouped.values()),
            'total': result.get('total', 0)
        }
    
    def _format_date_label(self, dt: datetime) -> str:
        """Format date for display (Today, Yesterday, or full date)"""
        today = datetime.now().date()
        event_date = dt.date()
        
        if event_date == today:
            return 'Today'
        elif event_date == today - timedelta(days=1):
            return 'Yesterday'
        elif (today - event_date).days < 7:
            return dt.strftime('%A')
        else:
            return dt.strftime('%B %d, %Y')
    
    def _get_time_ago(self, dt: datetime) -> str:
        """Get human-readable time ago string"""
        now = datetime.now()
        if dt.tzinfo:
            dt = dt.replace(tzinfo=None)
        
        diff = now - dt
        seconds = diff.total_seconds()
        
        if seconds < 60:
            return 'just now'
        elif seconds < 3600:
            mins = int(seconds / 60)
            return f'{mins}m ago'
        elif seconds < 86400:
            hours = int(seconds / 3600)
            return f'{hours}h ago'
        else:
            days = int(seconds / 86400)
            return f'{days}d ago'
    
    def get_recent_activities(self, limit: int = 20) -> List[Dict]:
        """Legacy method - get recent activities from in-memory store"""
        with self.lock:
            activities_list = list(self.activities)[:limit]
            
            for activity in activities_list:
                try:
                    activity_time = datetime.fromisoformat(activity['timestamp'])
                    activity['time_ago'] = self._get_time_ago(activity_time)
                except:
                    activity['time_ago'] = 'unknown'
            
            return activities_list
    
    def clear_activities(self):
        """Clear in-memory activities"""
        with self.lock:
            self.activities.clear()
            logger.info("Activity log cleared")
    
    def register_sse_client(self, client_id: str) -> SSEClient:
        """Register a new SSE client for real-time updates"""
        with self.sse_lock:
            client = SSEClient(client_id)
            self.sse_clients[client_id] = client
            logger.info(f"SSE client registered: {client_id}")
            return client
    
    def unregister_sse_client(self, client_id: str):
        """Unregister SSE client"""
        with self.sse_lock:
            if client_id in self.sse_clients:
                self.sse_clients[client_id].disconnect()
                del self.sse_clients[client_id]
                logger.info(f"SSE client unregistered: {client_id}")
    
    def _broadcast_event(self, event: Dict):
        """Broadcast event to all SSE clients"""
        with self.sse_lock:
            disconnected = []
            for client_id, client in self.sse_clients.items():
                try:
                    if client.connected:
                        client.send(event)
                    else:
                        disconnected.append(client_id)
                except Exception as e:
                    logger.error(f"Error broadcasting to client {client_id}: {e}")
                    disconnected.append(client_id)
            
            for client_id in disconnected:
                del self.sse_clients[client_id]
    
    def get_event_types(self) -> List[str]:
        """Get list of distinct event types"""
        try:
            from models.activity import ActivityEvent
            
            session_ctx = self._get_db_session()
            if not session_ctx:
                return list(self.EVENT_ICONS.keys())
            
            with session_ctx as session:
                types = session.query(ActivityEvent.event_type).distinct().all()
                return [t[0] for t in types if t[0]]
        except Exception as e:
            logger.error(f"Error getting event types: {e}")
            return list(self.EVENT_ICONS.keys())
    
    def get_statistics(self) -> Dict[str, Any]:
        """Get activity statistics"""
        try:
            from models.activity import ActivityEvent, EventSeverity, SourceService
            from sqlalchemy import func
            
            session_ctx = self._get_db_session()
            if not session_ctx:
                return {
                    'total': len(self.activities),
                    'by_severity': {},
                    'by_source': {}
                }
            
            with session_ctx as session:
                total = session.query(func.count(ActivityEvent.id)).scalar() or 0
                
                today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
                today_count = session.query(func.count(ActivityEvent.id)).filter(
                    ActivityEvent.created_at >= today
                ).scalar() or 0
                
                by_severity = {}
                for severity in EventSeverity:
                    count = session.query(func.count(ActivityEvent.id)).filter(
                        ActivityEvent.severity == severity
                    ).scalar() or 0
                    by_severity[severity.value] = count
                
                by_source = {}
                for source in SourceService:
                    count = session.query(func.count(ActivityEvent.id)).filter(
                        ActivityEvent.source_service == source
                    ).scalar() or 0
                    by_source[source.value] = count
                
                return {
                    'total': total,
                    'today': today_count,
                    'by_severity': by_severity,
                    'by_source': by_source
                }
        except Exception as e:
            logger.error(f"Error getting statistics: {e}")
            return {'error': str(e)}


activity_service = ActivityService()


def log_jarvis_event(event_type: str, title: str, description: str = None, metadata: dict = None, severity: str = 'info'):
    """Helper to log Jarvis AI events"""
    return activity_service.log_event(
        event_type=event_type,
        source_service='jarvis',
        title=title,
        description=description,
        metadata=metadata,
        severity=severity,
        icon=activity_service.get_icon(event_type)
    )


def log_docker_event(event_type: str, title: str, container_name: str = None, description: str = None, severity: str = 'info'):
    """Helper to log Docker events"""
    metadata = {}
    if container_name:
        metadata['container_name'] = container_name
    
    return activity_service.log_event(
        event_type=event_type,
        source_service='docker',
        title=title,
        description=description,
        metadata=metadata,
        severity=severity,
        icon=activity_service.get_icon(event_type)
    )


def log_studio_event(event_type: str, title: str, project_name: str = None, description: str = None, severity: str = 'info'):
    """Helper to log Studio events"""
    metadata = {}
    if project_name:
        metadata['project_name'] = project_name
    
    return activity_service.log_event(
        event_type=event_type,
        source_service='studio',
        title=title,
        description=description,
        metadata=metadata,
        severity=severity,
        icon=activity_service.get_icon(event_type)
    )


def log_deployment_event(event_type: str, title: str, service_name: str = None, description: str = None, severity: str = 'info'):
    """Helper to log deployment events"""
    metadata = {}
    if service_name:
        metadata['service_name'] = service_name
    
    return activity_service.log_event(
        event_type=event_type,
        source_service='deployment',
        title=title,
        description=description,
        metadata=metadata,
        severity=severity,
        icon=activity_service.get_icon(event_type)
    )


def log_discord_event(event_type: str, title: str, guild_name: str = None, description: str = None, severity: str = 'info'):
    """Helper to log Discord bot events"""
    metadata = {}
    if guild_name:
        metadata['guild_name'] = guild_name
    
    return activity_service.log_event(
        event_type=event_type,
        source_service='discord',
        title=title,
        description=description,
        metadata=metadata,
        severity=severity,
        icon='discord'
    )


def log_stream_event(event_type: str, title: str, platform: str = None, description: str = None, severity: str = 'info'):
    """Helper to log Stream bot events"""
    metadata = {}
    if platform:
        metadata['platform'] = platform
    
    return activity_service.log_event(
        event_type=event_type,
        source_service='stream',
        title=title,
        description=description,
        metadata=metadata,
        severity=severity,
        icon='broadcast'
    )


def log_monitoring_event(event_type: str, title: str, metric_name: str = None, value: float = None, description: str = None, severity: str = 'info'):
    """Helper to log monitoring events"""
    metadata = {}
    if metric_name:
        metadata['metric_name'] = metric_name
    if value is not None:
        metadata['value'] = value
    
    return activity_service.log_event(
        event_type=event_type,
        source_service='monitoring',
        title=title,
        description=description,
        metadata=metadata,
        severity=severity,
        icon='activity'
    )
