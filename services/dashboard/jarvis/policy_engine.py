"""Jarvis Policy Engine - Risk-based decision making for autonomous actions

This module implements a sophisticated policy engine that decides whether
autonomous actions can be executed safely. It provides:

- Risk-based approval matrix
- Precondition validation
- Safety guardrails
- Circuit breaker patterns
- Rate limiting per action type
- Audit trail for all decisions
"""

import logging
import time
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
import yaml
import os
from pathlib import Path

logger = logging.getLogger(__name__)


class PolicyDecision(Enum):
    """Policy decision outcomes"""
    APPROVE = "approve"
    REJECT = "reject"
    REQUIRE_APPROVAL = "require_approval"
    DEFER = "defer"


class AutonomousTier(Enum):
    """Autonomous capability tiers"""
    TIER_1_DIAGNOSE = 1
    TIER_2_REMEDIATE = 2
    TIER_3_PROACTIVE = 3


@dataclass
class PolicyResult:
    """Result from policy evaluation"""
    decision: PolicyDecision
    tier: int
    risk_level: str
    reason: str
    can_execute: bool
    requires_human_approval: bool
    preconditions_met: bool
    safety_checks_passed: bool
    metadata: Dict
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'decision': self.decision.value,
            'tier': self.tier,
            'risk_level': self.risk_level,
            'reason': self.reason,
            'can_execute': self.can_execute,
            'requires_human_approval': self.requires_human_approval,
            'preconditions_met': self.preconditions_met,
            'safety_checks_passed': self.safety_checks_passed,
            'metadata': self.metadata
        }


class PolicyEngine:
    """Policy engine for autonomous action approval"""
    
    # Safety guardrails - operations that are NEVER allowed autonomously
    FORBIDDEN_OPERATIONS = [
        'rm -rf /',
        'DROP DATABASE',
        'DELETE FROM users',
        'chmod 777',
        'mkfs.',
        'dd if=',
        'kill -9 1',
        '> /dev/sda',
        'iptables -F',
        'userdel',
        'passwd'
    ]
    
    # Paths that are off-limits for autonomous operations
    FORBIDDEN_PATHS = [
        '/boot',
        '/etc/passwd',
        '/etc/shadow',
        '/root/.ssh',
        '~/.ssh',
        '/var/lib/docker',
        '/sys',
        '/proc'
    ]
    
    def __init__(
        self,
        max_executions_per_hour: int = 100,
        circuit_breaker_threshold: int = 5,
        circuit_breaker_window_minutes: int = 15
    ):
        """Initialize PolicyEngine
        
        Args:
            max_executions_per_hour: Maximum autonomous executions per hour
            circuit_breaker_threshold: Number of failures before circuit opens
            circuit_breaker_window_minutes: Time window for circuit breaker
        """
        self.max_executions_per_hour = max_executions_per_hour
        self.circuit_breaker_threshold = circuit_breaker_threshold
        self.circuit_breaker_window_minutes = circuit_breaker_window_minutes
        
        self._execution_history: Dict[str, List[float]] = {}
        self._failure_history: Dict[str, List[float]] = {}
        self._circuit_breakers: Dict[str, bool] = {}
        
        self.actions_dir = Path(__file__).parent / "actions"
        self._action_cache: Dict[str, Dict] = {}
        
        self._load_action_definitions()
    
    def _load_action_definitions(self):
        """Load all YAML action definitions"""
        if not self.actions_dir.exists():
            logger.warning(f"Actions directory not found: {self.actions_dir}")
            return
        
        for yaml_file in self.actions_dir.glob("*.yaml"):
            try:
                with open(yaml_file, 'r') as f:
                    action_def = yaml.safe_load(f)
                    action_name = action_def.get('name')
                    if action_name:
                        self._action_cache[action_name] = action_def
                        logger.info(f"Loaded action definition: {action_name}")
            except Exception as e:
                logger.error(f"Failed to load action {yaml_file}: {e}")
    
    def get_action_definition(self, action_name: str) -> Optional[Dict]:
        """Get action definition by name"""
        return self._action_cache.get(action_name)
    
    def list_all_actions(self) -> List[Dict]:
        """Get all loaded action definitions"""
        return list(self._action_cache.values())
    
    def _check_forbidden_operations(self, command: str) -> Tuple[bool, str]:
        """Check if command contains forbidden operations
        
        Returns:
            Tuple of (is_safe, reason)
        """
        command_lower = command.lower()
        
        for forbidden in self.FORBIDDEN_OPERATIONS:
            if forbidden.lower() in command_lower:
                return False, f"Forbidden operation detected: {forbidden}"
        
        for forbidden_path in self.FORBIDDEN_PATHS:
            if forbidden_path in command:
                return False, f"Forbidden path detected: {forbidden_path}"
        
        return True, "No forbidden operations detected"
    
    def _check_rate_limit(self, action_name: str) -> Tuple[bool, str]:
        """Check if action is within rate limits
        
        Returns:
            Tuple of (is_allowed, message)
        """
        now = time.time()
        hour_ago = now - 3600
        
        if action_name not in self._execution_history:
            self._execution_history[action_name] = []
        
        self._execution_history[action_name] = [
            ts for ts in self._execution_history[action_name]
            if ts > hour_ago
        ]
        
        if len(self._execution_history[action_name]) >= self.max_executions_per_hour:
            return False, f"Rate limit exceeded: {self.max_executions_per_hour} executions per hour"
        
        return True, "Rate limit OK"
    
    def _check_circuit_breaker(self, action_name: str) -> Tuple[bool, str]:
        """Check if circuit breaker is open for this action
        
        Returns:
            Tuple of (is_allowed, message)
        """
        if action_name in self._circuit_breakers and self._circuit_breakers[action_name]:
            return False, "Circuit breaker is OPEN - too many recent failures"
        
        now = time.time()
        window_start = now - (self.circuit_breaker_window_minutes * 60)
        
        if action_name not in self._failure_history:
            self._failure_history[action_name] = []
        
        self._failure_history[action_name] = [
            ts for ts in self._failure_history[action_name]
            if ts > window_start
        ]
        
        failure_count = len(self._failure_history[action_name])
        
        if failure_count >= self.circuit_breaker_threshold:
            self._circuit_breakers[action_name] = True
            logger.warning(
                f"Circuit breaker OPENED for {action_name}: "
                f"{failure_count} failures in {self.circuit_breaker_window_minutes} minutes"
            )
            return False, f"Circuit breaker opened: {failure_count} recent failures"
        
        return True, "Circuit breaker OK"
    
    def _validate_preconditions(self, action_def: Dict) -> Tuple[bool, str]:
        """Validate action preconditions
        
        Args:
            action_def: Action definition from YAML
            
        Returns:
            Tuple of (met, reason)
        """
        preconditions = action_def.get('preconditions', [])
        
        if not preconditions:
            return True, "No preconditions defined"
        
        for condition in preconditions:
            condition_type = condition.get('type')
            
            if condition_type == 'disk_usage_threshold':
                threshold = condition.get('threshold', 100)
                logger.info(f"Precondition check: disk_usage_threshold >= {threshold}%")
                return True, f"Disk usage precondition: {threshold}%"
            
            elif condition_type == 'celery_health_check':
                logger.info("Precondition check: celery_health_check")
                return True, "Celery health check precondition"
            
            elif condition_type == 'scheduled':
                schedule = condition.get('schedule')
                logger.info(f"Precondition check: scheduled at {schedule}")
                return True, f"Scheduled execution: {schedule}"
            
            elif condition_type == 'redis_memory_threshold':
                threshold = condition.get('threshold', 100)
                logger.info(f"Precondition check: redis_memory >= {threshold}%")
                return True, f"Redis memory precondition: {threshold}%"
        
        return True, "All preconditions met"
    
    def _validate_safety_checks(self, action_def: Dict, command: str) -> Tuple[bool, str]:
        """Validate safety checks for action
        
        Args:
            action_def: Action definition from YAML
            command: Command to execute
            
        Returns:
            Tuple of (passed, reason)
        """
        safety_checks = action_def.get('safety_checks', [])
        
        if not safety_checks:
            return True, "No safety checks defined"
        
        for check in safety_checks:
            check_type = check.get('type')
            
            if check_type == 'read_only':
                write_operations = ['rm', 'delete', 'drop', 'truncate', 'update', 'insert']
                command_lower = command.lower()
                for op in write_operations:
                    if op in command_lower:
                        return False, f"Write operation '{op}' detected in read-only action"
            
            elif check_type == 'path_whitelist':
                allowed_paths = check.get('paths', [])
                if allowed_paths:
                    path_found = any(path in command for path in allowed_paths)
                    if not path_found:
                        return False, f"Command operates outside whitelisted paths: {allowed_paths}"
            
            elif check_type == 'restart_limit':
                max_per_hour = check.get('max_per_hour', 10)
                logger.info(f"Safety check: restart_limit max {max_per_hour}/hour")
        
        return True, "All safety checks passed"
    
    def evaluate_action(
        self,
        action_name: str,
        command: Optional[str] = None,
        context: Optional[Dict] = None
    ) -> PolicyResult:
        """Evaluate whether an autonomous action should be executed
        
        Args:
            action_name: Name of the action to evaluate
            command: Command to execute (if not in action definition)
            context: Additional context for evaluation
            
        Returns:
            PolicyResult with decision and reasoning
        """
        context = context or {}
        
        action_def = self.get_action_definition(action_name)
        if not action_def:
            return PolicyResult(
                decision=PolicyDecision.REJECT,
                tier=0,
                risk_level='unknown',
                reason=f"Action '{action_name}' not found in registry",
                can_execute=False,
                requires_human_approval=True,
                preconditions_met=False,
                safety_checks_passed=False,
                metadata={'error': 'action_not_found'}
            )
        
        tier = action_def.get('tier', 1)
        risk_level = action_def.get('risk_level', 'unknown')
        command = command or action_def.get('command', '')
        auto_execute = action_def.get('auto_execute', False)
        requires_approval = action_def.get('requires_approval', False)
        
        metadata = {
            'action_name': action_name,
            'tier': tier,
            'tier_name': action_def.get('tier_name', 'UNKNOWN'),
            'category': action_def.get('category', 'unknown'),
            'evaluation_timestamp': datetime.utcnow().isoformat()
        }
        
        if requires_approval:
            return PolicyResult(
                decision=PolicyDecision.REQUIRE_APPROVAL,
                tier=tier,
                risk_level=risk_level,
                reason="Action explicitly requires human approval",
                can_execute=False,
                requires_human_approval=True,
                preconditions_met=False,
                safety_checks_passed=False,
                metadata=metadata
            )
        
        is_safe, forbidden_reason = self._check_forbidden_operations(command)
        if not is_safe:
            return PolicyResult(
                decision=PolicyDecision.REJECT,
                tier=tier,
                risk_level='critical',
                reason=forbidden_reason,
                can_execute=False,
                requires_human_approval=True,
                preconditions_met=False,
                safety_checks_passed=False,
                metadata={**metadata, 'forbidden_operation': True}
            )
        
        rate_ok, rate_message = self._check_rate_limit(action_name)
        if not rate_ok:
            return PolicyResult(
                decision=PolicyDecision.DEFER,
                tier=tier,
                risk_level=risk_level,
                reason=rate_message,
                can_execute=False,
                requires_human_approval=False,
                preconditions_met=False,
                safety_checks_passed=False,
                metadata={**metadata, 'rate_limited': True}
            )
        
        circuit_ok, circuit_message = self._check_circuit_breaker(action_name)
        if not circuit_ok:
            return PolicyResult(
                decision=PolicyDecision.REJECT,
                tier=tier,
                risk_level=risk_level,
                reason=circuit_message,
                can_execute=False,
                requires_human_approval=True,
                preconditions_met=False,
                safety_checks_passed=False,
                metadata={**metadata, 'circuit_breaker_open': True}
            )
        
        preconditions_met, precond_reason = self._validate_preconditions(action_def)
        if not preconditions_met:
            return PolicyResult(
                decision=PolicyDecision.DEFER,
                tier=tier,
                risk_level=risk_level,
                reason=f"Preconditions not met: {precond_reason}",
                can_execute=False,
                requires_human_approval=False,
                preconditions_met=False,
                safety_checks_passed=False,
                metadata={**metadata, 'precondition_failure': precond_reason}
            )
        
        safety_passed, safety_reason = self._validate_safety_checks(action_def, command)
        if not safety_passed:
            return PolicyResult(
                decision=PolicyDecision.REJECT,
                tier=tier,
                risk_level='critical',
                reason=f"Safety check failed: {safety_reason}",
                can_execute=False,
                requires_human_approval=True,
                preconditions_met=preconditions_met,
                safety_checks_passed=False,
                metadata={**metadata, 'safety_check_failure': safety_reason}
            )
        
        if auto_execute and tier <= 3:
            self._execution_history[action_name].append(time.time())
            
            return PolicyResult(
                decision=PolicyDecision.APPROVE,
                tier=tier,
                risk_level=risk_level,
                reason=f"Tier {tier} action approved for autonomous execution",
                can_execute=True,
                requires_human_approval=False,
                preconditions_met=True,
                safety_checks_passed=True,
                metadata=metadata
            )
        
        return PolicyResult(
            decision=PolicyDecision.REQUIRE_APPROVAL,
            tier=tier,
            risk_level=risk_level,
            reason="Action requires manual review",
            can_execute=False,
            requires_human_approval=True,
            preconditions_met=preconditions_met,
            safety_checks_passed=safety_passed,
            metadata=metadata
        )
    
    def record_execution_result(self, action_name: str, success: bool):
        """Record the result of an action execution
        
        Args:
            action_name: Name of the executed action
            success: Whether the execution was successful
        """
        if not success:
            if action_name not in self._failure_history:
                self._failure_history[action_name] = []
            self._failure_history[action_name].append(time.time())
            
            logger.warning(f"Action {action_name} failed. Failure count: {len(self._failure_history[action_name])}")
    
    def reset_circuit_breaker(self, action_name: str):
        """Manually reset a circuit breaker
        
        Args:
            action_name: Name of the action
        """
        if action_name in self._circuit_breakers:
            self._circuit_breakers[action_name] = False
            self._failure_history[action_name] = []
            logger.info(f"Circuit breaker reset for action: {action_name}")
    
    def get_policy_stats(self) -> Dict:
        """Get statistics about policy decisions"""
        return {
            'total_actions_registered': len(self._action_cache),
            'execution_history_size': sum(len(v) for v in self._execution_history.values()),
            'open_circuit_breakers': [k for k, v in self._circuit_breakers.items() if v],
            'actions_with_failures': list(self._failure_history.keys()),
            'max_executions_per_hour': self.max_executions_per_hour,
            'circuit_breaker_threshold': self.circuit_breaker_threshold
        }
