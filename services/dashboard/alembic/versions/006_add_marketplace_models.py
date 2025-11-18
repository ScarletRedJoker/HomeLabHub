"""add marketplace models

Revision ID: 006_add_marketplace_models
Revises: 005_add_google_integration_models
Create Date: 2025-11-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006_add_marketplace_models'
down_revision = '005_add_google_integration_models'
branch_labels = None
depends_on = None


def upgrade():
    # Create marketplace_apps table
    op.create_table('marketplace_apps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('long_description', sa.Text(), nullable=True),
        sa.Column('icon_url', sa.String(length=500), nullable=True),
        sa.Column('screenshot_url', sa.String(length=500), nullable=True),
        sa.Column('docker_image', sa.String(length=200), nullable=False),
        sa.Column('default_port', sa.Integer(), nullable=False),
        sa.Column('requires_database', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('db_type', sa.String(length=50), nullable=True),
        sa.Column('config_template', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('env_template', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('popularity', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_marketplace_apps_slug'), 'marketplace_apps', ['slug'], unique=True)
    op.create_index(op.f('ix_marketplace_apps_category'), 'marketplace_apps', ['category'], unique=False)
    op.create_index(op.f('ix_marketplace_apps_popularity'), 'marketplace_apps', ['popularity'], unique=False)
    
    # Create deployed_apps table
    op.create_table('deployed_apps',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('app_id', sa.Integer(), nullable=False),
        sa.Column('container_name', sa.String(length=200), nullable=False),
        sa.Column('domain', sa.String(length=200), nullable=True),
        sa.Column('port', sa.Integer(), nullable=False),
        sa.Column('env_vars', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='deploying'),
        sa.Column('health_status', sa.String(length=50), nullable=False, server_default='unknown'),
        sa.Column('deployed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_check', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['app_id'], ['marketplace_apps.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_deployed_apps_container_name'), 'deployed_apps', ['container_name'], unique=True)
    op.create_index(op.f('ix_deployed_apps_app_id'), 'deployed_apps', ['app_id'], unique=False)
    op.create_index(op.f('ix_deployed_apps_status'), 'deployed_apps', ['status'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_deployed_apps_status'), table_name='deployed_apps')
    op.drop_index(op.f('ix_deployed_apps_app_id'), table_name='deployed_apps')
    op.drop_index(op.f('ix_deployed_apps_container_name'), table_name='deployed_apps')
    op.drop_table('deployed_apps')
    
    op.drop_index(op.f('ix_marketplace_apps_popularity'), table_name='marketplace_apps')
    op.drop_index(op.f('ix_marketplace_apps_category'), table_name='marketplace_apps')
    op.drop_index(op.f('ix_marketplace_apps_slug'), table_name='marketplace_apps')
    op.drop_table('marketplace_apps')
