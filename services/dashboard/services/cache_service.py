"""Redis Cache Service with Connection Pooling and Graceful Degradation"""
import logging
import json
import redis
from typing import Any, Optional
from datetime import timedelta
import os

logger = logging.getLogger(__name__)


class CacheService:
    """Redis cache service with graceful degradation"""
    
    TTL_5_MIN = 300
    TTL_1_HOUR = 3600
    TTL_24_HOUR = 86400
    
    def __init__(self):
        """Initialize Redis connection with connection pooling"""
        self._redis_client = None
        self._available = False
        self._connect()
    
    def _connect(self):
        """Establish Redis connection"""
        try:
            redis_url = os.environ.get('REDIS_URL', 'redis://redis:6379/0')
            
            # Create connection pool
            pool = redis.ConnectionPool.from_url(
                redis_url,
                max_connections=50,
                socket_timeout=5,
                socket_connect_timeout=5,
                retry_on_timeout=True,
                decode_responses=True
            )
            
            self._redis_client = redis.Redis(connection_pool=pool)
            
            # Test connection
            self._redis_client.ping()
            self._available = True
            logger.info("Redis cache service initialized successfully")
            
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}. Operating without cache.")
            self._redis_client = None
            self._available = False
    
    @property
    def is_available(self) -> bool:
        """Check if Redis is available"""
        if not self._available:
            return False
        
        try:
            if self._redis_client:
                self._redis_client.ping()
                return True
        except Exception as e:
            logger.warning(f"Redis health check failed: {e}")
            self._available = False
        
        return False
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get value from cache
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found or cache unavailable
        """
        if not self.is_available:
            return None
        
        try:
            value = self._redis_client.get(key)
            if value is None:
                return None
            
            # Deserialize JSON
            return json.loads(value)
            
        except Exception as e:
            logger.warning(f"Cache get failed for key '{key}': {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = TTL_5_MIN) -> bool:
        """
        Set value in cache with TTL
        
        Args:
            key: Cache key
            value: Value to cache (must be JSON serializable)
            ttl: Time to live in seconds
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_available:
            return False
        
        try:
            # Serialize to JSON
            serialized = json.dumps(value)
            
            # Set with expiration
            self._redis_client.setex(key, ttl, serialized)
            return True
            
        except Exception as e:
            logger.warning(f"Cache set failed for key '{key}': {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        Delete key from cache
        
        Args:
            key: Cache key to delete
            
        Returns:
            True if successful, False otherwise
        """
        if not self.is_available:
            return False
        
        try:
            self._redis_client.delete(key)
            return True
            
        except Exception as e:
            logger.warning(f"Cache delete failed for key '{key}': {e}")
            return False
    
    def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching pattern
        
        Args:
            pattern: Redis pattern (e.g., 'storage:*')
            
        Returns:
            Number of keys deleted
        """
        if not self.is_available:
            return 0
        
        try:
            keys = self._redis_client.keys(pattern)
            if keys:
                return self._redis_client.delete(*keys)
            return 0
            
        except Exception as e:
            logger.warning(f"Cache delete pattern failed for '{pattern}': {e}")
            return 0
    
    def exists(self, key: str) -> bool:
        """
        Check if key exists in cache
        
        Args:
            key: Cache key
            
        Returns:
            True if key exists, False otherwise
        """
        if not self.is_available:
            return False
        
        try:
            return self._redis_client.exists(key) > 0
        except Exception as e:
            logger.warning(f"Cache exists check failed for key '{key}': {e}")
            return False
    
    def ttl(self, key: str) -> int:
        """
        Get remaining TTL for key
        
        Args:
            key: Cache key
            
        Returns:
            Remaining seconds, -1 if no expiry, -2 if key doesn't exist
        """
        if not self.is_available:
            return -2
        
        try:
            return self._redis_client.ttl(key)
        except Exception as e:
            logger.warning(f"Cache TTL check failed for key '{key}': {e}")
            return -2
    
    def invalidate_storage_metrics(self):
        """Invalidate all storage metrics caches"""
        return self.delete_pattern('storage:metrics:*')
    
    def invalidate_marketplace_apps(self):
        """Invalidate marketplace apps cache"""
        return self.delete_pattern('marketplace:apps:*')
    
    def invalidate_agent_tasks(self):
        """Invalidate agent tasks cache"""
        return self.delete_pattern('agents:tasks:*')
    
    def invalidate_google_services(self):
        """Invalidate Google services status cache"""
        return self.delete_pattern('google:status:*')
    
    def invalidate_deployment_stats(self):
        """Invalidate deployment statistics cache"""
        return self.delete_pattern('deployments:stats:*')
    
    def flush_all(self):
        """Flush entire cache (use with caution)"""
        if not self.is_available:
            return False
        
        try:
            self._redis_client.flushdb()
            logger.info("Cache flushed successfully")
            return True
        except Exception as e:
            logger.error(f"Cache flush failed: {e}")
            return False


# Global cache service instance
cache_service = CacheService()
