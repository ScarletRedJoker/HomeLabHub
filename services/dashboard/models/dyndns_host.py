from sqlalchemy import String, DateTime, Integer, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from datetime import datetime
from . import Base


class DynDNSHost(Base):
    """Model for tracking DynDNS automation hosts"""
    __tablename__ = 'dyndns_hosts'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    zone: Mapped[str] = mapped_column(String(255), nullable=False)  # e.g., "example.com"
    fqdn: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)  # e.g., "nas.example.com"
    record_type: Mapped[str] = mapped_column(String(10), default='A')  # A or AAAA
    last_ip: Mapped[Optional[str]] = mapped_column(String(45))  # Last known IP
    check_interval_seconds: Mapped[int] = mapped_column(Integer, default=300)  # 5 minutes
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    failure_count: Mapped[int] = mapped_column(Integer, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        onupdate=func.now()
    )
    
    def __repr__(self):
        return f"<DynDNSHost(id={self.id}, fqdn='{self.fqdn}', last_ip='{self.last_ip}')>"
    
    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'zone': self.zone,
            'fqdn': self.fqdn,
            'record_type': self.record_type,
            'last_ip': self.last_ip,
            'check_interval_seconds': self.check_interval_seconds,
            'last_checked_at': self.last_checked_at.isoformat() if self.last_checked_at else None,
            'failure_count': self.failure_count,
            'enabled': self.enabled,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
