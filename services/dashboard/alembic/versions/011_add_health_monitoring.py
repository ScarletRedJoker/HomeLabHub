"""add health monitoring

Revision ID: 011_add_health_monitoring
Revises: 010
Create Date: 2025-11-19 08:54:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '011_add_health_monitoring'
down_revision = '010'
branch_labels = None
depends_on = None


def upgrade():
    # Helper to check if table exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Create service_health_checks table (idempotent)
    if 'service_health_checks' not in existing_tables:
        op.create_table(
            'service_health_checks',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(length=100), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False),
            sa.Column('checks', postgresql.JSON(astext_type=sa.Text()), nullable=True),
            sa.Column('response_time_ms', sa.Integer(), nullable=True),
            sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_service_timestamp', 'service_health_checks', ['service_name', 'timestamp'])
        op.create_index('idx_status_timestamp', 'service_health_checks', ['status', 'timestamp'])
        op.create_index('ix_service_health_checks_service_name', 'service_health_checks', ['service_name'])
        op.create_index('ix_service_health_checks_timestamp', 'service_health_checks', ['timestamp'])
    
    # Create service_health_alerts table (idempotent)
    if 'service_health_alerts' not in existing_tables:
        op.create_table(
            'service_health_alerts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(length=100), nullable=False),
            sa.Column('severity', sa.String(length=20), nullable=False),
            sa.Column('message', sa.String(length=500), nullable=False),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
            sa.Column('triggered_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
            sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('idx_alert_service_status', 'service_health_alerts', ['service_name', 'status'])
        op.create_index('idx_alert_triggered', 'service_health_alerts', ['triggered_at'])
        op.create_index('ix_service_health_alerts_service_name', 'service_health_alerts', ['service_name'])


def downgrade():
    # Drop service_health_alerts table
    op.drop_index('ix_service_health_alerts_service_name', 'service_health_alerts')
    op.drop_index('idx_alert_triggered', 'service_health_alerts')
    op.drop_index('idx_alert_service_status', 'service_health_alerts')
    op.drop_table('service_health_alerts')
    
    # Drop service_health_checks table
    op.drop_index('ix_service_health_checks_timestamp', 'service_health_checks')
    op.drop_index('ix_service_health_checks_service_name', 'service_health_checks')
    op.drop_index('idx_status_timestamp', 'service_health_checks')
    op.drop_index('idx_service_timestamp', 'service_health_checks')
    op.drop_table('service_health_checks')
