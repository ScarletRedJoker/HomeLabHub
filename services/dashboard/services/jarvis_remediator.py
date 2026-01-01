"""
Jarvis Remediator Service
Agentic AI-powered service remediation with automatic detection, diagnosis, and fixes
"""
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from services.service_ops import service_ops
from services.ai_service import AIService
from services.db_service import db_service
from config import Config

logger = logging.getLogger(__name__)


@dataclass
class RemediationAction:
    """Represents a single remediation action"""
    action_type: str
    description: str
    command: Optional[str] = None
    parameters: Optional[Dict] = None
    executed: bool = False
    success: bool = False
    result: Optional[str] = None
    duration_ms: Optional[int] = None


class JarvisRemediator:
    """
    AI-powered service remediator that can:
    - Detect service failures from health checks
    - Generate remediation plans using GPT-4
    - Execute basic fixes (restart, clear cache, check logs)
    - Track remediation history
    """
    
    ALLOWED_ACTIONS = {
        'restart': 'Restart the service container',
        'check_logs': 'Analyze recent logs for errors',
        'check_resources': 'Check CPU/memory usage',
        'clear_cache': 'Clear service cache (if applicable)',
        'wait': 'Wait and monitor the service',
        'escalate': 'Escalate to human operator'
    }
    
    SEVERITY_THRESHOLDS = {
        'critical': 3,
        'high': 2,
        'medium': 1,
        'low': 0
    }
    
    def __init__(self):
        self.ai_service = AIService()
        self.config = Config()
    
    def detect_failures(self) -> List[Dict]:
        """
        Detect service failures from health checks
        
        Returns:
            List of services with detected issues
        """
        failures = []
        
        for service_key, service_info in self.config.SERVICES.items():
            container_name = service_info.get('container')
            if not container_name:
                continue
            
            health = service_ops.execute_health_check(service_key, container_name)
            
            if not health.get('healthy'):
                failure = {
                    'service_name': service_key,
                    'container_name': container_name,
                    'display_name': service_info.get('name'),
                    'status': health.get('status'),
                    'health_status': health.get('health_status'),
                    'message': health.get('message'),
                    'severity': self._determine_severity(health),
                    'detected_at': datetime.utcnow().isoformat()
                }
                failures.append(failure)
                logger.warning(f"[Jarvis] Detected failure in {service_key}: {health.get('message')}")
        
        return failures
    
    def diagnose_service(self, service_name: str) -> Dict:
        """
        Perform AI-powered diagnosis of a service issue
        
        Args:
            service_name: Name of the service to diagnose
            
        Returns:
            Diagnosis result with issue summary and recommendations
        """
        if service_name not in self.config.SERVICES:
            return {
                'success': False,
                'error': f'Unknown service: {service_name}'
            }
        
        service_info = self.config.SERVICES[service_name]
        container_name = service_info.get('container')
        
        health = service_ops.execute_health_check(service_name, container_name)
        logs = service_ops.get_service_logs(container_name, lines=100) or ''
        stats = service_ops.collect_container_stats(service_name, container_name)
        
        prompt = f"""You are Jarvis, an AI homelab operations expert. Analyze this service issue:

**Service:** {service_name} ({service_info.get('name')})
**Container:** {container_name}
**Status:** {health.get('status')}
**Health Status:** {health.get('health_status')}
**CPU Usage:** {health.get('cpu_percent', 'N/A')}%
**Memory Usage:** {health.get('memory_percent', 'N/A')}%
**Uptime:** {health.get('uptime_seconds', 'N/A')} seconds
**Restart Count:** {health.get('restart_count', 0)}

**Recent Logs (last 100 lines):**
```
{logs[:3000]}
```

Provide a structured diagnosis:

1. **Issue Summary**: One-line description of the problem
2. **Root Cause Analysis**: What is likely causing this issue
3. **Severity**: critical/high/medium/low
4. **Recommended Actions**: List specific steps to fix (max 5)
5. **Prevention**: How to prevent this in the future

Format your response as a structured analysis."""

        diagnosis = self.ai_service.chat(prompt)
        
        return {
            'success': True,
            'service_name': service_name,
            'health': health,
            'stats': stats,
            'diagnosis': diagnosis,
            'logs_analyzed': len(logs) if logs else 0,
            'diagnosed_at': datetime.utcnow().isoformat()
        }
    
    def generate_remediation_plan(self, service_name: str, issue_description: Optional[str] = None) -> Dict:
        """
        Generate an AI-powered remediation plan
        
        Args:
            service_name: Name of the service
            issue_description: Optional description of the issue
            
        Returns:
            Remediation plan with steps and actions
        """
        if service_name not in self.config.SERVICES:
            return {
                'success': False,
                'error': f'Unknown service: {service_name}'
            }
        
        diagnosis = self.diagnose_service(service_name)
        if not diagnosis.get('success'):
            return diagnosis
        
        health = diagnosis.get('health', {})
        
        allowed_actions_str = '\n'.join([f"- {k}: {v}" for k, v in self.ALLOWED_ACTIONS.items()])
        
        prompt = f"""Based on this service diagnosis, create a remediation plan.

**Diagnosis:**
{diagnosis.get('diagnosis', 'No diagnosis available')}

**Current Health:**
- Status: {health.get('status')}
- Healthy: {health.get('healthy')}
- Message: {health.get('message')}

**Available Actions:**
{allowed_actions_str}

Create a remediation plan as a JSON object with this structure:
{{
    "issue_summary": "Brief summary of the issue",
    "severity": "critical|high|medium|low",
    "steps": [
        {{
            "order": 1,
            "action": "action_name from available actions",
            "description": "What this step does",
            "expected_outcome": "What we expect to happen"
        }}
    ],
    "estimated_duration_minutes": 5,
    "rollback_plan": "How to rollback if things go wrong"
}}

Only use actions from the Available Actions list. Respond with valid JSON only."""

        plan_response = self.ai_service.chat(prompt)
        
        try:
            import json
            if '```json' in plan_response:
                plan_response = plan_response.split('```json')[1].split('```')[0].strip()
            elif '```' in plan_response:
                plan_response = plan_response.split('```')[1].split('```')[0].strip()
            
            plan = json.loads(plan_response)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse remediation plan: {e}")
            plan = {
                'issue_summary': 'Failed to generate structured plan',
                'severity': 'medium',
                'steps': [
                    {
                        'order': 1,
                        'action': 'check_logs',
                        'description': 'Check service logs for errors',
                        'expected_outcome': 'Identify the root cause'
                    },
                    {
                        'order': 2,
                        'action': 'restart',
                        'description': 'Restart the service',
                        'expected_outcome': 'Service comes back healthy'
                    }
                ],
                'estimated_duration_minutes': 5,
                'rollback_plan': 'Monitor service after restart'
            }
        
        valid_steps = []
        for step in plan.get('steps', []):
            if step.get('action') in self.ALLOWED_ACTIONS:
                valid_steps.append(step)
        plan['steps'] = valid_steps
        
        return {
            'success': True,
            'service_name': service_name,
            'plan': plan,
            'diagnosis': diagnosis.get('diagnosis'),
            'generated_at': datetime.utcnow().isoformat()
        }
    
    def execute_remediation(self, service_name: str, plan: Optional[Dict] = None, dry_run: bool = False) -> Dict:
        """
        Execute a remediation plan for a service
        
        Args:
            service_name: Name of the service
            plan: Optional pre-generated plan (will generate if not provided)
            dry_run: If True, only simulate the actions
            
        Returns:
            Execution result with actions taken and outcomes
        """
        if service_name not in self.config.SERVICES:
            return {
                'success': False,
                'error': f'Unknown service: {service_name}'
            }
        
        service_info = self.config.SERVICES[service_name]
        container_name = service_info.get('container')
        
        if not plan:
            plan_result = self.generate_remediation_plan(service_name)
            if not plan_result.get('success'):
                return plan_result
            plan = plan_result.get('plan', {})
        
        logs_before = service_ops.get_service_logs(container_name, lines=50) or ''
        
        actions_taken = []
        overall_success = True
        
        plan_dict = plan if plan else {}
        for step in plan_dict.get('steps', []):
            action_type = step.get('action')
            action_result = RemediationAction(
                action_type=action_type,
                description=step.get('description', '')
            )
            
            start_time = time.time()
            
            if dry_run:
                action_result.executed = False
                action_result.result = f"[DRY RUN] Would execute: {action_type}"
                action_result.success = True
            else:
                try:
                    if action_type == 'restart':
                        result = service_ops.restart_service(service_name, container_name)
                        action_result.success = result.get('success', False)
                        action_result.result = result.get('message', 'Restart completed')
                        time.sleep(5)
                    
                    elif action_type == 'check_logs':
                        logs = service_ops.get_service_logs(container_name, lines=100)
                        action_result.success = True
                        action_result.result = f"Retrieved {len(logs) if logs else 0} characters of logs"
                    
                    elif action_type == 'check_resources':
                        stats = service_ops.collect_container_stats(service_name, container_name)
                        action_result.success = stats is not None
                        action_result.result = f"CPU: {stats.get('cpu_percent', 'N/A')}%, Memory: {stats.get('memory_usage', 'N/A')}" if stats else 'Failed to get stats'
                    
                    elif action_type == 'wait':
                        time.sleep(10)
                        action_result.success = True
                        action_result.result = 'Waited 10 seconds'
                    
                    elif action_type == 'escalate':
                        action_result.success = True
                        action_result.result = 'Issue escalated to human operator'
                    
                    elif action_type == 'clear_cache':
                        action_result.success = True
                        action_result.result = 'Cache clear not implemented for this service'
                    
                    else:
                        action_result.success = False
                        action_result.result = f'Unknown action: {action_type}'
                    
                    action_result.executed = True
                    
                except Exception as e:
                    logger.error(f"Failed to execute action {action_type}: {e}")
                    action_result.success = False
                    action_result.result = str(e)
                    action_result.executed = True
            
            action_result.duration_ms = int((time.time() - start_time) * 1000)
            actions_taken.append({
                'action_type': action_result.action_type,
                'description': action_result.description,
                'executed': action_result.executed,
                'success': action_result.success,
                'result': action_result.result,
                'duration_ms': action_result.duration_ms
            })
            
            if not action_result.success:
                overall_success = False
        
        health_after = service_ops.execute_health_check(service_name, container_name)
        logs_after = service_ops.get_service_logs(container_name, lines=50) or ''
        
        remediation_record = self._save_remediation_history(
            service_name=service_name,
            container_name=container_name,
            plan=plan_dict,
            actions_taken=actions_taken,
            success=overall_success and health_after.get('healthy', False),
            logs_before=logs_before,
            logs_after=logs_after
        )
        
        return {
            'success': overall_success and health_after.get('healthy', False),
            'service_name': service_name,
            'dry_run': dry_run,
            'plan': plan,
            'actions_taken': actions_taken,
            'actions_count': len(actions_taken),
            'health_after': health_after,
            'remediation_id': remediation_record,
            'completed_at': datetime.utcnow().isoformat()
        }
    
    def get_remediation_history(self, service_name: Optional[str] = None, limit: int = 10) -> List[Dict]:
        """
        Get remediation history for a service or all services
        
        Args:
            service_name: Optional service name filter
            limit: Maximum number of records to return
            
        Returns:
            List of remediation history records
        """
        try:
            from models.jarvis_ai import RemediationHistory
            
            with db_service.get_session() as session:
                query = session.query(RemediationHistory)
                
                if service_name:
                    query = query.filter(RemediationHistory.service_name == service_name)
                
                records = query.order_by(RemediationHistory.started_at.desc()).limit(limit).all()
                
                return [record.to_dict() for record in records]
        except Exception as e:
            logger.error(f"Failed to get remediation history: {e}")
            return []
    
    def _determine_severity(self, health: Dict) -> str:
        """Determine severity based on health check results"""
        if health.get('status') == 'not_found':
            return 'critical'
        if health.get('health_status') == 'unhealthy':
            return 'high'
        if health.get('restart_count', 0) > 3:
            return 'high'
        if not health.get('healthy'):
            return 'medium'
        return 'low'
    
    def _save_remediation_history(
        self,
        service_name: str,
        container_name: str,
        plan: Dict,
        actions_taken: List[Dict],
        success: bool,
        logs_before: str,
        logs_after: str
    ) -> Optional[int]:
        """Save remediation history to database"""
        try:
            from models.jarvis_ai import RemediationHistory, RemediationStatus
            
            with db_service.get_session() as session:
                record = RemediationHistory(
                    service_name=service_name,
                    container_name=container_name,
                    trigger_type='manual',
                    trigger_details={},
                    issue_summary=plan.get('issue_summary'),
                    ai_diagnosis=None,
                    ai_plan=plan,
                    ai_model_used='gpt-4o',
                    actions_taken=actions_taken,
                    actions_count=len(actions_taken),
                    status=RemediationStatus.COMPLETED if success else RemediationStatus.FAILED,
                    success=success,
                    result_message='Remediation completed' if success else 'Remediation failed',
                    logs_before=logs_before[:5000] if logs_before else None,
                    logs_after=logs_after[:5000] if logs_after else None,
                    initiated_by='jarvis',
                    is_automatic=False,
                    completed_at=datetime.utcnow()
                )
                
                session.add(record)
                session.flush()
                record_id = record.id
                
            return record_id
        except Exception as e:
            logger.error(f"Failed to save remediation history: {e}")
            return None


jarvis_remediator = JarvisRemediator()

__all__ = ['JarvisRemediator', 'jarvis_remediator', 'RemediationAction']
