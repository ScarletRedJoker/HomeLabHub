"""Optimize database indexes for performance

Revision ID: 013
Revises: 012_add_unified_logging
Create Date: 2025-11-19 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '013'
down_revision = '012_add_unified_logging'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Storage metrics indexes
    op.create_index('ix_storage_metrics_timestamp', 'storage_metrics', ['timestamp'])
    op.create_index('ix_storage_metrics_metric_type', 'storage_metrics', ['metric_type'])
    op.create_index('ix_storage_metrics_metric_type_timestamp', 'storage_metrics', ['metric_type', 'timestamp'])
    
    # Storage alerts indexes
    op.create_index('ix_storage_alerts_alert_enabled', 'storage_alerts', ['alert_enabled'])
    op.create_index('ix_storage_alerts_created_at', 'storage_alerts', ['created_at'])
    op.create_index('ix_storage_alerts_updated_at', 'storage_alerts', ['updated_at'])
    
    # Agent indexes
    op.create_index('ix_agents_status', 'agents', ['status'])
    op.create_index('ix_agents_created_at', 'agents', ['created_at'])
    op.create_index('ix_agents_last_active', 'agents', ['last_active'])
    op.create_index('ix_agents_current_task_id', 'agents', ['current_task_id'])
    
    # Agent tasks indexes
    op.create_index('ix_agent_tasks_status', 'agent_tasks', ['status'])
    op.create_index('ix_agent_tasks_priority', 'agent_tasks', ['priority'])
    op.create_index('ix_agent_tasks_created_at', 'agent_tasks', ['created_at'])
    op.create_index('ix_agent_tasks_started_at', 'agent_tasks', ['started_at'])
    op.create_index('ix_agent_tasks_completed_at', 'agent_tasks', ['completed_at'])
    op.create_index('ix_agent_tasks_assigned_agent_id', 'agent_tasks', ['assigned_agent_id'])
    op.create_index('ix_agent_tasks_parent_task_id', 'agent_tasks', ['parent_task_id'])
    op.create_index('ix_agent_tasks_status_priority', 'agent_tasks', ['status', 'priority'])
    op.create_index('ix_agent_tasks_status_created_at', 'agent_tasks', ['status', 'created_at'])
    
    # Agent conversation indexes
    op.create_index('ix_agent_conversations_task_id', 'agent_conversations', ['task_id'])
    op.create_index('ix_agent_conversations_from_agent_id', 'agent_conversations', ['from_agent_id'])
    op.create_index('ix_agent_conversations_to_agent_id', 'agent_conversations', ['to_agent_id'])
    op.create_index('ix_agent_conversations_timestamp', 'agent_conversations', ['timestamp'])
    
    # Google service status indexes
    op.create_index('ix_google_service_status_status', 'google_service_status', ['status'])
    op.create_index('ix_google_service_status_created_at', 'google_service_status', ['created_at'])
    op.create_index('ix_google_service_status_updated_at', 'google_service_status', ['updated_at'])
    op.create_index('ix_google_service_status_last_connected', 'google_service_status', ['last_connected'])
    
    # Calendar automations indexes
    op.create_index('ix_calendar_automations_status', 'calendar_automations', ['status'])
    op.create_index('ix_calendar_automations_created_at', 'calendar_automations', ['created_at'])
    op.create_index('ix_calendar_automations_updated_at', 'calendar_automations', ['updated_at'])
    op.create_index('ix_calendar_automations_last_triggered', 'calendar_automations', ['last_triggered'])
    
    # Email notifications indexes
    op.create_index('ix_email_notifications_status', 'email_notifications', ['status'])
    op.create_index('ix_email_notifications_created_at', 'email_notifications', ['created_at'])
    op.create_index('ix_email_notifications_sent_at', 'email_notifications', ['sent_at'])
    op.create_index('ix_email_notifications_recipient', 'email_notifications', ['recipient'])
    
    # Drive backups indexes
    op.create_index('ix_drive_backups_status', 'drive_backups', ['status'])
    op.create_index('ix_drive_backups_created_at', 'drive_backups', ['created_at'])
    op.create_index('ix_drive_backups_updated_at', 'drive_backups', ['updated_at'])
    op.create_index('ix_drive_backups_uploaded_at', 'drive_backups', ['uploaded_at'])
    op.create_index('ix_drive_backups_deleted', 'drive_backups', ['deleted'])
    op.create_index('ix_drive_backups_deleted_status', 'drive_backups', ['deleted', 'status'])
    
    # NAS mounts indexes
    op.create_index('ix_nas_mounts_is_active', 'nas_mounts', ['is_active'])
    op.create_index('ix_nas_mounts_created_at', 'nas_mounts', ['created_at'])
    op.create_index('ix_nas_mounts_updated_at', 'nas_mounts', ['updated_at'])
    
    # NAS backup jobs indexes
    op.create_index('ix_nas_backup_jobs_status', 'nas_backup_jobs', ['status'])
    op.create_index('ix_nas_backup_jobs_created_at', 'nas_backup_jobs', ['created_at'])
    op.create_index('ix_nas_backup_jobs_completed_at', 'nas_backup_jobs', ['completed_at'])
    
    # Deployment indexes (additional)
    op.create_index('ix_deployments_status', 'deployments', ['status'])
    op.create_index('ix_deployments_deployed_at', 'deployments', ['deployed_at'])
    op.create_index('ix_deployments_health_status', 'deployments', ['health_status'])
    op.create_index('ix_deployments_last_health_check', 'deployments', ['last_health_check'])
    op.create_index('ix_deployments_status_health_status', 'deployments', ['status', 'health_status'])
    
    # Deployed apps indexes (additional)
    op.create_index('ix_deployed_apps_deployed_at', 'deployed_apps', ['deployed_at'])
    op.create_index('ix_deployed_apps_last_check', 'deployed_apps', ['last_check'])
    op.create_index('ix_deployed_apps_health_status', 'deployed_apps', ['health_status'])
    
    # Workflow indexes (additional to 003)
    op.create_index('ix_workflows_completed_at', 'workflows', ['completed_at'])
    op.create_index('ix_workflows_workflow_type', 'workflows', ['workflow_type'])
    
    # Task indexes (additional to 003)
    op.create_index('ix_tasks_created_at', 'tasks', ['created_at'])
    op.create_index('ix_tasks_completed_at', 'tasks', ['completed_at'])


def downgrade() -> None:
    # Task indexes
    op.drop_index('ix_tasks_completed_at', table_name='tasks')
    op.drop_index('ix_tasks_created_at', table_name='tasks')
    
    # Workflow indexes
    op.drop_index('ix_workflows_workflow_type', table_name='workflows')
    op.drop_index('ix_workflows_completed_at', table_name='workflows')
    
    # Deployed apps indexes
    op.drop_index('ix_deployed_apps_health_status', table_name='deployed_apps')
    op.drop_index('ix_deployed_apps_last_check', table_name='deployed_apps')
    op.drop_index('ix_deployed_apps_deployed_at', table_name='deployed_apps')
    
    # Deployment indexes
    op.drop_index('ix_deployments_status_health_status', table_name='deployments')
    op.drop_index('ix_deployments_last_health_check', table_name='deployments')
    op.drop_index('ix_deployments_health_status', table_name='deployments')
    op.drop_index('ix_deployments_deployed_at', table_name='deployments')
    op.drop_index('ix_deployments_status', table_name='deployments')
    
    # NAS backup jobs indexes
    op.drop_index('ix_nas_backup_jobs_completed_at', table_name='nas_backup_jobs')
    op.drop_index('ix_nas_backup_jobs_created_at', table_name='nas_backup_jobs')
    op.drop_index('ix_nas_backup_jobs_status', table_name='nas_backup_jobs')
    
    # NAS mounts indexes
    op.drop_index('ix_nas_mounts_updated_at', table_name='nas_mounts')
    op.drop_index('ix_nas_mounts_created_at', table_name='nas_mounts')
    op.drop_index('ix_nas_mounts_is_active', table_name='nas_mounts')
    
    # Drive backups indexes
    op.drop_index('ix_drive_backups_deleted_status', table_name='drive_backups')
    op.drop_index('ix_drive_backups_deleted', table_name='drive_backups')
    op.drop_index('ix_drive_backups_uploaded_at', table_name='drive_backups')
    op.drop_index('ix_drive_backups_updated_at', table_name='drive_backups')
    op.drop_index('ix_drive_backups_created_at', table_name='drive_backups')
    op.drop_index('ix_drive_backups_status', table_name='drive_backups')
    
    # Email notifications indexes
    op.drop_index('ix_email_notifications_recipient', table_name='email_notifications')
    op.drop_index('ix_email_notifications_sent_at', table_name='email_notifications')
    op.drop_index('ix_email_notifications_created_at', table_name='email_notifications')
    op.drop_index('ix_email_notifications_status', table_name='email_notifications')
    
    # Calendar automations indexes
    op.drop_index('ix_calendar_automations_last_triggered', table_name='calendar_automations')
    op.drop_index('ix_calendar_automations_updated_at', table_name='calendar_automations')
    op.drop_index('ix_calendar_automations_created_at', table_name='calendar_automations')
    op.drop_index('ix_calendar_automations_status', table_name='calendar_automations')
    
    # Google service status indexes
    op.drop_index('ix_google_service_status_last_connected', table_name='google_service_status')
    op.drop_index('ix_google_service_status_updated_at', table_name='google_service_status')
    op.drop_index('ix_google_service_status_created_at', table_name='google_service_status')
    op.drop_index('ix_google_service_status_status', table_name='google_service_status')
    
    # Agent conversation indexes
    op.drop_index('ix_agent_conversations_timestamp', table_name='agent_conversations')
    op.drop_index('ix_agent_conversations_to_agent_id', table_name='agent_conversations')
    op.drop_index('ix_agent_conversations_from_agent_id', table_name='agent_conversations')
    op.drop_index('ix_agent_conversations_task_id', table_name='agent_conversations')
    
    # Agent tasks indexes
    op.drop_index('ix_agent_tasks_status_created_at', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_status_priority', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_parent_task_id', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_assigned_agent_id', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_completed_at', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_started_at', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_created_at', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_priority', table_name='agent_tasks')
    op.drop_index('ix_agent_tasks_status', table_name='agent_tasks')
    
    # Agent indexes
    op.drop_index('ix_agents_current_task_id', table_name='agents')
    op.drop_index('ix_agents_last_active', table_name='agents')
    op.drop_index('ix_agents_created_at', table_name='agents')
    op.drop_index('ix_agents_status', table_name='agents')
    
    # Storage alerts indexes
    op.drop_index('ix_storage_alerts_updated_at', table_name='storage_alerts')
    op.drop_index('ix_storage_alerts_created_at', table_name='storage_alerts')
    op.drop_index('ix_storage_alerts_alert_enabled', table_name='storage_alerts')
    
    # Storage metrics indexes
    op.drop_index('ix_storage_metrics_metric_type_timestamp', table_name='storage_metrics')
    op.drop_index('ix_storage_metrics_metric_type', table_name='storage_metrics')
    op.drop_index('ix_storage_metrics_timestamp', table_name='storage_metrics')
