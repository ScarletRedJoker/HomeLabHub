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
    'DriveBackup'
]
