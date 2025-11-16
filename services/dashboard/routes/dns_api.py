"""
DNS API Routes - REST API for PowerDNS management and DynDNS automation
"""

from flask import Blueprint, jsonify, request
from utils.auth import require_auth
from services.dns_service import LocalDNSService
from models import get_session, DynDNSHost
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

dns_bp = Blueprint('dns', __name__, url_prefix='/api/dns')


# ============================================
# Zone Management Endpoints
# ============================================

@dns_bp.route('/zones', methods=['GET'])
@require_auth
def list_zones():
    """List all DNS zones"""
    try:
        dns_service = LocalDNSService()
        success, result = dns_service.list_zones()
        
        if success:
            return jsonify({
                'success': True,
                'zones': result
            })
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 500
            
    except Exception as e:
        logger.error(f"Error listing zones: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/zones', methods=['POST'])
@require_auth
def create_zone():
    """Create new DNS zone"""
    try:
        data = request.get_json()
        
        if not data or 'name' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field: name'
            }), 400
        
        zone_name = data['name']
        kind = data.get('kind', 'Native')
        nameservers = data.get('nameservers', [])
        
        # Validate zone name
        if not zone_name or len(zone_name) < 3:
            return jsonify({
                'success': False,
                'error': 'Invalid zone name'
            }), 400
        
        dns_service = LocalDNSService()
        success, result = dns_service.create_zone(zone_name, kind, nameservers)
        
        if success:
            logger.info(f"Created zone: {zone_name}")
            return jsonify({
                'success': True,
                'zone': result
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 400
            
    except Exception as e:
        logger.error(f"Error creating zone: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/zones/<zone_name>', methods=['GET'])
@require_auth
def get_zone(zone_name):
    """Get zone details"""
    try:
        dns_service = LocalDNSService()
        success, result = dns_service.get_zone(zone_name)
        
        if success:
            return jsonify({
                'success': True,
                'zone': result
            })
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 404
            
    except Exception as e:
        logger.error(f"Error getting zone: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/zones/<zone_name>', methods=['DELETE'])
@require_auth
def delete_zone(zone_name):
    """Delete DNS zone"""
    try:
        dns_service = LocalDNSService()
        success, result = dns_service.delete_zone(zone_name)
        
        if success:
            logger.info(f"Deleted zone: {zone_name}")
            return jsonify({
                'success': True,
                'message': f'Zone {zone_name} deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 400
            
    except Exception as e:
        logger.error(f"Error deleting zone: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================
# Record Management Endpoints
# ============================================

@dns_bp.route('/records', methods=['GET'])
@require_auth
def list_records():
    """List DNS records, optionally filtered by zone"""
    try:
        zone = request.args.get('zone')
        rtype = request.args.get('type')
        
        if not zone:
            return jsonify({
                'success': False,
                'error': 'Missing required parameter: zone'
            }), 400
        
        dns_service = LocalDNSService()
        success, result = dns_service.list_records(zone, rtype)
        
        if success:
            return jsonify({
                'success': True,
                'records': result,
                'zone': zone,
                'count': len(result)
            })
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 500
            
    except Exception as e:
        logger.error(f"Error listing records: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/records', methods=['POST'])
@require_auth
def create_record():
    """Create DNS record"""
    try:
        data = request.get_json()
        
        required_fields = ['zone', 'name', 'type', 'content']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        zone = data['zone']
        name = data['name']
        rtype = data['type']
        content = data['content']
        ttl = data.get('ttl', 300)
        
        # Validate TTL
        if not isinstance(ttl, int) or ttl < 60 or ttl > 86400:
            return jsonify({
                'success': False,
                'error': 'TTL must be an integer between 60 and 86400 seconds'
            }), 400
        
        dns_service = LocalDNSService()
        success, result = dns_service.create_record(zone, name, rtype, content, ttl)
        
        if success:
            logger.info(f"Created {rtype} record: {name} -> {content}")
            return jsonify({
                'success': True,
                'message': f'Record created successfully',
                'record': {
                    'zone': zone,
                    'name': name,
                    'type': rtype,
                    'content': content,
                    'ttl': ttl
                }
            }), 201
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 400
            
    except Exception as e:
        logger.error(f"Error creating record: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/records/<path:record_name>', methods=['PATCH'])
@require_auth
def update_record(record_name):
    """Update DNS record"""
    try:
        data = request.get_json()
        
        required_fields = ['zone', 'type', 'content']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        zone = data['zone']
        rtype = data['type']
        content = data['content']
        ttl = data.get('ttl', 300)
        
        dns_service = LocalDNSService()
        success, result = dns_service.update_record(zone, record_name, rtype, content, ttl)
        
        if success:
            logger.info(f"Updated {rtype} record: {record_name} -> {content}")
            return jsonify({
                'success': True,
                'message': 'Record updated successfully',
                'record': {
                    'zone': zone,
                    'name': record_name,
                    'type': rtype,
                    'content': content,
                    'ttl': ttl
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 400
            
    except Exception as e:
        logger.error(f"Error updating record: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/records/<path:record_name>', methods=['DELETE'])
@require_auth
def delete_record(record_name):
    """Delete DNS record"""
    try:
        zone = request.args.get('zone')
        rtype = request.args.get('type')
        
        if not zone or not rtype:
            return jsonify({
                'success': False,
                'error': 'Missing required parameters: zone, type'
            }), 400
        
        dns_service = LocalDNSService()
        success, result = dns_service.delete_record(zone, record_name, rtype)
        
        if success:
            logger.info(f"Deleted {rtype} record: {record_name} from zone {zone}")
            return jsonify({
                'success': True,
                'message': f'Record {record_name} deleted successfully'
            })
        else:
            return jsonify({
                'success': False,
                'error': result
            }), 400
            
    except Exception as e:
        logger.error(f"Error deleting record: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================
# DynDNS Management Endpoints
# ============================================

@dns_bp.route('/dyndns/enable', methods=['POST'])
@require_auth
def enable_dyndns():
    """Enable DynDNS tracking for a hostname"""
    try:
        data = request.get_json()
        
        required_fields = ['zone', 'fqdn']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        zone = data['zone']
        fqdn = data['fqdn']
        record_type = data.get('record_type', 'A')
        check_interval = data.get('check_interval_seconds', 300)
        
        # Validate record type
        if record_type not in ['A', 'AAAA']:
            return jsonify({
                'success': False,
                'error': 'record_type must be A or AAAA'
            }), 400
        
        # Validate check interval
        if not isinstance(check_interval, int) or check_interval < 60:
            return jsonify({
                'success': False,
                'error': 'check_interval_seconds must be at least 60'
            }), 400
        
        session = get_session()
        try:
            # Check if already exists
            existing = session.query(DynDNSHost).filter_by(fqdn=fqdn).first()
            
            if existing:
                # Update existing
                existing.zone = zone
                existing.record_type = record_type
                existing.check_interval_seconds = check_interval
                existing.enabled = True
                existing.updated_at = datetime.utcnow()
                session.commit()
                
                logger.info(f"Updated DynDNS tracking for {fqdn}")
                return jsonify({
                    'success': True,
                    'message': f'DynDNS tracking updated for {fqdn}',
                    'dyndns_host': existing.to_dict()
                })
            else:
                # Create new
                dyndns_host = DynDNSHost(
                    zone=zone,
                    fqdn=fqdn,
                    record_type=record_type,
                    check_interval_seconds=check_interval,
                    enabled=True
                )
                session.add(dyndns_host)
                session.commit()
                
                logger.info(f"Enabled DynDNS tracking for {fqdn}")
                return jsonify({
                    'success': True,
                    'message': f'DynDNS tracking enabled for {fqdn}',
                    'dyndns_host': dyndns_host.to_dict()
                }), 201
                
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Error enabling DynDNS: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/dyndns/status', methods=['GET'])
@require_auth
def dyndns_status():
    """Get DynDNS status for all tracked hosts"""
    try:
        session = get_session()
        try:
            hosts = session.query(DynDNSHost).all()
            
            hosts_data = [host.to_dict() for host in hosts]
            
            # Get current external IP for comparison
            dns_service = LocalDNSService()
            current_ip = dns_service.get_current_external_ip()
            
            return jsonify({
                'success': True,
                'dyndns_hosts': hosts_data,
                'current_external_ip': current_ip,
                'total_hosts': len(hosts),
                'enabled_hosts': sum(1 for h in hosts if h.enabled)
            })
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Error getting DynDNS status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@dns_bp.route('/dyndns/<int:host_id>', methods=['DELETE'])
@require_auth
def disable_dyndns(host_id):
    """Disable/delete DynDNS tracking for a host"""
    try:
        session = get_session()
        try:
            host = session.query(DynDNSHost).filter_by(id=host_id).first()
            
            if not host:
                return jsonify({
                    'success': False,
                    'error': 'DynDNS host not found'
                }), 404
            
            fqdn = host.fqdn
            session.delete(host)
            session.commit()
            
            logger.info(f"Disabled DynDNS tracking for {fqdn}")
            return jsonify({
                'success': True,
                'message': f'DynDNS tracking disabled for {fqdn}'
            })
        finally:
            session.close()
            
    except Exception as e:
        logger.error(f"Error disabling DynDNS: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# ============================================
# Health Check
# ============================================

@dns_bp.route('/health', methods=['GET'])
@require_auth
def dns_health():
    """Check PowerDNS API health"""
    try:
        dns_service = LocalDNSService()
        health_status = dns_service.health_check()
        
        return jsonify({
            'success': True,
            'health': health_status
        })
    except Exception as e:
        logger.error(f"Error checking DNS health: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
