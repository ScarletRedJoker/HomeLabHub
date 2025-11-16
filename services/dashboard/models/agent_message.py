"""
Agent Message Model - Communication between Jarvis and Replit Agent
Tracks inter-agent collaboration and task delegation
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from sqlalchemy.sql import func
from datetime import datetime
from models import Base


class AgentMessage(Base):
    """Messages between Jarvis and Replit Agent for collaboration"""
    __tablename__ = 'agent_messages'
    
    id = Column(Integer, primary_key=True)
    from_agent = Column(String(50), nullable=False)  # 'jarvis', 'replit_agent', 'user'
    to_agent = Column(String(50), nullable=False)   # 'jarvis', 'replit_agent', 'user'
    message_type = Column(String(30), nullable=False)  # 'task_delegation', 'status_update', 'request', 'response', 'notification'
    subject = Column(String(200))
    content = Column(Text, nullable=False)
    message_metadata = Column(JSON)  # Additional context like task_id, deployment_id, etc.
    status = Column(String(20), default='sent')  # 'sent', 'delivered', 'acknowledged', 'completed'
    priority = Column(String(20), default='normal')  # 'low', 'normal', 'high', 'urgent'
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'from_agent': self.from_agent,
            'to_agent': self.to_agent,
            'message_type': self.message_type,
            'subject': self.subject,
            'content': self.content,
            'metadata': self.message_metadata,
            'status': self.status,
            'priority': self.priority,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    @staticmethod
    def create_task_delegation(from_agent: str, to_agent: str, task: str, complexity: str = 'medium', metadata: dict = None):
        """Helper to create a task delegation message"""
        return AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type='task_delegation',
            subject=f'Task Delegation: {task[:50]}',
            content=task,
            message_metadata={
                'complexity': complexity,
                **(metadata or {})
            },
            priority='high' if complexity == 'high' else 'normal'
        )
    
    @staticmethod
    def create_status_update(from_agent: str, to_agent: str, status: str, task_id: str = None):
        """Helper to create a status update message"""
        return AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type='status_update',
            subject='Task Status Update',
            content=status,
            message_metadata={'task_id': task_id} if task_id else None
        )
    
    @staticmethod
    def create_response(from_agent: str, to_agent: str, response: str, original_message_id: int = None):
        """Helper to create a response message"""
        return AgentMessage(
            from_agent=from_agent,
            to_agent=to_agent,
            message_type='response',
            subject='Response',
            content=response,
            message_metadata={'original_message_id': original_message_id} if original_message_id else None
        )
    
    def __repr__(self):
        return f"<AgentMessage {self.from_agent} → {self.to_agent}: {self.subject}>"
