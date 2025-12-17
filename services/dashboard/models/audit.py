"""
Audit Trail Model
Tracks all user actions for compliance and debugging
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Index, ForeignKey
from datetime import datetime
from models import Base


class AuditLog(Base):
    """Audit log entry for tracking user actions"""
    __tablename__ = 'audit_logs'
    
    id = Column(Integer, primary_key=True)
    
    org_id = Column(String(36), ForeignKey('organizations.id', ondelete='SET NULL'), nullable=True, index=True)
    
    user_id = Column(String(100), nullable=True, index=True)
    username = Column(String(100), nullable=True)
    
    action = Column(String(100), nullable=False, index=True)
    action_category = Column(String(50), nullable=True, index=True)
    
    target_type = Column(String(100), nullable=True)
    target_id = Column(String(255), nullable=True, index=True)
    target_name = Column(String(255), nullable=True)
    
    method = Column(String(10), nullable=True)
    endpoint = Column(String(500), nullable=True)
    
    request_data = Column(JSON, nullable=True)
    response_status = Column(Integer, nullable=True)
    response_message = Column(Text, nullable=True)
    
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    
    duration_ms = Column(Integer, nullable=True)
    
    success = Column(String(10), default='true')
    error_message = Column(Text, nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    __table_args__ = (
        Index('ix_audit_user_action', 'user_id', 'action'),
        Index('ix_audit_timestamp_user', 'timestamp', 'user_id'),
        Index('ix_audit_target', 'target_type', 'target_id'),
        Index('ix_audit_org_timestamp', 'org_id', 'timestamp'),
    )
    
    def to_dict(self):
        return {
            'id': self.id,
            'org_id': self.org_id,
            'user_id': self.user_id,
            'username': self.username,
            'action': self.action,
            'action_category': self.action_category,
            'target': {
                'type': self.target_type,
                'id': self.target_id,
                'name': self.target_name
            },
            'request': {
                'method': self.method,
                'endpoint': self.endpoint,
                'data': self.request_data
            },
            'response': {
                'status': self.response_status,
                'message': self.response_message
            },
            'client': {
                'ip_address': self.ip_address,
                'user_agent': self.user_agent
            },
            'duration_ms': self.duration_ms,
            'success': self.success == 'true',
            'error_message': self.error_message,
            'timestamp': self.timestamp.isoformat() if self.timestamp is not None else None,
            'metadata': self.metadata_json
        }
    
    @classmethod
    def create_log(cls, **kwargs):
        """Factory method to create an audit log entry"""
        return cls(**kwargs)


__all__ = ['AuditLog']
