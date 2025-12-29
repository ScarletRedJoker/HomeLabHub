"""Monitoring Alerts database models - Threshold-based alerting system"""
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Boolean, Float, Enum as SQLEnum, Index
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, List
import uuid
from datetime import datetime
import enum
from . import Base


class AlertType(enum.Enum):
    CPU = "cpu"
    MEMORY = "memory"
    DISK = "disk"
    SERVICE = "service"
    CUSTOM = "custom"


class AlertCondition(enum.Enum):
    GREATER_THAN = "gt"
    LESS_THAN = "lt"
    EQUAL = "eq"
    NOT_EQUAL = "ne"
    GREATER_EQUAL = "gte"
    LESS_EQUAL = "lte"


class NotificationType(enum.Enum):
    DISCORD_WEBHOOK = "discord_webhook"
    EMAIL = "email"
    PUSH = "push"
    SLACK_WEBHOOK = "slack_webhook"


class MonitoringAlert(Base):
    """Monitoring alert rule definition"""
    __tablename__ = 'monitoring_alerts'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    alert_type: Mapped[AlertType] = mapped_column(
        SQLEnum(AlertType), 
        default=AlertType.CPU,
        nullable=False
    )
    condition: Mapped[AlertCondition] = mapped_column(
        SQLEnum(AlertCondition),
        default=AlertCondition.GREATER_THAN,
        nullable=False
    )
    threshold: Mapped[float] = mapped_column(Float, nullable=False, default=80.0)
    target: Mapped[Optional[str]] = mapped_column(String(255))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=5)
    last_triggered: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    trigger_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    notifications: Mapped[List["MonitoringAlertNotification"]] = relationship(
        "MonitoringAlertNotification", 
        back_populates="alert", 
        cascade="all, delete-orphan"
    )
    history: Mapped[List["MonitoringAlertHistory"]] = relationship(
        "MonitoringAlertHistory", 
        back_populates="alert", 
        cascade="all, delete-orphan"
    )
    
    __table_args__ = (
        Index('ix_monitoring_alerts_enabled', 'enabled'),
        Index('ix_monitoring_alerts_alert_type', 'alert_type'),
    )
    
    def __repr__(self):
        return f"<MonitoringAlert(id={self.id}, name='{self.name}', type='{self.alert_type.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'alert_type': self.alert_type.value if self.alert_type else None,
            'condition': self.condition.value if self.condition else None,
            'threshold': self.threshold,
            'target': self.target,
            'enabled': self.enabled,
            'cooldown_minutes': self.cooldown_minutes,
            'last_triggered': self.last_triggered.isoformat() if self.last_triggered else None,
            'trigger_count': self.trigger_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'notifications': [n.to_dict() for n in self.notifications] if self.notifications else [],
            'notification_count': len(self.notifications) if self.notifications else 0
        }


class MonitoringAlertNotification(Base):
    """Notification destination for a monitoring alert"""
    __tablename__ = 'monitoring_alert_notifications'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('monitoring_alerts.id', ondelete='CASCADE')
    )
    notification_type: Mapped[NotificationType] = mapped_column(
        SQLEnum(NotificationType),
        default=NotificationType.DISCORD_WEBHOOK,
        nullable=False
    )
    destination: Mapped[str] = mapped_column(String(512), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    alert: Mapped["MonitoringAlert"] = relationship("MonitoringAlert", back_populates="notifications")
    
    def __repr__(self):
        return f"<MonitoringAlertNotification(id={self.id}, type='{self.notification_type.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'alert_id': str(self.alert_id),
            'notification_type': self.notification_type.value if self.notification_type else None,
            'destination': self.destination,
            'enabled': self.enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class MonitoringAlertHistory(Base):
    """Alert trigger history record"""
    __tablename__ = 'monitoring_alert_history'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('monitoring_alerts.id', ondelete='CASCADE')
    )
    triggered_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    value: Mapped[float] = mapped_column(Float, nullable=True)
    threshold: Mapped[float] = mapped_column(Float, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    acknowledged_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notification_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    notification_result: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)
    
    alert: Mapped["MonitoringAlert"] = relationship("MonitoringAlert", back_populates="history")
    
    __table_args__ = (
        Index('ix_monitoring_alert_history_triggered_at', 'triggered_at'),
        Index('ix_monitoring_alert_history_acknowledged', 'acknowledged'),
    )
    
    def __repr__(self):
        return f"<MonitoringAlertHistory(id={self.id}, triggered_at='{self.triggered_at}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'alert_id': str(self.alert_id),
            'alert_name': self.alert.name if self.alert else None,
            'alert_type': self.alert.alert_type.value if self.alert and self.alert.alert_type else None,
            'triggered_at': self.triggered_at.isoformat() if self.triggered_at else None,
            'value': self.value,
            'threshold': self.threshold,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None,
            'acknowledged': self.acknowledged,
            'acknowledged_at': self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            'acknowledged_by': self.acknowledged_by,
            'notification_sent': self.notification_sent,
            'notification_result': self.notification_result
        }


__all__ = [
    'MonitoringAlert', 
    'MonitoringAlertNotification', 
    'MonitoringAlertHistory',
    'AlertType',
    'AlertCondition', 
    'NotificationType'
]
