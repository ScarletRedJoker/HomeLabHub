"""Google Services Integration Database Models"""
from sqlalchemy import String, DateTime, Integer, Text, Boolean, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from datetime import datetime
import uuid
import enum
from . import Base


class ServiceConnectionStatus(enum.Enum):
    """Status of Google service connection"""
    connected = "connected"
    disconnected = "disconnected"
    error = "error"
    pending = "pending"


class AutomationStatus(enum.Enum):
    """Status of calendar automation"""
    active = "active"
    inactive = "inactive"
    error = "error"


class EmailNotificationStatus(enum.Enum):
    """Status of email notification"""
    pending = "pending"
    sent = "sent"
    failed = "failed"


class BackupStatus(enum.Enum):
    """Status of backup"""
    pending = "pending"
    uploading = "uploading"
    completed = "completed"
    failed = "failed"


class GoogleServiceStatus(Base):
    """Track connection status for each Google service"""
    __tablename__ = 'google_service_status'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    status: Mapped[ServiceConnectionStatus] = mapped_column(
        SQLEnum(ServiceConnectionStatus),
        default=ServiceConnectionStatus.disconnected
    )
    last_connected: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    connection_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def __repr__(self):
        return f"<GoogleServiceStatus(service='{self.service_name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'service_name': self.service_name,
            'status': self.status.value,
            'last_connected': self.last_connected.isoformat() if self.last_connected else None,
            'last_error': self.last_error,
            'error_count': self.error_count,
            'connection_metadata': self.connection_metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class CalendarAutomation(Base):
    """Map calendar events to Home Assistant automations"""
    __tablename__ = 'calendar_automations'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    calendar_id: Mapped[str] = mapped_column(String(255), default='primary')
    event_keywords: Mapped[list] = mapped_column(JSON, default=list)
    ha_automation_id: Mapped[Optional[str]] = mapped_column(String(255))
    ha_service_domain: Mapped[Optional[str]] = mapped_column(String(100))
    ha_service_name: Mapped[Optional[str]] = mapped_column(String(100))
    ha_service_data: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    lead_time_minutes: Mapped[int] = mapped_column(Integer, default=15)
    lag_time_minutes: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[AutomationStatus] = mapped_column(
        SQLEnum(AutomationStatus),
        default=AutomationStatus.active
    )
    last_triggered: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    trigger_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def __repr__(self):
        return f"<CalendarAutomation(name='{self.name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'calendar_id': self.calendar_id,
            'event_keywords': self.event_keywords,
            'ha_automation_id': self.ha_automation_id,
            'ha_service_domain': self.ha_service_domain,
            'ha_service_name': self.ha_service_name,
            'ha_service_data': self.ha_service_data,
            'lead_time_minutes': self.lead_time_minutes,
            'lag_time_minutes': self.lag_time_minutes,
            'status': self.status.value,
            'last_triggered': self.last_triggered.isoformat() if self.last_triggered else None,
            'trigger_count': self.trigger_count,
            'last_error': self.last_error,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class EmailNotification(Base):
    """Log sent email notifications"""
    __tablename__ = 'email_notifications'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(500), nullable=False)
    template_type: Mapped[str] = mapped_column(String(50), default='custom')
    status: Mapped[EmailNotificationStatus] = mapped_column(
        SQLEnum(EmailNotificationStatus),
        default=EmailNotificationStatus.pending
    )
    gmail_message_id: Mapped[Optional[str]] = mapped_column(String(255))
    gmail_thread_id: Mapped[Optional[str]] = mapped_column(String(255))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    email_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<EmailNotification(recipient='{self.recipient}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'recipient': self.recipient,
            'subject': self.subject,
            'template_type': self.template_type,
            'status': self.status.value,
            'gmail_message_id': self.gmail_message_id,
            'gmail_thread_id': self.gmail_thread_id,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'error_message': self.error_message,
            'retry_count': self.retry_count,
            'email_metadata': self.email_metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class DriveBackup(Base):
    """Track Google Drive backup history"""
    __tablename__ = 'drive_backups'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    drive_file_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    local_path: Mapped[Optional[str]] = mapped_column(String(1000))
    drive_folder_id: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[BackupStatus] = mapped_column(
        SQLEnum(BackupStatus),
        default=BackupStatus.pending
    )
    uploaded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    web_view_link: Mapped[Optional[str]] = mapped_column(String(1000))
    backup_type: Mapped[str] = mapped_column(String(100), default='manual')
    retention_days: Mapped[Optional[int]] = mapped_column(Integer)
    auto_delete_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    backup_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )
    
    def __repr__(self):
        return f"<DriveBackup(file_name='{self.file_name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'drive_file_id': self.drive_file_id,
            'file_name': self.file_name,
            'description': self.description,
            'file_size': self.file_size,
            'local_path': self.local_path,
            'drive_folder_id': self.drive_folder_id,
            'status': self.status.value,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'web_view_link': self.web_view_link,
            'backup_type': self.backup_type,
            'retention_days': self.retention_days,
            'auto_delete_at': self.auto_delete_at.isoformat() if self.auto_delete_at else None,
            'deleted': self.deleted,
            'error_message': self.error_message,
            'backup_metadata': self.backup_metadata,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
