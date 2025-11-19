from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from . import Base


class NASMount(Base):
    __tablename__ = 'nas_mounts'
    
    id = Column(Integer, primary_key=True)
    share_name = Column(String(255), nullable=False)
    mount_point = Column(String(512), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f'<NASMount {self.share_name} -> {self.mount_point}>'


class NASBackupJob(Base):
    __tablename__ = 'nas_backup_jobs'
    
    id = Column(Integer, primary_key=True)
    source_path = Column(String(512), nullable=False)
    dest_share = Column(String(255), nullable=False)
    backup_name = Column(String(255), nullable=False)
    status = Column(String(50), default='pending')  # pending, running, completed, failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f'<NASBackupJob {self.backup_name} - {self.status}>'
