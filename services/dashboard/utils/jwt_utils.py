"""
JWT Token Utilities
Provides JWT token generation and validation for API authentication
"""
import os
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import hashlib
import hmac
import base64
import json

logger = logging.getLogger(__name__)


class JWTService:
    """Service for JWT token operations"""
    
    def __init__(self):
        self._secret_key = None
    
    @property
    def secret_key(self) -> str:
        """Get or generate the JWT secret key"""
        if self._secret_key is None:
            self._secret_key = os.environ.get('JWT_SECRET_KEY')
            if not self._secret_key:
                flask_secret = os.environ.get('FLASK_SECRET_KEY', '')
                api_key = os.environ.get('DASHBOARD_API_KEY', '')
                self._secret_key = hashlib.sha256(
                    f"{flask_secret}{api_key}jwt-salt-v1".encode()
                ).hexdigest()
        return self._secret_key
    
    def _base64url_encode(self, data: bytes) -> str:
        """Base64url encode data"""
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')
    
    def _base64url_decode(self, data: str) -> bytes:
        """Base64url decode data"""
        padding = 4 - len(data) % 4
        if padding != 4:
            data += '=' * padding
        return base64.urlsafe_b64decode(data)
    
    def _create_signature(self, header_b64: str, payload_b64: str) -> str:
        """Create HMAC-SHA256 signature"""
        message = f"{header_b64}.{payload_b64}"
        signature = hmac.new(
            self.secret_key.encode(),
            message.encode(),
            hashlib.sha256
        ).digest()
        return self._base64url_encode(signature)
    
    def generate_token(
        self,
        user_id: int,
        org_id: Optional[str] = None,
        username: Optional[str] = None,
        role: Optional[str] = None,
        permissions: Optional[list] = None,
        expires_in_hours: int = 24,
        additional_claims: Optional[Dict] = None
    ) -> str:
        """
        Generate a JWT token
        
        Args:
            user_id: User ID to include in token
            org_id: Organization ID (for multi-tenant scoping)
            username: Username
            role: User role
            permissions: List of permission strings
            expires_in_hours: Token expiration time
            additional_claims: Extra claims to include
        
        Returns:
            JWT token string
        """
        now = datetime.utcnow()
        exp = now + timedelta(hours=expires_in_hours)
        
        header = {
            "alg": "HS256",
            "typ": "JWT"
        }
        
        payload = {
            "sub": str(user_id),
            "iat": int(now.timestamp()),
            "exp": int(exp.timestamp()),
            "iss": "homelabhub"
        }
        
        if org_id:
            payload["org_id"] = org_id
        if username:
            payload["username"] = username
        if role:
            payload["role"] = role
        if permissions:
            payload["permissions"] = permissions
        
        if additional_claims:
            payload.update(additional_claims)
        
        header_b64 = self._base64url_encode(json.dumps(header).encode())
        payload_b64 = self._base64url_encode(json.dumps(payload).encode())
        signature = self._create_signature(header_b64, payload_b64)
        
        return f"{header_b64}.{payload_b64}.{signature}"
    
    def validate_token(self, token: str) -> Optional[Dict]:
        """
        Validate a JWT token
        
        Args:
            token: JWT token string
        
        Returns:
            Token payload if valid, None otherwise
        """
        try:
            parts = token.split('.')
            if len(parts) != 3:
                logger.warning("Invalid JWT format: wrong number of parts")
                return None
            
            header_b64, payload_b64, signature = parts
            
            expected_sig = self._create_signature(header_b64, payload_b64)
            if not hmac.compare_digest(signature, expected_sig):
                logger.warning("Invalid JWT signature")
                return None
            
            payload = json.loads(self._base64url_decode(payload_b64))
            
            exp = payload.get('exp')
            if exp and datetime.utcnow().timestamp() > exp:
                logger.warning("JWT token has expired")
                return None
            
            return payload
            
        except Exception as e:
            logger.error(f"Error validating JWT token: {e}")
            return None
    
    def refresh_token(self, token: str, expires_in_hours: int = 24) -> Optional[str]:
        """
        Refresh a JWT token (generate new token with same claims)
        
        Args:
            token: Existing JWT token
            expires_in_hours: New expiration time
        
        Returns:
            New JWT token if original was valid, None otherwise
        """
        payload = self.validate_token(token)
        if not payload:
            return None
        
        for key in ['iat', 'exp', 'iss']:
            payload.pop(key, None)
        
        user_id = int(payload.pop('sub'))
        org_id = payload.pop('org_id', None)
        username = payload.pop('username', None)
        role = payload.pop('role', None)
        permissions = payload.pop('permissions', None)
        
        return self.generate_token(
            user_id=user_id,
            org_id=org_id,
            username=username,
            role=role,
            permissions=permissions,
            expires_in_hours=expires_in_hours,
            additional_claims=payload if payload else None
        )
    
    def decode_without_validation(self, token: str) -> Optional[Dict]:
        """
        Decode a JWT token without validating signature or expiration
        Useful for reading expired tokens to get user info
        
        Args:
            token: JWT token string
        
        Returns:
            Token payload or None if invalid format
        """
        try:
            parts = token.split('.')
            if len(parts) != 3:
                return None
            
            payload_b64 = parts[1]
            payload = json.loads(self._base64url_decode(payload_b64))
            
            return payload
            
        except Exception as e:
            logger.error(f"Error decoding JWT token: {e}")
            return None


jwt_service = JWTService()

__all__ = ['jwt_service', 'JWTService']
