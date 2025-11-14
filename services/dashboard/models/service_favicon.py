"""
Service Favicon Model
Stores custom favicon configurations for dashboard services.
"""
from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from . import Base

class ServiceFavicon(Base):
    """Model for storing service favicon configurations"""
    __tablename__ = 'service_favicons'
    
    service_id = Column(String(100), primary_key=True, nullable=False)
    favicon_filename = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    
    def __repr__(self):
        return f"<ServiceFavicon(service_id='{self.service_id}', favicon='{self.favicon_filename}')>"
    
    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'service_id': self.service_id,
            'favicon_filename': self.favicon_filename,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
