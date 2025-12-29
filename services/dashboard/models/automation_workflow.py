"""
Automation Workflow Models
Visual workflow builder database models for drag-and-drop automation system
"""
from sqlalchemy import String, DateTime, Integer, Text, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List
from datetime import datetime
import uuid
import enum
from . import Base


class TriggerType(enum.Enum):
    MANUAL = "manual"
    WEBHOOK = "webhook"
    SCHEDULE = "schedule"
    EVENT = "event"


class ExecutionStatus(enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class AutomationWorkflow(Base):
    """Visual workflow definition with nodes and edges"""
    __tablename__ = 'visual_workflows'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    nodes_json: Mapped[dict] = mapped_column(JSON, default=list)
    edges_json: Mapped[dict] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    trigger_type: Mapped[TriggerType] = mapped_column(SQLEnum(TriggerType), default=TriggerType.MANUAL)
    trigger_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    last_run: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    executions: Mapped[List["WorkflowExecution"]] = relationship(
        "WorkflowExecution",
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="desc(WorkflowExecution.started_at)"
    )
    
    def __repr__(self):
        return f"<AutomationWorkflow(id={self.id}, name='{self.name}', enabled={self.enabled})>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'nodes': self.nodes_json or [],
            'edges': self.edges_json or [],
            'enabled': self.enabled,
            'trigger_type': self.trigger_type.value if self.trigger_type else 'manual',
            'trigger_config': self.trigger_config,
            'last_run': self.last_run.isoformat() if self.last_run else None,
            'run_count': self.run_count,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class WorkflowExecution(Base):
    """Execution history for automation workflows"""
    __tablename__ = 'visual_workflow_executions'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('visual_workflows.id', ondelete='CASCADE'),
        nullable=False
    )
    status: Mapped[ExecutionStatus] = mapped_column(SQLEnum(ExecutionStatus), default=ExecutionStatus.PENDING)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    result_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    trigger_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    node_results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    workflow: Mapped["AutomationWorkflow"] = relationship("AutomationWorkflow", back_populates="executions")
    
    def __repr__(self):
        return f"<WorkflowExecution(id={self.id}, status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'workflow_id': str(self.workflow_id),
            'status': self.status.value if self.status else 'pending',
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'result': self.result_json,
            'error': self.error,
            'trigger_data': self.trigger_data,
            'node_results': self.node_results,
            'duration_ms': self._calculate_duration()
        }
    
    def _calculate_duration(self) -> Optional[int]:
        if self.started_at and self.completed_at:
            delta = self.completed_at - self.started_at
            return int(delta.total_seconds() * 1000)
        return None
