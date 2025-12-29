"""
Nebula Studio Preview Service
Live preview server for web projects with auto-reload
"""
import os
import signal
import socket
import subprocess
import tempfile
import threading
import time
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
from collections import deque

logger = logging.getLogger(__name__)

PORT_RANGE_START = 5100
PORT_RANGE_END = 5199
MAX_LOG_LINES = 500

PREVIEW_CONFIGS = {
    'python': {
        'flask': 'python -m flask run --host=0.0.0.0 --port={port}',
        'fastapi': 'uvicorn main:app --host 0.0.0.0 --port {port} --reload',
        'default': 'python -m http.server {port}',
        'detect_files': {
            'app.py': 'flask',
            'main.py': 'fastapi',
        },
        'env': {'FLASK_APP': 'app.py', 'FLASK_ENV': 'development', 'FLASK_DEBUG': '1'}
    },
    'nodejs': {
        'vite': 'npx vite --host 0.0.0.0 --port {port}',
        'next': 'npx next dev -p {port}',
        'express': 'node index.js',
        'default': 'npx serve -l {port}',
        'detect_files': {
            'vite.config.js': 'vite',
            'vite.config.ts': 'vite',
            'next.config.js': 'next',
            'next.config.mjs': 'next',
        },
        'env': {'PORT': '{port}', 'HOST': '0.0.0.0'}
    },
    'typescript': {
        'vite': 'npx vite --host 0.0.0.0 --port {port}',
        'default': 'npx tsx watch index.ts',
        'detect_files': {
            'vite.config.ts': 'vite',
        },
        'env': {'PORT': '{port}'}
    },
    'html': {
        'default': 'python -m http.server {port}',
        'detect_files': {},
        'env': {}
    },
    'static': {
        'default': 'python -m http.server {port}',
        'detect_files': {},
        'env': {}
    }
}


class PreviewInstance:
    """Represents a running preview server instance"""
    
    def __init__(self, project_id: str, port: int, process: subprocess.Popen, temp_dir: str):
        self.project_id = project_id
        self.port = port
        self.process = process
        self.temp_dir = temp_dir
        self.started_at = datetime.utcnow()
        self.logs: deque = deque(maxlen=MAX_LOG_LINES)
        self.log_thread: Optional[threading.Thread] = None
        self.auto_reload = True
        self.watcher_thread: Optional[threading.Thread] = None
        self._stop_watcher = threading.Event()
    
    def add_log(self, line: str, level: str = 'info'):
        timestamp = datetime.utcnow().strftime('%H:%M:%S')
        self.logs.append({
            'timestamp': timestamp,
            'level': level,
            'message': line
        })
    
    def is_running(self) -> bool:
        return self.process.poll() is None
    
    def get_url(self, host: str = 'localhost') -> str:
        return f"http://{host}:{self.port}"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'project_id': self.project_id,
            'port': self.port,
            'started_at': self.started_at.isoformat(),
            'is_running': self.is_running(),
            'auto_reload': self.auto_reload,
            'log_count': len(self.logs)
        }


class PreviewService:
    """Live preview service for Nebula Studio projects"""
    
    def __init__(self):
        self.running_previews: Dict[str, PreviewInstance] = {}
        self.used_ports: set = set()
        self._lock = threading.Lock()
    
    def _is_port_available(self, port: int) -> bool:
        """Check if a port is available"""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                result = s.connect_ex(('localhost', port))
                return result != 0
        except Exception:
            return False
    
    def get_available_port(self) -> Optional[int]:
        """Get an available port in the preview range"""
        with self._lock:
            for port in range(PORT_RANGE_START, PORT_RANGE_END + 1):
                if port not in self.used_ports and self._is_port_available(port):
                    self.used_ports.add(port)
                    return port
        return None
    
    def release_port(self, port: int):
        """Release a port back to the pool"""
        with self._lock:
            self.used_ports.discard(port)
    
    def detect_framework(self, language: str, files: List[Dict[str, Any]]) -> str:
        """Detect the framework based on project files"""
        config = PREVIEW_CONFIGS.get(language.lower(), PREVIEW_CONFIGS.get('static'))
        detect_files = config.get('detect_files', {})
        
        file_names = {f.get('file_path', '').split('/')[-1] for f in files}
        
        for filename, framework in detect_files.items():
            if filename in file_names:
                return framework
        
        return 'default'
    
    def get_preview_command(self, language: str, framework: str, port: int) -> str:
        """Get the command to start the preview server"""
        config = PREVIEW_CONFIGS.get(language.lower(), PREVIEW_CONFIGS.get('static'))
        commands = {k: v for k, v in config.items() if k not in ('detect_files', 'env')}
        
        command_template = commands.get(framework, commands.get('default', 'python -m http.server {port}'))
        return command_template.format(port=port)
    
    def get_preview_env(self, language: str, port: int) -> Dict[str, str]:
        """Get environment variables for the preview server"""
        config = PREVIEW_CONFIGS.get(language.lower(), PREVIEW_CONFIGS.get('static'))
        env_template = config.get('env', {})
        
        env = os.environ.copy()
        for key, value in env_template.items():
            env[key] = str(value).format(port=port)
        
        return env
    
    def write_project_files(self, temp_dir: str, files: List[Dict[str, Any]]) -> None:
        """Write project files to temporary directory"""
        for file_info in files:
            file_path = os.path.join(temp_dir, file_info.get('file_path', 'unknown'))
            file_dir = os.path.dirname(file_path)
            
            if file_dir:
                os.makedirs(file_dir, exist_ok=True)
            
            content = file_info.get('content', '')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
    
    def _start_log_reader(self, instance: PreviewInstance):
        """Start a thread to read process output"""
        def read_logs():
            try:
                for line in iter(instance.process.stdout.readline, ''):
                    if not line:
                        break
                    line = line.rstrip()
                    level = 'info'
                    line_lower = line.lower()
                    if 'error' in line_lower or 'failed' in line_lower:
                        level = 'error'
                    elif 'warning' in line_lower or 'warn' in line_lower:
                        level = 'warning'
                    instance.add_log(line, level)
            except Exception as e:
                instance.add_log(f"Log reader error: {e}", 'error')
        
        thread = threading.Thread(target=read_logs, daemon=True)
        thread.start()
        instance.log_thread = thread
    
    def start_preview(
        self,
        project_id: str,
        language: str,
        files: List[Dict[str, Any]],
        auto_reload: bool = True
    ) -> Dict[str, Any]:
        """Start a preview server for a project"""
        if project_id in self.running_previews:
            existing = self.running_previews[project_id]
            if existing.is_running():
                return {
                    'success': True,
                    'message': 'Preview already running',
                    'port': existing.port,
                    'url': existing.get_url(),
                    'already_running': True
                }
            else:
                self.stop_preview(project_id)
        
        port = self.get_available_port()
        if not port:
            return {
                'success': False,
                'error': 'No available ports in range'
            }
        
        temp_dir = tempfile.mkdtemp(prefix=f"nebula_preview_{project_id[:8]}_")
        
        try:
            self.write_project_files(temp_dir, files)
            
            framework = self.detect_framework(language, files)
            command = self.get_preview_command(language, framework, port)
            env = self.get_preview_env(language, port)
            
            logger.info(f"Starting preview for project {project_id}: {command}")
            
            process = subprocess.Popen(
                command,
                shell=True,
                cwd=temp_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            instance = PreviewInstance(project_id, port, process, temp_dir)
            instance.auto_reload = auto_reload
            instance.add_log(f"Starting preview server on port {port}", 'info')
            instance.add_log(f"Command: {command}", 'info')
            instance.add_log(f"Framework detected: {framework}", 'info')
            
            self._start_log_reader(instance)
            
            self.running_previews[project_id] = instance
            
            time.sleep(1)
            
            if not instance.is_running():
                exit_code = process.poll()
                error_msg = f"Preview server exited immediately with code {exit_code}"
                instance.add_log(error_msg, 'error')
                self.stop_preview(project_id)
                return {
                    'success': False,
                    'error': error_msg
                }
            
            return {
                'success': True,
                'message': 'Preview started successfully',
                'port': port,
                'url': instance.get_url(),
                'framework': framework,
                'command': command
            }
            
        except Exception as e:
            logger.error(f"Error starting preview: {e}")
            self.release_port(port)
            if os.path.exists(temp_dir):
                import shutil
                shutil.rmtree(temp_dir, ignore_errors=True)
            return {
                'success': False,
                'error': str(e)
            }
    
    def stop_preview(self, project_id: str) -> Dict[str, Any]:
        """Stop a running preview server"""
        if project_id not in self.running_previews:
            return {
                'success': False,
                'error': 'No preview running for this project'
            }
        
        instance = self.running_previews[project_id]
        
        try:
            instance._stop_watcher.set()
            
            if instance.is_running():
                try:
                    if hasattr(os, 'killpg'):
                        os.killpg(os.getpgid(instance.process.pid), signal.SIGTERM)
                    else:
                        instance.process.terminate()
                except ProcessLookupError:
                    pass
                
                try:
                    instance.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    if hasattr(os, 'killpg'):
                        os.killpg(os.getpgid(instance.process.pid), signal.SIGKILL)
                    else:
                        instance.process.kill()
            
            self.release_port(instance.port)
            
            if instance.temp_dir and os.path.exists(instance.temp_dir):
                import shutil
                shutil.rmtree(instance.temp_dir, ignore_errors=True)
            
            del self.running_previews[project_id]
            
            logger.info(f"Stopped preview for project {project_id}")
            
            return {
                'success': True,
                'message': 'Preview stopped successfully'
            }
            
        except Exception as e:
            logger.error(f"Error stopping preview: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def get_status(self, project_id: str) -> Dict[str, Any]:
        """Get status of a preview server"""
        if project_id not in self.running_previews:
            return {
                'running': False,
                'exists': False
            }
        
        instance = self.running_previews[project_id]
        
        if not instance.is_running():
            self.stop_preview(project_id)
            return {
                'running': False,
                'exists': False,
                'stopped': True
            }
        
        return {
            'running': True,
            'exists': True,
            'port': instance.port,
            'url': instance.get_url(),
            'started_at': instance.started_at.isoformat(),
            'auto_reload': instance.auto_reload
        }
    
    def get_logs(self, project_id: str, limit: int = 100) -> Dict[str, Any]:
        """Get logs from a preview server"""
        if project_id not in self.running_previews:
            return {
                'success': False,
                'error': 'No preview running for this project',
                'logs': []
            }
        
        instance = self.running_previews[project_id]
        logs = list(instance.logs)[-limit:]
        
        return {
            'success': True,
            'logs': logs,
            'is_running': instance.is_running(),
            'port': instance.port
        }
    
    def health_check(self, project_id: str) -> Dict[str, Any]:
        """Check health of a preview server"""
        if project_id not in self.running_previews:
            return {
                'healthy': False,
                'reason': 'No preview running'
            }
        
        instance = self.running_previews[project_id]
        
        if not instance.is_running():
            return {
                'healthy': False,
                'reason': 'Process not running'
            }
        
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(2)
                result = s.connect_ex(('localhost', instance.port))
                if result == 0:
                    return {
                        'healthy': True,
                        'port': instance.port,
                        'uptime_seconds': (datetime.utcnow() - instance.started_at).total_seconds()
                    }
                else:
                    return {
                        'healthy': False,
                        'reason': 'Port not responding'
                    }
        except Exception as e:
            return {
                'healthy': False,
                'reason': str(e)
            }
    
    def update_files(self, project_id: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Update files for a running preview (triggers auto-reload)"""
        if project_id not in self.running_previews:
            return {
                'success': False,
                'error': 'No preview running for this project'
            }
        
        instance = self.running_previews[project_id]
        
        try:
            self.write_project_files(instance.temp_dir, files)
            instance.add_log("Files updated - auto-reload triggered", 'info')
            
            return {
                'success': True,
                'message': 'Files updated successfully'
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def restart_preview(self, project_id: str, language: str, files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Restart a preview server with fresh files"""
        auto_reload = True
        if project_id in self.running_previews:
            auto_reload = self.running_previews[project_id].auto_reload
        
        self.stop_preview(project_id)
        return self.start_preview(project_id, language, files, auto_reload)
    
    def list_running_previews(self) -> List[Dict[str, Any]]:
        """List all running preview servers"""
        previews = []
        for project_id, instance in list(self.running_previews.items()):
            if instance.is_running():
                previews.append({
                    'project_id': project_id,
                    'port': instance.port,
                    'url': instance.get_url(),
                    'started_at': instance.started_at.isoformat(),
                    'auto_reload': instance.auto_reload
                })
            else:
                self.stop_preview(project_id)
        
        return previews
    
    def cleanup_all(self):
        """Clean up all running previews"""
        for project_id in list(self.running_previews.keys()):
            self.stop_preview(project_id)
        logger.info("Cleaned up all preview servers")


preview_service = PreviewService()
