"""
Multi-Tenant Organization Models
Provides organization-based tenant isolation for SaaS-ready architecture
"""
from sqlalchemy import Column, String, DateTime, Boolean, JSON, ForeignKey, Index, Integer
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from models import Base


class OrganizationTier:
    """Organization subscription tiers"""
    FREE = "free"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class MemberRole:
    """Organization member roles"""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"


ROLE_HIERARCHY = {
    MemberRole.OWNER: 4,
    MemberRole.ADMIN: 3,
    MemberRole.MEMBER: 2,
    MemberRole.VIEWER: 1
}


class Organization(Base):
    """Multi-tenant organization model"""
    __tablename__ = 'organizations'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    tier = Column(String(50), default=OrganizationTier.FREE, nullable=False)
    
    settings = Column(JSON, default=dict, nullable=True)
    
    max_members = Column(Integer, default=5)
    max_api_keys = Column(Integer, default=3)
    max_services = Column(Integer, default=10)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True, nullable=False)
    
    members = relationship("OrganizationMember", back_populates="organization", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="organization", cascade="all, delete-orphan")
    
    __table_args__ = (
        Index('ix_org_tier', 'tier'),
        Index('ix_org_active', 'is_active'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'tier': self.tier,
            'settings': self.settings or {},
            'limits': {
                'max_members': self.max_members,
                'max_api_keys': self.max_api_keys,
                'max_services': self.max_services
            },
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'is_active': self.is_active,
            'member_count': len(self.members) if self.members else 0
        }
    
    @classmethod
    def generate_slug(cls, name: str) -> str:
        """Generate a URL-safe slug from organization name"""
        import re
        slug = name.lower().strip()
        slug = re.sub(r'[^\w\s-]', '', slug)
        slug = re.sub(r'[-\s]+', '-', slug)
        return slug[:100]


class OrganizationMember(Base):
    """Organization membership model"""
    __tablename__ = 'organization_members'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(String(255), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    
    role = Column(String(50), default=MemberRole.MEMBER, nullable=False)
    
    invited_by = Column(String(36), nullable=True)
    invited_email = Column(String(255), nullable=True)
    invite_token = Column(String(100), nullable=True, unique=True)
    invite_expires = Column(DateTime, nullable=True)
    
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_active = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True, nullable=False)
    
    organization = relationship("Organization", back_populates="members")
    
    __table_args__ = (
        Index('ix_org_member_user', 'org_id', 'user_id', unique=True),
        Index('ix_org_member_role', 'role'),
        Index('ix_org_member_invite', 'invite_token'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'org_id': self.org_id,
            'user_id': self.user_id,
            'role': self.role,
            'invited_by': self.invited_by,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
            'last_active': self.last_active.isoformat() if self.last_active else None,
            'is_active': self.is_active
        }
    
    def has_role(self, required_role: str) -> bool:
        """Check if member has at least the required role level"""
        member_level = ROLE_HIERARCHY.get(self.role, 0)
        required_level = ROLE_HIERARCHY.get(required_role, 0)
        return member_level >= required_level
    
    def can_manage_members(self) -> bool:
        """Check if member can manage other members"""
        return self.role in [MemberRole.OWNER, MemberRole.ADMIN]
    
    def can_manage_settings(self) -> bool:
        """Check if member can manage organization settings"""
        return self.role in [MemberRole.OWNER, MemberRole.ADMIN]


class APIKey(Base):
    """API Key model for secure programmatic access"""
    __tablename__ = 'api_keys'
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey('organizations.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = Column(String(255), ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    
    name = Column(String(100), nullable=False)
    key_prefix = Column(String(10), nullable=False)
    key_hash = Column(String(255), nullable=False)
    
    permissions = Column(JSON, default=list, nullable=True)
    rate_limit = Column(Integer, default=1000)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    last_used_ip = Column(String(45), nullable=True)
    
    is_active = Column(Boolean, default=True, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by = Column(String(36), nullable=True)
    revoked_reason = Column(String(255), nullable=True)
    
    usage_count = Column(Integer, default=0)
    
    organization = relationship("Organization", back_populates="api_keys")
    
    __table_args__ = (
        Index('ix_api_key_hash', 'key_hash'),
        Index('ix_api_key_org', 'org_id'),
        Index('ix_api_key_prefix', 'key_prefix'),
    )
    
    def to_dict(self, include_sensitive=False):
        data = {
            'id': self.id,
            'org_id': self.org_id,
            'user_id': self.user_id,
            'name': self.name,
            'key_prefix': self.key_prefix,
            'permissions': self.permissions or [],
            'rate_limit': self.rate_limit,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'last_used_at': self.last_used_at.isoformat() if self.last_used_at else None,
            'is_active': self.is_active,
            'usage_count': self.usage_count
        }
        if include_sensitive:
            data['last_used_ip'] = self.last_used_ip
        return data
    
    def is_valid(self) -> bool:
        """Check if API key is valid (active and not expired)"""
        if not self.is_active:
            return False
        if self.revoked_at:
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        return True
    
    def has_permission(self, permission: str) -> bool:
        """Check if API key has a specific permission"""
        if not self.permissions:
            return True
        return permission in self.permissions or '*' in self.permissions
    
    @classmethod
    def generate_key(cls) -> tuple:
        """Generate a new API key, returns (full_key, prefix, hash)"""
        import secrets
        import hashlib
        
        prefix = 'hlh_' + secrets.token_hex(3)
        secret = secrets.token_urlsafe(32)
        full_key = f"{prefix}_{secret}"
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()
        
        return full_key, prefix, key_hash
    
    @classmethod
    def hash_key(cls, key: str) -> str:
        """Hash an API key for comparison"""
        import hashlib
        return hashlib.sha256(key.encode()).hexdigest()


__all__ = [
    'Organization',
    'OrganizationMember', 
    'APIKey',
    'OrganizationTier',
    'MemberRole',
    'ROLE_HIERARCHY'
]
