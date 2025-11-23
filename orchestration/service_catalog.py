#!/usr/bin/env python3
"""
Service Catalog Parser for HomeLabHub Phase 2
Reads services.yaml and provides dynamic service deployment information
"""

import sys
import yaml
import json
from pathlib import Path
from typing import Dict, List, Set, Optional


class ServiceCatalog:
    """Parse and query services.yaml for dynamic deployment"""
    
    def __init__(self, catalog_path: str = "orchestration/services.yaml"):
        self.catalog_path = Path(catalog_path)
        with open(self.catalog_path) as f:
            self.catalog = yaml.safe_load(f)
        self.services = self.catalog.get('services', {})
        self.groups = self.catalog.get('groups', {})
    
    def get_service(self, service_id: str) -> Optional[Dict]:
        """Get service definition by ID"""
        return self.services.get(service_id)
    
    def get_dependencies(self, service_id: str, recursive: bool = True) -> List[str]:
        """Get service dependencies (optionally recursive)"""
        service = self.get_service(service_id)
        if not service:
            return []
        
        deps = service.get('dependencies', [])
        if not recursive:
            return deps
        
        # Recursive dependency resolution
        all_deps = set()
        to_process = list(deps)
        
        while to_process:
            dep = to_process.pop(0)
            if dep in all_deps:
                continue
            all_deps.add(dep)
            
            dep_service = self.get_service(dep)
            if dep_service:
                for sub_dep in dep_service.get('dependencies', []):
                    if sub_dep not in all_deps:
                        to_process.append(sub_dep)
        
        return list(all_deps)
    
    def get_compose_files(self, service_id: str) -> List[str]:
        """Get compose files needed for a service"""
        service = self.get_service(service_id)
        if not service:
            return []
        
        # Map service to compose bundle
        service_to_bundle = {
            'postgres': 'orchestration/compose.base.yml',
            'redis': 'orchestration/compose.base.yml',
            'minio': 'orchestration/compose.base.yml',
            'caddy': 'orchestration/compose.base.yml',
            'dashboard': 'orchestration/compose.dashboard.yml',
            'celery-worker': 'orchestration/compose.automation.yml',
            'discord-bot': 'orchestration/compose.discord.yml',
            'stream-bot': 'orchestration/compose.stream.yml',
            'n8n': 'orchestration/compose.web.yml',
            'homeassistant': 'orchestration/compose.web.yml',
            'plex': 'orchestration/compose.web.yml',
            'scarletredjoker-web': 'orchestration/compose.web.yml',
            'rig-city-site': 'orchestration/compose.web.yml',
            'vnc-desktop': 'orchestration/compose.web.yml',
            'code-server': 'orchestration/compose.web.yml',
        }
        
        # Always need base
        files = ['orchestration/compose.base.yml']
        
        # Add service-specific bundle
        if service_id in service_to_bundle:
            bundle = service_to_bundle[service_id]
            if bundle not in files:
                files.append(bundle)
        
        return files
    
    def get_deployment_order(self, services: List[str]) -> List[str]:
        """Get services in deployment order (respecting dependencies)"""
        # Build dependency graph
        all_services = set()
        for svc in services:
            all_services.add(svc)
            all_services.update(self.get_dependencies(svc))
        
        # Topological sort
        ordered = []
        remaining = set(all_services)
        
        while remaining:
            # Find services with no unsatisfied dependencies
            ready = []
            for svc in remaining:
                deps = self.get_dependencies(svc, recursive=False)
                if all(d in ordered or d not in all_services for d in deps):
                    ready.append(svc)
            
            if not ready:
                # Circular dependency or missing service
                ordered.extend(sorted(remaining))
                break
            
            # Sort by startup_order if available
            ready.sort(key=lambda s: self.services.get(s, {}).get('startup_order', 999))
            ordered.extend(ready)
            remaining -= set(ready)
        
        return ordered
    
    def get_required_env_files(self, service_id: str) -> List[str]:
        """Get required .env files for a service"""
        service = self.get_service(service_id)
        if not service:
            return []
        
        env_files = service.get('env_files', [])
        
        # Map to actual filenames
        result = []
        for env_file in env_files:
            if env_file == '.env':
                result.append('.env')
                # Also check for service-specific env
                result.append(f'.env.{service_id}')
        
        return result
    
    def get_services_in_group(self, group_name: str) -> List[str]:
        """Get all services in a group"""
        group = self.groups.get(group_name, {})
        return group.get('services', [])
    
    def list_all_services(self) -> List[str]:
        """List all service IDs"""
        return list(self.services.keys())


def main():
    """CLI interface for service catalog queries"""
    if len(sys.argv) < 2:
        print("Usage: service_catalog.py <command> [args...]", file=sys.stderr)
        print("\nCommands:", file=sys.stderr)
        print("  get <service_id>           - Get service info", file=sys.stderr)
        print("  deps <service_id>          - Get dependencies", file=sys.stderr)
        print("  compose <service_id>       - Get compose files", file=sys.stderr)
        print("  order <service_id> ...     - Get deployment order", file=sys.stderr)
        print("  env <service_id>           - Get required .env files", file=sys.stderr)
        print("  group <group_name>         - Get services in group", file=sys.stderr)
        print("  list                       - List all services", file=sys.stderr)
        sys.exit(1)
    
    catalog = ServiceCatalog()
    command = sys.argv[1]
    
    if command == 'get':
        service_id = sys.argv[2]
        result = catalog.get_service(service_id)
        print(json.dumps(result, indent=2))
    
    elif command == 'deps':
        service_id = sys.argv[2]
        deps = catalog.get_dependencies(service_id)
        print('\n'.join(deps))
    
    elif command == 'compose':
        service_id = sys.argv[2]
        files = catalog.get_compose_files(service_id)
        print('\n'.join(files))
    
    elif command == 'order':
        services = sys.argv[2:]
        ordered = catalog.get_deployment_order(services)
        print('\n'.join(ordered))
    
    elif command == 'env':
        service_id = sys.argv[2]
        env_files = catalog.get_required_env_files(service_id)
        print('\n'.join(env_files))
    
    elif command == 'group':
        group_name = sys.argv[2]
        services = catalog.get_services_in_group(group_name)
        print('\n'.join(services))
    
    elif command == 'list':
        services = catalog.list_all_services()
        print('\n'.join(services))
    
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
