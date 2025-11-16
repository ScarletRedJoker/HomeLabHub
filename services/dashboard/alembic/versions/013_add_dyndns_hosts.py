"""Add DynDNS hosts table for PowerDNS automation

Revision ID: 013
Revises: 012
Create Date: 2025-11-16

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '013'
down_revision = '012'
branch_labels = None
depends_on = None


def upgrade():
    """Create dyndns_hosts table for PowerDNS DynDNS automation"""
    op.create_table(
        'dyndns_hosts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('zone', sa.String(length=255), nullable=False),
        sa.Column('fqdn', sa.String(length=255), nullable=False),
        sa.Column('record_type', sa.String(length=10), nullable=False, server_default='A'),
        sa.Column('last_ip', sa.String(length=45), nullable=True),
        sa.Column('check_interval_seconds', sa.Integer(), nullable=False, server_default='300'),
        sa.Column('last_checked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('failure_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('fqdn', name='uq_dyndns_hosts_fqdn')
    )
    
    # Create index on enabled column for faster queries
    op.create_index('ix_dyndns_hosts_enabled', 'dyndns_hosts', ['enabled'])
    
    # Create index on zone for faster lookups
    op.create_index('ix_dyndns_hosts_zone', 'dyndns_hosts', ['zone'])


def downgrade():
    """Remove dyndns_hosts table"""
    op.drop_index('ix_dyndns_hosts_zone', table_name='dyndns_hosts')
    op.drop_index('ix_dyndns_hosts_enabled', table_name='dyndns_hosts')
    op.drop_table('dyndns_hosts')
