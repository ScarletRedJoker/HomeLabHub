from celery_app import celery
from celery.utils.log import get_task_logger
from database import get_db
from models import NASBackupJob
from services.nas_service import NASService
from datetime import datetime

logger = get_task_logger(__name__)


@celery.task(name='workers.nas_worker.run_nas_backup')
def run_nas_backup(job_id: int):
    """Execute NAS backup job"""
    db = next(get_db())
    
    try:
        job = db.query(NASBackupJob).filter_by(id=job_id).first()
        if not job:
            logger.error(f"Backup job {job_id} not found")
            return

        job.status = 'running'
        db.commit()

        nas_service = NASService()
        result = nas_service.backup_to_nas(
            source_path=job.source_path,
            dest_share=job.dest_share,
            backup_name=job.backup_name
        )

        if result.get('success'):
            job.status = 'completed'
            job.completed_at = datetime.utcnow()
        else:
            job.status = 'failed'
            job.error_message = result.get('error', 'Unknown error')
        
        db.commit()
        logger.info(f"Backup job {job_id} completed with status: {job.status}")

    except Exception as e:
        logger.error(f"Error in backup job {job_id}: {e}")
        job.status = 'failed'
        job.error_message = str(e)
        db.commit()


@celery.task(name='workers.nas_worker.discover_nas_periodic')
def discover_nas_periodic():
    """Periodic task to discover and monitor NAS availability"""
    try:
        nas_service = NASService()
        result = nas_service.discover_nas()
        
        if result:
            logger.info(f"NAS discovered at {result.get('ip_address')}, alive: {result.get('is_alive')}")
        else:
            logger.warning("NAS discovery failed - not found on network")

    except Exception as e:
        logger.error(f"Error in NAS discovery task: {e}")


@celery.task(name='workers.nas_worker.check_mount_health')
def check_mount_health():
    """Check health of all mounted NAS shares"""
    try:
        nas_service = NASService()
        mounts = nas_service.list_mounts()
        
        for mount in mounts:
            storage_info = nas_service.get_mount_storage_info(mount['mount_point'])
            if storage_info:
                usage_percent = storage_info.get('usage_percent', 0)
                if usage_percent > 90:
                    logger.warning(
                        f"NAS mount {mount['mount_point']} is {usage_percent}% full"
                    )
            else:
                logger.warning(f"Unable to get storage info for {mount['mount_point']}")

    except Exception as e:
        logger.error(f"Error checking mount health: {e}")
