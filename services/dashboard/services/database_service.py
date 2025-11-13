"""
Database Deployment Service
Provides one-click deployment of database containers (PostgreSQL, MySQL, MongoDB, Redis)
"""

import docker
import logging
from typing import Dict, List, Optional
import secrets
import string

logger = logging.getLogger(__name__)


class DatabaseService:
    """Handles database container deployment and management"""
    
    def __init__(self, docker_host: str = 'unix://var/run/docker.sock'):
        try:
            self.client = docker.DockerClient(base_url=docker_host)
        except Exception as e:
            logger.error(f"Failed to connect to Docker: {e}")
            self.client = None
        
        self.db_templates = {
            'postgresql': {
                'name': 'PostgreSQL',
                'image': 'postgres:16-alpine',
                'default_port': 5432,
                'env_vars': {
                    'POSTGRES_PASSWORD': 'password',
                    'POSTGRES_DB': 'mydb'
                },
                'volume_path': '/var/lib/postgresql/data'
            },
            'mysql': {
                'name': 'MySQL',
                'image': 'mysql:8.0',
                'default_port': 3306,
                'env_vars': {
                    'MYSQL_ROOT_PASSWORD': 'password',
                    'MYSQL_DATABASE': 'mydb'
                },
                'volume_path': '/var/lib/mysql'
            },
            'mongodb': {
                'name': 'MongoDB',
                'image': 'mongo:7',
                'default_port': 27017,
                'env_vars': {
                    'MONGO_INITDB_ROOT_USERNAME': 'admin',
                    'MONGO_INITDB_ROOT_PASSWORD': 'password',
                    'MONGO_INITDB_DATABASE': 'mydb'
                },
                'volume_path': '/data/db'
            },
            'redis': {
                'name': 'Redis',
                'image': 'redis:7-alpine',
                'default_port': 6379,
                'env_vars': {},
                'volume_path': '/data'
            }
        }
    
    def list_databases(self) -> List[Dict]:
        """List all running database containers"""
        if not self.client:
            raise Exception("Docker client not available")
        
        databases = []
        
        try:
            containers = self.client.containers.list(all=True)
            
            for container in containers:
                # Check if container matches known database images
                image = container.image.tags[0] if container.image.tags else ''
                db_type = None
                
                if 'postgres' in image.lower():
                    db_type = 'postgresql'
                elif 'mysql' in image.lower():
                    db_type = 'mysql'
                elif 'mongo' in image.lower():
                    db_type = 'mongodb'
                elif 'redis' in image.lower():
                    db_type = 'redis'
                
                if db_type:
                    databases.append({
                        'name': container.name,
                        'type': db_type,
                        'image': image,
                        'status': container.status,
                        'ports': self._extract_ports(container),
                        'created': container.attrs.get('Created', ''),
                        'id': container.id[:12]
                    })
            
            return databases
            
        except Exception as e:
            logger.error(f"Error listing databases: {e}")
            raise
    
    def create_database(self, db_type: str, container_name: str, 
                       port: int, password: str, volume_name: Optional[str] = None) -> Dict:
        """Deploy a new database container"""
        if not self.client:
            raise Exception("Docker client not available")
        
        if db_type not in self.db_templates:
            raise ValueError(f"Unsupported database type: {db_type}")
        
        template = self.db_templates[db_type]
        
        try:
            # Check if container already exists
            try:
                existing = self.client.containers.get(container_name)
                raise Exception(f"Container '{container_name}' already exists")
            except docker.errors.NotFound:
                pass
            
            # Prepare environment variables
            env = {}
            for key, default_value in template['env_vars'].items():
                if 'PASSWORD' in key:
                    env[key] = password
                elif 'DATABASE' in key or 'DB' in key:
                    env[key] = 'mydb'
                else:
                    env[key] = default_value
            
            # Prepare volume
            volumes = {}
            if volume_name:
                volumes[volume_name] = {'bind': template['volume_path'], 'mode': 'rw'}
            
            # Create container
            container = self.client.containers.run(
                image=template['image'],
                name=container_name,
                environment=env,
                ports={f"{template['default_port']}/tcp": port},
                volumes=volumes,
                detach=True,
                restart_policy={"Name": "unless-stopped"}
            )
            
            logger.info(f"Created {db_type} database: {container_name}")
            
            return {
                'success': True,
                'container_id': container.id[:12],
                'container_name': container_name,
                'type': db_type,
                'port': port,
                'connection_info': self.get_connection_examples(db_type, container_name, port, password)
            }
            
        except docker.errors.ImageNotFound:
            logger.info(f"Pulling {template['image']}...")
            self.client.images.pull(template['image'])
            # Retry creation after pulling image
            return self.create_database(db_type, container_name, port, password, volume_name)
        except Exception as e:
            logger.error(f"Error creating database: {e}")
            raise
    
    def get_database_info(self, container_name: str) -> Dict:
        """Get detailed information about a database container"""
        if not self.client:
            raise Exception("Docker client not available")
        
        try:
            container = self.client.containers.get(container_name)
            
            # Determine database type
            image = container.image.tags[0] if container.image.tags else ''
            db_type = 'unknown'
            
            if 'postgres' in image.lower():
                db_type = 'postgresql'
            elif 'mysql' in image.lower():
                db_type = 'mysql'
            elif 'mongo' in image.lower():
                db_type = 'mongodb'
            elif 'redis' in image.lower():
                db_type = 'redis'
            
            ports = self._extract_ports(container)
            env = container.attrs.get('Config', {}).get('Env', [])
            
            # Parse environment variables
            env_dict = {}
            for item in env:
                if '=' in item:
                    key, value = item.split('=', 1)
                    env_dict[key] = value
            
            return {
                'name': container.name,
                'type': db_type,
                'image': image,
                'status': container.status,
                'ports': ports,
                'environment': env_dict,
                'created': container.attrs.get('Created', ''),
                'id': container.id[:12]
            }
            
        except docker.errors.NotFound:
            raise Exception(f"Container '{container_name}' not found")
        except Exception as e:
            logger.error(f"Error getting database info: {e}")
            raise
    
    def delete_database(self, container_name: str, delete_volume: bool = False) -> Dict:
        """Delete a database container and optionally its volume"""
        if not self.client:
            raise Exception("Docker client not available")
        
        try:
            container = self.client.containers.get(container_name)
            
            # Get volume names before deletion
            volumes = []
            if delete_volume:
                mounts = container.attrs.get('Mounts', [])
                for mount in mounts:
                    if mount.get('Type') == 'volume':
                        volumes.append(mount.get('Name'))
            
            # Stop and remove container
            container.stop(timeout=10)
            container.remove()
            
            logger.info(f"Deleted database container: {container_name}")
            
            # Delete volumes if requested
            deleted_volumes = []
            if delete_volume:
                for volume_name in volumes:
                    try:
                        volume = self.client.volumes.get(volume_name)
                        volume.remove()
                        deleted_volumes.append(volume_name)
                        logger.info(f"Deleted volume: {volume_name}")
                    except Exception as e:
                        logger.error(f"Error deleting volume {volume_name}: {e}")
            
            return {
                'success': True,
                'container_name': container_name,
                'deleted_volumes': deleted_volumes
            }
            
        except docker.errors.NotFound:
            raise Exception(f"Container '{container_name}' not found")
        except Exception as e:
            logger.error(f"Error deleting database: {e}")
            raise
    
    def backup_database(self, container_name: str, backup_path: str) -> Dict:
        """Create a backup of a database container"""
        if not self.client:
            raise Exception("Docker client not available")
        
        try:
            container = self.client.containers.get(container_name)
            
            # Determine database type
            image = container.image.tags[0] if container.image.tags else ''
            
            if 'postgres' in image.lower():
                return self._backup_postgresql(container, backup_path)
            elif 'mysql' in image.lower():
                return self._backup_mysql(container, backup_path)
            elif 'mongo' in image.lower():
                return self._backup_mongodb(container, backup_path)
            else:
                raise Exception(f"Backup not supported for this database type")
            
        except docker.errors.NotFound:
            raise Exception(f"Container '{container_name}' not found")
        except Exception as e:
            logger.error(f"Error backing up database: {e}")
            raise
    
    def get_connection_examples(self, db_type: str, container_name: str, 
                                port: int, password: str, 
                                username: str = None, database: str = None) -> Dict:
        """Get connection string examples for different programming languages"""
        
        # Set defaults based on db type if not provided
        if not username:
            username = {'postgresql': 'postgres', 'mysql': 'root', 'mongodb': 'admin'}.get(db_type, 'user')
        if not database:
            database = 'mydb'
        
        examples = {
            'postgresql': {
                'url': f'postgresql://{username}:{password}@localhost:{port}/{database}',
                'python': f'psycopg2.connect("host=localhost port={port} dbname={database} user={username} password={password}")',
                'node': f'postgres://{username}:{password}@localhost:{port}/{database}',
                'docker': f'postgresql://{container_name}:5432/{database}'
            },
            'mysql': {
                'url': f'mysql://{username}:{password}@localhost:{port}/{database}',
                'python': f'mysql.connector.connect(host="localhost", port={port}, user="{username}", password="{password}", database="{database}")',
                'node': f'mysql://{username}:{password}@localhost:{port}/{database}',
                'docker': f'mysql://{container_name}:3306/{database}'
            },
            'mongodb': {
                'url': f'mongodb://{username}:{password}@localhost:{port}/{database}?authSource=admin',
                'python': f'MongoClient("mongodb://{username}:{password}@localhost:{port}/{database}?authSource=admin")',
                'node': f'mongodb://{username}:{password}@localhost:{port}/{database}?authSource=admin',
                'docker': f'mongodb://{container_name}:27017/{database}'
            },
            'redis': {
                'url': f'redis://localhost:{port}',
                'python': f'redis.Redis(host="localhost", port={port})',
                'node': f'redis://localhost:{port}',
                'docker': f'redis://{container_name}:6379'
            }
        }
        
        return examples.get(db_type, {})
    
    def _extract_ports(self, container) -> Dict:
        """Extract port mappings from container"""
        ports = {}
        port_data = container.attrs.get('NetworkSettings', {}).get('Ports', {})
        
        for container_port, host_bindings in port_data.items():
            if host_bindings:
                for binding in host_bindings:
                    ports[container_port] = binding.get('HostPort', '')
        
        return ports
    
    def _backup_postgresql(self, container, backup_path: str) -> Dict:
        """Backup PostgreSQL database"""
        # Execute pg_dump inside container
        exec_result = container.exec_run(
            'pg_dump -U postgres -d mydb',
            stdout=True,
            stderr=True
        )
        
        if exec_result.exit_code != 0:
            raise Exception(f"Backup failed: {exec_result.output.decode()}")
        
        # Write backup to file
        with open(backup_path, 'wb') as f:
            f.write(exec_result.output)
        
        return {
            'success': True,
            'backup_path': backup_path,
            'type': 'postgresql'
        }
    
    def _backup_mysql(self, container, backup_path: str) -> Dict:
        """Backup MySQL database"""
        # Get password from environment
        env = container.attrs.get('Config', {}).get('Env', [])
        password = None
        for item in env:
            if item.startswith('MYSQL_ROOT_PASSWORD='):
                password = item.split('=', 1)[1]
                break
        
        if not password:
            raise Exception("Could not find MySQL root password")
        
        # Execute mysqldump inside container
        exec_result = container.exec_run(
            f'mysqldump -u root -p{password} mydb',
            stdout=True,
            stderr=True
        )
        
        if exec_result.exit_code != 0:
            raise Exception(f"Backup failed: {exec_result.output.decode()}")
        
        # Write backup to file
        with open(backup_path, 'wb') as f:
            f.write(exec_result.output)
        
        return {
            'success': True,
            'backup_path': backup_path,
            'type': 'mysql'
        }
    
    def _backup_mongodb(self, container, backup_path: str) -> Dict:
        """Backup MongoDB database"""
        # Get credentials from environment
        env = container.attrs.get('Config', {}).get('Env', [])
        username = None
        password = None
        
        for item in env:
            if item.startswith('MONGO_INITDB_ROOT_USERNAME='):
                username = item.split('=', 1)[1]
            elif item.startswith('MONGO_INITDB_ROOT_PASSWORD='):
                password = item.split('=', 1)[1]
        
        if not username or not password:
            raise Exception("Could not find MongoDB credentials")
        
        # Execute mongodump inside container
        exec_result = container.exec_run(
            f'mongodump --username={username} --password={password} --authenticationDatabase=admin --db=mydb --archive',
            stdout=True,
            stderr=True
        )
        
        if exec_result.exit_code != 0:
            raise Exception(f"Backup failed: {exec_result.output.decode()}")
        
        # Write backup to file
        with open(backup_path, 'wb') as f:
            f.write(exec_result.output)
        
        return {
            'success': True,
            'backup_path': backup_path,
            'type': 'mongodb'
        }


def generate_password(length: int = 16) -> str:
    """Generate a secure random password"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))
