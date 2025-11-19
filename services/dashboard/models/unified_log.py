"""Unified Logging Model - Centralized log storage for all services"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Index
from sqlalchemy.dialects.postgresql import JSON
from datetime import datetime

from models import Base


class UnifiedLog(Base):
    """
    Unified log storage model
    Stores logs from all Docker containers and services in a centralized table
    """
    __tablename__ = 'unified_logs'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    service = Column(String(100), nullable=False, index=True)
    container_id = Column(String(64), nullable=True)
    log_level = Column(String(20), nullable=False, index=True)
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime, nullable=False, index=True, default=datetime.utcnow)
    extra_metadata = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('idx_service_timestamp', 'service', 'timestamp'),
        Index('idx_log_level_timestamp', 'log_level', 'timestamp'),
        Index('idx_service_level_timestamp', 'service', 'log_level', 'timestamp'),
    )
    
    def __repr__(self):
        return f"<UnifiedLog(id={self.id}, service='{self.service}', level='{self.log_level}', timestamp={self.timestamp})>"
    
    def to_dict(self):
        """Convert log entry to dictionary"""
        return {
            'id': self.id,
            'service': self.service,
            'container_id': self.container_id,
            'log_level': self.log_level,
            'message': self.message,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'extra_metadata': self.extra_metadata
        }
