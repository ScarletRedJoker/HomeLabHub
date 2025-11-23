#!/usr/bin/env python3
"""
DNS Manager - Automated DNS record management for homelab services
Integrates with Cloudflare API to auto-create DNS records for services
"""

import os
import time
import yaml
import logging
import CloudFlare
import consul
from typing import Dict, List, Optional
from dataclasses import dataclass
from flask import Flask, jsonify

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class DNSRecord:
    """DNS record configuration"""
    type: str
    name: str
    content: str
    ttl: int = 300
    proxied: bool = True
    priority: Optional[int] = None

class CloudflareDNSManager:
    """Manages DNS records via Cloudflare API"""
    
    def __init__(self, api_token: str):
        """Initialize Cloudflare client"""
        self.cf = CloudFlare.CloudFlare(token=api_token)
        self.zones = self._load_zones()
        logger.info(f"Initialized Cloudflare DNS Manager with {len(self.zones)} zones")
    
    def _load_zones(self) -> Dict[str, str]:
        """Load zone IDs for configured domains"""
        zones = {}
        try:
            zone_list = self.cf.zones.get()
            for zone in zone_list:
                zones[zone['name']] = zone['id']
                logger.info(f"Loaded zone: {zone['name']} (ID: {zone['id']})")
        except Exception as e:
            logger.error(f"Failed to load zones: {e}")
        return zones
    
    def get_zone_id(self, domain: str) -> Optional[str]:
        """Get zone ID for a domain"""
        # Extract root domain from FQDN
        parts = domain.split('.')
        if len(parts) >= 2:
            root_domain = '.'.join(parts[-2:])
            return self.zones.get(root_domain)
        return None
    
    def list_records(self, zone_name: str) -> List[Dict]:
        """List all DNS records for a zone"""
        zone_id = self.zones.get(zone_name)
        if not zone_id:
            logger.error(f"Zone not found: {zone_name}")
            return []
        
        try:
            records = self.cf.zones.dns_records.get(zone_id)
            return records
        except Exception as e:
            logger.error(f"Failed to list records for {zone_name}: {e}")
            return []
    
    def create_record(self, record: DNSRecord) -> bool:
        """Create or update a DNS record"""
        zone_id = self.get_zone_id(record.name)
        if not zone_id:
            logger.error(f"No zone found for {record.name}")
            return False
        
        # Check if record already exists
        existing = self._find_record(zone_id, record.name, record.type)
        
        record_data = {
            'type': record.type,
            'name': record.name,
            'content': record.content,
            'ttl': record.ttl,
            'proxied': record.proxied if record.type in ['A', 'AAAA', 'CNAME'] else False
        }
        
        if record.priority is not None:
            record_data['priority'] = record.priority
        
        try:
            if existing:
                # Update existing record
                self.cf.zones.dns_records.put(zone_id, existing['id'], data=record_data)
                logger.info(f"Updated DNS record: {record.name} -> {record.content}")
            else:
                # Create new record
                self.cf.zones.dns_records.post(zone_id, data=record_data)
                logger.info(f"Created DNS record: {record.name} -> {record.content}")
            return True
        except Exception as e:
            logger.error(f"Failed to create/update record {record.name}: {e}")
            return False
    
    def delete_record(self, name: str, record_type: str = 'A') -> bool:
        """Delete a DNS record"""
        zone_id = self.get_zone_id(name)
        if not zone_id:
            logger.error(f"No zone found for {name}")
            return False
        
        existing = self._find_record(zone_id, name, record_type)
        if not existing:
            logger.warning(f"Record not found: {name}")
            return False
        
        try:
            self.cf.zones.dns_records.delete(zone_id, existing['id'])
            logger.info(f"Deleted DNS record: {name}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete record {name}: {e}")
            return False
    
    def _find_record(self, zone_id: str, name: str, record_type: str) -> Optional[Dict]:
        """Find existing DNS record"""
        try:
            records = self.cf.zones.dns_records.get(zone_id, params={'name': name, 'type': record_type})
            return records[0] if records else None
        except Exception:
            return None

class ServiceCatalogWatcher:
    """Watches services.yaml for DNS configuration changes"""
    
    def __init__(self, catalog_path: str, dns_manager: CloudflareDNSManager):
        self.catalog_path = catalog_path
        self.dns_manager = dns_manager
        self.last_sync = 0
        logger.info(f"Initialized Service Catalog Watcher: {catalog_path}")
    
    def sync_dns_records(self) -> Dict[str, int]:
        """Sync DNS records from services.yaml to Cloudflare"""
        if not os.path.exists(self.catalog_path):
            logger.error(f"Service catalog not found: {self.catalog_path}")
            return {'success': 0, 'failed': 0, 'skipped': 0}
        
        try:
            with open(self.catalog_path, 'r') as f:
                catalog = yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Failed to load service catalog: {e}")
            return {'success': 0, 'failed': 0, 'skipped': 0}
        
        stats = {'success': 0, 'failed': 0, 'skipped': 0}
        services = catalog.get('services', {})
        
        for service_name, service_config in services.items():
            dns_config = service_config.get('dns', {})
            records = dns_config.get('records', [])
            
            if not records:
                stats['skipped'] += 1
                continue
            
            logger.info(f"Syncing DNS for service: {service_name}")
            
            for record_config in records:
                record = DNSRecord(
                    type=record_config.get('type', 'A'),
                    name=record_config['name'],
                    content=record_config.get('content', record_config.get('target', '')),
                    ttl=record_config.get('ttl', 300),
                    proxied=record_config.get('proxied', True),
                    priority=record_config.get('priority')
                )
                
                if self.dns_manager.create_record(record):
                    stats['success'] += 1
                else:
                    stats['failed'] += 1
        
        self.last_sync = time.time()
        logger.info(f"DNS sync complete: {stats}")
        return stats

class TraefikWatcher:
    """Watches Traefik routes via Consul for auto-DNS creation"""
    
    def __init__(self, consul_host: str, dns_manager: CloudflareDNSManager, target_ip: str):
        self.consul_client = consul.Consul(host=consul_host)
        self.dns_manager = dns_manager
        self.target_ip = target_ip
        self.known_routes = set()
        logger.info(f"Initialized Traefik Watcher: {consul_host}")
    
    def watch_routes(self):
        """Watch for new Traefik routes and create DNS records"""
        try:
            # Get services from Consul catalog
            _, services = self.consul_client.catalog.services()
            
            for service_name in services:
                # Get service details
                _, service_list = self.consul_client.catalog.service(service_name)
                
                for service in service_list:
                    # Extract Traefik routes from service tags
                    tags = service.get('ServiceTags', [])
                    for tag in tags:
                        if tag.startswith('traefik.http.routers.') and '.rule=' in tag:
                            self._process_route_tag(tag)
        except Exception as e:
            logger.error(f"Failed to watch Traefik routes: {e}")
    
    def _process_route_tag(self, tag: str):
        """Process Traefik route tag and create DNS record if needed"""
        try:
            # Parse Host() from rule
            if 'Host(' in tag:
                start = tag.index('Host(') + 5
                end = tag.index(')', start)
                hosts = tag[start:end].strip('`').strip('"').split(',')
                
                for host in hosts:
                    host = host.strip().strip('`').strip('"')
                    if host not in self.known_routes:
                        record = DNSRecord(
                            type='A',
                            name=host,
                            content=self.target_ip,
                            ttl=300,
                            proxied=True
                        )
                        if self.dns_manager.create_record(record):
                            self.known_routes.add(host)
        except Exception as e:
            logger.debug(f"Failed to process route tag: {e}")

# Flask API
app = Flask(__name__)
dns_manager = None
catalog_watcher = None
traefik_watcher = None

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'dns-manager',
        'zones': len(dns_manager.zones) if dns_manager else 0
    })

@app.route('/api/dns/sync', methods=['POST'])
def sync_dns():
    """Trigger DNS sync from services.yaml"""
    if not catalog_watcher:
        return jsonify({'error': 'Catalog watcher not initialized'}), 500
    
    stats = catalog_watcher.sync_dns_records()
    return jsonify({'status': 'success', 'stats': stats})

@app.route('/api/dns/zones')
def list_zones():
    """List available DNS zones"""
    if not dns_manager:
        return jsonify({'error': 'DNS manager not initialized'}), 500
    
    return jsonify({'zones': list(dns_manager.zones.keys())})

@app.route('/api/dns/records/<zone>')
def list_records(zone):
    """List DNS records for a zone"""
    if not dns_manager:
        return jsonify({'error': 'DNS manager not initialized'}), 500
    
    records = dns_manager.list_records(zone)
    return jsonify({'zone': zone, 'records': records})

def main():
    """Main entry point"""
    global dns_manager, catalog_watcher, traefik_watcher
    
    # Configuration from environment
    api_token = os.getenv('CLOUDFLARE_API_TOKEN')
    catalog_path = os.getenv('SERVICE_CATALOG_PATH', '/config/services.yaml')
    consul_host = os.getenv('CONSUL_HOST', 'consul-server')
    target_ip = os.getenv('TARGET_IP', '0.0.0.0')
    sync_interval = int(os.getenv('SYNC_INTERVAL', '300'))  # 5 minutes
    
    if not api_token:
        logger.error("CLOUDFLARE_API_TOKEN not set")
        return
    
    # Initialize DNS manager
    dns_manager = CloudflareDNSManager(api_token)
    
    # Initialize catalog watcher
    catalog_watcher = ServiceCatalogWatcher(catalog_path, dns_manager)
    
    # Initialize Traefik watcher (optional)
    try:
        traefik_watcher = TraefikWatcher(consul_host, dns_manager, target_ip)
    except Exception as e:
        logger.warning(f"Traefik watcher disabled: {e}")
    
    # Initial sync
    logger.info("Performing initial DNS sync...")
    catalog_watcher.sync_dns_records()
    
    # Start Flask API
    logger.info("Starting DNS Manager API on port 8001...")
    app.run(host='0.0.0.0', port=8001, debug=False)

if __name__ == '__main__':
    main()
