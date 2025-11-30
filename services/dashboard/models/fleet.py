"""Fleet Management Models - Remote host configuration"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from models import Base


class FleetHost(Base):
    """Remote host configuration for fleet management"""
    __tablename__ = 'fleet_hosts'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    host_id = Column(String(50), unique=True, nullable=False)
    name = Column(String(255), nullable=False)
    tailscale_ip = Column(String(45), nullable=False)
    role = Column(String(50), nullable=False)
    ssh_user = Column(String(100), nullable=False, default='root')
    ssh_port = Column(Integer, nullable=False, default=22)
    ssh_key_path = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    host_metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'host_id': self.host_id,
            'name': self.name,
            'tailscale_ip': self.tailscale_ip,
            'role': self.role,
            'ssh_user': self.ssh_user,
            'ssh_port': self.ssh_port,
            'ssh_key_path': self.ssh_key_path,
            'description': self.description,
            'is_active': self.is_active,
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'metadata': self.host_metadata,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class FleetCommand(Base):
    """Log of commands executed on fleet hosts"""
    __tablename__ = 'fleet_commands'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    host_id = Column(String(50), nullable=False)
    command = Column(Text, nullable=False)
    output = Column(Text, nullable=True)
    exit_code = Column(Integer, nullable=True)
    executed_by = Column(String(255), nullable=True)
    executed_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'host_id': self.host_id,
            'command': self.command,
            'output': self.output,
            'exit_code': self.exit_code,
            'executed_by': self.executed_by,
            'executed_at': self.executed_at.isoformat() if self.executed_at else None,
            'duration_ms': self.duration_ms,
        }
