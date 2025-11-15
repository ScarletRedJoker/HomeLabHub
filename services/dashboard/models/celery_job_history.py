from sqlalchemy import Column, String, Integer, Float, DateTime, Text, Enum, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
import uuid
import enum
from models import Base


class JobStatus(enum.Enum):
    """Status of a Celery job"""
    PENDING = "pending"
    STARTED = "started"
    SUCCESS = "success"
    FAILURE = "failure"
    RETRY = "retry"
    REVOKED = "revoked"


class CeleryJobHistory(Base):
    """Track execution history of Celery jobs"""
    __tablename__ = 'celery_job_history'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(String(255), unique=True, nullable=False, index=True)
    task_name = Column(String(255), nullable=False, index=True)
    queue = Column(String(100), nullable=True, index=True)
    worker = Column(String(255), nullable=True)
    
    # Execution details
    status = Column(Enum(JobStatus), nullable=False, default=JobStatus.PENDING, index=True)
    args = Column(JSON, nullable=True)
    kwargs = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
    
    # Timing
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    execution_time = Column(Float, nullable=True)  # seconds
    
    # Error handling
    error_message = Column(Text, nullable=True)
    traceback = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    max_retries = Column(Integer, nullable=False, default=3)
    
    # Dead letter queue
    is_dead_letter = Column(Integer, nullable=False, default=0, index=True)
    dead_letter_reason = Column(Text, nullable=True)
    
    def __repr__(self):
        return f"<CeleryJobHistory(task_id='{self.task_id}', task_name='{self.task_name}', status='{self.status.value}')>"
    
    def to_dict(self):
        """Convert to dictionary for API responses"""
        return {
            'id': str(self.id),
            'task_id': self.task_id,
            'task_name': self.task_name,
            'queue': self.queue,
            'worker': self.worker,
            'status': self.status.value,
            'args': self.args,
            'kwargs': self.kwargs,
            'result': self.result,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'execution_time': self.execution_time,
            'error_message': self.error_message,
            'retry_count': self.retry_count,
            'max_retries': self.max_retries,
            'is_dead_letter': bool(self.is_dead_letter),
            'dead_letter_reason': self.dead_letter_reason
        }
    
    @classmethod
    def get_success_rate(cls, session, hours=24):
        """Calculate success rate for last N hours"""
        from sqlalchemy import func
        from datetime import timedelta
        
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        total = session.query(func.count(cls.id)).filter(
            cls.created_at >= cutoff
        ).scalar() or 0
        
        if total == 0:
            return 100.0
        
        successful = session.query(func.count(cls.id)).filter(
            cls.created_at >= cutoff,
            cls.status == JobStatus.SUCCESS
        ).scalar() or 0
        
        return (successful / total) * 100.0
    
    @classmethod
    def get_most_failing_tasks(cls, session, limit=10, hours=24):
        """Get tasks with highest failure rate"""
        from sqlalchemy import func
        from datetime import timedelta
        
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        return session.query(
            cls.task_name,
            func.count(cls.id).label('total_count'),
            func.sum(func.cast(cls.status == JobStatus.FAILURE, Integer)).label('failure_count')
        ).filter(
            cls.created_at >= cutoff
        ).group_by(
            cls.task_name
        ).order_by(
            func.sum(func.cast(cls.status == JobStatus.FAILURE, Integer)).desc()
        ).limit(limit).all()
    
    @classmethod
    def get_hourly_stats(cls, session, hours=24):
        """Get job execution stats per hour"""
        from sqlalchemy import func, extract
        from datetime import timedelta
        
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        return session.query(
            func.date_trunc('hour', cls.created_at).label('hour'),
            func.count(cls.id).label('total'),
            func.sum(func.cast(cls.status == JobStatus.SUCCESS, Integer)).label('success'),
            func.sum(func.cast(cls.status == JobStatus.FAILURE, Integer)).label('failure'),
            func.avg(cls.execution_time).label('avg_execution_time')
        ).filter(
            cls.created_at >= cutoff
        ).group_by(
            func.date_trunc('hour', cls.created_at)
        ).order_by(
            func.date_trunc('hour', cls.created_at)
        ).all()
    
    @classmethod
    def get_average_execution_time(cls, session, task_name=None, hours=24):
        """Get average execution time for tasks"""
        from sqlalchemy import func
        from datetime import timedelta
        
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        query = session.query(func.avg(cls.execution_time)).filter(
            cls.created_at >= cutoff,
            cls.status == JobStatus.SUCCESS,
            cls.execution_time.isnot(None)
        )
        
        if task_name:
            query = query.filter(cls.task_name == task_name)
        
        result = query.scalar()
        return result if result else 0.0
