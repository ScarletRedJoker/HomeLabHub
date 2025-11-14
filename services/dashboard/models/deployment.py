from sqlalchemy import String, DateTime, Text, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional
from datetime import datetime
import uuid
import enum
from . import Base

class DeploymentStatus(enum.Enum):
    deploying = "deploying"
    running = "running"
    stopped = "stopped"
    failed = "failed"
    removed = "removed"

class HealthStatus(enum.Enum):
    healthy = "healthy"
    unhealthy = "unhealthy"
    unknown = "unknown"

class Deployment(Base):
    __tablename__ = 'deployments'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('workflows.id', ondelete='CASCADE'))
    artifact_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('artifacts.id', ondelete='SET NULL'))
    service_name: Mapped[str] = mapped_column(String(255))
    service_type: Mapped[str] = mapped_column(String(100))
    domain: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[DeploymentStatus] = mapped_column(SQLEnum(DeploymentStatus), default=DeploymentStatus.deploying)
    deployed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    configuration: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    health_status: Mapped[HealthStatus] = mapped_column(SQLEnum(HealthStatus), default=HealthStatus.unknown)
    last_health_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    rollout_strategy: Mapped[Optional[str]] = mapped_column(String(50), default='rolling')
    previous_deployment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('deployments.id', ondelete='SET NULL'))
    ssl_certificate_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('ssl_certificates.id', ondelete='SET NULL'))
    compose_spec_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('compose_specs.id', ondelete='SET NULL'))
    health_check_url: Mapped[Optional[str]] = mapped_column(Text)
    health_check_status: Mapped[Optional[str]] = mapped_column(String(20))
    
    workflow = relationship("Workflow", backref="deployments", foreign_keys=[workflow_id])
    artifact = relationship("Artifact", backref="deployments", foreign_keys=[artifact_id])
    previous_deployment = relationship("Deployment", remote_side=[id], foreign_keys=[previous_deployment_id])
    ssl_certificate = relationship("SSLCertificate", foreign_keys=[ssl_certificate_id])
    compose_spec = relationship("ComposeSpec", foreign_keys=[compose_spec_id])
    
    def __repr__(self):
        return f"<Deployment(id={self.id}, service_name='{self.service_name}', status='{self.status.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'workflow_id': str(self.workflow_id) if self.workflow_id else None,
            'artifact_id': str(self.artifact_id) if self.artifact_id else None,
            'service_name': self.service_name,
            'service_type': self.service_type,
            'domain': self.domain,
            'status': self.status.value if self.status else None,
            'deployed_at': self.deployed_at.isoformat() if self.deployed_at else None,
            'configuration': self.configuration,
            'health_status': self.health_status.value if self.health_status else None,
            'last_health_check': self.last_health_check.isoformat() if self.last_health_check else None,
            'rollout_strategy': self.rollout_strategy,
            'previous_deployment_id': str(self.previous_deployment_id) if self.previous_deployment_id else None,
            'ssl_certificate_id': str(self.ssl_certificate_id) if self.ssl_certificate_id else None,
            'compose_spec_id': str(self.compose_spec_id) if self.compose_spec_id else None,
            'health_check_url': self.health_check_url,
            'health_check_status': self.health_check_status
        }
