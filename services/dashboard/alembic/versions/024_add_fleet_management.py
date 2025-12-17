"""Add fleet management tables

Revision ID: 024_fleet_management
Revises: 023_add_network_discovery
Create Date: 2025-12-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '024_fleet_management'
down_revision = '023_add_network_discovery'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('fleet_hosts',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('host_id', sa.String(50), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('tailscale_ip', sa.String(45), nullable=True),
        sa.Column('role', sa.String(50), server_default='worker', nullable=True),
        sa.Column('ssh_user', sa.String(50), server_default='root', nullable=True),
        sa.Column('ssh_port', sa.Integer(), server_default='22', nullable=True),
        sa.Column('ssh_key_path', sa.String(255), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=True),
        sa.Column('last_seen', sa.DateTime(), nullable=True),
        sa.Column('host_metadata', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('host_id')
    )
    
    op.create_table('fleet_commands',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('host_id', sa.String(50), nullable=False),
        sa.Column('command', sa.Text(), nullable=False),
        sa.Column('output', sa.Text(), nullable=True),
        sa.Column('exit_code', sa.Integer(), nullable=True),
        sa.Column('executed_by', sa.String(100), nullable=True),
        sa.Column('executed_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index('idx_fleet_commands_host', 'fleet_commands', ['host_id'], unique=False)
    op.create_index('idx_fleet_commands_executed', 'fleet_commands', ['executed_at'], unique=False)
    op.create_index('idx_fleet_hosts_active', 'fleet_hosts', ['is_active'], unique=False)


def downgrade():
    op.drop_index('idx_fleet_hosts_active', table_name='fleet_hosts')
    op.drop_index('idx_fleet_commands_executed', table_name='fleet_commands')
    op.drop_index('idx_fleet_commands_host', table_name='fleet_commands')
    op.drop_table('fleet_commands')
    op.drop_table('fleet_hosts')
