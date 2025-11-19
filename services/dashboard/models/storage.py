"""Storage Monitoring Models"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, Float, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class StorageMetric(Base):
    """Storage usage metrics"""
    __tablename__ = 'storage_metrics'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    metric_type = Column(String(50), nullable=False)  # 'plex_media', 'docker_volume', 'postgres_db', 'minio_bucket'
    metric_name = Column(String(255), nullable=False)
    path = Column(String(1000), nullable=True)
    size_bytes = Column(BigInteger, nullable=False)
    file_count = Column(Integer, nullable=True)
    usage_percent = Column(Float, nullable=True)
    storage_metadata = Column(JSONB, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'metric_type': self.metric_type,
            'metric_name': self.metric_name,
            'path': self.path,
            'size_bytes': self.size_bytes,
            'size_mb': round(self.size_bytes / (1024 * 1024), 2),
            'size_gb': round(self.size_bytes / (1024 * 1024 * 1024), 2),
            'file_count': self.file_count,
            'usage_percent': self.usage_percent,
            'storage_metadata': self.storage_metadata,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
        }


class StorageAlert(Base):
    """Storage alert thresholds"""
    __tablename__ = 'storage_alerts'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    metric_type = Column(String(50), nullable=False)
    metric_name = Column(String(255), nullable=False)
    threshold_percent = Column(Float, nullable=False, default=80.0)
    alert_enabled = Column(Boolean, nullable=False, default=True)
    last_alerted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'metric_type': self.metric_type,
            'metric_name': self.metric_name,
            'threshold_percent': self.threshold_percent,
            'alert_enabled': self.alert_enabled,
            'last_alerted_at': self.last_alerted_at.isoformat() if self.last_alerted_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
