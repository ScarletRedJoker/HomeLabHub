"""add user preferences

Revision ID: 008_add_user_preferences
Revises: 007_add_celery_job_history
Create Date: 2025-11-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '008_add_user_preferences'
down_revision = '007_add_celery_job_history'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=False),
        sa.Column('dashboard_layout', JSONB, nullable=True),
        sa.Column('widget_visibility', JSONB, nullable=True),
        sa.Column('widget_order', JSONB, nullable=True),
        sa.Column('active_preset', sa.String(length=50), nullable=True),
        sa.Column('collapsed_categories', JSONB, nullable=True),
        sa.Column('pinned_pages', JSONB, nullable=True),
        sa.Column('recent_pages', JSONB, nullable=True),
        sa.Column('theme', sa.String(length=20), nullable=True),
        sa.Column('sidebar_collapsed', sa.Boolean(), nullable=True),
        sa.Column('show_breadcrumbs', sa.Boolean(), nullable=True),
        sa.Column('compact_mode', sa.Boolean(), nullable=True),
        sa.Column('custom_shortcuts', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    op.create_index(
        'ix_user_preferences_user_id',
        'user_preferences',
        ['user_id'],
        unique=True
    )


def downgrade():
    op.drop_index('ix_user_preferences_user_id', table_name='user_preferences')
    op.drop_table('user_preferences')
