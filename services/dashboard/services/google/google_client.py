"""Google API Client Manager using Replit Connectors"""
import os
import logging
import json
import redis
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


class GoogleClientManager:
    """Manages Google API clients using Replit connector authentication"""
    
    # Service to connector name mapping
    SERVICE_CONNECTORS = {
        'calendar': 'google-calendar',
        'gmail': 'google-mail',
        'drive': 'google-drive'
    }
    
    # Token cache TTL in seconds (55 minutes - tokens expire in 1 hour)
    TOKEN_CACHE_TTL = 3300
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        """
        Initialize Google Client Manager
        
        Args:
            redis_client: Redis client for token caching
        """
        self.redis_client = redis_client
        self.replit_hostname = os.environ.get('REPLIT_CONNECTORS_HOSTNAME')
        self.repl_identity = os.environ.get('REPL_IDENTITY')
        self.web_renewal = os.environ.get('WEB_REPL_RENEWAL')
        
        if not self.replit_hostname:
            logger.warning("REPLIT_CONNECTORS_HOSTNAME not set - Google services will be unavailable")
    
    def _get_replit_token(self) -> Optional[str]:
        """Get the Replit authentication token"""
        if self.repl_identity:
            return f'repl {self.repl_identity}'
        elif self.web_renewal:
            return f'depl {self.web_renewal}'
        return None
    
    def _get_cache_key(self, service: str) -> str:
        """Get Redis cache key for service token"""
        return f'google:token:{service}'
    
    def _fetch_access_token(self, service: str) -> Optional[Dict[str, Any]]:
        """
        Fetch access token from Replit connectors API
        
        Args:
            service: Service name (calendar, gmail, drive)
            
        Returns:
            Dictionary with access_token and expires_at
        """
        if not self.replit_hostname:
            logger.error("REPLIT_CONNECTORS_HOSTNAME not configured")
            return None
        
        replit_token = self._get_replit_token()
        if not replit_token:
            logger.error("No Replit authentication token available")
            return None
        
        connector_name = self.SERVICE_CONNECTORS.get(service)
        if not connector_name:
            logger.error(f"Unknown service: {service}")
            return None
        
        try:
            url = f'https://{self.replit_hostname}/api/v2/connection'
            params = {
                'include_secrets': 'true',
                'connector_names': connector_name
            }
            headers = {
                'Accept': 'application/json',
                'X_REPLIT_TOKEN': replit_token
            }
            
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            items = data.get('items', [])
            
            if not items:
                logger.warning(f"No connection found for {connector_name}")
                return None
            
            connection_settings = items[0]
            settings = connection_settings.get('settings', {})
            
            # Try different token locations based on connector type
            access_token = (
                settings.get('access_token') or
                settings.get('oauth', {}).get('credentials', {}).get('access_token')
            )
            
            if not access_token:
                logger.error(f"No access token found for {service}")
                return None
            
            expires_at = settings.get('expires_at')
            
            token_data = {
                'access_token': access_token,
                'expires_at': expires_at,
                'connector_name': connector_name,
                'fetched_at': datetime.utcnow().isoformat()
            }
            
            # Cache the token in Redis
            if self.redis_client:
                try:
                    cache_key = self._get_cache_key(service)
                    self.redis_client.setex(
                        cache_key,
                        self.TOKEN_CACHE_TTL,
                        json.dumps(token_data)
                    )
                    logger.info(f"Cached token for {service}")
                except Exception as e:
                    logger.warning(f"Failed to cache token: {e}")
            
            return token_data
        
        except requests.RequestException as e:
            logger.error(f"Failed to fetch token for {service}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching token for {service}: {e}", exc_info=True)
            return None
    
    def _get_access_token(self, service: str) -> Optional[str]:
        """
        Get access token for service (from cache or fetch new)
        
        Args:
            service: Service name (calendar, gmail, drive)
            
        Returns:
            Access token string or None
        """
        # Try to get from cache first
        if self.redis_client:
            try:
                cache_key = self._get_cache_key(service)
                cached_data = self.redis_client.get(cache_key)
                
                if cached_data:
                    token_data = json.loads(cached_data)
                    expires_at = token_data.get('expires_at')
                    
                    # Check if token is still valid
                    if expires_at:
                        expiry_time = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                        if expiry_time > datetime.utcnow():
                            logger.debug(f"Using cached token for {service}")
                            return token_data['access_token']
                        else:
                            logger.info(f"Cached token for {service} expired, fetching new one")
            except Exception as e:
                logger.warning(f"Error reading token from cache: {e}")
        
        # Fetch new token
        token_data = self._fetch_access_token(service)
        if token_data:
            return token_data['access_token']
        
        return None
    
    def get_calendar_client(self):
        """Get authenticated Google Calendar client"""
        access_token = self._get_access_token('calendar')
        if not access_token:
            raise RuntimeError("Google Calendar not connected or token unavailable")
        
        credentials = Credentials(token=access_token)
        return build('calendar', 'v3', credentials=credentials)
    
    def get_gmail_client(self):
        """Get authenticated Gmail client"""
        access_token = self._get_access_token('gmail')
        if not access_token:
            raise RuntimeError("Gmail not connected or token unavailable")
        
        credentials = Credentials(token=access_token)
        return build('gmail', 'v1', credentials=credentials)
    
    def get_drive_client(self):
        """Get authenticated Google Drive client"""
        access_token = self._get_access_token('drive')
        if not access_token:
            raise RuntimeError("Google Drive not connected or token unavailable")
        
        credentials = Credentials(token=access_token)
        return build('drive', 'v3', credentials=credentials)
    
    def test_connection(self, service: str) -> Dict[str, Any]:
        """
        Test connection to a Google service
        
        Args:
            service: Service name (calendar, gmail, drive)
            
        Returns:
            Dictionary with connection status and details
        """
        try:
            if service == 'calendar':
                client = self.get_calendar_client()
                calendar_list = client.calendarList().list(maxResults=1).execute()
                return {
                    'connected': True,
                    'service': 'calendar',
                    'calendars': len(calendar_list.get('items', []))
                }
            
            elif service == 'gmail':
                client = self.get_gmail_client()
                profile = client.users().getProfile(userId='me').execute()
                return {
                    'connected': True,
                    'service': 'gmail',
                    'email': profile.get('emailAddress')
                }
            
            elif service == 'drive':
                client = self.get_drive_client()
                about = client.about().get(fields='user,storageQuota').execute()
                return {
                    'connected': True,
                    'service': 'drive',
                    'email': about.get('user', {}).get('emailAddress'),
                    'storage': about.get('storageQuota', {})
                }
            
            else:
                return {'connected': False, 'error': f'Unknown service: {service}'}
        
        except HttpError as e:
            logger.error(f"Google API error testing {service}: {e}")
            return {'connected': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Error testing {service} connection: {e}", exc_info=True)
            return {'connected': False, 'error': str(e)}


# Initialize global client manager
_redis_client = None
try:
    redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
    _redis_client = redis.from_url(redis_url)
except Exception as e:
    logger.warning(f"Failed to connect to Redis: {e}")

google_client_manager = GoogleClientManager(redis_client=_redis_client)
