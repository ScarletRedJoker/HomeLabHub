"""Feature Expansion - Plex, Service Ops, Storage, Gaming, DB Admin

Revision ID: 006
Revises: 005
Create Date: 2025-11-19 03:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ============================================
    # Plex Media Import Tables
    # ============================================
    op.create_table(
        'plex_import_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', sa.String(255), nullable=False),
        sa.Column('job_type', sa.String(50), nullable=False),  # 'movie', 'tv_show', 'music'
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),  # 'pending', 'processing', 'moving', 'scanning', 'completed', 'failed'
        sa.Column('total_files', sa.Integer, nullable=False, server_default='0'),
        sa.Column('processed_files', sa.Integer, nullable=False, server_default='0'),
        sa.Column('target_directory', sa.String(500), nullable=True),
        sa.Column('job_metadata', postgresql.JSONB, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()'), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_plex_import_jobs_status', 'plex_import_jobs', ['status'])
    op.create_index('ix_plex_import_jobs_created_at', 'plex_import_jobs', ['created_at'])
    
    op.create_table(
        'plex_import_items',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('job_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('plex_import_jobs.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(500), nullable=False),
        sa.Column('original_filename', sa.String(500), nullable=False),
        sa.Column('file_size', sa.BigInteger, nullable=False),
        sa.Column('mime_type', sa.String(100), nullable=True),
        sa.Column('storage_path', sa.String(1000), nullable=False),  # MinIO path
        sa.Column('final_path', sa.String(1000), nullable=True),  # Final Plex path
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('item_metadata', postgresql.JSONB, nullable=True),  # Title, year, season, episode, etc.
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('processed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_plex_import_items_job_id', 'plex_import_items', ['job_id'])
    op.create_index('ix_plex_import_items_status', 'plex_import_items', ['status'])
    
    # ============================================
    # Service Operations Tables
    # ============================================
    op.create_table(
        'service_telemetry',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('service_name', sa.String(255), nullable=False),
        sa.Column('container_id', sa.String(255), nullable=True),
        sa.Column('status', sa.String(50), nullable=False),  # 'online', 'offline', 'restarting', 'error'
        sa.Column('cpu_percent', sa.Float, nullable=True),
        sa.Column('memory_usage', sa.BigInteger, nullable=True),  # Bytes
        sa.Column('memory_limit', sa.BigInteger, nullable=True),  # Bytes
        sa.Column('network_rx', sa.BigInteger, nullable=True),  # Bytes received
        sa.Column('network_tx', sa.BigInteger, nullable=True),  # Bytes transmitted
        sa.Column('health_status', sa.String(50), nullable=True),  # 'healthy', 'unhealthy', 'starting'
        sa.Column('restart_count', sa.Integer, nullable=True),
        sa.Column('uptime_seconds', sa.Integer, nullable=True),
        sa.Column('service_metadata', postgresql.JSONB, nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )
    op.create_index('ix_service_telemetry_service_name', 'service_telemetry', ['service_name'])
    op.create_index('ix_service_telemetry_timestamp', 'service_telemetry', ['timestamp'])
    op.create_index('ix_service_telemetry_service_timestamp', 'service_telemetry', ['service_name', 'timestamp'])
    
    # ============================================
    # Storage Monitoring Tables
    # ============================================
    op.create_table(
        'storage_metrics',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('metric_type', sa.String(50), nullable=False),  # 'plex_media', 'docker_volume', 'postgres_db', 'minio_bucket'
        sa.Column('metric_name', sa.String(255), nullable=False),  # e.g., 'Movies', 'TV Shows', 'ticketbot_db'
        sa.Column('path', sa.String(1000), nullable=True),
        sa.Column('size_bytes', sa.BigInteger, nullable=False),
        sa.Column('file_count', sa.Integer, nullable=True),
        sa.Column('usage_percent', sa.Float, nullable=True),
        sa.Column('storage_metadata', postgresql.JSONB, nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
    )
    op.create_index('ix_storage_metrics_type', 'storage_metrics', ['metric_type'])
    op.create_index('ix_storage_metrics_timestamp', 'storage_metrics', ['timestamp'])
    op.create_index('ix_storage_metrics_type_timestamp', 'storage_metrics', ['metric_type', 'timestamp'])
    
    op.create_table(
        'storage_alerts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('metric_type', sa.String(50), nullable=False),
        sa.Column('metric_name', sa.String(255), nullable=False),
        sa.Column('threshold_percent', sa.Float, nullable=False, server_default='80.0'),
        sa.Column('alert_enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('last_alerted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()'), nullable=False),
    )
    op.create_index('ix_storage_alerts_type_name', 'storage_alerts', ['metric_type', 'metric_name'])
    
    # ============================================
    # Game Streaming Tables
    # ============================================
    op.create_table(
        'game_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('session_type', sa.String(50), nullable=False),  # 'moonlight', 'parsec', 'rdp'
        sa.Column('user_id', sa.String(255), nullable=True),
        sa.Column('host_ip', sa.String(100), nullable=False),
        sa.Column('host_name', sa.String(255), nullable=True),
        sa.Column('status', sa.String(50), nullable=False),  # 'active', 'pairing', 'disconnected', 'error'
        sa.Column('client_device', sa.String(255), nullable=True),
        sa.Column('resolution', sa.String(50), nullable=True),
        sa.Column('fps', sa.Integer, nullable=True),
        sa.Column('bitrate_mbps', sa.Float, nullable=True),
        sa.Column('latency_ms', sa.Float, nullable=True),
        sa.Column('game_name', sa.String(255), nullable=True),
        sa.Column('game_metadata', postgresql.JSONB, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_game_sessions_status', 'game_sessions', ['status'])
    op.create_index('ix_game_sessions_started_at', 'game_sessions', ['started_at'])
    
    op.create_table(
        'sunshine_hosts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('host_ip', sa.String(100), nullable=False, unique=True),
        sa.Column('host_name', sa.String(255), nullable=True),
        sa.Column('api_url', sa.String(500), nullable=False),
        sa.Column('is_paired', sa.Boolean, nullable=False, server_default='false'),
        sa.Column('pairing_pin', sa.String(20), nullable=True),
        sa.Column('last_online', sa.DateTime(timezone=True), nullable=True),
        sa.Column('gpu_model', sa.String(255), nullable=True),
        sa.Column('applications', postgresql.JSONB, nullable=True),  # List of available games/apps
        sa.Column('host_metadata', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()'), nullable=False),
    )
    
    # ============================================
    # Database Administration Tables
    # ============================================
    op.create_table(
        'db_credentials',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('db_name', sa.String(255), nullable=False),
        sa.Column('username', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(500), nullable=False),  # Encrypted
        sa.Column('host', sa.String(255), nullable=False, server_default='discord-bot-db'),
        sa.Column('port', sa.Integer, nullable=False, server_default='5432'),
        sa.Column('connection_string', sa.Text, nullable=True),  # Encrypted
        sa.Column('is_active', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('last_tested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('test_status', sa.String(50), nullable=True),  # 'success', 'failed'
        sa.Column('credential_metadata', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), onupdate=sa.text('NOW()'), nullable=False),
    )
    op.create_index('ix_db_credentials_db_name', 'db_credentials', ['db_name'])
    op.create_index('ix_db_credentials_active', 'db_credentials', ['is_active'])
    
    op.create_table(
        'db_backup_jobs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('db_name', sa.String(255), nullable=False),
        sa.Column('backup_type', sa.String(50), nullable=False),  # 'full', 'schema_only', 'data_only'
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),  # 'pending', 'running', 'completed', 'failed'
        sa.Column('storage_path', sa.String(1000), nullable=True),  # MinIO path
        sa.Column('file_size', sa.BigInteger, nullable=True),
        sa.Column('compression', sa.String(50), nullable=True),  # 'gzip', 'none'
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('backup_metadata', postgresql.JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('NOW()'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_db_backup_jobs_db_name', 'db_backup_jobs', ['db_name'])
    op.create_index('ix_db_backup_jobs_status', 'db_backup_jobs', ['status'])
    op.create_index('ix_db_backup_jobs_created_at', 'db_backup_jobs', ['created_at'])


def downgrade() -> None:
    # Drop all tables in reverse order
    op.drop_table('db_backup_jobs')
    op.drop_table('db_credentials')
    op.drop_table('sunshine_hosts')
    op.drop_table('game_sessions')
    op.drop_table('storage_alerts')
    op.drop_table('storage_metrics')
    op.drop_table('service_telemetry')
    op.drop_table('plex_import_items')
    op.drop_table('plex_import_jobs')
