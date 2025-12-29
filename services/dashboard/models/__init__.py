from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

Base = declarative_base()

def get_engine():
    database_url = os.environ.get('JARVIS_DATABASE_URL')
    if not database_url:
        raise RuntimeError("JARVIS_DATABASE_URL environment variable is not set")
    return create_engine(database_url, pool_pre_ping=True)

def get_session():
    engine = get_engine()
    Session = sessionmaker(bind=engine)
    return Session()

from .workflow import Workflow
from .task import Task
from .artifact import Artifact
from .deployment import Deployment
from .domain_record import DomainRecord
from .jarvis import Project, ArtifactBuild, ComposeSpec, SSLCertificate, AISession
from .google_integration import GoogleServiceStatus, CalendarAutomation, EmailNotification, DriveBackup
from .marketplace import MarketplaceApp, DeployedApp
from .agent import Agent, AgentTask, AgentConversation, AgentType, AgentStatus
from .subscription import Subscription, LicenseActivation, UsageMetric, SubscriptionTier, SubscriptionStatus
from .plex import PlexImportJob, PlexImportItem
from .service_ops import ServiceTelemetry
from .storage import StorageMetric, StorageAlert
from .gaming import GameSession, SunshineHost
from .db_admin import DBCredential, DBBackupJob
from .nas import NASMount, NASBackupJob
from .health_check import ServiceHealthCheck, ServiceHealthAlert
from .rbac import User, UserRole, Permission, ServiceOwnership, RoleAssignment, ROLE_PERMISSIONS
from .audit import AuditLog
from .deployment_queue import DeploymentQueue, DeploymentStatus, DeploymentLog
from .system_log import SystemLog, ActivityLog
from .service_config import ServiceConfig, ServiceSetting, ServiceDependency
from .jarvis_ai import (
    AnomalyBaseline, AnomalyEvent, RemediationHistory, RemediationStatus,
    ModelUsage, ResponseCache, RequestQueue
)
from .fleet import FleetHost, FleetCommand
from .builder_project import (
    BuilderProject, BuilderPage, BuilderCheckpoint,
    BuilderProjectStatus, BuilderTechStack, CheckpointStatus
)
from .settings import SystemSetting
from .notification import Alert, AlertSeverity, NotificationSettings
from .organization import Organization, OrganizationMember, APIKey, OrganizationTier, MemberRole, ROLE_HIERARCHY
from .network_resource import NetworkResource, NetworkDiscoveryLog, ResourceType, HealthStatus
from .studio import (
    StudioProject, ProjectFile, ProjectBuild, ProjectDeployment,
    ProjectType, ProjectLanguage, ProjectStatus, BuildStatus as StudioBuildStatus,
    DeploymentTarget, DeploymentStatus as StudioDeploymentStatus
)
from .monitoring_alerts import (
    MonitoringAlert, MonitoringAlertNotification, MonitoringAlertHistory,
    AlertType, AlertCondition, NotificationType
)
from .activity import (
    ActivityEvent, ActivitySubscription, EventSeverity, SourceService
)

__all__ = [
    'Base',
    'get_engine',
    'get_session',
    'Workflow',
    'Task',
    'Artifact',
    'Deployment',
    'DomainRecord',
    'Project',
    'ArtifactBuild',
    'ComposeSpec',
    'SSLCertificate',
    'AISession',
    'GoogleServiceStatus',
    'CalendarAutomation',
    'EmailNotification',
    'DriveBackup',
    'MarketplaceApp',
    'DeployedApp',
    'Agent',
    'AgentTask',
    'AgentConversation',
    'AgentType',
    'AgentStatus',
    'Subscription',
    'LicenseActivation',
    'UsageMetric',
    'SubscriptionTier',
    'SubscriptionStatus',
    'PlexImportJob',
    'PlexImportItem',
    'ServiceTelemetry',
    'StorageMetric',
    'StorageAlert',
    'GameSession',
    'SunshineHost',
    'DBCredential',
    'DBBackupJob',
    'NASMount',
    'NASBackupJob',
    'ServiceHealthCheck',
    'ServiceHealthAlert',
    'User',
    'UserRole',
    'Permission',
    'ServiceOwnership',
    'RoleAssignment',
    'ROLE_PERMISSIONS',
    'AuditLog',
    'DeploymentQueue',
    'DeploymentStatus',
    'DeploymentLog',
    'SystemLog',
    'ActivityLog',
    'ServiceConfig',
    'ServiceSetting',
    'ServiceDependency',
    'AnomalyBaseline',
    'AnomalyEvent',
    'RemediationHistory',
    'RemediationStatus',
    'ModelUsage',
    'ResponseCache',
    'RequestQueue',
    'FleetHost',
    'FleetCommand',
    'BuilderProject',
    'BuilderPage',
    'BuilderCheckpoint',
    'BuilderProjectStatus',
    'BuilderTechStack',
    'CheckpointStatus',
    'SystemSetting',
    'Alert',
    'AlertSeverity',
    'NotificationSettings',
    'Organization',
    'OrganizationMember',
    'APIKey',
    'OrganizationTier',
    'MemberRole',
    'ROLE_HIERARCHY',
    'NetworkResource',
    'NetworkDiscoveryLog',
    'ResourceType',
    'HealthStatus',
    'StudioProject',
    'ProjectFile',
    'ProjectBuild',
    'ProjectDeployment',
    'ProjectType',
    'ProjectLanguage',
    'ProjectStatus',
    'StudioBuildStatus',
    'DeploymentTarget',
    'StudioDeploymentStatus',
    'MonitoringAlert',
    'MonitoringAlertNotification',
    'MonitoringAlertHistory',
    'AlertType',
    'AlertCondition',
    'NotificationType',
    'ActivityEvent',
    'ActivitySubscription',
    'EventSeverity',
    'SourceService'
]
