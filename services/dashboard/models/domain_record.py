from sqlalchemy import String, DateTime, Integer, Boolean, Enum as SQLEnum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship, Mapped, mapped_column
from typing import Optional, TYPE_CHECKING
from datetime import datetime
import uuid
import enum
from . import Base

if TYPE_CHECKING:
    from .deployment import Deployment

class RecordType(enum.Enum):
    A = "A"
    CNAME = "CNAME"
    TXT = "TXT"
    MX = "MX"
    AAAA = "AAAA"

class RecordStatus(enum.Enum):
    pending = "pending"
    active = "active"
    failed = "failed"
    removed = "removed"

class DomainRecord(Base):
    __tablename__ = 'domain_records'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    deployment_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey('deployments.id', ondelete='SET NULL'))
    domain: Mapped[str] = mapped_column(String(255))
    subdomain: Mapped[str] = mapped_column(String(255))
    record_type: Mapped[RecordType] = mapped_column(SQLEnum(RecordType))
    record_value: Mapped[str] = mapped_column(String(512))
    ttl: Mapped[int] = mapped_column(Integer, default=3600)
    auto_managed: Mapped[bool] = mapped_column(Boolean, default=False)
    dns_provider: Mapped[str] = mapped_column(String(100))
    status: Mapped[RecordStatus] = mapped_column(SQLEnum(RecordStatus), default=RecordStatus.pending)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    record_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    managed_by: Mapped[Optional[str]] = mapped_column(String(20), default='automatic')
    verification_token: Mapped[Optional[str]] = mapped_column(String(255))
    priority: Mapped[Optional[int]] = mapped_column(Integer)
    provider: Mapped[Optional[str]] = mapped_column(String(50))
    provider_record_id: Mapped[Optional[str]] = mapped_column(String(255))
    last_verified: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    deployment: Mapped[Optional["Deployment"]] = relationship("Deployment", backref="domain_records", foreign_keys=[deployment_id])
    
    def __repr__(self):
        return f"<DomainRecord(id={self.id}, domain='{self.domain}', subdomain='{self.subdomain}', type='{self.record_type.value}')>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'deployment_id': str(self.deployment_id) if self.deployment_id else None,
            'domain': self.domain,
            'subdomain': self.subdomain,
            'record_type': self.record_type.value if self.record_type else None,
            'record_value': self.record_value,
            'ttl': self.ttl,
            'auto_managed': self.auto_managed,
            'dns_provider': self.dns_provider,
            'status': self.status.value if self.status else None,
            'verified_at': self.verified_at.isoformat() if self.verified_at else None,
            'record_metadata': self.record_metadata,
            'managed_by': self.managed_by,
            'verification_token': self.verification_token,
            'priority': self.priority,
            'provider': self.provider,
            'provider_record_id': self.provider_record_id,
            'last_verified': self.last_verified.isoformat() if self.last_verified else None
        }
