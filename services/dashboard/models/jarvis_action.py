"""Database model for Jarvis pending actions requiring approval"""

from sqlalchemy import String, Integer, Boolean, DateTime, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
import uuid
from datetime import datetime
from enum import Enum
from . import Base


class ActionStatus(str, Enum):
    """Status of a Jarvis action"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXECUTED = "executed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ActionType(str, Enum):
    """Type of Jarvis action"""
    COMMAND_EXECUTION = "command_execution"
    DEPLOYMENT = "deployment"
    CONFIGURATION_CHANGE = "configuration_change"
    SYSTEM_MODIFICATION = "system_modification"


class JarvisAction(Base):
    """Pending actions requiring user approval
    
    This table stores all Jarvis actions that require human-in-the-loop
    approval before execution. It provides audit trail and rollback capability.
    """
    __tablename__ = 'jarvis_actions'
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )
    
    action_type: Mapped[ActionType] = mapped_column(
        SQLEnum(ActionType),
        nullable=False,
        index=True
    )
    
    status: Mapped[ActionStatus] = mapped_column(
        SQLEnum(ActionStatus),
        default=ActionStatus.PENDING,
        nullable=False,
        index=True
    )
    
    command: Mapped[Optional[str]] = mapped_column(Text)
    
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    risk_level: Mapped[str] = mapped_column(String(20), nullable=False)
    
    requested_by: Mapped[str] = mapped_column(String(100), default="jarvis")
    
    requested_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    
    approved_by: Mapped[Optional[str]] = mapped_column(String(100))
    
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    rejected_by: Mapped[Optional[str]] = mapped_column(String(100))
    
    rejected_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    
    executed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    execution_result: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    execution_time_ms: Mapped[Optional[int]] = mapped_column(Integer)
    
    action_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    checkpoint_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    rollback_command: Mapped[Optional[str]] = mapped_column(Text)
    
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    auto_approve_after: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    requires_checkpoint: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )
    
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
    
    def __repr__(self):
        return (
            f"<JarvisAction(id={self.id}, "
            f"type='{self.action_type}', "
            f"status='{self.status}', "
            f"risk='{self.risk_level}')>"
        )
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': str(self.id),
            'action_type': self.action_type.value if self.action_type else None,
            'status': self.status.value if self.status else None,
            'command': self.command,
            'description': self.description,
            'risk_level': self.risk_level,
            'requested_by': self.requested_by,
            'requested_at': self.requested_at.isoformat() if self.requested_at else None,
            'approved_by': self.approved_by,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'rejected_by': self.rejected_by,
            'rejected_at': self.rejected_at.isoformat() if self.rejected_at else None,
            'rejection_reason': self.rejection_reason,
            'executed_at': self.executed_at.isoformat() if self.executed_at else None,
            'execution_result': self.execution_result,
            'execution_time_ms': self.execution_time_ms,
            'action_metadata': self.action_metadata,
            'checkpoint_data': self.checkpoint_data,
            'rollback_command': self.rollback_command,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'auto_approve_after': self.auto_approve_after.isoformat() if self.auto_approve_after else None,
            'requires_checkpoint': self.requires_checkpoint,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def can_approve(self) -> bool:
        """Check if action can be approved"""
        return self.status == ActionStatus.PENDING
    
    def can_reject(self) -> bool:
        """Check if action can be rejected"""
        return self.status == ActionStatus.PENDING
    
    def can_execute(self) -> bool:
        """Check if action can be executed"""
        return self.status == ActionStatus.APPROVED
    
    def is_expired(self) -> bool:
        """Check if action has expired"""
        if not self.expires_at:
            return False
        return datetime.utcnow() > self.expires_at
