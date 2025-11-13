"""
Service Templates for Homelab Dashboard
Provides predefined configurations for common services
"""

import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ServiceTemplate:
    """Template for a deployable service"""
    id: str
    name: str
    description: str
    category: str  # database, web-app, utility, monitoring, etc.
    image: str
    environment_vars: Dict[str, Any] = field(default_factory=dict)
    volumes: List[str] = field(default_factory=list)
    ports: List[str] = field(default_factory=list)
    depends_on: List[str] = field(default_factory=list)
    networks: List[str] = field(default_factory=list)
    healthcheck: Optional[Dict[str, Any]] = None
    requires_subdomain: bool = True
    requires_database: bool = False
    custom_caddy_config: Optional[str] = None
    proxy_port: int = 5000  # Default internal port for Caddy reverse proxy
    proxy_protocol: str = 'http'  # http or https


class ServiceTemplateLibrary:
    """Library of predefined service templates"""
    
    def __init__(self):
        self.templates: Dict[str, ServiceTemplate] = {}
        self._load_templates()
    
    def _load_templates(self):
        """Load all predefined templates"""
        
        # Database Templates
        self.templates['postgresql'] = ServiceTemplate(
            id='postgresql',
            name='PostgreSQL Database',
            description='PostgreSQL relational database server',
            category='database',
            image='postgres:16-alpine',
            environment_vars={
                'POSTGRES_USER': {'required': True, 'description': 'Database username', 'default': 'postgres'},
                'POSTGRES_PASSWORD': {'required': True, 'description': 'Database password', 'secret': True, 'generate': True},
                'POSTGRES_DB': {'required': True, 'description': 'Initial database name', 'default': 'postgres'},
            },
            volumes=[
                '{service_name}_data:/var/lib/postgresql/data'
            ],
            ports=['5432:5432'],
            healthcheck={
                'test': ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER}'],
                'interval': '10s',
                'timeout': '5s',
                'retries': 5
            },
            requires_subdomain=False,
            proxy_port=5432,
            proxy_protocol='tcp'
        )
        
        self.templates['mysql'] = ServiceTemplate(
            id='mysql',
            name='MySQL Database',
            description='MySQL relational database server',
            category='database',
            image='mysql:8.0',
            environment_vars={
                'MYSQL_ROOT_PASSWORD': {'required': True, 'description': 'Root password', 'secret': True, 'generate': True},
                'MYSQL_DATABASE': {'required': True, 'description': 'Initial database name', 'default': 'myapp'},
                'MYSQL_USER': {'required': False, 'description': 'Additional user', 'default': 'appuser'},
                'MYSQL_PASSWORD': {'required': False, 'description': 'User password', 'secret': True, 'generate': True},
            },
            volumes=[
                '{service_name}_data:/var/lib/mysql'
            ],
            ports=['3306:3306'],
            healthcheck={
                'test': ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
                'interval': '10s',
                'timeout': '5s',
                'retries': 5
            },
            requires_subdomain=False,
            proxy_port=3306,
            proxy_protocol='tcp'
        )
        
        self.templates['redis'] = ServiceTemplate(
            id='redis',
            name='Redis Cache',
            description='In-memory data structure store',
            category='database',
            image='redis:7-alpine',
            environment_vars={
                'REDIS_PASSWORD': {'required': False, 'description': 'Redis password (optional)', 'secret': True, 'generate': True},
            },
            volumes=[
                '{service_name}_data:/data'
            ],
            ports=['6379:6379'],
            healthcheck={
                'test': ['CMD', 'redis-cli', 'ping'],
                'interval': '10s',
                'timeout': '5s',
                'retries': 5
            },
            requires_subdomain=False,
            proxy_port=6379,
            proxy_protocol='tcp'
        )
        
        self.templates['mongodb'] = ServiceTemplate(
            id='mongodb',
            name='MongoDB Database',
            description='NoSQL document database',
            category='database',
            image='mongo:7',
            environment_vars={
                'MONGO_INITDB_ROOT_USERNAME': {'required': True, 'description': 'Root username', 'default': 'admin'},
                'MONGO_INITDB_ROOT_PASSWORD': {'required': True, 'description': 'Root password', 'secret': True, 'generate': True},
            },
            volumes=[
                '{service_name}_data:/data/db'
            ],
            ports=['27017:27017'],
            healthcheck={
                'test': ['CMD', 'mongosh', '--eval', 'db.adminCommand("ping")'],
                'interval': '10s',
                'timeout': '5s',
                'retries': 5
            },
            requires_subdomain=False,
            proxy_port=27017,
            proxy_protocol='tcp'
        )
        
        # Monitoring Templates
        self.templates['grafana'] = ServiceTemplate(
            id='grafana',
            name='Grafana Dashboard',
            description='Analytics and monitoring platform',
            category='monitoring',
            image='grafana/grafana:latest',
            environment_vars={
                'GF_SECURITY_ADMIN_PASSWORD': {'required': True, 'description': 'Admin password', 'secret': True, 'generate': True},
                'GF_SERVER_DOMAIN': {'required': True, 'description': 'Your domain (e.g., grafana.example.com)'},
            },
            volumes=[
                '{service_name}_data:/var/lib/grafana'
            ],
            ports=['3000:3000'],
            requires_subdomain=True,
            proxy_port=3000,
            proxy_protocol='http'
        )
        
        self.templates['prometheus'] = ServiceTemplate(
            id='prometheus',
            name='Prometheus',
            description='Time series database for metrics',
            category='monitoring',
            image='prom/prometheus:latest',
            volumes=[
                '{service_name}_data:/prometheus',
                './prometheus.yml:/etc/prometheus/prometheus.yml'
            ],
            ports=['9090:9090'],
            requires_subdomain=True,
            proxy_port=9090,
            proxy_protocol='http'
        )
        
        # Utility Templates
        self.templates['uptime-kuma'] = ServiceTemplate(
            id='uptime-kuma',
            name='Uptime Kuma',
            description='Self-hosted monitoring tool',
            category='monitoring',
            image='louislam/uptime-kuma:1',
            volumes=[
                '{service_name}_data:/app/data'
            ],
            ports=['3001:3001'],
            requires_subdomain=True,
            proxy_port=3001,
            proxy_protocol='http'
        )
        
        self.templates['portainer'] = ServiceTemplate(
            id='portainer',
            name='Portainer',
            description='Docker management UI',
            category='utility',
            image='portainer/portainer-ce:latest',
            volumes=[
                '{service_name}_data:/data',
                '/var/run/docker.sock:/var/run/docker.sock'
            ],
            ports=['9443:9443', '8000:8000'],
            requires_subdomain=True,
            proxy_port=9443,
            proxy_protocol='https'
        )
        
        # Web Application Template (Generic)
        self.templates['custom-web-app'] = ServiceTemplate(
            id='custom-web-app',
            name='Custom Web Application',
            description='Deploy a custom Docker container as a web service',
            category='web-app',
            image='',  # User provides
            environment_vars={},
            volumes=[],
            ports=['5000:5000'],  # Default
            requires_subdomain=True,
            proxy_port=5000,
            proxy_protocol='http'
        )
    
    def get_template(self, template_id: str) -> Optional[ServiceTemplate]:
        """Get a template by ID"""
        return self.templates.get(template_id)
    
    def list_templates(self, category: Optional[str] = None) -> List[ServiceTemplate]:
        """List all templates, optionally filtered by category"""
        templates = list(self.templates.values())
        if category:
            templates = [t for t in templates if t.category == category]
        return templates
    
    def get_categories(self) -> List[str]:
        """Get all unique template categories"""
        return list(set(t.category for t in self.templates.values()))
