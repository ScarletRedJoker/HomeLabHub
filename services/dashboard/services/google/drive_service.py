"""Google Drive Service for backup management"""
import logging
import os
import io
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload
from .google_client import google_client_manager

logger = logging.getLogger(__name__)


class DriveService:
    """Google Drive integration for backup management"""
    
    # Default backup folder name
    BACKUP_FOLDER_NAME = 'Homelab Backups'
    
    # MIME types
    MIME_FOLDER = 'application/vnd.google-apps.folder'
    MIME_ZIP = 'application/zip'
    MIME_TAR = 'application/x-tar'
    
    def __init__(self):
        """Initialize Drive Service"""
        self.client_manager = google_client_manager
        self._backup_folder_id = None
    
    def _get_or_create_backup_folder(self) -> str:
        """
        Get or create the backup folder in Drive
        
        Returns:
            Folder ID
        """
        if self._backup_folder_id:
            return self._backup_folder_id
        
        try:
            client = self.client_manager.get_drive_client()
            
            # Search for existing folder
            query = f"name='{self.BACKUP_FOLDER_NAME}' and mimeType='{self.MIME_FOLDER}' and trashed=false"
            results = client.files().list(
                q=query,
                spaces='drive',
                fields='files(id, name)'
            ).execute()
            
            files = results.get('files', [])
            
            if files:
                self._backup_folder_id = files[0]['id']
                logger.info(f"Found existing backup folder: {self._backup_folder_id}")
            else:
                # Create folder
                folder_metadata = {
                    'name': self.BACKUP_FOLDER_NAME,
                    'mimeType': self.MIME_FOLDER
                }
                folder = client.files().create(
                    body=folder_metadata,
                    fields='id'
                ).execute()
                
                self._backup_folder_id = folder['id']
                logger.info(f"Created backup folder: {self._backup_folder_id}")
            
            return self._backup_folder_id
        
        except HttpError as e:
            logger.error(f"Error getting/creating backup folder: {e}")
            raise
    
    def upload_backup(
        self,
        file_path: str,
        description: Optional[str] = None,
        folder_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload backup file to Google Drive
        
        Args:
            file_path: Path to backup file
            description: Backup description
            folder_id: Optional folder ID (uses backup folder if not specified)
            
        Returns:
            Upload result dictionary
        """
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"Backup file not found: {file_path}")
            
            client = self.client_manager.get_drive_client()
            
            # Use backup folder if no folder specified
            if not folder_id:
                folder_id = self._get_or_create_backup_folder()
            
            # Get file info
            file_name = os.path.basename(file_path)
            file_size = os.path.getsize(file_path)
            
            # Determine MIME type
            if file_name.endswith('.zip'):
                mime_type = self.MIME_ZIP
            elif file_name.endswith(('.tar', '.tar.gz', '.tgz')):
                mime_type = self.MIME_TAR
            else:
                mime_type = 'application/octet-stream'
            
            # Prepare metadata
            file_metadata = {
                'name': file_name,
                'parents': [folder_id]
            }
            
            if description:
                file_metadata['description'] = description
            
            # Upload file
            media = MediaFileUpload(
                file_path,
                mimetype=mime_type,
                resumable=True
            )
            
            uploaded_file = client.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, name, size, createdTime, webViewLink'
            ).execute()
            
            logger.info(f"Uploaded backup: {file_name} ({file_size} bytes) -> {uploaded_file['id']}")
            
            return {
                'id': uploaded_file['id'],
                'name': uploaded_file['name'],
                'size': int(uploaded_file.get('size', 0)),
                'created': uploaded_file.get('createdTime'),
                'webViewLink': uploaded_file.get('webViewLink'),
                'description': description,
                'local_path': file_path
            }
        
        except HttpError as e:
            logger.error(f"Error uploading backup: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error uploading backup: {e}", exc_info=True)
            raise
    
    def list_backups(
        self,
        folder_id: Optional[str] = None,
        max_results: int = 100
    ) -> List[Dict[str, Any]]:
        """
        List backup files in Drive
        
        Args:
            folder_id: Optional folder ID (uses backup folder if not specified)
            max_results: Maximum number of backups to return
            
        Returns:
            List of backup file dictionaries
        """
        try:
            client = self.client_manager.get_drive_client()
            
            # Use backup folder if no folder specified
            if not folder_id:
                folder_id = self._get_or_create_backup_folder()
            
            # Query for files in folder
            query = f"'{folder_id}' in parents and trashed=false"
            results = client.files().list(
                q=query,
                pageSize=max_results,
                orderBy='createdTime desc',
                fields='files(id, name, size, createdTime, modifiedTime, description, webViewLink)'
            ).execute()
            
            files = results.get('files', [])
            
            backups = []
            for file_item in files:
                backups.append({
                    'id': file_item.get('id'),
                    'name': file_item.get('name'),
                    'size': int(file_item.get('size', 0)),
                    'created': file_item.get('createdTime'),
                    'modified': file_item.get('modifiedTime'),
                    'description': file_item.get('description'),
                    'webViewLink': file_item.get('webViewLink')
                })
            
            logger.info(f"Listed {len(backups)} backups from folder {folder_id}")
            return backups
        
        except HttpError as e:
            logger.error(f"Error listing backups: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error listing backups: {e}", exc_info=True)
            raise
    
    def download_backup(
        self,
        file_id: str,
        destination_path: str
    ) -> Dict[str, Any]:
        """
        Download backup file from Drive
        
        Args:
            file_id: Drive file ID
            destination_path: Local path to save file
            
        Returns:
            Download result dictionary
        """
        try:
            client = self.client_manager.get_drive_client()
            
            # Get file metadata
            file_metadata = client.files().get(
                fileId=file_id,
                fields='name, size'
            ).execute()
            
            # Download file
            request = client.files().get_media(fileId=file_id)
            
            with open(destination_path, 'wb') as fh:
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    status, done = downloader.next_chunk()
                    if status:
                        logger.debug(f"Download progress: {int(status.progress() * 100)}%")
            
            logger.info(f"Downloaded backup: {file_metadata['name']} -> {destination_path}")
            
            return {
                'id': file_id,
                'name': file_metadata['name'],
                'size': int(file_metadata.get('size', 0)),
                'destination': destination_path
            }
        
        except HttpError as e:
            logger.error(f"Error downloading backup: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error downloading backup: {e}", exc_info=True)
            raise
    
    def delete_backup(self, file_id: str) -> bool:
        """
        Delete backup file from Drive
        
        Args:
            file_id: Drive file ID
            
        Returns:
            True if successful
        """
        try:
            client = self.client_manager.get_drive_client()
            client.files().delete(fileId=file_id).execute()
            
            logger.info(f"Deleted backup: {file_id}")
            return True
        
        except HttpError as e:
            logger.error(f"Error deleting backup: {e}")
            return False
        except Exception as e:
            logger.error(f"Unexpected error deleting backup: {e}", exc_info=True)
            return False
    
    def cleanup_old_backups(
        self,
        retention_days: int = 30,
        folder_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Delete backups older than retention period
        
        Args:
            retention_days: Number of days to keep backups
            folder_id: Optional folder ID (uses backup folder if not specified)
            
        Returns:
            Cleanup result dictionary
        """
        try:
            backups = self.list_backups(folder_id=folder_id)
            cutoff_date = datetime.utcnow() - timedelta(days=retention_days)
            
            deleted_count = 0
            deleted_size = 0
            errors = []
            
            for backup in backups:
                created_time = datetime.fromisoformat(backup['created'].replace('Z', '+00:00'))
                
                if created_time < cutoff_date:
                    if self.delete_backup(backup['id']):
                        deleted_count += 1
                        deleted_size += backup.get('size', 0)
                    else:
                        errors.append(backup['id'])
            
            result = {
                'deleted_count': deleted_count,
                'deleted_size': deleted_size,
                'retention_days': retention_days,
                'errors': errors,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            logger.info(f"Cleanup: deleted {deleted_count} backups ({deleted_size} bytes)")
            return result
        
        except Exception as e:
            logger.error(f"Error during cleanup: {e}", exc_info=True)
            raise
    
    def get_storage_info(self) -> Dict[str, Any]:
        """
        Get Drive storage quota information
        
        Returns:
            Storage information dictionary
        """
        try:
            client = self.client_manager.get_drive_client()
            about = client.about().get(fields='storageQuota').execute()
            
            quota = about.get('storageQuota', {})
            
            return {
                'limit': int(quota.get('limit', 0)),
                'usage': int(quota.get('usage', 0)),
                'usageInDrive': int(quota.get('usageInDrive', 0)),
                'usageInDriveTrash': int(quota.get('usageInDriveTrash', 0))
            }
        
        except HttpError as e:
            logger.error(f"Error getting storage info: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error getting storage info: {e}", exc_info=True)
            raise


# Initialize global Drive service
drive_service = DriveService()
