"""Unified Activity Feed database models"""
from sqlalchemy import String, Integer, DateTime, Text, Boolean, Index, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSON, ENUM
from sqlalchemy.orm import Mapped, mapped_column
import uuid
from datetime import datetime
import enum
from . import Base


class EventSeverity(enum.Enum):
    """Activity event severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    SUCCESS = "success"


class SourceService(enum.Enum):
    """Source service that generated the event"""
    DASHBOARD = "dashboard"
    DISCORD = "discord"
    STREAM = "stream"
    JARVIS = "jarvis"
    DOCKER = "docker"
    STUDIO = "studio"
    SYSTEM = "system"
    DEPLOYMENT = "deployment"
    MONITORING = "monitoring"


sourceservice_enum = ENUM(
    'dashboard', 'discord', 'stream', 'jarvis', 'docker', 'studio', 
    'system', 'deployment', 'monitoring',
    name='sourceservice',
    create_type=False
)

eventseverity_enum = ENUM(
    'info', 'warning', 'error', 'success',
    name='eventseverity',
    create_type=False
)


class ActivityEvent(Base):
    """Unified activity event for cross-service activity tracking"""
    __tablename__ = 'activity_events'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    source_service: Mapped[str] = mapped_column(
        sourceservice_enum,
        nullable=False,
        index=True
    )
    actor: Mapped[str] = mapped_column(String(255), nullable=True, index=True)
    target: Mapped[str] = mapped_column(String(255), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    event_metadata: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    severity: Mapped[str] = mapped_column(
        eventseverity_enum,
        default='info',
        nullable=False,
        index=True
    )
    user_id: Mapped[str] = mapped_column(String(255), nullable=True, index=True)
    icon: Mapped[str] = mapped_column(String(50), nullable=True, default='activity')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    year_month: Mapped[str] = mapped_column(String(7), nullable=True, index=True)
    
    __table_args__ = (
        Index('ix_activity_events_source_created', 'source_service', 'created_at'),
        Index('ix_activity_events_type_created', 'event_type', 'created_at'),
        Index('ix_activity_events_severity_created', 'severity', 'created_at'),
        Index('ix_activity_events_user_created', 'user_id', 'created_at'),
        Index('ix_activity_events_year_month', 'year_month'),
        Index('ix_activity_events_actor', 'actor'),
        Index('ix_activity_events_target', 'target'),
    )
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if self.created_at and not self.year_month:
            self.year_month = self.created_at.strftime('%Y-%m')
    
    def __repr__(self):
        return f"<ActivityEvent(id={self.id}, type='{self.event_type}', source='{self.source_service}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'event_type': self.event_type,
            'source_service': self.source_service,
            'actor': self.actor,
            'target': self.target,
            'title': self.title,
            'description': self.description,
            'metadata': self.event_metadata,
            'severity': self.severity or 'info',
            'user_id': self.user_id,
            'icon': self.icon or 'activity',
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'year_month': self.year_month
        }


class ActivitySubscription(Base):
    """User subscription preferences for activity feed"""
    __tablename__ = 'activity_subscriptions'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True, unique=True)
    event_types: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    source_services: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    severities: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<ActivitySubscription(id={self.id}, user_id='{self.user_id}', enabled={self.enabled})>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'event_types': self.event_types or [],
            'source_services': self.source_services or [],
            'severities': self.severities or [],
            'enabled': self.enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


__all__ = [
    'ActivityEvent',
    'ActivitySubscription', 
    'EventSeverity',
    'SourceService'
]
