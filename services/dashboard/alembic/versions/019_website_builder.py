"""Add Jarvis Website Builder tables

Revision ID: 019_website_builder
Revises: 018_jarvis_ai_logging
Create Date: 2025-11-30

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '019_website_builder'
down_revision = '018_jarvis_ai_logging'
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database"""
    connection = op.get_bind()
    result = connection.execute(sa.text(
        f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')"
    ))
    return result.scalar()


def upgrade():
    connection = op.get_bind()
    
    result = connection.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'builderprojectstatus'"))
    if not result.fetchone():
        builder_project_status_enum = postgresql.ENUM(
            'planning', 'scaffolding', 'building', 'reviewing', 'deploying', 'complete', 'failed', 'paused',
            name='builderprojectstatus', create_type=True
        )
        builder_project_status_enum.create(connection)
    
    result = connection.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'buildertechstack'"))
    if not result.fetchone():
        builder_tech_stack_enum = postgresql.ENUM(
            'static_html', 'flask', 'fastapi', 'express', 'react', 'vue', 'nextjs',
            name='buildertechstack', create_type=True
        )
        builder_tech_stack_enum.create(connection)
    
    result = connection.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'checkpointstatus'"))
    if not result.fetchone():
        checkpoint_status_enum = postgresql.ENUM(
            'pending', 'approved', 'rejected',
            name='checkpointstatus', create_type=True
        )
        checkpoint_status_enum.create(connection)
    
    if not table_exists('builder_projects'):
        op.create_table(
            'builder_projects',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('domain', sa.String(255), nullable=True),
            sa.Column('preview_domain', sa.String(255), nullable=True),
            sa.Column('status', postgresql.ENUM('planning', 'scaffolding', 'building', 'reviewing', 'deploying', 'complete', 'failed', 'paused', name='builderprojectstatus', create_type=False), nullable=True),
            sa.Column('tech_stack', postgresql.ENUM('static_html', 'flask', 'fastapi', 'express', 'react', 'vue', 'nextjs', name='buildertechstack', create_type=False), nullable=True),
            sa.Column('project_path', sa.Text(), nullable=True),
            sa.Column('plan', postgresql.JSONB(), nullable=True),
            sa.Column('features', postgresql.JSONB(), nullable=True),
            sa.Column('generated_files', postgresql.JSONB(), nullable=True),
            sa.Column('ai_messages', postgresql.JSONB(), nullable=True),
            sa.Column('current_step', sa.String(100), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('build_logs', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.Column('deployed_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_builder_projects_status', 'builder_projects', ['status'])
        op.create_index('ix_builder_projects_created', 'builder_projects', ['created_at'])
        op.create_index('ix_builder_projects_name', 'builder_projects', ['name'])
    
    if not table_exists('builder_pages'):
        op.create_table(
            'builder_pages',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('name', sa.String(255), nullable=False),
            sa.Column('path', sa.String(255), nullable=False),
            sa.Column('page_type', sa.String(50), nullable=True),
            sa.Column('html_content', sa.Text(), nullable=True),
            sa.Column('css_content', sa.Text(), nullable=True),
            sa.Column('js_content', sa.Text(), nullable=True),
            sa.Column('component_code', sa.Text(), nullable=True),
            sa.Column('page_meta', postgresql.JSONB(), nullable=True),
            sa.Column('is_generated', sa.Boolean(), nullable=True, default=False),
            sa.Column('generation_prompt', sa.Text(), nullable=True),
            sa.Column('generated_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['project_id'], ['builder_projects.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_builder_pages_project', 'builder_pages', ['project_id'])
        op.create_index('ix_builder_pages_path', 'builder_pages', ['path'])
    
    if not table_exists('builder_checkpoints'):
        op.create_table(
            'builder_checkpoints',
            sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column('stage', sa.String(50), nullable=False),
            sa.Column('step_name', sa.String(100), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('context', postgresql.JSONB(), nullable=True),
            sa.Column('preview_data', postgresql.JSONB(), nullable=True),
            sa.Column('status', postgresql.ENUM('pending', 'approved', 'rejected', name='checkpointstatus', create_type=False), nullable=True),
            sa.Column('user_response', sa.Text(), nullable=True),
            sa.Column('user_feedback', sa.Text(), nullable=True),
            sa.Column('responded_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['project_id'], ['builder_projects.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_builder_checkpoints_project', 'builder_checkpoints', ['project_id'])
        op.create_index('ix_builder_checkpoints_status', 'builder_checkpoints', ['status'])
        op.create_index('ix_builder_checkpoints_stage', 'builder_checkpoints', ['stage'])


def downgrade():
    op.drop_table('builder_checkpoints')
    op.drop_table('builder_pages')
    op.drop_table('builder_projects')
    
    connection = op.get_bind()
    connection.execute(sa.text("DROP TYPE IF EXISTS checkpointstatus"))
    connection.execute(sa.text("DROP TYPE IF EXISTS buildertechstack"))
    connection.execute(sa.text("DROP TYPE IF EXISTS builderprojectstatus"))
