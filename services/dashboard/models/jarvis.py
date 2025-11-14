"""Jarvis Phase 2 database models"""
from sqlalchemy import String, Integer, BigInteger, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional
import uuid
from datetime import datetime
from . import Base

class Project(Base):
    """Detected projects from /home/evin/contain/"""
    __tablename__ = 'projects'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    path: Mapped[str] = mapped_column(Text)
    project_type: Mapped[str] = mapped_column(String(50))
    framework: Mapped[Optional[str]] = mapped_column(String(50))
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_scanned: Mapped[Optional[datetime]] = mapped_column(DateTime)
    config: Mapped[Optional[dict]] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(20), default='detected')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    builds = relationship("ArtifactBuild", back_populates="project", cascade="all, delete-orphan")
    compose_specs = relationship("ComposeSpec", back_populates="project", cascade="all, delete-orphan")
    ai_sessions = relationship("AISession", back_populates="target_project")
    
    def __repr__(self):
        return f"<Project(id={self.id}, name='{self.name}', status='{self.status}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'name': self.name,
            'path': self.path,
            'project_type': self.project_type,
            'framework': self.framework,
            'detected_at': self.detected_at.isoformat() if getattr(self, 'detected_at', None) is not None else None,
            'last_scanned': self.last_scanned.isoformat() if getattr(self, 'last_scanned', None) is not None else None,
            'config': self.config,
            'status': self.status,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'updated_at': self.updated_at.isoformat() if getattr(self, 'updated_at', None) is not None else None
        }

class ArtifactBuild(Base):
    """Docker image build tracking"""
    __tablename__ = 'artifact_builds'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='CASCADE'))
    workflow_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('workflows.id', ondelete='SET NULL'))
    status: Mapped[str] = mapped_column(String(20), default='pending')
    image_ref: Mapped[Optional[str]] = mapped_column(Text)
    image_tag: Mapped[Optional[str]] = mapped_column(String(100))
    dockerfile_content: Mapped[Optional[str]] = mapped_column(Text)
    build_logs: Mapped[Optional[str]] = mapped_column(Text)
    build_duration_ms: Mapped[Optional[int]] = mapped_column(Integer)
    image_size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger)
    build_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    project = relationship("Project", back_populates="builds")
    workflow = relationship("Workflow")
    
    def __repr__(self):
        return f"<ArtifactBuild(id={self.id}, status='{self.status}', image_ref='{self.image_ref}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'workflow_id': str(self.workflow_id) if getattr(self, 'workflow_id', None) is not None else None,
            'status': self.status,
            'image_ref': self.image_ref,
            'image_tag': self.image_tag,
            'dockerfile_content': self.dockerfile_content,
            'build_logs': self.build_logs,
            'build_duration_ms': self.build_duration_ms,
            'image_size_bytes': self.image_size_bytes,
            'build_metadata': self.build_metadata,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'completed_at': self.completed_at.isoformat() if getattr(self, 'completed_at', None) is not None else None
        }

class ComposeSpec(Base):
    """Versioned docker-compose.yml configurations"""
    __tablename__ = 'compose_specs'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='CASCADE'))
    version: Mapped[int] = mapped_column(Integer, default=1)
    yaml_content: Mapped[str] = mapped_column(Text)
    checksum: Mapped[str] = mapped_column(String(64))
    services: Mapped[Optional[dict]] = mapped_column(JSONB)
    networks: Mapped[Optional[dict]] = mapped_column(JSONB)
    volumes: Mapped[Optional[dict]] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    project = relationship("Project", back_populates="compose_specs")
    
    def __repr__(self):
        return f"<ComposeSpec(id={self.id}, version={self.version}, is_active={self.is_active})>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'version': self.version,
            'yaml_content': self.yaml_content,
            'checksum': self.checksum,
            'services': self.services,
            'networks': self.networks,
            'volumes': self.volumes,
            'is_active': self.is_active,
            'created_by': self.created_by,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None
        }

class SSLCertificate(Base):
    """SSL/TLS certificates"""
    __tablename__ = 'ssl_certificates'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    domain: Mapped[str] = mapped_column(String(255), unique=True)
    status: Mapped[str] = mapped_column(String(20), default='pending')
    provider: Mapped[str] = mapped_column(String(50), default='letsencrypt')
    cert_path: Mapped[Optional[str]] = mapped_column(Text)
    key_path: Mapped[Optional[str]] = mapped_column(Text)
    chain_path: Mapped[Optional[str]] = mapped_column(Text)
    issued_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)
    last_renewal_attempt: Mapped[Optional[datetime]] = mapped_column(DateTime)
    renewal_logs: Mapped[Optional[str]] = mapped_column(Text)
    cert_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<SSLCertificate(id={self.id}, domain='{self.domain}', status='{self.status}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'domain': self.domain,
            'status': self.status,
            'provider': self.provider,
            'cert_path': self.cert_path,
            'key_path': self.key_path,
            'chain_path': self.chain_path,
            'issued_at': self.issued_at.isoformat() if getattr(self, 'issued_at', None) is not None else None,
            'expires_at': self.expires_at.isoformat() if getattr(self, 'expires_at', None) is not None else None,
            'auto_renew': self.auto_renew,
            'last_renewal_attempt': self.last_renewal_attempt.isoformat() if getattr(self, 'last_renewal_attempt', None) is not None else None,
            'renewal_logs': self.renewal_logs,
            'cert_metadata': self.cert_metadata,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'updated_at': self.updated_at.isoformat() if getattr(self, 'updated_at', None) is not None else None
        }

class AISession(Base):
    """Conversational deployment sessions"""
    __tablename__ = 'ai_sessions'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[str]] = mapped_column(String(100))
    session_type: Mapped[str] = mapped_column(String(50), default='deployment')
    state: Mapped[str] = mapped_column(String(20), default='active')
    current_step: Mapped[Optional[str]] = mapped_column(String(100))
    context: Mapped[Optional[dict]] = mapped_column(JSONB)
    messages: Mapped[Optional[dict]] = mapped_column(JSONB)
    intent: Mapped[Optional[str]] = mapped_column(String(100))
    target_project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('projects.id', ondelete='SET NULL'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    target_project = relationship("Project", back_populates="ai_sessions")
    
    def __repr__(self):
        return f"<AISession(id={self.id}, state='{self.state}', intent='{self.intent}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'session_type': self.session_type,
            'state': self.state,
            'current_step': self.current_step,
            'context': self.context,
            'messages': self.messages,
            'intent': self.intent,
            'target_project_id': str(self.target_project_id) if getattr(self, 'target_project_id', None) is not None else None,
            'created_at': self.created_at.isoformat() if getattr(self, 'created_at', None) is not None else None,
            'updated_at': self.updated_at.isoformat() if getattr(self, 'updated_at', None) is not None else None,
            'completed_at': self.completed_at.isoformat() if getattr(self, 'completed_at', None) is not None else None
        }
