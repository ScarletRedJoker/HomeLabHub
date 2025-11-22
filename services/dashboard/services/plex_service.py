"""Plex Media Import Service"""
import os
import re
import shutil
import logging
import requests
from typing import Dict, Optional, Tuple, List
from datetime import datetime, timedelta
from config import Config
from env_config.environment import get_plex_config
from services.upload_service import upload_service
from services.db_service import db_service
from models.plex import PlexImportJob, PlexImportItem

logger = logging.getLogger(__name__)


class PlexService:
    """Service for managing Plex media imports"""
    
    # Video file extensions
    VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpg', '.mpeg'}
    
    # Music file extensions
    MUSIC_EXTENSIONS = {'.mp3', '.flac', '.m4a', '.wav', '.aac', '.ogg', '.wma'}
    
    # Regex patterns for filename parsing
    MOVIE_PATTERN = re.compile(r'^(.+?)[\s._-]+\(?(\d{4})\)?', re.IGNORECASE)
    TV_PATTERN = re.compile(r'^(.+?)[\s._-]+[Ss](\d{1,2})[Ee](\d{1,2})', re.IGNORECASE)
    TV_PATTERN_ALT = re.compile(r'^(.+?)[\s._-]+(\d{1,2})x(\d{1,2})', re.IGNORECASE)
    
    def __init__(self):
        """Initialize Plex service"""
        try:
            plex_config = get_plex_config()
            self.plex_url = plex_config["url"]
            self.plex_token = plex_config["token"]
            logger.info(f"Plex service initialized with URL: {self.plex_url}")
        except ValueError as e:
            logger.warning(f"Plex service not fully configured: {e}")
            self.plex_url = Config.PLEX_URL if hasattr(Config, 'PLEX_URL') else None
            self.plex_token = Config.PLEX_TOKEN if hasattr(Config, 'PLEX_TOKEN') else None
        
        self.movies_path = Config.PLEX_MOVIES_PATH
        self.tv_path = Config.PLEX_TV_PATH
        self.music_path = Config.PLEX_MUSIC_PATH
    
    def detect_media_type(self, filename: str) -> str:
        """
        Detect media type from filename
        
        Args:
            filename: Original filename
            
        Returns:
            Media type: 'movie', 'tv_show', or 'music'
        """
        ext = os.path.splitext(filename.lower())[1]
        
        if ext in self.MUSIC_EXTENSIONS:
            return 'music'
        
        if ext not in self.VIDEO_EXTENSIONS:
            return 'unknown'
        
        # Check for TV show patterns first (more specific)
        if self.TV_PATTERN.search(filename) or self.TV_PATTERN_ALT.search(filename):
            return 'tv_show'
        
        # Check for movie pattern
        if self.MOVIE_PATTERN.search(filename):
            return 'movie'
        
        # Default to movie if no pattern matches but it's a video
        return 'movie'
    
    def parse_movie_metadata(self, filename: str) -> Dict:
        """
        Parse movie metadata from filename
        
        Args:
            filename: Movie filename
            
        Returns:
            Dictionary with title and year
        """
        match = self.MOVIE_PATTERN.search(filename)
        
        if match:
            title = match.group(1).replace('.', ' ').replace('_', ' ').strip()
            year = match.group(2)
            
            return {
                'title': title,
                'year': year,
                'type': 'movie'
            }
        
        # Fallback: just use filename without extension
        title = os.path.splitext(filename)[0].replace('.', ' ').replace('_', ' ').strip()
        return {
            'title': title,
            'year': None,
            'type': 'movie'
        }
    
    def parse_tv_metadata(self, filename: str) -> Dict:
        """
        Parse TV show metadata from filename
        
        Args:
            filename: TV show filename
            
        Returns:
            Dictionary with show name, season, and episode
        """
        # Try standard SxxExx pattern
        match = self.TV_PATTERN.search(filename)
        
        if match:
            show_name = match.group(1).replace('.', ' ').replace('_', ' ').strip()
            season = int(match.group(2))
            episode = int(match.group(3))
            
            return {
                'show_name': show_name,
                'season': season,
                'episode': episode,
                'type': 'tv_show'
            }
        
        # Try alternative xxYxx pattern
        match = self.TV_PATTERN_ALT.search(filename)
        
        if match:
            show_name = match.group(1).replace('.', ' ').replace('_', ' ').strip()
            season = int(match.group(2))
            episode = int(match.group(3))
            
            return {
                'show_name': show_name,
                'season': season,
                'episode': episode,
                'type': 'tv_show'
            }
        
        # Fallback
        show_name = os.path.splitext(filename)[0].replace('.', ' ').replace('_', ' ').strip()
        return {
            'show_name': show_name,
            'season': 1,
            'episode': 1,
            'type': 'tv_show'
        }
    
    def get_plex_directory(self, media_type: str, metadata: Dict) -> str:
        """
        Get target Plex directory for media
        
        Args:
            media_type: Type of media (movie, tv_show, music)
            metadata: Parsed metadata
            
        Returns:
            Full path to target directory
        """
        if media_type == 'movie':
            title = metadata.get('title', 'Unknown')
            year = metadata.get('year')
            
            if year:
                folder_name = f"{title} ({year})"
            else:
                folder_name = title
            
            return os.path.join(self.movies_path, folder_name)
        
        elif media_type == 'tv_show':
            show_name = metadata.get('show_name', 'Unknown')
            season = metadata.get('season', 1)
            
            return os.path.join(self.tv_path, show_name, f"Season {season:02d}")
        
        elif media_type == 'music':
            return self.music_path
        
        return self.movies_path
    
    def create_import_job(self, user_id: str, job_type: str, metadata: Dict = None) -> PlexImportJob:
        """
        Create a new import job
        
        Args:
            user_id: User creating the job
            job_type: Type of media being imported
            metadata: Additional metadata
            
        Returns:
            Created PlexImportJob
        """
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with db_service.get_session() as session:
            job = PlexImportJob(
                user_id=user_id,
                job_type=job_type,
                status='pending',
                job_metadata=metadata or {}
            )
            session.add(job)
            session.commit()
            session.refresh(job)
            
            logger.info(f"Created import job {job.id} for user {user_id}")
            return job
    
    def add_import_item(
        self,
        job_id: str,
        filename: str,
        original_filename: str,
        file_size: int,
        storage_path: str,
        metadata: Dict = None
    ) -> PlexImportItem:
        """
        Add an item to an import job
        
        Args:
            job_id: Job ID
            filename: Sanitized filename
            original_filename: Original filename
            file_size: File size in bytes
            storage_path: MinIO storage path
            metadata: Parsed metadata
            
        Returns:
            Created PlexImportItem
        """
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with db_service.get_session() as session:
            item = PlexImportItem(
                job_id=job_id,
                filename=filename,
                original_filename=original_filename,
                file_size=file_size,
                storage_path=storage_path,
                item_metadata=metadata or {},
                status='pending'
            )
            session.add(item)
            session.commit()
            session.refresh(item)
            
            # Update job total files count
            job = session.query(PlexImportJob).filter_by(id=job_id).first()
            if job:
                job.total_files += 1
                session.commit()
            
            return item
    
    def upload_media_file(
        self,
        file_path: str,
        original_filename: str,
        job_id: str,
        media_type: str = None
    ) -> Dict:
        """
        Upload media file to MinIO
        
        Args:
            file_path: Local path to file
            original_filename: Original filename
            job_id: Import job ID
            media_type: Optional media type override
            
        Returns:
            Upload information dictionary
        """
        # Detect media type if not provided
        if not media_type:
            media_type = self.detect_media_type(original_filename)
        
        # Parse metadata based on type
        if media_type == 'movie':
            metadata = self.parse_movie_metadata(original_filename)
        elif media_type == 'tv_show':
            metadata = self.parse_tv_metadata(original_filename)
        else:
            metadata = {'type': media_type}
        
        # Upload to MinIO
        upload_info = upload_service.upload_file(
            file_path,
            original_filename,
            bucket='artifacts',
            object_name=f"plex-staging/{job_id}/{original_filename}"
        )
        
        # Add to database
        item = self.add_import_item(
            job_id=job_id,
            filename=upload_info['safe_filename'],
            original_filename=original_filename,
            file_size=upload_info['file_size'],
            storage_path=upload_info['storage_path'],
            metadata=metadata
        )
        
        return {
            **upload_info,
            'item_id': str(item.id),
            'metadata': metadata,
            'media_type': media_type
        }
    
    def move_file_to_plex(self, item_id: str) -> bool:
        """
        Move file from MinIO to Plex directory
        
        Args:
            item_id: Import item ID
            
        Returns:
            True if successful
        """
        if not db_service.is_available:
            raise RuntimeError("Database service not available")
        
        with db_service.get_session() as session:
            item = session.query(PlexImportItem).filter_by(id=item_id).first()
            
            if not item:
                raise ValueError(f"Import item {item_id} not found")
            
            metadata = item.metadata or {}
            media_type = metadata.get('type', 'movie')
            
            # Get target directory
            target_dir = self.get_plex_directory(media_type, metadata)
            
            # Create directory if it doesn't exist
            os.makedirs(target_dir, exist_ok=True)
            
            # Download from MinIO to temp location
            temp_path = f"/tmp/plex_import_{item_id}_{item.filename}"
            
            try:
                bucket, object_name = item.storage_path.split('/', 1)
                upload_service.get_artifact(bucket, object_name, temp_path)
                
                # Move to Plex directory
                final_path = os.path.join(target_dir, item.original_filename)
                shutil.move(temp_path, final_path)
                
                # Update item
                item.final_path = final_path
                item.status = 'completed'
                item.processed_at = datetime.utcnow()
                
                # Update job progress
                job = session.query(PlexImportJob).filter_by(id=item.job_id).first()
                if job:
                    job.processed_files += 1
                
                session.commit()
                
                logger.info(f"Moved file to Plex: {final_path}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to move file {item_id}: {e}")
                item.status = 'failed'
                item.error_message = str(e)
                session.commit()
                raise
            
            finally:
                # Cleanup temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
    
    def trigger_library_scan(self, library_type: str = None) -> Dict:
        """
        Trigger Plex library scan
        
        Args:
            library_type: Optional library type to scan (movie, tv, music)
            
        Returns:
            Scan result dictionary
        """
        if not self.plex_token:
            raise ValueError("PLEX_TOKEN not configured")
        
        try:
            # Get all libraries
            libraries_url = f"{self.plex_url}/library/sections?X-Plex-Token={self.plex_token}"
            response = requests.get(libraries_url, timeout=10)
            response.raise_for_status()
            
            libraries_data = response.json()
            scanned_libraries = []
            
            # Scan matching libraries
            for library in libraries_data.get('MediaContainer', {}).get('Directory', []):
                lib_type = library.get('type')
                lib_key = library.get('key')
                lib_title = library.get('title')
                
                # Filter by type if specified
                if library_type and lib_type != library_type:
                    continue
                
                # Trigger scan
                scan_url = f"{self.plex_url}/library/sections/{lib_key}/refresh?X-Plex-Token={self.plex_token}"
                scan_response = requests.get(scan_url, timeout=10)
                scan_response.raise_for_status()
                
                scanned_libraries.append({
                    'key': lib_key,
                    'title': lib_title,
                    'type': lib_type
                })
                
                logger.info(f"Triggered scan for Plex library: {lib_title}")
            
            return {
                'success': True,
                'scanned_libraries': scanned_libraries,
                'count': len(scanned_libraries)
            }
            
        except requests.RequestException as e:
            logger.error(f"Failed to trigger Plex library scan: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_plex_libraries(self) -> List[Dict]:
        """
        Get list of Plex libraries
        
        Returns:
            List of library dictionaries
        """
        if not self.plex_token:
            raise ValueError("PLEX_TOKEN not configured")
        
        try:
            url = f"{self.plex_url}/library/sections?X-Plex-Token={self.plex_token}"
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            libraries = []
            
            for library in data.get('MediaContainer', {}).get('Directory', []):
                libraries.append({
                    'key': library.get('key'),
                    'title': library.get('title'),
                    'type': library.get('type'),
                    'agent': library.get('agent'),
                    'scanner': library.get('scanner'),
                    'language': library.get('language'),
                    'uuid': library.get('uuid')
                })
            
            return libraries
            
        except requests.RequestException as e:
            logger.error(f"Failed to get Plex libraries: {e}")
            raise RuntimeError(f"Failed to get Plex libraries: {str(e)}")
    
    def get_import_job(self, job_id: str) -> Optional[PlexImportJob]:
        """
        Get import job by ID
        
        Args:
            job_id: Job ID
            
        Returns:
            PlexImportJob or None
        """
        if not db_service.is_available:
            return None
        
        with db_service.get_session() as session:
            job = session.query(PlexImportJob).filter_by(id=job_id).first()
            if job:
                session.expunge(job)
            return job
    
    def list_import_jobs(self, user_id: str = None, limit: int = 50) -> List[PlexImportJob]:
        """
        List import jobs
        
        Args:
            user_id: Optional user filter
            limit: Maximum number of jobs to return
            
        Returns:
            List of PlexImportJob
        """
        if not db_service.is_available:
            return []
        
        with db_service.get_session() as session:
            query = session.query(PlexImportJob)
            
            if user_id:
                query = query.filter_by(user_id=user_id)
            
            jobs = query.order_by(PlexImportJob.created_at.desc()).limit(limit).all()
            
            # Expunge to avoid detached instance errors
            for job in jobs:
                session.expunge(job)
            
            return jobs
    
    def update_job_status(self, job_id: str, status: str, error_message: str = None) -> bool:
        """
        Update job status
        
        Args:
            job_id: Job ID
            status: New status
            error_message: Optional error message
            
        Returns:
            True if successful
        """
        if not db_service.is_available:
            return False
        
        with db_service.get_session() as session:
            job = session.query(PlexImportJob).filter_by(id=job_id).first()
            
            if not job:
                return False
            
            job.status = status
            
            if error_message:
                job.error_message = error_message
            
            if status == 'completed':
                job.completed_at = datetime.utcnow()
            
            session.commit()
            return True
    
    def delete_import_job(self, job_id: str) -> bool:
        """
        Delete import job and associated items
        
        Args:
            job_id: Job ID
            
        Returns:
            True if successful
        """
        if not db_service.is_available:
            return False
        
        with db_service.get_session() as session:
            job = session.query(PlexImportJob).filter_by(id=job_id).first()
            
            if not job:
                return False
            
            # Delete from MinIO if not yet moved
            for item in job.items:
                if item.status == 'pending' and item.storage_path:
                    try:
                        bucket, object_name = item.storage_path.split('/', 1)
                        upload_service.delete_artifact(bucket, object_name)
                    except Exception as e:
                        logger.warning(f"Failed to delete MinIO artifact for item {item.id}: {e}")
            
            # Delete job (cascades to items)
            session.delete(job)
            session.commit()
            
            logger.info(f"Deleted import job {job_id}")
            return True
    
    def cleanup_old_jobs(self, days: int = 30) -> int:
        """
        Cleanup completed jobs older than specified days
        
        Args:
            days: Age threshold in days
            
        Returns:
            Number of jobs deleted
        """
        if not db_service.is_available:
            return 0
        
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        
        with db_service.get_session() as session:
            old_jobs = session.query(PlexImportJob).filter(
                PlexImportJob.status == 'completed',
                PlexImportJob.completed_at < cutoff_date
            ).all()
            
            count = 0
            for job in old_jobs:
                try:
                    session.delete(job)
                    count += 1
                except Exception as e:
                    logger.error(f"Failed to delete old job {job.id}: {e}")
            
            session.commit()
            logger.info(f"Cleaned up {count} old import jobs")
            return count


# Singleton instance
plex_service = PlexService()
