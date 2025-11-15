from flask import Blueprint, jsonify, request
from utils.auth import require_auth
import logging
import os
import json
import re
from datetime import datetime, timedelta
import subprocess

logger = logging.getLogger(__name__)

logs_api_bp = Blueprint('logs_api', __name__, url_prefix='/api/logs')

@logs_api_bp.route('', methods=['GET'])
@require_auth
def get_logs():
    """
    Get logs from Docker containers with filtering
    
    Query Parameters:
    - service: Service name (discord-bot, stream-bot, dashboard, etc.)
    - level: Log level filter (error, warn, info, debug)
    - limit: Number of log entries to return (default: 100, max: 1000)
    - since: Time period (e.g., '1h', '24h', '7d')
    """
    try:
        service = request.args.get('service')
        level = request.args.get('level', '').lower()
        limit = min(int(request.args.get('limit', 100)), 1000)
        since = request.args.get('since', '1h')
        
        if not service:
            return jsonify({'success': False, 'message': 'Service parameter is required'}), 400
        
        # Map service names to container names
        service_container_map = {
            'dashboard': 'dashboard',
            'discord-bot': 'discord-bot',
            'stream-bot': 'stream-bot',
            'n8n': 'n8n',
            'plex': 'plex-server',
            'vnc': 'vnc-desktop',
            'redis': 'redis',
            'postgres': 'postgres'
        }
        
        container_name = service_container_map.get(service)
        if not container_name:
            return jsonify({'success': False, 'message': f'Unknown service: {service}'}), 400
        
        # Get logs from Docker
        try:
            cmd = ['docker', 'logs', '--tail', str(limit), '--since', since, container_name]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                logger.error(f"Failed to get logs for {container_name}: {result.stderr}")
                return jsonify({
                    'success': False, 
                    'message': f'Container {container_name} not found or not accessible'
                }), 404
            
            # Combine stdout and stderr
            raw_logs = result.stdout + result.stderr
            log_lines = raw_logs.strip().split('\n')
            
        except subprocess.TimeoutExpired:
            return jsonify({'success': False, 'message': 'Log retrieval timed out'}), 504
        except Exception as e:
            logger.error(f"Error executing docker logs command: {e}")
            return jsonify({'success': False, 'message': 'Failed to retrieve logs'}), 500
        
        # Parse and filter logs
        parsed_logs = []
        for line in log_lines:
            if not line.strip():
                continue
            
            log_entry = parse_log_line(line, service)
            
            # Filter by log level if specified
            if level and log_entry.get('level', '').lower() != level:
                continue
            
            parsed_logs.append(log_entry)
        
        return jsonify({
            'success': True,
            'service': service,
            'container': container_name,
            'count': len(parsed_logs),
            'logs': parsed_logs
        })
        
    except ValueError as e:
        return jsonify({'success': False, 'message': 'Invalid parameter value'}), 400
    except Exception as e:
        logger.error(f"Error fetching logs: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500


@logs_api_bp.route('/services', methods=['GET'])
@require_auth
def get_available_services():
    """Get list of available services for log viewing"""
    services = [
        {'id': 'dashboard', 'name': 'Homelab Dashboard', 'container': 'dashboard'},
        {'id': 'discord-bot', 'name': 'Discord Bot', 'container': 'discord-bot'},
        {'id': 'stream-bot', 'name': 'Stream Bot', 'container': 'stream-bot'},
        {'id': 'n8n', 'name': 'n8n Automation', 'container': 'n8n'},
        {'id': 'plex', 'name': 'Plex Media Server', 'container': 'plex-server'},
        {'id': 'vnc', 'name': 'VNC Desktop', 'container': 'vnc-desktop'},
        {'id': 'redis', 'name': 'Redis', 'container': 'redis'},
        {'id': 'postgres', 'name': 'PostgreSQL', 'container': 'postgres'}
    ]
    
    return jsonify({'success': True, 'services': services})


def parse_log_line(line: str, service: str) -> dict:
    """
    Parse a log line into structured format
    Attempts to parse JSON logs first, falls back to text parsing
    """
    log_entry = {
        'timestamp': datetime.utcnow().isoformat(),
        'service': service,
        'level': 'info',
        'component': None,
        'message': line,
        'metadata': {}
    }
    
    # Try to parse as JSON (structured logs)
    try:
        if line.strip().startswith('{'):
            json_data = json.loads(line)
            
            # Extract common fields from JSON structured logs
            log_entry['timestamp'] = json_data.get('timestamp', json_data.get('time', log_entry['timestamp']))
            log_entry['level'] = json_data.get('level', json_data.get('severity', 'info')).lower()
            log_entry['message'] = json_data.get('message', json_data.get('msg', line))
            log_entry['component'] = json_data.get('component', json_data.get('module'))
            
            # Store remaining fields in metadata
            exclude_keys = {'timestamp', 'time', 'level', 'severity', 'message', 'msg', 'component', 'module', 'service'}
            log_entry['metadata'] = {k: v for k, v in json_data.items() if k not in exclude_keys}
            
            return log_entry
    except (json.JSONDecodeError, ValueError):
        pass
    
    # Try to extract timestamp from common log formats
    # Format: 2025-01-15 10:30:45 [service] [component] LEVEL: message
    timestamp_pattern = r'^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?)'
    timestamp_match = re.match(timestamp_pattern, line)
    if timestamp_match:
        log_entry['timestamp'] = timestamp_match.group(1)
        line = line[len(timestamp_match.group(0)):].strip()
    
    # Extract log level
    level_pattern = r'\b(ERROR|WARN|WARNING|INFO|DEBUG|CRITICAL|FATAL)\b'
    level_match = re.search(level_pattern, line, re.IGNORECASE)
    if level_match:
        log_entry['level'] = level_match.group(1).lower()
        if log_entry['level'] == 'warning':
            log_entry['level'] = 'warn'
    
    # Extract component/module in brackets
    component_pattern = r'\[([^\]]+)\]'
    component_matches = re.findall(component_pattern, line)
    if component_matches:
        # Use the last bracketed item as component (often more specific)
        log_entry['component'] = component_matches[-1]
    
    # Clean up message by removing extracted parts
    message = re.sub(r'^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z)?\s*', '', line)
    message = re.sub(r'\[([^\]]+)\]\s*', '', message)
    message = re.sub(r'\b(ERROR|WARN|WARNING|INFO|DEBUG|CRITICAL|FATAL)[:\s]*', '', message, flags=re.IGNORECASE)
    log_entry['message'] = message.strip()
    
    return log_entry
