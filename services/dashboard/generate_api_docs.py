#!/usr/bin/env python3
"""
Automated Flask Route Documentation Generator

This script extracts all routes from the Flask application and generates
comprehensive API documentation in Markdown format.

Usage:
    python generate_api_docs.py [--format markdown|json] [--output FILE]
"""

import os
import sys
import json
import argparse
import warnings
from collections import defaultdict
from typing import Dict, List, Any
from unittest.mock import MagicMock

def mock_missing_modules():
    """Mock missing modules to allow app import"""
    import types
    
    def create_mock_module(name):
        """Create a mock module that returns mock objects for all attribute access"""
        mock_module = types.ModuleType(name)
        mock_module.__dict__['__all__'] = []
        mock_module.__dict__['__path__'] = []
        
        # Return MagicMock for any attribute access
        def mock_getattr(attr_name):
            return MagicMock()
        
        mock_module.__getattr__ = mock_getattr
        return mock_module
    
    mock_modules = [
        'minio',
        'docker',
        'paramiko',
        'openai',
        'homeassistant_api'
    ]
    
    for module_name in mock_modules:
        if module_name not in sys.modules:
            sys.modules[module_name] = create_mock_module(module_name)

def mock_required_env_vars():
    """Mock required environment variables to allow app import"""
    os.environ.setdefault('WEB_USERNAME', 'mock_user')
    os.environ.setdefault('WEB_PASSWORD', 'mock_pass')
    os.environ.setdefault('SESSION_SECRET', 'mock_secret')
    os.environ.setdefault('REDIS_URL', 'redis://localhost:6379/0')
    os.environ.setdefault('DOCKER_HOST', 'unix:///var/run/docker.sock')
    os.environ.setdefault('HOME_ASSISTANT_URL', 'http://localhost:8123')
    os.environ.setdefault('MINIO_ENDPOINT', 'localhost:9000')

def extract_routes(app) -> Dict[str, List[Dict[str, Any]]]:
    """
    Extract all routes from Flask app and group by blueprint
    
    Returns:
        Dict mapping blueprint names to list of route info dicts
    """
    routes_by_blueprint = defaultdict(list)
    
    for rule in app.url_map.iter_rules():
        # Filter out static routes and Flask internals
        if rule.endpoint == 'static' or rule.endpoint.startswith('_'):
            continue
        
        # Extract blueprint name
        if '.' in rule.endpoint:
            blueprint_name = rule.endpoint.split('.')[0]
            function_name = rule.endpoint.split('.')[-1]
        else:
            blueprint_name = 'main'
            function_name = rule.endpoint
        
        # Get the view function
        view_func = app.view_functions.get(rule.endpoint)
        
        # Extract docstring if available
        docstring = None
        if view_func and view_func.__doc__:
            docstring = view_func.__doc__.strip()
        
        # Extract HTTP methods (exclude HEAD and OPTIONS)
        methods = [m for m in rule.methods if m not in ['HEAD', 'OPTIONS']]
        
        route_info = {
            'path': str(rule.rule),
            'methods': sorted(methods),
            'endpoint': rule.endpoint,
            'function': function_name,
            'docstring': docstring,
            'blueprint': blueprint_name
        }
        
        routes_by_blueprint[blueprint_name].append(route_info)
    
    # Sort routes within each blueprint by path
    for blueprint in routes_by_blueprint:
        routes_by_blueprint[blueprint].sort(key=lambda x: x['path'])
    
    return dict(routes_by_blueprint)

def format_as_markdown(routes_by_blueprint: Dict[str, List[Dict[str, Any]]]) -> str:
    """Format routes as Markdown documentation"""
    
    # Blueprint display names and descriptions
    blueprint_info = {
        'main': {
            'name': 'Core Routes',
            'description': 'Main application routes',
            'prefix': ''
        },
        'web': {
            'name': 'Web Interface Routes',
            'description': 'HTML pages and web interface',
            'prefix': ''
        },
        'api': {
            'name': 'System API',
            'description': 'Core system management and monitoring',
            'prefix': '/api'
        },
        'deployment': {
            'name': 'Deployment API',
            'description': 'Service deployment and template management',
            'prefix': '/api/deployment'
        },
        'jarvis_deployments': {
            'name': 'Jarvis Deployment API',
            'description': 'AI-powered deployment operations',
            'prefix': '/api/jarvis/deployments'
        },
        'upload': {
            'name': 'Upload & Artifacts API',
            'description': 'File upload and artifact management',
            'prefix': '/api'
        },
        'analysis': {
            'name': 'Analysis API',
            'description': 'Artifact analysis and code inspection',
            'prefix': '/api'
        },
        'artifacts': {
            'name': 'Artifact Builder API',
            'description': 'Automated artifact building and templates',
            'prefix': '/api/artifacts'
        },
        'smart_home': {
            'name': 'Smart Home API',
            'description': 'Home Assistant integration and device control',
            'prefix': '/smarthome'
        },
        'jarvis_voice': {
            'name': 'Jarvis Voice API',
            'description': 'Voice-controlled operations and AI queries',
            'prefix': '/api/jarvis'
        },
        'websocket': {
            'name': 'WebSocket Endpoints',
            'description': 'Real-time communication channels',
            'prefix': '/ws'
        }
    }
    
    lines = ["## API Endpoints\n"]
    
    # Define blueprint order for better organization
    blueprint_order = [
        'main',
        'web',
        'api',
        'deployment',
        'jarvis_deployments',
        'upload',
        'analysis',
        'artifacts',
        'smart_home',
        'jarvis_voice',
        'websocket'
    ]
    
    # Add any missing blueprints to the end
    for bp in routes_by_blueprint.keys():
        if bp not in blueprint_order:
            blueprint_order.append(bp)
    
    for blueprint_name in blueprint_order:
        if blueprint_name not in routes_by_blueprint:
            continue
        
        routes = routes_by_blueprint[blueprint_name]
        if not routes:
            continue
        
        # Get blueprint info
        info = blueprint_info.get(blueprint_name, {
            'name': blueprint_name.replace('_', ' ').title(),
            'description': f'{blueprint_name} routes',
            'prefix': ''
        })
        
        # Blueprint header
        lines.append(f"### {info['name']}")
        if info['description']:
            lines.append(f"*{info['description']}*")
        if info['prefix']:
            lines.append(f"**Prefix:** `{info['prefix']}`")
        lines.append("")
        
        # Group routes by category if possible
        for route in routes:
            methods_str = ', '.join(route['methods'])
            path = route['path']
            
            # Format the route
            lines.append(f"- `{methods_str} {path}`")
            
            # Add docstring if available
            if route['docstring']:
                # Take first line of docstring
                first_line = route['docstring'].split('\n')[0].strip()
                if first_line:
                    lines.append(f"  - {first_line}")
            
            lines.append("")
        
        lines.append("")
    
    return '\n'.join(lines)

def format_as_json(routes_by_blueprint: Dict[str, List[Dict[str, Any]]]) -> str:
    """Format routes as JSON"""
    return json.dumps(routes_by_blueprint, indent=2)

def main():
    """Main execution function"""
    parser = argparse.ArgumentParser(
        description='Generate API documentation from Flask routes'
    )
    parser.add_argument(
        '--format',
        choices=['markdown', 'json'],
        default='markdown',
        help='Output format (default: markdown)'
    )
    parser.add_argument(
        '--output',
        '-o',
        help='Output file (default: stdout)'
    )
    parser.add_argument(
        '--quiet',
        '-q',
        action='store_true',
        help='Suppress import warnings and errors'
    )
    
    args = parser.parse_args()
    
    # Mock environment variables before importing
    mock_required_env_vars()
    
    # Suppress warnings if quiet mode
    if args.quiet:
        warnings.filterwarnings('ignore')
    
    try:
        # Temporarily redirect stderr to suppress import warnings
        if args.quiet:
            original_stderr = sys.stderr
            sys.stderr = open(os.devnull, 'w')
        
        try:
            # Import the Flask app
            from app import app
        finally:
            # Restore stderr
            if args.quiet:
                sys.stderr.close()
                sys.stderr = original_stderr
        
        # Extract routes
        routes_by_blueprint = extract_routes(app)
        
        # Format output
        if args.format == 'markdown':
            output = format_as_markdown(routes_by_blueprint)
        else:
            output = format_as_json(routes_by_blueprint)
        
        # Write output
        if args.output:
            with open(args.output, 'w') as f:
                f.write(output)
            if not args.quiet:
                print(f"Documentation written to {args.output}", file=sys.stderr)
        else:
            print(output)
        
        return 0
        
    except ImportError as e:
        print(f"Error importing Flask app: {e}", file=sys.stderr)
        print("Make sure you're running this from the services/dashboard directory", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error generating documentation: {e}", file=sys.stderr)
        if not args.quiet:
            import traceback
            traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
