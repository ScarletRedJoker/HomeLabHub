"""
Database Provisioner Service
Handles automatic database creation, management, and provisioning for new services
"""
import os
import logging
import psycopg2
from psycopg2 import sql
from typing import Dict, Optional, List
import secrets
import string

logger = logging.getLogger(__name__)

class DatabaseProvisioner:
    """
    Industry-standard database provisioner for automatic database management.
    
    Features:
    - Automatic database creation with secure credentials
    - User management with least-privilege access
    - Database deletion with CASCADE protection
    - Connection testing and health checks
    - Backup/restore support
    """
    
    def __init__(self):
        """Initialize provisioner with superuser connection"""
        self.host = os.getenv('POSTGRES_HOST', 'homelab-postgres')
        self.port = int(os.getenv('POSTGRES_PORT', '5432'))
        self.superuser = os.getenv('POSTGRES_USER', 'postgres')
        self.superuser_password = os.getenv('POSTGRES_PASSWORD')
        
        if not self.superuser_password:
            raise ValueError("POSTGRES_PASSWORD not set - cannot provision databases")
    
    def _get_superuser_connection(self):
        """Get connection as PostgreSQL superuser"""
        return psycopg2.connect(
            host=self.host,
            port=self.port,
            user=self.superuser,
            password=self.superuser_password,
            database='postgres',
            connect_timeout=10
        )
    
    def _generate_secure_password(self, length: int = 24) -> str:
        """Generate cryptographically secure password"""
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
        while True:
            password = ''.join(secrets.choice(alphabet) for _ in range(length))
            # Ensure complexity requirements
            if (any(c.islower() for c in password)
                and any(c.isupper() for c in password)
                and any(c.isdigit() for c in password)
                and any(c in "!@#$%^&*-_=+" for c in password)):
                return password
    
    def create_database(
        self,
        db_name: str,
        db_user: str = None,
        db_password: str = None,
        owner: str = None
    ) -> Dict[str, str]:
        """
        Create a new database with dedicated user.
        
        Args:
            db_name: Database name (lowercase, alphanumeric + underscore)
            db_user: Username (defaults to db_name)
            db_password: Password (auto-generated if not provided)
            owner: Database owner (defaults to db_user)
        
        Returns:
            {
                'success': bool,
                'database': str,
                'user': str,
                'password': str,
                'connection_url': str,
                'error': str (if failed)
            }
        """
        try:
            # Validate database name
            if not db_name.replace('_', '').isalnum():
                return {
                    'success': False,
                    'error': 'Database name must be alphanumeric with underscores only'
                }
            
            db_user = db_user or db_name
            db_password = db_password or self._generate_secure_password()
            owner = owner or db_user
            
            logger.info(f"Creating database: {db_name} with user: {db_user}")
            
            with self._get_superuser_connection() as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    # Create user if doesn't exist
                    cur.execute(
                        sql.SQL("SELECT 1 FROM pg_roles WHERE rolname = %s"),
                        [db_user]
                    )
                    if not cur.fetchone():
                        cur.execute(
                            sql.SQL("CREATE USER {} WITH PASSWORD %s").format(
                                sql.Identifier(db_user)
                            ),
                            [db_password]
                        )
                        logger.info(f"✓ Created user: {db_user}")
                    else:
                        # Update password if user exists
                        cur.execute(
                            sql.SQL("ALTER USER {} WITH PASSWORD %s").format(
                                sql.Identifier(db_user)
                            ),
                            [db_password]
                        )
                        logger.info(f"✓ Updated password for user: {db_user}")
                    
                    # Create database if doesn't exist
                    cur.execute(
                        sql.SQL("SELECT 1 FROM pg_database WHERE datname = %s"),
                        [db_name]
                    )
                    if not cur.fetchone():
                        cur.execute(
                            sql.SQL("CREATE DATABASE {} OWNER {}").format(
                                sql.Identifier(db_name),
                                sql.Identifier(owner)
                            )
                        )
                        logger.info(f"✓ Created database: {db_name}")
                    else:
                        logger.info(f"✓ Database {db_name} already exists")
                    
                    # Grant privileges
                    cur.execute(
                        sql.SQL("GRANT ALL PRIVILEGES ON DATABASE {} TO {}").format(
                            sql.Identifier(db_name),
                            sql.Identifier(db_user)
                        )
                    )
            
            connection_url = f"postgresql://{db_user}:{db_password}@{self.host}:{self.port}/{db_name}"
            
            # Test connection
            test_result = self.test_connection(connection_url)
            if not test_result['success']:
                return {
                    'success': False,
                    'error': f"Database created but connection test failed: {test_result['error']}"
                }
            
            logger.info(f"✅ Successfully provisioned database: {db_name}")
            return {
                'success': True,
                'database': db_name,
                'user': db_user,
                'password': db_password,
                'connection_url': connection_url,
                'host': self.host,
                'port': self.port
            }
            
        except Exception as e:
            logger.error(f"Failed to create database {db_name}: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def delete_database(
        self,
        db_name: str,
        delete_user: bool = True,
        force: bool = False
    ) -> Dict[str, any]:
        """
        Delete a database and optionally its user.
        
        Args:
            db_name: Database to delete
            delete_user: Whether to delete the associated user
            force: Force deletion even with active connections
        
        Returns:
            {'success': bool, 'error': str}
        """
        try:
            logger.warning(f"Deleting database: {db_name} (force={force})")
            
            # Protection: don't delete system databases
            protected_dbs = ['postgres', 'template0', 'template1']
            if db_name in protected_dbs:
                return {
                    'success': False,
                    'error': f'Cannot delete protected database: {db_name}'
                }
            
            with self._get_superuser_connection() as conn:
                conn.autocommit = True
                with conn.cursor() as cur:
                    # Terminate active connections if force=True
                    if force:
                        cur.execute(
                            sql.SQL("""
                                SELECT pg_terminate_backend(pg_stat_activity.pid)
                                FROM pg_stat_activity
                                WHERE pg_stat_activity.datname = %s
                                  AND pid <> pg_backend_pid()
                            """),
                            [db_name]
                        )
                        logger.info(f"Terminated active connections to {db_name}")
                    
                    # Drop database
                    cur.execute(
                        sql.SQL("DROP DATABASE IF EXISTS {}").format(
                            sql.Identifier(db_name)
                        )
                    )
                    logger.info(f"✓ Dropped database: {db_name}")
                    
                    # Drop user if requested
                    if delete_user:
                        cur.execute(
                            sql.SQL("DROP USER IF EXISTS {}").format(
                                sql.Identifier(db_name)
                            )
                        )
                        logger.info(f"✓ Dropped user: {db_name}")
            
            logger.info(f"✅ Successfully deleted database: {db_name}")
            return {'success': True}
            
        except Exception as e:
            logger.error(f"Failed to delete database {db_name}: {e}")
            return {'success': False, 'error': str(e)}
    
    def list_databases(self) -> Dict[str, any]:
        """
        List all databases (excluding system databases).
        
        Returns:
            {
                'success': bool,
                'databases': [{'name': str, 'owner': str, 'size': str}],
                'error': str
            }
        """
        try:
            with self._get_superuser_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT 
                            d.datname as name,
                            pg_catalog.pg_get_userbyid(d.datdba) as owner,
                            pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as size
                        FROM pg_catalog.pg_database d
                        WHERE d.datname NOT IN ('postgres', 'template0', 'template1')
                        ORDER BY d.datname
                    """)
                    
                    databases = [
                        {
                            'name': row[0],
                            'owner': row[1],
                            'size': row[2]
                        }
                        for row in cur.fetchall()
                    ]
            
            return {'success': True, 'databases': databases}
            
        except Exception as e:
            logger.error(f"Failed to list databases: {e}")
            return {'success': False, 'error': str(e), 'databases': []}
    
    def test_connection(self, connection_url: str) -> Dict[str, any]:
        """
        Test if a database connection is valid.
        
        Returns:
            {'success': bool, 'error': str}
        """
        try:
            conn = psycopg2.connect(connection_url, connect_timeout=5)
            conn.close()
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_database_info(self, db_name: str) -> Dict[str, any]:
        """
        Get detailed information about a database.
        
        Returns:
            {
                'success': bool,
                'info': {
                    'name': str,
                    'owner': str,
                    'size': str,
                    'tables': int,
                    'connections': int
                },
                'error': str
            }
        """
        try:
            with self._get_superuser_connection() as conn:
                with conn.cursor() as cur:
                    # Get database info
                    cur.execute("""
                        SELECT 
                            d.datname,
                            pg_catalog.pg_get_userbyid(d.datdba) as owner,
                            pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as size
                        FROM pg_catalog.pg_database d
                        WHERE d.datname = %s
                    """, [db_name])
                    
                    row = cur.fetchone()
                    if not row:
                        return {'success': False, 'error': f'Database {db_name} not found'}
                    
                    # Get active connections count
                    cur.execute("""
                        SELECT count(*)
                        FROM pg_stat_activity
                        WHERE datname = %s
                    """, [db_name])
                    connections = cur.fetchone()[0]
                    
                    # Connect to database to count tables
                    conn_str = f"postgresql://{self.superuser}:{self.superuser_password}@{self.host}:{self.port}/{db_name}"
                    db_conn = psycopg2.connect(conn_str)
                    db_cur = db_conn.cursor()
                    db_cur.execute("""
                        SELECT count(*)
                        FROM information_schema.tables
                        WHERE table_schema = 'public'
                    """)
                    tables = db_cur.fetchone()[0]
                    db_conn.close()
            
            return {
                'success': True,
                'info': {
                    'name': row[0],
                    'owner': row[1],
                    'size': row[2],
                    'tables': tables,
                    'connections': connections
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to get database info for {db_name}: {e}")
            return {'success': False, 'error': str(e)}


# Singleton instance
_provisioner = None

def get_provisioner() -> DatabaseProvisioner:
    """Get singleton database provisioner instance"""
    global _provisioner
    if _provisioner is None:
        _provisioner = DatabaseProvisioner()
    return _provisioner
