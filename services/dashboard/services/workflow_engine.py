"""
Workflow Engine Service
Executes automation workflows with support for various node types
"""
import logging
import asyncio
import json
import re
import time
import httpx
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from concurrent.futures import ThreadPoolExecutor
import uuid

logger = logging.getLogger(__name__)

NODE_TYPES = {
    'trigger': ['webhook', 'schedule', 'event', 'manual'],
    'action': ['http_request', 'send_discord', 'run_script', 'send_email', 'set_variable', 'delay'],
    'condition': ['if_else', 'switch'],
    'transform': ['json_path', 'template', 'merge', 'split']
}

NODE_SCHEMAS = {
    'webhook': {
        'category': 'trigger',
        'label': 'Webhook',
        'icon': 'bi-globe',
        'color': '#8B5CF6',
        'inputs': [],
        'outputs': ['data'],
        'config': {
            'path': {'type': 'string', 'label': 'Webhook Path', 'default': '/webhook/trigger'},
            'method': {'type': 'select', 'label': 'Method', 'options': ['GET', 'POST'], 'default': 'POST'}
        }
    },
    'schedule': {
        'category': 'trigger',
        'label': 'Schedule',
        'icon': 'bi-clock',
        'color': '#8B5CF6',
        'inputs': [],
        'outputs': ['trigger'],
        'config': {
            'cron': {'type': 'string', 'label': 'Cron Expression', 'default': '0 * * * *'},
            'timezone': {'type': 'string', 'label': 'Timezone', 'default': 'UTC'}
        }
    },
    'event': {
        'category': 'trigger',
        'label': 'Event',
        'icon': 'bi-lightning',
        'color': '#8B5CF6',
        'inputs': [],
        'outputs': ['data'],
        'config': {
            'event_type': {'type': 'string', 'label': 'Event Type', 'default': 'service.status_changed'},
            'filter': {'type': 'json', 'label': 'Filter Conditions', 'default': {}}
        }
    },
    'manual': {
        'category': 'trigger',
        'label': 'Manual Trigger',
        'icon': 'bi-play-circle',
        'color': '#8B5CF6',
        'inputs': [],
        'outputs': ['trigger'],
        'config': {}
    },
    'http_request': {
        'category': 'action',
        'label': 'HTTP Request',
        'icon': 'bi-send',
        'color': '#3B82F6',
        'inputs': ['trigger'],
        'outputs': ['response', 'error'],
        'config': {
            'url': {'type': 'string', 'label': 'URL', 'default': 'https://api.example.com'},
            'method': {'type': 'select', 'label': 'Method', 'options': ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], 'default': 'GET'},
            'headers': {'type': 'json', 'label': 'Headers', 'default': {}},
            'body': {'type': 'json', 'label': 'Body', 'default': {}},
            'timeout': {'type': 'number', 'label': 'Timeout (seconds)', 'default': 30}
        }
    },
    'send_discord': {
        'category': 'action',
        'label': 'Discord Message',
        'icon': 'bi-discord',
        'color': '#5865F2',
        'inputs': ['trigger'],
        'outputs': ['success', 'error'],
        'config': {
            'webhook_url': {'type': 'string', 'label': 'Webhook URL', 'default': ''},
            'content': {'type': 'textarea', 'label': 'Message Content', 'default': ''},
            'username': {'type': 'string', 'label': 'Bot Username', 'default': 'Jarvis Automation'},
            'embed': {'type': 'json', 'label': 'Embed (optional)', 'default': None}
        }
    },
    'run_script': {
        'category': 'action',
        'label': 'Run Script',
        'icon': 'bi-terminal',
        'color': '#3B82F6',
        'inputs': ['trigger'],
        'outputs': ['stdout', 'stderr'],
        'config': {
            'command': {'type': 'string', 'label': 'Command', 'default': 'echo "Hello"'},
            'working_dir': {'type': 'string', 'label': 'Working Directory', 'default': '/tmp'},
            'timeout': {'type': 'number', 'label': 'Timeout (seconds)', 'default': 60}
        }
    },
    'send_email': {
        'category': 'action',
        'label': 'Send Email',
        'icon': 'bi-envelope',
        'color': '#3B82F6',
        'inputs': ['trigger'],
        'outputs': ['success', 'error'],
        'config': {
            'to': {'type': 'string', 'label': 'To', 'default': ''},
            'subject': {'type': 'string', 'label': 'Subject', 'default': ''},
            'body': {'type': 'textarea', 'label': 'Body', 'default': ''},
            'html': {'type': 'boolean', 'label': 'HTML Format', 'default': False}
        }
    },
    'set_variable': {
        'category': 'action',
        'label': 'Set Variable',
        'icon': 'bi-braces',
        'color': '#3B82F6',
        'inputs': ['trigger'],
        'outputs': ['output'],
        'config': {
            'name': {'type': 'string', 'label': 'Variable Name', 'default': 'myVar'},
            'value': {'type': 'string', 'label': 'Value', 'default': ''}
        }
    },
    'delay': {
        'category': 'action',
        'label': 'Delay',
        'icon': 'bi-hourglass',
        'color': '#3B82F6',
        'inputs': ['trigger'],
        'outputs': ['continue'],
        'config': {
            'seconds': {'type': 'number', 'label': 'Delay (seconds)', 'default': 5}
        }
    },
    'if_else': {
        'category': 'condition',
        'label': 'If/Else',
        'icon': 'bi-signpost-split',
        'color': '#F59E0B',
        'inputs': ['input'],
        'outputs': ['true', 'false'],
        'config': {
            'field': {'type': 'string', 'label': 'Field to Check', 'default': 'data.value'},
            'operator': {'type': 'select', 'label': 'Operator', 'options': ['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists', 'is_empty'], 'default': 'equals'},
            'value': {'type': 'string', 'label': 'Compare Value', 'default': ''}
        }
    },
    'switch': {
        'category': 'condition',
        'label': 'Switch',
        'icon': 'bi-diagram-2',
        'color': '#F59E0B',
        'inputs': ['input'],
        'outputs': ['case_1', 'case_2', 'case_3', 'default'],
        'config': {
            'field': {'type': 'string', 'label': 'Field to Check', 'default': 'data.type'},
            'cases': {'type': 'json', 'label': 'Cases', 'default': {'case_1': 'value1', 'case_2': 'value2'}}
        }
    },
    'json_path': {
        'category': 'transform',
        'label': 'JSON Path',
        'icon': 'bi-braces-asterisk',
        'color': '#10B981',
        'inputs': ['input'],
        'outputs': ['output'],
        'config': {
            'expression': {'type': 'string', 'label': 'JSON Path Expression', 'default': '$.data'},
            'default_value': {'type': 'string', 'label': 'Default Value', 'default': ''}
        }
    },
    'template': {
        'category': 'transform',
        'label': 'Template',
        'icon': 'bi-file-earmark-code',
        'color': '#10B981',
        'inputs': ['input'],
        'outputs': ['output'],
        'config': {
            'template': {'type': 'textarea', 'label': 'Template', 'default': 'Hello {{name}}!'}
        }
    },
    'merge': {
        'category': 'transform',
        'label': 'Merge',
        'icon': 'bi-union',
        'color': '#10B981',
        'inputs': ['input_1', 'input_2'],
        'outputs': ['merged'],
        'config': {
            'strategy': {'type': 'select', 'label': 'Merge Strategy', 'options': ['shallow', 'deep', 'array'], 'default': 'shallow'}
        }
    },
    'split': {
        'category': 'transform',
        'label': 'Split',
        'icon': 'bi-intersect',
        'color': '#10B981',
        'inputs': ['input'],
        'outputs': ['items'],
        'config': {
            'field': {'type': 'string', 'label': 'Array Field', 'default': 'data.items'}
        }
    }
}


class WorkflowEngine:
    """Executes automation workflows"""
    
    def __init__(self):
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.variables: Dict[str, Any] = {}
        self.node_results: Dict[str, Any] = {}
    
    def get_node_schemas(self) -> Dict[str, Any]:
        """Get all available node schemas for the UI"""
        return NODE_SCHEMAS
    
    def get_node_types(self) -> Dict[str, List[str]]:
        """Get all node types grouped by category"""
        return NODE_TYPES
    
    def validate_workflow(self, nodes: List[Dict], edges: List[Dict]) -> Tuple[bool, List[str]]:
        """Validate workflow structure"""
        errors = []
        
        if not nodes:
            errors.append("Workflow must have at least one node")
            return False, errors
        
        node_ids = {node.get('id') for node in nodes}
        trigger_nodes = [n for n in nodes if n.get('type') in NODE_TYPES.get('trigger', [])]
        
        if not trigger_nodes:
            errors.append("Workflow must have at least one trigger node")
        
        for edge in edges:
            source = edge.get('source')
            target = edge.get('target')
            if source not in node_ids:
                errors.append(f"Edge references unknown source node: {source}")
            if target not in node_ids:
                errors.append(f"Edge references unknown target node: {target}")
        
        visited = set()
        def check_cycle(node_id: str, path: set) -> bool:
            if node_id in path:
                return True
            if node_id in visited:
                return False
            visited.add(node_id)
            path.add(node_id)
            for edge in edges:
                if edge.get('source') == node_id:
                    if check_cycle(edge.get('target'), path.copy()):
                        return True
            return False
        
        for node in trigger_nodes:
            if check_cycle(node.get('id'), set()):
                errors.append("Workflow contains a cycle")
                break
        
        return len(errors) == 0, errors
    
    def execute_workflow(self, workflow_data: Dict, trigger_data: Optional[Dict] = None) -> Dict:
        """Execute a workflow synchronously"""
        self.variables = {}
        self.node_results = {}
        
        nodes = workflow_data.get('nodes', [])
        edges = workflow_data.get('edges', [])
        
        valid, errors = self.validate_workflow(nodes, edges)
        if not valid:
            return {
                'success': False,
                'error': '; '.join(errors),
                'node_results': {}
            }
        
        node_map = {n['id']: n for n in nodes}
        
        adjacency = {}
        for node in nodes:
            adjacency[node['id']] = []
        for edge in edges:
            source = edge.get('source')
            target = edge.get('target')
            if source in adjacency:
                adjacency[source].append({
                    'target': target,
                    'source_handle': edge.get('sourceHandle'),
                    'target_handle': edge.get('targetHandle')
                })
        
        trigger_nodes = [n for n in nodes if n.get('type') in NODE_TYPES.get('trigger', [])]
        
        execution_result = {
            'success': True,
            'error': None,
            'node_results': {},
            'output': None
        }
        
        try:
            for trigger in trigger_nodes:
                input_data = trigger_data or {}
                self._execute_node_chain(trigger, input_data, node_map, adjacency, execution_result)
        except Exception as e:
            logger.error(f"Workflow execution failed: {e}")
            execution_result['success'] = False
            execution_result['error'] = str(e)
        
        execution_result['node_results'] = self.node_results
        return execution_result
    
    def _execute_node_chain(self, node: Dict, input_data: Any, node_map: Dict, adjacency: Dict, result: Dict):
        """Execute a node and its connected nodes"""
        node_id = node['id']
        node_type = node.get('type')
        config = node.get('data', {}).get('config', {})
        
        logger.info(f"Executing node: {node_id} (type: {node_type})")
        
        try:
            output = self._execute_node(node_type, config, input_data)
            self.node_results[node_id] = {
                'status': 'success',
                'output': output,
                'executed_at': datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Node {node_id} failed: {e}")
            self.node_results[node_id] = {
                'status': 'error',
                'error': str(e),
                'executed_at': datetime.utcnow().isoformat()
            }
            if node.get('data', {}).get('stopOnError', True):
                raise
            output = {'error': str(e)}
        
        for connection in adjacency.get(node_id, []):
            target_id = connection['target']
            source_handle = connection.get('source_handle')
            
            if node_type == 'if_else':
                condition_result = output.get('condition', False)
                if source_handle == 'true' and not condition_result:
                    continue
                if source_handle == 'false' and condition_result:
                    continue
            
            if node_type == 'switch':
                matched_case = output.get('matched_case')
                if source_handle and source_handle != matched_case and source_handle != 'default':
                    continue
            
            target_node = node_map.get(target_id)
            if target_node:
                self._execute_node_chain(target_node, output, node_map, adjacency, result)
    
    def _execute_node(self, node_type: str, config: Dict, input_data: Any) -> Any:
        """Execute a single node"""
        config = self._substitute_variables(config, input_data)
        
        if node_type in ['webhook', 'schedule', 'event', 'manual']:
            return self._execute_trigger(node_type, config, input_data)
        elif node_type == 'http_request':
            return self._execute_http_request(config)
        elif node_type == 'send_discord':
            return self._execute_discord(config)
        elif node_type == 'run_script':
            return self._execute_script(config)
        elif node_type == 'send_email':
            return self._execute_email(config)
        elif node_type == 'set_variable':
            return self._execute_set_variable(config)
        elif node_type == 'delay':
            return self._execute_delay(config)
        elif node_type == 'if_else':
            return self._execute_if_else(config, input_data)
        elif node_type == 'switch':
            return self._execute_switch(config, input_data)
        elif node_type == 'json_path':
            return self._execute_json_path(config, input_data)
        elif node_type == 'template':
            return self._execute_template(config, input_data)
        elif node_type == 'merge':
            return self._execute_merge(config, input_data)
        elif node_type == 'split':
            return self._execute_split(config, input_data)
        else:
            raise ValueError(f"Unknown node type: {node_type}")
    
    def _substitute_variables(self, config: Dict, input_data: Any) -> Dict:
        """Substitute {{variable}} placeholders in config"""
        result = {}
        for key, value in config.items():
            if isinstance(value, str):
                pattern = r'\{\{(\w+(?:\.\w+)*)\}\}'
                matches = re.findall(pattern, value)
                for match in matches:
                    parts = match.split('.')
                    replacement = input_data
                    try:
                        for part in parts:
                            if isinstance(replacement, dict):
                                replacement = replacement.get(part, '')
                            else:
                                replacement = ''
                                break
                    except:
                        replacement = self.variables.get(match, '')
                    value = value.replace(f'{{{{{match}}}}}', str(replacement))
                result[key] = value
            elif isinstance(value, dict):
                result[key] = self._substitute_variables(value, input_data)
            else:
                result[key] = value
        return result
    
    def _execute_trigger(self, trigger_type: str, config: Dict, input_data: Any) -> Dict:
        """Execute trigger node - passes through trigger data"""
        return {
            'trigger_type': trigger_type,
            'config': config,
            'data': input_data,
            'timestamp': datetime.utcnow().isoformat()
        }
    
    def _execute_http_request(self, config: Dict) -> Dict:
        """Execute HTTP request node"""
        url = config.get('url', '')
        method = config.get('method', 'GET')
        headers = config.get('headers', {})
        body = config.get('body')
        timeout = config.get('timeout', 30)
        
        with httpx.Client(timeout=timeout) as client:
            if method == 'GET':
                response = client.get(url, headers=headers)
            elif method == 'POST':
                response = client.post(url, headers=headers, json=body)
            elif method == 'PUT':
                response = client.put(url, headers=headers, json=body)
            elif method == 'DELETE':
                response = client.delete(url, headers=headers)
            elif method == 'PATCH':
                response = client.patch(url, headers=headers, json=body)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
            
            try:
                response_data = response.json()
            except:
                response_data = response.text
            
            return {
                'status_code': response.status_code,
                'headers': dict(response.headers),
                'body': response_data,
                'success': 200 <= response.status_code < 300
            }
    
    def _execute_discord(self, config: Dict) -> Dict:
        """Send Discord webhook message"""
        webhook_url = config.get('webhook_url', '')
        if not webhook_url:
            raise ValueError("Discord webhook URL is required")
        
        payload = {
            'content': config.get('content', ''),
            'username': config.get('username', 'Jarvis Automation')
        }
        
        if config.get('embed'):
            payload['embeds'] = [config['embed']]
        
        with httpx.Client(timeout=10) as client:
            response = client.post(webhook_url, json=payload)
            return {
                'success': response.status_code == 204,
                'status_code': response.status_code
            }
    
    def _execute_script(self, config: Dict) -> Dict:
        """Execute shell script"""
        import subprocess
        
        command = config.get('command', '')
        working_dir = config.get('working_dir', '/tmp')
        timeout = config.get('timeout', 60)
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=working_dir,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return {
                'stdout': result.stdout,
                'stderr': result.stderr,
                'return_code': result.returncode,
                'success': result.returncode == 0
            }
        except subprocess.TimeoutExpired:
            return {
                'stdout': '',
                'stderr': 'Command timed out',
                'return_code': -1,
                'success': False
            }
    
    def _execute_email(self, config: Dict) -> Dict:
        """Send email (placeholder - needs SMTP configuration)"""
        return {
            'success': True,
            'message': 'Email sending not configured - would send to: ' + config.get('to', '')
        }
    
    def _execute_set_variable(self, config: Dict) -> Dict:
        """Set a workflow variable"""
        name = config.get('name', 'var')
        value = config.get('value', '')
        self.variables[name] = value
        return {'name': name, 'value': value}
    
    def _execute_delay(self, config: Dict) -> Dict:
        """Delay execution"""
        seconds = config.get('seconds', 5)
        time.sleep(min(seconds, 300))
        return {'delayed_seconds': seconds}
    
    def _execute_if_else(self, config: Dict, input_data: Any) -> Dict:
        """Evaluate if/else condition"""
        field = config.get('field', '')
        operator = config.get('operator', 'equals')
        compare_value = config.get('value', '')
        
        field_value = self._get_field_value(input_data, field)
        
        condition = False
        if operator == 'equals':
            condition = str(field_value) == str(compare_value)
        elif operator == 'not_equals':
            condition = str(field_value) != str(compare_value)
        elif operator == 'contains':
            condition = str(compare_value) in str(field_value)
        elif operator == 'greater_than':
            try:
                condition = float(field_value) > float(compare_value)
            except:
                condition = False
        elif operator == 'less_than':
            try:
                condition = float(field_value) < float(compare_value)
            except:
                condition = False
        elif operator == 'exists':
            condition = field_value is not None
        elif operator == 'is_empty':
            condition = not field_value
        
        return {
            'condition': condition,
            'field': field,
            'field_value': field_value,
            'operator': operator,
            'compare_value': compare_value,
            'data': input_data
        }
    
    def _execute_switch(self, config: Dict, input_data: Any) -> Dict:
        """Evaluate switch condition"""
        field = config.get('field', '')
        cases = config.get('cases', {})
        
        field_value = str(self._get_field_value(input_data, field))
        
        matched_case = 'default'
        for case_name, case_value in cases.items():
            if field_value == str(case_value):
                matched_case = case_name
                break
        
        return {
            'matched_case': matched_case,
            'field_value': field_value,
            'data': input_data
        }
    
    def _execute_json_path(self, config: Dict, input_data: Any) -> Dict:
        """Extract data using JSON path expression"""
        expression = config.get('expression', '$')
        default_value = config.get('default_value', '')
        
        if expression.startswith('$.'):
            expression = expression[2:]
        
        result = self._get_field_value(input_data, expression)
        if result is None:
            result = default_value
        
        return {'output': result}
    
    def _execute_template(self, config: Dict, input_data: Any) -> Dict:
        """Render template with data"""
        template = config.get('template', '')
        
        pattern = r'\{\{(\w+(?:\.\w+)*)\}\}'
        matches = re.findall(pattern, template)
        
        result = template
        for match in matches:
            value = self._get_field_value(input_data, match)
            if value is None:
                value = self.variables.get(match, '')
            result = result.replace(f'{{{{{match}}}}}', str(value))
        
        return {'output': result}
    
    def _execute_merge(self, config: Dict, input_data: Any) -> Dict:
        """Merge multiple inputs"""
        strategy = config.get('strategy', 'shallow')
        
        if isinstance(input_data, dict):
            return {'merged': input_data}
        return {'merged': {'data': input_data}}
    
    def _execute_split(self, config: Dict, input_data: Any) -> Dict:
        """Split array into individual items"""
        field = config.get('field', 'data')
        items = self._get_field_value(input_data, field)
        
        if not isinstance(items, list):
            items = [items]
        
        return {'items': items, 'count': len(items)}
    
    def _get_field_value(self, data: Any, field: str) -> Any:
        """Get nested field value from data"""
        if not field:
            return data
        
        parts = field.split('.')
        current = data
        
        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list) and part.isdigit():
                idx = int(part)
                current = current[idx] if idx < len(current) else None
            else:
                return None
            
            if current is None:
                return None
        
        return current


workflow_engine = WorkflowEngine()
