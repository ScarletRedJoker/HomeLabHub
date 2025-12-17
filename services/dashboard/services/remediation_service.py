"""
Remediation Service - AI-powered Autonomous Operations
Handles incident detection, AI analysis, playbook execution, and learning from past incidents
"""
import logging
import hashlib
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from services.ai_service import AIService
from services.db_service import db_service
from services.jarvis_remediator import jarvis_remediator
from config import Config

logger = logging.getLogger(__name__)


class RemediationService:
    """AI-powered autonomous remediation service with incident tracking and learning"""
    
    PLAYBOOKS = {
        'container_restart': {
            'id': 'container_restart',
            'name': 'Restart Container',
            'description': 'Restart a Docker container to resolve issues',
            'auto_execute': True,
            'severity': 'low',
            'risk_level': 'low',
            'estimated_duration_seconds': 30,
            'command': 'docker restart {container_name}',
            'applicable_issues': ['container_down', 'container_unhealthy', 'container_crash_loop'],
            'success_indicators': ['container running', 'healthy status'],
            'rollback': 'None required - container will restart automatically'
        },
        'container_recreate': {
            'id': 'container_recreate',
            'name': 'Recreate Container',
            'description': 'Stop, remove, and recreate container from compose',
            'auto_execute': False,
            'severity': 'medium',
            'risk_level': 'medium',
            'estimated_duration_seconds': 120,
            'command': 'cd /opt/homelab/HomeLabHub && docker compose up -d {service_name}',
            'applicable_issues': ['container_crash_loop', 'container_unhealthy'],
            'requires_confirmation': True,
            'rollback': 'docker compose logs {service_name}'
        },
        'nas_remount': {
            'id': 'nas_remount',
            'name': 'Remount NAS Shares',
            'description': 'Remount stale NAS bind mounts',
            'auto_execute': True,
            'severity': 'medium',
            'risk_level': 'low',
            'estimated_duration_seconds': 60,
            'command': 'sudo /usr/local/bin/nas-bind-mounts.sh start',
            'applicable_issues': ['nas_stale'],
            'success_indicators': ['mounts accessible', 'no stale handles'],
            'rollback': 'sudo /usr/local/bin/nas-bind-mounts.sh stop && sudo /usr/local/bin/nas-bind-mounts.sh start'
        },
        'clear_docker_cache': {
            'id': 'clear_docker_cache',
            'name': 'Clear Docker Cache',
            'description': 'Prune unused Docker resources to free disk space',
            'auto_execute': False,
            'severity': 'medium',
            'risk_level': 'medium',
            'estimated_duration_seconds': 300,
            'command': 'docker system prune -f',
            'applicable_issues': ['disk_full', 'high_memory'],
            'requires_confirmation': True,
            'rollback': 'None - data is permanently removed'
        },
        'restart_systemd_service': {
            'id': 'restart_systemd_service',
            'name': 'Restart Systemd Service',
            'description': 'Restart a systemd service on the host',
            'auto_execute': False,
            'severity': 'high',
            'risk_level': 'high',
            'estimated_duration_seconds': 60,
            'command': 'sudo systemctl restart {service_name}',
            'applicable_issues': ['service_degraded'],
            'requires_confirmation': True,
            'rollback': 'sudo systemctl status {service_name}'
        },
        'scale_container': {
            'id': 'scale_container',
            'name': 'Scale Container Resources',
            'description': 'Adjust container memory/CPU limits',
            'auto_execute': False,
            'severity': 'high',
            'risk_level': 'medium',
            'estimated_duration_seconds': 120,
            'command': 'docker update --memory={memory_limit} --cpus={cpu_limit} {container_name}',
            'applicable_issues': ['high_cpu', 'high_memory'],
            'requires_confirmation': True,
            'rollback': 'docker update --memory={old_memory} --cpus={old_cpu} {container_name}'
        },
        'check_network': {
            'id': 'check_network',
            'name': 'Network Connectivity Check',
            'description': 'Diagnose and fix network connectivity issues',
            'auto_execute': True,
            'severity': 'medium',
            'risk_level': 'low',
            'estimated_duration_seconds': 30,
            'command': 'docker network inspect {network_name}',
            'applicable_issues': ['network_issue'],
            'success_indicators': ['network reachable', 'DNS resolution working']
        },
        'renew_ssl': {
            'id': 'renew_ssl',
            'name': 'Renew SSL Certificate',
            'description': 'Force renewal of SSL certificate via certbot',
            'auto_execute': False,
            'severity': 'high',
            'risk_level': 'medium',
            'estimated_duration_seconds': 180,
            'command': 'sudo certbot renew --force-renewal',
            'applicable_issues': ['ssl_expiring'],
            'requires_confirmation': True,
            'rollback': 'Check /etc/letsencrypt/live for backup'
        },
        'kvm_reset_gpu': {
            'id': 'kvm_reset_gpu',
            'name': 'Reset GPU for KVM',
            'description': 'Unbind and rebind GPU for KVM passthrough',
            'auto_execute': False,
            'severity': 'critical',
            'risk_level': 'high',
            'estimated_duration_seconds': 300,
            'command': 'sudo /usr/local/bin/reset-gpu.sh',
            'applicable_issues': ['service_degraded'],
            'requires_confirmation': True,
            'rollback': 'Reboot may be required'
        }
    }
    
    def __init__(self):
        self.ai_service = AIService()
        self.config = Config()
    
    def generate_incident_id(self) -> str:
        """Generate a unique incident ID"""
        return f"INC-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"
    
    def create_incident(
        self,
        incident_type: str,
        service_name: str,
        title: str,
        host_id: str = None,
        container_name: str = None,
        description: str = None,
        severity: str = 'medium',
        trigger_source: str = 'manual',
        trigger_details: dict = None
    ) -> Dict:
        """Create a new incident record for tracking"""
        try:
            from models.jarvis_ai import Incident, IncidentStatus, IncidentSeverity, IncidentType
            
            incident_id = self.generate_incident_id()
            
            try:
                inc_type = IncidentType(incident_type)
            except ValueError:
                inc_type = IncidentType.CUSTOM
            
            try:
                inc_severity = IncidentSeverity(severity)
            except ValueError:
                inc_severity = IncidentSeverity.MEDIUM
            
            with db_service.get_session() as session:
                incident = Incident(
                    incident_id=incident_id,
                    type=inc_type,
                    severity=inc_severity,
                    status=IncidentStatus.DETECTED,
                    host_id=host_id,
                    service_name=service_name,
                    container_name=container_name,
                    title=title,
                    description=description,
                    trigger_source=trigger_source,
                    trigger_details=trigger_details or {}
                )
                
                session.add(incident)
                session.flush()
                result = incident.to_dict()
            
            logger.info(f"[Remediation] Created incident {incident_id}: {title}")
            return {'success': True, 'incident': result}
            
        except Exception as e:
            logger.error(f"[Remediation] Failed to create incident: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_incident(self, incident_id: str) -> Optional[Dict]:
        """Get incident by ID"""
        try:
            from models.jarvis_ai import Incident
            
            with db_service.get_session() as session:
                incident = session.query(Incident).filter(
                    Incident.incident_id == incident_id
                ).first()
                
                if incident:
                    return incident.to_dict()
                return None
                
        except Exception as e:
            logger.error(f"[Remediation] Failed to get incident: {e}")
            return None
    
    def list_incidents(
        self,
        status: str = None,
        severity: str = None,
        service_name: str = None,
        limit: int = 50,
        include_resolved: bool = False
    ) -> List[Dict]:
        """List incidents with optional filters"""
        try:
            from models.jarvis_ai import Incident, IncidentStatus, IncidentSeverity
            
            with db_service.get_session() as session:
                query = session.query(Incident)
                
                if status:
                    try:
                        query = query.filter(Incident.status == IncidentStatus(status))
                    except ValueError:
                        pass
                
                if severity:
                    try:
                        query = query.filter(Incident.severity == IncidentSeverity(severity))
                    except ValueError:
                        pass
                
                if service_name:
                    query = query.filter(Incident.service_name == service_name)
                
                if not include_resolved:
                    query = query.filter(Incident.status.notin_([
                        IncidentStatus.RESOLVED
                    ]))
                
                incidents = query.order_by(
                    Incident.severity.desc(),
                    Incident.detected_at.desc()
                ).limit(limit).all()
                
                return [i.to_dict() for i in incidents]
                
        except Exception as e:
            logger.error(f"[Remediation] Failed to list incidents: {e}")
            return []
    
    def update_incident_status(
        self,
        incident_id: str,
        status: str,
        notes: str = None,
        **kwargs
    ) -> Dict:
        """Update incident status and optionally add notes"""
        try:
            from models.jarvis_ai import Incident, IncidentStatus
            
            with db_service.get_session() as session:
                incident = session.query(Incident).filter(
                    Incident.incident_id == incident_id
                ).first()
                
                if not incident:
                    return {'success': False, 'error': 'Incident not found'}
                
                try:
                    incident.status = IncidentStatus(status)
                except ValueError:
                    return {'success': False, 'error': f'Invalid status: {status}'}
                
                if status == 'resolved':
                    incident.resolved_at = datetime.utcnow()
                elif status == 'analyzing':
                    pass
                elif status == 'escalated':
                    incident.escalated_to = kwargs.get('escalated_to')
                    incident.escalation_reason = kwargs.get('reason', notes)
                
                if notes:
                    incident.resolution_notes = notes
                
                for key, value in kwargs.items():
                    if hasattr(incident, key):
                        setattr(incident, key, value)
                
                session.flush()
                result = incident.to_dict()
            
            logger.info(f"[Remediation] Updated incident {incident_id} to {status}")
            return {'success': True, 'incident': result}
            
        except Exception as e:
            logger.error(f"[Remediation] Failed to update incident: {e}")
            return {'success': False, 'error': str(e)}
    
    def analyze_issue(self, incident_id: str) -> Dict:
        """Use Jarvis AI to analyze an issue and suggest remediation"""
        try:
            from models.jarvis_ai import Incident, IncidentStatus
            
            with db_service.get_session() as session:
                incident = session.query(Incident).filter(
                    Incident.incident_id == incident_id
                ).first()
                
                if not incident:
                    return {'success': False, 'error': 'Incident not found'}
                
                incident.status = IncidentStatus.ANALYZING
                session.flush()
                
                service_name = incident.service_name
                container_name = incident.container_name
                incident_type = incident.type.value if incident.type else 'unknown'
                
                context = {
                    'incident_id': incident.incident_id,
                    'type': incident_type,
                    'severity': incident.severity.value if incident.severity else 'unknown',
                    'service': service_name,
                    'container': container_name,
                    'title': incident.title,
                    'description': incident.description,
                    'trigger': incident.trigger_details
                }
                
                service_data = {}
                if service_name and service_name in self.config.SERVICES:
                    from services.service_ops import service_ops
                    service_info = self.config.SERVICES[service_name]
                    container = container_name or service_info.get('container')
                    
                    if container:
                        health = service_ops.execute_health_check(service_name, container)
                        logs = service_ops.get_service_logs(container, lines=100) or ''
                        service_data = {
                            'health': health,
                            'logs_excerpt': logs[:2000]
                        }
            
            playbook_options = [
                f"- {p['id']}: {p['name']} - {p['description']} (Risk: {p['risk_level']}, Auto: {p['auto_execute']})"
                for p in self.PLAYBOOKS.values()
                if incident_type in p.get('applicable_issues', []) or incident_type == 'custom'
            ]
            
            prompt = f"""You are Jarvis, an AI homelab operations expert. Analyze this incident and recommend remediation.

**Incident Details:**
- ID: {context['incident_id']}
- Type: {context['type']}
- Severity: {context['severity']}
- Service: {context['service']}
- Container: {context.get('container', 'N/A')}
- Title: {context['title']}
- Description: {context.get('description', 'No description')}

**Service Health Data:**
{json.dumps(service_data.get('health', {}), indent=2) if service_data.get('health') else 'No health data available'}

**Recent Logs:**
```
{service_data.get('logs_excerpt', 'No logs available')}
```

**Available Playbooks:**
{chr(10).join(playbook_options) if playbook_options else 'No specific playbooks available for this issue type'}

**Provide your analysis in this JSON format:**
{{
    "root_cause": "Brief root cause analysis",
    "severity_assessment": "low|medium|high|critical",
    "recommended_playbook": "playbook_id or 'manual' if none fit",
    "playbook_params": {{}},
    "risk_assessment": "low|medium|high",
    "is_auto_safe": true|false,
    "confidence": 0.0-1.0,
    "reasoning": "Why this recommendation",
    "alternative_actions": ["list", "of", "alternatives"],
    "prevention_tips": ["how", "to", "prevent"]
}}

Respond with valid JSON only."""

            analysis_response = self.ai_service.chat(prompt)
            
            try:
                if '```json' in analysis_response:
                    analysis_response = analysis_response.split('```json')[1].split('```')[0].strip()
                elif '```' in analysis_response:
                    analysis_response = analysis_response.split('```')[1].split('```')[0].strip()
                
                analysis = json.loads(analysis_response)
            except json.JSONDecodeError:
                analysis = {
                    'root_cause': 'Unable to parse AI response',
                    'severity_assessment': context['severity'],
                    'recommended_playbook': 'manual',
                    'risk_assessment': 'medium',
                    'is_auto_safe': False,
                    'confidence': 0.3,
                    'reasoning': analysis_response[:500],
                    'raw_response': analysis_response
                }
            
            with db_service.get_session() as session:
                incident = session.query(Incident).filter(
                    Incident.incident_id == incident_id
                ).first()
                
                if incident:
                    incident.ai_analysis = analysis
                    incident.ai_recommendations = {
                        'playbook': analysis.get('recommended_playbook'),
                        'params': analysis.get('playbook_params'),
                        'alternatives': analysis.get('alternative_actions'),
                        'prevention': analysis.get('prevention_tips')
                    }
                    
                    if analysis.get('recommended_playbook') and analysis['recommended_playbook'] != 'manual':
                        incident.playbook_id = analysis['recommended_playbook']
                        incident.playbook_params = analysis.get('playbook_params', {})
                    
                    session.flush()
            
            return {
                'success': True,
                'incident_id': incident_id,
                'analysis': analysis,
                'analyzed_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"[Remediation] Failed to analyze issue: {e}")
            return {'success': False, 'error': str(e)}
    
    def execute_playbook(
        self,
        incident_id: str,
        playbook_id: str = None,
        params: Dict = None,
        dry_run: bool = False,
        auto_execute: bool = False
    ) -> Dict:
        """Execute a remediation playbook for an incident"""
        try:
            from models.jarvis_ai import Incident, IncidentStatus
            
            incident_data = self.get_incident(incident_id)
            if not incident_data:
                return {'success': False, 'error': 'Incident not found'}
            
            if not playbook_id:
                playbook_id = incident_data.get('playbook', {}).get('id')
            
            if not playbook_id or playbook_id not in self.PLAYBOOKS:
                return {'success': False, 'error': f'Invalid or missing playbook: {playbook_id}'}
            
            playbook = self.PLAYBOOKS[playbook_id]
            
            if auto_execute and not playbook.get('auto_execute'):
                return {
                    'success': False,
                    'error': f'Playbook {playbook_id} is not approved for auto-execution',
                    'requires_approval': True
                }
            
            if playbook.get('requires_confirmation') and not dry_run:
                if not params or not params.get('confirmed'):
                    return {
                        'success': False,
                        'error': 'This playbook requires explicit confirmation',
                        'requires_confirmation': True,
                        'playbook': playbook
                    }
            
            with db_service.get_session() as session:
                incident = session.query(Incident).filter(
                    Incident.incident_id == incident_id
                ).first()
                
                if incident:
                    incident.status = IncidentStatus.REMEDIATING
                    incident.playbook_id = playbook_id
                    incident.playbook_params = params or {}
                    incident.remediation_attempts += 1
                    incident.auto_remediated = auto_execute
                    session.flush()
            
            service_name = incident_data.get('service_name')
            container_name = incident_data.get('container_name')
            
            if dry_run:
                result = {
                    'success': True,
                    'dry_run': True,
                    'would_execute': playbook.get('command', '').format(
                        container_name=container_name,
                        service_name=service_name,
                        **(params or {})
                    ),
                    'playbook': playbook
                }
            else:
                if playbook_id == 'container_restart':
                    result = jarvis_remediator.execute_remediation(
                        service_name,
                        plan={'steps': [{'order': 1, 'action': 'restart', 'description': 'Restart container'}]},
                        dry_run=False
                    )
                elif playbook_id in ['container_recreate', 'clear_docker_cache', 'restart_systemd_service']:
                    from services.fleet_service import fleet_manager
                    host_id = incident_data.get('host_id')
                    
                    if host_id and fleet_manager:
                        cmd = playbook.get('command', '').format(
                            container_name=container_name,
                            service_name=service_name,
                            **(params or {})
                        )
                        result = fleet_manager.execute_command(host_id, cmd)
                    else:
                        result = {'success': False, 'error': 'No host specified for remote execution'}
                else:
                    result = {'success': False, 'error': f'Playbook {playbook_id} execution not implemented'}
            
            with db_service.get_session() as session:
                incident = session.query(Incident).filter(
                    Incident.incident_id == incident_id
                ).first()
                
                if incident:
                    incident.playbook_result = result
                    
                    if result.get('success') and not dry_run:
                        incident.status = IncidentStatus.RESOLVED
                        incident.resolved_at = datetime.utcnow()
                        incident.resolution_notes = f"Resolved via playbook: {playbook['name']}"
                        
                        self._record_learning(incident_id, playbook_id, True)
                    elif not result.get('success') and not dry_run:
                        incident.status = IncidentStatus.FAILED
                        
                        self._record_learning(incident_id, playbook_id, False)
                    
                    session.flush()
            
            return {
                'success': result.get('success', False),
                'incident_id': incident_id,
                'playbook_id': playbook_id,
                'dry_run': dry_run,
                'result': result,
                'executed_at': datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"[Remediation] Failed to execute playbook: {e}")
            return {'success': False, 'error': str(e)}
    
    def escalate_to_human(self, incident_id: str, reason: str, notify_channels: List[str] = None) -> Dict:
        """Escalate an incident to human operators"""
        try:
            result = self.update_incident_status(
                incident_id,
                'escalated',
                notes=f"Escalated: {reason}",
                escalated_to='human_operator',
                reason=reason
            )
            
            if result.get('success'):
                logger.warning(f"[Remediation] Incident {incident_id} escalated to humans: {reason}")
            
            return result
            
        except Exception as e:
            logger.error(f"[Remediation] Failed to escalate incident: {e}")
            return {'success': False, 'error': str(e)}
    
    def _record_learning(self, incident_id: str, playbook_id: str, success: bool):
        """Record learning from incident resolution"""
        try:
            from models.jarvis_ai import LearningRecord, Incident
            
            incident = self.get_incident(incident_id)
            if not incident:
                return
            
            symptoms = {
                'type': incident.get('type'),
                'service': incident.get('service_name'),
                'trigger': incident.get('trigger', {}).get('source')
            }
            pattern_hash = hashlib.sha256(
                json.dumps(symptoms, sort_keys=True).encode()
            ).hexdigest()[:64]
            
            with db_service.get_session() as session:
                record = session.query(LearningRecord).filter(
                    LearningRecord.pattern_hash == pattern_hash
                ).first()
                
                if record:
                    if success:
                        record.success_count += 1
                        record.successful_playbook = playbook_id
                    else:
                        record.failure_count += 1
                    record.last_occurrence = datetime.utcnow()
                    
                    if incident.get('timing', {}).get('duration_seconds'):
                        duration = incident['timing']['duration_seconds']
                        total = record.success_count + record.failure_count
                        if record.avg_resolution_time_seconds:
                            record.avg_resolution_time_seconds = (
                                (record.avg_resolution_time_seconds * (total - 1) + duration) / total
                            )
                        else:
                            record.avg_resolution_time_seconds = duration
                else:
                    from models.jarvis_ai import IncidentType
                    try:
                        inc_type = IncidentType(incident.get('type'))
                    except ValueError:
                        inc_type = IncidentType.CUSTOM
                    
                    record = LearningRecord(
                        incident_type=inc_type,
                        service_name=incident.get('service_name'),
                        symptoms=symptoms,
                        successful_playbook=playbook_id if success else None,
                        success_count=1 if success else 0,
                        failure_count=0 if success else 1,
                        pattern_hash=pattern_hash
                    )
                    session.add(record)
                
                session.flush()
                
        except Exception as e:
            logger.error(f"[Remediation] Failed to record learning: {e}")
    
    def get_learning_stats(self) -> Dict:
        """Get learning statistics from past incidents"""
        try:
            from models.jarvis_ai import LearningRecord, Incident, IncidentStatus
            
            with db_service.get_session() as session:
                records = session.query(LearningRecord).all()
                
                total_success = sum(r.success_count for r in records)
                total_failure = sum(r.failure_count for r in records)
                total = total_success + total_failure
                
                common_issues = session.query(
                    LearningRecord.incident_type,
                    LearningRecord.service_name
                ).order_by(
                    (LearningRecord.success_count + LearningRecord.failure_count).desc()
                ).limit(10).all()
                
                total_incidents = session.query(Incident).count()
                resolved_incidents = session.query(Incident).filter(
                    Incident.status == IncidentStatus.RESOLVED
                ).count()
                auto_resolved = session.query(Incident).filter(
                    Incident.status == IncidentStatus.RESOLVED,
                    Incident.auto_remediated == True
                ).count()
            
            return {
                'success': True,
                'statistics': {
                    'total_patterns': len(records),
                    'total_resolutions': total,
                    'success_count': total_success,
                    'failure_count': total_failure,
                    'success_rate': total_success / total if total > 0 else 0,
                    'total_incidents': total_incidents,
                    'resolved_incidents': resolved_incidents,
                    'auto_resolved': auto_resolved,
                    'auto_resolution_rate': auto_resolved / resolved_incidents if resolved_incidents > 0 else 0
                },
                'common_issues': [
                    {'type': str(issue[0].value) if issue[0] else 'unknown', 'service': issue[1]}
                    for issue in common_issues
                ],
                'playbook_effectiveness': {
                    r.successful_playbook: {
                        'success_rate': r.success_count / (r.success_count + r.failure_count) if (r.success_count + r.failure_count) > 0 else 0,
                        'total_uses': r.success_count + r.failure_count
                    }
                    for r in records if r.successful_playbook
                }
            }
            
        except Exception as e:
            logger.error(f"[Remediation] Failed to get learning stats: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_playbooks(self, applicable_to: str = None) -> List[Dict]:
        """Get available playbooks, optionally filtered by applicable issue type"""
        playbooks = list(self.PLAYBOOKS.values())
        
        if applicable_to:
            playbooks = [
                p for p in playbooks
                if applicable_to in p.get('applicable_issues', [])
            ]
        
        return playbooks
    
    def get_auto_remediation_settings(self) -> Dict:
        """Get current auto-remediation settings"""
        try:
            from models.jarvis_ai import AutoRemediationSettings
            
            with db_service.get_session() as session:
                settings = session.query(AutoRemediationSettings).all()
                
                return {
                    'success': True,
                    'settings': [s.to_dict() for s in settings],
                    'global_enabled': any(s.enabled for s in settings)
                }
                
        except Exception as e:
            logger.error(f"[Remediation] Failed to get settings: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_auto_remediation_settings(
        self,
        playbook_id: str = None,
        service_name: str = None,
        enabled: bool = True,
        **kwargs
    ) -> Dict:
        """Update auto-remediation settings"""
        try:
            from models.jarvis_ai import AutoRemediationSettings, IncidentSeverity
            
            with db_service.get_session() as session:
                setting = session.query(AutoRemediationSettings).filter(
                    AutoRemediationSettings.playbook_id == playbook_id,
                    AutoRemediationSettings.service_name == service_name
                ).first()
                
                if not setting:
                    setting = AutoRemediationSettings(
                        playbook_id=playbook_id,
                        service_name=service_name
                    )
                    session.add(setting)
                
                setting.enabled = enabled
                
                if 'max_auto_attempts' in kwargs:
                    setting.max_auto_attempts = kwargs['max_auto_attempts']
                if 'cooldown_minutes' in kwargs:
                    setting.cooldown_minutes = kwargs['cooldown_minutes']
                if 'require_approval_severity' in kwargs:
                    try:
                        setting.require_approval_severity = IncidentSeverity(kwargs['require_approval_severity'])
                    except ValueError:
                        pass
                if 'notify_channels' in kwargs:
                    setting.notify_channels = kwargs['notify_channels']
                
                setting.updated_by = kwargs.get('updated_by', 'system')
                
                session.flush()
                result = setting.to_dict()
            
            return {'success': True, 'setting': result}
            
        except Exception as e:
            logger.error(f"[Remediation] Failed to update settings: {e}")
            return {'success': False, 'error': str(e)}
    
    def detect_and_create_incidents(self) -> List[Dict]:
        """Automatically detect issues and create incidents"""
        failures = jarvis_remediator.detect_failures()
        incidents = []
        
        for failure in failures:
            incident_type = 'container_down'
            if failure.get('health_status') == 'unhealthy':
                incident_type = 'container_unhealthy'
            elif failure.get('restart_count', 0) > 3:
                incident_type = 'container_crash_loop'
            
            result = self.create_incident(
                incident_type=incident_type,
                service_name=failure.get('service_name'),
                title=f"{failure.get('display_name', failure.get('service_name'))} - {failure.get('message', 'Service issue detected')}",
                container_name=failure.get('container_name'),
                severity=failure.get('severity', 'medium'),
                trigger_source='auto_detection',
                trigger_details=failure
            )
            
            if result.get('success'):
                incidents.append(result.get('incident'))
        
        return incidents


remediation_service = RemediationService()

__all__ = ['RemediationService', 'remediation_service']
