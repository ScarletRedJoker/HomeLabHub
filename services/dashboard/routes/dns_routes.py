"""
DNS Management API Routes
Provides endpoints for Cloudflare DNS record management
"""
from flask import Blueprint, jsonify, request, render_template
from services.dns_service import dns_service
from utils.auth import require_auth, require_web_auth
import logging

logger = logging.getLogger(__name__)

dns_bp = Blueprint('dns', __name__)


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@dns_bp.route('/dns')
@require_web_auth
def dns_management_page():
    """Render DNS management page"""
    return render_template('dns_management.html')


@dns_bp.route('/api/dns/zones', methods=['GET'])
@require_auth
def list_zones():
    """
    GET /api/dns/zones
    List all Cloudflare DNS zones
    
    Returns:
        JSON array of zone objects
    """
    try:
        if not dns_service.is_configured:
            return make_response(
                False, 
                message="Cloudflare API token not configured. Set CLOUDFLARE_API_TOKEN environment variable.",
                status_code=503
            )
        
        force_refresh = request.args.get('refresh', 'false').lower() == 'true'
        zones = dns_service.list_zones(force_refresh=force_refresh)
        
        return make_response(True, {
            'zones': [zone.to_dict() for zone in zones],
            'count': len(zones),
            'managed_domains': dns_service.MANAGED_DOMAINS
        })
        
    except Exception as e:
        logger.error(f"Error listing DNS zones: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/zones/<zone_id>', methods=['GET'])
@require_auth
def get_zone(zone_id):
    """
    GET /api/dns/zones/<zone_id>
    Get details of a specific zone
    
    Returns:
        JSON object with zone details
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        zone = dns_service.get_zone_by_id(zone_id)
        
        if not zone:
            return make_response(False, message=f"Zone {zone_id} not found", status_code=404)
        
        return make_response(True, {'zone': zone.to_dict()})
        
    except Exception as e:
        logger.error(f"Error getting zone {zone_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/zones/<zone_id>/records', methods=['GET'])
@require_auth
def list_zone_records(zone_id):
    """
    GET /api/dns/zones/<zone_id>/records
    List all DNS records for a zone
    
    Query params:
        type: Filter by record type (A, AAAA, CNAME, etc.)
        name: Filter by record name
        page: Page number (default: 1)
        per_page: Records per page (default: 100)
    
    Returns:
        JSON array of DNS record objects
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        record_type = request.args.get('type')
        name = request.args.get('name')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 100, type=int)
        all_records = request.args.get('all', 'false').lower() == 'true'
        
        zone = dns_service.get_zone_by_id(zone_id)
        if not zone:
            return make_response(False, message=f"Zone {zone_id} not found", status_code=404)
        
        if all_records:
            records = dns_service.get_all_records(zone_id)
        else:
            records = dns_service.get_records(
                zone_id, 
                record_type=record_type, 
                name=name,
                page=page,
                per_page=per_page
            )
        
        return make_response(True, {
            'zone': zone.to_dict(),
            'records': [record.to_dict() for record in records],
            'count': len(records)
        })
        
    except Exception as e:
        logger.error(f"Error listing records for zone {zone_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/records', methods=['POST'])
@require_auth
def create_record():
    """
    POST /api/dns/records
    Create a new DNS record
    
    JSON body:
        zone_id: Zone ID (required)
        name: Record name (required)
        type: Record type (required) - A, AAAA, CNAME, TXT, MX, etc.
        content: Record content/value (required)
        ttl: TTL in seconds (optional, default: 1 = auto)
        proxied: Enable Cloudflare proxy (optional, default: true)
        priority: MX priority (optional, only for MX records)
    
    Returns:
        JSON object with created record
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        data = request.get_json()
        if not data:
            return make_response(False, message="JSON body required", status_code=400)
        
        zone_id = data.get('zone_id')
        name = data.get('name')
        record_type = data.get('type')
        content = data.get('content')
        
        if not all([zone_id, name, record_type, content]):
            return make_response(
                False, 
                message="Missing required fields: zone_id, name, type, content",
                status_code=400
            )
        
        ttl = data.get('ttl', 1)
        proxied = data.get('proxied', True)
        priority = data.get('priority')
        
        record = dns_service.create_record(
            zone_id=zone_id,
            name=name,
            record_type=record_type,
            content=content,
            ttl=ttl,
            proxied=proxied,
            priority=priority
        )
        
        if not record:
            return make_response(False, message="Failed to create DNS record", status_code=500)
        
        return make_response(True, {
            'record': record.to_dict(),
            'message': f"Created {record_type} record for {name}"
        })
        
    except Exception as e:
        logger.error(f"Error creating DNS record: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/records/<record_id>', methods=['PUT'])
@require_auth
def update_record(record_id):
    """
    PUT /api/dns/records/<record_id>
    Update an existing DNS record
    
    JSON body:
        zone_id: Zone ID (required)
        name: Record name (optional)
        type: Record type (optional)
        content: Record content/value (optional)
        ttl: TTL in seconds (optional)
        proxied: Enable Cloudflare proxy (optional)
        priority: MX priority (optional)
    
    Returns:
        JSON object with updated record
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        data = request.get_json()
        if not data:
            return make_response(False, message="JSON body required", status_code=400)
        
        zone_id = data.get('zone_id')
        if not zone_id:
            return make_response(False, message="zone_id is required", status_code=400)
        
        record = dns_service.update_record(
            zone_id=zone_id,
            record_id=record_id,
            name=data.get('name'),
            record_type=data.get('type'),
            content=data.get('content'),
            ttl=data.get('ttl'),
            proxied=data.get('proxied'),
            priority=data.get('priority')
        )
        
        if not record:
            return make_response(False, message="Failed to update DNS record", status_code=500)
        
        return make_response(True, {
            'record': record.to_dict(),
            'message': f"Updated {record.type} record for {record.name}"
        })
        
    except Exception as e:
        logger.error(f"Error updating DNS record {record_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/records/<record_id>', methods=['DELETE'])
@require_auth
def delete_record(record_id):
    """
    DELETE /api/dns/records/<record_id>
    Delete a DNS record
    
    Query params:
        zone_id: Zone ID (required)
    
    Returns:
        JSON object with deletion status
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        zone_id = request.args.get('zone_id')
        if not zone_id:
            data = request.get_json() or {}
            zone_id = data.get('zone_id')
        
        if not zone_id:
            return make_response(False, message="zone_id is required", status_code=400)
        
        success = dns_service.delete_record(zone_id, record_id)
        
        if not success:
            return make_response(False, message="Failed to delete DNS record", status_code=500)
        
        return make_response(True, message="DNS record deleted successfully")
        
    except Exception as e:
        logger.error(f"Error deleting DNS record {record_id}: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/sync', methods=['POST'])
@require_auth
def sync_dns():
    """
    POST /api/dns/sync
    Sync DNS records from services catalog
    
    JSON body (optional):
        catalog_path: Path to services.yaml (default: /config/services.yaml)
    
    Returns:
        JSON object with sync results
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        data = request.get_json() or {}
        catalog_path = data.get('catalog_path')
        
        result = dns_service.sync_from_services_catalog(catalog_path)
        
        if not result.get('success'):
            return make_response(False, message=result.get('error'), status_code=500)
        
        return make_response(True, {
            'synced': result.get('synced', 0),
            'failed': result.get('failed', 0),
            'skipped': result.get('skipped', 0),
            'results': result.get('results', []),
            'message': f"Sync complete: {result.get('synced')} synced, {result.get('failed')} failed"
        })
        
    except Exception as e:
        logger.error(f"Error syncing DNS: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/status', methods=['GET'])
@require_auth
def get_dns_status():
    """
    GET /api/dns/status
    Get DNS health status for all managed domains
    
    Returns:
        JSON object with health status for each domain
    """
    try:
        if not dns_service.is_configured:
            return make_response(
                False, 
                message="Cloudflare API not configured. Set CLOUDFLARE_API_TOKEN environment variable.",
                status_code=503
            )
        
        health = dns_service.get_all_domains_health()
        
        if not health.get('success'):
            return make_response(False, message=health.get('error'), status_code=500)
        
        return make_response(True, health)
        
    except Exception as e:
        logger.error(f"Error getting DNS status: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/health/<domain>', methods=['GET'])
@require_auth
def get_domain_health(domain):
    """
    GET /api/dns/health/<domain>
    Get DNS health status for a specific domain
    
    Returns:
        JSON object with health status
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        health = dns_service.check_dns_health(domain)
        
        return make_response(True, health)
        
    except Exception as e:
        logger.error(f"Error getting health for {domain}: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/lookup', methods=['GET'])
@require_auth
def lookup_record():
    """
    GET /api/dns/lookup
    Find a specific DNS record
    
    Query params:
        zone_id: Zone ID
        name: Record name
        type: Record type
    
    Returns:
        JSON object with record if found
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        zone_id = request.args.get('zone_id')
        name = request.args.get('name')
        record_type = request.args.get('type')
        
        if not zone_id or not name or not record_type:
            return make_response(
                False, 
                message="Missing required params: zone_id, name, type",
                status_code=400
            )
        
        record = dns_service.find_record(zone_id, name, record_type)
        
        if not record:
            return make_response(False, message="Record not found", status_code=404)
        
        return make_response(True, {'record': record.to_dict()})
        
    except Exception as e:
        logger.error(f"Error looking up DNS record: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/ddns/update', methods=['POST'])
@require_auth
def update_dynamic_dns():
    """
    POST /api/dns/ddns/update
    Update Dynamic DNS - sync local subdomains to current public IP
    
    JSON body (optional):
        force: Force update even if IP hasn't changed (default: false)
    
    Returns:
        JSON object with update results
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        data = request.get_json() or {}
        force = data.get('force', False)
        ip_override = data.get('ip')
        
        result = dns_service.update_dynamic_dns(force=force, ip_override=ip_override)
        
        if not result.get('success'):
            return make_response(False, message=result.get('error'), status_code=500)
        
        return make_response(True, {
            'current_ip': result.get('current_ip'),
            'updated': result.get('updated', []),
            'unchanged': result.get('unchanged', []),
            'failed': result.get('failed', []),
            'message': f"Updated {len(result.get('updated', []))} records, {len(result.get('unchanged', []))} unchanged"
        })
        
    except Exception as e:
        logger.error(f"Error updating Dynamic DNS: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/ddns/status', methods=['GET'])
@require_auth
def get_ddns_status():
    """
    GET /api/dns/ddns/status
    Get Dynamic DNS status - current IP and configured subdomains
    
    Returns:
        JSON object with DDNS status
    """
    try:
        if not dns_service.is_configured:
            return make_response(False, message="Cloudflare API not configured", status_code=503)
        
        current_ip = dns_service.get_current_public_ip()
        subdomains = dns_service.get_local_subdomains()
        
        subdomain_status = []
        for subdomain in subdomains:
            parts = subdomain.split('.')
            root_domain = '.'.join(parts[-2:])
            zone = dns_service.get_zone_by_name(root_domain)
            
            if zone:
                record = dns_service.find_record(zone.id, subdomain, "A")
                subdomain_status.append({
                    "name": subdomain,
                    "current_dns_ip": record.content if record else None,
                    "matches_current_ip": record.content == current_ip if record else False,
                    "proxied": record.proxied if record else None
                })
            else:
                subdomain_status.append({
                    "name": subdomain,
                    "current_dns_ip": None,
                    "error": f"Zone not found for {root_domain}"
                })
        
        needs_update = any(
            not s.get('matches_current_ip', False) 
            for s in subdomain_status 
            if 'error' not in s
        )
        
        return make_response(True, {
            'current_public_ip': current_ip,
            'subdomains': subdomain_status,
            'needs_update': needs_update,
            'configured_count': len(subdomains)
        })
        
    except Exception as e:
        logger.error(f"Error getting DDNS status: {e}")
        return make_response(False, message=str(e), status_code=500)


@dns_bp.route('/api/dns/ddns/subdomains', methods=['GET', 'POST', 'DELETE'])
@require_auth
def manage_ddns_subdomains():
    """
    GET/POST/DELETE /api/dns/ddns/subdomains
    Manage subdomains tracked by Dynamic DNS
    
    GET: List all tracked subdomains
    POST: Add a subdomain (JSON: {"subdomain": "example.domain.com"})
    DELETE: Remove a subdomain (JSON: {"subdomain": "example.domain.com"})
    
    Returns:
        JSON object with subdomain list
    """
    try:
        if request.method == 'GET':
            return make_response(True, {
                'subdomains': dns_service.get_local_subdomains()
            })
        
        data = request.get_json()
        if not data or not data.get('subdomain'):
            return make_response(False, message="subdomain field required", status_code=400)
        
        subdomain = data['subdomain']
        
        if request.method == 'POST':
            if dns_service.add_local_subdomain(subdomain):
                return make_response(True, {
                    'message': f"Added {subdomain} to Dynamic DNS",
                    'subdomains': dns_service.get_local_subdomains()
                })
            else:
                return make_response(False, message=f"{subdomain} already tracked", status_code=400)
        
        elif request.method == 'DELETE':
            if dns_service.remove_local_subdomain(subdomain):
                return make_response(True, {
                    'message': f"Removed {subdomain} from Dynamic DNS",
                    'subdomains': dns_service.get_local_subdomains()
                })
            else:
                return make_response(False, message=f"{subdomain} not found", status_code=404)
        
        return make_response(False, message="Method not allowed", status_code=405)
        
    except Exception as e:
        logger.error(f"Error managing DDNS subdomains: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['dns_bp']
