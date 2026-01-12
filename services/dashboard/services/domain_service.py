"""
Domain Health Monitoring Service
Monitors domain availability, SSL certificates, DNS resolution, and response times.
"""

import ssl
import socket
import requests
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import dns.resolver
from urllib.parse import urlparse


class DomainService:
    """Service for monitoring domain health and SSL certificates."""
    
    # All 13 configured domains from homelab
    DOMAINS = [
        {
            'name': 'Homelab Dashboard',
            'url': 'https://host.evindrake.net',
            'subdomain': 'host.evindrake.net',
            'type': 'web',
            'container': 'homelab-dashboard'
        },
        {
            'name': 'Discord Ticket Bot',
            'url': 'https://bot.evindrake.net',
            'subdomain': 'bot.evindrake.net',
            'type': 'web',
            'container': 'discord-bot'
        },
        {
            'name': 'Stream Bot',
            'url': 'https://stream.evindrake.net',
            'subdomain': 'stream.evindrake.net',
            'type': 'web',
            'container': 'stream-bot'
        },
        {
            'name': 'Rig City Website',
            'url': 'https://rig-city.com',
            'subdomain': 'rig-city.com',
            'type': 'static',
            'container': 'rig-city-site'
        },
        {
            'name': 'Rig City WWW',
            'url': 'https://www.rig-city.com',
            'subdomain': 'www.rig-city.com',
            'type': 'redirect',
            'container': 'rig-city-site'
        },
        {
            'name': 'Plex Media Server',
            'url': 'https://plex.evindrake.net',
            'subdomain': 'plex.evindrake.net',
            'type': 'media',
            'container': 'plex-server'
        },
        {
            'name': 'n8n Automation',
            'url': 'https://n8n.evindrake.net',
            'subdomain': 'n8n.evindrake.net',
            'type': 'automation',
            'container': 'n8n'
        },
        {
            'name': 'VNC Desktop',
            'url': 'https://vnc.evindrake.net',
            'subdomain': 'vnc.evindrake.net',
            'type': 'remote',
            'container': 'vnc-desktop'
        },
        {
            'name': 'Code Server',
            'url': 'https://code.evindrake.net',
            'subdomain': 'code.evindrake.net',
            'type': 'development',
            'container': 'code-server'
        },
        {
            'name': 'Game Streaming',
            'url': 'https://game.evindrake.net',
            'subdomain': 'game.evindrake.net',
            'type': 'gaming',
            'container': 'homelab-dashboard'
        },
        {
            'name': 'Home Assistant',
            'url': 'https://home.evindrake.net',
            'subdomain': 'home.evindrake.net',
            'type': 'automation',
            'container': 'homeassistant'
        },
        {
            'name': 'Scarlet Red Joker',
            'url': 'https://scarletredjoker.com',
            'subdomain': 'scarletredjoker.com',
            'type': 'static',
            'container': 'scarletredjoker-web'
        },
        {
            'name': 'Scarlet Red Joker WWW',
            'url': 'https://www.scarletredjoker.com',
            'subdomain': 'www.scarletredjoker.com',
            'type': 'redirect',
            'container': 'scarletredjoker-web'
        }
    ]
    
    @staticmethod
    def check_domain_health(domain_config: Dict[str, str]) -> Dict[str, Any]:
        """Check health of a single domain."""
        url = domain_config['url']
        subdomain = domain_config['subdomain']
        
        result = {
            'name': domain_config['name'],
            'url': url,
            'subdomain': subdomain,
            'type': domain_config['type'],
            'container': domain_config.get('container'),
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
        
        try:
            # DNS check
            dns_result = DomainService._check_dns(subdomain)
            result['dns_resolved'] = dns_result['resolved']
            result['dns_ip'] = dns_result.get('ip')
            
            # HTTP health check
            start_time = datetime.now()
            response = requests.get(url, timeout=10, verify=True, allow_redirects=True)
            response_time = (datetime.now() - start_time).total_seconds()
            
            result['status'] = 'online'
            result['status_code'] = response.status_code
            result['response_time'] = round(response_time * 1000, 2)  # Convert to ms
            
            # SSL certificate check
            if url.startswith('https://'):
                ssl_info = DomainService._check_ssl(subdomain)
                result['ssl_valid'] = ssl_info['valid']
                result['ssl_expires'] = ssl_info.get('expires')
                result['ssl_days_remaining'] = ssl_info.get('days_remaining')
                
        except requests.exceptions.SSLError as e:
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
        
        return result
    
    @staticmethod
    def _check_dns(hostname: str) -> Dict[str, Any]:
        """Check DNS resolution for a hostname."""
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
        """Check SSL certificate for a hostname."""
        try:
            context = ssl.create_default_context()
            with socket.create_connection((hostname, port), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                    cert = ssock.getpeercert()
                    
                    # Check if certificate was retrieved
                    if cert is None:
                        return {'valid': False, 'error': 'No certificate found'}
                    
                    # Parse expiration date
                    expires_str = cert.get('notAfter', '')
                    if not expires_str:
                        return {'valid': False, 'error': 'No expiration date found'}
                    
                    expires_date = datetime.strptime(str(expires_str), '%b %d %H:%M:%S %Y %Z')
                    
                    # Calculate days remaining
                    days_remaining = (expires_date - datetime.now()).days
                    
                    # Parse issuer and subject
                    issuer_dict = {}
                    subject_dict = {}
                    
                    if cert.get('issuer'):
                        for item in cert['issuer']:
                            if isinstance(item, tuple) and len(item) > 0:
                                key_val = item[0]
                                if isinstance(key_val, tuple) and len(key_val) == 2:
                                    issuer_dict[key_val[0]] = key_val[1]
                    
                    if cert.get('subject'):
                        for item in cert['subject']:
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
    def check_all_domains() -> List[Dict[str, Any]]:
        """Check health of all configured domains."""
        results = []
        for domain in DomainService.DOMAINS:
            result = DomainService.check_domain_health(domain)
            results.append(result)
        return results
    
    @staticmethod
    def get_summary() -> Dict[str, Any]:
        """Get summary of all domain health checks."""
        all_results = DomainService.check_all_domains()
        
        summary = {
            'total': len(all_results),
            'online': sum(1 for r in all_results if r['status'] == 'online'),
            'offline': sum(1 for r in all_results if r['status'] == 'offline'),
            'errors': sum(1 for r in all_results if r['status'] in ['error', 'ssl_error', 'timeout']),
            'ssl_expiring_soon': sum(1 for r in all_results if r.get('ssl_days_remaining', 999) < 30),
            'avg_response_time': None,
            'domains': all_results
        }
        
        # Calculate average response time
        response_times = [r['response_time'] for r in all_results if r['response_time']]
        if response_times:
            summary['avg_response_time'] = round(sum(response_times) / len(response_times), 2)
        
        return summary
    
    @staticmethod
    def get_ssl_certificates() -> List[Dict[str, Any]]:
        """Get SSL certificate information for all HTTPS domains."""
        certificates = []
        
        for domain in DomainService.DOMAINS:
            if domain['url'].startswith('https://'):
                ssl_info = DomainService._check_ssl(domain['subdomain'])
                
                cert_info = {
                    'name': domain['name'],
                    'subdomain': domain['subdomain'],
                    'valid': ssl_info['valid'],
                    'expires': ssl_info.get('expires'),
                    'days_remaining': ssl_info.get('days_remaining'),
                    'issuer': ssl_info.get('issuer', {}).get('organizationName', 'Unknown'),
                    'status': 'valid'
                }
                
                # Determine status
                if not ssl_info['valid']:
                    cert_info['status'] = 'invalid'
                elif ssl_info.get('days_remaining', 0) < 7:
                    cert_info['status'] = 'critical'
                elif ssl_info.get('days_remaining', 0) < 30:
                    cert_info['status'] = 'warning'
                
                certificates.append(cert_info)
        
        return certificates
    
    @staticmethod
    def get_domains_expiring_soon(days_threshold: int = 30) -> List[Dict[str, Any]]:
        """
        Get domains with SSL certificates expiring soon.
        
        Args:
            days_threshold: Number of days to check (default: 30)
            
        Returns:
            List of domains with certificates expiring within the threshold
        """
        expiring_domains = []
        
        for domain in DomainService.DOMAINS:
            if domain['url'].startswith('https://'):
                ssl_info = DomainService._check_ssl(domain['subdomain'])
                
                if ssl_info['valid']:
                    days_remaining = ssl_info.get('days_remaining', 999)
                    
                    if days_remaining < days_threshold:
                        expiring_domains.append({
                            'name': domain['name'],
                            'subdomain': domain['subdomain'],
                            'url': domain['url'],
                            'days_remaining': days_remaining,
                            'expires': ssl_info.get('expires'),
                            'severity': 'critical' if days_remaining < 7 else 'warning'
                        })
        
        # Sort by days remaining (most urgent first)
        expiring_domains.sort(key=lambda x: x['days_remaining'])
        
        return expiring_domains
