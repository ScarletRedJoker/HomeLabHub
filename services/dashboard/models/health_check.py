"""
Health Check Database Models
Tracks service health check results for monitoring and alerting
"""
from sqlalchemy import Column, Integer, String, DateTime, JSON, Index
from sqlalchemy.sql import func
from models import Base

class ServiceHealthCheck(Base):
    """
    Stores health check results for all monitored services
    
    Tracks:
    - Service health status (healthy, degraded, unhealthy, unknown)
    - Detailed check results for each service component
    - Response time for health check endpoint
    - Timestamp for historical tracking
    """
    __tablename__ = 'service_health_checks'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    service_name = Column(String(100), nullable=False, index=True)
    status = Column(String(20), nullable=False)  # healthy, degraded, unhealthy, unknown
    checks = Column(JSON, nullable=True)  # Detailed check results as JSON
    response_time_ms = Column(Integer, nullable=True)  # Response time in milliseconds
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    # Indexes for efficient querying
    __table_args__ = (
        Index('idx_service_timestamp', 'service_name', 'timestamp'),
        Index('idx_status_timestamp', 'status', 'timestamp'),
    )
    
    def __repr__(self):
        return f"<ServiceHealthCheck(service={self.service_name}, status={self.status}, timestamp={self.timestamp})>"
    
    def to_dict(self):
        """Convert health check to dictionary for API responses"""
        return {
            'id': self.id,
            'service_name': self.service_name,
            'status': self.status,
            'checks': self.checks,
            'response_time_ms': self.response_time_ms,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None
        }

class ServiceHealthAlert(Base):
    """
    Stores health alerts for degraded or unhealthy services
    
    Tracks:
    - When a service became unhealthy
    - When it was resolved (if applicable)
    - Alert severity level
    - Alert message
    """
    __tablename__ = 'service_health_alerts'
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    service_name = Column(String(100), nullable=False, index=True)
    severity = Column(String(20), nullable=False)  # warning, critical
    message = Column(String(500), nullable=False)
    status = Column(String(20), nullable=False, default='active')  # active, resolved
    triggered_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    
    # Indexes
    __table_args__ = (
        Index('idx_alert_service_status', 'service_name', 'status'),
        Index('idx_alert_triggered', 'triggered_at'),
    )
    
    def __repr__(self):
        return f"<ServiceHealthAlert(service={self.service_name}, severity={self.severity}, status={self.status})>"
    
    def to_dict(self):
        """Convert alert to dictionary for API responses"""
        return {
            'id': self.id,
            'service_name': self.service_name,
            'severity': self.severity,
            'message': self.message,
            'status': self.status,
            'triggered_at': self.triggered_at.isoformat() if self.triggered_at else None,
            'resolved_at': self.resolved_at.isoformat() if self.resolved_at else None
        }
