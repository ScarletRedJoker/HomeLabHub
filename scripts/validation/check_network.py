#!/usr/bin/env python3
"""
Network & Port Validation System
Validates networking, ports, routing, and environment variables
"""
import os
import sys
import yaml
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple, Union

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

class NetworkValidator:
    def __init__(self):
        self.root_dir = Path(__file__).parent.parent.parent
        self.compose_file = self.root_dir / "docker-compose.unified.yml"
        self.caddyfile = self.root_dir / "Caddyfile"
        self.env_example = self.root_dir / ".env.example"
        self.errors = []
        self.warnings = []
        
    def validate_all(self) -> bool:
        """Run all network validation checks"""
        print("━━━ Network & Port Validation ━━━\n")
        
        success = True
        success &= self.check_port_conflicts()
        success &= self.check_service_networks()
        success &= self.check_domain_routing()
        success &= self.check_environment_variables()
        
        self._print_summary()
        return success
    
    def check_port_conflicts(self) -> bool:
        """Check for port conflicts in docker-compose"""
        print("🔍 Checking port conflicts...")
        
        if not self.compose_file.exists():
            self.errors.append(f"docker-compose.unified.yml not found")
            return False
        
        with open(self.compose_file) as f:
            compose = yaml.safe_load(f)
        
        # Extract port mappings (using sets to avoid duplicates)
        port_mappings: Dict[int, Set[str]] = {}
        services = compose.get('services', {})
        
        for service_name, service_config in services.items():
            ports = service_config.get('ports', [])
            for port_mapping in ports:
                # Handle "80:80" or "80:80/tcp" format
                if isinstance(port_mapping, str):
                    host_port = port_mapping.split(':')[0]
                    # Remove /tcp or /udp suffix
                    host_port = host_port.split('/')[0]
                    try:
                        host_port_num = int(host_port)
                        if host_port_num not in port_mappings:
                            port_mappings[host_port_num] = set()
                        port_mappings[host_port_num].add(service_name)
                    except ValueError:
                        continue
        
        # Check for conflicts
        conflicts = {port: services for port, services in port_mappings.items() if len(services) > 1}
        
        if conflicts:
            for port, services in conflicts.items():
                self.errors.append(f"Port {port} conflict: {', '.join(services)}")
            print(f"  ❌ Found {len(conflicts)} port conflict(s)")
            return False
        else:
            print(f"  ✅ No port conflicts detected ({len(port_mappings)} unique ports)")
        
        # Check required ports
        required_ports = {
            80: ['caddy'],
            443: ['caddy'],
            5432: ['discord-bot-db'],
            6379: ['redis'],
            9000: ['minio'],
        }
        
        missing_ports = []
        for port, expected_services in required_ports.items():
            if port not in port_mappings:
                missing_ports.append(port)
            else:
                actual_services = port_mappings[port]
                if not any(svc in actual_services for svc in expected_services):
                    self.warnings.append(f"Port {port} assigned to {actual_services}, expected one of {expected_services}")
        
        if missing_ports:
            self.warnings.append(f"Missing expected ports: {missing_ports}")
        
        print(f"  ✅ Verified {len(required_ports)} required ports\n")
        return True
    
    def check_service_networks(self) -> bool:
        """Check service network configurations"""
        print("🌐 Checking service networks...")
        
        with open(self.compose_file) as f:
            compose = yaml.safe_load(f)
        
        services = compose.get('services', {})
        networks = compose.get('networks', {})
        
        # Check all services are on at least one network
        services_without_network = []
        for service_name, service_config in services.items():
            service_networks = service_config.get('networks', [])
            if not service_networks:
                services_without_network.append(service_name)
        
        if services_without_network:
            self.warnings.append(f"Services without explicit network: {', '.join(services_without_network)}")
        
        # Most services should be on 'homelab' network
        homelab_services = [
            name for name, config in services.items()
            if 'homelab' in config.get('networks', [])
        ]
        
        print(f"  ✅ {len(homelab_services)}/{len(services)} services on 'homelab' network")
        print(f"  ✅ {len(networks)} network(s) defined\n")
        return True
    
    def check_domain_routing(self) -> bool:
        """Validate Caddy reverse proxy routing"""
        print("🔗 Checking domain routing...")
        
        if not self.caddyfile.exists():
            self.errors.append("Caddyfile not found")
            return False
        
        with open(self.caddyfile) as f:
            caddy_content = f.read()
        
        # Expected domain → service:port mappings
        expected_routes = {
            'bot.rig-city.com': ('discord-bot', 5000),
            'stream.rig-city.com': ('stream-bot', 5000),
            'rig-city.com': ('rig-city-site', 80),
            'plex.evindrake.net': ('plex-server', 32400),
            'n8n.evindrake.net': ('n8n', 5678),
            'host.evindrake.net': ('homelab-dashboard', 5000),
            'vnc.evindrake.net': ('vnc-desktop', 80),
            'code.evindrake.net': ('code-server', 8080),
            'game.evindrake.net': ('homelab-dashboard', 5000),
            'scarletredjoker.com': ('scarletredjoker-web', 80),
            'home.evindrake.net': ('homeassistant', 8123),
        }
        
        # Parse Caddyfile for routes
        # Format: domain.com {\n  reverse_proxy service:port
        domain_pattern = re.compile(r'^([a-z0-9.-]+)\s*{', re.MULTILINE)
        proxy_pattern = re.compile(r'reverse_proxy\s+([a-z0-9-]+):(\d+)')
        
        domains = domain_pattern.findall(caddy_content)
        routes_found = 0
        routes_correct = 0
        
        for domain in domains:
            if domain.startswith('www.'):
                continue  # Skip www redirects
            
            # Find reverse_proxy for this domain
            domain_section_start = caddy_content.find(f"{domain} {{")
            if domain_section_start == -1:
                continue
            
            # Find the closing brace
            brace_count = 0
            domain_section_end = domain_section_start
            for i, char in enumerate(caddy_content[domain_section_start:], start=domain_section_start):
                if char == '{':
                    brace_count += 1
                elif char == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        domain_section_end = i
                        break
            
            domain_section = caddy_content[domain_section_start:domain_section_end]
            proxy_match = proxy_pattern.search(domain_section)
            
            if proxy_match:
                service = proxy_match.group(1)
                port = int(proxy_match.group(2))
                routes_found += 1
                
                if domain in expected_routes:
                    expected_service, expected_port = expected_routes[domain]
                    if service == expected_service and port == expected_port:
                        routes_correct += 1
                    else:
                        self.warnings.append(
                            f"{domain} routes to {service}:{port}, expected {expected_service}:{expected_port}"
                        )
        
        print(f"  ✅ Found {routes_found} domain routes")
        print(f"  ✅ {routes_correct}/{len(expected_routes)} expected routes configured correctly")
        
        missing_routes = set(expected_routes.keys()) - set(domains)
        if missing_routes:
            self.warnings.append(f"Missing domain routes: {', '.join(missing_routes)}")
        
        print()
        return True
    
    def check_environment_variables(self) -> bool:
        """Validate environment variables"""
        print("🔐 Checking environment variables...")
        
        if not self.env_example.exists():
            self.errors.append(".env.example not found")
            return False
        
        with open(self.env_example) as f:
            env_content = f.read()
        
        # Extract required variables (ones marked as CRITICAL or REQUIRED)
        critical_vars = []
        required_vars = []
        
        for line in env_content.split('\n'):
            line = line.strip()
            if not line or line.startswith('#'):
                # Check comments for CRITICAL or REQUIRED
                if 'CRITICAL' in line.upper() or 'REQUIRED' in line.upper():
                    continue
            elif '=' in line:
                var_name = line.split('=')[0].strip()
                # Look back at recent comments to see if this is critical/required
                var_index = env_content.find(line)
                preceding_text = env_content[max(0, var_index-500):var_index]
                
                if 'CRITICAL' in preceding_text.upper():
                    if var_name and not var_name.startswith('#'):
                        critical_vars.append(var_name)
                elif 'REQUIRED' in preceding_text.upper() or 'Get from:' in preceding_text:
                    if var_name and not var_name.startswith('#'):
                        required_vars.append(var_name)
        
        # Check if .env exists
        env_file = self.root_dir / ".env"
        if not env_file.exists():
            self.warnings.append(".env file not found (using .env.example as template)")
            print(f"  ⚠️  .env file not found")
        else:
            # Check which critical vars are set
            with open(env_file) as f:
                env_lines = f.read()
            
            missing_critical = []
            for var in critical_vars:
                if var not in env_lines or f"{var}=" not in env_lines:
                    missing_critical.append(var)
            
            if missing_critical:
                self.warnings.append(f"Missing critical env vars: {', '.join(missing_critical[:3])}...")
        
        print(f"  ✅ Found {len(critical_vars)} critical variables defined")
        print(f"  ✅ Found {len(required_vars)} required variables defined")
        
        # Check specific important variables
        important_vars = [
            'DATABASE_URL', 'REDIS_URL', 'SESSION_SECRET',
            'DISCORD_BOT_TOKEN', 'OPENAI_API_KEY'
        ]
        
        found_important = [var for var in important_vars if var in env_content]
        print(f"  ✅ {len(found_important)}/{len(important_vars)} key variables in template")
        print()
        
        return True
    
    def _print_summary(self):
        """Print validation summary"""
        print("━━━ Summary ━━━")
        
        if self.errors:
            print(f"❌ {len(self.errors)} Error(s):")
            for error in self.errors:
                print(f"   • {error}")
        else:
            print("✅ No critical errors")
        
        if self.warnings:
            print(f"⚠️  {len(self.warnings)} Warning(s):")
            for warning in self.warnings[:5]:  # Show first 5
                print(f"   • {warning}")
            if len(self.warnings) > 5:
                print(f"   ... and {len(self.warnings) - 5} more")
        else:
            print("✅ No warnings")
        
        print()

def main():
    validator = NetworkValidator()
    success = validator.validate_all()
    
    if success and not validator.errors:
        print("✅ Network validation PASSED")
        return 0
    else:
        print("❌ Network validation FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
