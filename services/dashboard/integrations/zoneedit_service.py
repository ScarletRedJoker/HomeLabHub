"""ZoneEdit DNS Integration Service

This module provides integration with ZoneEdit DNS API for:
- DNS record health checks
- Domain status monitoring
- HMAC authenticated API calls with exponential backoff
"""

import logging
import hashlib
import hmac
import time
import os
import requests
from typing import Dict, Optional, Tuple, List
from datetime import datetime, timedelta
import subprocess

logger = logging.getLogger(__name__)


class ZoneEditService:
    """ZoneEdit DNS API integration with HMAC authentication"""
    
    def __init__(self):
        """Initialize ZoneEdit service with credentials from environment"""
        self.username = os.getenv('ZONEEDIT_USERNAME', '')
        self.password = os.getenv('ZONEEDIT_PASSWORD', '')
        self.api_token = os.getenv('ZONEEDIT_API_TOKEN', '')
        self._enabled = bool(self.username and (self.password or self.api_token))
        
        if not self._enabled:
            logger.warning("ZoneEdit service not configured - DNS automation disabled. Set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD or ZONEEDIT_API_TOKEN")
        else:
            logger.info("ZoneEdit service initialized successfully")
        
        self.api_base = "https://api.zoneedit.com/v2"
        
        self.max_retries = 3
        self.initial_backoff = 1
        
        self._last_request_time = 0
        self._min_request_interval = 2
        
        self._public_ip_cache = None
        self._public_ip_cache_time = None
        self._public_ip_cache_duration = 300
    
    @property
    def enabled(self) -> bool:
        """Check if ZoneEdit service is available"""
        return self._enabled
    
    def _rate_limit(self):
        """Enforce minimum time between requests"""
        now = time.time()
        elapsed = now - self._last_request_time
        
        if elapsed < self._min_request_interval:
            sleep_time = self._min_request_interval - elapsed
            logger.debug(f"Rate limiting: sleeping {sleep_time:.2f}s")
            time.sleep(sleep_time)
        
        self._last_request_time = time.time()
    
    def _exponential_backoff(self, attempt: int) -> float:
        """Calculate exponential backoff delay
        
        Args:
            attempt: Retry attempt number (0-indexed)
            
        Returns:
            Sleep time in seconds
        """
        return self.initial_backoff * (2 ** attempt)
    
    def _generate_hmac(self, message: str) -> str:
        """Generate HMAC signature for API authentication
        
        Args:
            message: Message to sign
            
        Returns:
            HMAC signature as hex string
        """
        if not self.api_token:
            logger.warning("No API token configured for HMAC")
            return ""
        
        signature = hmac.new(
            self.api_token.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return signature
    
    def check_dns_record(self, domain: str, subdomain: Optional[str] = None) -> Tuple[bool, Dict]:
        """Query DNS record via API or dig
        
        Args:
            domain: Domain name to check
            subdomain: Optional subdomain
            
        Returns:
            Tuple of (success, result_dict)
        """
        full_domain = f"{subdomain}.{domain}" if subdomain else domain
        
        logger.info(f"Checking DNS record for {full_domain}")
        
        for attempt in range(self.max_retries):
            try:
                self._rate_limit()
                
                result = subprocess.run(
                    ['dig', '+short', full_domain, '@8.8.8.8'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.returncode == 0 and result.stdout.strip():
                    ip_addresses = [
                        line.strip() 
                        for line in result.stdout.strip().split('\n')
                        if line.strip()
                    ]
                    
                    logger.info(f"DNS record found for {full_domain}: {ip_addresses}")
                    
                    return True, {
                        'domain': full_domain,
                        'records': ip_addresses,
                        'record_count': len(ip_addresses),
                        'status': 'active',
                        'checked_at': datetime.utcnow().isoformat()
                    }
                else:
                    logger.warning(f"No DNS records found for {full_domain}")
                    return False, {
                        'domain': full_domain,
                        'records': [],
                        'record_count': 0,
                        'status': 'no_records',
                        'checked_at': datetime.utcnow().isoformat()
                    }
                    
            except subprocess.TimeoutExpired:
                logger.error(f"DNS query timeout for {full_domain} (attempt {attempt + 1})")
                if attempt < self.max_retries - 1:
                    backoff = self._exponential_backoff(attempt)
                    logger.info(f"Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue
                    
            except Exception as e:
                logger.error(f"DNS check failed for {full_domain}: {e}")
                if attempt < self.max_retries - 1:
                    backoff = self._exponential_backoff(attempt)
                    logger.info(f"Retrying in {backoff}s...")
                    time.sleep(backoff)
                    continue
        
        return False, {
            'domain': full_domain,
            'records': [],
            'record_count': 0,
            'status': 'error',
            'error': f'Failed after {self.max_retries} attempts',
            'checked_at': datetime.utcnow().isoformat()
        }
    
    def get_dns_health(self) -> Dict:
        """Get health status of all monitored domains
        
        Returns:
            Dictionary with health status of all domains
        """
        logger.info("Checking DNS health for all domains")
        
        domains_to_check = [
            ('rig-city.com', None),
            ('rig-city.com', 'www'),
            ('rig-city.com', 'api'),
            ('scarletredjoker.com', None),
            ('scarletredjoker.com', 'www'),
        ]
        
        health_status = {
            'timestamp': datetime.utcnow().isoformat(),
            'domains': {},
            'summary': {
                'total': len(domains_to_check),
                'healthy': 0,
                'unhealthy': 0,
                'errors': 0
            }
        }
        
        for domain, subdomain in domains_to_check:
            full_domain = f"{subdomain}.{domain}" if subdomain else domain
            
            success, result = self.check_dns_record(domain, subdomain)
            
            health_status['domains'][full_domain] = {
                'status': 'healthy' if success else 'unhealthy',
                'details': result
            }
            
            if success:
                health_status['summary']['healthy'] += 1
            elif result.get('status') == 'error':
                health_status['summary']['errors'] += 1
            else:
                health_status['summary']['unhealthy'] += 1
        
        logger.info(
            f"DNS health check complete: "
            f"{health_status['summary']['healthy']}/{health_status['summary']['total']} healthy"
        )
        
        return health_status
    
    def verify_zoneedit_nameservers(self, domain: str) -> Tuple[bool, Dict]:
        """Verify domain is using ZoneEdit nameservers
        
        Args:
            domain: Domain to check
            
        Returns:
            Tuple of (using_zoneedit, nameserver_info)
        """
        logger.info(f"Checking nameservers for {domain}")
        
        try:
            result = subprocess.run(
                ['dig', '+short', 'NS', domain],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                nameservers = [
                    ns.strip().rstrip('.')
                    for ns in result.stdout.strip().split('\n')
                    if ns.strip()
                ]
                
                zoneedit_ns = [
                    ns for ns in nameservers
                    if 'zoneedit' in ns.lower()
                ]
                
                using_zoneedit = len(zoneedit_ns) > 0
                
                logger.info(
                    f"Domain {domain} nameservers: {nameservers} "
                    f"(ZoneEdit: {using_zoneedit})"
                )
                
                return using_zoneedit, {
                    'domain': domain,
                    'nameservers': nameservers,
                    'zoneedit_nameservers': zoneedit_ns,
                    'using_zoneedit': using_zoneedit,
                    'checked_at': datetime.utcnow().isoformat()
                }
            
        except Exception as e:
            logger.error(f"Nameserver check failed for {domain}: {e}")
        
        return False, {
            'domain': domain,
            'error': 'Failed to query nameservers',
            'checked_at': datetime.utcnow().isoformat()
        }
    
    def authenticate(self) -> Tuple[bool, Dict]:
        """Authenticate with ZoneEdit API by testing list_zones endpoint
        
        Returns:
            Tuple of (success, auth_info)
        """
        logger.info("Authenticating with ZoneEdit API")
        
        if not self.username or not self.password:
            logger.error("ZoneEdit credentials not configured")
            return False, {
                'error': 'Missing credentials',
                'message': 'ZONEEDIT_USERNAME or ZONEEDIT_PASSWORD not set'
            }
        
        try:
            auth = (self.username, self.password)
            
            response = requests.get(
                f"{self.api_base}/zones",
                auth=auth,
                timeout=10
            )
            
            if response.status_code == 200:
                logger.info("ZoneEdit authentication successful")
                return True, {
                    'authenticated': True,
                    'username': self.username,
                    'timestamp': datetime.utcnow().isoformat()
                }
            else:
                logger.error(f"ZoneEdit authentication failed: {response.status_code}")
                return False, {
                    'error': 'Authentication failed',
                    'status_code': response.status_code,
                    'message': 'Invalid credentials'
                }
                
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False, {
                'error': 'Connection error',
                'message': str(e)
            }
    
    def list_zones(self) -> Tuple[bool, Dict]:
        """Get all zones (domains) from ZoneEdit
        
        Returns:
            Tuple of (success, zones_dict)
        """
        logger.info("Listing zones from ZoneEdit")
        
        try:
            auth = (self.username, self.password)
            
            response = requests.get(
                f"{self.api_base}/zones",
                auth=auth,
                timeout=15
            )
            
            if response.status_code == 200:
                zones = response.json() if response.text else []
                logger.info(f"Retrieved {len(zones)} zones")
                return True, {
                    'zones': zones,
                    'count': len(zones),
                    'timestamp': datetime.utcnow().isoformat()
                }
            else:
                logger.error(f"Failed to list zones: {response.status_code}")
                return False, {
                    'error': 'API request failed',
                    'status_code': response.status_code
                }
                
        except Exception as e:
            logger.error(f"Error listing zones: {e}")
            return False, {
                'error': 'Request failed',
                'message': str(e)
            }
    
    def list_records(self, zone: str, record_type: Optional[str] = None) -> Tuple[bool, Dict]:
        """Get DNS records for a zone
        
        Args:
            zone: Domain zone name
            record_type: Filter by record type (A, CNAME, TXT, MX)
            
        Returns:
            Tuple of (success, records_dict)
        """
        logger.info(f"Listing records for zone: {zone}, type: {record_type or 'all'}")
        
        try:
            auth = (self.username, self.password)
            
            response = requests.get(
                f"{self.api_base}/zones/{zone}/rrset",
                auth=auth,
                params={'type': record_type} if record_type else {},
                timeout=15
            )
            
            if response.status_code == 200:
                records = response.json() if response.text else []
                logger.info(f"Retrieved {len(records)} records for {zone}")
                return True, {
                    'zone': zone,
                    'records': records,
                    'count': len(records),
                    'timestamp': datetime.utcnow().isoformat()
                }
            else:
                logger.error(f"Failed to list records: {response.status_code}")
                return False, {
                    'error': 'API request failed',
                    'status_code': response.status_code,
                    'zone': zone
                }
                
        except Exception as e:
            logger.error(f"Error listing records for {zone}: {e}")
            return False, {
                'error': 'Request failed',
                'message': str(e),
                'zone': zone
            }
    
    def create_record(
        self, 
        zone: str, 
        record_type: str, 
        host: str, 
        value: str, 
        ttl: int = 300
    ) -> Tuple[bool, Dict]:
        """Create new DNS record
        
        Args:
            zone: Domain zone name
            record_type: Record type (A, CNAME, TXT, MX)
            host: Hostname/subdomain
            value: Record value (IP address, target, etc.)
            ttl: Time to live in seconds
            
        Returns:
            Tuple of (success, record_dict)
        """
        if not self._enabled:
            return False, {
                'error': 'ZoneEdit not configured',
                'message': 'Please configure ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD or ZONEEDIT_API_TOKEN',
                'setup_url': 'https://www.zoneedit.com'
            }
        
        logger.info(f"Creating {record_type} record: {host}.{zone} -> {value}")
        
        if record_type not in ['A', 'AAAA', 'CNAME', 'TXT', 'MX']:
            return False, {
                'error': 'Invalid record type',
                'message': f'Unsupported record type: {record_type}'
            }
        
        try:
            auth = (self.username, self.password)
            
            data = {
                'type': record_type,
                'host': host,
                'value': value,
                'ttl': ttl
            }
            
            response = requests.post(
                f"{self.api_base}/zones/{zone}/rrset",
                auth=auth,
                json=data,
                timeout=15
            )
            
            if response.status_code in [200, 201]:
                result = response.json() if response.text else {}
                logger.info(f"Successfully created record: {host}.{zone}")
                
                with open('/tmp/jarvis_audit.log', 'a') as f:
                    f.write(f"{datetime.utcnow().isoformat()} - DNS Record Created: {host}.{zone} ({record_type}) -> {value}\n")
                
                return True, {
                    'record_id': result.get('id'),
                    'zone': zone,
                    'type': record_type,
                    'host': host,
                    'value': value,
                    'ttl': ttl,
                    'created_at': datetime.utcnow().isoformat()
                }
            else:
                logger.error(f"Failed to create record: {response.status_code} - {response.text}")
                return False, {
                    'error': 'Record creation failed',
                    'status_code': response.status_code,
                    'message': response.text
                }
                
        except Exception as e:
            logger.error(f"Error creating record: {e}")
            return False, {
                'error': 'Request failed',
                'message': str(e)
            }
    
    def update_record(
        self, 
        zone: str, 
        record_id: str, 
        value: str, 
        ttl: Optional[int] = None
    ) -> Tuple[bool, Dict]:
        """Update existing DNS record
        
        Args:
            zone: Domain zone name
            record_id: Record ID to update
            value: New record value
            ttl: New TTL (optional)
            
        Returns:
            Tuple of (success, record_dict)
        """
        logger.info(f"Updating record {record_id} in zone {zone}")
        
        try:
            auth = (self.username, self.password)
            
            data = {'value': value}
            if ttl is not None:
                data['ttl'] = ttl
            
            response = requests.put(
                f"{self.api_base}/zones/{zone}/rrset/{record_id}",
                auth=auth,
                json=data,
                timeout=15
            )
            
            if response.status_code == 200:
                logger.info(f"Successfully updated record {record_id}")
                
                with open('/tmp/jarvis_audit.log', 'a') as f:
                    f.write(f"{datetime.utcnow().isoformat()} - DNS Record Updated: {record_id} in {zone} -> {value}\n")
                
                return True, {
                    'record_id': record_id,
                    'zone': zone,
                    'value': value,
                    'ttl': ttl,
                    'updated_at': datetime.utcnow().isoformat()
                }
            else:
                logger.error(f"Failed to update record: {response.status_code}")
                return False, {
                    'error': 'Update failed',
                    'status_code': response.status_code
                }
                
        except Exception as e:
            logger.error(f"Error updating record: {e}")
            return False, {
                'error': 'Request failed',
                'message': str(e)
            }
    
    def delete_record(self, zone: str, record_id: str) -> Tuple[bool, Dict]:
        """Delete DNS record
        
        Args:
            zone: Domain zone name
            record_id: Record ID to delete
            
        Returns:
            Tuple of (success, result_dict)
        """
        logger.info(f"Deleting record {record_id} from zone {zone}")
        
        try:
            auth = (self.username, self.password)
            
            response = requests.delete(
                f"{self.api_base}/zones/{zone}/rrset/{record_id}",
                auth=auth,
                timeout=15
            )
            
            if response.status_code in [200, 204]:
                logger.info(f"Successfully deleted record {record_id}")
                
                with open('/tmp/jarvis_audit.log', 'a') as f:
                    f.write(f"{datetime.utcnow().isoformat()} - DNS Record Deleted: {record_id} from {zone}\n")
                
                return True, {
                    'record_id': record_id,
                    'zone': zone,
                    'deleted': True,
                    'deleted_at': datetime.utcnow().isoformat()
                }
            else:
                logger.error(f"Failed to delete record: {response.status_code}")
                return False, {
                    'error': 'Deletion failed',
                    'status_code': response.status_code
                }
                
        except Exception as e:
            logger.error(f"Error deleting record: {e}")
            return False, {
                'error': 'Request failed',
                'message': str(e)
            }
    
    def verify_propagation(
        self, 
        domain: str, 
        expected_ip: str, 
        max_attempts: int = 10
    ) -> Tuple[bool, Dict]:
        """Check if DNS has propagated globally
        
        Args:
            domain: Domain to check
            expected_ip: Expected IP address
            max_attempts: Maximum check attempts
            
        Returns:
            Tuple of (is_propagated, propagation_info)
        """
        logger.info(f"Verifying DNS propagation for {domain} (expected: {expected_ip})")
        
        dns_servers = [
            '8.8.8.8',
            '1.1.1.1',
            '208.67.222.222',
        ]
        
        for attempt in range(max_attempts):
            propagated_count = 0
            results = {}
            
            for dns_server in dns_servers:
                try:
                    result = subprocess.run(
                        ['dig', '+short', domain, f'@{dns_server}'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    if result.returncode == 0 and result.stdout.strip():
                        current_ip = result.stdout.strip().split('\n')[0]
                        results[dns_server] = current_ip
                        
                        if current_ip == expected_ip:
                            propagated_count += 1
                    else:
                        results[dns_server] = None
                        
                except Exception as e:
                    logger.warning(f"DNS check failed for {dns_server}: {e}")
                    results[dns_server] = None
            
            propagation_percentage = (propagated_count / len(dns_servers)) * 100
            
            logger.info(
                f"Attempt {attempt + 1}/{max_attempts}: "
                f"{propagation_percentage:.0f}% propagated"
            )
            
            if propagated_count == len(dns_servers):
                logger.info(f"DNS fully propagated for {domain}")
                return True, {
                    'domain': domain,
                    'expected_ip': expected_ip,
                    'propagated': True,
                    'propagation_percentage': 100.0,
                    'attempts': attempt + 1,
                    'dns_results': results,
                    'verified_at': datetime.utcnow().isoformat()
                }
            
            if attempt < max_attempts - 1:
                backoff = self._exponential_backoff(attempt)
                logger.info(f"Waiting {backoff}s before next check...")
                time.sleep(backoff)
        
        logger.warning(f"DNS not fully propagated after {max_attempts} attempts")
        return False, {
            'domain': domain,
            'expected_ip': expected_ip,
            'propagated': False,
            'propagation_percentage': propagation_percentage,
            'attempts': max_attempts,
            'dns_results': results,
            'verified_at': datetime.utcnow().isoformat()
        }
    
    def get_public_ip(self) -> Optional[str]:
        """Detect current public IP address
        
        Returns:
            Public IP address string or None
        """
        now = time.time()
        
        if (self._public_ip_cache and self._public_ip_cache_time and 
            now - self._public_ip_cache_time < self._public_ip_cache_duration):
            logger.debug(f"Using cached public IP: {self._public_ip_cache}")
            return self._public_ip_cache
        
        logger.info("Detecting public IP address")
        
        ip_services = [
            'https://api.ipify.org',
            'https://icanhazip.com',
            'https://ifconfig.me/ip'
        ]
        
        for service in ip_services:
            try:
                response = requests.get(service, timeout=5)
                if response.status_code == 200:
                    ip = response.text.strip()
                    logger.info(f"Detected public IP: {ip}")
                    
                    self._public_ip_cache = ip
                    self._public_ip_cache_time = now
                    
                    return ip
            except Exception as e:
                logger.warning(f"Failed to get IP from {service}: {e}")
                continue
        
        logger.error("Failed to detect public IP from all services")
        return None
