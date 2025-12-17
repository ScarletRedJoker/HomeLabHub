"""Network Resource Models - Auto-discovered network resources"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from models import Base
import enum


class ResourceType(str, enum.Enum):
    NAS = 'nas'
    HOST = 'host'
    SERVICE = 'service'
    VM = 'vm'


class HealthStatus(str, enum.Enum):
    HEALTHY = 'healthy'
    DEGRADED = 'degraded'
    UNHEALTHY = 'unhealthy'
    UNKNOWN = 'unknown'


class NetworkResource(Base):
    """Network resource discovered or manually configured"""
    __tablename__ = 'network_resources'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    resource_type = Column(String(20), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    preferred_endpoint = Column(String(255), nullable=True)
    discovered_endpoints = Column(JSONB, nullable=True, default=list)
    last_seen = Column(DateTime(timezone=True), nullable=True)
    health_status = Column(String(20), default='unknown')
    discovery_method = Column(String(50), nullable=True)
    ports = Column(JSONB, nullable=True, default=list)
    resource_metadata = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'org_id': str(self.org_id) if self.org_id else None,
            'resource_type': self.resource_type,
            'name': self.name,
            'preferred_endpoint': self.preferred_endpoint,
            'discovered_endpoints': self.discovered_endpoints or [],
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'health_status': self.health_status,
            'discovery_method': self.discovery_method,
            'ports': self.ports or [],
            'metadata': self.resource_metadata or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
    
    @classmethod
    def get_by_name(cls, session, name: str):
        """Get a network resource by name"""
        from sqlalchemy import select
        return session.execute(
            select(cls).where(cls.name == name)
        ).scalar_one_or_none()
    
    @classmethod
    def get_by_type(cls, session, resource_type: str):
        """Get all network resources of a specific type"""
        from sqlalchemy import select
        return session.execute(
            select(cls).where(cls.resource_type == resource_type)
        ).scalars().all()
    
    @classmethod
    def get_all(cls, session, org_id=None):
        """Get all network resources, optionally filtered by org_id"""
        from sqlalchemy import select
        query = select(cls)
        if org_id:
            query = query.where(cls.org_id == org_id)
        return session.execute(query.order_by(cls.name)).scalars().all()
    
    @classmethod
    def upsert(cls, session, name: str, resource_type: str, **kwargs):
        """Create or update a network resource"""
        resource = cls.get_by_name(session, name)
        if resource:
            for key, value in kwargs.items():
                if hasattr(resource, key):
                    setattr(resource, key, value)
            resource.updated_at = datetime.utcnow()
        else:
            if 'metadata' in kwargs:
                kwargs['resource_metadata'] = kwargs.pop('metadata')
            resource = cls(
                name=name,
                resource_type=resource_type,
                **kwargs
            )
            session.add(resource)
        return resource


class NetworkDiscoveryLog(Base):
    """Log of network discovery operations"""
    __tablename__ = 'network_discovery_logs'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    discovery_type = Column(String(50), nullable=False)
    target = Column(String(255), nullable=True)
    method = Column(String(50), nullable=False)
    success = Column(String(10), nullable=False)
    result = Column(Text, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    
    def to_dict(self):
        return {
            'id': str(self.id),
            'discovery_type': self.discovery_type,
            'target': self.target,
            'method': self.method,
            'success': self.success,
            'result': self.result,
            'duration_ms': self.duration_ms,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
