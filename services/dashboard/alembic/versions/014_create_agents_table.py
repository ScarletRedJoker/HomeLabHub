"""Create agents table for Jarvis AI system

Revision ID: 014_create_agents_table
Revises: 013_optimize_indexes
Create Date: 2025-11-19
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = '014_create_agents_table'
down_revision = '013'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'agents',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('name', sa.String(100), nullable=False, unique=True),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text),
        sa.Column('status', sa.String(20), nullable=False, server_default='idle'),
        sa.Column('capabilities', JSONB, nullable=False, server_default='[]'),
        sa.Column('config', JSONB, nullable=False, server_default='{}'),
        sa.Column('last_active', sa.DateTime(timezone=True)),
        sa.Column('tasks_completed', sa.Integer, nullable=False, server_default='0'),
        sa.Column('tasks_failed', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('NOW()'))
    )
    
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
    
    op.create_index('idx_agents_status', 'agents', ['status'])
    op.create_index('idx_agents_type', 'agents', ['type'])
    op.create_index('idx_agent_messages_status', 'agent_messages', ['status'])
    op.create_index('idx_agent_messages_priority', 'agent_messages', ['priority', 'created_at'])
    op.create_index('idx_agent_messages_from_agent', 'agent_messages', ['from_agent_id'])
    op.create_index('idx_agent_messages_to_agent', 'agent_messages', ['to_agent_id'])
    op.create_index('idx_chat_history_session', 'chat_history', ['session_id', 'created_at'])
    
    op.execute("""
        INSERT INTO agents (name, type, description, capabilities, config) VALUES
        ('Jarvis Master', 'orchestrator', 'Main AI orchestrator for all homelab operations', 
         '["conversation", "orchestration", "decision_making"]'::jsonb, 
         '{"model": "gpt-4", "temperature": 0.7}'::jsonb),
        ('Deployment Agent', 'deployment', 'Handles service deployments and Docker operations',
         '["docker", "compose", "ssl", "dns"]'::jsonb,
         '{"max_concurrent_deployments": 3}'::jsonb),
        ('Security Agent', 'security', 'Monitors security, SSL certificates, and vulnerabilities',
         '["ssl_monitoring", "vulnerability_scan", "firewall"]'::jsonb,
         '{"scan_interval": 3600}'::jsonb),
        ('Monitoring Agent', 'monitoring', 'Tracks system health, metrics, and performance',
         '["health_checks", "metrics", "alerts"]'::jsonb,
         '{"check_interval": 60}'::jsonb),
        ('Database Agent', 'database', 'Manages database creation, backups, and migrations',
         '["postgres", "mysql", "backup", "restore"]'::jsonb,
         '{"backup_retention_days": 30}'::jsonb)
    """)

def downgrade():
    op.drop_table('chat_history')
    op.drop_table('agent_messages')
    op.drop_table('agents')
