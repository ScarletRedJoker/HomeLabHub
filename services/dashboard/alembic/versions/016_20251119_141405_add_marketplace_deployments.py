"""Add marketplace_deployments table

Revision ID: 016_marketplace_deployments
Revises: 015_add_session_metrics
Create Date: 2025-11-19 14:14:05.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '016_marketplace_deployments'
down_revision = '015_add_session_metrics'
branch_labels = None
depends_on = None


def upgrade():
    """Add marketplace_deployments table for template-based app installations"""
    
    op.create_table(
        'marketplace_deployments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('template_id', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('variables', sa.JSON(), nullable=False),
        sa.Column('compose_path', sa.String(length=500), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='installing'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for better query performance
    op.create_index(
        'ix_marketplace_deployments_template_id',
        'marketplace_deployments',
        ['template_id']
    )
    
    op.create_index(
        'ix_marketplace_deployments_status',
        'marketplace_deployments',
        ['status']
    )
    
    # Create trigger to auto-update updated_at timestamp
    op.execute("""
        CREATE OR REPLACE FUNCTION update_marketplace_deployments_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    
    op.execute("""
        CREATE TRIGGER trigger_marketplace_deployments_updated_at
        BEFORE UPDATE ON marketplace_deployments
        FOR EACH ROW
        EXECUTE FUNCTION update_marketplace_deployments_updated_at();
    """)


def downgrade():
    """Remove marketplace_deployments table"""
    
    op.execute('DROP TRIGGER IF EXISTS trigger_marketplace_deployments_updated_at ON marketplace_deployments')
    op.execute('DROP FUNCTION IF EXISTS update_marketplace_deployments_updated_at()')
    
    op.drop_index('ix_marketplace_deployments_status', table_name='marketplace_deployments')
    op.drop_index('ix_marketplace_deployments_template_id', table_name='marketplace_deployments')
    op.drop_table('marketplace_deployments')
