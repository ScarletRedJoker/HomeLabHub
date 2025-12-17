"""
Audit Trail Service
Handles logging of all user actions for compliance and debugging
"""
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from functools import wraps
from flask import request, g
import time

logger = logging.getLogger(__name__)


class AuditService:
    """Service for managing audit logs"""
    
    ACTION_CATEGORIES = {
        'start_container': 'docker',
        'stop_container': 'docker',
        'restart_container': 'docker',
        'get_container_logs': 'docker',
        'list_containers': 'docker',
        'deploy_app': 'deployment',
        'start_app': 'deployment',
        'stop_app': 'deployment',
        'uninstall_app': 'deployment',
        'rollback_deployment': 'deployment',
        'login': 'auth',
        'logout': 'auth',
        'failed_login': 'auth',
        'create_user': 'rbac',
        'update_user_role': 'rbac',
        'grant_service_access': 'rbac',
        'revoke_service_access': 'rbac',
        'view_audit_logs': 'audit',
        'start_service': 'service',
        'stop_service': 'service',
        'restart_service': 'service',
        'health_check': 'system',
        'view_marketplace': 'marketplace',
        'install_app': 'marketplace',
    }
    
    def __init__(self):
        self._db_available = None
    
    @property
    def db_available(self) -> bool:
        """Check if database is available for logging"""
        if self._db_available is None:
            try:
                from services.db_service import db_service
                self._db_available = db_service.is_available
            except Exception:
                self._db_available = False
        return self._db_available
    
    def log(
        self,
        action: str,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        org_id: Optional[str] = None,
        target_type: Optional[str] = None,
        target_id: Optional[str] = None,
        target_name: Optional[str] = None,
        request_data: Optional[Dict] = None,
        response_status: Optional[int] = None,
        response_message: Optional[str] = None,
        success: bool = True,
        error_message: Optional[str] = None,
        duration_ms: Optional[int] = None,
        metadata: Optional[Dict] = None
    ) -> Optional[int]:
        """
        Log an audit event
        
        Args:
            action: The action being performed (e.g., 'start_container')
            user_id: ID of the user performing the action
            username: Username of the user
            target_type: Type of target (container, service, app, etc.)
            target_id: ID of the target
            target_name: Human-readable name of the target
            request_data: Relevant request data (sanitized)
            response_status: HTTP status code of response
            response_message: Response message
            success: Whether the action was successful
            error_message: Error message if action failed
            duration_ms: Duration of the action in milliseconds
            metadata: Additional metadata
        
        Returns:
            ID of the created audit log entry, or None if logging failed
        """
        if not self.db_available:
            logger.warning(f"Audit log (no DB): {action} by {username} on {target_type}:{target_id} (org:{org_id})")
            return None
        
        try:
            from services.db_service import db_service
            from models.audit import AuditLog
            
            ip_address = None
            user_agent = None
            method = None
            endpoint = None
            
            try:
                ip_address = request.remote_addr
                user_agent = request.headers.get('User-Agent', '')[:500]
                method = request.method
                endpoint = request.path
            except RuntimeError:
                pass
            
            action_category = self.ACTION_CATEGORIES.get(action)
            if not action_category:
                for prefix, category in [
                    ('docker_', 'docker'),
                    ('container_', 'docker'),
                    ('deploy_', 'deployment'),
                    ('app_', 'deployment'),
                    ('auth_', 'auth'),
                    ('login_', 'auth'),
                    ('user_', 'rbac'),
                    ('role_', 'rbac'),
                    ('service_', 'service'),
                    ('marketplace_', 'marketplace'),
                ]:
                    if action.startswith(prefix):
                        action_category = category
                        break
            
            if request_data:
                sanitized_data = self._sanitize_request_data(request_data)
            else:
                sanitized_data = None
            
            resolved_org_id = org_id
            if not resolved_org_id:
                try:
                    from flask import session as flask_session
                    resolved_org_id = flask_session.get('current_org_id')
                except RuntimeError:
                    pass
            
            with db_service.get_session() as session:
                audit_log = AuditLog(
                    org_id=resolved_org_id,
                    user_id=user_id,
                    username=username,
                    action=action,
                    action_category=action_category,
                    target_type=target_type,
                    target_id=target_id,
                    target_name=target_name,
                    method=method,
                    endpoint=endpoint,
                    request_data=sanitized_data,
                    response_status=response_status,
                    response_message=response_message,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    duration_ms=duration_ms,
                    success='true' if success else 'false',
                    error_message=error_message,
                    timestamp=datetime.utcnow(),
                    metadata_json=metadata
                )
                
                session.add(audit_log)
                session.flush()
                log_id = audit_log.id
            
            logger.debug(f"Audit log created: {action} by {username} (id={log_id})")
            return log_id
            
        except Exception as e:
            logger.error(f"Failed to create audit log: {e}")
            return None
    
    def _sanitize_request_data(self, data: Dict) -> Dict:
        """Remove sensitive data from request before logging"""
        if not isinstance(data, dict):
            return data
        
        sensitive_keys = {
            'password', 'secret', 'token', 'api_key', 'apikey', 
            'credential', 'auth', 'private_key', 'access_key',
            'secret_key', 'jwt', 'bearer'
        }
        
        sanitized = {}
        for key, value in data.items():
            key_lower = key.lower()
            if any(sensitive in key_lower for sensitive in sensitive_keys):
                sanitized[key] = '[REDACTED]'
            elif isinstance(value, dict):
                sanitized[key] = self._sanitize_request_data(value)
            elif isinstance(value, str) and len(value) > 1000:
                sanitized[key] = value[:100] + '...[truncated]'
            else:
                sanitized[key] = value
        
        return sanitized
    
    def log_request(self, action: str, target_type: str = None, target_id: str = None):
        """
        Decorator to automatically log API requests
        
        Usage:
            @audit_service.log_request('start_container', 'container')
            def start_container(container_id):
                ...
        """
        def decorator(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                start_time = time.time()
                
                from utils.rbac import get_current_user
                user = get_current_user()
                user_id = user.get('user_id') if user else None
                username = user.get('username') if user else None
                
                actual_target_id = target_id
                if target_id and target_id in kwargs:
                    actual_target_id = kwargs[target_id]
                elif target_id and args:
                    actual_target_id = args[0] if args else None
                
                try:
                    result = f(*args, **kwargs)
                    
                    duration_ms = int((time.time() - start_time) * 1000)
                    
                    response_status = 200
                    success = True
                    response_message = None
                    
                    if hasattr(result, '__iter__') and len(result) == 2:
                        response_data, status_code = result
                        response_status = status_code
                        success = status_code < 400
                        if hasattr(response_data, 'get_json'):
                            try:
                                json_data = response_data.get_json()
                                response_message = json_data.get('message')
                            except Exception:
                                pass
                    
                    self.log(
                        action=action,
                        user_id=user_id,
                        username=username,
                        target_type=target_type,
                        target_id=str(actual_target_id) if actual_target_id else None,
                        response_status=response_status,
                        success=success,
                        response_message=response_message,
                        duration_ms=duration_ms
                    )
                    
                    return result
                    
                except Exception as e:
                    duration_ms = int((time.time() - start_time) * 1000)
                    
                    self.log(
                        action=action,
                        user_id=user_id,
                        username=username,
                        target_type=target_type,
                        target_id=str(actual_target_id) if actual_target_id else None,
                        success=False,
                        error_message=str(e),
                        response_status=500,
                        duration_ms=duration_ms
                    )
                    
                    raise
            
            return decorated_function
        return decorator


audit_service = AuditService()

__all__ = ['audit_service', 'AuditService']
