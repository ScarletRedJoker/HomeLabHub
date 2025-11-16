"""Enhanced Domain Service - Database-backed domain management with full CRUD operations

This service replaces the hardcoded DOMAINS list with database-backed domain management.
Provides full CRUD operations, validation, health monitoring, and integration with
ZoneEdit DNS and Caddy reverse proxy.
"""

import logging
import ssl
import socket
import requests
import re
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
from urllib.parse import urlparse
import dns.resolver
import uuid

from models import (
    get_session, 
    DomainRecord, 
    DomainEvent, 
    DomainTask,
    RecordType,
    RecordStatus
)
from integrations.zoneedit_service import ZoneEditService
from integrations.caddy_service import CaddyService

logger = logging.getLogger(__name__)


class EnhancedDomainService:
    """Enhanced database-backed domain management service"""
    
    def __init__(self):
        """Initialize domain service with integrations"""
        self.zoneedit = ZoneEditService()
        self.caddy = CaddyService()
        self._enabled = self._check_configuration()
    
    def _check_configuration(self) -> bool:
        """Check if domain automation is configured"""
        if not self.zoneedit.enabled:
            logger.info("Domain automation disabled - ZoneEdit not configured")
            return False
        
        logger.info("Domain automation enabled")
        return True
    
    @property
    def enabled(self) -> bool:
        """Check if domain automation is available"""
        return self._enabled
    
    # ========================================================================
    # CRUD Operations
    # ========================================================================
    
    def create_domain(
        self,
        domain: str,
        subdomain: str,
        service_name: str,
        service_type: str,
        container_name: Optional[str] = None,
        port: Optional[int] = None,
        ssl_enabled: bool = True,
        auto_ssl: bool = True,
        auto_managed: bool = True,
        dns_provider: str = 'zoneedit',
        record_value: Optional[str] = None,
        notes: Optional[str] = None,
        created_by: str = 'user'
    ) -> Tuple[bool, Dict[str, Any]]:
        """Create a new domain record with validation
        
        Args:
            domain: Base domain (e.g., 'rig-city.com')
            subdomain: Subdomain part (e.g., 'api', '@' for root)
            service_name: Friendly service name
            service_type: Type (web, api, media, automation, static)
            container_name: Docker container name
            port: Internal port for reverse proxy
            ssl_enabled: Whether SSL/HTTPS is enabled
            auto_ssl: Automatic SSL certificate management
            auto_managed: Automatic DNS management
            dns_provider: DNS provider (zoneedit, cloudflare, etc.)
            record_value: IP address or target for DNS record
            notes: Optional notes
            created_by: User or system creating the domain
            
        Returns:
            Tuple of (success, result_dict)
        """
        session = None
        try:
            # Validate domain format
            is_valid, validation_msg = self.validate_domain_format(domain, subdomain)
            if not is_valid:
                logger.error(f"Domain validation failed: {validation_msg}")
                return False, {
                    'error': 'Validation failed',
                    'message': validation_msg
                }
            
            # Check for duplicates
            session = get_session()
            existing = session.query(DomainRecord).filter(
                DomainRecord.domain == domain,
                DomainRecord.subdomain == subdomain
            ).first()
            
            if existing:
                logger.warning(f"Domain already exists: {subdomain}.{domain}")
                return False, {
                    'error': 'Duplicate domain',
                    'message': f'Domain {subdomain}.{domain} already exists',
                    'existing_id': str(existing.id)
                }
            
            # Determine record value (IP address)
            if not record_value:
                record_value = self._get_public_ip()
                if not record_value:
                    logger.error("Failed to determine public IP address")
                    return False, {
                        'error': 'IP resolution failed',
                        'message': 'Could not determine public IP address'
                    }
            
            # Create domain record
            domain_record = DomainRecord(
                domain=domain,
                subdomain=subdomain,
                record_type=RecordType.A,
                record_value=record_value,
                service_name=service_name,
                service_type=service_type,
                container_name=container_name,
                port=port,
                ssl_enabled=ssl_enabled,
                auto_ssl=auto_ssl,
                auto_managed=auto_managed,
                dns_provider=dns_provider,
                status=RecordStatus.pending,
                provisioning_status='pending',
                notes=notes,
                ttl=3600,
                managed_by='automatic' if auto_managed else 'manual'
            )
            
            session.add(domain_record)
            session.commit()
            
            # Create audit event
            event = DomainEvent.create_event(
                event_type='created',
                event_category='domain',
                message=f'Created domain record for {subdomain}.{domain}',
                status='success',
                domain_record_id=domain_record.id,
                triggered_by=created_by,
                details={
                    'service_name': service_name,
                    'service_type': service_type,
                    'container_name': container_name,
                    'ssl_enabled': ssl_enabled,
                    'auto_managed': auto_managed
                }
            )
            session.add(event)
            session.commit()
            
            logger.info(f"Created domain record: {subdomain}.{domain} (ID: {domain_record.id})")
            
            result = domain_record.to_dict()
            result['full_domain'] = domain_record.full_domain
            
            return True, result
            
        except Exception as e:
            if session:
                session.rollback()
            logger.error(f"Failed to create domain: {e}")
            return False, {
                'error': 'Creation failed',
                'message': str(e)
            }
        finally:
            if session:
                session.close()
    
    def get_domain(self, domain_id: str) -> Tuple[bool, Dict[str, Any]]:
        """Get a domain record by ID
        
        Args:
            domain_id: UUID of domain record
            
        Returns:
            Tuple of (success, domain_dict)
        """
        session = None
        try:
            session = get_session()
            
            domain_record = session.query(DomainRecord).filter(
                DomainRecord.id == uuid.UUID(domain_id)
            ).first()
            
            if not domain_record:
                return False, {
                    'error': 'Not found',
                    'message': f'Domain with ID {domain_id} not found'
                }
            
            result = domain_record.to_dict()
            result['full_domain'] = domain_record.full_domain
            
            # Include recent events
            recent_events = session.query(DomainEvent).filter(
                DomainEvent.domain_record_id == domain_record.id
            ).order_by(DomainEvent.created_at.desc()).limit(10).all()
            
            result['recent_events'] = [event.to_dict() for event in recent_events]
            
            return True, result
            
        except Exception as e:
            logger.error(f"Failed to get domain: {e}")
            return False, {
                'error': 'Retrieval failed',
                'message': str(e)
            }
        finally:
            if session:
                session.close()
    
    def list_domains(
        self, 
        service_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[bool, Dict[str, Any]]:
        """List all domain records with optional filtering
        
        Args:
            service_type: Filter by service type
            status: Filter by provisioning status
            limit: Maximum number of records
            offset: Pagination offset
            
        Returns:
            Tuple of (success, result_dict)
        """
        session = None
        try:
            session = get_session()
            
            query = session.query(DomainRecord)
            
            if service_type:
                query = query.filter(DomainRecord.service_type == service_type)
            
            if status:
                query = query.filter(DomainRecord.provisioning_status == status)
            
            total_count = query.count()
            
            domains = query.order_by(DomainRecord.domain, DomainRecord.subdomain)\
                           .limit(limit)\
                           .offset(offset)\
                           .all()
            
            results = []
            for domain in domains:
                domain_dict = domain.to_dict()
                domain_dict['full_domain'] = domain.full_domain
                results.append(domain_dict)
            
            return True, {
                'domains': results,
                'total': total_count,
                'limit': limit,
                'offset': offset
            }
            
        except Exception as e:
            logger.error(f"Failed to list domains: {e}")
            return False, {
                'error': 'List failed',
                'message': str(e),
                'domains': [],
                'total': 0
            }
        finally:
            if session:
                session.close()
    
    def update_domain(
        self,
        domain_id: str,
        updates: Dict[str, Any],
        updated_by: str = 'user'
    ) -> Tuple[bool, Dict[str, Any]]:
        """Update a domain record
        
        Args:
            domain_id: UUID of domain record
            updates: Dictionary of fields to update
            updated_by: User or system updating the domain
            
        Returns:
            Tuple of (success, updated_domain_dict)
        """
        session = None
        try:
            session = get_session()
            
            domain_record = session.query(DomainRecord).filter(
                DomainRecord.id == uuid.UUID(domain_id)
            ).first()
            
            if not domain_record:
                return False, {
                    'error': 'Not found',
                    'message': f'Domain with ID {domain_id} not found'
                }
            
            # Track what changed
            changes = {}
            
            # Update allowed fields
            allowed_fields = [
                'service_name', 'service_type', 'container_name', 'port',
                'ssl_enabled', 'auto_ssl', 'health_check_url', 'health_check_interval',
                'notes', 'record_value', 'ttl'
            ]
            
            for field in allowed_fields:
                if field in updates:
                    old_value = getattr(domain_record, field)
                    new_value = updates[field]
                    if old_value != new_value:
                        changes[field] = {'old': old_value, 'new': new_value}
                        setattr(domain_record, field, new_value)
            
            if not changes:
                return False, {
                    'error': 'No changes',
                    'message': 'No fields were updated'
                }
            
            session.commit()
            
            # Create audit event
            event = DomainEvent.create_event(
                event_type='updated',
                event_category='domain',
                message=f'Updated domain record for {domain_record.full_domain}',
                status='success',
                domain_record_id=domain_record.id,
                triggered_by=updated_by,
                details={'changes': changes}
            )
            session.add(event)
            session.commit()
            
            logger.info(f"Updated domain: {domain_record.full_domain} (ID: {domain_id})")
            
            result = domain_record.to_dict()
            result['full_domain'] = domain_record.full_domain
            result['changes'] = changes
            
            return True, result
            
        except Exception as e:
            if session:
                session.rollback()
            logger.error(f"Failed to update domain: {e}")
            return False, {
                'error': 'Update failed',
                'message': str(e)
            }
        finally:
            if session:
                session.close()
    
    def delete_domain(
        self,
        domain_id: str,
        deleted_by: str = 'user'
    ) -> Tuple[bool, Dict[str, Any]]:
        """Delete a domain record
        
        Args:
            domain_id: UUID of domain record
            deleted_by: User or system deleting the domain
            
        Returns:
            Tuple of (success, result_dict)
        """
        session = None
        try:
            session = get_session()
            
            domain_record = session.query(DomainRecord).filter(
                DomainRecord.id == uuid.UUID(domain_id)
            ).first()
            
            if not domain_record:
                return False, {
                    'error': 'Not found',
                    'message': f'Domain with ID {domain_id} not found'
                }
            
            full_domain = domain_record.full_domain
            
            # Create final audit event before deletion
            event = DomainEvent.create_event(
                event_type='deleted',
                event_category='domain',
                message=f'Deleted domain record for {full_domain}',
                status='success',
                domain_record_id=domain_record.id,
                triggered_by=deleted_by,
                details=domain_record.to_dict()
            )
            session.add(event)
            session.commit()
            
            # Delete the record (cascade will delete related events and tasks)
            session.delete(domain_record)
            session.commit()
            
            logger.info(f"Deleted domain: {full_domain} (ID: {domain_id})")
            
            return True, {
                'message': f'Successfully deleted domain {full_domain}',
                'deleted_domain': full_domain
            }
            
        except Exception as e:
            if session:
                session.rollback()
            logger.error(f"Failed to delete domain: {e}")
            return False, {
                'error': 'Deletion failed',
                'message': str(e)
            }
        finally:
            if session:
                session.close()
    
    # ========================================================================
    # Validation
    # ========================================================================
    
    def validate_domain_format(
        self, 
        domain: str, 
        subdomain: str
    ) -> Tuple[bool, str]:
        """Validate domain and subdomain format
        
        Args:
            domain: Base domain
            subdomain: Subdomain part
            
        Returns:
            Tuple of (is_valid, message)
        """
        # Validate domain format
        domain_pattern = r'^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
        if not re.match(domain_pattern, domain):
            return False, f'Invalid domain format: {domain}'
        
        # Validate subdomain format
        if subdomain and subdomain != '@':
            subdomain_pattern = r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$'
            if not re.match(subdomain_pattern, subdomain):
                return False, f'Invalid subdomain format: {subdomain}'
        
        return True, 'Valid'
    
    # ========================================================================
    # Health Monitoring (from original DomainService)
    # ========================================================================
    
    def check_domain_health(self, domain_id: str) -> Tuple[bool, Dict[str, Any]]:
        """Check health of a single domain by ID
        
        Args:
            domain_id: UUID of domain record
            
        Returns:
            Tuple of (success, health_dict)
        """
        session = None
        try:
            session = get_session()
            
            domain_record = session.query(DomainRecord).filter(
                DomainRecord.id == uuid.UUID(domain_id)
            ).first()
            
            if not domain_record:
                return False, {'error': 'Domain not found'}
            
            full_domain = domain_record.full_domain
            url = f"https://{full_domain}" if domain_record.ssl_enabled else f"http://{full_domain}"
            
            result = {
                'domain_id': str(domain_record.id),
                'full_domain': full_domain,
                'url': url,
                'service_name': domain_record.service_name,
                'service_type': domain_record.service_type,
                'container_name': domain_record.container_name,
                'status': 'unknown',
                'status_code': None,
                'response_time': None,
                'ssl_valid': False,
                'ssl_expires': None,
                'ssl_days_remaining': None,
                'dns_resolved': False,
                'dns_ip': None,
                'error': None
            }
            
            # DNS check
            dns_result = self._check_dns(full_domain)
            result['dns_resolved'] = dns_result['resolved']
            result['dns_ip'] = dns_result.get('ip')
            
            # HTTP health check
            start_time = datetime.now()
            try:
                response = requests.get(url, timeout=10, verify=True, allow_redirects=True)
                response_time = (datetime.now() - start_time).total_seconds()
                
                result['status'] = 'online'
                result['status_code'] = response.status_code
                result['response_time'] = round(response_time * 1000, 2)
                
                # SSL certificate check
                if domain_record.ssl_enabled:
                    ssl_info = self._check_ssl(full_domain)
                    result['ssl_valid'] = ssl_info['valid']
                    result['ssl_expires'] = ssl_info.get('expires')
                    result['ssl_days_remaining'] = ssl_info.get('days_remaining')
                    
            except requests.exceptions.SSLError:
                result['status'] = 'ssl_error'
                result['error'] = 'SSL certificate invalid or expired'
            except requests.exceptions.ConnectionError:
                result['status'] = 'offline'
                result['error'] = 'Connection failed'
            except requests.exceptions.Timeout:
                result['status'] = 'timeout'
                result['error'] = 'Request timed out'
            except Exception as e:
                result['status'] = 'error'
                result['error'] = str(e)
            
            # Update domain record with health status
            domain_record.health_status = result['status']
            domain_record.last_health_check = datetime.utcnow()
            domain_record.last_health_check_at = datetime.utcnow()
            if result['response_time']:
                domain_record.response_time_ms = int(result['response_time'])
            
            # Update SSL tracking fields
            if result.get('ssl_valid') and result.get('ssl_expires'):
                try:
                    ssl_expires = datetime.fromisoformat(result['ssl_expires'].replace('Z', '+00:00'))
                    domain_record.ssl_expiry_date = ssl_expires
                    domain_record.ssl_days_remaining = result.get('ssl_days_remaining')
                    domain_record.ssl_issuer = result.get('ssl_issuer', 'Unknown')
                    domain_record.last_ssl_check = datetime.utcnow()
                except Exception as e:
                    logger.warning(f"Failed to parse SSL expiry date: {e}")
            
            session.commit()
            
            return True, result
            
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False, {'error': str(e)}
        finally:
            if session:
                session.close()
    
    @staticmethod
    def _check_dns(hostname: str) -> Dict[str, Any]:
        """Check DNS resolution for a hostname"""
        try:
            answers = dns.resolver.resolve(hostname, 'A')
            ips = [str(rdata) for rdata in answers]
            return {
                'resolved': True,
                'ip': ips[0] if ips else None,
                'all_ips': ips
            }
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.Timeout):
            return {'resolved': False, 'ip': None}
    
    @staticmethod
    def _check_ssl(hostname: str, port: int = 443) -> Dict[str, Any]:
        """Check SSL certificate for a hostname"""
        try:
            context = ssl.create_default_context()
            with socket.create_connection((hostname, port), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    
                    if not cert:
                        return {'valid': False, 'error': 'No certificate found'}
                    
                    expires_str = cert.get('notAfter', '')
                    if not expires_str:
                        return {'valid': False, 'error': 'No expiration date found'}
                    
                    expires_date = datetime.strptime(str(expires_str), '%b %d %H:%M:%S %Y %Z')
                    days_remaining = (expires_date - datetime.now()).days
                    
                    issuer_dict = {}
                    subject_dict = {}
                    
                    issuer = cert.get('issuer')
                    if issuer:
                        for item in issuer:
                            if isinstance(item, tuple) and len(item) > 0:
                                key_val = item[0]
                                if isinstance(key_val, tuple) and len(key_val) == 2:
                                    issuer_dict[key_val[0]] = key_val[1]
                    
                    subject = cert.get('subject')
                    if subject:
                        for item in subject:
                            if isinstance(item, tuple) and len(item) > 0:
                                key_val = item[0]
                                if isinstance(key_val, tuple) and len(key_val) == 2:
                                    subject_dict[key_val[0]] = key_val[1]
                    
                    return {
                        'valid': True,
                        'expires': expires_date.isoformat(),
                        'days_remaining': days_remaining,
                        'issuer': issuer_dict,
                        'subject': subject_dict
                    }
        except Exception as e:
            return {
                'valid': False,
                'error': str(e)
            }
    
    @staticmethod
    def _get_public_ip() -> Optional[str]:
        """Get public IP address"""
        try:
            response = requests.get('https://api.ipify.org?format=json', timeout=5)
            if response.status_code == 200:
                return response.json().get('ip')
        except Exception as e:
            logger.error(f"Failed to get public IP: {e}")
        return None
    
    def check_all_domains_health(self) -> Tuple[bool, Dict[str, Any]]:
        """Check health of all domains in database
        
        Returns:
            Tuple of (success, summary_dict)
        """
        session = None
        try:
            session = get_session()
            
            all_domains = session.query(DomainRecord).all()
            
            results = []
            for domain in all_domains:
                success, health = self.check_domain_health(str(domain.id))
                if success:
                    results.append(health)
            
            summary = {
                'total': len(results),
                'online': sum(1 for r in results if r['status'] == 'online'),
                'offline': sum(1 for r in results if r['status'] == 'offline'),
                'errors': sum(1 for r in results if r['status'] in ['error', 'ssl_error', 'timeout']),
                'ssl_expiring_soon': sum(1 for r in results if r.get('ssl_days_remaining', 999) < 30),
                'avg_response_time': None,
                'domains': results
            }
            
            response_times = [r['response_time'] for r in results if r['response_time']]
            if response_times:
                summary['avg_response_time'] = round(sum(response_times) / len(response_times), 2)
            
            return True, summary
            
        except Exception as e:
            logger.error(f"Failed to check all domains: {e}")
            return False, {'error': str(e), 'domains': []}
        finally:
            if session:
                session.close()
