"""Multi-Agent Collaboration System Models"""
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional
import uuid
from datetime import datetime
from enum import Enum
from . import Base

class AgentType(str, Enum):
    """Types of specialized AI agents"""
    ORCHESTRATOR = "orchestrator"
    DATABASE = "database"
    NETWORK = "network"
    CONTAINER = "container"
    SECURITY = "security"

class AgentStatus(str, Enum):
    """Agent operational status"""
    IDLE = "idle"
    THINKING = "thinking"
    EXECUTING = "executing"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"

class Agent(Base):
    """Represents an AI agent in the swarm"""
    __tablename__ = 'agents'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default='gen_random_uuid()')
    agent_type: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    system_prompt: Mapped[Optional[str]] = mapped_column(Text)
    capabilities: Mapped[Optional[dict]] = mapped_column(JSONB)
    config: Mapped[Optional[dict]] = mapped_column(JSONB)
    model: Mapped[str] = mapped_column(String(50), default='gpt-3.5-turbo')
    status: Mapped[str] = mapped_column(String(20), default=AgentStatus.IDLE.value)
    current_task_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('agent_tasks.id', ondelete='SET NULL'))
    tasks_completed: Mapped[int] = mapped_column(Integer, default=0)
    tasks_failed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_active: Mapped[Optional[datetime]] = mapped_column(DateTime, default=datetime.utcnow)
    
    tasks: Mapped[list["AgentTask"]] = relationship("AgentTask", back_populates="agent", foreign_keys="AgentTask.assigned_agent_id")
    current_task: Mapped[Optional["AgentTask"]] = relationship("AgentTask", foreign_keys=[current_task_id])
    
    def __repr__(self):
        return f"<Agent(id={self.id}, name='{self.name}', type='{self.agent_type}', status='{self.status}')>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'agent_type': self.agent_type,
            'name': self.name,
            'description': self.description,
            'capabilities': self.capabilities,
            'model': self.model,
            'status': self.status,
            'current_task_id': self.current_task_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None
        }

class AgentTask(Base):
    """Represents a task assigned to agent(s)"""
    __tablename__ = 'agent_tasks'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_type: Mapped[str] = mapped_column(String(50), default='diagnose')
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=5)
    status: Mapped[str] = mapped_column(String(50), default='pending')
    assigned_agent_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('agents.id', ondelete='SET NULL'))
    parent_task_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('agent_tasks.id', ondelete='SET NULL'))
    
    context: Mapped[Optional[dict]] = mapped_column(JSONB)
    result: Mapped[Optional[dict]] = mapped_column(JSONB)
    execution_log: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    requires_collaboration: Mapped[bool] = mapped_column(Boolean, default=False)
    collaborating_agents: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approved_by: Mapped[Optional[str]] = mapped_column(String(100))
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    agent: Mapped[Optional["Agent"]] = relationship("Agent", back_populates="tasks", foreign_keys=[assigned_agent_id])
    subtasks: Mapped[list["AgentTask"]] = relationship("AgentTask", back_populates="parent_task", remote_side=[id])
    parent_task: Mapped[Optional["AgentTask"]] = relationship("AgentTask", back_populates="subtasks", remote_side=[parent_task_id])
    conversations: Mapped[list["AgentConversation"]] = relationship("AgentConversation", back_populates="task", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<AgentTask(id={self.id}, type='{self.task_type}', status='{self.status}')>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'task_type': self.task_type,
            'description': self.description,
            'priority': self.priority,
            'status': self.status,
            'assigned_agent_id': self.assigned_agent_id,
            'parent_task_id': self.parent_task_id,
            'context': self.context,
            'result': self.result,
            'execution_log': self.execution_log,
            'requires_collaboration': self.requires_collaboration,
            'collaborating_agents': self.collaborating_agents,
            'requires_approval': self.requires_approval,
            'approved': self.approved,
            'approved_by': self.approved_by,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }

class AgentConversation(Base):
    """Stores agent-to-agent conversations"""
    __tablename__ = 'agent_conversations'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(Integer, ForeignKey('agent_tasks.id', ondelete='CASCADE'), nullable=False)
    from_agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('agents.id', ondelete='CASCADE'), nullable=False)
    to_agent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('agents.id', ondelete='CASCADE'), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(50), default='consultation')
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    task: Mapped["AgentTask"] = relationship("AgentTask", back_populates="conversations")
    from_agent: Mapped["Agent"] = relationship("Agent", foreign_keys=[from_agent_id])
    to_agent: Mapped["Agent"] = relationship("Agent", foreign_keys=[to_agent_id])
    
    def __repr__(self):
        return f"<AgentConversation(id={self.id}, from={self.from_agent_id}, to={self.to_agent_id})>"
    
    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'from_agent_id': self.from_agent_id,
            'to_agent_id': self.to_agent_id,
            'message': self.message,
            'message_type': self.message_type,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }
