"""Database Administration Models"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, BigInteger, DateTime, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class DBCredential(Base):
    """Database credentials (encrypted)"""
    __tablename__ = 'db_credentials'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    db_name = Column(String(255), nullable=False)
    username = Column(String(255), nullable=False)
    password_hash = Column(String(500), nullable=False)  # Encrypted
    host = Column(String(255), nullable=False, default='discord-bot-db')
    port = Column(Integer, nullable=False, default=5432)
    connection_string = Column(Text, nullable=True)  # Encrypted
    is_active = Column(Boolean, nullable=False, default=True)
    last_tested_at = Column(DateTime(timezone=True), nullable=True)
    test_status = Column(String(50), nullable=True)  # 'success', 'failed'
    credential_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    def to_dict(self, include_password=False):
        data = {
            'id': str(self.id),
            'db_name': self.db_name,
            'username': self.username,
            'host': self.host,
            'port': self.port,
            'is_active': self.is_active,
            'last_tested_at': self.last_tested_at.isoformat() if self.last_tested_at else None,
            'test_status': self.test_status,
            'credential_metadata': self.credential_metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_password:
            data['password_hash'] = self.password_hash
        return data


class DBBackupJob(Base):
    """Database backup job"""
    __tablename__ = 'db_backup_jobs'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    db_name = Column(String(255), nullable=False)
    backup_type = Column(String(50), nullable=False)  # 'full', 'schema_only', 'data_only'
    status = Column(String(50), nullable=False, default='pending')  # 'pending', 'running', 'completed', 'failed'
    storage_path = Column(String(1000), nullable=True)  # MinIO path
    file_size = Column(BigInteger, nullable=True)
    compression = Column(String(50), nullable=True)  # 'gzip', 'none'
    error_message = Column(Text, nullable=True)
    backup_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'db_name': self.db_name,
            'backup_type': self.backup_type,
            'status': self.status,
            'storage_path': self.storage_path,
            'file_size': self.file_size,
            'file_size_mb': round(self.file_size / (1024 * 1024), 2) if self.file_size else None,
            'compression': self.compression,
            'error_message': self.error_message,
            'backup_metadata': self.backup_metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'duration_seconds': (self.completed_at - self.started_at).total_seconds() if self.completed_at and self.started_at else None,
        }
