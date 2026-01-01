"""
Jarvis AI API Routes
Endpoints for remediation, anomaly detection, and enhanced AI chat
"""
from flask import Blueprint, jsonify, request
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

jarvis_ai_bp = Blueprint('jarvis_ai', __name__, url_prefix='/api/jarvis')


@jarvis_ai_bp.route('/remediate/<service_name>', methods=['POST'])
def remediate_service(service_name):
    """
    POST /api/jarvis/remediate/{service}
    
    Trigger agentic remediation for a service
    
    Request body (optional):
    {
        "dry_run": false,
        "plan": null
    }
    """
    try:
        from services.jarvis_remediator import jarvis_remediator
        
        data = request.get_json() or {}
        dry_run = data.get('dry_run', False)
        plan = data.get('plan')
        
        result = jarvis_remediator.execute_remediation(
            service_name=service_name,
            plan=plan,
            dry_run=dry_run
        )
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Remediation error for {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/remediate/<service_name>/diagnose', methods=['GET'])
def diagnose_service(service_name):
    """
    GET /api/jarvis/remediate/{service}/diagnose
    
    Get AI-powered diagnosis for a service
    """
    try:
        from services.jarvis_remediator import jarvis_remediator
        
        result = jarvis_remediator.diagnose_service(service_name)
        
        status_code = 200 if result.get('success') else 404
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Diagnosis error for {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/remediate/<service_name>/plan', methods=['GET'])
def get_remediation_plan(service_name):
    """
    GET /api/jarvis/remediate/{service}/plan
    
    Generate a remediation plan for a service
    """
    try:
        from services.jarvis_remediator import jarvis_remediator
        
        issue = request.args.get('issue') or ''
        result = jarvis_remediator.generate_remediation_plan(service_name, issue)
        
        status_code = 200 if result.get('success') else 404
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Plan generation error for {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/remediate/history', methods=['GET'])
def get_remediation_history():
    """
    GET /api/jarvis/remediate/history
    
    Get remediation history
    
    Query params:
    - service: Filter by service name
    - limit: Maximum records (default 10)
    """
    try:
        from services.jarvis_remediator import jarvis_remediator
        
        service_filter: str | None = request.args.get('service')
        limit = int(request.args.get('limit', 10))
        
        history = jarvis_remediator.get_remediation_history(service_filter, limit)
        
        return jsonify({
            'success': True,
            'history': history,
            'count': len(history)
        })
        
    except Exception as e:
        logger.error(f"History retrieval error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/failures', methods=['GET'])
def detect_failures():
    """
    GET /api/jarvis/failures
    
    Detect service failures across all services
    """
    try:
        from services.jarvis_remediator import jarvis_remediator
        
        failures = jarvis_remediator.detect_failures()
        
        return jsonify({
            'success': True,
            'failures': failures,
            'count': len(failures),
            'detected_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Failure detection error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/anomalies', methods=['GET'])
def get_anomalies():
    """
    GET /api/jarvis/anomalies
    
    Detect and list anomalies in service metrics
    
    Query params:
    - service: Filter by service name
    - severity: Filter by severity (critical, high, medium, warning)
    - hours: Time window in hours (default 24)
    - detect: If true, run detection now (default true)
    """
    try:
        from services.anomaly_detection import anomaly_detector
        
        service_name = request.args.get('service')
        severity = request.args.get('severity')
        hours = int(request.args.get('hours', 24))
        detect_now = request.args.get('detect', 'true').lower() == 'true'
        
        if detect_now:
            current_anomalies = anomaly_detector.detect_all_anomalies()
        else:
            current_anomalies = []
        
        historical = anomaly_detector.get_anomaly_events(
            service_name=service_name or '',
            severity=severity or '',
            hours=hours
        )
        
        return jsonify({
            'success': True,
            'current': current_anomalies,
            'historical': historical,
            'total_current': len(current_anomalies),
            'total_historical': len(historical),
            'detected_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/anomalies/<int:anomaly_id>/acknowledge', methods=['POST'])
def acknowledge_anomaly(anomaly_id):
    """
    POST /api/jarvis/anomalies/{id}/acknowledge
    
    Acknowledge an anomaly event
    """
    try:
        from services.anomaly_detection import anomaly_detector
        
        data = request.get_json() or {}
        acknowledged_by = data.get('acknowledged_by', 'api_user')
        
        success = anomaly_detector.acknowledge_anomaly(anomaly_id, acknowledged_by)
        
        return jsonify({
            'success': success,
            'anomaly_id': anomaly_id,
            'acknowledged_by': acknowledged_by
        }), 200 if success else 404
        
    except Exception as e:
        logger.error(f"Acknowledge error for anomaly {anomaly_id}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/metrics', methods=['GET'])
def get_current_metrics():
    """
    GET /api/jarvis/metrics
    
    Get current metrics for all services
    """
    try:
        from services.anomaly_detection import anomaly_detector
        
        metrics = anomaly_detector.collect_current_metrics()
        
        return jsonify({
            'success': True,
            'metrics': metrics,
            'services_count': len(metrics),
            'collected_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error(f"Metrics collection error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/health-score/<service_name>', methods=['GET'])
def get_health_score(service_name):
    """
    GET /api/jarvis/health-score/{service}
    
    Get health score for a specific service
    """
    try:
        from services.anomaly_detection import anomaly_detector
        
        result = anomaly_detector.get_service_health_score(service_name)
        
        status_code = 200 if result.get('success') else 404
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Health score error for {service_name}: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/chat', methods=['POST'])
def enhanced_chat():
    """
    POST /api/jarvis/chat
    
    Enhanced AI chat with multi-model routing
    
    Request body:
    {
        "message": "your message",
        "conversation_history": [],
        "model": null,
        "use_cache": true,
        "user_id": null
    }
    """
    try:
        from services.enhanced_ai_service import enhanced_ai_service
        
        data = request.get_json() or {}
        
        message = data.get('message')
        if not message:
            return jsonify({
                'success': False,
                'error': 'Message is required'
            }), 400
        
        conversation_history = data.get('conversation_history', [])
        model = data.get('model')
        use_cache = data.get('use_cache', True)
        user_id = data.get('user_id')
        
        result = enhanced_ai_service.chat(
            message=message,
            conversation_history=conversation_history,
            model=model or 'gpt-4o',
            use_cache=use_cache,
            user_id=user_id or 'anonymous'
        )
        
        status_code = 200 if result.get('success') else 500
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"Enhanced chat error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/models', methods=['GET'])
def get_available_models():
    """
    GET /api/jarvis/models
    
    Get list of available AI models
    """
    try:
        from services.enhanced_ai_service import enhanced_ai_service
        
        models = enhanced_ai_service.get_available_models()
        
        return jsonify({
            'success': True,
            'models': models,
            'count': len(models)
        })
        
    except Exception as e:
        logger.error(f"Model listing error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/usage', methods=['GET'])
def get_usage_stats():
    """
    GET /api/jarvis/usage
    
    Get AI model usage statistics
    
    Query params:
    - days: Number of days to look back (default 30)
    - model: Filter by model ID
    - provider: Filter by provider
    """
    try:
        from services.enhanced_ai_service import enhanced_ai_service
        
        days = int(request.args.get('days', 30))
        model_id = request.args.get('model') or ''
        provider = request.args.get('provider') or ''
        
        stats = enhanced_ai_service.get_usage_stats(days, model_id, provider)
        
        return jsonify({
            'success': True,
            **stats
        })
        
    except Exception as e:
        logger.error(f"Usage stats error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/logs/retention', methods=['GET'])
def get_retention_report():
    """
    GET /api/jarvis/logs/retention
    
    Get log retention report
    """
    try:
        from services.log_retention import log_retention_service
        
        report = log_retention_service.get_retention_report()
        
        return jsonify({
            'success': True,
            **report
        })
        
    except Exception as e:
        logger.error(f"Retention report error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/logs/cleanup', methods=['POST'])
def run_log_cleanup():
    """
    POST /api/jarvis/logs/cleanup
    
    Run log cleanup
    
    Request body:
    {
        "dry_run": true
    }
    """
    try:
        from services.log_retention import log_retention_service
        
        data = request.get_json() or {}
        dry_run = data.get('dry_run', True)
        
        result = log_retention_service.run_full_cleanup(dry_run)
        
        return jsonify({
            'success': True,
            **result
        })
        
    except Exception as e:
        logger.error(f"Log cleanup error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@jarvis_ai_bp.route('/logs/counts', methods=['GET'])
def get_log_counts():
    """
    GET /api/jarvis/logs/counts
    
    Get log counts by type
    """
    try:
        from services.log_retention import log_retention_service
        
        counts = log_retention_service.get_log_counts()
        
        return jsonify({
            'success': True,
            'counts': counts
        })
        
    except Exception as e:
        logger.error(f"Log counts error: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


__all__ = ['jarvis_ai_bp']
