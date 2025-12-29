"""Add monitoring alerts system tables

Revision ID: 027_add_monitoring_alerts
Revises: 026_expand_studio_languages
Create Date: 2025-12-29

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '027_add_monitoring_alerts'
down_revision = '026_expand_studio_languages'
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database"""
    connection = op.get_bind()
    result = connection.execute(sa.text(
        f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')"
    ))
    return result.scalar()


def enum_exists(enum_name):
    """Check if an enum type exists"""
    connection = op.get_bind()
    result = connection.execute(sa.text(f"SELECT 1 FROM pg_type WHERE typname = '{enum_name}'"))
    return result.fetchone() is not None


def upgrade():
    connection = op.get_bind()
    
    if not enum_exists('alerttype'):
        alert_type_enum = postgresql.ENUM(
            'cpu', 'memory', 'disk', 'service', 'custom',
            name='alerttype', create_type=True
        )
        alert_type_enum.create(connection)
    
    if not enum_exists('alertcondition'):
        alert_condition_enum = postgresql.ENUM(
            'gt', 'lt', 'eq', 'ne', 'gte', 'lte',
            name='alertcondition', create_type=True
        )
        alert_condition_enum.create(connection)
    
    if not enum_exists('notificationtype'):
        notification_type_enum = postgresql.ENUM(
            'discord_webhook', 'email', 'push', 'slack_webhook',
            name='notificationtype', create_type=True
        )
        notification_type_enum.create(connection)
    
    if not table_exists('monitoring_alerts'):
        op.create_table(
            'monitoring_alerts',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('alert_type', postgresql.ENUM('cpu', 'memory', 'disk', 'service', 'custom', name='alerttype', create_type=False), nullable=False),
            sa.Column('condition', postgresql.ENUM('gt', 'lt', 'eq', 'ne', 'gte', 'lte', name='alertcondition', create_type=False), nullable=False),
            sa.Column('threshold', sa.Float(), nullable=False, server_default='80.0'),
            sa.Column('target', sa.String(255), nullable=True),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('cooldown_minutes', sa.Integer(), nullable=False, server_default='5'),
            sa.Column('last_triggered', sa.DateTime(), nullable=True),
            sa.Column('trigger_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_monitoring_alerts_enabled', 'monitoring_alerts', ['enabled'])
        op.create_index('ix_monitoring_alerts_alert_type', 'monitoring_alerts', ['alert_type'])
    
    if not table_exists('monitoring_alert_notifications'):
        op.create_table(
            'monitoring_alert_notifications',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('alert_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('notification_type', postgresql.ENUM('discord_webhook', 'email', 'push', 'slack_webhook', name='notificationtype', create_type=False), nullable=False),
            sa.Column('destination', sa.String(512), nullable=False),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['alert_id'], ['monitoring_alerts.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_monitoring_alert_notifications_alert', 'monitoring_alert_notifications', ['alert_id'])
    
    if not table_exists('monitoring_alert_history'):
        op.create_table(
            'monitoring_alert_history',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('alert_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('triggered_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.Column('value', sa.Float(), nullable=True),
            sa.Column('threshold', sa.Float(), nullable=True),
            sa.Column('resolved_at', sa.DateTime(), nullable=True),
            sa.Column('acknowledged', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
            sa.Column('acknowledged_by', sa.String(255), nullable=True),
            sa.Column('notification_sent', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('notification_result', postgresql.JSON(), nullable=True),
            sa.ForeignKeyConstraint(['alert_id'], ['monitoring_alerts.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_monitoring_alert_history_triggered_at', 'monitoring_alert_history', ['triggered_at'])
        op.create_index('ix_monitoring_alert_history_acknowledged', 'monitoring_alert_history', ['acknowledged'])
        op.create_index('ix_monitoring_alert_history_alert', 'monitoring_alert_history', ['alert_id'])


def downgrade():
    op.drop_table('monitoring_alert_history')
    op.drop_table('monitoring_alert_notifications')
    op.drop_table('monitoring_alerts')
    
    connection = op.get_bind()
    connection.execute(sa.text("DROP TYPE IF EXISTS notificationtype"))
    connection.execute(sa.text("DROP TYPE IF EXISTS alertcondition"))
    connection.execute(sa.text("DROP TYPE IF EXISTS alerttype"))
