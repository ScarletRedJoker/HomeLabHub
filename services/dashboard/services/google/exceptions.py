"""Custom exceptions for Google Services with user-friendly error messages"""
from typing import Optional


class GoogleServiceError(Exception):
    """Base exception for Google service errors with user-friendly messages"""
    
    def __init__(self, user_message: str, technical_details: Optional[str] = None, service: Optional[str] = None):
        """
        Initialize Google Service Error
        
        Args:
            user_message: User-friendly error message to display
            technical_details: Technical details for logging (not shown to users)
            service: Service name (calendar, gmail, drive)
        """
        self.user_message = user_message
        self.technical_details = technical_details
        self.service = service
        super().__init__(user_message)
    
    def to_dict(self):
        """Convert error to dictionary for API responses"""
        return {
            'error': self.user_message,
            'service': self.service,
            'type': self.__class__.__name__
        }


class GoogleAuthenticationError(GoogleServiceError):
    """OAuth authentication/authorization errors"""
    
    def __init__(self, service: Optional[str] = None, technical_details: Optional[str] = None):
        user_message = (
            f"Your Google {service.title() if service else 'service'} connection has expired or been revoked. "
            "Please reconnect your account in Settings to continue using this feature."
        )
        super().__init__(user_message, technical_details, service)


class GooglePermissionError(GoogleServiceError):
    """Insufficient permissions errors"""
    
    def __init__(self, service: Optional[str] = None, required_scope: Optional[str] = None, technical_details: Optional[str] = None):
        if required_scope:
            user_message = (
                f"Insufficient permissions for Google {service.title() if service else 'service'}. "
                f"Please reconnect your account and grant {required_scope} access."
            )
        else:
            user_message = (
                f"Insufficient permissions for Google {service.title() if service else 'service'}. "
                "Please reconnect your account and grant the necessary permissions."
            )
        super().__init__(user_message, technical_details, service)


class GoogleRateLimitError(GoogleServiceError):
    """Rate limit exceeded errors"""
    
    def __init__(self, service: Optional[str] = None, retry_after: Optional[int] = None, technical_details: Optional[str] = None):
        if retry_after:
            user_message = (
                f"Google {service.title() if service else 'service'} rate limit exceeded. "
                f"Please try again in {retry_after} seconds."
            )
        else:
            user_message = (
                f"Google {service.title() if service else 'service'} rate limit exceeded. "
                "Please try again in a few moments."
            )
        super().__init__(user_message, technical_details, service)
        self.retry_after = retry_after


class GoogleQuotaExceededError(GoogleServiceError):
    """API quota exceeded errors"""
    
    def __init__(self, service: Optional[str] = None, technical_details: Optional[str] = None):
        user_message = (
            f"Google {service.title() if service else 'service'} daily quota exceeded. "
            "This feature will be available again tomorrow. Please contact support if this persists."
        )
        super().__init__(user_message, technical_details, service)


class GoogleNotFoundError(GoogleServiceError):
    """Resource not found errors"""
    
    def __init__(self, resource_type: str = "resource", service: Optional[str] = None, technical_details: Optional[str] = None):
        user_message = f"The requested {resource_type} was not found or has been deleted."
        super().__init__(user_message, technical_details, service)


class GoogleNetworkError(GoogleServiceError):
    """Network/connectivity errors"""
    
    def __init__(self, service: Optional[str] = None, technical_details: Optional[str] = None):
        user_message = (
            f"Unable to connect to Google {service.title() if service else 'services'}. "
            "Please check your internet connection and try again."
        )
        super().__init__(user_message, technical_details, service)


class GoogleConnectionUnavailableError(GoogleServiceError):
    """Service not connected errors"""
    
    def __init__(self, service: Optional[str] = None, technical_details: Optional[str] = None):
        user_message = (
            f"Google {service.title() if service else 'service'} is not connected. "
            "Please connect your account in Settings to use this feature."
        )
        super().__init__(user_message, technical_details, service)


class GoogleTokenRefreshError(GoogleServiceError):
    """Token refresh failures"""
    
    def __init__(self, service: Optional[str] = None, technical_details: Optional[str] = None):
        user_message = (
            f"Unable to refresh your Google {service.title() if service else 'service'} connection. "
            "Please reconnect your account in Settings."
        )
        super().__init__(user_message, technical_details, service)
