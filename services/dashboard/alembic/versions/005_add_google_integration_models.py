"""Add Google Integration models

Revision ID: 005
Revises: 004
Create Date: 2025-11-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005'
down_revision = '004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create enums for Google integration (idempotent)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE serviceconnectionstatus AS ENUM ('connected', 'disconnected', 'error', 'pending');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE automationstatus AS ENUM ('active', 'inactive', 'error');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE emailnotificationstatus AS ENUM ('pending', 'sent', 'failed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE backupstatus AS ENUM ('pending', 'uploading', 'completed', 'failed');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)
    
    # Create google_service_status table
    op.create_table('google_service_status',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('service_name', sa.String(length=50), nullable=False),
        sa.Column('status', sa.Enum('connected', 'disconnected', 'error', 'pending', name='serviceconnectionstatus'), nullable=False, server_default='disconnected'),
        sa.Column('last_connected', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('error_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('connection_metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), onupdate=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('service_name')
    )
    
    # Create calendar_automations table
    op.create_table('calendar_automations',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('calendar_id', sa.String(length=255), nullable=False, server_default='primary'),
        sa.Column('event_keywords', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('ha_automation_id', sa.String(length=255), nullable=True),
        sa.Column('ha_service_domain', sa.String(length=100), nullable=True),
        sa.Column('ha_service_name', sa.String(length=100), nullable=True),
        sa.Column('ha_service_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('lead_time_minutes', sa.Integer(), nullable=False, server_default='15'),
        sa.Column('lag_time_minutes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('status', sa.Enum('active', 'inactive', 'error', name='automationstatus'), nullable=False, server_default='active'),
        sa.Column('last_triggered', sa.DateTime(timezone=True), nullable=True),
        sa.Column('trigger_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), onupdate=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create email_notifications table
    op.create_table('email_notifications',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('recipient', sa.String(length=255), nullable=False),
        sa.Column('subject', sa.String(length=500), nullable=False),
        sa.Column('template_type', sa.String(length=50), nullable=False, server_default='custom'),
        sa.Column('status', sa.Enum('pending', 'sent', 'failed', name='emailnotificationstatus'), nullable=False, server_default='pending'),
        sa.Column('gmail_message_id', sa.String(length=255), nullable=True),
        sa.Column('gmail_thread_id', sa.String(length=255), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create drive_backups table
    op.create_table('drive_backups',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('drive_file_id', sa.String(length=255), nullable=False),
        sa.Column('file_name', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('file_size', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('local_path', sa.String(length=1000), nullable=True),
        sa.Column('drive_folder_id', sa.String(length=255), nullable=True),
        sa.Column('status', sa.Enum('pending', 'uploading', 'completed', 'failed', name='backupstatus'), nullable=False, server_default='pending'),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('web_view_link', sa.String(length=1000), nullable=True),
        sa.Column('backup_type', sa.String(length=100), nullable=False, server_default='manual'),
        sa.Column('retention_days', sa.Integer(), nullable=True),
        sa.Column('auto_delete_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_by', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), onupdate=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('drive_file_id')
    )
    
    # Create indexes for better query performance
    op.create_index('ix_calendar_automations_status', 'calendar_automations', ['status'])
    op.create_index('ix_calendar_automations_created_by', 'calendar_automations', ['created_by'])
    op.create_index('ix_email_notifications_status', 'email_notifications', ['status'])
    op.create_index('ix_email_notifications_recipient', 'email_notifications', ['recipient'])
    op.create_index('ix_email_notifications_created_at', 'email_notifications', ['created_at'])
    op.create_index('ix_drive_backups_status', 'drive_backups', ['status'])
    op.create_index('ix_drive_backups_backup_type', 'drive_backups', ['backup_type'])
    op.create_index('ix_drive_backups_created_by', 'drive_backups', ['created_by'])
    op.create_index('ix_drive_backups_deleted', 'drive_backups', ['deleted'])
    op.create_index('ix_drive_backups_auto_delete_at', 'drive_backups', ['auto_delete_at'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_drive_backups_auto_delete_at', table_name='drive_backups')
    op.drop_index('ix_drive_backups_deleted', table_name='drive_backups')
    op.drop_index('ix_drive_backups_created_by', table_name='drive_backups')
    op.drop_index('ix_drive_backups_backup_type', table_name='drive_backups')
    op.drop_index('ix_drive_backups_status', table_name='drive_backups')
    op.drop_index('ix_email_notifications_created_at', table_name='email_notifications')
    op.drop_index('ix_email_notifications_recipient', table_name='email_notifications')
    op.drop_index('ix_email_notifications_status', table_name='email_notifications')
    op.drop_index('ix_calendar_automations_created_by', table_name='calendar_automations')
    op.drop_index('ix_calendar_automations_status', table_name='calendar_automations')
    
    # Drop tables
    op.drop_table('drive_backups')
    op.drop_table('email_notifications')
    op.drop_table('calendar_automations')
    op.drop_table('google_service_status')
    
    # Drop enums
    op.execute('DROP TYPE IF EXISTS backupstatus')
    op.execute('DROP TYPE IF EXISTS emailnotificationstatus')
    op.execute('DROP TYPE IF EXISTS automationstatus')
    op.execute('DROP TYPE IF EXISTS serviceconnectionstatus')
