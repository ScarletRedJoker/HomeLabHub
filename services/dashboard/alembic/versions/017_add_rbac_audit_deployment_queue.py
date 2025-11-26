"""Add RBAC, Audit Trail, and Deployment Queue tables

Revision ID: 017_add_rbac_audit_deployment_queue
Revises: 016_marketplace_deployments
Create Date: 2025-11-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '017_add_rbac_audit_deployment_queue'
down_revision = '016_marketplace_deployments'
branch_labels = None
depends_on = None


def upgrade():
    user_role_enum = postgresql.ENUM('admin', 'operator', 'viewer', name='userrole', create_type=False)
    deployment_status_enum = postgresql.ENUM(
        'pending', 'queued', 'pulling_image', 'creating_container', 'configuring',
        'starting', 'running', 'completed', 'failed', 'rolling_back', 'rolled_back', 'cancelled',
        name='deploymentstatus', create_type=False
    )
    
    connection = op.get_bind()
    
    result = connection.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'userrole'"))
    if not result.fetchone():
        user_role_enum.create(connection)
    
    result = connection.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'deploymentstatus'"))
    if not result.fetchone():
        deployment_status_enum.create(connection)
    
    if not table_exists('users'):
        op.create_table(
            'users',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('username', sa.String(100), nullable=False),
            sa.Column('email', sa.String(255), nullable=True),
            sa.Column('role', user_role_enum, nullable=False, server_default='viewer'),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('last_login', sa.DateTime(), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_users_username', 'users', ['username'], unique=True)
        op.create_index('ix_users_email', 'users', ['email'], unique=True)
    
    if not table_exists('service_ownerships'):
        op.create_table(
            'service_ownerships',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(100), nullable=False),
            sa.Column('container_name', sa.String(100), nullable=True),
            sa.Column('permission_level', user_role_enum, nullable=False, server_default='viewer'),
            sa.Column('granted_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('granted_by', sa.String(100), nullable=True),
            sa.Column('notes', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_service_ownerships_service_name', 'service_ownerships', ['service_name'])
        op.create_index('ix_service_ownerships_user_id', 'service_ownerships', ['user_id'])
    
    if not table_exists('role_assignments'):
        op.create_table(
            'role_assignments',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('previous_role', user_role_enum, nullable=True),
            sa.Column('new_role', user_role_enum, nullable=False),
            sa.Column('assigned_by', sa.String(100), nullable=True),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('assigned_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
    
    if not table_exists('audit_logs'):
        op.create_table(
            'audit_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(100), nullable=True),
            sa.Column('username', sa.String(100), nullable=True),
            sa.Column('action', sa.String(100), nullable=False),
            sa.Column('action_category', sa.String(50), nullable=True),
            sa.Column('target_type', sa.String(100), nullable=True),
            sa.Column('target_id', sa.String(255), nullable=True),
            sa.Column('target_name', sa.String(255), nullable=True),
            sa.Column('method', sa.String(10), nullable=True),
            sa.Column('endpoint', sa.String(500), nullable=True),
            sa.Column('request_data', postgresql.JSON(), nullable=True),
            sa.Column('response_status', sa.Integer(), nullable=True),
            sa.Column('response_message', sa.Text(), nullable=True),
            sa.Column('ip_address', sa.String(45), nullable=True),
            sa.Column('user_agent', sa.String(500), nullable=True),
            sa.Column('duration_ms', sa.Integer(), nullable=True),
            sa.Column('success', sa.String(10), server_default='true'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_audit_logs_user_id', 'audit_logs', ['user_id'])
        op.create_index('ix_audit_logs_action', 'audit_logs', ['action'])
        op.create_index('ix_audit_logs_action_category', 'audit_logs', ['action_category'])
        op.create_index('ix_audit_logs_target_id', 'audit_logs', ['target_id'])
        op.create_index('ix_audit_logs_timestamp', 'audit_logs', ['timestamp'])
        op.create_index('ix_audit_user_action', 'audit_logs', ['user_id', 'action'])
        op.create_index('ix_audit_timestamp_user', 'audit_logs', ['timestamp', 'user_id'])
        op.create_index('ix_audit_target', 'audit_logs', ['target_type', 'target_id'])
    
    if not table_exists('deployment_queue'):
        op.create_table(
            'deployment_queue',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('deployment_id', sa.String(100), nullable=False),
            sa.Column('template_id', sa.String(100), nullable=False),
            sa.Column('category', sa.String(50), nullable=True),
            sa.Column('app_name', sa.String(100), nullable=False),
            sa.Column('status', deployment_status_enum, nullable=False, server_default='pending'),
            sa.Column('progress', sa.Float(), server_default='0.0'),
            sa.Column('current_step', sa.String(200), nullable=True),
            sa.Column('total_steps', sa.Integer(), server_default='5'),
            sa.Column('current_step_number', sa.Integer(), server_default='0'),
            sa.Column('variables', postgresql.JSON(), nullable=True),
            sa.Column('compose_path', sa.String(500), nullable=True),
            sa.Column('container_id', sa.String(100), nullable=True),
            sa.Column('container_name', sa.String(100), nullable=True),
            sa.Column('started_by', sa.String(100), nullable=True),
            sa.Column('celery_task_id', sa.String(100), nullable=True),
            sa.Column('rollback_available', sa.Boolean(), server_default='false'),
            sa.Column('rollback_snapshot', postgresql.JSON(), nullable=True),
            sa.Column('previous_state', postgresql.JSON(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('error_details', postgresql.JSON(), nullable=True),
            sa.Column('logs', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_deployment_queue_deployment_id', 'deployment_queue', ['deployment_id'], unique=True)
        op.create_index('ix_deployment_queue_status', 'deployment_queue', ['status'])
        op.create_index('ix_deployment_queue_celery_task_id', 'deployment_queue', ['celery_task_id'])
    
    if not table_exists('deployment_logs'):
        op.create_table(
            'deployment_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('deployment_id', sa.String(100), nullable=False),
            sa.Column('level', sa.String(20), server_default='info'),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('step', sa.String(100), nullable=True),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_deployment_logs_deployment_id', 'deployment_logs', ['deployment_id'])


def downgrade():
    op.drop_table('deployment_logs')
    op.drop_table('deployment_queue')
    op.drop_table('audit_logs')
    op.drop_table('role_assignments')
    op.drop_table('service_ownerships')
    op.drop_table('users')
    
    connection = op.get_bind()
    connection.execute(sa.text("DROP TYPE IF EXISTS deploymentstatus"))
    connection.execute(sa.text("DROP TYPE IF EXISTS userrole"))


def table_exists(table_name):
    """Check if a table exists in the database"""
    connection = op.get_bind()
    result = connection.execute(
        sa.text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')")
    )
    return result.scalar()
