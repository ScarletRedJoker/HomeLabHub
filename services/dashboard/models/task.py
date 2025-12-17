from sqlalchemy import String, DateTime, Text, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, TYPE_CHECKING
from datetime import datetime
import uuid
import enum
from . import Base

if TYPE_CHECKING:
    from .workflow import Workflow

class TaskType(enum.Enum):
    dns_manual = "dns_manual"
    approval_required = "approval_required"
    verification = "verification"
    manual_remediation = "manual_remediation"
    configuration = "configuration"
    review = "review"
    deployment = "deployment"
    security = "security"

class TaskStatus(enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"
    dismissed = "dismissed"

class TaskPriority(enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"

class Task(Base):
    __tablename__ = 'tasks'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('workflows.id', ondelete='SET NULL'))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    task_type: Mapped[TaskType] = mapped_column(SQLEnum(TaskType))
    status: Mapped[TaskStatus] = mapped_column(SQLEnum(TaskStatus), default=TaskStatus.pending)
    priority: Mapped[TaskPriority] = mapped_column(SQLEnum(TaskPriority), default=TaskPriority.medium)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(255))
    instructions: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    sla_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    task_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    
    workflow: Mapped[Optional["Workflow"]] = relationship("Workflow", backref="tasks", foreign_keys=[workflow_id])
    
    def __repr__(self):
        return f"<Task(id={self.id}, title='{self.title}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'workflow_id': str(self.workflow_id) if self.workflow_id else None,
            'title': self.title,
            'description': self.description,
            'task_type': self.task_type.value,
            'status': self.status.value,
            'priority': self.priority.value,
            'assigned_to': self.assigned_to,
            'instructions': self.instructions,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'sla_deadline': self.sla_deadline.isoformat() if self.sla_deadline else None,
            'notes': self.notes,
            'task_metadata': self.task_metadata,
            'is_overdue': self.is_overdue
        }
    
    @property
    def is_overdue(self) -> bool:
        """Check if task is past its SLA deadline"""
        if not self.sla_deadline:
            return False
        if self.status in [TaskStatus.completed, TaskStatus.cancelled, TaskStatus.dismissed]:
            return False
        return datetime.now(self.sla_deadline.tzinfo) > self.sla_deadline
