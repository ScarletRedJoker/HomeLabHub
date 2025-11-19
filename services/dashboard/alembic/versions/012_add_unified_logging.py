"""add unified logging

Revision ID: 012_add_unified_logging
Revises: 011_add_health_monitoring
Create Date: 2025-11-19 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = '012_add_unified_logging'
down_revision = '011_add_health_monitoring'
branch_labels = None
depends_on = None


def upgrade():
    """Create unified_logs table and indexes"""
    op.create_table(
        'unified_logs',
        sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
        sa.Column('service', sa.String(length=100), nullable=False),
        sa.Column('container_id', sa.String(length=64), nullable=True),
        sa.Column('log_level', sa.String(length=20), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column('extra_metadata', JSON, nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('idx_service', 'unified_logs', ['service'])
    op.create_index('idx_log_level', 'unified_logs', ['log_level'])
    op.create_index('idx_timestamp', 'unified_logs', ['timestamp'])
    
    op.create_index('idx_service_timestamp', 'unified_logs', ['service', 'timestamp'])
    op.create_index('idx_log_level_timestamp', 'unified_logs', ['log_level', 'timestamp'])
    op.create_index('idx_service_level_timestamp', 'unified_logs', ['service', 'log_level', 'timestamp'])
    
    op.execute("""
        CREATE INDEX idx_message_fulltext ON unified_logs USING gin(to_tsvector('english', message));
    """)


def downgrade():
    """Drop unified_logs table and indexes"""
    op.drop_index('idx_message_fulltext', 'unified_logs')
    op.drop_index('idx_service_level_timestamp', 'unified_logs')
    op.drop_index('idx_log_level_timestamp', 'unified_logs')
    op.drop_index('idx_service_timestamp', 'unified_logs')
    op.drop_index('idx_timestamp', 'unified_logs')
    op.drop_index('idx_log_level', 'unified_logs')
    op.drop_index('idx_service', 'unified_logs')
    op.drop_table('unified_logs')
