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
from .domain_record import DomainRecord, RecordType, RecordStatus
from .domain_event import DomainEvent
from .domain_task import DomainTask
from .jarvis import Project, ArtifactBuild, ComposeSpec, SSLCertificate, AISession
from .google_integration import GoogleServiceStatus, CalendarAutomation, EmailNotification, DriveBackup
from .jarvis_action import JarvisAction, ActionStatus, ActionType
from .celery_job_history import CeleryJobHistory, JobStatus
from .user_preferences import UserPreferences
from .jarvis_task import JarvisTask
from .dyndns_host import DynDNSHost

__all__ = [
    'Base',
    'get_engine',
    'get_session',
    'Workflow',
    'Task',
    'Artifact',
    'Deployment',
    'DomainRecord',
    'RecordType',
    'RecordStatus',
    'DomainEvent',
    'DomainTask',
    'Project',
    'ArtifactBuild',
    'ComposeSpec',
    'SSLCertificate',
    'AISession',
    'GoogleServiceStatus',
    'CalendarAutomation',
    'EmailNotification',
    'DriveBackup',
    'JarvisAction',
    'ActionStatus',
    'ActionType',
    'CeleryJobHistory',
    'JobStatus',
    'UserPreferences',
    'JarvisTask',
    'DynDNSHost'
]
