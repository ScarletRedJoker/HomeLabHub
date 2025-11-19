"""
Health Monitoring Service
Polls all service health endpoints and stores results in database
"""
import logging
import time
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from sqlalchemy import desc, and_
from sqlalchemy.orm import Session
from models import get_session
from models.health_check import ServiceHealthCheck, ServiceHealthAlert

logger = logging.getLogger(__name__)

class HealthMonitorService:
    """
    Monitors health of all homelab services by polling their health endpoints
    """
    
    # Service configurations with health endpoint URLs
    SERVICES = {
        'stream-bot': {
            'url': 'http://stream-bot:5000/health',
            'critical': True,  # Service is critical to homelab operation
        },
        'discord-bot': {
            'url': 'http://discord-bot:5000/health',
            'critical': True,
        },
        'dashboard': {
            'url': 'http://homelab-dashboard:5000/api/health',
            'critical': True,
        },
        'postgres': {
            'url': None,  # Database check is internal, not HTTP
            'critical': True,
        },
        'redis': {
            'url': None,  # Redis check is internal, not HTTP
            'critical': True,
        },
        'minio': {
            'url': 'http://minio:9000/minio/health/live',
            'critical': False,
        },
    }
    
    def __init__(self):
        self.running = False
        self.check_interval = 30  # seconds
    
    def check_service_health(self, service_name: str, service_config: Dict) -> Dict:
        """
        Check health of a single service
        
        Args:
            service_name: Name of the service
            service_config: Service configuration with URL
            
        Returns:
            Dict with health check results
        """
        url = service_config.get('url')
        if not url:
            # Services without HTTP endpoints are checked differently
            return self._check_internal_service(service_name)
        
        start_time = time.time()
        
        try:
            response = requests.get(url, timeout=5)
            response_time_ms = int((time.time() - start_time) * 1000)
            
            if response.status_code == 200:
                data = response.json()
                return {
                    'service_name': service_name,
                    'status': data.get('status', 'healthy'),
                    'checks': data.get('checks', {}),
                    'response_time_ms': response_time_ms,
                    'timestamp': datetime.utcnow()
                }
            else:
                return {
                    'service_name': service_name,
                    'status': 'unhealthy',
                    'checks': {'http_status': response.status_code},
                    'response_time_ms': response_time_ms,
                    'timestamp': datetime.utcnow()
                }
        except requests.exceptions.Timeout:
            return {
                'service_name': service_name,
                'status': 'unhealthy',
                'checks': {'error': 'timeout'},
                'response_time_ms': None,
                'timestamp': datetime.utcnow()
            }
        except requests.exceptions.ConnectionError:
            return {
                'service_name': service_name,
                'status': 'unknown',
                'checks': {'error': 'connection_refused'},
                'response_time_ms': None,
                'timestamp': datetime.utcnow()
            }
        except Exception as e:
            logger.error(f"Error checking health of {service_name}: {e}")
            return {
                'service_name': service_name,
                'status': 'unknown',
                'checks': {'error': str(e)},
                'response_time_ms': None,
                'timestamp': datetime.utcnow()
            }
    
    def _check_internal_service(self, service_name: str) -> Dict:
        """
        Check health of internal services (database, redis) without HTTP endpoints
        
        Args:
            service_name: Name of the service
            
        Returns:
            Dict with health check results
        """
        try:
            if service_name == 'postgres':
                from models import get_engine
                engine = get_engine()
                with engine.connect() as conn:
                    conn.execute("SELECT 1")
                return {
                    'service_name': service_name,
                    'status': 'healthy',
                    'checks': {'connectivity': 'ok'},
                    'response_time_ms': 0,
                    'timestamp': datetime.utcnow()
                }
            elif service_name == 'redis':
                import redis
                import os
                redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')
                redis_client = redis.from_url(redis_url)
                redis_client.ping()
                return {
                    'service_name': service_name,
                    'status': 'healthy',
                    'checks': {'connectivity': 'ok'},
                    'response_time_ms': 0,
                    'timestamp': datetime.utcnow()
                }
            else:
                return {
                    'service_name': service_name,
                    'status': 'unknown',
                    'checks': {'error': 'no_health_check'},
                    'response_time_ms': None,
                    'timestamp': datetime.utcnow()
                }
        except Exception as e:
            logger.error(f"Error checking internal service {service_name}: {e}")
            return {
                'service_name': service_name,
                'status': 'unhealthy',
                'checks': {'error': str(e)},
                'response_time_ms': None,
                'timestamp': datetime.utcnow()
            }
    
    def store_health_check(self, health_data: Dict, session: Session):
        """
        Store health check result in database
        
        Args:
            health_data: Health check result data
            session: Database session
        """
        health_check = ServiceHealthCheck(
            service_name=health_data['service_name'],
            status=health_data['status'],
            checks=health_data['checks'],
            response_time_ms=health_data['response_time_ms'],
            timestamp=health_data['timestamp']
        )
        session.add(health_check)
        session.commit()
    
    def check_and_create_alerts(self, health_data: Dict, session: Session):
        """
        Check if health status warrants an alert and create if needed
        
        Args:
            health_data: Health check result data
            session: Database session
        """
        service_name = health_data['service_name']
        status = health_data['status']
        service_config = self.SERVICES.get(service_name, {})
        is_critical = service_config.get('critical', False)
        
        # Check for active alerts for this service
        active_alert = session.query(ServiceHealthAlert).filter(
            and_(
                ServiceHealthAlert.service_name == service_name,
                ServiceHealthAlert.status == 'active'
            )
        ).first()
        
        if status == 'unhealthy':
            # Create critical alert if service is unhealthy
            if not active_alert:
                severity = 'critical' if is_critical else 'warning'
                message = f"Service {service_name} is unhealthy"
                checks = health_data.get('checks', {})
                if 'error' in checks:
                    message += f": {checks['error']}"
                
                alert = ServiceHealthAlert(
                    service_name=service_name,
                    severity=severity,
                    message=message,
                    status='active'
                )
                session.add(alert)
                session.commit()
                logger.warning(f"Created {severity} alert for {service_name}")
        
        elif status == 'degraded':
            # Create warning alert if service is degraded
            if not active_alert:
                alert = ServiceHealthAlert(
                    service_name=service_name,
                    severity='warning',
                    message=f"Service {service_name} is degraded",
                    status='active'
                )
                session.add(alert)
                session.commit()
                logger.warning(f"Created warning alert for {service_name}")
        
        elif status == 'healthy':
            # Resolve active alert if service is now healthy
            if active_alert:
                active_alert.status = 'resolved'
                active_alert.resolved_at = datetime.utcnow()
                session.commit()
                logger.info(f"Resolved alert for {service_name}")
    
    def poll_all_services(self):
        """
        Poll all configured services and store results
        """
        logger.info("Polling health of all services...")
        session = get_session()
        
        try:
            for service_name, service_config in self.SERVICES.items():
                health_data = self.check_service_health(service_name, service_config)
                self.store_health_check(health_data, session)
                self.check_and_create_alerts(health_data, session)
                logger.debug(f"Health check for {service_name}: {health_data['status']}")
        except Exception as e:
            logger.error(f"Error during health polling: {e}")
        finally:
            session.close()
    
    def get_service_uptime(self, service_name: str, hours: int = 24) -> float:
        """
        Calculate service uptime percentage over the last N hours
        
        Args:
            service_name: Name of the service
            hours: Number of hours to look back
            
        Returns:
            Uptime percentage (0-100)
        """
        session = get_session()
        try:
            cutoff_time = datetime.utcnow() - timedelta(hours=hours)
            
            checks = session.query(ServiceHealthCheck).filter(
                and_(
                    ServiceHealthCheck.service_name == service_name,
                    ServiceHealthCheck.timestamp >= cutoff_time
                )
            ).all()
            
            if not checks:
                return 0.0
            
            healthy_count = sum(1 for check in checks if check.status == 'healthy')
            uptime_percentage = (healthy_count / len(checks)) * 100
            
            return round(uptime_percentage, 2)
        finally:
            session.close()
    
    def start(self):
        """Start the health monitoring service"""
        logger.info("Starting health monitoring service...")
        self.running = True
        
        while self.running:
            try:
                self.poll_all_services()
                time.sleep(self.check_interval)
            except KeyboardInterrupt:
                logger.info("Health monitoring service interrupted")
                self.stop()
                break
            except Exception as e:
                logger.error(f"Error in health monitoring loop: {e}")
                time.sleep(self.check_interval)
    
    def stop(self):
        """Stop the health monitoring service"""
        logger.info("Stopping health monitoring service...")
        self.running = False

# Global instance
health_monitor = HealthMonitorService()
