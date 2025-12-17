"""
Organization Routes
API endpoints for multi-tenant organization management
"""
from flask import Blueprint, jsonify, request, session
from utils.auth import require_auth
from utils.rbac import require_permission, get_current_user
from models.rbac import Permission
from services.db_service import db_service
from services.organization_service import organization_service
from services.audit_service import audit_service
import logging

logger = logging.getLogger(__name__)

org_bp = Blueprint('organizations', __name__, url_prefix='/api/org')


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@org_bp.route('/current', methods=['GET'])
@require_auth
def get_current_organization():
    """
    GET /api/org/current
    Get the current user's primary organization
    """
    try:
        user = get_current_user()
        if not user:
            return make_response(False, message='User not found', status_code=401)
        
        user_id = user.get('user_id') or user.get('id')
        if not user_id:
            return make_response(False, message='User ID not found', status_code=401)
        
        orgs = organization_service.get_user_organizations(user_id)
        
        if not orgs:
            return make_response(True, data={
                'organization': None,
                'all_organizations': [],
                'message': 'User is not a member of any organization'
            })
        
        current_org_id = session.get('current_org_id')
        current_org = None
        
        if current_org_id:
            current_org = next((o for o in orgs if o['id'] == current_org_id), None)
        
        if not current_org:
            current_org = orgs[0]
            session['current_org_id'] = current_org['id']
        
        return make_response(True, data={
            'organization': current_org,
            'all_organizations': orgs,
            'user_role': current_org.get('user_role')
        })
        
    except Exception as e:
        logger.error(f"Error getting current organization: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/switch', methods=['POST'])
@require_auth
def switch_organization():
    """
    POST /api/org/switch
    Switch to a different organization
    
    Body:
        org_id: str - Organization ID to switch to
    """
    try:
        data = request.get_json() or {}
        org_id = data.get('org_id')
        
        if not org_id:
            return make_response(False, message='org_id is required', status_code=400)
        
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        org = organization_service.get_organization(org_id)
        if not org or not org.get('is_active'):
            return make_response(False, message='Organization not found or inactive', status_code=404)
        
        session['current_org_id'] = org_id
        
        audit_service.log(
            action='switch_organization',
            user_id=str(user_id),
            username=user.get('username'),
            target_type='organization',
            target_id=org_id,
            target_name=org.get('name')
        )
        
        return make_response(True, data={
            'organization': org,
            'user_role': membership.get('role')
        })
        
    except Exception as e:
        logger.error(f"Error switching organization: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('', methods=['POST'])
@require_auth
def create_organization():
    """
    POST /api/org
    Create a new organization
    
    Body:
        name: str - Organization name
        tier: str - Subscription tier (optional, default: free)
        settings: dict - Initial settings (optional)
    """
    try:
        data = request.get_json() or {}
        name = data.get('name')
        
        if not name or len(name) < 2:
            return make_response(False, message='Organization name is required (min 2 characters)', status_code=400)
        
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        org = organization_service.create_organization(
            name=name,
            owner_user_id=user_id,
            tier=data.get('tier', 'free'),
            settings=data.get('settings')
        )
        
        if not org:
            return make_response(False, message='Failed to create organization', status_code=500)
        
        session['current_org_id'] = org['id']
        
        audit_service.log(
            action='create_organization',
            user_id=str(user_id),
            username=user.get('username'),
            target_type='organization',
            target_id=org['id'],
            target_name=name
        )
        
        return make_response(True, data=org, status_code=201)
        
    except Exception as e:
        logger.error(f"Error creating organization: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>', methods=['GET'])
@require_auth
def get_organization(org_id):
    """
    GET /api/org/<org_id>
    Get organization details
    """
    try:
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        org = organization_service.get_organization(org_id)
        if not org:
            return make_response(False, message='Organization not found', status_code=404)
        
        org['user_role'] = membership.get('role')
        
        return make_response(True, data=org)
        
    except Exception as e:
        logger.error(f"Error getting organization: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/settings', methods=['GET', 'PUT'])
@require_auth
def organization_settings(org_id):
    """
    GET/PUT /api/org/<org_id>/settings
    Get or update organization settings
    """
    try:
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        org = organization_service.get_organization(org_id)
        if not org:
            return make_response(False, message='Organization not found', status_code=404)
        
        if request.method == 'GET':
            return make_response(True, data={
                'settings': org.get('settings', {}),
                'name': org.get('name'),
                'tier': org.get('tier'),
                'limits': org.get('limits', {})
            })
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        data = request.get_json() or {}
        
        updated_org = organization_service.update_organization(
            org_id=org_id,
            name=data.get('name'),
            settings=data.get('settings')
        )
        
        if not updated_org:
            return make_response(False, message='Failed to update organization', status_code=500)
        
        audit_service.log(
            action='update_organization_settings',
            user_id=str(user_id),
            username=user.get('username'),
            target_type='organization',
            target_id=org_id,
            request_data=data
        )
        
        return make_response(True, data=updated_org)
        
    except Exception as e:
        logger.error(f"Error with organization settings: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/members', methods=['GET'])
@require_auth
def get_organization_members(org_id):
    """
    GET /api/org/<org_id>/members
    Get all members of an organization
    """
    try:
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        members = organization_service.get_members(org_id)
        
        return make_response(True, data={
            'members': members,
            'count': len(members)
        })
        
    except Exception as e:
        logger.error(f"Error getting organization members: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/members', methods=['POST'])
@require_auth
def add_organization_member(org_id):
    """
    POST /api/org/<org_id>/members
    Add a new member to an organization
    
    Body:
        user_id: int - User ID to add
        role: str - Role to assign (optional, default: member)
    """
    try:
        user = get_current_user()
        current_user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, current_user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        data = request.get_json() or {}
        new_user_id = data.get('user_id')
        role = data.get('role', MemberRole.MEMBER)
        
        if not new_user_id:
            return make_response(False, message='user_id is required', status_code=400)
        
        if role == MemberRole.OWNER and membership.get('role') != MemberRole.OWNER:
            return make_response(False, message='Only owners can add new owners', status_code=403)
        
        member = organization_service.add_member(
            org_id=org_id,
            user_id=new_user_id,
            role=role,
            invited_by=str(current_user_id)
        )
        
        if not member:
            return make_response(False, message='Failed to add member', status_code=500)
        
        audit_service.log(
            action='add_organization_member',
            user_id=str(current_user_id),
            username=user.get('username'),
            target_type='organization_member',
            target_id=str(new_user_id),
            request_data={'org_id': org_id, 'role': role}
        )
        
        return make_response(True, data=member, status_code=201)
        
    except Exception as e:
        logger.error(f"Error adding organization member: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/members/<int:member_user_id>', methods=['PUT'])
@require_auth
def update_organization_member(org_id, member_user_id):
    """
    PUT /api/org/<org_id>/members/<member_user_id>
    Update a member's role
    
    Body:
        role: str - New role to assign
    """
    try:
        user = get_current_user()
        current_user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, current_user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        data = request.get_json() or {}
        new_role = data.get('role')
        
        if not new_role:
            return make_response(False, message='role is required', status_code=400)
        
        if new_role == MemberRole.OWNER and membership.get('role') != MemberRole.OWNER:
            return make_response(False, message='Only owners can promote to owner', status_code=403)
        
        updated_member = organization_service.update_member_role(
            org_id=org_id,
            user_id=member_user_id,
            new_role=new_role
        )
        
        if not updated_member:
            return make_response(False, message='Failed to update member', status_code=500)
        
        audit_service.log(
            action='update_organization_member_role',
            user_id=str(current_user_id),
            username=user.get('username'),
            target_type='organization_member',
            target_id=str(member_user_id),
            request_data={'org_id': org_id, 'new_role': new_role}
        )
        
        return make_response(True, data=updated_member)
        
    except Exception as e:
        logger.error(f"Error updating organization member: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/members/<int:member_user_id>', methods=['DELETE'])
@require_auth
def remove_organization_member(org_id, member_user_id):
    """
    DELETE /api/org/<org_id>/members/<member_user_id>
    Remove a member from an organization
    """
    try:
        user = get_current_user()
        current_user_id = user.get('user_id') or user.get('id')
        
        if int(member_user_id) == int(current_user_id):
            success = organization_service.remove_member(org_id, member_user_id)
            if success:
                audit_service.log(
                    action='leave_organization',
                    user_id=str(current_user_id),
                    username=user.get('username'),
                    target_type='organization',
                    target_id=org_id
                )
                return make_response(True, message='Left organization successfully')
            return make_response(False, message='Failed to leave organization', status_code=500)
        
        membership = organization_service.get_user_membership(org_id, current_user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        success = organization_service.remove_member(org_id, member_user_id)
        
        if not success:
            return make_response(False, message='Failed to remove member', status_code=500)
        
        audit_service.log(
            action='remove_organization_member',
            user_id=str(current_user_id),
            username=user.get('username'),
            target_type='organization_member',
            target_id=str(member_user_id),
            request_data={'org_id': org_id}
        )
        
        return make_response(True, message='Member removed successfully')
        
    except Exception as e:
        logger.error(f"Error removing organization member: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/api-keys', methods=['GET'])
@require_auth
def get_api_keys(org_id):
    """
    GET /api/org/<org_id>/api-keys
    Get all API keys for an organization
    """
    try:
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        keys = organization_service.get_api_keys(org_id)
        
        return make_response(True, data={
            'api_keys': keys,
            'count': len(keys)
        })
        
    except Exception as e:
        logger.error(f"Error getting API keys: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/api-keys', methods=['POST'])
@require_auth
def create_api_key(org_id):
    """
    POST /api/org/<org_id>/api-keys
    Create a new API key
    
    Body:
        name: str - Name for the API key
        permissions: list - List of permission strings (optional)
        expires_in_days: int - Days until expiration (optional)
        rate_limit: int - Rate limit (optional, default: 1000)
    """
    try:
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        data = request.get_json() or {}
        name = data.get('name')
        
        if not name:
            return make_response(False, message='name is required', status_code=400)
        
        api_key = organization_service.create_api_key(
            org_id=org_id,
            name=name,
            user_id=user_id,
            permissions=data.get('permissions'),
            expires_in_days=data.get('expires_in_days'),
            rate_limit=data.get('rate_limit', 1000)
        )
        
        if not api_key:
            return make_response(False, message='Failed to create API key (limit may be reached)', status_code=500)
        
        audit_service.log(
            action='create_api_key',
            user_id=str(user_id),
            username=user.get('username'),
            target_type='api_key',
            target_id=api_key['id'],
            target_name=name,
            request_data={'org_id': org_id}
        )
        
        return make_response(True, data=api_key, message='API key created. Save the key now - it will not be shown again.', status_code=201)
        
    except Exception as e:
        logger.error(f"Error creating API key: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/api-keys/<key_id>', methods=['DELETE'])
@require_auth
def revoke_api_key(org_id, key_id):
    """
    DELETE /api/org/<org_id>/api-keys/<key_id>
    Revoke an API key
    
    Query params:
        reason: str - Reason for revocation (optional)
    """
    try:
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        reason = request.args.get('reason')
        
        success = organization_service.revoke_api_key(
            api_key_id=key_id,
            revoked_by=str(user_id),
            reason=reason
        )
        
        if not success:
            return make_response(False, message='Failed to revoke API key', status_code=500)
        
        audit_service.log(
            action='revoke_api_key',
            user_id=str(user_id),
            username=user.get('username'),
            target_type='api_key',
            target_id=key_id,
            request_data={'org_id': org_id, 'reason': reason}
        )
        
        return make_response(True, message='API key revoked successfully')
        
    except Exception as e:
        logger.error(f"Error revoking API key: {e}")
        return make_response(False, message=str(e), status_code=500)


@org_bp.route('/<org_id>/audit-log', methods=['GET'])
@require_auth
def get_organization_audit_log(org_id):
    """
    GET /api/org/<org_id>/audit-log
    Get audit log for an organization
    
    Query params:
        action: str - Filter by action type
        user_id: str - Filter by user
        start_date: str - Start date (ISO format)
        end_date: str - End date (ISO format)
        limit: int - Number of results (default: 50, max: 500)
        offset: int - Pagination offset
    """
    try:
        user = get_current_user()
        user_id = user.get('user_id') or user.get('id')
        
        membership = organization_service.get_user_membership(org_id, user_id)
        if not membership:
            return make_response(False, message='Not a member of this organization', status_code=403)
        
        from models.organization import MemberRole
        if membership.get('role') not in [MemberRole.OWNER, MemberRole.ADMIN]:
            return make_response(False, message='Permission denied', status_code=403)
        
        if not db_service.is_available:
            return make_response(False, message='Database service not available', status_code=503)
        
        from models.audit import AuditLog
        from sqlalchemy import select, and_, func, desc
        from datetime import datetime, timedelta
        
        action = request.args.get('action')
        filter_user_id = request.args.get('user_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = min(request.args.get('limit', 50, type=int), 500)
        offset = request.args.get('offset', 0, type=int)
        
        with db_service.get_session() as session:
            query = select(AuditLog).where(AuditLog.org_id == org_id)
            
            conditions = [AuditLog.org_id == org_id]
            
            if action:
                conditions.append(AuditLog.action.ilike(f'%{action}%'))
            
            if filter_user_id:
                conditions.append(AuditLog.user_id == filter_user_id)
            
            if start_date:
                try:
                    start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                    conditions.append(AuditLog.timestamp >= start_dt)
                except ValueError:
                    pass
            
            if end_date:
                try:
                    end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                    conditions.append(AuditLog.timestamp <= end_dt)
                except ValueError:
                    pass
            
            query = query.where(and_(*conditions))
            query = query.order_by(desc(AuditLog.timestamp))
            query = query.offset(offset).limit(limit)
            
            logs = session.execute(query).scalars().all()
            
            count_query = select(func.count(AuditLog.id)).where(and_(*conditions))
            total_count = session.execute(count_query).scalar()
            
            return make_response(True, data={
                'logs': [log.to_dict() for log in logs],
                'pagination': {
                    'total': total_count,
                    'limit': limit,
                    'offset': offset,
                    'has_more': offset + limit < total_count
                }
            })
        
    except Exception as e:
        logger.error(f"Error getting organization audit log: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['org_bp']
