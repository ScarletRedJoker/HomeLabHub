"""Create agents table for Jarvis AI system

Revision ID: 014_create_agents_table
Revises: 013_optimize_indexes
Create Date: 2025-11-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
import logging

logger = logging.getLogger('alembic.runtime.migration')

revision = '014_create_agents_table'
down_revision = '013'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # AUTO-REPAIR: Check if agents table exists with wrong ID type
    if 'agents' in existing_tables:
        # Check agents.id column type
        columns = inspector.get_columns('agents')
        id_column = next((col for col in columns if col['name'] == 'id'), None)
        
        if id_column:
            id_type = str(id_column['type']).lower()
            
            # If ID is not UUID, drop and recreate
            if 'uuid' not in id_type:
                logger.warning(f"⚠️  agents.id is {id_type}, expected UUID - dropping for recreation")
                logger.info("🔧 Auto-repair: Dropping legacy tables...")
                
                # Drop migration 007's tables first (they have INTEGER FK to old agents table)
                op.execute("DROP TABLE IF EXISTS agent_conversations CASCADE")
                op.execute("DROP TABLE IF EXISTS agent_tasks CASCADE")
                
                # Drop migration 014's tables
                op.execute("DROP TABLE IF EXISTS agent_messages CASCADE")
                op.execute("DROP TABLE IF EXISTS chat_history CASCADE")
                
                # Finally drop the agents table itself
                op.execute("DROP TABLE IF EXISTS agents CASCADE")
                
                logger.info("✓ All legacy agent tables dropped, will recreate with correct UUID types")
                # Reset existing_tables so tables get recreated below
                existing_tables = []
                
                #  Also refresh inspector to see current state
                inspector = sa.inspect(conn)
    
    # CREATE or VERIFY agents table
    if 'agents' not in existing_tables:
        op.create_table(
            'agents',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('name', sa.String(100), nullable=False, unique=True),
            sa.Column('agent_type', sa.String(50), nullable=False),
            sa.Column('description', sa.Text),
            sa.Column('status', sa.String(20), nullable=False, server_default='idle'),
            sa.Column('capabilities', JSONB, nullable=False, server_default='[]'),
            sa.Column('config', JSONB, nullable=False, server_default='{}'),
            sa.Column('last_active', sa.DateTime(timezone=True)),
            sa.Column('tasks_completed', sa.Integer, nullable=False, server_default='0'),
            sa.Column('tasks_failed', sa.Integer, nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('system_prompt', sa.Text),
            sa.Column('model', sa.String(50)),
            sa.Column('current_task_id', sa.Integer)
        )
        op.create_index('idx_agents_status', 'agents', ['status'])
        op.create_index('idx_agents_type', 'agents', ['agent_type'])
    else:
        op.execute("""
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='updated_at') THEN
                    ALTER TABLE agents ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='tasks_completed') THEN
                    ALTER TABLE agents ADD COLUMN tasks_completed INTEGER NOT NULL DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='tasks_failed') THEN
                    ALTER TABLE agents ADD COLUMN tasks_failed INTEGER NOT NULL DEFAULT 0;
                END IF;
            END $$;
        """)
    
    if 'agent_messages' not in existing_tables:
        op.create_table(
            'agent_messages',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('from_agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id', ondelete='CASCADE')),
            sa.Column('to_agent_id', UUID(as_uuid=True), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=True),
            sa.Column('message_type', sa.String(50), nullable=False),
            sa.Column('content', JSONB, nullable=False),
            sa.Column('priority', sa.Integer, nullable=False, server_default='5'),
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
            sa.Column('response_to', UUID(as_uuid=True), sa.ForeignKey('agent_messages.id', ondelete='SET NULL'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
            sa.Column('processed_at', sa.DateTime(timezone=True))
        )
        op.create_index('idx_agent_messages_status', 'agent_messages', ['status'])
        op.create_index('idx_agent_messages_priority', 'agent_messages', ['priority', 'created_at'])
        op.create_index('idx_agent_messages_from_agent', 'agent_messages', ['from_agent_id'])
        op.create_index('idx_agent_messages_to_agent', 'agent_messages', ['to_agent_id'])
    
    if 'chat_history' not in existing_tables:
        op.create_table(
            'chat_history',
            sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
            sa.Column('session_id', sa.String(255), nullable=False),
            sa.Column('user_id', sa.String(255)),
            sa.Column('role', sa.String(20), nullable=False),
            sa.Column('content', sa.Text, nullable=False),
            sa.Column('metadata', JSONB, server_default='{}'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()'))
        )
        op.create_index('idx_chat_history_session', 'chat_history', ['session_id', 'created_at'])
    
    # CREATE OR REPAIR agent_tasks (from migration 007)
    # Refresh existing_tables to see current state (especially after auto-repair)
    existing_tables = inspector.get_table_names()
    
    if 'agent_tasks' not in existing_tables:
        # Recreate agent_tasks with UUID FKs (migration 007 should have created this)
        op.create_table(
            'agent_tasks',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('task_type', sa.String(50), nullable=False, server_default='diagnose'),
            sa.Column('description', sa.Text(), nullable=False),
            sa.Column('priority', sa.Integer(), nullable=False, server_default='5'),
            sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
            sa.Column('assigned_agent_id', UUID(as_uuid=True), nullable=True),
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
            sa.ForeignKeyConstraint(['assigned_agent_id'], ['agents.id'], ondelete='SET NULL'),
            sa.ForeignKeyConstraint(['parent_task_id'], ['agent_tasks.id'], ondelete='SET NULL')
        )
        op.create_index('idx_agent_tasks_status', 'agent_tasks', ['status'])
        op.create_index('idx_agent_tasks_agent', 'agent_tasks', ['assigned_agent_id'])
        op.create_index('idx_agent_tasks_created', 'agent_tasks', ['created_at'])
        op.create_index('idx_agent_tasks_priority', 'agent_tasks', ['priority'])
    elif 'agent_tasks' in existing_tables:
        op.execute("""
            DO $$ BEGIN
                -- Add FK from agent_tasks to agents if missing
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
    
    # CREATE OR REPAIR agent_conversations (from migration 007)
    if 'agent_conversations' not in existing_tables:
        # Recreate agent_conversations with UUID FKs (migration 007 should have created this)
        op.create_table(
            'agent_conversations',
            sa.Column('id', sa.Integer(), nullable=False, autoincrement=True),
            sa.Column('task_id', sa.Integer(), nullable=False),
            sa.Column('from_agent_id', UUID(as_uuid=True), nullable=False),
            sa.Column('to_agent_id', UUID(as_uuid=True), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('message_type', sa.String(50), nullable=False, server_default='consultation'),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.text('NOW()')),
            sa.PrimaryKeyConstraint('id'),
            sa.ForeignKeyConstraint(['task_id'], ['agent_tasks.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['from_agent_id'], ['agents.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['to_agent_id'], ['agents.id'], ondelete='CASCADE')
        )
        op.create_index('idx_agent_conversations_task', 'agent_conversations', ['task_id'])
        op.create_index('idx_agent_conversations_timestamp', 'agent_conversations', ['timestamp'])
    elif 'agent_conversations' in existing_tables:
        op.execute("""
            DO $$ BEGIN
                -- Add FKs from agent_conversations to agents if missing
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
    
    # Add FK from agents.current_task_id to agent_tasks (if both exist)
    if 'agents' in existing_tables and 'agent_tasks' in existing_tables:
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
    
    op.execute("""
        INSERT INTO agents (name, agent_type, description, capabilities, config)
        SELECT 'Jarvis Master', 'orchestrator', 'Main AI orchestrator for all homelab operations', 
               '["conversation", "orchestration", "decision_making"]'::jsonb, 
               '{"model": "gpt-4", "temperature": 0.7}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Jarvis Master')
        UNION ALL
        SELECT 'Deployment Agent', 'deployment', 'Handles service deployments and Docker operations',
               '["docker", "compose", "ssl", "dns"]'::jsonb,
               '{"max_concurrent_deployments": 3}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Deployment Agent')
        UNION ALL
        SELECT 'Security Agent', 'security', 'Monitors security, SSL certificates, and vulnerabilities',
               '["ssl_monitoring", "vulnerability_scan", "firewall"]'::jsonb,
               '{"scan_interval": 3600}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Security Agent')
        UNION ALL
        SELECT 'Monitoring Agent', 'monitoring', 'Tracks system health, metrics, and performance',
               '["health_checks", "metrics", "alerts"]'::jsonb,
               '{"check_interval": 60}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Monitoring Agent')
        UNION ALL
        SELECT 'Database Agent', 'database', 'Manages database creation, backups, and migrations',
               '["postgres", "mysql", "backup", "restore"]'::jsonb,
               '{"backup_retention_days": 30}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM agents WHERE name = 'Database Agent')
    """)

def downgrade():
    op.drop_table('chat_history')
    op.drop_table('agent_messages')
    op.drop_table('agents')
