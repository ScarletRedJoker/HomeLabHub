"""Jarvis Website Builder database models"""
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, List, TYPE_CHECKING
import uuid
from datetime import datetime
import enum
from . import Base


class BuilderProjectStatus(enum.Enum):
    """Project build stages"""
    PLANNING = "planning"
    SCAFFOLDING = "scaffolding"
    BUILDING = "building"
    REVIEWING = "reviewing"
    DEPLOYING = "deploying"
    COMPLETE = "complete"
    FAILED = "failed"
    PAUSED = "paused"


class BuilderTechStack(enum.Enum):
    """Supported tech stacks"""
    STATIC_HTML = "static_html"
    FLASK = "flask"
    FASTAPI = "fastapi"
    EXPRESS = "express"
    REACT = "react"
    VUE = "vue"
    NEXTJS = "nextjs"


class CheckpointStatus(enum.Enum):
    """Checkpoint response status"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class BuilderProject(Base):
    """Website builder project"""
    __tablename__ = 'builder_projects'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text)
    domain: Mapped[Optional[str]] = mapped_column(String(255))
    preview_domain: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[BuilderProjectStatus] = mapped_column(
        SQLEnum(BuilderProjectStatus), 
        default=BuilderProjectStatus.PLANNING
    )
    tech_stack: Mapped[Optional[BuilderTechStack]] = mapped_column(
        SQLEnum(BuilderTechStack),
        default=None
    )
    project_path: Mapped[Optional[str]] = mapped_column(Text)
    plan: Mapped[Optional[dict]] = mapped_column(JSONB)
    features: Mapped[Optional[dict]] = mapped_column(JSONB)
    generated_files: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    ai_messages: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    current_step: Mapped[Optional[str]] = mapped_column(String(100))
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    build_logs: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deployed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    pages: Mapped[List["BuilderPage"]] = relationship(
        "BuilderPage", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    checkpoints: Mapped[List["BuilderCheckpoint"]] = relationship(
        "BuilderCheckpoint", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<BuilderProject(id={self.id}, name='{self.name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'domain': self.domain,
            'preview_domain': self.preview_domain,
            'status': self.status.value if self.status else None,
            'tech_stack': self.tech_stack.value if self.tech_stack else None,
            'project_path': self.project_path,
            'plan': self.plan,
            'features': self.features,
            'generated_files': self.generated_files,
            'ai_messages': self.ai_messages,
            'current_step': self.current_step,
            'error_message': self.error_message,
            'build_logs': self.build_logs,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'deployed_at': self.deployed_at.isoformat() if self.deployed_at else None,
            'pages': [p.to_dict() for p in self.pages] if self.pages else [],
            'checkpoints': [c.to_dict() for c in self.checkpoints] if self.checkpoints else []
        }


class BuilderPage(Base):
    """Generated page for a builder project"""
    __tablename__ = 'builder_pages'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('builder_projects.id', ondelete='CASCADE')
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    path: Mapped[str] = mapped_column(String(255), nullable=False)
    page_type: Mapped[str] = mapped_column(String(50), default='page')
    html_content: Mapped[Optional[str]] = mapped_column(Text)
    css_content: Mapped[Optional[str]] = mapped_column(Text)
    js_content: Mapped[Optional[str]] = mapped_column(Text)
    component_code: Mapped[Optional[str]] = mapped_column(Text)
    page_meta: Mapped[Optional[dict]] = mapped_column(JSONB)
    is_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    generation_prompt: Mapped[Optional[str]] = mapped_column(Text)
    generated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project: Mapped["BuilderProject"] = relationship("BuilderProject", back_populates="pages")
    
    def __repr__(self):
        return f"<BuilderPage(id={self.id}, name='{self.name}', path='{self.path}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'name': self.name,
            'path': self.path,
            'page_type': self.page_type,
            'html_content': self.html_content,
            'css_content': self.css_content,
            'js_content': self.js_content,
            'component_code': self.component_code,
            'page_meta': self.page_meta,
            'is_generated': self.is_generated,
            'generation_prompt': self.generation_prompt,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class BuilderCheckpoint(Base):
    """Human-in-the-loop checkpoint for project review"""
    __tablename__ = 'builder_checkpoints'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('builder_projects.id', ondelete='CASCADE')
    )
    stage: Mapped[str] = mapped_column(String(50), nullable=False)
    step_name: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[Optional[dict]] = mapped_column(JSONB)
    preview_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    status: Mapped[CheckpointStatus] = mapped_column(
        SQLEnum(CheckpointStatus),
        default=CheckpointStatus.PENDING
    )
    user_response: Mapped[Optional[str]] = mapped_column(Text)
    user_feedback: Mapped[Optional[str]] = mapped_column(Text)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    project: Mapped["BuilderProject"] = relationship("BuilderProject", back_populates="checkpoints")
    
    def __repr__(self):
        return f"<BuilderCheckpoint(id={self.id}, stage='{self.stage}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'stage': self.stage,
            'step_name': self.step_name,
            'message': self.message,
            'context': self.context,
            'preview_data': self.preview_data,
            'status': self.status.value if self.status else None,
            'user_response': self.user_response,
            'user_feedback': self.user_feedback,
            'responded_at': self.responded_at.isoformat() if self.responded_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
