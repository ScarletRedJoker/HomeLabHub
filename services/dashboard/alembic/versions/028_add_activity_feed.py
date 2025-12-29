"""Add activity feed tables

Revision ID: 028_activity_feed
Revises: 027_add_monitoring_alerts
Create Date: 2025-01-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '028_activity_feed'
down_revision = '027_add_monitoring_alerts'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    
    source_service_enum = postgresql.ENUM(
        'dashboard', 'discord', 'stream', 'jarvis', 'docker', 'studio', 
        'system', 'deployment', 'monitoring',
        name='sourceservice',
        create_type=False
    )
    source_service_enum.create(bind, checkfirst=True)
    
    severity_enum = postgresql.ENUM(
        'info', 'warning', 'error', 'success',
        name='eventseverity',
        create_type=False
    )
    severity_enum.create(bind, checkfirst=True)
    
    op.create_table(
        'activity_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('source_service', source_service_enum, nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('event_metadata', postgresql.JSON, nullable=True),
        sa.Column('severity', severity_enum, nullable=False, server_default='info'),
        sa.Column('user_id', sa.String(255), nullable=True),
        sa.Column('icon', sa.String(50), nullable=True),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('year_month', sa.String(7), nullable=True),
    )
    
    op.create_index('ix_activity_events_event_type', 'activity_events', ['event_type'])
    op.create_index('ix_activity_events_source_service', 'activity_events', ['source_service'])
    op.create_index('ix_activity_events_severity', 'activity_events', ['severity'])
    op.create_index('ix_activity_events_user_id', 'activity_events', ['user_id'])
    op.create_index('ix_activity_events_created_at', 'activity_events', ['created_at'])
    op.create_index('ix_activity_events_year_month', 'activity_events', ['year_month'])
    op.create_index('ix_activity_events_source_created', 'activity_events', ['source_service', 'created_at'])
    op.create_index('ix_activity_events_type_created', 'activity_events', ['event_type', 'created_at'])
    op.create_index('ix_activity_events_severity_created', 'activity_events', ['severity', 'created_at'])
    op.create_index('ix_activity_events_user_created', 'activity_events', ['user_id', 'created_at'])
    
    op.create_table(
        'activity_subscriptions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', sa.String(255), nullable=False, unique=True),
        sa.Column('event_types', postgresql.JSON, nullable=True),
        sa.Column('source_services', postgresql.JSON, nullable=True),
        sa.Column('severities', postgresql.JSON, nullable=True),
        sa.Column('enabled', sa.Boolean, server_default='true'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    
    op.create_index('ix_activity_subscriptions_user_id', 'activity_subscriptions', ['user_id'])


def downgrade():
    op.drop_table('activity_subscriptions')
    
    op.drop_index('ix_activity_events_user_created', table_name='activity_events')
    op.drop_index('ix_activity_events_severity_created', table_name='activity_events')
    op.drop_index('ix_activity_events_type_created', table_name='activity_events')
    op.drop_index('ix_activity_events_source_created', table_name='activity_events')
    op.drop_index('ix_activity_events_year_month', table_name='activity_events')
    op.drop_index('ix_activity_events_created_at', table_name='activity_events')
    op.drop_index('ix_activity_events_user_id', table_name='activity_events')
    op.drop_index('ix_activity_events_severity', table_name='activity_events')
    op.drop_index('ix_activity_events_source_service', table_name='activity_events')
    op.drop_index('ix_activity_events_event_type', table_name='activity_events')
    op.drop_table('activity_events')
    
    postgresql.ENUM(name='eventseverity').drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM(name='sourceservice').drop(op.get_bind(), checkfirst=True)
