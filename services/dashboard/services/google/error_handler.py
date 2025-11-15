"""Error handler and retry logic for Google API operations"""
import logging
import time
from typing import Callable, TypeVar, Optional
from functools import wraps
from googleapiclient.errors import HttpError
from google.auth.exceptions import RefreshError, TransportError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    retry_if_exception,
    before_sleep_log
)
import requests

from .exceptions import (
    GoogleAuthenticationError,
    GooglePermissionError,
    GoogleRateLimitError,
    GoogleQuotaExceededError,
    GoogleNotFoundError,
    GoogleNetworkError,
    GoogleConnectionUnavailableError,
    GoogleTokenRefreshError,
    GoogleServiceError
)

logger = logging.getLogger(__name__)

T = TypeVar('T')


def is_retryable_error(exception: Exception) -> bool:
    """
    Determine if an error should be retried
    
    Args:
        exception: Exception to check
        
    Returns:
        True if the error is retryable
    """
    # Network errors are retryable
    if isinstance(exception, (TransportError, requests.exceptions.RequestException)):
        return True
    
    # Some HTTP errors are retryable
    if isinstance(exception, HttpError):
        status_code = exception.resp.status
        # Retry on: 429 (rate limit), 500+ (server errors), 503 (service unavailable)
        if status_code in [429, 500, 502, 503, 504]:
            return True
    
    return False


def parse_http_error(error: HttpError, service: Optional[str] = None) -> GoogleServiceError:
    """
    Parse HttpError and return appropriate user-friendly exception
    
    Args:
        error: HttpError from Google API
        service: Service name (calendar, gmail, drive)
        
    Returns:
        Appropriate GoogleServiceError subclass
    """
    status_code = error.resp.status
    error_details = str(error)
    
    # 401 Unauthorized - Authentication failed or token expired
    if status_code == 401:
        logger.warning(f"Google {service} authentication failed: {error_details}")
        return GoogleAuthenticationError(service=service, technical_details=error_details)
    
    # 403 Forbidden - Insufficient permissions or quota exceeded
    elif status_code == 403:
        error_reason = None
        try:
            error_content = error.error_details
            if error_content:
                error_reason = error_content[0].get('reason', '')
        except:
            pass
        
        # Check if it's a quota/rate limit issue
        if error_reason in ['quotaExceeded', 'dailyLimitExceeded', 'userRateLimitExceeded']:
            logger.warning(f"Google {service} quota exceeded: {error_details}")
            return GoogleQuotaExceededError(service=service, technical_details=error_details)
        else:
            logger.warning(f"Google {service} permission denied: {error_details}")
            return GooglePermissionError(service=service, technical_details=error_details)
    
    # 404 Not Found
    elif status_code == 404:
        logger.warning(f"Google {service} resource not found: {error_details}")
        return GoogleNotFoundError(service=service, technical_details=error_details)
    
    # 429 Too Many Requests - Rate limit
    elif status_code == 429:
        retry_after = None
        try:
            retry_after = int(error.resp.get('Retry-After') or 60)
        except (ValueError, AttributeError, TypeError):
            retry_after = 60
        
        logger.warning(f"Google {service} rate limit exceeded, retry after {retry_after}s: {error_details}")
        return GoogleRateLimitError(service=service, retry_after=retry_after, technical_details=error_details)
    
    # 5xx Server Errors
    elif status_code >= 500:
        logger.error(f"Google {service} server error: {error_details}")
        return GoogleServiceError(
            user_message=f"Google {service.title() if service else 'service'} is temporarily unavailable. Please try again later.",
            technical_details=error_details,
            service=service
        )
    
    # Other errors
    else:
        logger.error(f"Google {service} unexpected error ({status_code}): {error_details}")
        return GoogleServiceError(
            user_message=f"An unexpected error occurred with Google {service.title() if service else 'service'}. Please try again or contact support.",
            technical_details=error_details,
            service=service
        )


def handle_google_api_errors(service: str):
    """
    Decorator to handle Google API errors with retry logic and user-friendly messages
    
    Args:
        service: Service name (calendar, gmail, drive)
        
    Usage:
        @handle_google_api_errors('calendar')
        def list_events(self):
            # Your Google API call here
            pass
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        # Apply retry logic first
        @retry(
            retry=retry_if_exception_type((TransportError, requests.exceptions.RequestException)) | retry_if_exception(is_retryable_error),
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=2, max=10),
            before_sleep=before_sleep_log(logger, logging.WARNING),
            reraise=True
        )
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            try:
                return func(*args, **kwargs)
            
            except RefreshError as e:
                # Token refresh failed
                logger.error(f"Google {service} token refresh failed: {e}")
                raise GoogleTokenRefreshError(service=service, technical_details=str(e))
            
            except HttpError as e:
                # Parse and raise user-friendly error
                raise parse_http_error(e, service=service)
            
            except (TransportError, requests.exceptions.RequestException) as e:
                # Network errors
                logger.error(f"Google {service} network error: {e}")
                raise GoogleNetworkError(service=service, technical_details=str(e))
            
            except GoogleServiceError:
                # Already a user-friendly error, re-raise
                raise
            
            except RuntimeError as e:
                # Check if it's a connection unavailable error
                if "not connected" in str(e).lower() or "unavailable" in str(e).lower():
                    logger.warning(f"Google {service} not connected: {e}")
                    raise GoogleConnectionUnavailableError(service=service, technical_details=str(e))
                raise
            
            except Exception as e:
                # Unexpected errors
                logger.error(f"Unexpected error in Google {service}: {e}", exc_info=True)
                raise GoogleServiceError(
                    user_message=f"An unexpected error occurred with Google {service.title()}. Please try again or contact support.",
                    technical_details=str(e),
                    service=service
                )
        
        return wrapper
    return decorator


def handle_rate_limit_with_backoff(max_retries: int = 5, initial_delay: float = 1.0):
    """
    Decorator specifically for handling rate limits with exponential backoff
    
    Args:
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            delay = initial_delay
            
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                
                except (GoogleRateLimitError, GoogleQuotaExceededError) as e:
                    if attempt == max_retries - 1:
                        # Last attempt, re-raise
                        raise
                    
                    # Calculate backoff delay
                    if isinstance(e, GoogleRateLimitError) and e.retry_after:
                        wait_time = e.retry_after
                    else:
                        wait_time = delay
                    
                    logger.warning(
                        f"Rate limit hit, retrying in {wait_time}s "
                        f"(attempt {attempt + 1}/{max_retries})"
                    )
                    time.sleep(wait_time)
                    delay *= 2  # Exponential backoff
            
            return func(*args, **kwargs)
        
        return wrapper
    return decorator


def safe_google_operation(
    operation: Callable[..., T],
    service: str,
    fallback_value: Optional[T] = None,
    log_errors: bool = True
) -> Optional[T]:
    """
    Execute a Google API operation safely with error handling
    
    Args:
        operation: Function to execute
        service: Service name (calendar, gmail, drive)
        fallback_value: Value to return on error (default: None)
        log_errors: Whether to log errors
        
    Returns:
        Operation result or fallback value on error
    """
    try:
        return operation()
    except GoogleServiceError as e:
        if log_errors:
            logger.error(f"Google {service} operation failed: {e.user_message}")
        return fallback_value
    except Exception as e:
        if log_errors:
            logger.error(f"Unexpected error in Google {service} operation: {e}", exc_info=True)
        return fallback_value
