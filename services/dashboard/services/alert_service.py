"""
Alert Service - Threshold monitoring and notification system
Includes background thread for automatic metric monitoring
"""
import logging
import os
import requests
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import uuid

logger = logging.getLogger(__name__)


class AlertService:
    """Service for monitoring alerts and notifications with background monitoring"""
    
    def __init__(self):
        self.discord_webhook_url = os.environ.get('DISCORD_WEBHOOK_URL')
        self._cache = {}
        self._monitor_thread: Optional[threading.Thread] = None
        self._monitor_running = False
        self._monitor_interval = int(os.environ.get('ALERT_CHECK_INTERVAL', 60))
    
    def start_background_monitor(self, interval: Optional[int] = None) -> Dict:
        """Start the background monitoring thread"""
        if self._monitor_running:
            return {'success': False, 'message': 'Monitor already running'}
        
        if interval:
            self._monitor_interval = interval
        
        self._monitor_running = True
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            daemon=True,
            name="AlertMonitorThread"
        )
        self._monitor_thread.start()
        logger.info(f"✓ Alert monitoring started (interval: {self._monitor_interval}s)")
        return {'success': True, 'message': f'Monitor started with {self._monitor_interval}s interval'}
    
    def stop_background_monitor(self) -> Dict:
        """Stop the background monitoring thread"""
        if not self._monitor_running:
            return {'success': False, 'message': 'Monitor not running'}
        
        self._monitor_running = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)
        logger.info("✓ Alert monitoring stopped")
        return {'success': True, 'message': 'Monitor stopped'}
    
    def is_monitor_running(self) -> bool:
        """Check if background monitor is running"""
        return self._monitor_running
    
    def _monitor_loop(self):
        """Background loop that checks alerts periodically"""
        logger.info(f"Alert monitor loop started, checking every {self._monitor_interval} seconds")
        
        time.sleep(10)
        
        while self._monitor_running:
            try:
                result = self.check_all_alerts()
                if result.get('triggered', 0) > 0:
                    logger.info(f"Alert check: {result['checked']} checked, {result['triggered']} triggered")
            except Exception as e:
                logger.error(f"Error in alert monitor loop: {e}")
            
            for _ in range(self._monitor_interval):
                if not self._monitor_running:
                    break
                time.sleep(1)
        
        logger.info("Alert monitor loop ended")
    
    def get_db_session(self):
        """Get database session with error handling"""
        try:
            from services.db_service import db_service
            if not db_service.is_available:
                return None
            return db_service.get_session()
        except Exception as e:
            logger.error(f"Database error: {e}")
            return None
    
    def get_all_alerts(self, enabled_only: bool = False) -> List[Dict]:
        """Get all monitoring alerts"""
        try:
            from models.monitoring_alerts import MonitoringAlert
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return []
            
            with session_ctx as session:
                query = session.query(MonitoringAlert)
                if enabled_only:
                    query = query.filter(MonitoringAlert.enabled == True)
                alerts = query.order_by(MonitoringAlert.created_at.desc()).all()
                return [a.to_dict() for a in alerts]
        except Exception as e:
            logger.error(f"Error getting alerts: {e}")
            return []
    
    def get_alert_by_id(self, alert_id: str) -> Optional[Dict]:
        """Get a specific alert by ID"""
        try:
            from models.monitoring_alerts import MonitoringAlert
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return None
            
            with session_ctx as session:
                alert = session.query(MonitoringAlert).filter_by(id=alert_id).first()
                return alert.to_dict() if alert else None
        except Exception as e:
            logger.error(f"Error getting alert {alert_id}: {e}")
            return None
    
    def create_alert(self, data: Dict) -> Dict:
        """Create a new monitoring alert"""
        try:
            from models.monitoring_alerts import (
                MonitoringAlert, MonitoringAlertNotification,
                AlertType, AlertCondition, NotificationType
            )
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                alert = MonitoringAlert(
                    name=data.get('name', 'New Alert'),
                    description=data.get('description', ''),
                    alert_type=AlertType(data.get('alert_type', 'cpu')),
                    condition=AlertCondition(data.get('condition', 'gt')),
                    threshold=float(data.get('threshold', 80.0)),
                    target=data.get('target'),
                    enabled=data.get('enabled', True),
                    cooldown_minutes=int(data.get('cooldown_minutes', 5))
                )
                session.add(alert)
                session.flush()
                
                notifications = data.get('notifications', [])
                for notif in notifications:
                    notification = MonitoringAlertNotification(
                        alert_id=alert.id,
                        notification_type=NotificationType(notif.get('notification_type', 'discord_webhook')),
                        destination=notif.get('destination', ''),
                        enabled=notif.get('enabled', True)
                    )
                    session.add(notification)
                
                session.flush()
                result = alert.to_dict()
                
            return {'success': True, 'alert': result}
        except Exception as e:
            logger.error(f"Error creating alert: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_alert(self, alert_id: str, data: Dict) -> Dict:
        """Update an existing monitoring alert"""
        try:
            from models.monitoring_alerts import (
                MonitoringAlert, MonitoringAlertNotification,
                AlertType, AlertCondition, NotificationType
            )
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                alert = session.query(MonitoringAlert).filter_by(id=alert_id).first()
                if not alert:
                    return {'success': False, 'error': 'Alert not found'}
                
                if 'name' in data:
                    alert.name = data['name']
                if 'description' in data:
                    alert.description = data['description']
                if 'alert_type' in data:
                    alert.alert_type = AlertType(data['alert_type'])
                if 'condition' in data:
                    alert.condition = AlertCondition(data['condition'])
                if 'threshold' in data:
                    alert.threshold = float(data['threshold'])
                if 'target' in data:
                    alert.target = data['target']
                if 'enabled' in data:
                    alert.enabled = data['enabled']
                if 'cooldown_minutes' in data:
                    alert.cooldown_minutes = int(data['cooldown_minutes'])
                
                alert.updated_at = datetime.utcnow()
                
                if 'notifications' in data:
                    session.query(MonitoringAlertNotification).filter_by(alert_id=alert.id).delete()
                    for notif in data['notifications']:
                        notification = MonitoringAlertNotification(
                            alert_id=alert.id,
                            notification_type=NotificationType(notif.get('notification_type', 'discord_webhook')),
                            destination=notif.get('destination', ''),
                            enabled=notif.get('enabled', True)
                        )
                        session.add(notification)
                
                session.flush()
                result = alert.to_dict()
                
            return {'success': True, 'alert': result}
        except Exception as e:
            logger.error(f"Error updating alert {alert_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    def delete_alert(self, alert_id: str) -> Dict:
        """Delete a monitoring alert"""
        try:
            from models.monitoring_alerts import MonitoringAlert
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                alert = session.query(MonitoringAlert).filter_by(id=alert_id).first()
                if not alert:
                    return {'success': False, 'error': 'Alert not found'}
                
                alert_name = alert.name
                session.delete(alert)
                
            return {'success': True, 'message': f'Alert "{alert_name}" deleted'}
        except Exception as e:
            logger.error(f"Error deleting alert {alert_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_alert_history(self, alert_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get alert history, optionally filtered by alert ID"""
        try:
            from models.monitoring_alerts import MonitoringAlertHistory
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return []
            
            with session_ctx as session:
                query = session.query(MonitoringAlertHistory)
                if alert_id:
                    query = query.filter(MonitoringAlertHistory.alert_id == alert_id)
                history = query.order_by(MonitoringAlertHistory.triggered_at.desc()).limit(limit).all()
                return [h.to_dict() for h in history]
        except Exception as e:
            logger.error(f"Error getting alert history: {e}")
            return []
    
    def acknowledge_alert(self, history_id: str, user: str = 'system') -> Dict:
        """Acknowledge an alert history entry"""
        try:
            from models.monitoring_alerts import MonitoringAlertHistory
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                history = session.query(MonitoringAlertHistory).filter_by(id=history_id).first()
                if not history:
                    return {'success': False, 'error': 'History entry not found'}
                
                history.acknowledged = True
                history.acknowledged_at = datetime.utcnow()
                history.acknowledged_by = user
                session.flush()
                
                result = history.to_dict()
                
            return {'success': True, 'history': result}
        except Exception as e:
            logger.error(f"Error acknowledging alert: {e}")
            return {'success': False, 'error': str(e)}
    
    def resolve_alert(self, history_id: str) -> Dict:
        """Mark an alert as resolved"""
        try:
            from models.monitoring_alerts import MonitoringAlertHistory
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                history = session.query(MonitoringAlertHistory).filter_by(id=history_id).first()
                if not history:
                    return {'success': False, 'error': 'History entry not found'}
                
                history.resolved_at = datetime.utcnow()
                session.flush()
                result = history.to_dict()
                
            return {'success': True, 'history': result}
        except Exception as e:
            logger.error(f"Error resolving alert: {e}")
            return {'success': False, 'error': str(e)}
    
    def check_condition(self, value: float, condition: str, threshold: float) -> bool:
        """Check if a value meets the alert condition"""
        if condition == 'gt':
            return value > threshold
        elif condition == 'lt':
            return value < threshold
        elif condition == 'eq':
            return abs(value - threshold) < 0.001
        elif condition == 'ne':
            return abs(value - threshold) >= 0.001
        elif condition == 'gte':
            return value >= threshold
        elif condition == 'lte':
            return value <= threshold
        return False
    
    def get_metric_value(self, alert_type: str, target: Optional[str] = None) -> Optional[float]:
        """Get current metric value for an alert type"""
        try:
            import psutil
            
            if alert_type == 'cpu':
                return psutil.cpu_percent(interval=0.1)
            elif alert_type == 'memory':
                return psutil.virtual_memory().percent
            elif alert_type == 'disk':
                if target:
                    try:
                        usage = psutil.disk_usage(target)
                        return usage.percent
                    except:
                        pass
                return psutil.disk_usage('/').percent
            elif alert_type == 'service':
                return None
            elif alert_type == 'custom':
                return None
            return None
        except Exception as e:
            logger.error(f"Error getting metric for {alert_type}: {e}")
            return None
    
    def can_trigger(self, alert_id: str, cooldown_minutes: int) -> bool:
        """Check if alert can be triggered based on cooldown"""
        try:
            from models.monitoring_alerts import MonitoringAlert
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return False
            
            with session_ctx as session:
                alert = session.query(MonitoringAlert).filter_by(id=alert_id).first()
                if not alert:
                    return False
                
                if not alert.last_triggered:
                    return True
                
                cooldown = timedelta(minutes=cooldown_minutes)
                return datetime.utcnow() - alert.last_triggered > cooldown
        except Exception as e:
            logger.error(f"Error checking cooldown for {alert_id}: {e}")
            return False
    
    def trigger_alert(self, alert_id: str, value: float) -> Dict:
        """Trigger an alert and send notifications"""
        try:
            from models.monitoring_alerts import (
                MonitoringAlert, MonitoringAlertHistory, MonitoringAlertNotification
            )
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                alert = session.query(MonitoringAlert).filter_by(id=alert_id).first()
                if not alert:
                    return {'success': False, 'error': 'Alert not found'}
                
                history = MonitoringAlertHistory(
                    alert_id=alert.id,
                    value=value,
                    threshold=alert.threshold,
                    triggered_at=datetime.utcnow()
                )
                session.add(history)
                
                alert.last_triggered = datetime.utcnow()
                alert.trigger_count = (alert.trigger_count or 0) + 1
                
                notification_results = []
                for notif in alert.notifications:
                    if notif.enabled:
                        result = self.send_notification(
                            notification_type=notif.notification_type.value,
                            destination=notif.destination,
                            alert_name=alert.name,
                            alert_type=alert.alert_type.value,
                            value=value,
                            threshold=alert.threshold,
                            condition=alert.condition.value,
                            target=alert.target
                        )
                        notification_results.append(result)
                
                history.notification_sent = any(r.get('success') for r in notification_results)
                history.notification_result = notification_results
                
                session.flush()
                result = history.to_dict()
                
            return {'success': True, 'history': result, 'notifications': notification_results}
        except Exception as e:
            logger.error(f"Error triggering alert {alert_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_notification(
        self,
        notification_type: str,
        destination: str,
        alert_name: str,
        alert_type: str,
        value: float,
        threshold: float,
        condition: str,
        target: Optional[str] = None
    ) -> Dict:
        """Send a notification through the specified channel"""
        try:
            if notification_type == 'discord_webhook':
                return self.send_discord_notification(
                    webhook_url=destination,
                    alert_name=alert_name,
                    alert_type=alert_type,
                    value=value,
                    threshold=threshold,
                    condition=condition,
                    target=target
                )
            elif notification_type == 'email':
                return self.send_email_notification(
                    email=destination,
                    alert_name=alert_name,
                    alert_type=alert_type,
                    value=value,
                    threshold=threshold
                )
            else:
                return {'success': False, 'error': f'Unknown notification type: {notification_type}'}
        except Exception as e:
            logger.error(f"Error sending notification: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_discord_notification(
        self,
        webhook_url: str,
        alert_name: str,
        alert_type: str,
        value: float,
        threshold: float,
        condition: str,
        target: Optional[str] = None
    ) -> Dict:
        """Send a Discord webhook notification"""
        try:
            if not webhook_url:
                webhook_url = self.discord_webhook_url
            
            if not webhook_url:
                return {'success': False, 'error': 'No webhook URL configured'}
            
            condition_text = {
                'gt': 'exceeded',
                'lt': 'dropped below',
                'eq': 'equals',
                'ne': 'not equal to',
                'gte': 'reached or exceeded',
                'lte': 'reached or dropped below'
            }.get(condition, condition)
            
            type_icons = {
                'cpu': '🖥️',
                'memory': '🧠',
                'disk': '💾',
                'service': '⚙️',
                'custom': '📊'
            }
            icon = type_icons.get(alert_type, '⚠️')
            
            if value >= 90:
                color = 0xFF0000
            elif value >= 75:
                color = 0xFF8C00
            else:
                color = 0xFFD700
            
            fields = [
                {'name': '📊 Current Value', 'value': f'{value:.1f}%', 'inline': True},
                {'name': '🎯 Threshold', 'value': f'{threshold:.1f}%', 'inline': True},
                {'name': '📈 Type', 'value': alert_type.upper(), 'inline': True}
            ]
            
            if target:
                fields.append({'name': '🎯 Target', 'value': target, 'inline': False})
            
            embed = {
                'title': f'{icon} Alert: {alert_name}',
                'description': f'{alert_type.upper()} {condition_text} threshold of {threshold:.1f}%',
                'color': color,
                'fields': fields,
                'footer': {'text': 'Homelab Monitoring Alert'},
                'timestamp': datetime.utcnow().isoformat()
            }
            
            payload = {
                'embeds': [embed],
                'username': 'Homelab Monitor'
            }
            
            response = requests.post(webhook_url, json=payload, timeout=10)
            response.raise_for_status()
            
            logger.info(f"Discord notification sent for alert: {alert_name}")
            return {'success': True, 'status_code': response.status_code}
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to send Discord notification: {e}")
            return {'success': False, 'error': str(e)}
        except Exception as e:
            logger.error(f"Error sending Discord notification: {e}")
            return {'success': False, 'error': str(e)}
    
    def send_email_notification(
        self,
        email: str,
        alert_name: str,
        alert_type: str,
        value: float,
        threshold: float
    ) -> Dict:
        """Send an email notification (placeholder for future implementation)"""
        logger.info(f"Email notification would be sent to {email} for alert: {alert_name}")
        return {'success': True, 'message': 'Email notification queued'}
    
    def test_notification(self, alert_id: str) -> Dict:
        """Send a test notification for an alert"""
        try:
            from models.monitoring_alerts import MonitoringAlert
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available'}
            
            with session_ctx as session:
                alert = session.query(MonitoringAlert).filter_by(id=alert_id).first()
                if not alert:
                    return {'success': False, 'error': 'Alert not found'}
                
                if not alert.notifications:
                    return {'success': False, 'error': 'No notifications configured for this alert'}
                
                results = []
                for notif in alert.notifications:
                    if notif.enabled:
                        result = self.send_notification(
                            notification_type=notif.notification_type.value,
                            destination=notif.destination,
                            alert_name=f"[TEST] {alert.name}",
                            alert_type=alert.alert_type.value,
                            value=50.0,
                            threshold=alert.threshold,
                            condition=alert.condition.value,
                            target=alert.target
                        )
                        results.append({
                            'type': notif.notification_type.value,
                            'result': result
                        })
                
                success = any(r['result'].get('success') for r in results)
                return {
                    'success': success,
                    'results': results,
                    'message': 'Test notifications sent' if success else 'Failed to send test notifications'
                }
        except Exception as e:
            logger.error(f"Error testing notification for {alert_id}: {e}")
            return {'success': False, 'error': str(e)}
    
    def check_all_alerts(self) -> Dict:
        """Check all enabled alerts against current metrics"""
        try:
            from models.monitoring_alerts import MonitoringAlert
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {'success': False, 'error': 'Database not available', 'checked': 0, 'triggered': 0}
            
            checked = 0
            triggered = 0
            results = []
            
            with session_ctx as session:
                alerts = session.query(MonitoringAlert).filter(
                    MonitoringAlert.enabled == True
                ).all()
                
                for alert in alerts:
                    if alert.alert_type.value in ['cpu', 'memory', 'disk']:
                        value = self.get_metric_value(alert.alert_type.value, alert.target)
                        if value is not None:
                            checked += 1
                            condition_met = self.check_condition(
                                value, 
                                alert.condition.value, 
                                alert.threshold
                            )
                            
                            if condition_met and self.can_trigger(str(alert.id), alert.cooldown_minutes):
                                result = self.trigger_alert(str(alert.id), value)
                                if result.get('success'):
                                    triggered += 1
                                results.append({
                                    'alert_id': str(alert.id),
                                    'alert_name': alert.name,
                                    'value': value,
                                    'threshold': alert.threshold,
                                    'triggered': result.get('success', False)
                                })
            
            return {
                'success': True,
                'checked': checked,
                'triggered': triggered,
                'results': results
            }
        except Exception as e:
            logger.error(f"Error checking alerts: {e}")
            return {'success': False, 'error': str(e), 'checked': 0, 'triggered': 0}
    
    def get_stats(self) -> Dict:
        """Get alert statistics"""
        try:
            from models.monitoring_alerts import MonitoringAlert, MonitoringAlertHistory
            
            session_ctx = self.get_db_session()
            if not session_ctx:
                return {
                    'total_alerts': 0,
                    'enabled_alerts': 0,
                    'total_triggers': 0,
                    'unacknowledged': 0,
                    'recent_triggers': 0
                }
            
            with session_ctx as session:
                total = session.query(MonitoringAlert).count()
                enabled = session.query(MonitoringAlert).filter(MonitoringAlert.enabled == True).count()
                
                unacknowledged = session.query(MonitoringAlertHistory).filter(
                    MonitoringAlertHistory.acknowledged == False,
                    MonitoringAlertHistory.resolved_at == None
                ).count()
                
                one_day_ago = datetime.utcnow() - timedelta(days=1)
                recent = session.query(MonitoringAlertHistory).filter(
                    MonitoringAlertHistory.triggered_at >= one_day_ago
                ).count()
                
                total_triggers = session.query(MonitoringAlertHistory).count()
                
                return {
                    'total_alerts': total,
                    'enabled_alerts': enabled,
                    'total_triggers': total_triggers,
                    'unacknowledged': unacknowledged,
                    'recent_triggers': recent
                }
        except Exception as e:
            logger.error(f"Error getting stats: {e}")
            return {
                'total_alerts': 0,
                'enabled_alerts': 0,
                'total_triggers': 0,
                'unacknowledged': 0,
                'recent_triggers': 0
            }


alert_service = AlertService()
