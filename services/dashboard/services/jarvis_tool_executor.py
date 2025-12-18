"""
Jarvis Tool Executor - Autonomous command execution for Jarvis AI
Provides tool definitions and execution for OpenAI function calling
"""
import subprocess
import logging
import json
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)

ALLOWED_GIT_COMMANDS = ['status', 'log', 'diff', 'branch', 'show']
ALLOWED_DOCKER_COMMANDS = ['ps', 'logs', 'inspect', 'stats', 'top']
MAX_OUTPUT_LENGTH = 8000
COMMAND_TIMEOUT = 30

CAPABILITY_REGISTRY = {
    'local': {
        'available_commands': ['docker', 'docker-compose', 'git', 'bash', 'ping', 'nslookup', 'echo', 'cat', 'grep', 'top', 'df', 'free'],
        'container_prefix': '',
    },
    'linode': {
        'available_commands': ['docker', 'git', 'systemctl', 'bash', 'ping', 'nslookup', 'echo', 'cat', 'grep', 'top', 'df', 'free'],
        'container_prefix': 'homelab-',
    },
    'ubuntu': {
        'available_commands': ['docker', 'docker-compose', 'git', 'systemctl', 'bash', 'ping', 'nslookup', 'echo', 'cat', 'grep', 'top', 'df', 'free'],
        'container_prefix': '',
    }
}

COMMAND_ALTERNATIVES = {
    'docker-compose': "Try 'docker compose' (without hyphen) instead.",
    'systemctl': "Service management may not be available on this host.",
    'apt': "Package management requires elevated privileges.",
    'yum': "Package management requires elevated privileges.",
}

@dataclass
class ToolResult:
    success: bool
    output: str
    error: Optional[str] = None
    raw_error: Optional[str] = None
    execution_time: float = 0.0
    command: str = ""
    host: str = "local"

ERROR_PATTERNS = {
    r"command not found": {
        "message": "The command '{cmd}' is not installed on {host}.",
        "suggestion": "You may need to install it using the appropriate package manager.",
        "extract": {"cmd": r"(\S+): command not found"}
    },
    r"No such container": {
        "message": "Container '{name}' doesn't exist.",
        "suggestion": "Check the container name with 'docker ps -a'.",
        "extract": {"name": r"No such container[:\s]+(\S+)"}
    },
    r"permission denied": {
        "message": "Permission denied.",
        "suggestion": "The command may require elevated privileges (sudo) or correct file permissions.",
        "extract": {}
    },
    r"[Cc]onnection refused": {
        "message": "Cannot connect to {host}.",
        "suggestion": "The service may be down or unreachable. Check if the service is running.",
        "extract": {"host": r"connect to (\S+)"}
    },
    r"SSH client not available|ssh.*not found": {
        "message": "SSH is not available.",
        "suggestion": "Remote commands cannot be executed. Ensure SSH is installed and configured.",
        "extract": {}
    },
    r"No such file or directory": {
        "message": "File or path not found: {path}",
        "suggestion": "Verify the path exists and check for typos.",
        "extract": {"path": r"(?:open|stat|access)?\s*['\"]?([^'\":\n]+)['\"]?:\s*No such file or directory"}
    },
    r"[Aa]uthentication required|[Uu]nauthorized|401": {
        "message": "Authentication failed.",
        "suggestion": "Check credentials or tokens. You may need to re-authenticate.",
        "extract": {}
    },
    r"timed?\s*out|timeout": {
        "message": "Command timed out.",
        "suggestion": "The operation may be taking longer than expected. Try increasing the timeout or check if the service is responsive.",
        "extract": {}
    },
    r"Fleet manager not available": {
        "message": "Fleet manager is not available.",
        "suggestion": "Remote host management is not configured. Check SSH keys and fleet configuration.",
        "extract": {}
    },
    r"Container.*not in allowed list": {
        "message": "Container '{name}' is not in the allowed list.",
        "suggestion": "Only approved containers can be restarted for safety. Add the container to the allowed list if needed.",
        "extract": {"name": r"Container '([^']+)'"}
    }
}

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "git_status",
            "description": "Check git repository status including uncommitted changes, branch info, and staged files",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to git repository (default: current directory)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "git_log",
            "description": "View recent git commit history",
            "parameters": {
                "type": "object",
                "properties": {
                    "count": {
                        "type": "integer",
                        "description": "Number of commits to show (default: 10)"
                    },
                    "oneline": {
                        "type": "boolean",
                        "description": "Show compact one-line format"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "docker_containers",
            "description": "List all Docker containers with their status, names, and resource usage",
            "parameters": {
                "type": "object",
                "properties": {
                    "all": {
                        "type": "boolean",
                        "description": "Show all containers including stopped ones"
                    },
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Which host to check (local=current, linode=cloud, ubuntu=local server)"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "docker_logs",
            "description": "Get logs from a specific Docker container",
            "parameters": {
                "type": "object",
                "properties": {
                    "container": {
                        "type": "string",
                        "description": "Container name or ID"
                    },
                    "tail": {
                        "type": "integer",
                        "description": "Number of lines from end (default: 50)"
                    },
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Which host the container is on"
                    }
                },
                "required": ["container"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_service_health",
            "description": "Check health and status of homelab services including response times and error rates",
            "parameters": {
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Specific service to check (e.g., dashboard, discord-bot, plex) or 'all'"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_logs",
            "description": "Search and analyze logs for errors, warnings, or specific patterns",
            "parameters": {
                "type": "object",
                "properties": {
                    "service": {
                        "type": "string",
                        "description": "Service name to analyze logs for"
                    },
                    "pattern": {
                        "type": "string",
                        "description": "Pattern or keyword to search for (e.g., 'error', 'failed', 'timeout')"
                    },
                    "lines": {
                        "type": "integer",
                        "description": "Number of log lines to analyze (default: 100)"
                    }
                },
                "required": ["service"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "system_resources",
            "description": "Check system resource usage including CPU, memory, disk space",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Which host to check"
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fleet_command",
            "description": "Execute a command on a remote fleet host via SSH",
            "parameters": {
                "type": "object",
                "properties": {
                    "host": {
                        "type": "string",
                        "enum": ["linode", "ubuntu"],
                        "description": "Target host"
                    },
                    "command": {
                        "type": "string",
                        "description": "Command to execute (limited to safe read-only operations)"
                    }
                },
                "required": ["host", "command"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "restart_container",
            "description": "Restart a Docker container to fix issues",
            "parameters": {
                "type": "object",
                "properties": {
                    "container": {
                        "type": "string",
                        "description": "Container name to restart"
                    },
                    "host": {
                        "type": "string",
                        "enum": ["local", "linode", "ubuntu"],
                        "description": "Host where container is running"
                    }
                },
                "required": ["container"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "network_check",
            "description": "Check network connectivity and DNS resolution",
            "parameters": {
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "description": "Target to check (IP, hostname, or URL)"
                    }
                },
                "required": []
            }
        }
    }
]


class JarvisToolExecutor:
    """Executes tools called by Jarvis AI"""
    
    def __init__(self):
        self.fleet_manager = None
        self.docker_service = None
        self._init_services()
    
    def _init_services(self):
        """Initialize required services"""
        try:
            from services.fleet_manager import FleetManager
            self.fleet_manager = FleetManager()
        except Exception as e:
            logger.warning(f"Fleet manager not available: {e}")
        
        try:
            from services.docker_service import DockerService
            self.docker_service = DockerService()
        except Exception as e:
            logger.warning(f"Docker service not available: {e}")
    
    def get_tool_definitions(self) -> List[Dict]:
        """Return OpenAI-compatible tool definitions"""
        return TOOL_DEFINITIONS
    
    def _check_capability(self, host: str, command: str) -> tuple[bool, str]:
        """
        Check if a command is available on the specified host.
        
        Args:
            host: Target host ('local', 'linode', 'ubuntu')
            command: Full command string to check
            
        Returns:
            Tuple of (is_available, error_message)
            - (True, "") if command is available
            - (False, "helpful message") if not available
        """
        if not command:
            return (True, "")
        
        base_command = command.split()[0] if isinstance(command, str) else command[0]
        
        capabilities = self._probe_host_capabilities(host)
        available_commands = capabilities.get('available_commands', [])
        
        if base_command in available_commands:
            return (True, "")
        
        suggestion = COMMAND_ALTERNATIVES.get(base_command, "")
        available_list = ", ".join(available_commands) if available_commands else "none known"
        
        error_msg = f"Command '{base_command}' is not available on {host}."
        if suggestion:
            error_msg += f"\n\nSuggested alternative: {suggestion}"
        error_msg += f"\n\nAvailable commands on {host}: {available_list}"
        
        return (False, error_msg)
    
    def _probe_host_capabilities(self, host: str) -> Dict[str, Any]:
        """
        Get capabilities for a host. Currently returns cached registry,
        but can be extended for dynamic capability discovery.
        
        Args:
            host: Target host ('local', 'linode', 'ubuntu')
            
        Returns:
            Dict with 'available_commands' and 'container_prefix' keys
        """
        return CAPABILITY_REGISTRY.get(host, {
            'available_commands': [],
            'container_prefix': '',
        })
    
    def execute_tool(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """Execute a tool and return the result"""
        start_time = datetime.now()
        
        try:
            if tool_name == "git_status":
                result = self._git_status(arguments)
            elif tool_name == "git_log":
                result = self._git_log(arguments)
            elif tool_name == "docker_containers":
                result = self._docker_containers(arguments)
            elif tool_name == "docker_logs":
                result = self._docker_logs(arguments)
            elif tool_name == "check_service_health":
                result = self._check_service_health(arguments)
            elif tool_name == "analyze_logs":
                result = self._analyze_logs(arguments)
            elif tool_name == "system_resources":
                result = self._system_resources(arguments)
            elif tool_name == "fleet_command":
                result = self._fleet_command(arguments)
            elif tool_name == "restart_container":
                result = self._restart_container(arguments)
            elif tool_name == "network_check":
                result = self._network_check(arguments)
            else:
                result = ToolResult(
                    success=False,
                    output="",
                    error=f"Unknown tool: {tool_name}"
                )
            
            result.execution_time = (datetime.now() - start_time).total_seconds()
            return result
            
        except Exception as e:
            logger.error(f"Tool execution error for {tool_name}: {e}", exc_info=True)
            normalized = self._normalize_error(str(e), context={"tool": tool_name})
            return ToolResult(
                success=False,
                output="",
                error=normalized,
                raw_error=str(e),
                execution_time=(datetime.now() - start_time).total_seconds()
            )
    
    def _run_command(self, cmd: List[str], timeout: int = COMMAND_TIMEOUT, host: str = "local") -> ToolResult:
        """Run a local command safely"""
        command_str = " ".join(cmd)
        
        is_available, error_msg = self._check_capability(host, cmd[0] if cmd else "")
        if not is_available:
            return ToolResult(
                success=False,
                output="",
                error=error_msg,
                command=command_str,
                host=host
            )
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd="/app" if self._in_docker() else None
            )
            output = result.stdout + result.stderr
            output = self._truncate_output(output)
            output = self._scrub_secrets(output)
            
            return ToolResult(
                success=result.returncode == 0,
                output=output,
                command=command_str
            )
        except subprocess.TimeoutExpired:
            return self._make_error_result(
                "Command timed out",
                context={"command": command_str},
                command=command_str
            )
        except Exception as e:
            return self._make_error_result(
                str(e),
                context={"command": command_str},
                command=command_str
            )
    
    def _in_docker(self) -> bool:
        """Check if running inside Docker"""
        import os
        return os.path.exists('/.dockerenv') or bool(os.environ.get('DOCKER_CONTAINER'))
    
    def _truncate_output(self, output: str) -> str:
        """Truncate output to max length"""
        if len(output) > MAX_OUTPUT_LENGTH:
            return output[:MAX_OUTPUT_LENGTH] + f"\n... (truncated, {len(output) - MAX_OUTPUT_LENGTH} more chars)"
        return output
    
    def _scrub_secrets(self, output: str) -> str:
        """Remove sensitive information from output"""
        patterns = [
            (r'(password|passwd|pwd|secret|token|key|api_key)[\s]*[=:][\s]*[^\s]+', r'\1=***REDACTED***'),
            (r'sk-[a-zA-Z0-9]{20,}', 'sk-***REDACTED***'),
            (r'[a-f0-9]{32,}', '***HASH_REDACTED***'),
        ]
        for pattern, replacement in patterns:
            output = re.sub(pattern, replacement, output, flags=re.IGNORECASE)
        return output
    
    def _normalize_error(self, raw_error: str, context: Optional[Dict] = None) -> str:
        """
        Normalize raw technical errors into user-friendly messages.
        
        Args:
            raw_error: The raw error message from command execution
            context: Optional context dict with keys like 'host', 'container', 'command', 'path'
            
        Returns:
            Formatted user-friendly error message with suggestion
        """
        if not raw_error:
            return raw_error
            
        context = context or {}
        
        for pattern, error_info in ERROR_PATTERNS.items():
            if re.search(pattern, raw_error, re.IGNORECASE):
                message_template = error_info["message"]
                suggestion = error_info.get("suggestion", "")
                extractions = error_info.get("extract", {})
                
                format_vars = {
                    "host": context.get("host", "the target host"),
                    "cmd": context.get("command", "unknown").split()[0] if context.get("command") else "unknown",
                    "name": context.get("container", "unknown"),
                    "path": context.get("path", "unknown"),
                }
                
                for var_name, extract_pattern in extractions.items():
                    match = re.search(extract_pattern, raw_error, re.IGNORECASE)
                    if match:
                        format_vars[var_name] = match.group(1)
                
                try:
                    friendly_message = message_template.format(**format_vars)
                except KeyError:
                    friendly_message = message_template
                
                result = friendly_message
                if suggestion:
                    result += f"\n\nSuggested fix: {suggestion}"
                
                result += f"\n\n<details>\n<summary>Technical details</summary>\n{raw_error}\n</details>"
                
                return result
        
        return f"An error occurred: {raw_error}"
    
    def _make_error_result(self, raw_error: str, context: Optional[Dict] = None, 
                          host: str = "local", command: str = "") -> ToolResult:
        """Create a ToolResult with normalized error"""
        normalized = self._normalize_error(raw_error, context)
        return ToolResult(
            success=False,
            output="",
            error=normalized,
            raw_error=raw_error,
            host=host,
            command=command
        )
    
    def _git_status(self, args: Dict) -> ToolResult:
        """Execute git status"""
        path = args.get('path', '.')
        return self._run_command(['git', 'status', '-sb'])
    
    def _git_log(self, args: Dict) -> ToolResult:
        """Execute git log"""
        count = args.get('count', 10)
        oneline = args.get('oneline', True)
        
        cmd = ['git', 'log', f'-{count}']
        if oneline:
            cmd.append('--oneline')
        return self._run_command(cmd)
    
    def _docker_containers(self, args: Dict) -> ToolResult:
        """List Docker containers"""
        show_all = args.get('all', True)
        host = args.get('host', 'local')
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            cmd = 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
            if show_all:
                cmd = 'docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Image}}"'
            return self._fleet_command({'host': host, 'command': cmd})
        else:
            cmd = ['docker', 'ps', '--format', 'table {{.Names}}\t{{.Status}}\t{{.Image}}']
            if show_all:
                cmd.insert(2, '-a')
            return self._run_command(cmd)
    
    def _docker_logs(self, args: Dict) -> ToolResult:
        """Get Docker container logs"""
        container = args.get('container')
        tail = args.get('tail', 50)
        host = args.get('host', 'local')
        
        if not container:
            return self._make_error_result(
                "Container name required",
                context={"host": host}
            )
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            return self._fleet_command({'host': host, 'command': f'docker logs --tail {tail} {container}'})
        else:
            return self._run_command(['docker', 'logs', '--tail', str(tail), container])
    
    def _check_service_health(self, args: Dict) -> ToolResult:
        """Check service health"""
        service = args.get('service', 'all')
        
        try:
            import requests
            
            services = {
                'dashboard': 'http://localhost:5000/health',
                'discord-bot': 'http://discord-bot:5000/health',
                'stream-bot': 'http://stream-bot:5000/health',
            }
            
            if service != 'all':
                services = {k: v for k, v in services.items() if k == service}
            
            output = "SERVICE HEALTH CHECK\n" + "=" * 40 + "\n"
            
            for name, url in services.items():
                try:
                    resp = requests.get(url, timeout=5)
                    status = "HEALTHY" if resp.ok else f"UNHEALTHY ({resp.status_code})"
                    output += f"{name}: {status}\n"
                except Exception as e:
                    output += f"{name}: UNREACHABLE ({str(e)[:50]})\n"
            
            return ToolResult(success=True, output=output)
        except Exception as e:
            return self._make_error_result(
                str(e),
                context={"service": service}
            )
    
    def _analyze_logs(self, args: Dict) -> ToolResult:
        """Analyze logs for patterns"""
        service = args.get('service', 'dashboard')
        pattern = args.get('pattern', 'error|failed|exception')
        lines = args.get('lines', 100)
        host = args.get('host', 'linode')
        
        container_map = {
            'dashboard': 'homelab-dashboard',
            'discord-bot': 'discord-bot',
            'stream-bot': 'stream-bot',
            'celery': 'homelab-celery-worker',
            'redis': 'homelab-redis',
            'postgres': 'homelab-postgres',
            'caddy': 'caddy',
        }
        container = container_map.get(service, service)
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            cmd = f'docker logs --tail {lines} {container} 2>&1 | grep -iE "{pattern}" | tail -30 || echo "No matches found for pattern: {pattern}"'
            return self._fleet_command({'host': host, 'command': cmd})
        else:
            result = self._run_command(['docker', 'logs', '--tail', str(lines), container])
            if result.success and pattern:
                import re
                filtered = [l for l in result.output.split('\n') if re.search(pattern, l, re.IGNORECASE)]
                result.output = '\n'.join(filtered[-30:]) if filtered else f"No matches found for pattern: {pattern}"
            return result
    
    def _system_resources(self, args: Dict) -> ToolResult:
        """Check system resources"""
        host = args.get('host', 'local')
        
        cmd = "echo '=== CPU ===' && top -bn1 | head -5 && echo '=== MEMORY ===' && free -h && echo '=== DISK ===' && df -h /"
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            return self._fleet_command({'host': host, 'command': cmd})
        else:
            container_cmd = (
                "echo '=== DOCKER STATS ===' && docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null | head -15 && "
                "echo '=== DISK ===' && df -h / 2>/dev/null || echo 'Disk info unavailable'"
            )
            return self._run_command(['bash', '-c', container_cmd])
    
    def _fleet_command(self, args: Dict) -> ToolResult:
        """Execute command on fleet host"""
        host = args.get('host')
        command = args.get('command')
        
        if not host or not command:
            return self._make_error_result(
                "Host and command required",
                context={"host": host or "unknown", "command": command or "unknown"}
            )
        
        base_command = command.split()[0] if command else ""
        is_available, error_msg = self._check_capability(host, base_command)
        if not is_available:
            return ToolResult(
                success=False,
                output="",
                error=error_msg,
                command=command,
                host=host
            )
        
        dangerous_patterns = ['rm -rf', 'mkfs', 'dd if=', ':(){', 'chmod 777', '> /dev/', 'shutdown', 'reboot']
        for pattern in dangerous_patterns:
            if pattern in command.lower():
                return self._make_error_result(
                    f"Blocked dangerous command pattern: {pattern}",
                    context={"host": host, "command": command},
                    host=host,
                    command=command
                )
        
        if self.fleet_manager:
            try:
                result = self.fleet_manager.execute_command(host, command)
                raw_err = result.get('error')
                normalized_err = self._normalize_error(raw_err, {"host": host, "command": command}) if raw_err else None
                return ToolResult(
                    success=result.get('success', False),
                    output=self._truncate_output(self._scrub_secrets(result.get('output', ''))),
                    error=normalized_err,
                    raw_error=raw_err,
                    host=host,
                    command=command
                )
            except Exception as e:
                return self._make_error_result(
                    str(e),
                    context={"host": host, "command": command},
                    host=host,
                    command=command
                )
        else:
            return self._make_error_result(
                "Fleet manager not available",
                context={"host": host, "command": command},
                host=host,
                command=command
            )
    
    def _restart_container(self, args: Dict) -> ToolResult:
        """Restart a Docker container"""
        container = args.get('container')
        host = args.get('host', 'local')
        
        if not container:
            return self._make_error_result(
                "Container name required",
                context={"host": host}
            )
        
        allowed_containers = [
            'homelab-dashboard', 'homelab-celery-worker', 'homelab-celery-beat',
            'discord-bot', 'stream-bot', 'homelab-redis', 'caddy'
        ]
        
        if container not in allowed_containers and not container.startswith('homelab-'):
            return self._make_error_result(
                f"Container '{container}' not in allowed list",
                context={"container": container, "host": host},
                host=host
            )
        
        if host in ['linode', 'ubuntu'] and self.fleet_manager:
            return self._fleet_command({'host': host, 'command': f'docker restart {container}'})
        else:
            return self._run_command(['docker', 'restart', container])
    
    def _network_check(self, args: Dict) -> ToolResult:
        """Check network connectivity"""
        target = args.get('target', '8.8.8.8')
        
        output = ""
        ping_result = self._run_command(['ping', '-c', '3', '-W', '2', target])
        output += f"=== PING {target} ===\n{ping_result.output}\n"
        
        if '.' in target or target.startswith('http'):
            host = target.replace('http://', '').replace('https://', '').split('/')[0].split(':')[0]
            dns_result = self._run_command(['nslookup', host])
            output += f"\n=== DNS {host} ===\n{dns_result.output}\n"
        
        return ToolResult(success=ping_result.success, output=output)


jarvis_tool_executor = JarvisToolExecutor()
