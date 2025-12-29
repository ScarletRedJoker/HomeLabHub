"""Nebula Studio database models - Project Workspace Manager"""
from sqlalchemy import String, Integer, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, List
import uuid
from datetime import datetime
import enum
from . import Base


class ProjectType(enum.Enum):
    """Project type categories"""
    GAME = "game"
    CLI = "cli"
    DESKTOP = "desktop"
    WEB = "web"
    AUTOMATION = "automation"


class ProjectLanguage(enum.Enum):
    """Supported programming languages"""
    PYTHON = "python"
    NODEJS = "nodejs"
    RUST = "rust"
    CPP = "cpp"
    CSHARP = "csharp"
    GDSCRIPT = "gdscript"
    TYPESCRIPT = "typescript"
    GO = "go"
    BASH = "bash"
    ELECTRON = "electron"
    TAURI = "tauri"
    UNITY = "unity"


class ProjectStatus(enum.Enum):
    """Project lifecycle status"""
    DRAFT = "draft"
    BUILDING = "building"
    READY = "ready"
    DEPLOYED = "deployed"


class BuildStatus(enum.Enum):
    """Build process status"""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"


class DeploymentTarget(enum.Enum):
    """Deployment target platforms"""
    DOCKER = "docker"
    KVM = "kvm"
    NATIVE = "native"
    TAILSCALE = "tailscale"


class DeploymentStatus(enum.Enum):
    """Deployment status"""
    PENDING = "pending"
    DEPLOYING = "deploying"
    ACTIVE = "active"
    STOPPED = "stopped"
    FAILED = "failed"


class StudioProject(Base):
    """Studio project - main project entity"""
    __tablename__ = 'studio_projects'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    project_type: Mapped[ProjectType] = mapped_column(
        SQLEnum(ProjectType), 
        default=ProjectType.WEB
    )
    language: Mapped[ProjectLanguage] = mapped_column(
        SQLEnum(ProjectLanguage),
        default=ProjectLanguage.PYTHON
    )
    status: Mapped[ProjectStatus] = mapped_column(
        SQLEnum(ProjectStatus),
        default=ProjectStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    files: Mapped[List["ProjectFile"]] = relationship(
        "ProjectFile", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    builds: Mapped[List["ProjectBuild"]] = relationship(
        "ProjectBuild", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    deployments: Mapped[List["ProjectDeployment"]] = relationship(
        "ProjectDeployment", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    
    def __repr__(self):
        return f"<StudioProject(id={self.id}, name='{self.name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'name': self.name,
            'description': self.description,
            'project_type': self.project_type.value if self.project_type else None,
            'language': self.language.value if self.language else None,
            'status': self.status.value if self.status else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'file_count': len(self.files) if self.files else 0,
            'build_count': len(self.builds) if self.builds else 0,
            'deployment_count': len(self.deployments) if self.deployments else 0
        }


class ProjectFile(Base):
    """Project file - source code and configuration files"""
    __tablename__ = 'project_files'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[Optional[str]] = mapped_column(Text)
    language: Mapped[Optional[str]] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="files")
    
    def __repr__(self):
        return f"<ProjectFile(id={self.id}, path='{self.file_path}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'file_path': self.file_path,
            'content': self.content,
            'language': self.language,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ProjectBuild(Base):
    """Project build - build process tracking"""
    __tablename__ = 'project_builds'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    build_type: Mapped[Optional[str]] = mapped_column(String(50))
    status: Mapped[BuildStatus] = mapped_column(
        SQLEnum(BuildStatus),
        default=BuildStatus.PENDING
    )
    output_path: Mapped[Optional[str]] = mapped_column(String(512))
    logs: Mapped[Optional[str]] = mapped_column(Text)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="builds")
    deployments: Mapped[List["ProjectDeployment"]] = relationship(
        "ProjectDeployment", 
        back_populates="build"
    )
    
    def __repr__(self):
        return f"<ProjectBuild(id={self.id}, status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'build_type': self.build_type,
            'status': self.status.value if self.status else None,
            'output_path': self.output_path,
            'logs': self.logs,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None
        }


class ProjectDeployment(Base):
    """Project deployment - deployment tracking"""
    __tablename__ = 'project_deployments'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('studio_projects.id', ondelete='CASCADE')
    )
    build_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        ForeignKey('project_builds.id', ondelete='SET NULL'),
        nullable=True
    )
    target: Mapped[DeploymentTarget] = mapped_column(
        SQLEnum(DeploymentTarget),
        default=DeploymentTarget.DOCKER
    )
    status: Mapped[DeploymentStatus] = mapped_column(
        SQLEnum(DeploymentStatus),
        default=DeploymentStatus.PENDING
    )
    target_host: Mapped[Optional[str]] = mapped_column(String(255))
    container_id: Mapped[Optional[str]] = mapped_column(String(64))
    service_name: Mapped[Optional[str]] = mapped_column(String(255))
    port: Mapped[Optional[int]] = mapped_column(Integer)
    logs: Mapped[Optional[str]] = mapped_column(Text)
    url: Mapped[Optional[str]] = mapped_column(String(512))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    project: Mapped["StudioProject"] = relationship("StudioProject", back_populates="deployments")
    build: Mapped[Optional["ProjectBuild"]] = relationship("ProjectBuild", back_populates="deployments")
    
    def __repr__(self):
        return f"<ProjectDeployment(id={self.id}, target='{self.target.value}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'project_id': str(self.project_id),
            'build_id': str(self.build_id) if self.build_id else None,
            'target': self.target.value if self.target else None,
            'status': self.status.value if self.status else None,
            'target_host': self.target_host,
            'container_id': self.container_id,
            'service_name': self.service_name,
            'port': self.port,
            'logs': self.logs,
            'url': self.url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
