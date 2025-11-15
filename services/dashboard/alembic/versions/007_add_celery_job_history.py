"""Add Celery Job History table for job tracking

Revision ID: 007
Revises: 006
Create Date: 2025-11-15

Adds the celery_job_history table to track Celery job execution history,
retry attempts, failures, and dead letter queue for monitoring and analytics.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSON
import uuid

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'celery_job_history',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('task_id', sa.String(255), unique=True, nullable=False),
        sa.Column('task_name', sa.String(255), nullable=False),
        sa.Column('queue', sa.String(100), nullable=True),
        sa.Column('worker', sa.String(255), nullable=True),
        sa.Column('status', sa.Enum('PENDING', 'STARTED', 'SUCCESS', 'FAILURE', 'RETRY', 'REVOKED', name='jobstatus'), nullable=False, server_default='PENDING'),
        sa.Column('args', JSON, nullable=True),
        sa.Column('kwargs', JSON, nullable=True),
        sa.Column('result', JSON, nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('started_at', sa.DateTime, nullable=True),
        sa.Column('completed_at', sa.DateTime, nullable=True),
        sa.Column('execution_time', sa.Float, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('traceback', sa.Text, nullable=True),
        sa.Column('retry_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('max_retries', sa.Integer, nullable=False, server_default='3'),
        sa.Column('is_dead_letter', sa.Integer, nullable=False, server_default='0'),
        sa.Column('dead_letter_reason', sa.Text, nullable=True),
    )
    
    # Create indexes for efficient querying
    op.create_index('idx_celery_job_history_task_id', 'celery_job_history', ['task_id'])
    op.create_index('idx_celery_job_history_task_name', 'celery_job_history', ['task_name'])
    op.create_index('idx_celery_job_history_queue', 'celery_job_history', ['queue'])
    op.create_index('idx_celery_job_history_status', 'celery_job_history', ['status'])
    op.create_index('idx_celery_job_history_created_at', 'celery_job_history', ['created_at'])
    op.create_index('idx_celery_job_history_is_dead_letter', 'celery_job_history', ['is_dead_letter'])
    
    # Composite index for analytics queries
    op.create_index('idx_celery_job_history_status_created', 'celery_job_history', ['status', 'created_at'])
    op.create_index('idx_celery_job_history_task_name_created', 'celery_job_history', ['task_name', 'created_at'])

def downgrade():
    op.drop_index('idx_celery_job_history_task_name_created', 'celery_job_history')
    op.drop_index('idx_celery_job_history_status_created', 'celery_job_history')
    op.drop_index('idx_celery_job_history_is_dead_letter', 'celery_job_history')
    op.drop_index('idx_celery_job_history_created_at', 'celery_job_history')
    op.drop_index('idx_celery_job_history_status', 'celery_job_history')
    op.drop_index('idx_celery_job_history_queue', 'celery_job_history')
    op.drop_index('idx_celery_job_history_task_name', 'celery_job_history')
    op.drop_index('idx_celery_job_history_task_id', 'celery_job_history')
    op.drop_table('celery_job_history')
    
    op.execute('DROP TYPE IF EXISTS jobstatus')
