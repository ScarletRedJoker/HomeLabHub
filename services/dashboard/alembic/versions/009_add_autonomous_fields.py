"""Add autonomous execution fields to jarvis_actions

Revision ID: 009_add_autonomous_fields
Revises: 008_add_user_preferences
Create Date: 2025-11-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = '009_add_autonomous_fields'
down_revision = '008_add_user_preferences'
branch_labels = None
depends_on = None


def upgrade():
    """Add fields for autonomous execution tracking"""
    
    op.add_column(
        'jarvis_actions',
        sa.Column('tier', sa.Integer(), nullable=True, comment='Autonomous tier: 1=DIAGNOSE, 2=REMEDIATE, 3=PROACTIVE')
    )
    
    op.add_column(
        'jarvis_actions',
        sa.Column('autonomous_execution', sa.Boolean(), nullable=False, server_default='false', comment='Whether action was executed autonomously')
    )
    
    op.add_column(
        'jarvis_actions',
        sa.Column('policy_decision', sa.String(50), nullable=True, comment='Policy engine decision: approve, reject, defer, require_approval')
    )
    
    op.add_column(
        'jarvis_actions',
        sa.Column('preconditions_met', sa.Boolean(), nullable=True, comment='Whether preconditions were met')
    )
    
    op.add_column(
        'jarvis_actions',
        sa.Column('safety_checks_passed', sa.Boolean(), nullable=True, comment='Whether safety checks passed')
    )
    
    op.add_column(
        'jarvis_actions',
        sa.Column('circuit_breaker_status', sa.String(20), nullable=True, comment='Circuit breaker status: open, closed')
    )
    
    op.create_index(
        'ix_jarvis_actions_tier',
        'jarvis_actions',
        ['tier']
    )
    
    op.create_index(
        'ix_jarvis_actions_autonomous',
        'jarvis_actions',
        ['autonomous_execution']
    )
    
    op.create_index(
        'ix_jarvis_actions_policy_decision',
        'jarvis_actions',
        ['policy_decision']
    )
    
    print("✅ Added autonomous execution fields to jarvis_actions table")


def downgrade():
    """Remove autonomous execution fields"""
    
    op.drop_index('ix_jarvis_actions_policy_decision', table_name='jarvis_actions')
    op.drop_index('ix_jarvis_actions_autonomous', table_name='jarvis_actions')
    op.drop_index('ix_jarvis_actions_tier', table_name='jarvis_actions')
    
    op.drop_column('jarvis_actions', 'circuit_breaker_status')
    op.drop_column('jarvis_actions', 'safety_checks_passed')
    op.drop_column('jarvis_actions', 'preconditions_met')
    op.drop_column('jarvis_actions', 'policy_decision')
    op.drop_column('jarvis_actions', 'autonomous_execution')
    op.drop_column('jarvis_actions', 'tier')
    
    print("✅ Removed autonomous execution fields from jarvis_actions table")
