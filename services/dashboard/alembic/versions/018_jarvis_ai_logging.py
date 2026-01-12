"""Add Jarvis AI models, enhanced logging, and service config tables

Revision ID: 018_jarvis_ai_logging
Revises: 017_rbac_audit_deploy
Create Date: 2025-11-26

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '018_jarvis_ai_logging'
down_revision = '017_rbac_audit_deploy'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    
    result = connection.execute(sa.text("SELECT 1 FROM pg_type WHERE typname = 'remediationstatus'"))
    if not result.fetchone():
        remediation_status_enum = postgresql.ENUM(
            'pending', 'in_progress', 'completed', 'failed', 'rolled_back', 'skipped',
            name='remediationstatus', create_type=True
        )
        remediation_status_enum.create(connection)
    
    if not table_exists('system_logs'):
        op.create_table(
            'system_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('source', sa.String(100), nullable=False),
            sa.Column('source_type', sa.String(50), nullable=False),
            sa.Column('level', sa.String(20), nullable=False),
            sa.Column('category', sa.String(50), nullable=True),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('details', postgresql.JSON(), nullable=True),
            sa.Column('container_id', sa.String(64), nullable=True),
            sa.Column('container_name', sa.String(100), nullable=True),
            sa.Column('host', sa.String(100), nullable=True),
            sa.Column('process_id', sa.Integer(), nullable=True),
            sa.Column('stack_trace', sa.Text(), nullable=True),
            sa.Column('error_code', sa.String(50), nullable=True),
            sa.Column('cpu_percent', sa.Float(), nullable=True),
            sa.Column('memory_percent', sa.Float(), nullable=True),
            sa.Column('disk_percent', sa.Float(), nullable=True),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('year_month', sa.String(7), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_syslog_source', 'system_logs', ['source'])
        op.create_index('ix_syslog_source_type', 'system_logs', ['source_type'])
        op.create_index('ix_syslog_level', 'system_logs', ['level'])
        op.create_index('ix_syslog_category', 'system_logs', ['category'])
        op.create_index('ix_syslog_container_name', 'system_logs', ['container_name'])
        op.create_index('ix_syslog_timestamp', 'system_logs', ['timestamp'])
        op.create_index('ix_syslog_error_code', 'system_logs', ['error_code'])
        op.create_index('ix_syslog_year_month', 'system_logs', ['year_month'])
        op.create_index('ix_syslog_source_timestamp', 'system_logs', ['source', 'timestamp'])
        op.create_index('ix_syslog_level_timestamp', 'system_logs', ['level', 'timestamp'])
        op.create_index('ix_syslog_category_timestamp', 'system_logs', ['category', 'timestamp'])
        op.create_index('ix_syslog_container_timestamp', 'system_logs', ['container_name', 'timestamp'])
    
    if not table_exists('activity_logs'):
        op.create_table(
            'activity_logs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.String(100), nullable=True),
            sa.Column('username', sa.String(100), nullable=True),
            sa.Column('session_id', sa.String(100), nullable=True),
            sa.Column('activity_type', sa.String(50), nullable=False),
            sa.Column('action', sa.String(100), nullable=False),
            sa.Column('resource_type', sa.String(50), nullable=True),
            sa.Column('resource_id', sa.String(255), nullable=True),
            sa.Column('resource_name', sa.String(255), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('previous_state', postgresql.JSON(), nullable=True),
            sa.Column('new_state', postgresql.JSON(), nullable=True),
            sa.Column('ip_address', sa.String(45), nullable=True),
            sa.Column('user_agent', sa.String(500), nullable=True),
            sa.Column('duration_ms', sa.Integer(), nullable=True),
            sa.Column('success', sa.String(10), server_default='true'),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('year_month', sa.String(7), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_activity_user_id', 'activity_logs', ['user_id'])
        op.create_index('ix_activity_session', 'activity_logs', ['session_id'])
        op.create_index('ix_activity_type', 'activity_logs', ['activity_type'])
        op.create_index('ix_activity_action', 'activity_logs', ['action'])
        op.create_index('ix_activity_resource_type', 'activity_logs', ['resource_type'])
        op.create_index('ix_activity_resource_id', 'activity_logs', ['resource_id'])
        op.create_index('ix_activity_timestamp', 'activity_logs', ['timestamp'])
        op.create_index('ix_activity_year_month', 'activity_logs', ['year_month'])
        op.create_index('ix_activity_user_timestamp', 'activity_logs', ['user_id', 'timestamp'])
        op.create_index('ix_activity_type_timestamp', 'activity_logs', ['activity_type', 'timestamp'])
        op.create_index('ix_activity_resource', 'activity_logs', ['resource_type', 'resource_id'])
    
    if not table_exists('service_configs'):
        op.create_table(
            'service_configs',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(100), nullable=False),
            sa.Column('display_name', sa.String(200), nullable=True),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('container_name', sa.String(100), nullable=True),
            sa.Column('image_name', sa.String(255), nullable=True),
            sa.Column('image_tag', sa.String(100), nullable=True),
            sa.Column('category', sa.String(50), nullable=True),
            sa.Column('ports', postgresql.JSON(), nullable=True),
            sa.Column('volumes', postgresql.JSON(), nullable=True),
            sa.Column('environment', postgresql.JSON(), nullable=True),
            sa.Column('labels', postgresql.JSON(), nullable=True),
            sa.Column('health_check_url', sa.String(500), nullable=True),
            sa.Column('health_check_interval', sa.Integer(), server_default='60'),
            sa.Column('health_check_timeout', sa.Integer(), server_default='10'),
            sa.Column('restart_policy', sa.String(50), server_default='unless-stopped'),
            sa.Column('max_restarts', sa.Integer(), server_default='3'),
            sa.Column('dependencies', postgresql.JSON(), nullable=True),
            sa.Column('is_enabled', sa.Boolean(), server_default='true'),
            sa.Column('is_critical', sa.Boolean(), server_default='false'),
            sa.Column('public_url', sa.String(500), nullable=True),
            sa.Column('internal_url', sa.String(500), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_svc_config_service_name', 'service_configs', ['service_name'], unique=True)
        op.create_index('ix_svc_config_category', 'service_configs', ['category'])
        op.create_index('ix_svc_config_enabled', 'service_configs', ['is_enabled'])
        op.create_index('ix_svc_config_critical', 'service_configs', ['is_critical'])
    
    if not table_exists('service_settings'):
        op.create_table(
            'service_settings',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_id', sa.Integer(), nullable=False),
            sa.Column('key', sa.String(100), nullable=False),
            sa.Column('value', sa.Text(), nullable=True),
            sa.Column('value_type', sa.String(20), server_default='string'),
            sa.Column('is_secret', sa.Boolean(), server_default='false'),
            sa.Column('is_required', sa.Boolean(), server_default='false'),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('default_value', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['service_id'], ['service_configs.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_svc_setting_service_id', 'service_settings', ['service_id'])
        op.create_index('ix_svc_setting_key', 'service_settings', ['service_id', 'key'], unique=True)
    
    if not table_exists('service_dependencies'):
        op.create_table(
            'service_dependencies',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(100), nullable=False),
            sa.Column('depends_on', sa.String(100), nullable=False),
            sa.Column('dependency_type', sa.String(50), server_default='required'),
            sa.Column('startup_order', sa.Integer(), nullable=True),
            sa.Column('health_check_required', sa.Boolean(), server_default='true'),
            sa.Column('timeout_seconds', sa.Integer(), server_default='60'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_svc_dep_service', 'service_dependencies', ['service_name'])
        op.create_index('ix_svc_dep_depends', 'service_dependencies', ['depends_on'])
        op.create_index('ix_svc_dep_pair', 'service_dependencies', ['service_name', 'depends_on'], unique=True)
    
    if not table_exists('anomaly_baselines'):
        op.create_table(
            'anomaly_baselines',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(100), nullable=False),
            sa.Column('metric_name', sa.String(100), nullable=False),
            sa.Column('mean_value', sa.Float(), nullable=False),
            sa.Column('std_dev', sa.Float(), nullable=False),
            sa.Column('min_value', sa.Float(), nullable=True),
            sa.Column('max_value', sa.Float(), nullable=True),
            sa.Column('percentile_25', sa.Float(), nullable=True),
            sa.Column('percentile_50', sa.Float(), nullable=True),
            sa.Column('percentile_75', sa.Float(), nullable=True),
            sa.Column('percentile_95', sa.Float(), nullable=True),
            sa.Column('percentile_99', sa.Float(), nullable=True),
            sa.Column('sample_count', sa.Integer(), server_default='0'),
            sa.Column('last_sample_value', sa.Float(), nullable=True),
            sa.Column('anomaly_threshold_low', sa.Float(), nullable=True),
            sa.Column('anomaly_threshold_high', sa.Float(), nullable=True),
            sa.Column('sensitivity', sa.Float(), server_default='2.0'),
            sa.Column('time_window_hours', sa.Integer(), server_default='24'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_baseline_service', 'anomaly_baselines', ['service_name'])
        op.create_index('ix_baseline_metric', 'anomaly_baselines', ['metric_name'])
        op.create_index('ix_baseline_service_metric', 'anomaly_baselines', ['service_name', 'metric_name'], unique=True)
    
    if not table_exists('anomaly_events'):
        op.create_table(
            'anomaly_events',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(100), nullable=False),
            sa.Column('metric_name', sa.String(100), nullable=False),
            sa.Column('value', sa.Float(), nullable=False),
            sa.Column('baseline_mean', sa.Float(), nullable=True),
            sa.Column('baseline_std', sa.Float(), nullable=True),
            sa.Column('anomaly_score', sa.Float(), nullable=False),
            sa.Column('direction', sa.String(20), nullable=True),
            sa.Column('severity', sa.String(20), nullable=False),
            sa.Column('is_acknowledged', sa.Boolean(), server_default='false'),
            sa.Column('acknowledged_by', sa.String(100), nullable=True),
            sa.Column('acknowledged_at', sa.DateTime(), nullable=True),
            sa.Column('auto_remediated', sa.Boolean(), server_default='false'),
            sa.Column('remediation_id', sa.Integer(), nullable=True),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_anomaly_service', 'anomaly_events', ['service_name'])
        op.create_index('ix_anomaly_metric', 'anomaly_events', ['metric_name'])
        op.create_index('ix_anomaly_severity', 'anomaly_events', ['severity'])
        op.create_index('ix_anomaly_timestamp', 'anomaly_events', ['timestamp'])
        op.create_index('ix_anomaly_service_timestamp', 'anomaly_events', ['service_name', 'timestamp'])
        op.create_index('ix_anomaly_severity_timestamp', 'anomaly_events', ['severity', 'timestamp'])
        op.create_index('ix_anomaly_unacked', 'anomaly_events', ['is_acknowledged', 'timestamp'])
        op.create_index('ix_anomaly_remediation', 'anomaly_events', ['remediation_id'])
    
    if not table_exists('remediation_history'):
        op.create_table(
            'remediation_history',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('service_name', sa.String(100), nullable=False),
            sa.Column('container_name', sa.String(100), nullable=True),
            sa.Column('trigger_type', sa.String(50), nullable=False),
            sa.Column('trigger_details', postgresql.JSON(), nullable=True),
            sa.Column('issue_summary', sa.Text(), nullable=True),
            sa.Column('ai_diagnosis', sa.Text(), nullable=True),
            sa.Column('ai_plan', postgresql.JSON(), nullable=True),
            sa.Column('ai_model_used', sa.String(100), nullable=True),
            sa.Column('actions_taken', postgresql.JSON(), nullable=True),
            sa.Column('actions_count', sa.Integer(), server_default='0'),
            sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
            sa.Column('success', sa.Boolean(), nullable=True),
            sa.Column('result_message', sa.Text(), nullable=True),
            sa.Column('logs_before', sa.Text(), nullable=True),
            sa.Column('logs_after', sa.Text(), nullable=True),
            sa.Column('initiated_by', sa.String(100), nullable=True),
            sa.Column('is_automatic', sa.Boolean(), server_default='false'),
            sa.Column('started_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('completed_at', sa.DateTime(), nullable=True),
            sa.Column('duration_seconds', sa.Integer(), nullable=True),
            sa.Column('rollback_available', sa.Boolean(), server_default='false'),
            sa.Column('rollback_data', postgresql.JSON(), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_remediation_service', 'remediation_history', ['service_name'])
        op.create_index('ix_remediation_trigger_type', 'remediation_history', ['trigger_type'])
        op.create_index('ix_remediation_status', 'remediation_history', ['status'])
        op.create_index('ix_remediation_started_at', 'remediation_history', ['started_at'])
        op.create_index('ix_remediation_service_timestamp', 'remediation_history', ['service_name', 'started_at'])
        op.create_index('ix_remediation_status_timestamp', 'remediation_history', ['status', 'started_at'])
    
    if not table_exists('model_usage'):
        op.create_table(
            'model_usage',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('model_id', sa.String(100), nullable=False),
            sa.Column('provider', sa.String(50), nullable=False),
            sa.Column('request_type', sa.String(50), nullable=True),
            sa.Column('prompt_tokens', sa.Integer(), server_default='0'),
            sa.Column('completion_tokens', sa.Integer(), server_default='0'),
            sa.Column('total_tokens', sa.Integer(), server_default='0'),
            sa.Column('estimated_cost_usd', sa.Float(), server_default='0.0'),
            sa.Column('response_time_ms', sa.Integer(), nullable=True),
            sa.Column('success', sa.Boolean(), server_default='true'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('user_id', sa.String(100), nullable=True),
            sa.Column('session_id', sa.String(100), nullable=True),
            sa.Column('timestamp', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('year_month', sa.String(7), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_model_usage_model_id', 'model_usage', ['model_id'])
        op.create_index('ix_model_usage_provider', 'model_usage', ['provider'])
        op.create_index('ix_model_usage_request_type', 'model_usage', ['request_type'])
        op.create_index('ix_model_usage_user_id', 'model_usage', ['user_id'])
        op.create_index('ix_model_usage_timestamp', 'model_usage', ['timestamp'])
        op.create_index('ix_model_usage_year_month', 'model_usage', ['year_month'])
        op.create_index('ix_model_usage_model_timestamp', 'model_usage', ['model_id', 'timestamp'])
        op.create_index('ix_model_usage_provider_timestamp', 'model_usage', ['provider', 'timestamp'])
    
    if not table_exists('response_cache'):
        op.create_table(
            'response_cache',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('query_hash', sa.String(64), nullable=False),
            sa.Column('query_pattern', sa.String(500), nullable=True),
            sa.Column('query_category', sa.String(50), nullable=True),
            sa.Column('original_query', sa.Text(), nullable=False),
            sa.Column('response', sa.Text(), nullable=False),
            sa.Column('response_model', sa.String(100), nullable=True),
            sa.Column('hit_count', sa.Integer(), server_default='1'),
            sa.Column('last_hit_at', sa.DateTime(), nullable=True),
            sa.Column('quality_score', sa.Float(), nullable=True),
            sa.Column('is_verified', sa.Boolean(), server_default='false'),
            sa.Column('verified_by', sa.String(100), nullable=True),
            sa.Column('verified_at', sa.DateTime(), nullable=True),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_cache_query_hash', 'response_cache', ['query_hash'], unique=True)
        op.create_index('ix_cache_query_pattern', 'response_cache', ['query_pattern'])
        op.create_index('ix_cache_query_category', 'response_cache', ['query_category'])
        op.create_index('ix_cache_hit_count', 'response_cache', ['hit_count'])
        op.create_index('ix_cache_expires', 'response_cache', ['expires_at'])
    
    if not table_exists('request_queue'):
        op.create_table(
            'request_queue',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('request_type', sa.String(50), nullable=False),
            sa.Column('user_id', sa.String(100), nullable=True),
            sa.Column('session_id', sa.String(100), nullable=True),
            sa.Column('query', sa.Text(), nullable=False),
            sa.Column('context', postgresql.JSON(), nullable=True),
            sa.Column('preferred_model', sa.String(100), nullable=True),
            sa.Column('priority', sa.Integer(), server_default='5'),
            sa.Column('status', sa.String(20), server_default='pending'),
            sa.Column('response', sa.Text(), nullable=True),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('retry_count', sa.Integer(), server_default='0'),
            sa.Column('max_retries', sa.Integer(), server_default='3'),
            sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('processed_at', sa.DateTime(), nullable=True),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
            sa.Column('callback_url', sa.String(500), nullable=True),
            sa.Column('metadata_json', postgresql.JSON(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_queue_request_type', 'request_queue', ['request_type'])
        op.create_index('ix_queue_user_id', 'request_queue', ['user_id'])
        op.create_index('ix_queue_status', 'request_queue', ['status'])
        op.create_index('ix_queue_priority', 'request_queue', ['priority'])
        op.create_index('ix_queue_created_at', 'request_queue', ['created_at'])
        op.create_index('ix_queue_status_priority', 'request_queue', ['status', 'priority'])
        op.create_index('ix_queue_status_created', 'request_queue', ['status', 'created_at'])
        op.create_index('ix_queue_expires', 'request_queue', ['expires_at'])
    
    seed_service_configs(connection)


def downgrade():
    op.drop_table('request_queue')
    op.drop_table('response_cache')
    op.drop_table('model_usage')
    op.drop_table('remediation_history')
    op.drop_table('anomaly_events')
    op.drop_table('anomaly_baselines')
    op.drop_table('service_dependencies')
    op.drop_table('service_settings')
    op.drop_table('service_configs')
    op.drop_table('activity_logs')
    op.drop_table('system_logs')
    
    connection = op.get_bind()
    connection.execute(sa.text("DROP TYPE IF EXISTS remediationstatus"))


def table_exists(table_name):
    """Check if a table exists in the database"""
    connection = op.get_bind()
    result = connection.execute(
        sa.text(f"SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '{table_name}')")
    )
    return result.scalar()


def seed_service_configs(connection):
    """Seed initial service configurations"""
    services = [
        {
            'service_name': 'discord-bot',
            'display_name': 'Discord Ticket Bot',
            'description': 'Discord ticket system with web dashboard',
            'container_name': 'discord-bot',
            'category': 'bots',
            'is_enabled': True,
            'is_critical': False,
            'public_url': 'https://bot.evindrake.net',
            'health_check_interval': 60
        },
        {
            'service_name': 'stream-bot',
            'display_name': 'Stream Bot',
            'description': 'AI-powered Snapple facts for Twitch and Kick',
            'container_name': 'stream-bot',
            'category': 'bots',
            'is_enabled': True,
            'is_critical': False,
            'public_url': 'https://stream.evindrake.net',
            'health_check_interval': 60
        },
        {
            'service_name': 'homelab-dashboard',
            'display_name': 'Homelab Dashboard',
            'description': 'Central control panel for homelab services',
            'container_name': 'homelab-dashboard',
            'category': 'infrastructure',
            'is_enabled': True,
            'is_critical': True,
            'public_url': 'https://host.evindrake.net',
            'health_check_interval': 30
        },
        {
            'service_name': 'homelab-postgres',
            'display_name': 'PostgreSQL Database',
            'description': 'Main database for homelab services',
            'container_name': 'homelab-postgres',
            'category': 'database',
            'is_enabled': True,
            'is_critical': True,
            'health_check_interval': 30
        },
        {
            'service_name': 'redis',
            'display_name': 'Redis Cache',
            'description': 'In-memory cache and message broker',
            'container_name': 'homelab-redis',
            'category': 'database',
            'is_enabled': True,
            'is_critical': True,
            'health_check_interval': 30
        },
        {
            'service_name': 'caddy',
            'display_name': 'Caddy Reverse Proxy',
            'description': 'Web server and reverse proxy with automatic HTTPS',
            'container_name': 'caddy',
            'category': 'infrastructure',
            'is_enabled': True,
            'is_critical': True,
            'health_check_interval': 30
        },
        {
            'service_name': 'plex',
            'display_name': 'Plex Media Server',
            'description': 'Media streaming server',
            'container_name': 'plex-server',
            'category': 'media',
            'is_enabled': True,
            'is_critical': False,
            'public_url': 'https://plex.evindrake.net',
            'health_check_interval': 120
        },
        {
            'service_name': 'n8n',
            'display_name': 'n8n Automation',
            'description': 'Workflow automation platform',
            'container_name': 'n8n',
            'category': 'automation',
            'is_enabled': True,
            'is_critical': False,
            'public_url': 'https://n8n.evindrake.net',
            'health_check_interval': 60
        },
        {
            'service_name': 'homeassistant',
            'display_name': 'Home Assistant',
            'description': 'Smart home automation platform',
            'container_name': 'homeassistant',
            'category': 'automation',
            'is_enabled': True,
            'is_critical': False,
            'public_url': 'https://home.evindrake.net',
            'internal_url': 'http://homeassistant:8123',
            'health_check_interval': 60
        },
        {
            'service_name': 'vnc-desktop',
            'display_name': 'VNC Desktop',
            'description': 'Remote desktop access',
            'container_name': 'vnc-desktop',
            'category': 'utilities',
            'is_enabled': True,
            'is_critical': False,
            'public_url': 'https://vnc.evindrake.net',
            'health_check_interval': 120
        }
    ]
    
    for svc in services:
        result = connection.execute(
            sa.text("SELECT id FROM service_configs WHERE service_name = :name"),
            {'name': svc['service_name']}
        )
        if not result.fetchone():
            connection.execute(
                sa.text("""
                    INSERT INTO service_configs 
                    (service_name, display_name, description, container_name, category, 
                     is_enabled, is_critical, public_url, internal_url, health_check_interval)
                    VALUES (:service_name, :display_name, :description, :container_name, :category,
                            :is_enabled, :is_critical, :public_url, :internal_url, :health_check_interval)
                """),
                {
                    'service_name': svc['service_name'],
                    'display_name': svc['display_name'],
                    'description': svc['description'],
                    'container_name': svc['container_name'],
                    'category': svc['category'],
                    'is_enabled': svc['is_enabled'],
                    'is_critical': svc['is_critical'],
                    'public_url': svc.get('public_url'),
                    'internal_url': svc.get('internal_url'),
                    'health_check_interval': svc['health_check_interval']
                }
            )
    
    dependencies = [
        ('homelab-dashboard', 'homelab-postgres', 'required', 1),
        ('homelab-dashboard', 'redis', 'required', 2),
        ('discord-bot', 'homelab-postgres', 'required', 1),
        ('stream-bot', 'homelab-postgres', 'required', 1),
        ('stream-bot', 'redis', 'optional', 2),
    ]
    
    for service_name, depends_on, dep_type, order in dependencies:
        result = connection.execute(
            sa.text("SELECT id FROM service_dependencies WHERE service_name = :service AND depends_on = :depends"),
            {'service': service_name, 'depends': depends_on}
        )
        if not result.fetchone():
            connection.execute(
                sa.text("""
                    INSERT INTO service_dependencies 
                    (service_name, depends_on, dependency_type, startup_order)
                    VALUES (:service_name, :depends_on, :dependency_type, :startup_order)
                """),
                {
                    'service_name': service_name,
                    'depends_on': depends_on,
                    'dependency_type': dep_type,
                    'startup_order': order
                }
            )
