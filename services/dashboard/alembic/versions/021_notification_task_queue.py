"""Add notification and task queue tables

Revision ID: 021_notification_task_queue
Revises: 020_add_system_settings
Create Date: 2024-12-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '021_notification_task_queue'
down_revision = '020_system_settings'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('alerts',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(length=20), nullable=False, server_default='info'),
        sa.Column('channels_sent', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('source', sa.String(length=100), nullable=True),
        sa.Column('source_id', sa.String(length=100), nullable=True),
        sa.Column('metadata_json', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('read', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('dismissed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_alerts_severity', 'alerts', ['severity'], unique=False)
    op.create_index('ix_alerts_read', 'alerts', ['read'], unique=False)
    op.create_index('ix_alerts_dismissed', 'alerts', ['dismissed'], unique=False)
    op.create_index('ix_alerts_created_at', 'alerts', ['created_at'], unique=False)
    op.create_index('ix_alerts_source', 'alerts', ['source'], unique=False)
    op.create_index('ix_alerts_severity_read', 'alerts', ['severity', 'read'], unique=False)
    op.create_index('ix_alerts_created_at_read', 'alerts', ['created_at', 'read'], unique=False)
    
    op.create_table('notification_settings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=False, server_default='default'),
        sa.Column('discord_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('web_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('discord_webhook_override', sa.String(length=500), nullable=True),
        sa.Column('email_address', sa.String(length=255), nullable=True),
        sa.Column('quiet_hours_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('quiet_hours_start', sa.Time(), nullable=True),
        sa.Column('quiet_hours_end', sa.Time(), nullable=True),
        sa.Column('default_sla_hours', sa.Integer(), nullable=False, server_default='24'),
        sa.Column('severity_filter', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_notification_settings_user_id', 'notification_settings', ['user_id'], unique=True)
    
    op.add_column('tasks', sa.Column('sla_deadline', sa.DateTime(timezone=True), nullable=True))
    op.add_column('tasks', sa.Column('notes', sa.Text(), nullable=True))


def downgrade():
    op.drop_column('tasks', 'notes')
    op.drop_column('tasks', 'sla_deadline')
    
    op.drop_index('ix_notification_settings_user_id', table_name='notification_settings')
    op.drop_table('notification_settings')
    
    op.drop_index('ix_alerts_created_at_read', table_name='alerts')
    op.drop_index('ix_alerts_severity_read', table_name='alerts')
    op.drop_index('ix_alerts_source', table_name='alerts')
    op.drop_index('ix_alerts_created_at', table_name='alerts')
    op.drop_index('ix_alerts_dismissed', table_name='alerts')
    op.drop_index('ix_alerts_read', table_name='alerts')
    op.drop_index('ix_alerts_severity', table_name='alerts')
    op.drop_table('alerts')
