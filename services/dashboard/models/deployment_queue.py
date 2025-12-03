"""
Deployment Queue Model
Tracks marketplace app installations with progress and rollback support
"""
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, Boolean, Float, Enum as SQLEnum
from datetime import datetime
import enum
from models import Base


class DeploymentStatus(enum.Enum):
    """Status of a deployment in the queue"""
    PENDING = "pending"
    QUEUED = "queued"
    PULLING_IMAGE = "pulling_image"
    CREATING_CONTAINER = "creating_container"
    CONFIGURING = "configuring"
    STARTING = "starting"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLING_BACK = "rolling_back"
    ROLLED_BACK = "rolled_back"
    CANCELLED = "cancelled"


class DeploymentQueue(Base):
    """Deployment queue entry for async app installations"""
    __tablename__ = 'deployment_queue'
    
    id = Column(Integer, primary_key=True)
    deployment_id = Column(String(100), unique=True, nullable=False, index=True)
    
    template_id = Column(String(100), nullable=False)
    category = Column(String(50), nullable=True)
    app_name = Column(String(100), nullable=False)
    
    status = Column(SQLEnum(DeploymentStatus, name='queuedeploymentstatus', create_type=False), default=DeploymentStatus.PENDING, nullable=False, index=True)
    progress = Column(Float, default=0.0)
    current_step = Column(String(200), nullable=True)
    total_steps = Column(Integer, default=5)
    current_step_number = Column(Integer, default=0)
    
    variables = Column(JSON, nullable=True)
    compose_path = Column(String(500), nullable=True)
    container_id = Column(String(100), nullable=True)
    container_name = Column(String(100), nullable=True)
    
    started_by = Column(String(100), nullable=True)
    
    celery_task_id = Column(String(100), nullable=True, index=True)
    
    rollback_available = Column(Boolean, default=False)
    rollback_snapshot = Column(JSON, nullable=True)
    previous_state = Column(JSON, nullable=True)
    
    error_message = Column(Text, nullable=True)
    error_details = Column(JSON, nullable=True)
    
    logs = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    
    metadata_json = Column(JSON, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'deployment_id': self.deployment_id,
            'template_id': self.template_id,
            'category': self.category,
            'app_name': self.app_name,
            'status': self.status.value if self.status else None,
            'progress': {
                'percent': self.progress,
                'current_step': self.current_step,
                'step_number': self.current_step_number,
                'total_steps': self.total_steps
            },
            'container': {
                'id': self.container_id,
                'name': self.container_name
            },
            'started_by': self.started_by,
            'celery_task_id': self.celery_task_id,
            'rollback': {
                'available': self.rollback_available,
                'has_snapshot': self.rollback_snapshot is not None
            },
            'error': {
                'message': self.error_message,
                'details': self.error_details
            } if self.error_message else None,
            'timestamps': {
                'created': self.created_at.isoformat() if self.created_at else None,
                'started': self.started_at.isoformat() if self.started_at else None,
                'completed': self.completed_at.isoformat() if self.completed_at else None
            },
            'metadata': self.metadata_json
        }
    
    def update_progress(self, step_number: int, step_name: str, percent: float = None):
        """Update deployment progress"""
        self.current_step_number = step_number
        self.current_step = step_name
        if percent is not None:
            self.progress = percent
        else:
            self.progress = (step_number / self.total_steps) * 100
    
    def mark_started(self):
        """Mark deployment as started"""
        self.status = DeploymentStatus.PULLING_IMAGE
        self.started_at = datetime.utcnow()
    
    def mark_completed(self, container_id: str = None, container_name: str = None):
        """Mark deployment as completed"""
        self.status = DeploymentStatus.COMPLETED
        self.completed_at = datetime.utcnow()
        self.progress = 100.0
        self.current_step = "Completed"
        if container_id:
            self.container_id = container_id
        if container_name:
            self.container_name = container_name
        self.rollback_available = True
    
    def mark_failed(self, error_message: str, error_details: dict = None):
        """Mark deployment as failed"""
        self.status = DeploymentStatus.FAILED
        self.completed_at = datetime.utcnow()
        self.error_message = error_message
        self.error_details = error_details
        self.rollback_available = self.rollback_snapshot is not None
    
    def create_rollback_snapshot(self, state: dict):
        """Create a snapshot for rollback"""
        self.rollback_snapshot = {
            'state': state,
            'created_at': datetime.utcnow().isoformat()
        }
        self.previous_state = state
        self.rollback_available = True


class DeploymentLog(Base):
    """Individual log entries for deployment progress"""
    __tablename__ = 'deployment_logs'
    
    id = Column(Integer, primary_key=True)
    deployment_id = Column(String(100), nullable=False, index=True)
    
    level = Column(String(20), default='info')
    message = Column(Text, nullable=False)
    step = Column(String(100), nullable=True)
    
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    metadata_json = Column(JSON, nullable=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'deployment_id': self.deployment_id,
            'level': self.level,
            'message': self.message,
            'step': self.step,
            'timestamp': self.timestamp.isoformat() if self.timestamp else None,
            'metadata': self.metadata_json
        }


__all__ = ['DeploymentQueue', 'DeploymentStatus', 'DeploymentLog']
