"""
Organization Service
Handles multi-tenant organization operations
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
import secrets

logger = logging.getLogger(__name__)


class OrganizationService:
    """Service for managing organizations and multi-tenancy"""
    
    def __init__(self):
        self._db_available = None
    
    @property
    def db_available(self) -> bool:
        """Check if database is available"""
        if self._db_available is None:
            try:
                from services.db_service import db_service
                self._db_available = db_service.is_available
            except Exception:
                self._db_available = False
        return self._db_available
    
    def create_organization(
        self,
        name: str,
        owner_user_id: int,
        tier: str = 'free',
        settings: Optional[Dict] = None
    ) -> Optional[Dict]:
        """
        Create a new organization with owner membership
        """
        if not self.db_available:
            logger.warning("Cannot create organization: database not available")
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import Organization, OrganizationMember, MemberRole
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                slug = Organization.generate_slug(name)
                
                existing = session.execute(
                    select(Organization).where(Organization.slug == slug)
                ).scalar_one_or_none()
                
                if existing:
                    slug = f"{slug}-{secrets.token_hex(3)}"
                
                org = Organization(
                    name=name,
                    slug=slug,
                    tier=tier,
                    settings=settings or {}
                )
                session.add(org)
                session.flush()
                
                owner_member = OrganizationMember(
                    org_id=org.id,
                    user_id=owner_user_id,
                    role=MemberRole.OWNER
                )
                session.add(owner_member)
                session.flush()
                
                result = org.to_dict()
                
                logger.info(f"Created organization '{name}' (id={org.id}) with owner user_id={owner_user_id}")
                return result
                
        except Exception as e:
            logger.error(f"Error creating organization: {e}")
            return None
    
    def get_organization(self, org_id: str) -> Optional[Dict]:
        """Get organization by ID"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import Organization
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                org = session.execute(
                    select(Organization).where(Organization.id == org_id)
                ).scalar_one_or_none()
                
                if org:
                    return org.to_dict()
                return None
                
        except Exception as e:
            logger.error(f"Error getting organization: {e}")
            return None
    
    def get_organization_by_slug(self, slug: str) -> Optional[Dict]:
        """Get organization by slug"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import Organization
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                org = session.execute(
                    select(Organization).where(Organization.slug == slug)
                ).scalar_one_or_none()
                
                if org:
                    return org.to_dict()
                return None
                
        except Exception as e:
            logger.error(f"Error getting organization by slug: {e}")
            return None
    
    def get_user_organizations(self, user_id: int) -> List[Dict]:
        """Get all organizations a user belongs to"""
        if not self.db_available:
            return []
        
        try:
            from services.db_service import db_service
            from models.organization import Organization, OrganizationMember
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                query = select(Organization, OrganizationMember.role).join(
                    OrganizationMember,
                    OrganizationMember.org_id == Organization.id
                ).where(
                    OrganizationMember.user_id == user_id,
                    OrganizationMember.is_active == True,
                    Organization.is_active == True
                )
                
                results = session.execute(query).all()
                
                orgs = []
                for org, role in results:
                    org_dict = org.to_dict()
                    org_dict['user_role'] = role
                    orgs.append(org_dict)
                
                return orgs
                
        except Exception as e:
            logger.error(f"Error getting user organizations: {e}")
            return []
    
    def update_organization(
        self,
        org_id: str,
        name: Optional[str] = None,
        tier: Optional[str] = None,
        settings: Optional[Dict] = None,
        is_active: Optional[bool] = None
    ) -> Optional[Dict]:
        """Update organization properties"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import Organization
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                org = session.execute(
                    select(Organization).where(Organization.id == org_id)
                ).scalar_one_or_none()
                
                if not org:
                    return None
                
                if name is not None:
                    org.name = name
                if tier is not None:
                    org.tier = tier
                if settings is not None:
                    org.settings = {**(org.settings or {}), **settings}
                if is_active is not None:
                    org.is_active = is_active
                
                org.updated_at = datetime.utcnow()
                session.flush()
                
                return org.to_dict()
                
        except Exception as e:
            logger.error(f"Error updating organization: {e}")
            return None
    
    def add_member(
        self,
        org_id: str,
        user_id: int,
        role: str = 'member',
        invited_by: Optional[str] = None
    ) -> Optional[Dict]:
        """Add a member to an organization"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import Organization, OrganizationMember
            from sqlalchemy import select, and_
            
            with db_service.get_session() as session:
                org = session.execute(
                    select(Organization).where(Organization.id == org_id)
                ).scalar_one_or_none()
                
                if not org:
                    logger.warning(f"Organization {org_id} not found")
                    return None
                
                member_count = len(org.members)
                if member_count >= org.max_members:
                    logger.warning(f"Organization {org_id} has reached max members ({org.max_members})")
                    return None
                
                existing = session.execute(
                    select(OrganizationMember).where(
                        and_(
                            OrganizationMember.org_id == org_id,
                            OrganizationMember.user_id == user_id
                        )
                    )
                ).scalar_one_or_none()
                
                if existing:
                    if not existing.is_active:
                        existing.is_active = True
                        existing.role = role
                        existing.joined_at = datetime.utcnow()
                        session.flush()
                        return existing.to_dict()
                    logger.warning(f"User {user_id} is already a member of organization {org_id}")
                    return existing.to_dict()
                
                member = OrganizationMember(
                    org_id=org_id,
                    user_id=user_id,
                    role=role,
                    invited_by=invited_by
                )
                session.add(member)
                session.flush()
                
                logger.info(f"Added user {user_id} to organization {org_id} with role {role}")
                return member.to_dict()
                
        except Exception as e:
            logger.error(f"Error adding member: {e}")
            return None
    
    def update_member_role(
        self,
        org_id: str,
        user_id: int,
        new_role: str
    ) -> Optional[Dict]:
        """Update a member's role"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import OrganizationMember, MemberRole
            from sqlalchemy import select, and_
            
            with db_service.get_session() as session:
                member = session.execute(
                    select(OrganizationMember).where(
                        and_(
                            OrganizationMember.org_id == org_id,
                            OrganizationMember.user_id == user_id
                        )
                    )
                ).scalar_one_or_none()
                
                if not member:
                    return None
                
                if member.role == MemberRole.OWNER and new_role != MemberRole.OWNER:
                    owner_count = session.execute(
                        select(OrganizationMember).where(
                            and_(
                                OrganizationMember.org_id == org_id,
                                OrganizationMember.role == MemberRole.OWNER,
                                OrganizationMember.is_active == True
                            )
                        )
                    ).scalars().all()
                    
                    if len(owner_count) <= 1:
                        logger.warning("Cannot demote the only owner")
                        return None
                
                member.role = new_role
                session.flush()
                
                return member.to_dict()
                
        except Exception as e:
            logger.error(f"Error updating member role: {e}")
            return None
    
    def remove_member(self, org_id: str, user_id: int) -> bool:
        """Remove a member from an organization (soft delete)"""
        if not self.db_available:
            return False
        
        try:
            from services.db_service import db_service
            from models.organization import OrganizationMember, MemberRole
            from sqlalchemy import select, and_
            
            with db_service.get_session() as session:
                member = session.execute(
                    select(OrganizationMember).where(
                        and_(
                            OrganizationMember.org_id == org_id,
                            OrganizationMember.user_id == user_id
                        )
                    )
                ).scalar_one_or_none()
                
                if not member:
                    return False
                
                if member.role == MemberRole.OWNER:
                    owner_count = session.execute(
                        select(OrganizationMember).where(
                            and_(
                                OrganizationMember.org_id == org_id,
                                OrganizationMember.role == MemberRole.OWNER,
                                OrganizationMember.is_active == True
                            )
                        )
                    ).scalars().all()
                    
                    if len(owner_count) <= 1:
                        logger.warning("Cannot remove the only owner")
                        return False
                
                member.is_active = False
                session.flush()
                
                logger.info(f"Removed user {user_id} from organization {org_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error removing member: {e}")
            return False
    
    def get_members(self, org_id: str, include_inactive: bool = False) -> List[Dict]:
        """Get all members of an organization"""
        if not self.db_available:
            return []
        
        try:
            from services.db_service import db_service
            from models.organization import OrganizationMember
            from models.rbac import User
            from sqlalchemy import select, and_
            
            with db_service.get_session() as session:
                query = select(OrganizationMember, User).join(
                    User,
                    User.id == OrganizationMember.user_id
                ).where(OrganizationMember.org_id == org_id)
                
                if not include_inactive:
                    query = query.where(OrganizationMember.is_active == True)
                
                results = session.execute(query).all()
                
                members = []
                for member, user in results:
                    member_dict = member.to_dict()
                    member_dict['user'] = {
                        'id': user.id,
                        'username': user.username,
                        'email': user.email,
                        'is_active': user.is_active
                    }
                    members.append(member_dict)
                
                return members
                
        except Exception as e:
            logger.error(f"Error getting members: {e}")
            return []
    
    def get_user_membership(self, org_id: str, user_id: int) -> Optional[Dict]:
        """Get a user's membership in an organization"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import OrganizationMember
            from sqlalchemy import select, and_
            
            with db_service.get_session() as session:
                member = session.execute(
                    select(OrganizationMember).where(
                        and_(
                            OrganizationMember.org_id == org_id,
                            OrganizationMember.user_id == user_id,
                            OrganizationMember.is_active == True
                        )
                    )
                ).scalar_one_or_none()
                
                if member:
                    return member.to_dict()
                return None
                
        except Exception as e:
            logger.error(f"Error getting user membership: {e}")
            return None
    
    def create_api_key(
        self,
        org_id: str,
        name: str,
        user_id: Optional[int] = None,
        permissions: Optional[List[str]] = None,
        expires_in_days: Optional[int] = None,
        rate_limit: int = 1000
    ) -> Optional[Dict]:
        """Create a new API key for an organization"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import Organization, APIKey
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                org = session.execute(
                    select(Organization).where(Organization.id == org_id)
                ).scalar_one_or_none()
                
                if not org:
                    return None
                
                key_count = len(org.api_keys)
                if key_count >= org.max_api_keys:
                    logger.warning(f"Organization {org_id} has reached max API keys ({org.max_api_keys})")
                    return None
                
                full_key, prefix, key_hash = APIKey.generate_key()
                
                expires_at = None
                if expires_in_days:
                    expires_at = datetime.utcnow() + timedelta(days=expires_in_days)
                
                api_key = APIKey(
                    org_id=org_id,
                    user_id=user_id,
                    name=name,
                    key_prefix=prefix,
                    key_hash=key_hash,
                    permissions=permissions,
                    rate_limit=rate_limit,
                    expires_at=expires_at
                )
                session.add(api_key)
                session.flush()
                
                result = api_key.to_dict()
                result['key'] = full_key
                
                logger.info(f"Created API key '{name}' for organization {org_id}")
                return result
                
        except Exception as e:
            logger.error(f"Error creating API key: {e}")
            return None
    
    def get_api_keys(self, org_id: str, include_revoked: bool = False) -> List[Dict]:
        """Get all API keys for an organization"""
        if not self.db_available:
            return []
        
        try:
            from services.db_service import db_service
            from models.organization import APIKey
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                query = select(APIKey).where(APIKey.org_id == org_id)
                
                if not include_revoked:
                    query = query.where(APIKey.is_active == True)
                
                keys = session.execute(query).scalars().all()
                
                return [k.to_dict() for k in keys]
                
        except Exception as e:
            logger.error(f"Error getting API keys: {e}")
            return []
    
    def validate_api_key(self, key: str) -> Optional[Dict]:
        """Validate an API key and return its details"""
        if not self.db_available:
            return None
        
        try:
            from services.db_service import db_service
            from models.organization import APIKey, Organization
            from sqlalchemy import select
            
            key_hash = APIKey.hash_key(key)
            
            with db_service.get_session() as session:
                api_key = session.execute(
                    select(APIKey).where(APIKey.key_hash == key_hash)
                ).scalar_one_or_none()
                
                if not api_key:
                    return None
                
                if not api_key.is_valid():
                    return None
                
                api_key.last_used_at = datetime.utcnow()
                api_key.usage_count += 1
                
                org = session.execute(
                    select(Organization).where(Organization.id == api_key.org_id)
                ).scalar_one_or_none()
                
                session.flush()
                
                return {
                    'api_key': api_key.to_dict(),
                    'organization': org.to_dict() if org else None
                }
                
        except Exception as e:
            logger.error(f"Error validating API key: {e}")
            return None
    
    def revoke_api_key(
        self,
        api_key_id: str,
        revoked_by: str,
        reason: Optional[str] = None
    ) -> bool:
        """Revoke an API key"""
        if not self.db_available:
            return False
        
        try:
            from services.db_service import db_service
            from models.organization import APIKey
            from sqlalchemy import select
            
            with db_service.get_session() as session:
                api_key = session.execute(
                    select(APIKey).where(APIKey.id == api_key_id)
                ).scalar_one_or_none()
                
                if not api_key:
                    return False
                
                api_key.is_active = False
                api_key.revoked_at = datetime.utcnow()
                api_key.revoked_by = revoked_by
                api_key.revoked_reason = reason
                
                session.flush()
                
                logger.info(f"Revoked API key {api_key_id}")
                return True
                
        except Exception as e:
            logger.error(f"Error revoking API key: {e}")
            return False


organization_service = OrganizationService()

__all__ = ['organization_service', 'OrganizationService']
