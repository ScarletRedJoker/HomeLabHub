#!/usr/bin/env python3
"""
Service Health Checker
Validates service health across Replit and Ubuntu environments
"""
import os
import sys
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

class ServiceHealthChecker:
    def __init__(self):
        self.root_dir = Path(__file__).parent.parent.parent
        self.is_replit = 'REPL_ID' in os.environ
        self.services_status = {}
        self.warnings = []
        self.errors = []
        
        # Service definitions: (name, port, health_check_type)
        self.services = {
            'dashboard': {
                'port': 5000,
                'type': 'flask',
                'workflow': 'dashboard',
                'health_endpoint': '/health',
            },
            'stream-bot': {
                'port': 3000,
                'type': 'node',
                'workflow': 'stream-bot',
                'health_endpoint': '/api/health',
            },
            'discord-bot': {
                'port': 5000,
                'type': 'node',
                'ubuntu_only': True,
            },
            'postgresql': {
                'port': 5432,
                'type': 'database',
                'ubuntu_only': True,
            },
            'redis': {
                'port': 6379,
                'type': 'cache',
                'ubuntu_only': True,
            },
            'minio': {
                'port': 9000,
                'type': 'storage',
                'ubuntu_only': True,
            },
            'caddy': {
                'port': 80,
                'type': 'proxy',
                'ubuntu_only': True,
            },
            'plex': {
                'port': 32400,
                'type': 'media',
                'ubuntu_only': True,
            },
            'n8n': {
                'port': 5678,
                'type': 'automation',
                'ubuntu_only': True,
            },
            'vnc-desktop': {
                'port': 6080,
                'type': 'vnc',
                'ubuntu_only': True,
            },
            'homeassistant': {
                'port': 8123,
                'type': 'smart-home',
                'ubuntu_only': True,
            },
        }
    
    def check_all(self) -> bool:
        """Run all service health checks"""
        print("━━━ Service Health Matrix ━━━\n")
        
        if self.is_replit:
            print("📍 Environment: Replit Development\n")
            self._check_replit_services()
        else:
            print("📍 Environment: Ubuntu Production\n")
            self._check_ubuntu_services()
        
        self._print_summary()
        return len(self.errors) == 0
    
    def _check_replit_services(self):
        """Check services in Replit environment"""
        # Check workflows
        for service_name, service_info in self.services.items():
            if service_info.get('ubuntu_only'):
                status = '⏭️  Ubuntu Only'
                self.services_status[service_name] = 'ubuntu-only'
            elif 'workflow' in service_info:
                workflow_name = service_info['workflow']
                if self._is_workflow_running(workflow_name):
                    status = '✅ Running'
                    self.services_status[service_name] = 'running'
                else:
                    status = '❌ Not Running'
                    self.services_status[service_name] = 'stopped'
                    self.errors.append(f"{service_name} workflow not running")
            else:
                status = '⏭️  Ubuntu Only'
                self.services_status[service_name] = 'ubuntu-only'
            
            print(f"  {status:20} {service_name:20} (Port {service_info['port']})")
        
        # Check log files
        print("\n📋 Log File Status:")
        log_dir = Path("/tmp/logs")
        if log_dir.exists():
            log_files = list(log_dir.glob("*.log"))
            print(f"  ✅ {len(log_files)} log file(s) found in /tmp/logs")
            
            # Check for recent errors in logs
            recent_errors = self._check_logs_for_errors(log_files)
            if recent_errors:
                print(f"  ⚠️  Found {recent_errors} recent error(s) in logs")
                self.warnings.append(f"{recent_errors} error(s) in recent logs")
        else:
            print("  ℹ️  No log directory found")
        
        # Check database connectivity
        print("\n🗄️  Database Status:")
        if 'DATABASE_URL' in os.environ:
            if self._test_database_connection():
                print("  ✅ Database connection test passed")
            else:
                print("  ⚠️  Database connection test failed")
                self.warnings.append("Database connection test failed")
        else:
            print("  ⚠️  DATABASE_URL not configured")
            self.warnings.append("DATABASE_URL not set")
    
    def _check_ubuntu_services(self):
        """Check services in Ubuntu environment"""
        print("ℹ️  Ubuntu-specific checks require Docker environment")
        print("   Run these commands on Ubuntu to check service status:\n")
        
        print("   # Check all containers:")
        print("   docker-compose -f docker-compose.unified.yml ps\n")
        
        print("   # Check specific service:")
        print("   docker logs <container-name>\n")
        
        print("   # Check resource usage:")
        print("   docker stats --no-stream\n")
        
        # We can still check some things
        for service_name, service_info in self.services.items():
            status = '📋 See Ubuntu'
            self.services_status[service_name] = 'ubuntu-check-required'
            print(f"  {status:20} {service_name:20} (Port {service_info['port']})")
    
    def _is_workflow_running(self, workflow_name: str) -> bool:
        """Check if a Replit workflow is running"""
        try:
            # Check if workflow log file exists and is recent
            log_dir = Path("/tmp/logs")
            if not log_dir.exists():
                return False
            
            # Look for recent log file
            log_files = list(log_dir.glob(f"{workflow_name}*.log"))
            if not log_files:
                return False
            
            # Check if file was modified recently (within last 5 minutes)
            import time
            most_recent = max(log_files, key=lambda p: p.stat().st_mtime)
            age_seconds = time.time() - most_recent.stat().st_mtime
            
            return age_seconds < 300  # 5 minutes
        except Exception:
            return False
    
    def _check_logs_for_errors(self, log_files: List[Path]) -> int:
        """Check log files for recent errors"""
        error_count = 0
        error_patterns = ['ERROR', 'CRITICAL', 'Exception', 'Traceback']
        
        for log_file in log_files:
            try:
                # Read last 100 lines
                with open(log_file, 'r') as f:
                    lines = f.readlines()
                    recent_lines = lines[-100:] if len(lines) > 100 else lines
                    
                    for line in recent_lines:
                        if any(pattern in line for pattern in error_patterns):
                            error_count += 1
            except Exception:
                continue
        
        return error_count
    
    def _test_database_connection(self) -> bool:
        """Test database connectivity"""
        try:
            import psycopg2
            from urllib.parse import urlparse
            
            db_url = os.environ.get('DATABASE_URL', '')
            if not db_url:
                return False
            
            # Quick connection test
            result = urlparse(db_url)
            conn = psycopg2.connect(
                database=result.path[1:],
                user=result.username,
                password=result.password,
                host=result.hostname,
                port=result.port,
                connect_timeout=5
            )
            conn.close()
            return True
        except Exception as e:
            return False
    
    def _print_summary(self):
        """Print health check summary"""
        print("\n━━━ Summary ━━━")
        
        running = sum(1 for status in self.services_status.values() if status == 'running')
        ubuntu_only = sum(1 for status in self.services_status.values() if status == 'ubuntu-only')
        stopped = sum(1 for status in self.services_status.values() if status == 'stopped')
        
        print(f"✅ {running} service(s) running")
        if ubuntu_only > 0:
            print(f"⏭️  {ubuntu_only} service(s) Ubuntu-only")
        if stopped > 0:
            print(f"❌ {stopped} service(s) stopped")
        
        if self.errors:
            print(f"\n❌ {len(self.errors)} Error(s):")
            for error in self.errors[:5]:
                print(f"   • {error}")
        
        if self.warnings:
            print(f"\n⚠️  {len(self.warnings)} Warning(s):")
            for warning in self.warnings[:5]:
                print(f"   • {warning}")
        
        if not self.errors and not self.warnings:
            print("✅ All checks passed")
        
        print()

def main():
    checker = ServiceHealthChecker()
    success = checker.check_all()
    
    if success:
        print("✅ Service health checks PASSED")
        return 0
    else:
        print("⚠️  Service health checks completed with warnings/errors")
        return 1

if __name__ == "__main__":
    sys.exit(main())
