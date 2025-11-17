"""
Security Monitoring Service
Tracks failed login attempts, service failures, and security alerts.
"""

import redis
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from config import Config
import logging

logger = logging.getLogger(__name__)


class SecurityMonitor:
    """Service for monitoring security events and failures."""
    
    FAILED_LOGIN_KEY_PREFIX = 'security:failed_login:'
    FAILED_LOGIN_ALERT_KEY = 'security:failed_login_alerts'
    SERVICE_FAILURE_KEY = 'security:service_failures'
    RATE_LIMIT_KEY_PREFIX = 'security:rate_limit:'
    
    FAILED_LOGIN_THRESHOLD = 5
    FAILED_LOGIN_WINDOW = 600  # 10 minutes in seconds
    RATE_LIMIT_MAX = 100  # Max events per IP per hour
    RATE_LIMIT_WINDOW = 3600  # 1 hour in seconds
    
    def __init__(self):
        """Initialize security monitor with Redis connection."""
        try:
            self.redis_client = redis.Redis.from_url(Config.CELERY_BROKER_URL, decode_responses=True)
            self.redis_client.ping()
        except Exception as e:
            logger.error(f"Failed to connect to Redis for security monitoring: {e}")
            self.redis_client = None
    
    def log_failed_login(self, ip_address: str, username: str = None, service: str = 'dashboard') -> Dict[str, Any]:
        """
        Log a failed login attempt with rate limiting protection.
        
        Args:
            ip_address: IP address of the failed login
            username: Optional username that was attempted
            service: Service where login failed (default: dashboard)
            
        Returns:
            Dictionary with alert status and count
        """
        if not self.redis_client:
            return {'success': False, 'error': 'Redis unavailable'}
        
        try:
            timestamp = datetime.now()
            
            # Rate limiting: Check if IP has exceeded 100 events/hour
            rate_limit_key = f"{self.RATE_LIMIT_KEY_PREFIX}{ip_address}"
            cutoff_time = (timestamp - timedelta(seconds=self.RATE_LIMIT_WINDOW)).timestamp()
            
            # Remove old rate limit entries
            self.redis_client.zremrangebyscore(rate_limit_key, 0, cutoff_time)
            
            # Count events in the last hour
            event_count = self.redis_client.zcount(rate_limit_key, cutoff_time, timestamp.timestamp())
            
            # If rate limit exceeded, return early without logging
            if event_count >= self.RATE_LIMIT_MAX:
                logger.warning(
                    f"Rate limit exceeded for IP {ip_address}: {event_count} events in last hour",
                    extra={'ip': ip_address, 'count': event_count, 'limit': self.RATE_LIMIT_MAX}
                )
                return {
                    'success': False,
                    'error': 'Rate limit exceeded',
                    'count': event_count,
                    'limit': self.RATE_LIMIT_MAX
                }
            
            # Add to rate limit counter
            self.redis_client.zadd(rate_limit_key, {f"event_{timestamp.timestamp()}": timestamp.timestamp()})
            self.redis_client.expire(rate_limit_key, self.RATE_LIMIT_WINDOW)
            
            # Continue with normal failed login logging
            key = f"{self.FAILED_LOGIN_KEY_PREFIX}{ip_address}"
            
            # Store the failed login attempt
            attempt = {
                'ip': ip_address,
                'username': username,
                'service': service,
                'timestamp': timestamp.isoformat()
            }
            
            # Add to sorted set with timestamp as score
            self.redis_client.zadd(key, {json.dumps(attempt): timestamp.timestamp()})
            
            # Set expiration for cleanup (keep for 24 hours)
            self.redis_client.expire(key, 86400)
            
            # Remove old entries (older than 10 minutes)
            cutoff_time = (timestamp - timedelta(seconds=self.FAILED_LOGIN_WINDOW)).timestamp()
            self.redis_client.zremrangebyscore(key, 0, cutoff_time)
            
            # Get count in the last 10 minutes
            recent_count = self.redis_client.zcount(key, cutoff_time, timestamp.timestamp())
            
            # Check if threshold exceeded
            alert_triggered = recent_count >= self.FAILED_LOGIN_THRESHOLD
            
            if alert_triggered:
                # Store alert
                alert = {
                    'ip': ip_address,
                    'count': recent_count,
                    'first_attempt': timestamp.isoformat(),
                    'service': service,
                    'severity': 'high' if recent_count >= 10 else 'medium'
                }
                self.redis_client.zadd(
                    self.FAILED_LOGIN_ALERT_KEY,
                    {json.dumps(alert): timestamp.timestamp()}
                )
                self.redis_client.expire(self.FAILED_LOGIN_ALERT_KEY, 86400)
                
                logger.warning(
                    f"Security alert: {recent_count} failed login attempts from {ip_address}",
                    extra={'ip': ip_address, 'count': recent_count, 'service': service}
                )
            
            return {
                'success': True,
                'count': recent_count,
                'alert_triggered': alert_triggered,
                'threshold': self.FAILED_LOGIN_THRESHOLD
            }
            
        except Exception as e:
            logger.error(f"Error logging failed login: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_failed_login_alerts(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Get failed login alerts from the specified time period.
        
        Args:
            hours: Number of hours to look back (default: 24)
            
        Returns:
            List of failed login alerts
        """
        if not self.redis_client:
            return []
        
        try:
            cutoff = (datetime.now() - timedelta(hours=hours)).timestamp()
            
            # Get recent alerts
            alert_data = self.redis_client.zrangebyscore(
                self.FAILED_LOGIN_ALERT_KEY,
                cutoff,
                '+inf',
                withscores=True
            )
            
            alerts = []
            for data, score in alert_data:
                try:
                    alert = json.loads(data)
                    alert['timestamp'] = datetime.fromtimestamp(score).isoformat()
                    alerts.append(alert)
                except json.JSONDecodeError:
                    continue
            
            # Sort by timestamp (most recent first)
            alerts.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            return alerts
            
        except Exception as e:
            logger.error(f"Error getting failed login alerts: {e}")
            return []
    
    def get_failed_login_summary(self) -> Dict[str, Any]:
        """
        Get summary of failed login attempts.
        
        Returns:
            Summary statistics
        """
        if not self.redis_client:
            return {
                'total_alerts': 0,
                'unique_ips': 0,
                'recent_alerts': []
            }
        
        try:
            alerts = self.get_failed_login_alerts(hours=24)
            
            # Get unique IPs
            unique_ips = set(alert.get('ip') for alert in alerts)
            
            return {
                'total_alerts': len(alerts),
                'unique_ips': len(unique_ips),
                'recent_alerts': alerts[:10],  # Last 10 alerts
                'high_severity_count': sum(1 for a in alerts if a.get('severity') == 'high')
            }
            
        except Exception as e:
            logger.error(f"Error getting failed login summary: {e}")
            return {
                'total_alerts': 0,
                'unique_ips': 0,
                'recent_alerts': [],
                'error': str(e)
            }
    
    def log_service_failure(self, service_name: str, error_type: str, details: str = None) -> Dict[str, Any]:
        """
        Log a service health check failure.
        
        Args:
            service_name: Name of the service that failed
            error_type: Type of error (connection, timeout, ssl_error, etc.)
            details: Optional additional details
            
        Returns:
            Success status
        """
        if not self.redis_client:
            return {'success': False, 'error': 'Redis unavailable'}
        
        try:
            timestamp = datetime.now()
            
            failure = {
                'service': service_name,
                'error_type': error_type,
                'details': details,
                'timestamp': timestamp.isoformat()
            }
            
            # Add to sorted set
            self.redis_client.zadd(
                self.SERVICE_FAILURE_KEY,
                {json.dumps(failure): timestamp.timestamp()}
            )
            
            # Keep failures for 7 days
            self.redis_client.expire(self.SERVICE_FAILURE_KEY, 604800)
            
            # Remove old entries (older than 7 days)
            cutoff = (timestamp - timedelta(days=7)).timestamp()
            self.redis_client.zremrangebyscore(self.SERVICE_FAILURE_KEY, 0, cutoff)
            
            logger.warning(
                f"Service failure: {service_name} - {error_type}",
                extra={'service': service_name, 'error_type': error_type, 'details': details}
            )
            
            return {'success': True}
            
        except Exception as e:
            logger.error(f"Error logging service failure: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_service_failures(self, hours: int = 24) -> List[Dict[str, Any]]:
        """
        Get service failures from the specified time period.
        
        Args:
            hours: Number of hours to look back (default: 24)
            
        Returns:
            List of service failures
        """
        if not self.redis_client:
            return []
        
        try:
            cutoff = (datetime.now() - timedelta(hours=hours)).timestamp()
            
            failure_data = self.redis_client.zrangebyscore(
                self.SERVICE_FAILURE_KEY,
                cutoff,
                '+inf',
                withscores=True
            )
            
            failures = []
            for data, score in failure_data:
                try:
                    failure = json.loads(data)
                    failures.append(failure)
                except json.JSONDecodeError:
                    continue
            
            # Sort by timestamp (most recent first)
            failures.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            
            return failures
            
        except Exception as e:
            logger.error(f"Error getting service failures: {e}")
            return []
    
    def get_service_failure_summary(self) -> Dict[str, Any]:
        """
        Get summary of service failures.
        
        Returns:
            Summary statistics
        """
        if not self.redis_client:
            return {
                'total_failures': 0,
                'affected_services': 0,
                'recent_failures': []
            }
        
        try:
            failures = self.get_service_failures(hours=24)
            
            # Get unique services
            unique_services = set(f.get('service') for f in failures)
            
            # Group by service
            by_service = {}
            for failure in failures:
                service = failure.get('service')
                if service not in by_service:
                    by_service[service] = []
                by_service[service].append(failure)
            
            return {
                'total_failures': len(failures),
                'affected_services': len(unique_services),
                'recent_failures': failures[:10],  # Last 10 failures
                'by_service': {k: len(v) for k, v in by_service.items()}
            }
            
        except Exception as e:
            logger.error(f"Error getting service failure summary: {e}")
            return {
                'total_failures': 0,
                'affected_services': 0,
                'recent_failures': [],
                'error': str(e)
            }
    
    def clear_old_data(self) -> Dict[str, Any]:
        """
        Clear old security monitoring data.
        
        Returns:
            Summary of cleared data
        """
        if not self.redis_client:
            return {'success': False, 'error': 'Redis unavailable'}
        
        try:
            # Clear old failed login attempts (older than 24 hours)
            cutoff_24h = (datetime.now() - timedelta(hours=24)).timestamp()
            
            # Get all failed login keys
            keys = self.redis_client.keys(f"{self.FAILED_LOGIN_KEY_PREFIX}*")
            cleared_count = 0
            
            for key in keys:
                removed = self.redis_client.zremrangebyscore(key, 0, cutoff_24h)
                cleared_count += removed
            
            # Clear old service failures (older than 7 days)
            cutoff_7d = (datetime.now() - timedelta(days=7)).timestamp()
            service_cleared = self.redis_client.zremrangebyscore(
                self.SERVICE_FAILURE_KEY,
                0,
                cutoff_7d
            )
            
            return {
                'success': True,
                'failed_logins_cleared': cleared_count,
                'service_failures_cleared': service_cleared
            }
            
        except Exception as e:
            logger.error(f"Error clearing old data: {e}")
            return {'success': False, 'error': str(e)}


# Global instance
security_monitor = SecurityMonitor()
