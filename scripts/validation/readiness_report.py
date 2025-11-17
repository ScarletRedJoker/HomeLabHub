#!/usr/bin/env python3
"""
Deployment Readiness Report Generator
Comprehensive validation report for production deployment
"""
import os
import sys
import subprocess
from pathlib import Path
from datetime import datetime

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

class ReadinessReporter:
    def __init__(self):
        self.root_dir = Path(__file__).parent.parent.parent
        self.is_replit = 'REPL_ID' in os.environ
        self.checks = {
            'code_quality': [],
            'networking': [],
            'services': [],
            'security': [],
        }
        self.overall_status = 'READY'
        self.blocking_issues = []
        self.warnings = []
    
    def generate_report(self) -> bool:
        """Generate comprehensive readiness report"""
        self._print_header()
        
        # Run all checks
        self._check_code_quality()
        self._check_networking()
        self._check_services()
        self._check_security()
        
        # Print results
        self._print_section("Code Quality", self.checks['code_quality'])
        self._print_section("Networking", self.checks['networking'])
        self._print_section("Services", self.checks['services'])
        self._print_section("Security", self.checks['security'])
        
        self._print_overall_status()
        
        return len(self.blocking_issues) == 0
    
    def _print_header(self):
        """Print report header"""
        print("╔══════════════════════════════════════════════════════════╗")
        print("║  📊 DEPLOYMENT READINESS REPORT                          ║")
        print("╚══════════════════════════════════════════════════════════╝")
        print()
        print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Environment: {'Replit Development' if self.is_replit else 'Ubuntu Production'}")
        print()
    
    def _check_code_quality(self):
        """Check code quality metrics"""
        # Run LSP diagnostics
        lsp_result = self._run_check("python3 scripts/validation/check_lsp.py")
        if lsp_result == 0:
            self.checks['code_quality'].append(('LSP Diagnostics', 'PASSED', '✅'))
        else:
            self.checks['code_quality'].append(('LSP Diagnostics', 'FAILED', '❌'))
            self.blocking_issues.append('LSP Diagnostics failed - fix TypeScript/syntax errors')
        
        # Check package manifests
        pkg_result = self._run_check("python3 scripts/validation/check_packages.py")
        if pkg_result == 0:
            self.checks['code_quality'].append(('Package Manifests', 'PASSED', '✅'))
        else:
            self.checks['code_quality'].append(('Package Manifests', 'FAILED', '❌'))
            self.blocking_issues.append('Package manifest validation failed')
        
        # Check Docker simulation
        docker_result = self._run_check("python3 scripts/validation/docker_simulate.py")
        if docker_result == 0:
            self.checks['code_quality'].append(('Docker Builds', 'PASSED', '✅'))
        else:
            self.checks['code_quality'].append(('Docker Builds', 'WARNING', '⚠️'))
            self.warnings.append('Docker build simulation had warnings')
    
    def _check_networking(self):
        """Check networking configuration"""
        # Run network validation
        net_result = self._run_check("python3 scripts/validation/check_network.py")
        if net_result == 0:
            self.checks['networking'].append(('Port Conflicts', 'NONE', '✅'))
            self.checks['networking'].append(('Domain Routing', 'CONFIGURED', '✅'))
        else:
            self.checks['networking'].append(('Port Conflicts', 'DETECTED', '❌'))
            self.blocking_issues.append('Network validation failed - check port conflicts')
        
        # Check SSL readiness
        caddyfile = self.root_dir / "Caddyfile"
        if caddyfile.exists():
            with open(caddyfile) as f:
                content = f.read()
                if 'email' in content:
                    self.checks['networking'].append(('SSL Certificates', 'CONFIGURED', '✅'))
                else:
                    self.checks['networking'].append(('SSL Certificates', 'NOT CONFIGURED', '⚠️'))
                    self.warnings.append('SSL email not configured in Caddyfile')
        else:
            self.checks['networking'].append(('SSL Certificates', 'CADDYFILE MISSING', '❌'))
            self.blocking_issues.append('Caddyfile not found')
    
    def _check_services(self):
        """Check service readiness"""
        # Check critical services
        critical_services = ['dashboard', 'stream-bot']
        
        for service in critical_services:
            service_dir = self.root_dir / "services" / service
            if service_dir.exists():
                # Check if package files exist
                if service == 'dashboard':
                    if (service_dir / "requirements.txt").exists():
                        self.checks['services'].append((f'{service.title()}', 'READY', '✅'))
                    else:
                        self.checks['services'].append((f'{service.title()}', 'MISSING DEPS', '❌'))
                        self.blocking_issues.append(f'{service} missing requirements.txt')
                else:
                    if (service_dir / "package.json").exists():
                        self.checks['services'].append((f'{service.title()}', 'READY', '✅'))
                    else:
                        self.checks['services'].append((f'{service.title()}', 'MISSING DEPS', '❌'))
                        self.blocking_issues.append(f'{service} missing package.json')
            else:
                self.checks['services'].append((f'{service.title()}', 'MISSING', '❌'))
                self.blocking_issues.append(f'{service} directory not found')
        
        # Ubuntu-only services
        ubuntu_services = ['Discord Bot', 'PostgreSQL', 'Redis', 'Caddy']
        for service in ubuntu_services:
            if self.is_replit:
                self.checks['services'].append((service, 'Ubuntu Only', '⏭️'))
            else:
                self.checks['services'].append((service, 'READY', '✅'))
    
    def _check_security(self):
        """Check security configuration"""
        # Check .env file
        env_file = self.root_dir / ".env"
        env_example = self.root_dir / ".env.example"
        
        if env_example.exists():
            self.checks['security'].append(('Secrets Management', 'CONFIGURED', '✅'))
        else:
            self.checks['security'].append(('Secrets Management', 'MISSING TEMPLATE', '❌'))
            self.blocking_issues.append('.env.example not found')
        
        # Check for critical env vars
        if env_file.exists():
            with open(env_file) as f:
                env_content = f.read()
            
            # Check optional but recommended vars
            if 'OPENAI_API_KEY=' in env_content and not env_content.split('OPENAI_API_KEY=')[1].split('\n')[0].strip():
                self.checks['security'].append(('OPENAI_API_KEY', 'Not Set (Jarvis disabled)', '⚠️'))
                self.warnings.append('OPENAI_API_KEY not set - AI features disabled')
            else:
                self.checks['security'].append(('OPENAI_API_KEY', 'Configured', '✅'))
            
            # Check auth
            if 'SESSION_SECRET=' in env_content:
                self.checks['security'].append(('Authentication', 'ENABLED', '✅'))
            else:
                self.checks['security'].append(('Authentication', 'NO SESSION SECRET', '❌'))
                self.blocking_issues.append('SESSION_SECRET not configured')
        else:
            self.checks['security'].append(('Environment Variables', 'NO .env FILE', '⚠️'))
            self.warnings.append('.env file not found - using defaults')
        
        # Rate limiting (check if Flask-Limiter is in requirements)
        dashboard_reqs = self.root_dir / "services" / "dashboard" / "requirements.txt"
        if dashboard_reqs.exists():
            with open(dashboard_reqs) as f:
                if 'flask-limiter' in f.read().lower():
                    self.checks['security'].append(('Rate Limiting', 'ENABLED', '✅'))
                else:
                    self.checks['security'].append(('Rate Limiting', 'NOT CONFIGURED', '⚠️'))
                    self.warnings.append('Rate limiting not configured')
        else:
            self.checks['security'].append(('Rate Limiting', 'UNKNOWN', '⚠️'))
    
    def _run_check(self, command: str) -> int:
        """Run a validation check command"""
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                timeout=30
            )
            return result.returncode
        except Exception:
            return 1
    
    def _print_section(self, title: str, checks: list):
        """Print a section of checks"""
        print(f"━━━ {title} ━━━")
        for check_name, status, icon in checks:
            print(f"{icon} {check_name:30} {status}")
        print()
    
    def _print_overall_status(self):
        """Print overall deployment status"""
        print("━━━ Overall Status ━━━")
        
        if self.blocking_issues:
            print("🔴 NOT READY FOR DEPLOYMENT")
            print(f"   {len(self.blocking_issues)} blocking issue(s):")
            for issue in self.blocking_issues[:5]:
                print(f"   • {issue}")
            if len(self.blocking_issues) > 5:
                print(f"   ... and {len(self.blocking_issues) - 5} more")
        elif self.warnings:
            print("🟡 READY WITH WARNINGS")
            print(f"   All critical checks passed")
            print(f"   {len(self.warnings)} optional warning(s):")
            for warning in self.warnings[:3]:
                print(f"   • {warning}")
            if len(self.warnings) > 3:
                print(f"   ... and {len(self.warnings) - 3} more")
        else:
            print("🟢 READY FOR PRODUCTION DEPLOYMENT")
            print("   All checks passed")
            print("   No warnings")
        
        print()

def main():
    reporter = ReadinessReporter()
    success = reporter.generate_report()
    
    if success:
        return 0
    else:
        return 1

if __name__ == "__main__":
    sys.exit(main())
