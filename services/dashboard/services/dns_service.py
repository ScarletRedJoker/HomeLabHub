"""
DNS Service - Cloudflare API Integration for DNS Management
Provides unified interface for managing DNS records across all domains
"""
import os
import logging
import requests
from typing import Dict, List, Optional, Any
from datetime import datetime
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)


class RecordType(str, Enum):
    A = "A"
    AAAA = "AAAA"
    CNAME = "CNAME"
    TXT = "TXT"
    MX = "MX"
    NS = "NS"
    SRV = "SRV"
    CAA = "CAA"
    PTR = "PTR"


@dataclass
class DNSRecord:
    id: str
    zone_id: str
    zone_name: str
    name: str
    type: str
    content: str
    ttl: int
    proxied: bool
    priority: Optional[int] = None
    created_on: Optional[str] = None
    modified_on: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


@dataclass
class DNSZone:
    id: str
    name: str
    status: str
    paused: bool
    type: str
    name_servers: List[str]
    created_on: Optional[str] = None
    modified_on: Optional[str] = None
    
    def to_dict(self) -> Dict:
        return asdict(self)


class CloudflareDNSService:
    """
    Cloudflare DNS Service for managing DNS records
    Supports multiple domains with audit logging
    """
    
    CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"
    
    MANAGED_DOMAINS = [
        "evindrake.net",
        "rig-city.com",
        "scarletredjoker.com"
    ]
    
    def __init__(self):
        self.api_token = os.environ.get('CLOUDFLARE_API_TOKEN', '')
        self._zones_cache: Dict[str, DNSZone] = {}
        self._last_cache_update: Optional[datetime] = None
        self._cache_ttl_seconds = 300
        
        if not self.api_token:
            logger.warning("CLOUDFLARE_API_TOKEN not set - DNS management will be unavailable")
    
    @property
    def is_configured(self) -> bool:
        return bool(self.api_token)
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
    
    def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict:
        if not self.is_configured:
            return {"success": False, "error": "Cloudflare API token not configured"}
        
        url = f"{self.CLOUDFLARE_API_BASE}/{endpoint}"
        
        try:
            response = requests.request(
                method=method,
                url=url,
                headers=self._get_headers(),
                json=data,
                params=params,
                timeout=30
            )
            
            result = response.json()
            
            if not result.get('success', False):
                errors = result.get('errors', [])
                error_msg = errors[0].get('message') if errors else 'Unknown error'
                logger.error(f"Cloudflare API error: {error_msg}")
                return {"success": False, "error": error_msg}
            
            return result
            
        except requests.exceptions.Timeout:
            logger.error(f"Cloudflare API timeout for {endpoint}")
            return {"success": False, "error": "Request timed out"}
        except requests.exceptions.RequestException as e:
            logger.error(f"Cloudflare API request failed: {e}")
            return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"Unexpected error calling Cloudflare API: {e}")
            return {"success": False, "error": str(e)}
    
    def _log_audit(self, action: str, record_type: str, name: str, details: str = ""):
        try:
            from services.activity_service import activity_service
            activity_service.log_activity(
                'dns',
                f"DNS {action}: {record_type} record '{name}' {details}",
                'globe',
                'info' if action in ['created', 'updated'] else 'warning'
            )
        except Exception as e:
            logger.warning(f"Failed to log DNS audit: {e}")
    
    def list_zones(self, force_refresh: bool = False) -> List[DNSZone]:
        now = datetime.now()
        if (not force_refresh 
            and self._last_cache_update 
            and (now - self._last_cache_update).total_seconds() < self._cache_ttl_seconds
            and self._zones_cache):
            return list(self._zones_cache.values())
        
        result = self._make_request("GET", "zones", params={"per_page": 50})
        
        if not result.get('success'):
            logger.error(f"Failed to list zones: {result.get('error')}")
            return list(self._zones_cache.values()) if self._zones_cache else []
        
        zones = []
        for zone_data in result.get('result', []):
            zone = DNSZone(
                id=zone_data['id'],
                name=zone_data['name'],
                status=zone_data['status'],
                paused=zone_data.get('paused', False),
                type=zone_data.get('type', 'full'),
                name_servers=zone_data.get('name_servers', []),
                created_on=zone_data.get('created_on'),
                modified_on=zone_data.get('modified_on')
            )
            zones.append(zone)
            self._zones_cache[zone.id] = zone
        
        self._last_cache_update = now
        logger.info(f"Loaded {len(zones)} DNS zones from Cloudflare")
        return zones
    
    def get_zone_by_name(self, domain: str) -> Optional[DNSZone]:
        zones = self.list_zones()
        for zone in zones:
            if zone.name == domain:
                return zone
        return None
    
    def get_zone_by_id(self, zone_id: str) -> Optional[DNSZone]:
        if zone_id in self._zones_cache:
            return self._zones_cache[zone_id]
        
        zones = self.list_zones(force_refresh=True)
        for zone in zones:
            if zone.id == zone_id:
                return zone
        return None
    
    def get_records(
        self, 
        zone_id: str, 
        record_type: Optional[str] = None,
        name: Optional[str] = None,
        page: int = 1,
        per_page: int = 100
    ) -> List[DNSRecord]:
        zone = self.get_zone_by_id(zone_id)
        if not zone:
            logger.error(f"Zone {zone_id} not found")
            return []
        
        params: Dict[str, Any] = {
            "page": page,
            "per_page": per_page
        }
        
        if record_type:
            params["type"] = record_type
        if name:
            params["name"] = name
        
        result = self._make_request("GET", f"zones/{zone_id}/dns_records", params=params)
        
        if not result.get('success'):
            logger.error(f"Failed to get records for zone {zone_id}: {result.get('error')}")
            return []
        
        records = []
        for record_data in result.get('result', []):
            record = DNSRecord(
                id=record_data['id'],
                zone_id=zone_id,
                zone_name=zone.name,
                name=record_data['name'],
                type=record_data['type'],
                content=record_data['content'],
                ttl=record_data.get('ttl', 1),
                proxied=record_data.get('proxied', False),
                priority=record_data.get('priority'),
                created_on=record_data.get('created_on'),
                modified_on=record_data.get('modified_on')
            )
            records.append(record)
        
        return records
    
    def get_all_records(self, zone_id: str) -> List[DNSRecord]:
        all_records = []
        page = 1
        per_page = 100
        
        while True:
            records = self.get_records(zone_id, page=page, per_page=per_page)
            all_records.extend(records)
            
            if len(records) < per_page:
                break
            
            page += 1
            
            if page > 100:
                logger.warning(f"Too many pages of records for zone {zone_id}, stopping at page 100")
                break
        
        return all_records
    
    def create_record(
        self,
        zone_id: str,
        name: str,
        record_type: str,
        content: str,
        ttl: int = 1,
        proxied: bool = True,
        priority: Optional[int] = None
    ) -> Optional[DNSRecord]:
        zone = self.get_zone_by_id(zone_id)
        if not zone:
            logger.error(f"Zone {zone_id} not found")
            return None
        
        data = {
            "type": record_type,
            "name": name,
            "content": content,
            "ttl": ttl
        }
        
        if record_type in ['A', 'AAAA', 'CNAME']:
            data["proxied"] = proxied
        else:
            data["proxied"] = False
        
        if priority is not None and record_type == 'MX':
            data["priority"] = priority
        
        result = self._make_request("POST", f"zones/{zone_id}/dns_records", data=data)
        
        if not result.get('success'):
            logger.error(f"Failed to create record: {result.get('error')}")
            return None
        
        record_data = result.get('result', {})
        record = DNSRecord(
            id=record_data['id'],
            zone_id=zone_id,
            zone_name=zone.name,
            name=record_data['name'],
            type=record_data['type'],
            content=record_data['content'],
            ttl=record_data.get('ttl', 1),
            proxied=record_data.get('proxied', False),
            priority=record_data.get('priority'),
            created_on=record_data.get('created_on'),
            modified_on=record_data.get('modified_on')
        )
        
        self._log_audit("created", record_type, name, f"-> {content}")
        logger.info(f"Created DNS record: {name} ({record_type}) -> {content}")
        
        return record
    
    def update_record(
        self,
        zone_id: str,
        record_id: str,
        name: Optional[str] = None,
        record_type: Optional[str] = None,
        content: Optional[str] = None,
        ttl: Optional[int] = None,
        proxied: Optional[bool] = None,
        priority: Optional[int] = None
    ) -> Optional[DNSRecord]:
        zone = self.get_zone_by_id(zone_id)
        if not zone:
            logger.error(f"Zone {zone_id} not found")
            return None
        
        existing_result = self._make_request("GET", f"zones/{zone_id}/dns_records/{record_id}")
        if not existing_result.get('success'):
            logger.error(f"Record {record_id} not found")
            return None
        
        existing = existing_result.get('result', {})
        
        data = {
            "type": record_type or existing['type'],
            "name": name or existing['name'],
            "content": content or existing['content'],
            "ttl": ttl if ttl is not None else existing.get('ttl', 1)
        }
        
        final_type = data["type"]
        if final_type in ['A', 'AAAA', 'CNAME']:
            data["proxied"] = proxied if proxied is not None else existing.get('proxied', False)
        else:
            data["proxied"] = False
        
        if priority is not None and final_type == 'MX':
            data["priority"] = priority
        elif final_type == 'MX' and existing.get('priority'):
            data["priority"] = existing['priority']
        
        result = self._make_request("PUT", f"zones/{zone_id}/dns_records/{record_id}", data=data)
        
        if not result.get('success'):
            logger.error(f"Failed to update record: {result.get('error')}")
            return None
        
        record_data = result.get('result', {})
        record = DNSRecord(
            id=record_data['id'],
            zone_id=zone_id,
            zone_name=zone.name,
            name=record_data['name'],
            type=record_data['type'],
            content=record_data['content'],
            ttl=record_data.get('ttl', 1),
            proxied=record_data.get('proxied', False),
            priority=record_data.get('priority'),
            created_on=record_data.get('created_on'),
            modified_on=record_data.get('modified_on')
        )
        
        self._log_audit("updated", record.type, record.name, f"-> {record.content}")
        logger.info(f"Updated DNS record: {record.name} ({record.type})")
        
        return record
    
    def delete_record(self, zone_id: str, record_id: str) -> bool:
        existing_result = self._make_request("GET", f"zones/{zone_id}/dns_records/{record_id}")
        record_name = "unknown"
        record_type = "unknown"
        
        if existing_result.get('success'):
            existing = existing_result.get('result', {})
            record_name = existing.get('name', 'unknown')
            record_type = existing.get('type', 'unknown')
        
        result = self._make_request("DELETE", f"zones/{zone_id}/dns_records/{record_id}")
        
        if not result.get('success'):
            logger.error(f"Failed to delete record: {result.get('error')}")
            return False
        
        self._log_audit("deleted", record_type, record_name)
        logger.info(f"Deleted DNS record: {record_name} ({record_type})")
        
        return True
    
    def find_record(
        self, 
        zone_id: str, 
        name: str, 
        record_type: str
    ) -> Optional[DNSRecord]:
        records = self.get_records(zone_id, record_type=record_type, name=name)
        for record in records:
            if record.name == name and record.type == record_type:
                return record
        return None
    
    def create_or_update_record(
        self,
        zone_id: str,
        name: str,
        record_type: str,
        content: str,
        ttl: int = 1,
        proxied: bool = True,
        priority: Optional[int] = None
    ) -> Optional[DNSRecord]:
        existing = self.find_record(zone_id, name, record_type)
        
        if existing:
            return self.update_record(
                zone_id=zone_id,
                record_id=existing.id,
                content=content,
                ttl=ttl,
                proxied=proxied,
                priority=priority
            )
        else:
            return self.create_record(
                zone_id=zone_id,
                name=name,
                record_type=record_type,
                content=content,
                ttl=ttl,
                proxied=proxied,
                priority=priority
            )
    
    def check_dns_health(self, domain: str) -> Dict[str, Any]:
        zone = self.get_zone_by_name(domain)
        
        if not zone:
            return {
                "domain": domain,
                "healthy": False,
                "status": "not_found",
                "message": f"Zone for {domain} not found in Cloudflare",
                "records_count": 0
            }
        
        records = self.get_all_records(zone.id)
        
        has_a_record = any(r.type == 'A' and r.name == domain for r in records)
        has_cname_root = any(r.type == 'CNAME' and r.name == domain for r in records)
        has_ns = any(r.type == 'NS' for r in records)
        
        issues = []
        if not has_a_record and not has_cname_root:
            issues.append("No root A or CNAME record")
        
        status = "healthy" if not issues else "warning"
        
        return {
            "domain": domain,
            "zone_id": zone.id,
            "healthy": len(issues) == 0,
            "status": zone.status,
            "paused": zone.paused,
            "records_count": len(records),
            "has_root_record": has_a_record or has_cname_root,
            "has_nameservers": has_ns,
            "name_servers": zone.name_servers,
            "issues": issues,
            "record_types": list(set(r.type for r in records))
        }
    
    def get_all_domains_health(self) -> Dict[str, Any]:
        if not self.is_configured:
            return {
                "success": False,
                "error": "Cloudflare API token not configured",
                "domains": []
            }
        
        health_results = []
        for domain in self.MANAGED_DOMAINS:
            health = self.check_dns_health(domain)
            health_results.append(health)
        
        all_healthy = all(h.get('healthy', False) for h in health_results)
        total_records = sum(h.get('records_count', 0) for h in health_results)
        
        return {
            "success": True,
            "all_healthy": all_healthy,
            "total_records": total_records,
            "domains": health_results,
            "checked_at": datetime.now().isoformat()
        }
    
    def sync_from_services_catalog(self, catalog_path: Optional[str] = None) -> Dict[str, Any]:
        try:
            import yaml
        except ImportError:
            return {
                "success": False,
                "error": "PyYAML not installed",
                "synced": 0,
                "failed": 0
            }
        
        resolved_path: str = catalog_path if catalog_path is not None else os.environ.get('SERVICE_CATALOG_PATH', '/config/services.yaml')
        
        if not os.path.exists(resolved_path):
            return {
                "success": False,
                "error": f"Catalog file not found: {resolved_path}",
                "synced": 0,
                "failed": 0
            }
        
        try:
            with open(resolved_path, 'r') as f:
                catalog = yaml.safe_load(f)
        except Exception as e:
            return {
                "success": False,
                "error": f"Failed to parse catalog: {str(e)}",
                "synced": 0,
                "failed": 0
            }
        
        stats = {"synced": 0, "failed": 0, "skipped": 0}
        results = []
        
        services = catalog.get('services', {})
        for service_name, service_config in services.items():
            dns_config = service_config.get('dns', {})
            records = dns_config.get('records', [])
            
            if not records:
                stats['skipped'] += 1
                continue
            
            for record_config in records:
                name = record_config.get('name')
                record_type = record_config.get('type', 'A')
                content = record_config.get('content', record_config.get('target', ''))
                
                if not name or not content:
                    stats['skipped'] += 1
                    continue
                
                domain_parts = name.split('.')
                if len(domain_parts) >= 2:
                    root_domain = '.'.join(domain_parts[-2:])
                else:
                    root_domain = name
                
                zone = self.get_zone_by_name(root_domain)
                if not zone:
                    stats['failed'] += 1
                    results.append({
                        "name": name,
                        "status": "failed",
                        "error": f"Zone not found for {root_domain}"
                    })
                    continue
                
                try:
                    record = self.create_or_update_record(
                        zone_id=zone.id,
                        name=name,
                        record_type=record_type,
                        content=content,
                        ttl=record_config.get('ttl', 1),
                        proxied=record_config.get('proxied', True),
                        priority=record_config.get('priority')
                    )
                    
                    if record:
                        stats['synced'] += 1
                        results.append({
                            "name": name,
                            "type": record_type,
                            "content": content,
                            "status": "synced"
                        })
                    else:
                        stats['failed'] += 1
                        results.append({
                            "name": name,
                            "status": "failed",
                            "error": "Failed to create/update record"
                        })
                except Exception as e:
                    stats['failed'] += 1
                    results.append({
                        "name": name,
                        "status": "failed",
                        "error": str(e)
                    })
        
        self._log_audit(
            "sync",
            "catalog",
            resolved_path,
            f"synced={stats['synced']}, failed={stats['failed']}, skipped={stats['skipped']}"
        )
        
        return {
            "success": True,
            "synced": stats['synced'],
            "failed": stats['failed'],
            "skipped": stats['skipped'],
            "results": results
        }


dns_service = CloudflareDNSService()
