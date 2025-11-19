"""Autonomous Security Service - Continuous Security Monitoring & Scanning"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import subprocess
import json
import re

from services.docker_service import DockerService
from services.db_service import db_service
from services.agent_orchestrator import AgentOrchestrator
from models.agent import AgentType

logger = logging.getLogger(__name__)


class AutonomousSecurity:
    """
    Performs continuous security monitoring and vulnerability scanning.
    Uses the Security Agent (Sentinel) for advanced threat detection.
    """
    
    def __init__(self):
        self.docker_service = DockerService()
        self.orchestrator = AgentOrchestrator()
        self.last_scan_time: Optional[datetime] = None
        self.vulnerability_history: List[Dict[str, Any]] = []
    
    def run_security_scan(self) -> Dict[str, Any]:
        """Run complete security scan"""
        logger.info("Starting autonomous security scan...")
        
        results = {
            'timestamp': datetime.utcnow().isoformat(),
            'vulnerable_images': self._scan_container_vulnerabilities(),
            'security_updates': self._check_security_updates(),
            'ssl_certificates': self._check_ssl_certificates(),
            'authentication_monitoring': self._monitor_authentication(),
            'open_ports': self._scan_open_ports(),
            'security_issues': [],
            'tasks_created': []
        }
        
        # Analyze results and create security tasks
        self._analyze_security_results(results)
        
        # Store in history
        self.vulnerability_history.append({
            'timestamp': datetime.utcnow(),
            'results': results
        })
        
        # Keep only last 50 scans
        if len(self.vulnerability_history) > 50:
            self.vulnerability_history = self.vulnerability_history[-50:]
        
        self.last_scan_time = datetime.utcnow()
        logger.info(f"Security scan complete. Issues detected: {len(results['security_issues'])}")
        
        return results
    
    def _scan_container_vulnerabilities(self) -> Dict[str, Any]:
        """Scan containers for known vulnerabilities"""
        vuln_analysis = {
            'scanned': [],
            'vulnerable': [],
            'safe': [],
            'scan_failed': []
        }
        
        try:
            containers = self.docker_service.list_all_containers()
            
            for container in containers:
                name = container.get('name', 'unknown')
                image = container.get('image', '')
                
                if not image:
                    continue
                
                vuln_analysis['scanned'].append(name)
                
                # Try to scan with trivy if available
                try:
                    result = subprocess.run(
                        ['trivy', 'image', '--severity', 'HIGH,CRITICAL', '--format', 'json', image],
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
                    
                    if result.returncode == 0:
                        scan_data = json.loads(result.stdout)
                        vulnerabilities = []
                        
                        # Parse trivy output
                        if 'Results' in scan_data:
                            for target in scan_data['Results']:
                                if 'Vulnerabilities' in target:
                                    for vuln in target['Vulnerabilities']:
                                        vulnerabilities.append({
                                            'id': vuln.get('VulnerabilityID', ''),
                                            'severity': vuln.get('Severity', ''),
                                            'package': vuln.get('PkgName', ''),
                                            'fixed_version': vuln.get('FixedVersion', '')
                                        })
                        
                        if vulnerabilities:
                            vuln_analysis['vulnerable'].append({
                                'name': name,
                                'image': image,
                                'vulnerabilities': vulnerabilities,
                                'count': len(vulnerabilities)
                            })
                        else:
                            vuln_analysis['safe'].append({
                                'name': name,
                                'image': image
                            })
                    else:
                        # Trivy scan failed, use basic checks
                        vuln_analysis['scan_failed'].append({
                            'name': name,
                            'image': image,
                            'reason': 'Trivy scan failed'
                        })
                
                except FileNotFoundError:
                    # Trivy not installed, use image age as heuristic
                    try:
                        inspect_result = subprocess.run(
                            ['docker', 'inspect', '--format={{.Created}}', image],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        
                        if inspect_result.returncode == 0:
                            created_str = inspect_result.stdout.strip()
                            created_date = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                            age_days = (datetime.now(created_date.tzinfo) - created_date).days
                            
                            if age_days > 180:  # Image older than 6 months
                                vuln_analysis['vulnerable'].append({
                                    'name': name,
                                    'image': image,
                                    'reason': f'Image is {age_days} days old (potential security risk)',
                                    'recommendation': 'Update to latest image'
                                })
                            else:
                                vuln_analysis['safe'].append({
                                    'name': name,
                                    'image': image
                                })
                    except Exception:
                        vuln_analysis['scan_failed'].append({
                            'name': name,
                            'image': image,
                            'reason': 'Unable to determine image age'
                        })
                
                except subprocess.TimeoutExpired:
                    vuln_analysis['scan_failed'].append({
                        'name': name,
                        'image': image,
                        'reason': 'Scan timeout'
                    })
        
        except Exception as e:
            logger.error(f"Error scanning vulnerabilities: {e}", exc_info=True)
            vuln_analysis['error'] = str(e)
        
        return vuln_analysis
    
    def _check_security_updates(self) -> Dict[str, Any]:
        """Check for security updates in base images"""
        update_analysis = {
            'updates_needed': [],
            'up_to_date': []
        }
        
        try:
            # Get list of images
            result = subprocess.run(
                ['docker', 'images', '--format', '{{.Repository}}:{{.Tag}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                images = result.stdout.strip().split('\n')
                
                for image in images:
                    if not image or image == '<none>:<none>':
                        continue
                    
                    # Check if there's a newer version (simplified)
                    # In production, you'd query a registry API
                    if ':latest' not in image.lower():
                        update_analysis['updates_needed'].append({
                            'image': image,
                            'recommendation': 'Check for security updates'
                        })
                    else:
                        update_analysis['up_to_date'].append(image)
        
        except Exception as e:
            logger.error(f"Error checking security updates: {e}", exc_info=True)
            update_analysis['error'] = str(e)
        
        return update_analysis
    
    def _check_ssl_certificates(self) -> Dict[str, Any]:
        """Check SSL certificate expiration"""
        ssl_analysis = {
            'certificates': [],
            'expiring_soon': [],
            'expired': []
        }
        
        try:
            # Try to check certificates from database if SSL management is implemented
            if db_service.is_available:
                with db_service.get_session() as session:
                    try:
                        # Check if ssl_certificates table exists
                        result = session.execute("""
                            SELECT domain, expires_at, auto_renew
                            FROM ssl_certificates
                            WHERE expires_at IS NOT NULL
                        """).fetchall()
                        
                        now = datetime.utcnow()
                        warning_threshold = now + timedelta(days=30)
                        
                        for domain, expires_at, auto_renew in result:
                            cert_info = {
                                'domain': domain,
                                'expires_at': expires_at.isoformat() if expires_at else None,
                                'auto_renew': auto_renew
                            }
                            
                            ssl_analysis['certificates'].append(cert_info)
                            
                            if expires_at < now:
                                ssl_analysis['expired'].append(cert_info)
                            elif expires_at < warning_threshold:
                                ssl_analysis['expiring_soon'].append(cert_info)
                    
                    except Exception:
                        # SSL certificates table doesn't exist or query failed
                        pass
        
        except Exception as e:
            logger.error(f"Error checking SSL certificates: {e}", exc_info=True)
            ssl_analysis['error'] = str(e)
        
        return ssl_analysis
    
    def _monitor_authentication(self) -> Dict[str, Any]:
        """Monitor for failed authentication attempts"""
        auth_analysis = {
            'failed_logins': [],
            'suspicious_activity': [],
            'total_attempts': 0
        }
        
        if not db_service.is_available:
            auth_analysis['error'] = 'Database not available'
            return auth_analysis
        
        try:
            # Look for failed login patterns in logs or database
            # This is a simplified example - in production you'd have proper audit logging
            with db_service.get_session() as session:
                try:
                    # Check if there's an audit log table
                    failed_logins = session.execute("""
                        SELECT username, ip_address, timestamp, COUNT(*) as attempts
                        FROM audit_log
                        WHERE action = 'failed_login'
                        AND timestamp > NOW() - INTERVAL '1 hour'
                        GROUP BY username, ip_address, timestamp
                        HAVING COUNT(*) > 3
                        ORDER BY attempts DESC
                        LIMIT 10
                    """).fetchall()
                    
                    for username, ip, timestamp, attempts in failed_logins:
                        auth_analysis['failed_logins'].append({
                            'username': username,
                            'ip_address': ip,
                            'timestamp': timestamp.isoformat() if timestamp else None,
                            'attempts': attempts
                        })
                        
                        if attempts > 10:
                            auth_analysis['suspicious_activity'].append({
                                'type': 'brute_force_attempt',
                                'username': username,
                                'ip_address': ip,
                                'attempts': attempts
                            })
                
                except Exception:
                    # Audit log table doesn't exist
                    pass
        
        except Exception as e:
            logger.error(f"Error monitoring authentication: {e}", exc_info=True)
            auth_analysis['error'] = str(e)
        
        return auth_analysis
    
    def _scan_open_ports(self) -> Dict[str, Any]:
        """Scan for open ports on containers"""
        port_analysis = {
            'containers': [],
            'exposed_ports': [],
            'internal_only': []
        }
        
        try:
            containers = self.docker_service.list_all_containers()
            
            for container in containers:
                if container.get('status', '').lower() != 'running':
                    continue
                
                name = container.get('name', 'unknown')
                details = self.docker_service.get_container_status(name)
                
                if not details:
                    continue
                
                ports = details.get('ports', {})
                
                container_ports = {
                    'name': name,
                    'ports': ports
                }
                
                port_analysis['containers'].append(container_ports)
                
                # Check if ports are exposed to host
                if ports:
                    for port_mapping in ports.values():
                        if port_mapping and '0.0.0.0' in str(port_mapping):
                            port_analysis['exposed_ports'].append({
                                'container': name,
                                'ports': port_mapping,
                                'warning': 'Port exposed to all interfaces (0.0.0.0)'
                            })
                        else:
                            port_analysis['internal_only'].append({
                                'container': name,
                                'ports': port_mapping
                            })
        
        except Exception as e:
            logger.error(f"Error scanning ports: {e}", exc_info=True)
            port_analysis['error'] = str(e)
        
        return port_analysis
    
    def _analyze_security_results(self, results: Dict[str, Any]):
        """Analyze security scan results and create remediation tasks"""
        
        # Handle vulnerable containers
        vulnerable = results['vulnerable_images'].get('vulnerable', [])
        for container in vulnerable:
            severity = 'critical' if container.get('count', 0) > 10 else 'high'
            
            issue = {
                'type': 'vulnerability',
                'severity': severity,
                'container': container['name'],
                'details': container
            }
            results['security_issues'].append(issue)
            
            # Create task using Security Agent
            self._create_security_task(
                f"Security vulnerabilities in {container['name']}: {container.get('count', 0)} issues",
                'vulnerability',
                issue,
                requires_approval=True
            )
        
        # Handle expiring SSL certificates
        expiring = results['ssl_certificates'].get('expiring_soon', [])
        for cert in expiring:
            issue = {
                'type': 'ssl_expiring',
                'severity': 'warning',
                'domain': cert['domain'],
                'details': cert
            }
            results['security_issues'].append(issue)
            
            if not cert.get('auto_renew'):
                # Only create task if auto-renew is disabled
                self._create_security_task(
                    f"SSL certificate expiring for {cert['domain']}",
                    'ssl_certificate',
                    issue,
                    requires_approval=False
                )
        
        # Handle expired SSL certificates
        expired = results['ssl_certificates'].get('expired', [])
        for cert in expired:
            issue = {
                'type': 'ssl_expired',
                'severity': 'critical',
                'domain': cert['domain'],
                'details': cert
            }
            results['security_issues'].append(issue)
            
            self._create_security_task(
                f"SSL certificate EXPIRED for {cert['domain']}",
                'ssl_certificate',
                issue,
                requires_approval=True
            )
        
        # Handle suspicious authentication activity
        suspicious = results['authentication_monitoring'].get('suspicious_activity', [])
        for activity in suspicious:
            issue = {
                'type': 'suspicious_auth',
                'severity': 'high',
                'details': activity
            }
            results['security_issues'].append(issue)
            
            self._create_security_task(
                f"Suspicious authentication activity: {activity['type']} from {activity['ip_address']}",
                'authentication',
                issue,
                requires_approval=False
            )
        
        # Handle exposed ports (informational)
        exposed = results['open_ports'].get('exposed_ports', [])
        if len(exposed) > 5:  # Only report if many ports exposed
            issue = {
                'type': 'exposed_ports',
                'severity': 'info',
                'count': len(exposed),
                'details': exposed
            }
            results['security_issues'].append(issue)
    
    def _create_security_task(self, description: str, task_type: str,
                             context: Dict, requires_approval: bool = True):
        """Create a security task for the Security Agent"""
        try:
            # Assign higher priority based on severity
            priority = 9 if context.get('severity') == 'critical' else 7
            
            task = self.orchestrator.create_task(
                description=description,
                task_type='security',
                priority=priority,
                context={
                    'security_type': task_type,
                    'details': context,
                    'detected_at': datetime.utcnow().isoformat(),
                    'requires_approval': requires_approval,
                    'preferred_agent': AgentType.SECURITY.value
                }
            )
            
            if task:
                logger.info(f"Created security task {task.id}: {description}")
                return task.id
            else:
                logger.error(f"Failed to create security task: {description}")
                return None
        except Exception as e:
            logger.error(f"Error creating security task: {e}", exc_info=True)
            return None
    
    def get_security_summary(self) -> Dict[str, Any]:
        """Get security posture summary"""
        if not self.vulnerability_history:
            return {
                'error': 'No security scan data available',
                'vulnerabilities_found': 0,
                'certificates_expiring': 0,
                'failed_logins': 0,
                'open_ports': 0,
                'security_score': 0
            }
        
        try:
            latest = self.vulnerability_history[-1]['results']
            
            # Count vulnerabilities
            total_vulnerabilities = sum(
                c.get('count', 0)
                for c in latest['vulnerable_images'].get('vulnerable', [])
            )
            vulnerable_containers = len(latest['vulnerable_images'].get('vulnerable', []))
            
            # Count SSL certificate issues
            certificates_expiring = len(latest['ssl_certificates'].get('expiring_soon', []))
            certificates_expired = len(latest['ssl_certificates'].get('expired', []))
            
            # Count failed logins
            failed_logins = len(latest['authentication_monitoring'].get('failed_logins', []))
            suspicious_auth = len(latest['authentication_monitoring'].get('suspicious_activity', []))
            
            # Count open ports
            open_ports = len(latest['open_ports'].get('exposed_ports', []))
            
            # Calculate security score (0-100, higher is better)
            security_score = 100
            
            # Deduct points for vulnerabilities (max -40 points)
            if total_vulnerabilities > 0:
                security_score -= min(40, total_vulnerabilities * 2)
            
            # Deduct points for SSL issues (max -20 points)
            ssl_issues = certificates_expiring + (certificates_expired * 2)
            security_score -= min(20, ssl_issues * 5)
            
            # Deduct points for suspicious auth (max -20 points)
            security_score -= min(20, suspicious_auth * 10)
            
            # Deduct points for exposed ports (max -10 points)
            security_score -= min(10, open_ports * 2)
            
            # Deduct points for failed logins (max -10 points)
            security_score -= min(10, failed_logins)
            
            security_score = max(0, security_score)  # Ensure not negative
            
            return {
                'last_scan': self.last_scan_time.isoformat() if self.last_scan_time else None,
                'vulnerabilities_found': total_vulnerabilities,
                'vulnerable_containers': vulnerable_containers,
                'certificates_expiring': certificates_expiring,
                'certificates_expired': certificates_expired,
                'failed_logins': failed_logins,
                'suspicious_authentication': suspicious_auth,
                'open_ports': open_ports,
                'security_score': security_score,
                'security_level': (
                    'critical' if security_score < 40 else
                    'warning' if security_score < 70 else
                    'good' if security_score < 90 else
                    'excellent'
                ),
                'total_security_issues': len(latest.get('security_issues', []))
            }
        except Exception as e:
            logger.error(f"Error getting security summary: {e}", exc_info=True)
            return {
                'error': str(e),
                'vulnerabilities_found': 0,
                'certificates_expiring': 0,
                'failed_logins': 0,
                'open_ports': 0,
                'security_score': 0
            }
