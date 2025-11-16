"""
DynDNS Worker - Celery tasks for automatic DNS updates
"""

import logging
from celery import shared_task
from datetime import datetime
from typing import Dict, Any
from models import get_session, DynDNSHost
from services.dns_service import LocalDNSService

logger = logging.getLogger(__name__)


@shared_task(bind=True, name='update_dyndns_hosts', max_retries=3)
def update_dyndns_hosts(self) -> Dict[str, Any]:
    """
    Celery periodic task to update DynDNS hosts
    Runs every 5 minutes (configured in celery_app.py)
    
    - Checks external IP address
    - Updates PowerDNS records if IP changed
    - Updates DynDNSHost model with status
    
    Returns:
        Dictionary with update summary
    """
    try:
        logger.info("Starting DynDNS update task")
        
        dns_service = LocalDNSService()
        
        # Get current external IP
        current_ip = dns_service.get_current_external_ip()
        
        if not current_ip:
            logger.error("Failed to detect external IP address")
            return {
                'success': False,
                'error': 'Failed to detect external IP',
                'hosts_checked': 0,
                'hosts_updated': 0
            }
        
        logger.info(f"Current external IP: {current_ip}")
        
        # Get all enabled DynDNS hosts
        session = get_session()
        try:
            hosts = session.query(DynDNSHost).filter_by(enabled=True).all()
            
            if not hosts:
                logger.info("No enabled DynDNS hosts to update")
                return {
                    'success': True,
                    'message': 'No enabled DynDNS hosts',
                    'current_ip': current_ip,
                    'hosts_checked': 0,
                    'hosts_updated': 0
                }
            
            logger.info(f"Checking {len(hosts)} DynDNS hosts")
            
            hosts_checked = 0
            hosts_updated = 0
            update_results = []
            
            for host in hosts:
                hosts_checked += 1
                result = {
                    'fqdn': host.fqdn,
                    'previous_ip': host.last_ip,
                    'current_ip': current_ip,
                    'updated': False,
                    'error': None
                }
                
                try:
                    # Check if IP changed
                    if host.last_ip != current_ip:
                        logger.info(f"IP changed for {host.fqdn}: {host.last_ip} -> {current_ip}")
                        
                        # Update DNS record
                        success, message = dns_service.update_dyndns_record(host.fqdn, current_ip)
                        
                        if success:
                            # Update model
                            host.last_ip = current_ip
                            host.failure_count = 0
                            host.last_checked_at = datetime.utcnow()
                            host.updated_at = datetime.utcnow()
                            session.commit()
                            
                            hosts_updated += 1
                            result['updated'] = True
                            logger.info(f"Successfully updated {host.fqdn} to {current_ip}")
                        else:
                            # Update failed
                            host.failure_count += 1
                            host.last_checked_at = datetime.utcnow()
                            session.commit()
                            
                            result['error'] = message
                            logger.error(f"Failed to update {host.fqdn}: {message}")
                            
                            # Disable host after 5 consecutive failures
                            if host.failure_count >= 5:
                                host.enabled = False
                                session.commit()
                                logger.warning(f"Disabled {host.fqdn} after {host.failure_count} failures")
                    else:
                        # IP unchanged, just update last_checked_at
                        host.last_checked_at = datetime.utcnow()
                        session.commit()
                        logger.debug(f"IP unchanged for {host.fqdn}: {current_ip}")
                    
                    update_results.append(result)
                    
                except Exception as e:
                    logger.error(f"Error updating {host.fqdn}: {e}")
                    host.failure_count += 1
                    host.last_checked_at = datetime.utcnow()
                    session.commit()
                    
                    result['error'] = str(e)
                    update_results.append(result)
            
            summary = {
                'success': True,
                'current_ip': current_ip,
                'hosts_checked': hosts_checked,
                'hosts_updated': hosts_updated,
                'results': update_results,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            logger.info(f"DynDNS update complete: {hosts_updated}/{hosts_checked} hosts updated")
            return summary
            
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"DynDNS update task failed: {e}", exc_info=True)
        
        # Retry on failure
        if self.request.retries < self.max_retries:
            raise self.retry(exc=e, countdown=60)
        
        return {
            'success': False,
            'error': str(e),
            'hosts_checked': 0,
            'hosts_updated': 0
        }


@shared_task(bind=True, name='check_dyndns_health')
def check_dyndns_health(self) -> Dict[str, Any]:
    """
    Check health of all DynDNS hosts
    Useful for monitoring and alerting
    
    Returns:
        Health status summary
    """
    try:
        session = get_session()
        try:
            all_hosts = session.query(DynDNSHost).all()
            enabled_hosts = [h for h in all_hosts if h.enabled]
            
            # Check for hosts with high failure counts
            failing_hosts = [
                {
                    'fqdn': h.fqdn,
                    'failure_count': h.failure_count,
                    'last_checked': h.last_checked_at.isoformat() if h.last_checked_at else None
                }
                for h in enabled_hosts if h.failure_count > 0
            ]
            
            # Check DNS service health
            dns_service = LocalDNSService()
            dns_health = dns_service.health_check()
            
            return {
                'success': True,
                'total_hosts': len(all_hosts),
                'enabled_hosts': len(enabled_hosts),
                'disabled_hosts': len(all_hosts) - len(enabled_hosts),
                'failing_hosts': failing_hosts,
                'failing_count': len(failing_hosts),
                'dns_service_healthy': dns_health.get('healthy', False),
                'dns_service_status': dns_health,
                'timestamp': datetime.utcnow().isoformat()
            }
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"DynDNS health check failed: {e}")
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }
