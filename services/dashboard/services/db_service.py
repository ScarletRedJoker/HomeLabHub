import os
import logging
from contextlib import contextmanager
from sqlalchemy import create_engine, text, Engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import OperationalError
from alembic import command
from alembic.config import Config
import sys
from typing import Optional

logger = logging.getLogger(__name__)

class DatabaseService:
    def __init__(self):
        self.database_url: Optional[str] = os.environ.get('JARVIS_DATABASE_URL')
        self._engine: Optional[Engine] = None
        self._session_factory: Optional[sessionmaker] = None
        
        if not self.database_url:
            logger.warning("JARVIS_DATABASE_URL not set. Database features will be unavailable.")
            return
            
        try:
            self._engine = create_engine(
                self.database_url,
                pool_pre_ping=True,
                pool_size=5,
                max_overflow=10,
                echo=False
            )
            self._session_factory = sessionmaker(bind=self._engine)
            logger.info("Database service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize database service: {e}")
            self._engine = None
            self._session_factory = None
    
    @property
    def is_available(self) -> bool:
        return self._engine is not None and self._session_factory is not None
    
    def get_engine(self):
        if not self.is_available:
            raise RuntimeError("Database service is not available. Check JARVIS_DATABASE_URL.")
        return self._engine
    
    @contextmanager
    def get_session(self):
        if not self.is_available or self._session_factory is None:
            raise RuntimeError("Database service is not available. Check JARVIS_DATABASE_URL.")
        
        session = self._session_factory()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Database session error: {e}")
            raise
        finally:
            session.close()
    
    def health_check(self):
        if not self.is_available:
            return {
                'healthy': False,
                'error': 'Database service not initialized',
                'details': 'JARVIS_DATABASE_URL not set'
            }
        
        try:
            with self.get_session() as session:
                session.execute(text("SELECT 1"))
            return {
                'healthy': True,
                'message': 'Database connection successful'
            }
        except OperationalError as e:
            logger.error(f"Database health check failed: {e}")
            return {
                'healthy': False,
                'error': 'Connection failed',
                'details': str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error during health check: {e}")
            return {
                'healthy': False,
                'error': 'Unexpected error',
                'details': str(e)
            }
    
    def run_migrations(self, upgrade=True):
        if not self.is_available or not self.database_url:
            logger.warning("Skipping migrations: Database service not available")
            return False
        
        try:
            dashboard_dir = os.path.dirname(os.path.dirname(__file__))
            alembic_ini = os.path.join(dashboard_dir, 'alembic.ini')
            
            if not os.path.exists(alembic_ini):
                logger.error(f"Alembic config not found at {alembic_ini}")
                return False
            
            alembic_cfg = Config(alembic_ini)
            alembic_cfg.set_main_option('script_location', os.path.join(dashboard_dir, 'alembic'))
            
            # Set database URL for Alembic
            os.environ['JARVIS_DATABASE_URL'] = self.database_url
            
            if upgrade:
                logger.info("Running database migrations (upgrade to head)...")
                command.upgrade(alembic_cfg, 'head')
                logger.info("✓ Database migrations completed successfully")
            else:
                logger.info("Checking current migration status...")
                command.current(alembic_cfg)
            
            return True
        except Exception as e:
            logger.error(f"Migration error: {e}", exc_info=True)
            return False
    
    def create_all_tables(self):
        if not self.is_available:
            logger.warning("Cannot create tables: Database service not available")
            return False
        
        try:
            from models import Base
            Base.metadata.create_all(self._engine)
            logger.info("✓ All tables created successfully")
            return True
        except Exception as e:
            logger.error(f"Error creating tables: {e}")
            return False
    
    def get_migration_status(self):
        if not self.is_available or self._engine is None:
            return {
                'available': False,
                'current': None,
                'error': 'Database service not initialized'
            }
        
        try:
            from alembic.migration import MigrationContext
            from alembic.script import ScriptDirectory
            
            dashboard_dir = os.path.dirname(os.path.dirname(__file__))
            alembic_ini = os.path.join(dashboard_dir, 'alembic.ini')
            alembic_cfg = Config(alembic_ini)
            alembic_cfg.set_main_option('script_location', os.path.join(dashboard_dir, 'alembic'))
            
            script = ScriptDirectory.from_config(alembic_cfg)
            
            with self._engine.connect() as connection:
                context = MigrationContext.configure(connection)
                current_rev = context.get_current_revision()
                
            head_rev = script.get_current_head()
            
            return {
                'available': True,
                'current_revision': current_rev,
                'head_revision': head_rev,
                'up_to_date': current_rev == head_rev
            }
        except Exception as e:
            logger.error(f"Error getting migration status: {e}")
            return {
                'available': True,
                'error': str(e)
            }

db_service = DatabaseService()

__all__ = ['db_service', 'DatabaseService']
