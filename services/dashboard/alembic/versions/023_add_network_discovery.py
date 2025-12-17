"""Add network discovery tables

Revision ID: 023_add_network_discovery
Revises: 022_add_multi_tenant_org
Create Date: 2025-12-17

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '023_add_network_discovery'
down_revision = '022_add_multi_tenant_org'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'network_resources',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('org_id', postgresql.UUID(as_uuid=True), nullable=True, index=True),
        sa.Column('resource_type', sa.String(20), nullable=False, index=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('preferred_endpoint', sa.String(255), nullable=True),
        sa.Column('discovered_endpoints', postgresql.JSONB, nullable=True, server_default='[]'),
        sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True),
        sa.Column('health_status', sa.String(20), server_default='unknown'),
        sa.Column('discovery_method', sa.String(50), nullable=True),
        sa.Column('ports', postgresql.JSONB, nullable=True, server_default='{}'),
        sa.Column('resource_metadata', postgresql.JSONB, nullable=True, server_default='{}'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )
    
    op.create_index('ix_network_resources_name', 'network_resources', ['name'])
    op.create_index('ix_network_resources_type_status', 'network_resources', ['resource_type', 'health_status'])
    
    op.create_table(
        'network_discovery_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('discovery_type', sa.String(50), nullable=False),
        sa.Column('target', sa.String(255), nullable=True),
        sa.Column('method', sa.String(50), nullable=False),
        sa.Column('success', sa.String(10), nullable=False),
        sa.Column('result', sa.Text, nullable=True),
        sa.Column('duration_ms', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    
    op.create_index('ix_network_discovery_logs_type', 'network_discovery_logs', ['discovery_type'])
    op.create_index('ix_network_discovery_logs_created', 'network_discovery_logs', ['created_at'])


def downgrade():
    op.drop_index('ix_network_discovery_logs_created', table_name='network_discovery_logs')
    op.drop_index('ix_network_discovery_logs_type', table_name='network_discovery_logs')
    op.drop_table('network_discovery_logs')
    
    op.drop_index('ix_network_resources_type_status', table_name='network_resources')
    op.drop_index('ix_network_resources_name', table_name='network_resources')
    op.drop_table('network_resources')
