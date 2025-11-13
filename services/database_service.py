import docker
import json
from typing import Dict, List, Optional
import secrets
import string

class DatabaseService:
    def __init__(self):
        try:
            self.client = docker.from_env()
            self.network_name = "homelab"
            self._ensure_network_exists()
            self.docker_available = True
        except Exception as e:
            self.client = None
            self.docker_available = False
            import logging
            logging.warning(f"Docker not available: {e}. Database features will be disabled.")
        
        self.db_templates = {
            'postgresql': {
                'image': 'postgres:16-alpine',
                'default_port': 5432,
                'env_vars': ['POSTGRES_PASSWORD', 'POSTGRES_USER', 'POSTGRES_DB'],
                'health_check': {
                    'test': ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER}'],
                    'interval': 10000000000,
                    'timeout': 5000000000,
                    'retries': 5
                }
            },
            'mysql': {
                'image': 'mysql:8.0',
                'default_port': 3306,
                'env_vars': ['MYSQL_ROOT_PASSWORD', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'],
                'health_check': {
                    'test': ['CMD', 'mysqladmin', 'ping', '-h', 'localhost'],
                    'interval': 10000000000,
                    'timeout': 5000000000,
                    'retries': 5
                }
            },
            'mariadb': {
                'image': 'mariadb:11',
                'default_port': 3306,
                'env_vars': ['MYSQL_ROOT_PASSWORD', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD'],
                'health_check': {
                    'test': ['CMD', 'healthcheck.sh', '--connect', '--innodb_initialized'],
                    'interval': 10000000000,
                    'timeout': 5000000000,
                    'retries': 5
                }
            },
            'mongodb': {
                'image': 'mongo:7',
                'default_port': 27017,
                'env_vars': ['MONGO_INITDB_ROOT_USERNAME', 'MONGO_INITDB_ROOT_PASSWORD', 'MONGO_INITDB_DATABASE'],
                'health_check': {
                    'test': ['CMD', 'mongosh', '--eval', 'db.adminCommand("ping")'],
                    'interval': 10000000000,
                    'timeout': 5000000000,
                    'retries': 5
                }
            },
            'redis': {
                'image': 'redis:7-alpine',
                'default_port': 6379,
                'env_vars': [],
                'health_check': {
                    'test': ['CMD', 'redis-cli', 'ping'],
                    'interval': 10000000000,
                    'timeout': 5000000000,
                    'retries': 3
                },
                'command': ['redis-server', '--requirepass', '${REDIS_PASSWORD}']
            }
        }

    def _ensure_network_exists(self):
        try:
            self.client.networks.get(self.network_name)
        except:
            self.client.networks.create(
                self.network_name,
                driver="bridge",
                labels={"homelab.managed": "true"}
            )

    def generate_password(self, length=16):
        alphabet = string.ascii_letters + string.digits
        return ''.join(secrets.choice(alphabet) for _ in range(length))

    def list_databases(self) -> List[Dict]:
        if not self.docker_available:
            return []
        try:
            containers = self.client.containers.list(all=True)
            databases = []
            
            for container in containers:
                labels = container.labels
                if labels.get('homelab.type') == 'database':
                    db_info = {
                        'id': container.id[:12],
                        'name': container.name,
                        'db_type': labels.get('homelab.db_type', 'unknown'),
                        'status': container.status,
                        'created': labels.get('homelab.created', 'unknown'),
                        'port': labels.get('homelab.port', 'unknown'),
                        'host_port': labels.get('homelab.host_port', 'unknown'),
                        'database_name': labels.get('homelab.database_name', ''),
                        'username': labels.get('homelab.username', ''),
                        'password': labels.get('homelab.password', ''),
                        'root_password': labels.get('homelab.root_password', ''),
                        'connection_string': self._get_connection_string_with_host(container, labels)
                    }
                    databases.append(db_info)
            
            return databases
        except Exception as e:
            raise Exception(f"Failed to list databases: {str(e)}")

    def _get_connection_string(self, container, labels):
        db_type = labels.get('homelab.db_type')
        name = container.name
        port = labels.get('homelab.port')
        username = labels.get('homelab.username', '')
        database = labels.get('homelab.database_name', '')
        
        if db_type == 'postgresql':
            return f"postgresql://{username}:PASSWORD@{name}:{port}/{database}"
        elif db_type in ['mysql', 'mariadb']:
            return f"mysql://{username}:PASSWORD@{name}:{port}/{database}"
        elif db_type == 'mongodb':
            return f"mongodb://{username}:PASSWORD@{name}:{port}/{database}?authSource=admin"
        elif db_type == 'redis':
            return f"redis://:PASSWORD@{name}:{port}"
        return f"{name}:{port}"

    def _get_connection_string_with_host(self, container, labels):
        db_type = labels.get('homelab.db_type')
        host_port = labels.get('homelab.host_port')
        username = labels.get('homelab.username', '')
        database = labels.get('homelab.database_name', '')
        password = labels.get('homelab.password', 'YOUR_PASSWORD')
        
        if db_type == 'postgresql':
            return f"postgresql://{username}:{password}@localhost:{host_port}/{database}"
        elif db_type in ['mysql', 'mariadb']:
            return f"mysql://{username}:{password}@localhost:{host_port}/{database}"
        elif db_type == 'mongodb':
            return f"mongodb://{username}:{password}@localhost:{host_port}/{database}?authSource=admin"
        elif db_type == 'redis':
            return f"redis://:{password}@localhost:{host_port}"
        return f"localhost:{host_port}"

    def create_database(self, db_type: str, name: str, database_name: str = '', 
                       username: str = '', custom_password: str = None) -> Dict:
        if not self.docker_available:
            raise Exception("Docker is not available. Deploy to Ubuntu server for database features.")
        try:
            if db_type not in self.db_templates:
                raise ValueError(f"Unsupported database type: {db_type}")
            
            template = self.db_templates[db_type]
            
            container_name = name if name else f"{db_type}-{secrets.token_hex(4)}"
            
            if database_name == '':
                database_name = 'mydb'
            if username == '':
                username = 'admin' if db_type != 'redis' else ''
            
            password = custom_password if custom_password else self.generate_password()
            root_password = self.generate_password()
            
            environment = {}
            if db_type == 'postgresql':
                environment = {
                    'POSTGRES_PASSWORD': password,
                    'POSTGRES_USER': username,
                    'POSTGRES_DB': database_name
                }
            elif db_type in ['mysql', 'mariadb']:
                environment = {
                    'MYSQL_ROOT_PASSWORD': root_password,
                    'MYSQL_DATABASE': database_name,
                    'MYSQL_USER': username,
                    'MYSQL_PASSWORD': password
                }
            elif db_type == 'mongodb':
                environment = {
                    'MONGO_INITDB_ROOT_USERNAME': username,
                    'MONGO_INITDB_ROOT_PASSWORD': password,
                    'MONGO_INITDB_DATABASE': database_name
                }
            elif db_type == 'redis':
                environment = {'REDIS_PASSWORD': password}
            
            host_port = self._find_available_port(template['default_port'])
            
            labels = {
                'homelab.type': 'database',
                'homelab.db_type': db_type,
                'homelab.created': 'homelab-dashboard',
                'homelab.port': str(template['default_port']),
                'homelab.host_port': str(host_port),
                'homelab.database_name': database_name,
                'homelab.username': username,
                'homelab.password': password,
                'homelab.root_password': root_password if db_type in ['mysql', 'mariadb'] else ''
            }
            
            volumes = {
                f"{container_name}-data": {'bind': self._get_data_path(db_type), 'mode': 'rw'}
            }
            
            command = template.get('command')
            if command and db_type == 'redis':
                command = [cmd.replace('${REDIS_PASSWORD}', password) for cmd in command]
            
            ports = {
                f"{template['default_port']}/tcp": host_port
            }
            
            container = self.client.containers.run(
                image=template['image'],
                name=container_name,
                environment=environment,
                labels=labels,
                volumes=volumes,
                network=self.network_name,
                ports=ports,
                detach=True,
                restart_policy={'Name': 'unless-stopped'},
                healthcheck=template.get('health_check'),
                command=command
            )
            
            connection_info = self._get_connection_string_with_host(container, labels)
            
            return {
                'success': True,
                'container_id': container.id[:12],
                'container_name': container_name,
                'db_type': db_type,
                'port': template['default_port'],
                'host_port': host_port,
                'username': username,
                'password': password,
                'root_password': root_password if db_type in ['mysql', 'mariadb'] else None,
                'database_name': database_name,
                'connection_string': connection_info,
                'docker_connection': f"{container_name}:{template['default_port']}",
                'message': f'{db_type.capitalize()} database created successfully'
            }
            
        except docker.errors.APIError as e:
            raise Exception(f"Docker API error: {str(e)}")
        except Exception as e:
            raise Exception(f"Failed to create database: {str(e)}")

    def _find_available_port(self, preferred_port):
        import socket
        
        port = preferred_port
        max_attempts = 100
        
        for offset in range(max_attempts):
            test_port = port + offset
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(1)
                result = sock.connect_ex(('localhost', test_port))
                sock.close()
                if result != 0:
                    return test_port
            except:
                return test_port
        
        return port + max_attempts

    def _get_data_path(self, db_type):
        paths = {
            'postgresql': '/var/lib/postgresql/data',
            'mysql': '/var/lib/mysql',
            'mariadb': '/var/lib/mysql',
            'mongodb': '/data/db',
            'redis': '/data'
        }
        return paths.get(db_type, '/data')

    def delete_database(self, container_name: str, delete_volume: bool = False) -> Dict:
        try:
            container = self.client.containers.get(container_name)
            
            if container.labels.get('homelab.type') != 'database':
                raise ValueError("Container is not a database managed by homelab")
            
            volume_name = f"{container_name}-data"
            
            container.stop(timeout=10)
            container.remove()
            
            if delete_volume:
                try:
                    volume = self.client.volumes.get(volume_name)
                    volume.remove()
                    volume_msg = "Volume deleted"
                except:
                    volume_msg = "Volume not found or already deleted"
            else:
                volume_msg = "Volume preserved (use delete_volume=true to remove data)"
            
            return {
                'success': True,
                'message': f'Database {container_name} deleted successfully. {volume_msg}'
            }
            
        except docker.errors.NotFound:
            raise Exception(f"Database {container_name} not found")
        except Exception as e:
            raise Exception(f"Failed to delete database: {str(e)}")

    def get_database_info(self, container_name: str) -> Dict:
        try:
            container = self.client.containers.get(container_name)
            
            if container.labels.get('homelab.type') != 'database':
                raise ValueError("Container is not a database managed by homelab")
            
            labels = container.labels
            stats = container.stats(stream=False)
            
            mem_usage = stats['memory_stats'].get('usage', 0)
            mem_limit = stats['memory_stats'].get('limit', 1)
            mem_percent = (mem_usage / mem_limit * 100) if mem_limit > 0 else 0
            
            return {
                'name': container.name,
                'id': container.id[:12],
                'db_type': labels.get('homelab.db_type'),
                'status': container.status,
                'database_name': labels.get('homelab.database_name'),
                'username': labels.get('homelab.username'),
                'password': labels.get('homelab.password', ''),
                'root_password': labels.get('homelab.root_password', ''),
                'port': labels.get('homelab.port'),
                'host_port': labels.get('homelab.host_port'),
                'connection_string': self._get_connection_string_with_host(container, labels),
                'docker_connection': self._get_connection_string(container, labels).replace('PASSWORD', labels.get('homelab.password', 'PASSWORD')),
                'created': labels.get('homelab.created'),
                'memory_usage': f"{mem_usage / 1024 / 1024:.1f} MB",
                'memory_percent': f"{mem_percent:.1f}%"
            }
            
        except docker.errors.NotFound:
            raise Exception(f"Database {container_name} not found")
        except Exception as e:
            raise Exception(f"Failed to get database info: {str(e)}")

    def backup_database(self, container_name: str, backup_path: str = '/tmp') -> Dict:
        try:
            container = self.client.containers.get(container_name)
            labels = container.labels
            
            if labels.get('homelab.type') != 'database':
                raise ValueError("Container is not a database")
            
            db_type = labels.get('homelab.db_type')
            database_name = labels.get('homelab.database_name')
            username = labels.get('homelab.username')
            
            import datetime
            timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_file = f"{backup_path}/{container_name}_{timestamp}.sql"
            
            if db_type == 'postgresql':
                cmd = f"pg_dump -U {username} {database_name}"
            elif db_type in ['mysql', 'mariadb']:
                cmd = f"mysqldump -u {username} {database_name}"
            elif db_type == 'mongodb':
                return {'success': False, 'message': 'MongoDB backup requires mongodump - use volumes instead'}
            elif db_type == 'redis':
                cmd = "redis-cli BGSAVE"
                exec_result = container.exec_run(cmd)
                return {
                    'success': True,
                    'message': 'Redis background save initiated',
                    'backup_location': 'Inside container at /data/dump.rdb'
                }
            else:
                return {'success': False, 'message': f'Backup not supported for {db_type}'}
            
            exec_result = container.exec_run(cmd)
            
            if exec_result.exit_code == 0:
                with open(backup_file, 'wb') as f:
                    f.write(exec_result.output)
                
                return {
                    'success': True,
                    'message': f'Backup created successfully',
                    'backup_file': backup_file,
                    'size': len(exec_result.output)
                }
            else:
                raise Exception(exec_result.output.decode())
                
        except Exception as e:
            raise Exception(f"Backup failed: {str(e)}")

    def get_connection_examples(self, db_type: str, container_name: str, 
                                username: str, password: str, database: str, 
                                port: int, host_port: int) -> Dict:
        examples = {}
        
        if db_type == 'postgresql':
            examples = {
                'host_connection': f"postgresql://{username}:{password}@localhost:{host_port}/{database}",
                'docker_connection': f"postgresql://{username}:{password}@{container_name}:{port}/{database}",
                'python': f"# From host machine or other containers:\nimport psycopg2\n\n# From host:\nconn = psycopg2.connect(\n    host='localhost',\n    port={host_port},\n    user='{username}',\n    password='{password}',\n    database='{database}'\n)\n\n# From other Docker containers (on homelab network):\nconn = psycopg2.connect(\n    host='{container_name}',\n    port={port},\n    user='{username}',\n    password='{password}',\n    database='{database}'\n)",
                'node': f"// From host machine:\nconst {{ Client }} = require('pg');\nconst client = new Client({{\n  host: 'localhost',\n  port: {host_port},\n  user: '{username}',\n  password: '{password}',\n  database: '{database}'\n}});\n\n// From Docker container:\nconst client = new Client({{\n  host: '{container_name}',\n  port: {port},\n  user: '{username}',\n  password: '{password}',\n  database: '{database}'\n}});",
                'docker_env': f"# Add to other containers on homelab network:\nDB_HOST={container_name}\nDB_PORT={port}\nDB_USER={username}\nDB_PASSWORD={password}\nDB_NAME={database}"
            }
        elif db_type in ['mysql', 'mariadb']:
            examples = {
                'host_connection': f"mysql://{username}:{password}@localhost:{host_port}/{database}",
                'docker_connection': f"mysql://{username}:{password}@{container_name}:{port}/{database}",
                'python': f"# From host machine:\nimport mysql.connector\nconn = mysql.connector.connect(\n    host='localhost',\n    port={host_port},\n    user='{username}',\n    password='{password}',\n    database='{database}'\n)\n\n# From Docker container:\nconn = mysql.connector.connect(\n    host='{container_name}',\n    port={port},\n    user='{username}',\n    password='{password}',\n    database='{database}'\n)",
                'node': f"// From host:\nconst mysql = require('mysql2');\nconst connection = mysql.createConnection({{\n  host: 'localhost',\n  port: {host_port},\n  user: '{username}',\n  password: '{password}',\n  database: '{database}'\n}});\n\n// From Docker:\nconst connection = mysql.createConnection({{\n  host: '{container_name}',\n  port: {port},\n  user: '{username}',\n  password: '{password}',\n  database: '{database}'\n}});",
                'docker_env': f"DB_HOST={container_name}\nDB_PORT={port}\nDB_USER={username}\nDB_PASSWORD={password}\nDB_NAME={database}"
            }
        elif db_type == 'mongodb':
            examples = {
                'host_connection': f"mongodb://{username}:{password}@localhost:{host_port}/{database}?authSource=admin",
                'docker_connection': f"mongodb://{username}:{password}@{container_name}:{port}/{database}?authSource=admin",
                'python': f"# From host:\nfrom pymongo import MongoClient\nclient = MongoClient('mongodb://{username}:{password}@localhost:{host_port}/{database}?authSource=admin')\n\n# From Docker:\nclient = MongoClient('mongodb://{username}:{password}@{container_name}:{port}/{database}?authSource=admin')",
                'node': f"// From host:\nconst {{ MongoClient }} = require('mongodb');\nconst client = new MongoClient('mongodb://{username}:{password}@localhost:{host_port}/{database}?authSource=admin');\n\n// From Docker:\nconst client = new MongoClient('mongodb://{username}:{password}@{container_name}:{port}/{database}?authSource=admin');",
                'docker_env': f"MONGO_URL=mongodb://{username}:{password}@{container_name}:{port}/{database}?authSource=admin"
            }
        elif db_type == 'redis':
            examples = {
                'host_connection': f"redis://:{password}@localhost:{host_port}",
                'docker_connection': f"redis://:{password}@{container_name}:{port}",
                'python': f"# From host:\nimport redis\nr = redis.Redis(host='localhost', port={host_port}, password='{password}')\n\n# From Docker:\nr = redis.Redis(host='{container_name}', port={port}, password='{password}')",
                'node': f"// From host:\nconst redis = require('redis');\nconst client = redis.createClient({{\n  host: 'localhost',\n  port: {host_port},\n  password: '{password}'\n}});\n\n// From Docker:\nconst client = redis.createClient({{\n  host: '{container_name}',\n  port: {port},\n  password: '{password}'\n}});",
                'docker_env': f"REDIS_URL=redis://:{password}@{container_name}:{port}"
            }
        
        return examples
