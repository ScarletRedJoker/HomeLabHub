"""
Notification Models
Alert and enhanced task tracking for human-in-the-loop operations
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, Index, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSON, ARRAY
from datetime import datetime
from models import Base
import enum


class AlertSeverity(enum.Enum):
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    SUCCESS = "success"
    CRITICAL = "critical"


class Alert(Base):
    """Alert notification for tracking system notifications"""
    __tablename__ = 'alerts'
    
    id = Column(Integer, primary_key=True)
    
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    severity = Column(String(20), nullable=False, default='info', index=True)
    
    channels_sent = Column(JSON, nullable=True, default=list)
    channel_results = Column(JSON, nullable=True, default=dict)
    
    source = Column(String(100), nullable=True, index=True)
    source_id = Column(String(255), nullable=True)
    
    read = Column(Boolean, default=False, index=True)
    dismissed = Column(Boolean, default=False, index=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    read_at = Column(DateTime, nullable=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_alerts_severity_read', 'severity', 'read'),
        Index('ix_alerts_created_at_read', 'created_at', 'read'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'message': self.message,
            'severity': self.severity,
            'channels_sent': self.channels_sent or [],
            'channel_results': self.channel_results or {},
            'source': self.source,
            'source_id': self.source_id,
            'read': self.read,
            'dismissed': self.dismissed,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'read_at': self.read_at.isoformat() if self.read_at else None,
            'metadata': self.metadata_json
        }
    
    @classmethod
    def create_alert(cls, title, message, severity='info', channels=None, source=None, source_id=None, metadata=None):
        """Factory method to create an alert"""
        return cls(
            title=title,
            message=message,
            severity=severity,
            channels_sent=channels or [],
            source=source,
            source_id=source_id,
            metadata_json=metadata
        )


class NotificationSettings(Base):
    """User notification preferences"""
    __tablename__ = 'notification_settings'
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String(100), nullable=False, unique=True, index=True)
    
    discord_enabled = Column(Boolean, default=True)
    email_enabled = Column(Boolean, default=False)
    web_enabled = Column(Boolean, default=True)
    
    discord_webhook = Column(String(500), nullable=True)
    email_address = Column(String(255), nullable=True)
    
    quiet_hours_enabled = Column(Boolean, default=False)
    quiet_hours_start = Column(String(5), nullable=True)
    quiet_hours_end = Column(String(5), nullable=True)
    
    default_sla_hours = Column(Integer, default=24)
    
    severity_filter = Column(JSON, nullable=True, default=lambda: ['warning', 'error', 'critical'])
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'discord_enabled': self.discord_enabled,
            'email_enabled': self.email_enabled,
            'web_enabled': self.web_enabled,
            'discord_webhook': self.discord_webhook,
            'email_address': self.email_address,
            'quiet_hours_enabled': self.quiet_hours_enabled,
            'quiet_hours_start': self.quiet_hours_start,
            'quiet_hours_end': self.quiet_hours_end,
            'default_sla_hours': self.default_sla_hours,
            'severity_filter': self.severity_filter or ['warning', 'error', 'critical'],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


__all__ = ['Alert', 'AlertSeverity', 'NotificationSettings']
