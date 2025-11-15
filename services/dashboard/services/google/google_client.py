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
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from .exceptions import (
    GoogleAuthenticationError,
    GoogleTokenRefreshError,
    GoogleConnectionUnavailableError,
    GoogleNetworkError
)

logger = logging.getLogger(__name__)


class GoogleClientManager:
    """Manages Google API clients using Replit connector authentication"""
    
    # Service to connector name mapping
    SERVICE_CONNECTORS = {
        'calendar': 'google-calendar',
        'gmail': 'google-mail',
        'drive': 'google-drive'
    }
    
    # Required scopes for each service (for documentation)
    REQUIRED_SCOPES = {
        'calendar': [
            'https://www.googleapis.com/auth/calendar.readonly',  # Read calendar events
            'https://www.googleapis.com/auth/calendar.events'     # Create/modify calendar events
        ],
        'gmail': [
            'https://www.googleapis.com/auth/gmail.send',          # Send emails
            'https://www.googleapis.com/auth/gmail.readonly'       # Read email profile
        ],
        'drive': [
            'https://www.googleapis.com/auth/drive.file',          # Access files created by this app
            'https://www.googleapis.com/auth/drive.metadata.readonly'  # Read file metadata
        ]
    }
    
    # Token cache TTL in seconds (55 minutes - tokens expire in 1 hour)
    TOKEN_CACHE_TTL = 3300
    
    # Proactive refresh buffer (refresh if token expires in next 5 minutes)
    REFRESH_BUFFER_SECONDS = 300
    
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
    
    @retry(
        retry=retry_if_exception_type((requests.exceptions.RequestException, requests.exceptions.Timeout)),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10)
    )
    def _fetch_access_token(self, service: str) -> Optional[Dict[str, Any]]:
        """
        Fetch access token from Replit connectors API with retry logic
        
        Args:
            service: Service name (calendar, gmail, drive)
            
        Returns:
            Dictionary with access_token and expires_at
            
        Raises:
            GoogleConnectionUnavailableError: If service not connected
            GoogleTokenRefreshError: If unable to fetch token
            GoogleNetworkError: If network error occurs
        """
        if not self.replit_hostname:
            logger.error(f"REPLIT_CONNECTORS_HOSTNAME not configured for {service}")
            raise GoogleConnectionUnavailableError(
                service=service,
                technical_details="REPLIT_CONNECTORS_HOSTNAME environment variable not set"
            )
        
        replit_token = self._get_replit_token()
        if not replit_token:
            logger.error(f"No Replit authentication token available for {service}")
            raise GoogleConnectionUnavailableError(
                service=service,
                technical_details="No REPL_IDENTITY or WEB_REPL_RENEWAL found"
            )
        
        connector_name = self.SERVICE_CONNECTORS.get(service)
        if not connector_name:
            logger.error(f"Unknown service: {service}")
            raise ValueError(f"Unknown service: {service}")
        
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
            
            logger.debug(f"Fetching token for {service} from Replit connectors")
            response = requests.get(url, params=params, headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            items = data.get('items', [])
            
            if not items:
                logger.warning(f"No connection found for {connector_name}")
                raise GoogleConnectionUnavailableError(
                    service=service,
                    technical_details=f"No connection found for connector: {connector_name}"
                )
            
            connection_settings = items[0]
            settings = connection_settings.get('settings', {})
            
            # Try different token locations based on connector type
            access_token = (
                settings.get('access_token') or
                settings.get('oauth', {}).get('credentials', {}).get('access_token')
            )
            
            if not access_token:
                logger.error(f"No access token found in connector settings for {service}")
                raise GoogleTokenRefreshError(
                    service=service,
                    technical_details=f"No access token in connector settings for {connector_name}"
                )
            
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
                    logger.info(f"Successfully fetched and cached token for {service}")
                except Exception as e:
                    logger.warning(f"Failed to cache token for {service}: {e}")
            else:
                logger.info(f"Successfully fetched token for {service} (no cache available)")
            
            return token_data
        
        except requests.exceptions.Timeout as e:
            logger.error(f"Timeout fetching token for {service}: {e}")
            raise GoogleNetworkError(
                service=service,
                technical_details=f"Timeout connecting to Replit connectors: {e}"
            )
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error fetching token for {service}: {e}")
            raise GoogleNetworkError(
                service=service,
                technical_details=f"Request error: {e}"
            )
        except GoogleConnectionUnavailableError:
            raise
        except GoogleTokenRefreshError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error fetching token for {service}: {e}", exc_info=True)
            raise GoogleTokenRefreshError(
                service=service,
                technical_details=f"Unexpected error: {str(e)}"
            )
    
    def _get_access_token(self, service: str) -> str:
        """
        Get access token for service with proactive refresh
        
        This method implements proactive token refresh by refreshing tokens
        before they expire (using REFRESH_BUFFER_SECONDS).
        
        Args:
            service: Service name (calendar, gmail, drive)
            
        Returns:
            Access token string
            
        Raises:
            GoogleConnectionUnavailableError: If service not connected
            GoogleTokenRefreshError: If unable to get/refresh token
        """
        # Try to get from cache first
        if self.redis_client:
            try:
                cache_key = self._get_cache_key(service)
                cached_data = self.redis_client.get(cache_key)
                
                if cached_data:
                    token_data = json.loads(cached_data)
                    expires_at = token_data.get('expires_at')
                    
                    # Check if token is still valid with buffer
                    if expires_at:
                        try:
                            expiry_time = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                            time_until_expiry = (expiry_time - datetime.utcnow()).total_seconds()
                            
                            # Proactive refresh: refresh if token expires in next 5 minutes
                            if time_until_expiry > self.REFRESH_BUFFER_SECONDS:
                                logger.debug(
                                    f"Using cached token for {service} "
                                    f"(expires in {int(time_until_expiry/60)} minutes)"
                                )
                                return token_data['access_token']
                            elif time_until_expiry > 0:
                                logger.info(
                                    f"Token for {service} expires soon "
                                    f"({int(time_until_expiry/60)} minutes), proactively refreshing"
                                )
                            else:
                                logger.info(f"Cached token for {service} expired, fetching new one")
                        except (ValueError, TypeError) as e:
                            logger.warning(f"Error parsing expiry time for {service}: {e}")
                    else:
                        logger.debug(f"Cached token for {service} has no expiry, using it")
                        return token_data['access_token']
            except (json.JSONDecodeError, TypeError) as e:
                logger.warning(f"Error parsing cached token data for {service}: {e}")
            except Exception as e:
                logger.warning(f"Error reading token from cache for {service}: {e}")
        
        # Fetch new token (with retry logic built into _fetch_access_token)
        token_data = self._fetch_access_token(service)
        return token_data['access_token']
    
    def get_calendar_client(self):
        """
        Get authenticated Google Calendar client
        
        Returns:
            Authenticated Calendar API client
            
        Raises:
            GoogleConnectionUnavailableError: If Calendar not connected
            GoogleTokenRefreshError: If unable to refresh token
        """
        try:
            access_token = self._get_access_token('calendar')
            credentials = Credentials(token=access_token)
            return build('calendar', 'v3', credentials=credentials)
        except Exception as e:
            logger.error(f"Error creating Calendar client: {e}")
            raise
    
    def get_gmail_client(self):
        """
        Get authenticated Gmail client
        
        Returns:
            Authenticated Gmail API client
            
        Raises:
            GoogleConnectionUnavailableError: If Gmail not connected
            GoogleTokenRefreshError: If unable to refresh token
        """
        try:
            access_token = self._get_access_token('gmail')
            credentials = Credentials(token=access_token)
            return build('gmail', 'v1', credentials=credentials)
        except Exception as e:
            logger.error(f"Error creating Gmail client: {e}")
            raise
    
    def get_drive_client(self):
        """
        Get authenticated Google Drive client
        
        Returns:
            Authenticated Drive API client
            
        Raises:
            GoogleConnectionUnavailableError: If Drive not connected
            GoogleTokenRefreshError: If unable to refresh token
        """
        try:
            access_token = self._get_access_token('drive')
            credentials = Credentials(token=access_token)
            return build('drive', 'v3', credentials=credentials)
        except Exception as e:
            logger.error(f"Error creating Drive client: {e}")
            raise
    
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
