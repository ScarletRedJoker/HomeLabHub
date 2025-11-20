"""Add agent collaboration tables for multi-agent system

Revision ID: 007
Revises: 006
Create Date: 2025-11-18

Adds agent_tasks and agent_conversations tables for AI agent swarm collaboration.
NOTE: Depends on agents table (created by migration 014) - uses UUID foreign keys.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = '007'
down_revision = '006'
branch_labels = None
depends_on = None

def upgrade():
    # Helper to check if table exists
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # NOTE: The canonical 'agents' table is created by migration 014 with UUID primary key
    # This migration only adds collaborative task/conversation tables that reference it
    
    # 1. Agent tasks table - stores tasks assigned to agents (idempotent)
    if 'agent_tasks' not in existing_tables:
        op.create_table(
            'agent_tasks',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('task_type', sa.String(50), nullable=False, server_default='diagnose'),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('priority', sa.Integer(), nullable=False, server_default='5'),
            sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
            sa.Column('assigned_agent_id', UUID(as_uuid=True), nullable=True),  # UUID FK to agents
            sa.Column('parent_task_id', sa.Integer(), nullable=True),
            sa.Column('context', JSONB, nullable=True),
            sa.Column('result', JSONB, nullable=True),
            sa.Column('execution_log', JSONB, nullable=True),
            sa.Column('requires_collaboration', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('collaborating_agents', JSONB, nullable=True),
            sa.Column('requires_approval', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('approved', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('approved_by', sa.String(100), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('started_at', sa.DateTime(), nullable=True),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['parent_task_id'], ['agent_tasks.id'], ondelete='SET NULL')
        )
        op.create_index('idx_agent_tasks_status', 'agent_tasks', ['status'])
        op.create_index('idx_agent_tasks_agent', 'agent_tasks', ['assigned_agent_id'])
        op.create_index('idx_agent_tasks_created', 'agent_tasks', ['created_at'])
        op.create_index('idx_agent_tasks_priority', 'agent_tasks', ['priority'])
    
    # 2. Agent conversations table - stores agent-to-agent communication (idempotent)
    if 'agent_conversations' not in existing_tables:
        op.create_table(
            'agent_conversations',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('from_agent_id', UUID(as_uuid=True), nullable=False),  # UUID FK to agents
            sa.Column('to_agent_id', UUID(as_uuid=True), nullable=False),    # UUID FK to agents
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('message_type', sa.String(50), nullable=False, server_default='consultation'),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['task_id'], ['agent_tasks.id'], ondelete='CASCADE')
        )
        op.create_index('idx_agent_conversations_task', 'agent_conversations', ['task_id'])
        op.create_index('idx_agent_conversations_timestamp', 'agent_conversations', ['timestamp'])
    
    # 3. Add foreign keys to agents table (if it exists)
    # Note: If agents doesn't exist yet, migration 014 will create it later
    # We'll add FKs in a conditional block to handle out-of-order execution
    if 'agents' in existing_tables:
        # Add FK from agent_tasks to agents
        op.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'agent_tasks_assigned_agent_id_fkey'
                ) THEN
                    ALTER TABLE agent_tasks
                    ADD CONSTRAINT agent_tasks_assigned_agent_id_fkey
                    FOREIGN KEY (assigned_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
                END IF;
            END $$;
        """)
        
        # Add FKs from agent_conversations to agents
        op.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'agent_conversations_from_agent_id_fkey'
                ) THEN
                    ALTER TABLE agent_conversations
                    ADD CONSTRAINT agent_conversations_from_agent_id_fkey
                    FOREIGN KEY (from_agent_id) REFERENCES agents(id) ON DELETE CASCADE;
                END IF;
                
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'agent_conversations_to_agent_id_fkey'
                ) THEN
                    ALTER TABLE agent_conversations
                    ADD CONSTRAINT agent_conversations_to_agent_id_fkey
                    FOREIGN KEY (to_agent_id) REFERENCES agents(id) ON DELETE CASCADE;
                END IF;
            END $$;
        """)
        
        # Add FK from agents.current_task_id to agent_tasks (self-referential)
        op.execute("""
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_name = 'fk_agents_current_task'
                ) THEN
                    ALTER TABLE agents
                    ADD CONSTRAINT fk_agents_current_task
                    FOREIGN KEY (current_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL;
                END IF;
            END $$;
        """)


def downgrade():
    # Drop foreign keys first (if they exist)
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE agent_conversations DROP CONSTRAINT IF EXISTS agent_conversations_to_agent_id_fkey;
            ALTER TABLE agent_conversations DROP CONSTRAINT IF EXISTS agent_conversations_from_agent_id_fkey;
            ALTER TABLE agent_tasks DROP CONSTRAINT IF EXISTS agent_tasks_assigned_agent_id_fkey;
            ALTER TABLE agents DROP CONSTRAINT IF EXISTS fk_agents_current_task;
        EXCEPTION
            WHEN undefined_table THEN null;
        END $$;
    """)
    
    # Drop tables in reverse order
    op.drop_table('agent_conversations')
    op.drop_table('agent_tasks')
