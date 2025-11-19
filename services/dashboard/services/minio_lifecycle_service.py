"""
MinIO Lifecycle Management Service
Manages bucket lifecycle policies for automated storage optimization
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from minio import Minio
from minio.error import S3Error
from minio.lifecycleconfig import LifecycleConfig, Rule, Expiration, AbortIncompleteMultipartUpload
from minio.commonconfig import Filter
import json

from config import Config

logger = logging.getLogger(__name__)


class MinIOLifecycleService:
    """Service for managing MinIO bucket lifecycle policies"""
    
    def __init__(self):
        self.client = None
        self._init_client()
    
    def _init_client(self):
        """Initialize MinIO client"""
        try:
            self.client = Minio(
                Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE
            )
            logger.info("MinIO lifecycle client initialized")
        except Exception as e:
            logger.error(f"Failed to initialize MinIO client: {e}")
            self.client = None
    
    def is_available(self) -> bool:
        """Check if MinIO client is available"""
        return self.client is not None
    
    def set_bucket_lifecycle(self, bucket: str, rules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Configure lifecycle policies for a bucket
        
        Args:
            bucket: Bucket name
            rules: List of lifecycle rule dictionaries
                Example:
                [
                    {
                        "id": "DeleteTempFiles",
                        "prefix": "temp/",
                        "expiration_days": 90,
                        "enabled": True
                    }
                ]
        
        Returns:
            Dict with success status and message
        """
        if not self.is_available():
            return {"success": False, "error": "MinIO client not available"}
        
        try:
            # Convert rule dictionaries to MinIO Rule objects
            lifecycle_rules = []
            
            for rule_dict in rules:
                rule_id = rule_dict.get("id", f"rule-{len(lifecycle_rules)}")
                prefix = rule_dict.get("prefix", "")
                expiration_days = rule_dict.get("expiration_days")
                abort_incomplete_days = rule_dict.get("abort_incomplete_days")
                enabled = rule_dict.get("enabled", True)
                
                # Create filter
                rule_filter = Filter(prefix=prefix) if prefix else None
                
                # Create expiration
                expiration = None
                if expiration_days:
                    expiration = Expiration(days=expiration_days)
                
                # Create abort incomplete multipart upload
                abort_incomplete = None
                if abort_incomplete_days:
                    abort_incomplete = AbortIncompleteMultipartUpload(
                        days_after_initiation=abort_incomplete_days
                    )
                
                # Create rule
                rule = Rule(
                    rule_id=rule_id,
                    rule_filter=rule_filter,
                    expiration=expiration,
                    abort_incomplete_multipart_upload=abort_incomplete,
                    status="Enabled" if enabled else "Disabled"
                )
                
                lifecycle_rules.append(rule)
            
            # Create lifecycle config
            config = LifecycleConfig(lifecycle_rules)
            
            # Set lifecycle config on bucket
            self.client.set_bucket_lifecycle(bucket, config)
            
            logger.info(f"Successfully set lifecycle policies for bucket: {bucket}")
            return {
                "success": True,
                "message": f"Lifecycle policies configured for {bucket}",
                "rules_count": len(lifecycle_rules)
            }
        
        except S3Error as e:
            logger.error(f"S3 error setting lifecycle for {bucket}: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error setting lifecycle for {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def get_bucket_lifecycle(self, bucket: str) -> Dict[str, Any]:
        """
        Get current lifecycle policies for a bucket
        
        Args:
            bucket: Bucket name
        
        Returns:
            Dict with lifecycle rules or error
        """
        if not self.is_available():
            return {"success": False, "error": "MinIO client not available"}
        
        try:
            config = self.client.get_bucket_lifecycle(bucket)
            
            if not config:
                return {
                    "success": True,
                    "bucket": bucket,
                    "rules": []
                }
            
            # Convert MinIO Rules to dictionaries
            rules = []
            for rule in config.rules:
                rule_dict = {
                    "id": rule.rule_id,
                    "status": rule.status,
                    "prefix": rule.rule_filter.prefix if rule.rule_filter else "",
                }
                
                if rule.expiration:
                    rule_dict["expiration_days"] = rule.expiration.days
                
                if rule.abort_incomplete_multipart_upload:
                    rule_dict["abort_incomplete_days"] = rule.abort_incomplete_multipart_upload.days_after_initiation
                
                rules.append(rule_dict)
            
            return {
                "success": True,
                "bucket": bucket,
                "rules": rules
            }
        
        except S3Error as e:
            if "NoSuchLifecycleConfiguration" in str(e):
                return {
                    "success": True,
                    "bucket": bucket,
                    "rules": []
                }
            logger.error(f"S3 error getting lifecycle for {bucket}: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error getting lifecycle for {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def delete_bucket_lifecycle(self, bucket: str) -> Dict[str, Any]:
        """
        Remove all lifecycle policies from a bucket
        
        Args:
            bucket: Bucket name
        
        Returns:
            Dict with success status
        """
        if not self.is_available():
            return {"success": False, "error": "MinIO client not available"}
        
        try:
            self.client.delete_bucket_lifecycle(bucket)
            logger.info(f"Deleted lifecycle policies for bucket: {bucket}")
            return {
                "success": True,
                "message": f"Lifecycle policies removed from {bucket}"
            }
        except Exception as e:
            logger.error(f"Error deleting lifecycle for {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def get_storage_stats(self, bucket: str) -> Dict[str, Any]:
        """
        Get bucket size and object count statistics
        
        Args:
            bucket: Bucket name
        
        Returns:
            Dict with storage statistics
        """
        if not self.is_available():
            return {"success": False, "error": "MinIO client not available"}
        
        try:
            total_size = 0
            object_count = 0
            prefix_stats = {}
            
            # List all objects in bucket
            objects = self.client.list_objects(bucket, recursive=True)
            
            for obj in objects:
                total_size += obj.size
                object_count += 1
                
                # Track stats by prefix (first directory level)
                prefix = obj.object_name.split('/')[0] if '/' in obj.object_name else 'root'
                
                if prefix not in prefix_stats:
                    prefix_stats[prefix] = {
                        "size_bytes": 0,
                        "object_count": 0
                    }
                
                prefix_stats[prefix]["size_bytes"] += obj.size
                prefix_stats[prefix]["object_count"] += 1
            
            # Convert to GB
            for prefix, stats in prefix_stats.items():
                stats["size_gb"] = round(stats["size_bytes"] / (1024**3), 2)
            
            return {
                "success": True,
                "bucket": bucket,
                "total_size_bytes": total_size,
                "total_size_gb": round(total_size / (1024**3), 2),
                "object_count": object_count,
                "prefix_breakdown": prefix_stats,
                "timestamp": datetime.utcnow().isoformat()
            }
        
        except S3Error as e:
            logger.error(f"S3 error getting stats for {bucket}: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error getting stats for {bucket}: {e}")
            return {"success": False, "error": str(e)}
    
    def cleanup_old_files(self, bucket: str, prefix: str, days: int) -> Dict[str, Any]:
        """
        Manually trigger cleanup of files older than specified days
        
        Args:
            bucket: Bucket name
            prefix: Object prefix to filter
            days: Delete objects older than this many days
        
        Returns:
            Dict with cleanup results
        """
        if not self.is_available():
            return {"success": False, "error": "MinIO client not available"}
        
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            deleted_count = 0
            deleted_size = 0
            errors = []
            
            # List objects with prefix
            objects = self.client.list_objects(bucket, prefix=prefix, recursive=True)
            
            for obj in objects:
                # Check if object is older than cutoff
                if obj.last_modified and obj.last_modified.replace(tzinfo=None) < cutoff_date:
                    try:
                        self.client.remove_object(bucket, obj.object_name)
                        deleted_count += 1
                        deleted_size += obj.size
                        logger.debug(f"Deleted old object: {obj.object_name}")
                    except Exception as e:
                        error_msg = f"Failed to delete {obj.object_name}: {str(e)}"
                        errors.append(error_msg)
                        logger.error(error_msg)
            
            logger.info(f"Cleanup completed: {deleted_count} objects deleted from {bucket}/{prefix}")
            
            return {
                "success": True,
                "bucket": bucket,
                "prefix": prefix,
                "deleted_count": deleted_count,
                "deleted_size_bytes": deleted_size,
                "deleted_size_gb": round(deleted_size / (1024**3), 2),
                "cutoff_date": cutoff_date.isoformat(),
                "errors": errors
            }
        
        except S3Error as e:
            logger.error(f"S3 error during cleanup for {bucket}/{prefix}: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Error during cleanup for {bucket}/{prefix}: {e}")
            return {"success": False, "error": str(e)}
    
    def list_buckets(self) -> Dict[str, Any]:
        """
        List all available buckets
        
        Returns:
            Dict with bucket list
        """
        if not self.is_available():
            return {"success": False, "error": "MinIO client not available"}
        
        try:
            buckets = self.client.list_buckets()
            
            bucket_list = [
                {
                    "name": bucket.name,
                    "created": bucket.creation_date.isoformat() if bucket.creation_date else None
                }
                for bucket in buckets
            ]
            
            return {
                "success": True,
                "buckets": bucket_list,
                "count": len(bucket_list)
            }
        except Exception as e:
            logger.error(f"Error listing buckets: {e}")
            return {"success": False, "error": str(e)}


# Global service instance
minio_lifecycle_service = MinIOLifecycleService()
