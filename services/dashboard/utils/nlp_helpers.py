"""
Natural Language Processing Helpers for Jarvis Voice Commands
Parses user voice input to extract domains, IPs, app names, and command intents
"""

import re
import logging
from typing import Optional, Dict, Any, List

logger = logging.getLogger(__name__)


def extract_domain(text: str) -> Optional[str]:
    """
    Extract domain name from natural language
    
    Examples:
        - "create zone example.com" -> "example.com"
        - "add DNS record for nas.homelab.local" -> "nas.homelab.local"
    
    Args:
        text: Natural language input
        
    Returns:
        Domain name or None if not found
    """
    if not text:
        return None
    
    text_lower = text.lower()
    
    # Pattern for domain names (subdomain.domain.tld)
    domain_pattern = r'(?:zone |record |dns |for |domain )?([a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?)+)'
    
    match = re.search(domain_pattern, text_lower)
    if match:
        domain = match.group(1)
        logger.debug(f"Extracted domain: {domain}")
        return domain
    
    return None


def extract_ip_address(text: str) -> Optional[str]:
    """
    Extract IPv4 address from natural language
    
    Examples:
        - "pointing to 192.168.1.100" -> "192.168.1.100"
        - "mount share from 10.0.0.5" -> "10.0.0.5"
    
    Args:
        text: Natural language input
        
    Returns:
        IP address or None if not found
    """
    if not text:
        return None
    
    # IPv4 pattern
    ipv4_pattern = r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b'
    
    match = re.search(ipv4_pattern, text)
    if match:
        ip = match.group(0)
        logger.debug(f"Extracted IP: {ip}")
        return ip
    
    return None


def extract_ip_or_domain(text: str) -> Optional[str]:
    """
    Extract either IP address or domain from text
    Tries IP first, then domain
    
    Args:
        text: Natural language input
        
    Returns:
        IP address or domain, whichever is found first
    """
    ip = extract_ip_address(text)
    if ip:
        return ip
    
    return extract_domain(text)


def parse_dns_record(text: str) -> Dict[str, Any]:
    """
    Parse DNS record from natural language
    
    Examples:
        - "add A record nas.example.com pointing to 192.168.1.100"
        - "create CNAME www.example.com pointing to example.com"
    
    Args:
        text: Natural language input
        
    Returns:
        Dictionary with record data: {name, type, content, ttl}
    """
    text_lower = text.lower()
    
    # Record type mapping
    record_types = {
        'a': 'A',
        'aaaa': 'AAAA',
        'cname': 'CNAME',
        'mx': 'MX',
        'txt': 'TXT',
        'ns': 'NS'
    }
    
    # Extract record type
    rtype = 'A'  # Default to A record
    for key, value in record_types.items():
        if f'{key} record' in text_lower:
            rtype = value
            break
    
    # Extract record name (domain)
    name = extract_domain(text)
    
    # Extract content (IP or domain after "pointing to" or "to")
    content = None
    pointing_pattern = r'(?:pointing to|to|at)\s+([^\s]+)'
    match = re.search(pointing_pattern, text_lower)
    if match:
        content = match.group(1)
    else:
        # Fallback: extract IP or domain
        content = extract_ip_or_domain(text)
    
    # Extract TTL if specified
    ttl = 300  # Default 5 minutes
    ttl_pattern = r'ttl\s+(\d+)'
    ttl_match = re.search(ttl_pattern, text_lower)
    if ttl_match:
        ttl = int(ttl_match.group(1))
    
    result = {
        'name': name,
        'type': rtype,
        'content': content,
        'ttl': ttl
    }
    
    logger.debug(f"Parsed DNS record: {result}")
    return result


def extract_app_name(text: str) -> Optional[str]:
    """
    Extract application name from install/deploy command
    
    Examples:
        - "install Nextcloud" -> "nextcloud"
        - "deploy Jellyfin" -> "jellyfin"
    
    Args:
        text: Natural language input
        
    Returns:
        Normalized app name or None if not found
    """
    if not text:
        return None
    
    text_lower = text.lower()
    
    # Known marketplace apps
    apps = [
        'nextcloud', 'jellyfin', 'bitwarden', 'vaultwarden', 'plex',
        'grafana', 'portainer', 'ollama', 'gitea', 'photoprism',
        'immich', 'homepage', 'uptime-kuma', 'n8n', 'minio',
        'postgres', 'mysql', 'redis', 'mongodb', 'nginx'
    ]
    
    for app in apps:
        if app in text_lower:
            logger.debug(f"Extracted app name: {app}")
            return app
    
    # Fallback: try to extract word after "install" or "deploy"
    pattern = r'(?:install|deploy)\s+([a-z0-9\-]+)'
    match = re.search(pattern, text_lower)
    if match:
        app_name = match.group(1)
        logger.debug(f"Extracted app name (fallback): {app_name}")
        return app_name
    
    return None


def extract_backup_type(text: str) -> str:
    """
    Extract backup type from command
    
    Examples:
        - "backup database to NAS" -> "database"
        - "backup all data to NAS" -> "all"
    
    Args:
        text: Natural language input
        
    Returns:
        Backup type: 'database', 'volumes', or 'all'
    """
    text_lower = text.lower()
    
    if 'database' in text_lower or 'db' in text_lower:
        return 'database'
    elif 'volume' in text_lower or 'data' in text_lower:
        return 'volumes'
    elif 'all' in text_lower or 'everything' in text_lower:
        return 'all'
    else:
        return 'all'  # Default to backing up everything


def parse_mount_command(text: str) -> Dict[str, Any]:
    """
    Parse NAS mount command
    
    Examples:
        - "mount share from 192.168.1.100" -> {ip: "192.168.1.100", share: None}
        - "mount media from 10.0.0.5" -> {ip: "10.0.0.5", share: "media"}
    
    Args:
        text: Natural language input
        
    Returns:
        Dictionary with mount data: {ip_address, share_name, mount_point}
    """
    text_lower = text.lower()
    
    # Extract IP address
    ip_address = extract_ip_address(text)
    
    # Extract share name (word before "from" or "share")
    share_name = None
    share_pattern = r'mount\s+([a-z0-9_\-]+)\s+(?:share\s+)?(?:from|at)'
    match = re.search(share_pattern, text_lower)
    if match:
        share_name = match.group(1)
    
    # Extract mount point if specified
    mount_point = None
    mount_pattern = r'(?:at|to)\s+(/[^\s]+)'
    mount_match = re.search(mount_pattern, text)
    if mount_match:
        mount_point = mount_match.group(1)
    
    result = {
        'ip_address': ip_address,
        'share_name': share_name,
        'mount_point': mount_point
    }
    
    logger.debug(f"Parsed mount command: {result}")
    return result


def extract_network_range(text: str) -> str:
    """
    Extract network range for scanning
    
    Examples:
        - "scan 192.168.1.0/24" -> "192.168.1.0/24"
        - Default -> "192.168.1.0/24"
    
    Args:
        text: Natural language input
        
    Returns:
        Network range in CIDR notation
    """
    # CIDR pattern
    cidr_pattern = r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/\d{1,2}\b'
    
    match = re.search(cidr_pattern, text)
    if match:
        return match.group(0)
    
    # Default to common home network
    return '192.168.1.0/24'


def generate_subdomain(app_name: str) -> str:
    """
    Generate subdomain for marketplace app
    
    Examples:
        - "nextcloud" -> "nextcloud"
        - "uptime-kuma" -> "uptime"
    
    Args:
        app_name: Application name
        
    Returns:
        Subdomain-safe name
    """
    # Remove hyphens and take first part
    subdomain = app_name.lower().split('-')[0]
    
    # Remove special characters
    subdomain = re.sub(r'[^a-z0-9]', '', subdomain)
    
    return subdomain


def detect_command_intent(text: str) -> str:
    """
    Detect the high-level intent of the command
    
    Returns:
        Command category: 'dns', 'nas', 'marketplace', 'general'
    """
    text_lower = text.lower()
    
    # DNS keywords
    dns_keywords = ['dns', 'zone', 'record', 'dyndns', 'dynamic dns', 'nameserver']
    if any(keyword in text_lower for keyword in dns_keywords):
        return 'dns'
    
    # NAS keywords
    nas_keywords = ['nas', 'mount', 'share', 'smb', 'nfs', 'backup']
    if any(keyword in text_lower for keyword in nas_keywords):
        return 'nas'
    
    # Marketplace keywords
    marketplace_keywords = ['install', 'deploy', 'app', 'marketplace', 'container']
    if any(keyword in text_lower for keyword in marketplace_keywords):
        return 'marketplace'
    
    return 'general'
