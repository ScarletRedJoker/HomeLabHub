from sqlalchemy import String, DateTime, Integer, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from datetime import datetime
import uuid
import enum
from . import Base

class WorkflowStatus(enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    paused = "paused"

class Workflow(Base):
    __tablename__ = 'workflows'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    status: Mapped[WorkflowStatus] = mapped_column(SQLEnum(WorkflowStatus), default=WorkflowStatus.pending)
    workflow_type: Mapped[str] = mapped_column(String(100))
    created_by: Mapped[str] = mapped_column(String(255))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    workflow_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    current_step: Mapped[Optional[str]] = mapped_column(String(255))
    total_steps: Mapped[Optional[int]] = mapped_column(Integer)
    
    def __repr__(self):
        return f"<Workflow(id={self.id}, name='{self.name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'status': self.status.value,
            'workflow_type': self.workflow_type,
            'created_by': self.created_by,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'error_message': self.error_message,
            'workflow_metadata': self.workflow_metadata,
            'current_step': self.current_step,
            'total_steps': self.total_steps
        }
