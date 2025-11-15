"""Jarvis Autonomous Agent - 3-Tier Autonomous Execution System

This module implements the core autonomous agent that executes actions
based on policy engine decisions. It provides:

- 3-tier execution model (DIAGNOSE, REMEDIATE, PROACTIVE)
- State tracking and audit trails
- Rollback capabilities
- Integration with policy engine
- Observability and metrics
"""

import logging
import time
from typing import Dict, Optional, List
from datetime import datetime
from dataclasses import dataclass
import subprocess
import traceback

from .policy_engine import PolicyEngine, PolicyDecision, AutonomousTier
from .safe_executor import SafeCommandExecutor, ExecutionResult
from models import get_session, JarvisAction, ActionStatus, ActionType

logger = logging.getLogger(__name__)


@dataclass
class AutonomousExecutionResult:
    """Result from autonomous action execution"""
    action_name: str
    tier: int
    success: bool
    decision: str
    execution_result: Optional[Dict]
    policy_result: Dict
    timestamp: datetime
    execution_time_ms: float
    error: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'action_name': self.action_name,
            'tier': self.tier,
            'success': self.success,
            'decision': self.decision,
            'execution_result': self.execution_result,
            'policy_result': self.policy_result,
            'timestamp': self.timestamp.isoformat(),
            'execution_time_ms': self.execution_time_ms,
            'error': self.error
        }


class AutonomousAgent:
    """Jarvis autonomous execution agent"""
    
    def __init__(self):
        """Initialize AutonomousAgent"""
        self.policy_engine = PolicyEngine(
            max_executions_per_hour=100,
            circuit_breaker_threshold=5,
            circuit_breaker_window_minutes=15
        )
        
        self.executor = SafeCommandExecutor(
            default_timeout=60,
            max_executions_per_minute=20,
            audit_log_path="/tmp/jarvis_autonomous_audit.log"
        )
        
        self._execution_metrics = {
            'total_executions': 0,
            'successful_executions': 0,
            'failed_executions': 0,
            'tier1_executions': 0,
            'tier2_executions': 0,
            'tier3_executions': 0,
            'policy_rejections': 0,
            'policy_deferrals': 0
        }
    
    def _save_to_database(
        self,
        action_name: str,
        command: str,
        result: AutonomousExecutionResult,
        policy_result: Dict
    ) -> Optional[str]:
        """Save action execution to database
        
        Args:
            action_name: Name of the action
            command: Command that was executed
            result: Execution result
            policy_result: Policy evaluation result
            
        Returns:
            Action ID if saved successfully, None otherwise
        """
        try:
            session = get_session()
            try:
                status = ActionStatus.EXECUTED if result.success else ActionStatus.FAILED
                
                action = JarvisAction(
                    action_type=ActionType.COMMAND_EXECUTION,
                    status=status,
                    command=command,
                    description=f"Autonomous {action_name} (Tier {result.tier})",
                    risk_level=policy_result.get('risk_level', 'unknown'),
                    requested_by='jarvis-autonomous',
                    approved_by='policy-engine',
                    approved_at=datetime.utcnow(),
                    executed_at=result.timestamp,
                    execution_result=result.execution_result,
                    execution_time_ms=int(result.execution_time_ms),
                    action_metadata={
                        'autonomous': True,
                        'tier': result.tier,
                        'tier_name': policy_result.get('metadata', {}).get('tier_name', 'UNKNOWN'),
                        'category': policy_result.get('metadata', {}).get('category', 'unknown'),
                        'policy_decision': result.decision,
                        'action_name': action_name
                    }
                )
                
                session.add(action)
                session.commit()
                session.refresh(action)
                
                action_id = str(action.id)
                logger.info(f"Saved autonomous action to database: {action_id}")
                return action_id
                
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Failed to save autonomous action to database: {e}", exc_info=True)
            return None
    
    def execute_action(
        self,
        action_name: str,
        dry_run: bool = False,
        context: Optional[Dict] = None
    ) -> AutonomousExecutionResult:
        """Execute an autonomous action
        
        Args:
            action_name: Name of the action to execute
            dry_run: If True, only validate without executing
            context: Additional context for execution
            
        Returns:
            AutonomousExecutionResult with execution details
        """
        start_time = time.time()
        timestamp = datetime.utcnow()
        
        logger.info(f"Executing autonomous action: {action_name} (dry_run={dry_run})")
        
        try:
            policy_result = self.policy_engine.evaluate_action(
                action_name=action_name,
                context=context
            )
            
            policy_dict = policy_result.to_dict()
            tier = policy_result.tier
            
            if tier >= 1 and tier <= 3:
                metric_key = f'tier{tier}_executions'
                self._execution_metrics[metric_key] += 1
            
            if policy_result.decision == PolicyDecision.REJECT:
                self._execution_metrics['policy_rejections'] += 1
                
                execution_time_ms = (time.time() - start_time) * 1000
                
                logger.warning(f"Action {action_name} rejected by policy: {policy_result.reason}")
                
                return AutonomousExecutionResult(
                    action_name=action_name,
                    tier=tier,
                    success=False,
                    decision=policy_result.decision.value,
                    execution_result=None,
                    policy_result=policy_dict,
                    timestamp=timestamp,
                    execution_time_ms=execution_time_ms,
                    error=policy_result.reason
                )
            
            if policy_result.decision == PolicyDecision.DEFER:
                self._execution_metrics['policy_deferrals'] += 1
                
                execution_time_ms = (time.time() - start_time) * 1000
                
                logger.info(f"Action {action_name} deferred: {policy_result.reason}")
                
                return AutonomousExecutionResult(
                    action_name=action_name,
                    tier=tier,
                    success=False,
                    decision=policy_result.decision.value,
                    execution_result=None,
                    policy_result=policy_dict,
                    timestamp=timestamp,
                    execution_time_ms=execution_time_ms,
                    error=f"Deferred: {policy_result.reason}"
                )
            
            if policy_result.decision == PolicyDecision.REQUIRE_APPROVAL:
                logger.info(f"Action {action_name} requires human approval")
                
                execution_time_ms = (time.time() - start_time) * 1000
                
                return AutonomousExecutionResult(
                    action_name=action_name,
                    tier=tier,
                    success=False,
                    decision=policy_result.decision.value,
                    execution_result=None,
                    policy_result=policy_dict,
                    timestamp=timestamp,
                    execution_time_ms=execution_time_ms,
                    error="Requires human approval"
                )
            
            action_def = self.policy_engine.get_action_definition(action_name)
            if not action_def:
                execution_time_ms = (time.time() - start_time) * 1000
                return AutonomousExecutionResult(
                    action_name=action_name,
                    tier=0,
                    success=False,
                    decision='error',
                    execution_result=None,
                    policy_result={},
                    timestamp=timestamp,
                    execution_time_ms=execution_time_ms,
                    error=f"Action definition not found: {action_name}"
                )
            
            command = action_def.get('command', '')
            
            if dry_run:
                exec_result = self.executor.dry_run(command, user='jarvis-autonomous')
            else:
                timeout = action_def.get('timeout_seconds', 60)
                exec_result = self.executor.execute(
                    command=command,
                    user='jarvis-autonomous',
                    timeout=timeout
                )
            
            execution_time_ms = (time.time() - start_time) * 1000
            
            self._execution_metrics['total_executions'] += 1
            if exec_result.success:
                self._execution_metrics['successful_executions'] += 1
            else:
                self._execution_metrics['failed_executions'] += 1
            
            self.policy_engine.record_execution_result(action_name, exec_result.success)
            
            result = AutonomousExecutionResult(
                action_name=action_name,
                tier=tier,
                success=exec_result.success,
                decision=policy_result.decision.value,
                execution_result=exec_result.to_dict(),
                policy_result=policy_dict,
                timestamp=timestamp,
                execution_time_ms=execution_time_ms,
                error=exec_result.stderr if not exec_result.success else None
            )
            
            if not dry_run:
                self._save_to_database(action_name, command, result, policy_dict)
            
            logger.info(
                f"Autonomous action completed: {action_name} | "
                f"success={exec_result.success} | "
                f"tier={tier} | "
                f"time={execution_time_ms:.2f}ms"
            )
            
            return result
            
        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            self._execution_metrics['failed_executions'] += 1
            
            logger.error(f"Error executing autonomous action {action_name}: {e}", exc_info=True)
            
            return AutonomousExecutionResult(
                action_name=action_name,
                tier=0,
                success=False,
                decision='error',
                execution_result=None,
                policy_result={},
                timestamp=timestamp,
                execution_time_ms=execution_time_ms,
                error=f"Exception: {str(e)}"
            )
    
    def execute_tier_actions(
        self,
        tier: int,
        dry_run: bool = False
    ) -> List[AutonomousExecutionResult]:
        """Execute all actions for a specific tier
        
        Args:
            tier: Tier level (1, 2, or 3)
            dry_run: If True, only validate without executing
            
        Returns:
            List of execution results
        """
        all_actions = self.policy_engine.list_all_actions()
        tier_actions = [a for a in all_actions if a.get('tier') == tier]
        
        logger.info(f"Executing Tier {tier} actions: {len(tier_actions)} actions")
        
        results = []
        for action_def in tier_actions:
            action_name = action_def.get('name')
            if action_name:
                result = self.execute_action(action_name, dry_run=dry_run)
                results.append(result)
        
        return results
    
    def run_diagnostics(self, dry_run: bool = False) -> List[AutonomousExecutionResult]:
        """Run all Tier 1 (DIAGNOSE) actions
        
        Args:
            dry_run: If True, only validate without executing
            
        Returns:
            List of diagnostic results
        """
        logger.info("Running Tier 1 diagnostics...")
        return self.execute_tier_actions(tier=1, dry_run=dry_run)
    
    def run_remediation(self, dry_run: bool = False) -> List[AutonomousExecutionResult]:
        """Run all Tier 2 (REMEDIATE) actions
        
        Args:
            dry_run: If True, only validate without executing
            
        Returns:
            List of remediation results
        """
        logger.info("Running Tier 2 remediation...")
        return self.execute_tier_actions(tier=2, dry_run=dry_run)
    
    def run_proactive_maintenance(self, dry_run: bool = False) -> List[AutonomousExecutionResult]:
        """Run all Tier 3 (PROACTIVE) actions
        
        Args:
            dry_run: If True, only validate without executing
            
        Returns:
            List of proactive maintenance results
        """
        logger.info("Running Tier 3 proactive maintenance...")
        return self.execute_tier_actions(tier=3, dry_run=dry_run)
    
    def get_metrics(self) -> Dict:
        """Get execution metrics and statistics"""
        policy_stats = self.policy_engine.get_policy_stats()
        
        total = self._execution_metrics['total_executions']
        successful = self._execution_metrics['successful_executions']
        failed = self._execution_metrics['failed_executions']
        
        success_rate = (successful / total * 100) if total > 0 else 0
        
        return {
            'execution_metrics': self._execution_metrics,
            'success_rate': round(success_rate, 2),
            'policy_stats': policy_stats,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def reset_metrics(self):
        """Reset execution metrics"""
        self._execution_metrics = {
            'total_executions': 0,
            'successful_executions': 0,
            'failed_executions': 0,
            'tier1_executions': 0,
            'tier2_executions': 0,
            'tier3_executions': 0,
            'policy_rejections': 0,
            'policy_deferrals': 0
        }
        logger.info("Execution metrics reset")
