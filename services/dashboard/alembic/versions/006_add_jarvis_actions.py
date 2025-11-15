"""Add Jarvis Actions table for approval workflow

Revision ID: 006
Revises: 005
Create Date: 2025-11-15

Adds the jarvis_actions table to support human-in-the-loop approval workflow
for Jarvis autonomous operations. This enables safe execution with proper
audit trails and rollback capabilities.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid

revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table(
        'jarvis_actions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column('action_type', sa.Enum('COMMAND_EXECUTION', 'DEPLOYMENT', 'CONFIGURATION_CHANGE', 'SYSTEM_MODIFICATION', name='actiontype'), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED', 'CANCELLED', name='actionstatus'), nullable=False, server_default='PENDING'),
        sa.Column('command', sa.Text, nullable=True),
        sa.Column('description', sa.Text, nullable=False),
        sa.Column('risk_level', sa.String(20), nullable=False),
        sa.Column('requested_by', sa.String(100), nullable=False, server_default='jarvis'),
        sa.Column('requested_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('approved_by', sa.String(100), nullable=True),
        sa.Column('approved_at', sa.DateTime, nullable=True),
        sa.Column('rejected_by', sa.String(100), nullable=True),
        sa.Column('rejected_at', sa.DateTime, nullable=True),
        sa.Column('rejection_reason', sa.Text, nullable=True),
        sa.Column('executed_at', sa.DateTime, nullable=True),
        sa.Column('execution_result', JSONB, nullable=True),
        sa.Column('execution_time_ms', sa.Integer, nullable=True),
        sa.Column('action_metadata', JSONB, nullable=True),
        sa.Column('checkpoint_data', JSONB, nullable=True),
        sa.Column('rollback_command', sa.Text, nullable=True),
        sa.Column('expires_at', sa.DateTime, nullable=True),
        sa.Column('auto_approve_after', sa.DateTime, nullable=True),
        sa.Column('requires_checkpoint', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
        sa.Column('updated_at', sa.DateTime, nullable=False, server_default=sa.text('NOW()')),
    )
    
    op.create_index('idx_jarvis_actions_type', 'jarvis_actions', ['action_type'])
    op.create_index('idx_jarvis_actions_status', 'jarvis_actions', ['status'])
    op.create_index('idx_jarvis_actions_requested_at', 'jarvis_actions', ['requested_at'])
    op.create_index('idx_jarvis_actions_risk_level', 'jarvis_actions', ['risk_level'])
    
    op.create_index('idx_jarvis_actions_pending', 'jarvis_actions', ['status', 'requested_at'], 
                    postgresql_where=sa.text("status = 'PENDING'"))

def downgrade():
    op.drop_index('idx_jarvis_actions_pending', 'jarvis_actions')
    op.drop_index('idx_jarvis_actions_risk_level', 'jarvis_actions')
    op.drop_index('idx_jarvis_actions_requested_at', 'jarvis_actions')
    op.drop_index('idx_jarvis_actions_status', 'jarvis_actions')
    op.drop_index('idx_jarvis_actions_type', 'jarvis_actions')
    op.drop_table('jarvis_actions')
    
    op.execute('DROP TYPE IF EXISTS actiontype')
    op.execute('DROP TYPE IF EXISTS actionstatus')
