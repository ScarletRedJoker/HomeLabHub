"""
Jarvis Control Plane API
Unified API for AI-powered homelab management from code-server
Uses existing service_ops abstractions for Docker operations
"""
from flask import Blueprint, jsonify, request
from datetime import datetime
import logging

from config import Config
from services.service_ops import service_ops
from services.ai_service import AIService
from utils.auth import require_auth

logger = logging.getLogger(__name__)

jarvis_control_bp = Blueprint('jarvis_control', __name__, url_prefix='/api/jarvis/control')

ai_service = AIService()


@jarvis_control_bp.route('/services', methods=['GET'])
@require_auth
def list_services():
    """
    GET /api/jarvis/control/services
    List all homelab services and their current status using Config.SERVICES
    """
    try:
        services_status = service_ops.get_all_service_statuses()
        
        healthy_count = sum(1 for s in services_status if s.get('status') == 'running')
        
        return jsonify({
            'success': True,
            'services': services_status,
            'summary': {
                'total': len(services_status),
                'healthy': healthy_count,
                'unhealthy': len(services_status) - healthy_count
            },
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing services: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/services/<service_name>', methods=['GET'])
@require_auth
def get_service_details(service_name):
    """
    GET /api/jarvis/control/services/<name>
    Get detailed information about a specific service
    """
    try:
        if service_name not in Config.SERVICES:
            return jsonify({
                'success': False,
                'error': f'Unknown service: {service_name}. Available: {list(Config.SERVICES.keys())}'
            }), 404
        
        config = Config.SERVICES[service_name]
        container_name = config.get('container')
        
        stats = service_ops.collect_container_stats(service_name, container_name)
        logs = service_ops.get_service_logs(container_name, lines=50)
        
        return jsonify({
            'success': True,
            'service': {
                'name': service_name,
                'display_name': config.get('name'),
                'container': container_name,
                'url': config.get('url'),
                'description': config.get('description'),
                'stats': stats,
                'logs': logs
            },
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting service details: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/services/<service_name>/restart', methods=['POST'])
@require_auth
def restart_service(service_name):
    """
    POST /api/jarvis/control/services/<name>/restart
    Restart a specific service using service_ops abstraction
    """
    try:
        if service_name not in Config.SERVICES:
            return jsonify({
                'success': False,
                'error': f'Unknown service: {service_name}'
            }), 404
        
        config = Config.SERVICES[service_name]
        container_name = config.get('container')
        
        logger.info(f"[Jarvis] Restarting service: {service_name} (container: {container_name})")
        
        result = service_ops.restart_service(service_name, container_name)
        
        return jsonify({
            'success': result.get('success', False),
            'message': result.get('message', f'Restarted {service_name}'),
            'service': service_name,
            'container': container_name,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200 if result.get('success') else 500
        
    except Exception as e:
        logger.error(f"Error restarting service: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/services/<service_name>/logs', methods=['GET'])
@require_auth
def get_service_logs(service_name):
    """
    GET /api/jarvis/control/services/<name>/logs
    Get logs from a specific service
    """
    try:
        if service_name not in Config.SERVICES:
            return jsonify({
                'success': False,
                'error': f'Unknown service: {service_name}'
            }), 404
        
        lines = request.args.get('lines', 100, type=int)
        lines = min(lines, 500)
        
        config = Config.SERVICES[service_name]
        container_name = config.get('container')
        logs = service_ops.get_service_logs(container_name, lines=lines)
        
        return jsonify({
            'success': True,
            'service': service_name,
            'logs': logs,
            'lines': lines,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting logs: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/analyze', methods=['POST'])
@require_auth
def analyze_issue():
    """
    POST /api/jarvis/control/analyze
    Use AI to analyze an issue and suggest fixes
    
    Request body:
        service: Service name (optional)
        description: Description of the issue
        logs: Relevant logs (optional)
    """
    try:
        data = request.get_json() or {}
        service_name = data.get('service')
        description = data.get('description', '')
        logs = data.get('logs', '')
        
        if not description:
            return jsonify({
                'success': False,
                'error': 'Description is required'
            }), 400
        
        if service_name and service_name not in Config.SERVICES:
            return jsonify({
                'success': False,
                'error': f'Unknown service: {service_name}'
            }), 404
        
        if service_name and not logs:
            config = Config.SERVICES[service_name]
            container_name = config.get('container')
            logs = service_ops.get_service_logs(container_name, lines=100) or ''
        
        prompt = f"""You are Jarvis, the AI assistant for the Nebula Command homelab.

Analyze this issue and provide actionable recommendations:

Service: {service_name or 'Unknown'}
Issue Description: {description}

Recent Logs:
{logs[:3000] if logs else 'No logs available'}

Provide:
1. Root cause analysis
2. Recommended fix steps
3. Prevention measures
4. Commands to run (if applicable)

Be specific and actionable."""

        analysis = ai_service.chat(prompt)
        
        return jsonify({
            'success': True,
            'analysis': analysis,
            'service': service_name,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error analyzing issue: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/diagnose/<service_name>', methods=['POST'])
@require_auth
def diagnose_service(service_name):
    """
    POST /api/jarvis/control/diagnose/<name>
    Run automated diagnosis on a service using service_ops
    """
    try:
        if service_name not in Config.SERVICES:
            return jsonify({
                'success': False,
                'error': f'Unknown service: {service_name}'
            }), 404
        
        config = Config.SERVICES[service_name]
        container_name = config.get('container')
        
        health = service_ops.execute_health_check(service_name, container_name)
        logs = service_ops.get_service_logs(container_name, lines=200) or ''
        
        issues = []
        recommendations = []
        
        if not health.get('healthy'):
            issues.append(f"Service unhealthy: {health.get('message')}")
            recommendations.append(f"Restart the container: docker restart {container_name}")
        
        error_keywords = ['error', 'failed', 'exception', 'crash', 'timeout']
        log_lower = logs.lower()
        for keyword in error_keywords:
            if keyword in log_lower:
                issues.append(f"Found '{keyword}' in logs")
        
        prompt = f"""Analyze this service status:

Service: {service_name} ({config.get('name')})
Container: {container_name}
Status: {health.get('status')}
Issues Found: {', '.join(issues) if issues else 'None detected'}

Recent Logs (last 200 lines):
{logs[:2000]}

Provide a brief diagnosis and any recommended actions."""

        analysis = ai_service.chat(prompt)
        
        return jsonify({
            'success': True,
            'service': service_name,
            'health': health,
            'issues': issues,
            'recommendations': recommendations,
            'ai_analysis': analysis,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error diagnosing service: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/health-check-all', methods=['POST'])
@require_auth
def health_check_all():
    """
    POST /api/jarvis/control/health-check-all
    Run health checks on all services using service_ops
    """
    try:
        results = []
        
        for service_key, service_info in Config.SERVICES.items():
            container_name = service_info.get('container')
            if not container_name:
                continue
            
            health = service_ops.execute_health_check(service_key, container_name)
            health['display_name'] = service_info.get('name')
            results.append(health)
        
        healthy_count = sum(1 for r in results if r.get('healthy'))
        unhealthy_services = [r['service_name'] for r in results if not r.get('healthy')]
        
        return jsonify({
            'success': True,
            'results': results,
            'summary': {
                'total': len(results),
                'healthy': healthy_count,
                'unhealthy': len(results) - healthy_count,
                'unhealthy_services': unhealthy_services
            },
            'overall_status': 'healthy' if healthy_count == len(results) else 'degraded',
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error running health checks: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
