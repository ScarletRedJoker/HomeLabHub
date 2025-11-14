from sqlalchemy import String, DateTime, BigInteger, Boolean, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from datetime import datetime
import uuid
import enum
from . import Base

class FileType(enum.Enum):
    zip = "zip"
    tar = "tar"
    directory = "directory"
    single_file = "single_file"

class AnalysisStatus(enum.Enum):
    pending = "pending"
    analyzing = "analyzing"
    complete = "complete"
    failed = "failed"

class Artifact(Base):
    __tablename__ = 'artifacts'
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[FileType] = mapped_column(SQLEnum(FileType))
    storage_path: Mapped[str] = mapped_column(String(512))
    file_size: Mapped[int] = mapped_column(BigInteger)
    checksum_sha256: Mapped[str] = mapped_column(String(64))
    uploaded_by: Mapped[str] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    detected_service_type: Mapped[Optional[str]] = mapped_column(String(100))
    analysis_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    artifact_metadata: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    
    analysis_status: Mapped[AnalysisStatus] = mapped_column(SQLEnum(AnalysisStatus), default=AnalysisStatus.pending)
    analysis_result: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    detected_framework: Mapped[Optional[str]] = mapped_column(String(100))
    requires_database: Mapped[bool] = mapped_column(Boolean, default=False)
    
    def __repr__(self):
        return f"<Artifact(id={self.id}, filename='{self.filename}', size={self.file_size})>"
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'filename': self.filename,
            'original_filename': self.original_filename,
            'file_type': self.file_type.value,
            'storage_path': self.storage_path,
            'file_size': self.file_size,
            'checksum_sha256': self.checksum_sha256,
            'uploaded_by': self.uploaded_by,
            'uploaded_at': self.uploaded_at.isoformat() if self.uploaded_at else None,
            'detected_service_type': self.detected_service_type,
            'analysis_complete': self.analysis_complete,
            'artifact_metadata': self.artifact_metadata,
            'analysis_status': self.analysis_status.value if self.analysis_status else 'pending',
            'analysis_result': self.analysis_result,
            'detected_framework': self.detected_framework,
            'requires_database': self.requires_database
        }
