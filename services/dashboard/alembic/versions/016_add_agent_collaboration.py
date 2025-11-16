"""Add agent collaboration system

Revision ID: 016_add_agent_collaboration
Revises: 015_add_marketplace_tables
Create Date: 2024-11-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '016'
down_revision: Union[str, None] = '015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create agent_messages table
    op.create_table(
        'agent_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('from_agent', sa.String(length=50), nullable=False),
        sa.Column('to_agent', sa.String(length=50), nullable=False),
        sa.Column('message_type', sa.String(length=30), nullable=False),
        sa.Column('subject', sa.String(length=200), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('message_metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True, server_default='sent'),
        sa.Column('priority', sa.String(length=20), nullable=True, server_default='normal'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for better query performance
    op.create_index(
        'ix_agent_messages_from_agent',
        'agent_messages',
        ['from_agent']
    )
    op.create_index(
        'ix_agent_messages_to_agent',
        'agent_messages',
        ['to_agent']
    )
    op.create_index(
        'ix_agent_messages_message_type',
        'agent_messages',
        ['message_type']
    )
    op.create_index(
        'ix_agent_messages_created_at',
        'agent_messages',
        ['created_at'],
        postgresql_using='btree'
    )
    op.create_index(
        'ix_agent_messages_status',
        'agent_messages',
        ['status']
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_agent_messages_status', table_name='agent_messages')
    op.drop_index('ix_agent_messages_created_at', table_name='agent_messages')
    op.drop_index('ix_agent_messages_message_type', table_name='agent_messages')
    op.drop_index('ix_agent_messages_to_agent', table_name='agent_messages')
    op.drop_index('ix_agent_messages_from_agent', table_name='agent_messages')
    
    # Drop table
    op.drop_table('agent_messages')
