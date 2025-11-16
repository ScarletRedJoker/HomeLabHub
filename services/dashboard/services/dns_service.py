"""
LocalDNSService - PowerDNS HTTP API wrapper for managing DNS zones and records
"""

import os
import logging
import requests
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class LocalDNSService:
    """
    Wrapper for PowerDNS HTTP API
    Provides methods for zone and record management
    """
    
    def __init__(self):
        self.api_url = os.getenv('POWERDNS_API_URL', 'http://powerdns:8081')
        self.api_key = os.getenv('PDNS_API_KEY')
        self.server_id = 'localhost'  # PowerDNS default server ID
        self.base_url = f"{self.api_url}/api/v1/servers/{self.server_id}"
        self.headers = {
            'X-API-Key': self.api_key,
            'Content-Type': 'application/json'
        }
        
        if not self.api_key:
            logger.warning("PDNS_API_KEY not set - PowerDNS API calls will fail")
    
    def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Tuple[bool, Any]:
        """
        Make HTTP request to PowerDNS API
        
        Args:
            method: HTTP method (GET, POST, PATCH, DELETE)
            endpoint: API endpoint path
            data: Request body data
            params: Query parameters
            
        Returns:
            Tuple of (success: bool, response_data or error_message)
        """
        try:
            url = f"{self.base_url}{endpoint}"
            
            response = requests.request(
                method=method,
                url=url,
                headers=self.headers,
                json=data,
                params=params,
                timeout=10
            )
            
            if response.status_code in [200, 201, 204]:
                if response.content:
                    return True, response.json()
                return True, {'message': 'Success'}
            else:
                error_msg = f"PowerDNS API error: {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg = f"{error_msg} - {error_detail.get('error', response.text)}"
                except:
                    error_msg = f"{error_msg} - {response.text}"
                
                logger.error(error_msg)
                return False, error_msg
                
        except requests.exceptions.RequestException as e:
            error_msg = f"PowerDNS API request failed: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
        except Exception as e:
            error_msg = f"Unexpected error in PowerDNS API call: {str(e)}"
            logger.error(error_msg)
            return False, error_msg
    
    # ============================================
    # Zone Management Methods
    # ============================================
    
    def list_zones(self) -> Tuple[bool, Any]:
        """
        List all DNS zones
        
        Returns:
            Tuple of (success: bool, zones_list or error_message)
        """
        logger.info("Listing all DNS zones")
        return self._make_request('GET', '/zones')
    
    def create_zone(self, name: str, kind: str = 'Native', nameservers: Optional[List[str]] = None) -> Tuple[bool, Any]:
        """
        Create a new DNS zone
        
        Args:
            name: Zone name (e.g., 'example.com.')
            kind: Zone type (Native, Master, Slave)
            nameservers: List of nameserver FQDNs
            
        Returns:
            Tuple of (success: bool, zone_data or error_message)
        """
        # Ensure zone name ends with a dot
        if not name.endswith('.'):
            name = f"{name}."
        
        zone_data = {
            'name': name,
            'kind': kind,
            'nameservers': nameservers or []
        }
        
        logger.info(f"Creating zone: {name}")
        return self._make_request('POST', '/zones', data=zone_data)
    
    def get_zone(self, zone_name: str) -> Tuple[bool, Any]:
        """
        Get zone details including all records
        
        Args:
            zone_name: Zone name (e.g., 'example.com')
            
        Returns:
            Tuple of (success: bool, zone_data or error_message)
        """
        if not zone_name.endswith('.'):
            zone_name = f"{zone_name}."
        
        logger.info(f"Getting zone: {zone_name}")
        return self._make_request('GET', f'/zones/{zone_name}')
    
    def delete_zone(self, zone_name: str) -> Tuple[bool, Any]:
        """
        Delete a DNS zone and all its records
        
        Args:
            zone_name: Zone name (e.g., 'example.com')
            
        Returns:
            Tuple of (success: bool, result or error_message)
        """
        if not zone_name.endswith('.'):
            zone_name = f"{zone_name}."
        
        logger.info(f"Deleting zone: {zone_name}")
        return self._make_request('DELETE', f'/zones/{zone_name}')
    
    # ============================================
    # Record Management Methods
    # ============================================
    
    def create_record(
        self, 
        zone: str, 
        name: str, 
        rtype: str, 
        content: str, 
        ttl: int = 300
    ) -> Tuple[bool, Any]:
        """
        Create a DNS record in the specified zone
        
        Args:
            zone: Zone name (e.g., 'example.com')
            name: Record name (e.g., 'www.example.com')
            rtype: Record type (A, AAAA, CNAME, TXT, MX, etc.)
            content: Record content (e.g., '192.168.1.1')
            ttl: Time to live in seconds
            
        Returns:
            Tuple of (success: bool, result or error_message)
        """
        if not zone.endswith('.'):
            zone = f"{zone}."
        if not name.endswith('.'):
            name = f"{name}."
        
        # Validate record type
        valid_types = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'SOA', 'SRV', 'PTR']
        if rtype.upper() not in valid_types:
            return False, f"Invalid record type: {rtype}. Must be one of {valid_types}"
        
        # Build RRsets structure for PowerDNS
        rrsets_data = {
            'rrsets': [
                {
                    'name': name,
                    'type': rtype.upper(),
                    'ttl': ttl,
                    'changetype': 'REPLACE',
                    'records': [
                        {
                            'content': content,
                            'disabled': False
                        }
                    ]
                }
            ]
        }
        
        logger.info(f"Creating {rtype} record for {name} in zone {zone}")
        return self._make_request('PATCH', f'/zones/{zone}', data=rrsets_data)
    
    def update_record(
        self, 
        zone: str, 
        name: str, 
        rtype: str, 
        new_content: str,
        ttl: int = 300
    ) -> Tuple[bool, Any]:
        """
        Update an existing DNS record
        
        Args:
            zone: Zone name (e.g., 'example.com')
            name: Record name (e.g., 'www.example.com')
            rtype: Record type (A, AAAA, CNAME, etc.)
            new_content: New record content
            ttl: Time to live in seconds
            
        Returns:
            Tuple of (success: bool, result or error_message)
        """
        # Update is the same as create with REPLACE changetype
        return self.create_record(zone, name, rtype, new_content, ttl)
    
    def delete_record(self, zone: str, name: str, rtype: str) -> Tuple[bool, Any]:
        """
        Delete a DNS record
        
        Args:
            zone: Zone name (e.g., 'example.com')
            name: Record name (e.g., 'www.example.com')
            rtype: Record type (A, AAAA, CNAME, etc.)
            
        Returns:
            Tuple of (success: bool, result or error_message)
        """
        if not zone.endswith('.'):
            zone = f"{zone}."
        if not name.endswith('.'):
            name = f"{name}."
        
        rrsets_data = {
            'rrsets': [
                {
                    'name': name,
                    'type': rtype.upper(),
                    'changetype': 'DELETE'
                }
            ]
        }
        
        logger.info(f"Deleting {rtype} record for {name} in zone {zone}")
        return self._make_request('PATCH', f'/zones/{zone}', data=rrsets_data)
    
    def list_records(self, zone: str, rtype: Optional[str] = None) -> Tuple[bool, Any]:
        """
        List all records in a zone, optionally filtered by type
        
        Args:
            zone: Zone name (e.g., 'example.com')
            rtype: Optional record type filter (A, AAAA, CNAME, etc.)
            
        Returns:
            Tuple of (success: bool, records_list or error_message)
        """
        success, zone_data = self.get_zone(zone)
        
        if not success:
            return False, zone_data
        
        rrsets = zone_data.get('rrsets', [])
        
        if rtype:
            rrsets = [r for r in rrsets if r.get('type') == rtype.upper()]
        
        return True, rrsets
    
    # ============================================
    # DynDNS Helper Methods
    # ============================================
    
    def get_current_external_ip(self) -> Optional[str]:
        """
        Detect current external IP address using ipify.org
        
        Returns:
            IP address string or None if detection fails
        """
        try:
            response = requests.get('https://api.ipify.org?format=json', timeout=5)
            if response.status_code == 200:
                ip = response.json().get('ip')
                logger.info(f"Detected external IP: {ip}")
                return ip
            else:
                logger.error(f"Failed to get external IP: {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"Error detecting external IP: {e}")
            return None
    
    def update_dyndns_record(self, fqdn: str, new_ip: str) -> Tuple[bool, str]:
        """
        Update A record for DynDNS host
        
        Args:
            fqdn: Fully qualified domain name (e.g., 'nas.example.com')
            new_ip: New IP address
            
        Returns:
            Tuple of (success: bool, message)
        """
        # Extract zone from FQDN (e.g., 'example.com' from 'nas.example.com')
        parts = fqdn.split('.')
        if len(parts) < 2:
            return False, f"Invalid FQDN: {fqdn}"
        
        zone = '.'.join(parts[-2:])  # Get last two parts (domain.tld)
        
        logger.info(f"Updating DynDNS record: {fqdn} -> {new_ip}")
        success, result = self.update_record(zone, fqdn, 'A', new_ip, ttl=300)
        
        if success:
            return True, f"Updated {fqdn} to {new_ip}"
        else:
            return False, f"Failed to update {fqdn}: {result}"
    
    # ============================================
    # Health Check
    # ============================================
    
    def health_check(self) -> Dict[str, Any]:
        """
        Check PowerDNS API health
        
        Returns:
            Health status dictionary
        """
        try:
            success, zones = self.list_zones()
            
            if success:
                return {
                    'healthy': True,
                    'api_url': self.api_url,
                    'server_id': self.server_id,
                    'zones_count': len(zones) if isinstance(zones, list) else 0
                }
            else:
                return {
                    'healthy': False,
                    'api_url': self.api_url,
                    'error': zones
                }
        except Exception as e:
            return {
                'healthy': False,
                'api_url': self.api_url,
                'error': str(e)
            }
