"""Observability and Metrics for Jarvis Autonomous System

This module provides structured logging, metrics collection, and monitoring
for autonomous actions. It integrates with Prometheus and structured logging.
"""

import logging
import structlog
from typing import Dict, Optional
from datetime import datetime
from enum import Enum
import time

logger = structlog.get_logger(__name__)


class MetricType(Enum):
    """Types of metrics to track"""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


class AutonomousMetrics:
    """Metrics collector for autonomous operations"""
    
    def __init__(self):
        """Initialize metrics collector"""
        self._metrics = {
            'autonomous_actions_total': 0,
            'autonomous_actions_success': 0,
            'autonomous_actions_failed': 0,
            'autonomous_actions_deferred': 0,
            'autonomous_actions_rejected': 0,
            
            'tier1_executions': 0,
            'tier2_executions': 0,
            'tier3_executions': 0,
            
            'circuit_breakers_opened': 0,
            'rate_limits_hit': 0,
            'safety_violations': 0,
            
            'avg_execution_time_ms': 0,
            'total_execution_time_ms': 0,
        }
        
        self._tier_metrics = {
            1: {'total': 0, 'success': 0, 'failed': 0},
            2: {'total': 0, 'success': 0, 'failed': 0},
            3: {'total': 0, 'success': 0, 'failed': 0}
        }
    
    def record_action_start(
        self,
        action_name: str,
        tier: int,
        risk_level: str
    ):
        """Record the start of an autonomous action
        
        Args:
            action_name: Name of the action
            tier: Tier level (1, 2, or 3)
            risk_level: Risk level of the action
        """
        logger.info(
            "autonomous_action_started",
            action_name=action_name,
            tier=tier,
            risk_level=risk_level,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['autonomous_actions_total'] += 1
        
        if tier in self._tier_metrics:
            self._tier_metrics[tier]['total'] += 1
    
    def record_action_success(
        self,
        action_name: str,
        tier: int,
        execution_time_ms: float,
        result: Optional[Dict] = None
    ):
        """Record successful autonomous action
        
        Args:
            action_name: Name of the action
            tier: Tier level
            execution_time_ms: Execution time in milliseconds
            result: Optional result dictionary
        """
        logger.info(
            "autonomous_action_success",
            action_name=action_name,
            tier=tier,
            execution_time_ms=execution_time_ms,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['autonomous_actions_success'] += 1
        self._metrics['total_execution_time_ms'] += execution_time_ms
        
        if tier in self._tier_metrics:
            self._tier_metrics[tier]['success'] += 1
        
        total_actions = self._metrics['autonomous_actions_total']
        if total_actions > 0:
            self._metrics['avg_execution_time_ms'] = (
                self._metrics['total_execution_time_ms'] / total_actions
            )
    
    def record_action_failure(
        self,
        action_name: str,
        tier: int,
        error: str,
        execution_time_ms: float
    ):
        """Record failed autonomous action
        
        Args:
            action_name: Name of the action
            tier: Tier level
            error: Error message
            execution_time_ms: Execution time in milliseconds
        """
        logger.error(
            "autonomous_action_failed",
            action_name=action_name,
            tier=tier,
            error=error,
            execution_time_ms=execution_time_ms,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['autonomous_actions_failed'] += 1
        
        if tier in self._tier_metrics:
            self._tier_metrics[tier]['failed'] += 1
    
    def record_action_deferred(
        self,
        action_name: str,
        reason: str
    ):
        """Record deferred autonomous action
        
        Args:
            action_name: Name of the action
            reason: Reason for deferral
        """
        logger.info(
            "autonomous_action_deferred",
            action_name=action_name,
            reason=reason,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['autonomous_actions_deferred'] += 1
    
    def record_action_rejected(
        self,
        action_name: str,
        reason: str
    ):
        """Record rejected autonomous action
        
        Args:
            action_name: Name of the action
            reason: Reason for rejection
        """
        logger.warning(
            "autonomous_action_rejected",
            action_name=action_name,
            reason=reason,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['autonomous_actions_rejected'] += 1
    
    def record_circuit_breaker_opened(
        self,
        action_name: str,
        failure_count: int
    ):
        """Record circuit breaker opening
        
        Args:
            action_name: Name of the action
            failure_count: Number of failures that triggered the circuit breaker
        """
        logger.warning(
            "circuit_breaker_opened",
            action_name=action_name,
            failure_count=failure_count,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['circuit_breakers_opened'] += 1
    
    def record_rate_limit_hit(
        self,
        action_name: str
    ):
        """Record rate limit hit
        
        Args:
            action_name: Name of the action
        """
        logger.warning(
            "rate_limit_hit",
            action_name=action_name,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['rate_limits_hit'] += 1
    
    def record_safety_violation(
        self,
        action_name: str,
        violation_type: str,
        details: str
    ):
        """Record safety violation
        
        Args:
            action_name: Name of the action
            violation_type: Type of safety violation
            details: Violation details
        """
        logger.error(
            "safety_violation",
            action_name=action_name,
            violation_type=violation_type,
            details=details,
            timestamp=datetime.utcnow().isoformat()
        )
        
        self._metrics['safety_violations'] += 1
    
    def get_metrics(self) -> Dict:
        """Get all collected metrics
        
        Returns:
            Dictionary of all metrics
        """
        success_rate = 0.0
        if self._metrics['autonomous_actions_total'] > 0:
            success_rate = (
                self._metrics['autonomous_actions_success'] /
                self._metrics['autonomous_actions_total'] * 100
            )
        
        return {
            'overall': {
                **self._metrics,
                'success_rate': round(success_rate, 2)
            },
            'by_tier': self._tier_metrics,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def reset_metrics(self):
        """Reset all metrics to zero"""
        self._metrics = {key: 0 for key in self._metrics}
        self._tier_metrics = {
            1: {'total': 0, 'success': 0, 'failed': 0},
            2: {'total': 0, 'success': 0, 'failed': 0},
            3: {'total': 0, 'success': 0, 'failed': 0}
        }
        
        logger.info("metrics_reset", timestamp=datetime.utcnow().isoformat())
    
    def export_prometheus_format(self) -> str:
        """Export metrics in Prometheus format
        
        Returns:
            Metrics string in Prometheus format
        """
        metrics_lines = []
        
        metrics_lines.append("# HELP autonomous_actions_total Total number of autonomous actions")
        metrics_lines.append("# TYPE autonomous_actions_total counter")
        metrics_lines.append(f"autonomous_actions_total {self._metrics['autonomous_actions_total']}")
        
        metrics_lines.append("# HELP autonomous_actions_success Number of successful autonomous actions")
        metrics_lines.append("# TYPE autonomous_actions_success counter")
        metrics_lines.append(f"autonomous_actions_success {self._metrics['autonomous_actions_success']}")
        
        metrics_lines.append("# HELP autonomous_actions_failed Number of failed autonomous actions")
        metrics_lines.append("# TYPE autonomous_actions_failed counter")
        metrics_lines.append(f"autonomous_actions_failed {self._metrics['autonomous_actions_failed']}")
        
        for tier, tier_data in self._tier_metrics.items():
            metrics_lines.append(f"# HELP autonomous_tier{tier}_total Total Tier {tier} actions")
            metrics_lines.append(f"# TYPE autonomous_tier{tier}_total counter")
            metrics_lines.append(f"autonomous_tier{tier}_total {tier_data['total']}")
        
        success_rate = 0.0
        if self._metrics['autonomous_actions_total'] > 0:
            success_rate = (
                self._metrics['autonomous_actions_success'] /
                self._metrics['autonomous_actions_total']
            )
        
        metrics_lines.append("# HELP autonomous_success_rate Success rate of autonomous actions")
        metrics_lines.append("# TYPE autonomous_success_rate gauge")
        metrics_lines.append(f"autonomous_success_rate {success_rate:.4f}")
        
        return "\n".join(metrics_lines)


# Global metrics instance
autonomous_metrics = AutonomousMetrics()
