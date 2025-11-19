"""
Health Monitoring API Routes
Provides endpoints for querying service health status, history, and alerts
"""
from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from sqlalchemy import desc, and_, func
from models import get_session
from models.health_check import ServiceHealthCheck, ServiceHealthAlert
from services.health_monitor_service import health_monitor
from utils.auth import require_auth
import logging

health_monitoring_bp = Blueprint('health_monitoring', __name__, url_prefix='/api/health')
logger = logging.getLogger(__name__)

@health_monitoring_bp.route('/status', methods=['GET'])
@require_auth
def get_current_status():
    """
    Get current health status of all services
    Returns the most recent health check for each service
    """
    try:
        session = get_session()
        
        # Get the most recent health check for each service
        subquery = session.query(
            ServiceHealthCheck.service_name,
            func.max(ServiceHealthCheck.timestamp).label('max_timestamp')
        ).group_by(ServiceHealthCheck.service_name).subquery()
        
        latest_checks = session.query(ServiceHealthCheck).join(
            subquery,
            and_(
                ServiceHealthCheck.service_name == subquery.c.service_name,
                ServiceHealthCheck.timestamp == subquery.c.max_timestamp
            )
        ).all()
        
        # Format response
        services_status = []
        overall_healthy = True
        
        for check in latest_checks:
            service_data = check.to_dict()
            
            # Calculate uptime for each service (last 24 hours)
            uptime = health_monitor.get_service_uptime(check.service_name, hours=24)
            service_data['uptime_percentage'] = uptime
            
            services_status.append(service_data)
            
            if check.status != 'healthy':
                overall_healthy = False
        
        session.close()
        
        return jsonify({
            'overall_status': 'healthy' if overall_healthy else 'degraded',
            'services': services_status,
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'total_services': len(services_status)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting health status: {e}")
        return jsonify({'error': str(e)}), 500

@health_monitoring_bp.route('/history', methods=['GET'])
@require_auth
def get_health_history():
    """
    Get historical health data for services
    
    Query parameters:
    - service: Filter by service name (optional)
    - hours: Number of hours to look back (default: 24)
    - limit: Max number of records to return (default: 100)
    """
    try:
        service_name = request.args.get('service')
        hours = int(request.args.get('hours', 24))
        limit = int(request.args.get('limit', 100))
        
        session = get_session()
        cutoff_time = datetime.utcnow() - timedelta(hours=hours)
        
        query = session.query(ServiceHealthCheck).filter(
            ServiceHealthCheck.timestamp >= cutoff_time
        )
        
        if service_name:
            query = query.filter(ServiceHealthCheck.service_name == service_name)
        
        checks = query.order_by(desc(ServiceHealthCheck.timestamp)).limit(limit).all()
        
        history = [check.to_dict() for check in checks]
        
        session.close()
        
        return jsonify({
            'history': history,
            'count': len(history),
            'filters': {
                'service': service_name,
                'hours': hours,
                'limit': limit
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting health history: {e}")
        return jsonify({'error': str(e)}), 500

@health_monitoring_bp.route('/alerts', methods=['GET'])
@require_auth
def get_health_alerts():
    """
    Get health alerts
    
    Query parameters:
    - status: Filter by alert status (active, resolved, all) - default: active
    - service: Filter by service name (optional)
    - limit: Max number of alerts to return (default: 50)
    """
    try:
        status_filter = request.args.get('status', 'active')
        service_name = request.args.get('service')
        limit = int(request.args.get('limit', 50))
        
        session = get_session()
        
        query = session.query(ServiceHealthAlert)
        
        if status_filter != 'all':
            query = query.filter(ServiceHealthAlert.status == status_filter)
        
        if service_name:
            query = query.filter(ServiceHealthAlert.service_name == service_name)
        
        alerts = query.order_by(desc(ServiceHealthAlert.triggered_at)).limit(limit).all()
        
        alerts_data = [alert.to_dict() for alert in alerts]
        
        session.close()
        
        return jsonify({
            'alerts': alerts_data,
            'count': len(alerts_data),
            'filters': {
                'status': status_filter,
                'service': service_name,
                'limit': limit
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting health alerts: {e}")
        return jsonify({'error': str(e)}), 500

@health_monitoring_bp.route('/test/<service>', methods=['POST'])
@require_auth
def trigger_health_check(service):
    """
    Manually trigger a health check for a specific service
    
    Args:
        service: Name of the service to check
    """
    try:
        if service not in health_monitor.SERVICES:
            return jsonify({'error': f'Unknown service: {service}'}), 404
        
        service_config = health_monitor.SERVICES[service]
        health_data = health_monitor.check_service_health(service, service_config)
        
        session = get_session()
        health_monitor.store_health_check(health_data, session)
        health_monitor.check_and_create_alerts(health_data, session)
        session.close()
        
        return jsonify({
            'message': f'Health check triggered for {service}',
            'result': {
                'service': health_data['service_name'],
                'status': health_data['status'],
                'checks': health_data['checks'],
                'response_time_ms': health_data['response_time_ms'],
                'timestamp': health_data['timestamp'].isoformat() + 'Z'
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Error triggering health check for {service}: {e}")
        return jsonify({'error': str(e)}), 500

@health_monitoring_bp.route('/uptime/<service>', methods=['GET'])
@require_auth
def get_service_uptime(service):
    """
    Get uptime percentage for a specific service
    
    Query parameters:
    - hours: Number of hours to look back (default: 24)
    """
    try:
        hours = int(request.args.get('hours', 24))
        
        if service not in health_monitor.SERVICES:
            return jsonify({'error': f'Unknown service: {service}'}), 404
        
        uptime = health_monitor.get_service_uptime(service, hours=hours)
        
        return jsonify({
            'service': service,
            'uptime_percentage': uptime,
            'period_hours': hours,
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting uptime for {service}: {e}")
        return jsonify({'error': str(e)}), 500

@health_monitoring_bp.route('/summary', methods=['GET'])
@require_auth
def get_health_summary():
    """
    Get a comprehensive health summary of all services
    Includes current status, uptime, and active alerts
    """
    try:
        session = get_session()
        
        # Get latest health checks
        subquery = session.query(
            ServiceHealthCheck.service_name,
            func.max(ServiceHealthCheck.timestamp).label('max_timestamp')
        ).group_by(ServiceHealthCheck.service_name).subquery()
        
        latest_checks = session.query(ServiceHealthCheck).join(
            subquery,
            and_(
                ServiceHealthCheck.service_name == subquery.c.service_name,
                ServiceHealthCheck.timestamp == subquery.c.max_timestamp
            )
        ).all()
        
        # Get active alerts count
        active_alerts_count = session.query(ServiceHealthAlert).filter(
            ServiceHealthAlert.status == 'active'
        ).count()
        
        # Calculate statistics
        total_services = len(latest_checks)
        healthy_services = sum(1 for check in latest_checks if check.status == 'healthy')
        degraded_services = sum(1 for check in latest_checks if check.status == 'degraded')
        unhealthy_services = sum(1 for check in latest_checks if check.status == 'unhealthy')
        
        # Get uptime for all services
        services_uptime = {}
        for check in latest_checks:
            uptime = health_monitor.get_service_uptime(check.service_name, hours=24)
            services_uptime[check.service_name] = uptime
        
        session.close()
        
        return jsonify({
            'summary': {
                'total_services': total_services,
                'healthy': healthy_services,
                'degraded': degraded_services,
                'unhealthy': unhealthy_services,
                'active_alerts': active_alerts_count
            },
            'services_uptime': services_uptime,
            'overall_health': 'healthy' if unhealthy_services == 0 else 'degraded' if degraded_services > 0 else 'unhealthy',
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting health summary: {e}")
        return jsonify({'error': str(e)}), 500
