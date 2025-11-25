from logging.config import fileConfig
import os
import sys
import hashlib
import logging
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from sqlalchemy import text

from alembic import context

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from models import Base
from models.workflow import Workflow
from models.task import Task
from models.artifact import Artifact
from models.deployment import Deployment
from models.domain_record import DomainRecord

config = context.config
logger = logging.getLogger('alembic.env')

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# NASA-Grade Migration Lock Configuration
MIGRATION_LOCK_BASE_ID = 987654321
MIGRATION_LOCK_TIMEOUT_SECONDS = 60
STATEMENT_TIMEOUT_SECONDS = 120

def get_url():
    """
    Get database URL using unified resolver.
    Supports multiple environment variable names for flexibility.
    """
    try:
        from services.db_url_resolver import get_database_url
        url = get_database_url()
        logger.info(f"Database URL resolved successfully for migrations")
        return url
    except ValueError as e:
        logger.error(f"Database URL resolution failed: {e}")
        raise RuntimeError(f"Database URL not found: {e}")

def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def get_advisory_lock_id(db_name: str) -> int:
    """
    Generate consistent advisory lock ID for the database.
    This ensures the same database always gets the same lock ID.
    """
    hash_val = hashlib.md5(db_name.encode()).hexdigest()
    return (MIGRATION_LOCK_BASE_ID + int(hash_val[:8], 16)) % (2**31)


def run_migrations_online() -> None:
    """
    Run migrations with NASA-grade reliability:
    - Advisory locks prevent concurrent migrations
    - Timeouts prevent infinite hangs
    - Explicit transaction commit (SQLAlchemy 2.x requirement)
    - Full error logging for diagnostics
    """
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()
    
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    # Use begin() instead of connect() to ensure transaction commits on success
    # This is critical for SQLAlchemy 2.x - without it, transactions roll back
    with connectable.begin() as connection:
        db_name = connection.engine.url.database or "homelab_jarvis"
        lock_id = get_advisory_lock_id(db_name)
        
        logger.info(f"Attempting to acquire migration lock for database '{db_name}' (lock_id={lock_id})")
        
        # Acquire advisory lock (BLOCKING with timeout)
        try:
            logger.info(f"Acquiring advisory lock {lock_id} for database '{db_name}' (blocking, timeout={MIGRATION_LOCK_TIMEOUT_SECONDS}s)...")
            connection.execute(text(f"SELECT pg_advisory_lock({lock_id})"))
            logger.info(f"Successfully acquired migration lock {lock_id} for '{db_name}'")
            
        except Exception as e:
            logger.error(f"Error acquiring advisory lock: {e}")
            raise RuntimeError(f"Failed to acquire migration lock: {e}")
        
        try:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_type=True
            )

            with context.begin_transaction():
                context.run_migrations()
                
            logger.info(f"Migrations completed successfully for '{db_name}'")
            
        finally:
            try:
                connection.execute(text(f"SELECT pg_advisory_unlock({lock_id})"))
                logger.info(f"Released migration lock {lock_id} for '{db_name}'")
            except Exception as e:
                logger.warning(f"Error releasing advisory lock: {e}")


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
