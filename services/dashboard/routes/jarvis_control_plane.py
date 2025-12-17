"""
Jarvis Control Plane API
Unified API for AI-powered homelab management from code-server
Uses existing service_ops abstractions for Docker operations
"""
from flask import Blueprint, jsonify, request
from datetime import datetime
import logging

from config import Config  # type: ignore[import-not-found]
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


@jarvis_control_bp.route('/incidents', methods=['GET'])
@require_auth
def list_incidents():
    """
    GET /api/jarvis/control/incidents
    List all incidents with optional filters
    """
    try:
        from services.remediation_service import remediation_service
        
        status = request.args.get('status')
        severity = request.args.get('severity')
        service_name = request.args.get('service')
        limit = request.args.get('limit', 50, type=int)
        include_resolved = request.args.get('include_resolved', 'false').lower() == 'true'
        
        incidents = remediation_service.list_incidents(
            status=status,
            severity=severity,
            service_name=service_name,
            limit=limit,
            include_resolved=include_resolved
        )
        
        severity_counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0}
        status_counts = {'detected': 0, 'analyzing': 0, 'remediating': 0, 'resolved': 0, 'escalated': 0, 'failed': 0}
        
        for inc in incidents:
            sev = inc.get('severity', 'medium')
            stat = inc.get('status', 'detected')
            if sev in severity_counts:
                severity_counts[sev] += 1
            if stat in status_counts:
                status_counts[stat] += 1
        
        return jsonify({
            'success': True,
            'incidents': incidents,
            'summary': {
                'total': len(incidents),
                'by_severity': severity_counts,
                'by_status': status_counts
            },
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing incidents: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/incidents', methods=['POST'])
@require_auth
def create_incident():
    """
    POST /api/jarvis/control/incidents
    Create a new incident manually
    """
    try:
        from services.remediation_service import remediation_service
        
        data = request.get_json() or {}
        
        required = ['type', 'service_name', 'title']
        for field in required:
            if not data.get(field):
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        result = remediation_service.create_incident(
            incident_type=data.get('type'),
            service_name=data.get('service_name'),
            title=data.get('title'),
            host_id=data.get('host_id'),
            container_name=data.get('container_name'),
            description=data.get('description'),
            severity=data.get('severity', 'medium'),
            trigger_source='manual',
            trigger_details=data.get('details')
        )
        
        return jsonify(result), 201 if result.get('success') else 400
        
    except Exception as e:
        logger.error(f"Error creating incident: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/incidents/<incident_id>', methods=['GET'])
@require_auth
def get_incident(incident_id):
    """
    GET /api/jarvis/control/incidents/<incident_id>
    Get details of a specific incident
    """
    try:
        from services.remediation_service import remediation_service
        
        incident = remediation_service.get_incident(incident_id)
        
        if not incident:
            return jsonify({
                'success': False,
                'error': 'Incident not found'
            }), 404
        
        return jsonify({
            'success': True,
            'incident': incident,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting incident: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/incidents/<incident_id>/analyze', methods=['POST'])
@require_auth
def analyze_incident(incident_id):
    """
    POST /api/jarvis/control/incidents/<incident_id>/analyze
    Run AI analysis on an incident
    """
    try:
        from services.remediation_service import remediation_service
        
        result = remediation_service.analyze_issue(incident_id)
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        logger.error(f"Error analyzing incident: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/incidents/<incident_id>/remediate', methods=['POST'])
@require_auth
def remediate_incident(incident_id):
    """
    POST /api/jarvis/control/incidents/<incident_id>/remediate
    Execute remediation for an incident
    
    Request body:
        playbook_id: ID of playbook to execute (optional)
        params: Parameters for playbook execution
        dry_run: If true, only simulate
        confirmed: Required for high-risk playbooks
    """
    try:
        from services.remediation_service import remediation_service
        
        data = request.get_json() or {}
        
        result = remediation_service.execute_playbook(
            incident_id=incident_id,
            playbook_id=data.get('playbook_id'),
            params=data.get('params'),
            dry_run=data.get('dry_run', False),
            auto_execute=False
        )
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        logger.error(f"Error remediating incident: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/incidents/<incident_id>/escalate', methods=['POST'])
@require_auth
def escalate_incident(incident_id):
    """
    POST /api/jarvis/control/incidents/<incident_id>/escalate
    Escalate an incident to human operators
    """
    try:
        from services.remediation_service import remediation_service
        
        data = request.get_json() or {}
        reason = data.get('reason', 'Escalated by user')
        notify_channels = data.get('notify_channels', [])
        
        result = remediation_service.escalate_to_human(
            incident_id=incident_id,
            reason=reason,
            notify_channels=notify_channels
        )
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        logger.error(f"Error escalating incident: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/incidents/<incident_id>/status', methods=['PATCH'])
@require_auth
def update_incident_status(incident_id):
    """
    PATCH /api/jarvis/control/incidents/<incident_id>/status
    Update the status of an incident
    """
    try:
        from services.remediation_service import remediation_service
        
        data = request.get_json() or {}
        
        if not data.get('status'):
            return jsonify({
                'success': False,
                'error': 'Status is required'
            }), 400
        
        result = remediation_service.update_incident_status(
            incident_id=incident_id,
            status=data.get('status'),
            notes=data.get('notes'),
            **data
        )
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        logger.error(f"Error updating incident status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/incidents/detect', methods=['POST'])
@require_auth
def detect_incidents():
    """
    POST /api/jarvis/control/incidents/detect
    Automatically detect issues and create incidents
    """
    try:
        from services.remediation_service import remediation_service
        
        incidents = remediation_service.detect_and_create_incidents()
        
        return jsonify({
            'success': True,
            'incidents_created': len(incidents),
            'incidents': incidents,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error detecting incidents: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/playbooks', methods=['GET'])
@require_auth
def list_playbooks():
    """
    GET /api/jarvis/control/playbooks
    List available remediation playbooks
    """
    try:
        from services.remediation_service import remediation_service
        
        applicable_to = request.args.get('applicable_to')
        
        playbooks = remediation_service.get_playbooks(applicable_to=applicable_to)
        
        return jsonify({
            'success': True,
            'playbooks': playbooks,
            'count': len(playbooks),
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error listing playbooks: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/playbooks/<playbook_id>', methods=['GET'])
@require_auth
def get_playbook(playbook_id):
    """
    GET /api/jarvis/control/playbooks/<playbook_id>
    Get details of a specific playbook
    """
    try:
        from services.remediation_service import remediation_service
        
        playbooks = remediation_service.get_playbooks()
        playbook = next((p for p in playbooks if p.get('id') == playbook_id), None)
        
        if not playbook:
            return jsonify({
                'success': False,
                'error': 'Playbook not found'
            }), 404
        
        return jsonify({
            'success': True,
            'playbook': playbook,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting playbook: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/auto-remediation/settings', methods=['GET'])
@require_auth
def get_auto_remediation_settings():
    """
    GET /api/jarvis/control/auto-remediation/settings
    Get current auto-remediation settings
    """
    try:
        from services.remediation_service import remediation_service
        
        result = remediation_service.get_auto_remediation_settings()
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error getting auto-remediation settings: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/auto-remediation/settings', methods=['POST'])
@require_auth
def update_auto_remediation_settings():
    """
    POST /api/jarvis/control/auto-remediation/settings
    Update auto-remediation settings
    """
    try:
        from services.remediation_service import remediation_service
        
        data = request.get_json() or {}
        
        result = remediation_service.update_auto_remediation_settings(
            playbook_id=data.get('playbook_id'),
            service_name=data.get('service_name'),
            enabled=data.get('enabled', True),
            **data
        )
        
        return jsonify(result), 200 if result.get('success') else 400
        
    except Exception as e:
        logger.error(f"Error updating auto-remediation settings: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@jarvis_control_bp.route('/learning/stats', methods=['GET'])
@require_auth
def get_learning_stats():
    """
    GET /api/jarvis/control/learning/stats
    Get learning statistics from past incidents
    """
    try:
        from services.remediation_service import remediation_service
        
        result = remediation_service.get_learning_stats()
        
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error getting learning stats: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
