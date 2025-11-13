"""
Database Deployment Service
Provides one-click deployment of database containers (PostgreSQL, MySQL, MongoDB, Redis)
"""

import subprocess
import json
import logging
from typing import Dict, List, Optional
import secrets
import string

logger = logging.getLogger(__name__)


class DatabaseService:
    """Handles database container deployment and management"""
    
    def __init__(self):
        # No cached connection check - let each call fail naturally if Docker unavailable
        # This allows automatic recovery if Docker becomes available later
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
        databases = []
        
        try:
            result = subprocess.run(
                ['docker', 'ps', '-a', '--format', '{{json .}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                raise Exception(f"Error listing containers: {result.stderr}")
            
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                
                container_data = json.loads(line)
                image = container_data.get('Image', '').lower()
                
                db_type = None
                if 'postgres' in image:
                    db_type = 'postgresql'
                elif 'mysql' in image:
                    db_type = 'mysql'
                elif 'mongo' in image:
                    db_type = 'mongodb'
                elif 'redis' in image:
                    db_type = 'redis'
                
                if db_type:
                    # Get detailed container info
                    inspect_result = subprocess.run(
                        ['docker', 'inspect', container_data['Names']],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    if inspect_result.returncode == 0:
                        container_details = json.loads(inspect_result.stdout)[0]
                        ports = self._extract_ports(container_details)
                        
                        databases.append({
                            'name': container_data['Names'],
                            'type': db_type,
                            'image': container_data.get('Image', ''),
                            'status': container_data.get('State', ''),
                            'ports': ports,
                            'created': container_data.get('CreatedAt', ''),
                            'id': container_data['ID'][:12]
                        })
            
            return databases
            
        except Exception as e:
            logger.error(f"Error listing databases: {e}")
            raise
    
    def create_database(self, db_type: str, container_name: str, 
                       port: int, password: str, volume_name: Optional[str] = None) -> Dict:
        """Deploy a new database container"""
        if db_type not in self.db_templates:
            raise ValueError(f"Unsupported database type: {db_type}")
        
        # Normalize empty strings to None (matching SDK behavior)
        if volume_name is not None and not volume_name.strip():
            volume_name = None
        
        template = self.db_templates[db_type]
        
        try:
            # Check if container already exists
            check_result = subprocess.run(
                ['docker', 'inspect', container_name],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if check_result.returncode == 0:
                raise Exception(f"Container '{container_name}' already exists")
            
            # Prepare environment variables
            env_args = []
            for key, default_value in template['env_vars'].items():
                if 'PASSWORD' in key:
                    env_args.extend(['-e', f'{key}={password}'])
                elif 'DATABASE' in key or 'DB' in key:
                    env_args.extend(['-e', f'{key}=mydb'])
                else:
                    env_args.extend(['-e', f'{key}={default_value}'])
            
            # Create and prepare volume (matching SDK behavior)
            # Auto-generate volume name if not provided (SDK default behavior)
            if volume_name is None:
                volume_name = f"{container_name}-data"
            
            volume_args = []
            
            # Differentiate between Docker volumes and host bind paths
            # Only treat as file system path if it starts with /, ./, or ../
            # Docker volume names can contain slashes, so don't assume '/' means file path
            is_host_path = (
                volume_name.startswith('/') or 
                volume_name.startswith('./') or 
                volume_name.startswith('../')
            )
            
            if is_host_path:
                # Host bind mount - use directly without creating volume
                volume_args = ['-v', f'{volume_name}:{template["volume_path"]}']
                logger.info(f"Using host bind mount: {volume_name}")
            else:
                # Docker named volume - create if doesn't exist
                vol_check = subprocess.run(
                    ['docker', 'volume', 'inspect', volume_name],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if vol_check.returncode != 0:
                    # Volume doesn't exist, create it
                    vol_create = subprocess.run(
                        ['docker', 'volume', 'create', volume_name],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if vol_create.returncode != 0:
                        raise Exception(f"Failed to create volume: {vol_create.stderr}")
                    
                    logger.info(f"Created Docker volume: {volume_name}")
                
                volume_args = ['-v', f'{volume_name}:{template["volume_path"]}']
            
            # Build docker run command
            cmd = [
                'docker', 'run', '-d',
                '--name', container_name,
                '-p', f'{port}:{template["default_port"]}',
                '--restart', 'unless-stopped'
            ]
            cmd.extend(env_args)
            cmd.extend(volume_args)
            cmd.append(template['image'])
            
            # Run container
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                # Check if it's an image not found error
                if 'Unable to find image' in result.stderr:
                    # Pull the image
                    logger.info(f"Pulling {template['image']}...")
                    pull_result = subprocess.run(
                        ['docker', 'pull', template['image']],
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    
                    if pull_result.returncode != 0:
                        raise Exception(f"Failed to pull image: {pull_result.stderr}")
                    
                    # Retry creation
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    
                    if result.returncode != 0:
                        raise Exception(f"Failed to create container: {result.stderr}")
                else:
                    raise Exception(f"Failed to create container: {result.stderr}")
            
            container_id = result.stdout.strip()[:12]
            logger.info(f"Created {db_type} database: {container_name}")
            
            return {
                'success': True,
                'container_id': container_id,
                'container_name': container_name,
                'type': db_type,
                'port': port,
                'connection_info': self.get_connection_examples(db_type, container_name, port, password)
            }
            
        except Exception as e:
            logger.error(f"Error creating database: {e}")
            raise
    
    def get_database_info(self, container_name: str) -> Dict:
        """Get detailed information about a database container"""
        try:
            result = subprocess.run(
                ['docker', 'inspect', container_name],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                raise Exception(f"Container '{container_name}' not found")
            
            container_data = json.loads(result.stdout)[0]
            
            # Determine database type
            image = container_data['Config']['Image'].lower()
            db_type = 'unknown'
            
            if 'postgres' in image:
                db_type = 'postgresql'
            elif 'mysql' in image:
                db_type = 'mysql'
            elif 'mongo' in image:
                db_type = 'mongodb'
            elif 'redis' in image:
                db_type = 'redis'
            
            ports = self._extract_ports(container_data)
            
            # Parse environment variables
            env_dict = {}
            for item in container_data['Config'].get('Env', []):
                if '=' in item:
                    key, value = item.split('=', 1)
                    env_dict[key] = value
            
            return {
                'name': container_data['Name'].lstrip('/'),
                'type': db_type,
                'image': container_data['Config']['Image'],
                'status': container_data['State']['Status'],
                'ports': ports,
                'environment': env_dict,
                'created': container_data['Created'],
                'id': container_data['Id'][:12]
            }
            
        except Exception as e:
            logger.error(f"Error getting database info: {e}")
            raise
    
    def delete_database(self, container_name: str, delete_volume: bool = False) -> Dict:
        """Delete a database container and optionally its volume"""
        try:
            # Get container details first for volume info
            volumes = []
            if delete_volume:
                inspect_result = subprocess.run(
                    ['docker', 'inspect', container_name],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if inspect_result.returncode == 0:
                    container_data = json.loads(inspect_result.stdout)[0]
                    for mount in container_data.get('Mounts', []):
                        if mount.get('Type') == 'volume':
                            volumes.append(mount.get('Name'))
            
            # Stop container
            subprocess.run(
                ['docker', 'stop', '-t', '10', container_name],
                capture_output=True,
                text=True,
                timeout=15
            )
            
            # Remove container
            rm_result = subprocess.run(
                ['docker', 'rm', container_name],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if rm_result.returncode != 0:
                raise Exception(f"Failed to remove container: {rm_result.stderr}")
            
            logger.info(f"Deleted database container: {container_name}")
            
            # Delete volumes if requested
            deleted_volumes = []
            if delete_volume:
                for volume_name in volumes:
                    vol_result = subprocess.run(
                        ['docker', 'volume', 'rm', volume_name],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if vol_result.returncode == 0:
                        deleted_volumes.append(volume_name)
                        logger.info(f"Deleted volume: {volume_name}")
                    else:
                        logger.error(f"Error deleting volume {volume_name}: {vol_result.stderr}")
            
            return {
                'success': True,
                'container_name': container_name,
                'deleted_volumes': deleted_volumes
            }
            
        except Exception as e:
            logger.error(f"Error deleting database: {e}")
            raise
    
    def backup_database(self, container_name: str, backup_path: str) -> Dict:
        """Create a backup of a database container"""
        try:
            # Get container info to determine database type
            result = subprocess.run(
                ['docker', 'inspect', container_name],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                raise Exception(f"Container '{container_name}' not found")
            
            container_data = json.loads(result.stdout)[0]
            image = container_data['Config']['Image'].lower()
            
            if 'postgres' in image:
                return self._backup_postgresql(container_name, backup_path)
            elif 'mysql' in image:
                return self._backup_mysql(container_name, container_data, backup_path)
            elif 'mongo' in image:
                return self._backup_mongodb(container_name, container_data, backup_path)
            else:
                raise Exception(f"Backup not supported for this database type")
            
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
    
    def _extract_ports(self, container_data: Dict) -> Dict:
        """Extract port mappings from container inspect output"""
        ports = {}
        port_data = container_data.get('NetworkSettings', {}).get('Ports', {})
        
        for container_port, host_bindings in port_data.items():
            if host_bindings:
                for binding in host_bindings:
                    host_port = binding.get('HostPort', '')
                    if host_port:
                        ports[container_port] = host_port
        
        return ports
    
    def _backup_postgresql(self, container_name: str, backup_path: str) -> Dict:
        """Backup PostgreSQL database"""
        result = subprocess.run(
            ['docker', 'exec', container_name, 'pg_dump', '-U', 'postgres', '-d', 'mydb'],
            capture_output=True,
            timeout=60
        )
        
        if result.returncode != 0:
            raise Exception(f"Backup failed: {result.stderr.decode()}")
        
        # Write backup to file
        with open(backup_path, 'wb') as f:
            f.write(result.stdout)
        
        return {
            'success': True,
            'backup_path': backup_path,
            'type': 'postgresql'
        }
    
    def _backup_mysql(self, container_name: str, container_data: Dict, backup_path: str) -> Dict:
        """Backup MySQL database"""
        # Get password from environment
        env = container_data.get('Config', {}).get('Env', [])
        password = None
        for item in env:
            if item.startswith('MYSQL_ROOT_PASSWORD='):
                password = item.split('=', 1)[1]
                break
        
        if not password:
            raise Exception("Could not find MySQL root password")
        
        result = subprocess.run(
            ['docker', 'exec', container_name, 'mysqldump', '-u', 'root', f'-p{password}', 'mydb'],
            capture_output=True,
            timeout=60
        )
        
        if result.returncode != 0:
            raise Exception(f"Backup failed: {result.stderr.decode()}")
        
        # Write backup to file
        with open(backup_path, 'wb') as f:
            f.write(result.stdout)
        
        return {
            'success': True,
            'backup_path': backup_path,
            'type': 'mysql'
        }
    
    def _backup_mongodb(self, container_name: str, container_data: Dict, backup_path: str) -> Dict:
        """Backup MongoDB database"""
        # Get credentials from environment
        env = container_data.get('Config', {}).get('Env', [])
        username = None
        password = None
        
        for item in env:
            if item.startswith('MONGO_INITDB_ROOT_USERNAME='):
                username = item.split('=', 1)[1]
            elif item.startswith('MONGO_INITDB_ROOT_PASSWORD='):
                password = item.split('=', 1)[1]
        
        if not username or not password:
            raise Exception("Could not find MongoDB credentials")
        
        result = subprocess.run(
            ['docker', 'exec', container_name, 'mongodump', 
             f'--username={username}', f'--password={password}', 
             '--authenticationDatabase=admin', '--db=mydb', '--archive'],
            capture_output=True,
            timeout=60
        )
        
        if result.returncode != 0:
            raise Exception(f"Backup failed: {result.stderr.decode()}")
        
        # Write backup to file
        with open(backup_path, 'wb') as f:
            f.write(result.stdout)
        
        return {
            'success': True,
            'backup_path': backup_path,
            'type': 'mongodb'
        }


def generate_password(length: int = 16) -> str:
    """Generate a secure random password"""
    alphabet = string.ascii_letters + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(length))
