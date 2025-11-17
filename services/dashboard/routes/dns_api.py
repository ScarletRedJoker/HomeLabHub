"""DNS Records REST API for ZoneEdit Management

This module provides a complete REST API for managing ZoneEdit DNS records,
similar to the ZoneEdit web interface.

Endpoints:
    GET    /api/dns/zones                    - List all zones/domains
    GET    /api/dns/records/:zone            - List all DNS records for a zone
    POST   /api/dns/records/:zone            - Create new DNS record
    PUT    /api/dns/records/:zone/:recordId  - Update DNS record
    DELETE /api/dns/records/:zone/:recordId  - Delete DNS record
"""

from flask import Blueprint, jsonify, request, make_response
from utils.auth import require_auth
from integrations.zoneedit_service import ZoneEditService
import logging
import csv
import io
from datetime import datetime

logger = logging.getLogger(__name__)

dns_bp = Blueprint('dns', __name__, url_prefix='/api/dns')


@dns_bp.route('/zones', methods=['GET'])
@require_auth
def list_zones():
    """List all zones/domains from ZoneEdit
    
    Returns:
        JSON response with zones list and counts
        
    Example Response:
        {
            "success": true,
            "zones": [
                {"name": "rig-city.com", "record_count": 15},
                {"name": "scarletredjoker.com", "record_count": 8}
            ],
            "count": 2,
            "timestamp": "2025-11-17T10:30:00.000Z"
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables',
                'setup_instructions': 'Visit https://www.zoneedit.com to get your API credentials'
            }), 503
        
        success, result = zoneedit.list_zones()
        
        if success:
            return jsonify({
                'success': True,
                'zones': result.get('zones', []),
                'count': result.get('count', 0),
                'timestamp': result.get('timestamp')
            }), 200
        else:
            logger.error(f"Failed to list zones: {result}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to retrieve zones'),
                'message': result.get('message', 'Unknown error'),
                'status_code': result.get('status_code')
            }), 500
            
    except Exception as e:
        logger.error(f"Error listing zones: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@dns_bp.route('/records/<zone>', methods=['GET'])
@require_auth
def list_records(zone):
    """List all DNS records for a specific zone
    
    Args:
        zone: Domain zone name (e.g., 'rig-city.com')
        
    Query Parameters:
        type: Optional record type filter (A, AAAA, CNAME, MX, TXT, NS, DYN)
        
    Returns:
        JSON response with DNS records
        
    Example Response:
        {
            "success": true,
            "zone": "rig-city.com",
            "records": [
                {
                    "id": "123456",
                    "type": "A",
                    "host": "www",
                    "value": "192.168.1.1",
                    "ttl": 300
                }
            ],
            "count": 1,
            "timestamp": "2025-11-17T10:30:00.000Z"
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables'
            }), 503
        
        record_type = request.args.get('type')
        
        success, result = zoneedit.list_records(zone, record_type)
        
        if success:
            return jsonify({
                'success': True,
                'zone': result.get('zone'),
                'records': result.get('records', []),
                'count': result.get('count', 0),
                'timestamp': result.get('timestamp')
            }), 200
        else:
            logger.error(f"Failed to list records for {zone}: {result}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to retrieve records'),
                'message': result.get('message', 'Unknown error'),
                'zone': zone,
                'status_code': result.get('status_code')
            }), 500
            
    except Exception as e:
        logger.error(f"Error listing records for {zone}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e),
            'zone': zone
        }), 500


@dns_bp.route('/records/<zone>', methods=['POST'])
@require_auth
def create_record(zone):
    """Create a new DNS record in the specified zone
    
    Args:
        zone: Domain zone name (e.g., 'rig-city.com')
        
    Request JSON Body:
        {
            "type": "A",
            "host": "stream",
            "value": "74.76.32.151",
            "ttl": 300
        }
        
    Note:
        - Use "@" for host to create a root domain record
        - Supported types: A, AAAA, CNAME, MX, TXT, NS, DYN
        - TTL defaults to 300 seconds if not specified
        
    Returns:
        JSON response with created record details
        
    Example Response:
        {
            "success": true,
            "message": "DNS record created successfully",
            "record": {
                "record_id": "789012",
                "zone": "rig-city.com",
                "type": "A",
                "host": "stream",
                "value": "74.76.32.151",
                "ttl": 300,
                "created_at": "2025-11-17T10:30:00.000Z"
            }
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables'
            }), 503
        
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Invalid request',
                'message': 'Request body must be valid JSON'
            }), 400
        
        required_fields = ['type', 'host', 'value']
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            return jsonify({
                'success': False,
                'error': 'Missing required fields',
                'message': f'Required fields: {", ".join(missing_fields)}',
                'required_fields': required_fields
            }), 400
        
        record_type = data['type'].upper()
        host = data['host']
        value = data['value']
        ttl = data.get('ttl', 300)
        
        if record_type not in ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'DYN']:
            return jsonify({
                'success': False,
                'error': 'Invalid record type',
                'message': f'Unsupported record type: {record_type}',
                'supported_types': ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'DYN']
            }), 400
        
        if not isinstance(ttl, int) or ttl < 60 or ttl > 86400:
            return jsonify({
                'success': False,
                'error': 'Invalid TTL',
                'message': 'TTL must be an integer between 60 and 86400 seconds'
            }), 400
        
        success, result = zoneedit.create_record(zone, record_type, host, value, ttl)
        
        if success:
            logger.info(f"Created {record_type} record: {host}.{zone} -> {value}")
            return jsonify({
                'success': True,
                'message': f'DNS record created successfully',
                'record': result
            }), 201
        else:
            logger.error(f"Failed to create record in {zone}: {result}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Record creation failed'),
                'message': result.get('message', 'Unknown error'),
                'zone': zone
            }), 400
            
    except Exception as e:
        logger.error(f"Error creating record in {zone}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e),
            'zone': zone
        }), 500


@dns_bp.route('/records/<zone>/<record_id>', methods=['PUT', 'PATCH'])
@require_auth
def update_record(zone, record_id):
    """Update an existing DNS record
    
    Args:
        zone: Domain zone name (e.g., 'rig-city.com')
        record_id: ID of the record to update
        
    Request JSON Body:
        {
            "value": "192.168.1.100",
            "ttl": 600
        }
        
    Note:
        - TTL is optional, if not provided, existing TTL is kept
        - You cannot change record type or host, only value and TTL
        
    Returns:
        JSON response with updated record details
        
    Example Response:
        {
            "success": true,
            "message": "DNS record updated successfully",
            "record": {
                "record_id": "789012",
                "zone": "rig-city.com",
                "value": "192.168.1.100",
                "ttl": 600,
                "updated_at": "2025-11-17T10:35:00.000Z"
            }
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables'
            }), 503
        
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'Invalid request',
                'message': 'Request body must be valid JSON'
            }), 400
        
        if 'value' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing required field',
                'message': 'Field "value" is required'
            }), 400
        
        value = data['value']
        ttl = data.get('ttl')
        
        if ttl is not None:
            if not isinstance(ttl, int) or ttl < 60 or ttl > 86400:
                return jsonify({
                    'success': False,
                    'error': 'Invalid TTL',
                    'message': 'TTL must be an integer between 60 and 86400 seconds'
                }), 400
        
        success, result = zoneedit.update_record(zone, record_id, value, ttl)
        
        if success:
            logger.info(f"Updated record {record_id} in {zone} -> {value}")
            return jsonify({
                'success': True,
                'message': 'DNS record updated successfully',
                'record': result
            }), 200
        else:
            logger.error(f"Failed to update record {record_id} in {zone}: {result}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Record update failed'),
                'message': result.get('message', 'Unknown error'),
                'zone': zone,
                'record_id': record_id
            }), 400
            
    except Exception as e:
        logger.error(f"Error updating record {record_id} in {zone}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e),
            'zone': zone,
            'record_id': record_id
        }), 500


@dns_bp.route('/records/<zone>/<record_id>', methods=['DELETE'])
@require_auth
def delete_record(zone, record_id):
    """Delete a DNS record
    
    Args:
        zone: Domain zone name (e.g., 'rig-city.com')
        record_id: ID of the record to delete
        
    Returns:
        JSON response confirming deletion
        
    Example Response:
        {
            "success": true,
            "message": "DNS record deleted successfully",
            "record_id": "789012",
            "zone": "rig-city.com",
            "deleted_at": "2025-11-17T10:40:00.000Z"
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables'
            }), 503
        
        success, result = zoneedit.delete_record(zone, record_id)
        
        if success:
            logger.info(f"Deleted record {record_id} from {zone}")
            return jsonify({
                'success': True,
                'message': 'DNS record deleted successfully',
                'record_id': result.get('record_id'),
                'zone': result.get('zone'),
                'deleted_at': result.get('deleted_at')
            }), 200
        else:
            logger.error(f"Failed to delete record {record_id} from {zone}: {result}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Record deletion failed'),
                'message': result.get('message', 'Unknown error'),
                'zone': zone,
                'record_id': record_id
            }), 400
            
    except Exception as e:
        logger.error(f"Error deleting record {record_id} from {zone}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e),
            'zone': zone,
            'record_id': record_id
        }), 500


@dns_bp.route('/export/<zone>/json', methods=['GET'])
@require_auth
def export_json(zone):
    """Export all DNS records for a zone as JSON
    
    Args:
        zone: Domain zone name (e.g., 'rig-city.com')
        
    Returns:
        JSON file download with all DNS records
        
    Example Response:
        {
            "zone": "rig-city.com",
            "exported_at": "2025-11-17T10:30:00.000Z",
            "records": [
                {"type": "A", "host": "@", "value": "74.76.32.151", "ttl": 300}
            ]
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables'
            }), 503
        
        success, result = zoneedit.list_records(zone)
        
        if not success:
            logger.error(f"Failed to export records for {zone}: {result}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to retrieve records'),
                'message': result.get('message', 'Unknown error')
            }), 500
        
        records = result.get('records', [])
        
        export_data = {
            'zone': zone,
            'exported_at': datetime.utcnow().isoformat() + 'Z',
            'records': [
                {
                    'type': record.get('type'),
                    'host': record.get('host', '@'),
                    'value': record.get('value', record.get('content', '')),
                    'ttl': record.get('ttl', 300)
                }
                for record in records
            ]
        }
        
        filename = f"{zone}-dns-{datetime.utcnow().strftime('%Y-%m-%d')}.json"
        
        response = make_response(jsonify(export_data))
        response.headers['Content-Type'] = 'application/json'
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        
        logger.info(f"Exported {len(records)} records from {zone} as JSON")
        
        return response
        
    except Exception as e:
        logger.error(f"Error exporting JSON for {zone}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@dns_bp.route('/export/<zone>/csv', methods=['GET'])
@require_auth
def export_csv(zone):
    """Export all DNS records for a zone as CSV
    
    Args:
        zone: Domain zone name (e.g., 'rig-city.com')
        
    Returns:
        CSV file download with all DNS records
        
    Example CSV:
        type,host,value,ttl
        A,@,74.76.32.151,300
        A,stream,74.76.32.151,300
        CNAME,www,rig-city.com.,3600
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables'
            }), 503
        
        success, result = zoneedit.list_records(zone)
        
        if not success:
            logger.error(f"Failed to export records for {zone}: {result}")
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to retrieve records'),
                'message': result.get('message', 'Unknown error')
            }), 500
        
        records = result.get('records', [])
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        writer.writerow(['type', 'host', 'value', 'ttl'])
        
        for record in records:
            writer.writerow([
                record.get('type', ''),
                record.get('host', '@'),
                record.get('value', record.get('content', '')),
                record.get('ttl', 300)
            ])
        
        csv_data = output.getvalue()
        output.close()
        
        filename = f"{zone}-dns-{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
        
        response = make_response(csv_data)
        response.headers['Content-Type'] = 'text/csv'
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        
        logger.info(f"Exported {len(records)} records from {zone} as CSV")
        
        return response
        
    except Exception as e:
        logger.error(f"Error exporting CSV for {zone}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@dns_bp.route('/import/<zone>', methods=['POST'])
@require_auth
def import_records(zone):
    """Import DNS records from JSON or CSV file
    
    Args:
        zone: Domain zone name (e.g., 'rig-city.com')
        
    Request Body:
        - For JSON: {"records": [...]}
        - For CSV: type,host,value,ttl format
        
    Query Parameters:
        dry_run: Set to 'true' to validate without creating records
        
    Returns:
        JSON response with import summary
        
    Example Response:
        {
            "success": true,
            "summary": {
                "total": 10,
                "created": 8,
                "skipped": 2,
                "errors": 0
            },
            "details": [
                {"type": "A", "host": "www", "status": "created"},
                {"type": "A", "host": "api", "status": "skipped", "reason": "duplicate"}
            ]
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'error': 'ZoneEdit not configured',
                'message': 'Please set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD environment variables'
            }), 503
        
        dry_run = request.args.get('dry_run', '').lower() == 'true'
        content_type = request.content_type or ''
        
        records_to_import = []
        
        if 'application/json' in content_type:
            data = request.get_json()
            if not data or 'records' not in data:
                return jsonify({
                    'success': False,
                    'error': 'Invalid JSON',
                    'message': 'Request must contain "records" array'
                }), 400
            
            records_to_import = data['records']
            
        elif 'text/csv' in content_type or 'multipart/form-data' in content_type:
            if 'file' in request.files:
                csv_file = request.files['file']
                csv_content = csv_file.read().decode('utf-8')
            else:
                csv_content = request.get_data(as_text=True)
            
            csv_reader = csv.DictReader(io.StringIO(csv_content))
            records_to_import = []
            
            for row in csv_reader:
                if row.get('type') and row.get('host') and row.get('value'):
                    records_to_import.append({
                        'type': row['type'].upper(),
                        'host': row['host'],
                        'value': row['value'],
                        'ttl': int(row.get('ttl', 300))
                    })
        else:
            return jsonify({
                'success': False,
                'error': 'Unsupported content type',
                'message': 'Use application/json or text/csv'
            }), 415
        
        if not records_to_import:
            return jsonify({
                'success': False,
                'error': 'No records to import',
                'message': 'The import file contains no valid records'
            }), 400
        
        valid_types = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'DYN']
        
        for record in records_to_import:
            if record.get('type', '').upper() not in valid_types:
                return jsonify({
                    'success': False,
                    'error': 'Invalid record type',
                    'message': f"Unsupported record type: {record.get('type')}",
                    'supported_types': valid_types
                }), 400
            
            if 'ttl' in record:
                ttl = record['ttl']
                if not isinstance(ttl, int) or ttl < 60 or ttl > 86400:
                    return jsonify({
                        'success': False,
                        'error': 'Invalid TTL',
                        'message': f'TTL must be between 60 and 86400 seconds (record: {record.get("host")})'
                    }), 400
        
        if dry_run:
            return jsonify({
                'success': True,
                'dry_run': True,
                'message': 'Validation successful',
                'preview': {
                    'total': len(records_to_import),
                    'records': records_to_import
                }
            }), 200
        
        success_list, result = zoneedit.list_records(zone)
        existing_records = result.get('records', []) if success_list else []
        existing_hosts = {f"{r.get('type')}:{r.get('host', '@')}" for r in existing_records}
        
        summary = {
            'total': len(records_to_import),
            'created': 0,
            'skipped': 0,
            'errors': 0
        }
        details = []
        
        for record in records_to_import:
            record_type = record['type'].upper()
            host = record.get('host', '@')
            value = record['value']
            ttl = record.get('ttl', 300)
            
            record_key = f"{record_type}:{host}"
            
            if record_key in existing_hosts:
                summary['skipped'] += 1
                details.append({
                    'type': record_type,
                    'host': host,
                    'value': value,
                    'status': 'skipped',
                    'reason': 'Duplicate record already exists'
                })
                logger.warning(f"Skipped duplicate record: {record_type} {host} in {zone}")
                continue
            
            success, create_result = zoneedit.create_record(zone, record_type, host, value, ttl)
            
            if success:
                summary['created'] += 1
                details.append({
                    'type': record_type,
                    'host': host,
                    'value': value,
                    'status': 'created'
                })
                logger.info(f"Created record: {record_type} {host} -> {value} in {zone}")
            else:
                summary['errors'] += 1
                details.append({
                    'type': record_type,
                    'host': host,
                    'value': value,
                    'status': 'error',
                    'reason': create_result.get('message', 'Unknown error')
                })
                logger.error(f"Failed to create record: {record_type} {host} in {zone}: {create_result}")
        
        logger.info(f"Import complete for {zone}: {summary['created']} created, {summary['skipped']} skipped, {summary['errors']} errors")
        
        return jsonify({
            'success': True,
            'message': f"Import complete: {summary['created']} records created",
            'summary': summary,
            'details': details
        }), 200
        
    except Exception as e:
        logger.error(f"Error importing records for {zone}: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500


@dns_bp.route('/health', methods=['GET'])
def dns_health():
    """Check ZoneEdit API availability and configuration status
    
    Returns:
        JSON response with health status
        
    Example Response:
        {
            "success": true,
            "enabled": true,
            "message": "ZoneEdit API is available",
            "username": "scarletredjoker",
            "authenticated": true
        }
    """
    try:
        zoneedit = ZoneEditService()
        
        if not zoneedit.enabled:
            return jsonify({
                'success': False,
                'enabled': False,
                'message': 'ZoneEdit not configured. Set ZONEEDIT_USERNAME and ZONEEDIT_PASSWORD to enable.',
                'configuration': {
                    'username_set': bool(zoneedit.username),
                    'password_set': bool(zoneedit.password),
                    'api_token_set': bool(zoneedit.api_token)
                }
            }), 503
        
        success, result = zoneedit.authenticate()
        
        if success:
            return jsonify({
                'success': True,
                'enabled': True,
                'message': 'ZoneEdit API is available',
                'username': result.get('username'),
                'authenticated': result.get('authenticated'),
                'timestamp': result.get('timestamp')
            }), 200
        else:
            return jsonify({
                'success': False,
                'enabled': True,
                'message': 'ZoneEdit authentication failed',
                'error': result.get('error'),
                'details': result.get('message')
            }), 503
            
    except Exception as e:
        logger.error(f"Error checking DNS health: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'enabled': False,
            'error': 'Internal server error',
            'message': str(e)
        }), 500
