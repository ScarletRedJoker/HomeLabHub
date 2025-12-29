"""
Nebula Studio Build Service
Multi-language build system with artifact management
"""
import os
import uuid
import shutil
import subprocess
import tempfile
import logging
import threading
import queue
from datetime import datetime
from typing import Optional, Dict, Any, Generator, List
from pathlib import Path
from enum import Enum

logger = logging.getLogger(__name__)

ARTIFACTS_BASE_PATH = "/opt/homelab/artifacts"


class BuildType(Enum):
    RUN = "run"
    BUILD = "build"
    TEST = "test"
    INSTALL = "install"


BUILD_CONFIGS = {
    'python': {
        'install': 'pip install -r requirements.txt',
        'run': 'python main.py',
        'build': 'pyinstaller --onefile main.py',
        'test': 'pytest',
        'entry_file': 'main.py',
        'deps_file': 'requirements.txt',
        'artifact_patterns': ['dist/*.exe', 'dist/*', '*.spec'],
        'build_dir': 'dist'
    },
    'nodejs': {
        'install': 'npm install',
        'run': 'node index.js',
        'build': 'npm run build',
        'test': 'npm test',
        'entry_file': 'index.js',
        'deps_file': 'package.json',
        'artifact_patterns': ['dist/*', 'build/*', 'node_modules/.bin/*'],
        'build_dir': 'dist'
    },
    'rust': {
        'install': 'cargo fetch',
        'run': 'cargo run',
        'build': 'cargo build --release',
        'test': 'cargo test',
        'entry_file': 'src/main.rs',
        'deps_file': 'Cargo.toml',
        'artifact_patterns': ['target/release/*'],
        'build_dir': 'target/release'
    },
    'cpp': {
        'install': 'cmake . -B build',
        'run': './build/main',
        'build': 'cmake --build build --config Release',
        'test': 'ctest --test-dir build',
        'entry_file': 'main.cpp',
        'deps_file': 'CMakeLists.txt',
        'artifact_patterns': ['build/*', '*.exe', 'a.out'],
        'build_dir': 'build',
        'simple_build': 'g++ -O2 -o main main.cpp'
    },
    'csharp': {
        'install': 'dotnet restore',
        'run': 'dotnet run',
        'build': 'dotnet build --configuration Release',
        'test': 'dotnet test',
        'entry_file': 'Program.cs',
        'deps_file': '*.csproj',
        'artifact_patterns': ['bin/Release/*', 'bin/Debug/*'],
        'build_dir': 'bin/Release'
    },
    'godot': {
        'install': 'echo "No install step for Godot"',
        'run': 'godot --path . --editor',
        'build': 'godot --headless --export-release "Linux/X11" export/game',
        'test': 'godot --headless --script res://tests/run_tests.gd',
        'entry_file': 'project.godot',
        'deps_file': 'project.godot',
        'artifact_patterns': ['export/*', '*.pck', '*.exe'],
        'build_dir': 'export'
    },
    'gdscript': {
        'install': 'echo "No install step for GDScript"',
        'run': 'godot --path . --editor',
        'build': 'godot --headless --export-release "Linux/X11" export/game',
        'test': 'godot --headless --script res://tests/run_tests.gd',
        'entry_file': 'project.godot',
        'deps_file': 'project.godot',
        'artifact_patterns': ['export/*', '*.pck', '*.exe'],
        'build_dir': 'export'
    },
    'typescript': {
        'install': 'npm install',
        'run': 'npx tsx index.ts',
        'build': 'npm run build',
        'test': 'npm test',
        'entry_file': 'index.ts',
        'deps_file': 'package.json',
        'artifact_patterns': ['dist/*', 'build/*'],
        'build_dir': 'dist'
    },
    'go': {
        'install': 'go mod download',
        'run': 'go run .',
        'build': 'go build -o app .',
        'test': 'go test ./...',
        'entry_file': 'main.go',
        'deps_file': 'go.mod',
        'artifact_patterns': ['app', '*.exe'],
        'build_dir': '.'
    },
    'bash': {
        'install': 'chmod +x *.sh',
        'run': './main.sh',
        'build': 'tar -czf scripts.tar.gz *.sh',
        'test': 'shellcheck *.sh',
        'entry_file': 'main.sh',
        'deps_file': 'main.sh',
        'artifact_patterns': ['*.tar.gz', '*.sh'],
        'build_dir': '.'
    },
    'electron': {
        'install': 'npm install',
        'run': 'npm start',
        'build': 'npm run build && npm run package',
        'test': 'npm test',
        'entry_file': 'main.js',
        'deps_file': 'package.json',
        'artifact_patterns': ['dist/*', 'out/*', 'release/*'],
        'build_dir': 'dist'
    },
    'tauri': {
        'install': 'npm install && cargo fetch',
        'run': 'npm run tauri dev',
        'build': 'npm run tauri build',
        'test': 'npm test',
        'entry_file': 'src-tauri/src/main.rs',
        'deps_file': 'package.json',
        'artifact_patterns': ['src-tauri/target/release/*', 'src-tauri/target/release/bundle/*'],
        'build_dir': 'src-tauri/target/release'
    },
    'unity': {
        'install': 'echo "Unity projects require Unity Editor"',
        'run': 'echo "Use Unity Editor to run"',
        'build': 'echo "Use Unity Editor to build"',
        'test': 'echo "Use Unity Test Runner"',
        'entry_file': 'Assets/Scripts/Main.cs',
        'deps_file': 'ProjectSettings/ProjectSettings.asset',
        'artifact_patterns': ['Build/*', '*.exe', '*.app'],
        'build_dir': 'Build'
    }
}


class BuildService:
    """Multi-language build service for Nebula Studio"""
    
    def __init__(self):
        self.active_builds: Dict[str, Dict[str, Any]] = {}
        self.build_queues: Dict[str, queue.Queue] = {}
        self._ensure_artifacts_dir()
    
    def _ensure_artifacts_dir(self):
        """Ensure artifacts base directory exists"""
        try:
            os.makedirs(ARTIFACTS_BASE_PATH, exist_ok=True)
        except PermissionError:
            alt_path = os.path.join(os.path.dirname(__file__), '..', 'var', 'artifacts')
            global ARTIFACTS_BASE_PATH
            ARTIFACTS_BASE_PATH = os.path.abspath(alt_path)
            os.makedirs(ARTIFACTS_BASE_PATH, exist_ok=True)
            logger.info(f"Using alternative artifacts path: {ARTIFACTS_BASE_PATH}")
    
    def get_build_config(self, language: str) -> Optional[Dict[str, str]]:
        """Get build configuration for a language"""
        return BUILD_CONFIGS.get(language.lower())
    
    def get_supported_languages(self) -> List[str]:
        """Get list of supported languages"""
        return list(BUILD_CONFIGS.keys())
    
    def get_artifact_path(self, project_id: str, build_id: str) -> str:
        """Get artifact storage path for a build"""
        return os.path.join(ARTIFACTS_BASE_PATH, project_id, build_id)
    
    def create_build_directory(self, project_id: str, build_id: str) -> str:
        """Create and return build directory path"""
        build_path = self.get_artifact_path(project_id, build_id)
        os.makedirs(build_path, exist_ok=True)
        return build_path
    
    def write_project_files(self, temp_dir: str, files: List[Dict[str, Any]]) -> None:
        """Write project files from database to temp directory"""
        for file_info in files:
            file_path = os.path.join(temp_dir, file_info['file_path'])
            file_dir = os.path.dirname(file_path)
            
            if file_dir:
                os.makedirs(file_dir, exist_ok=True)
            
            content = file_info.get('content', '')
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.debug(f"Wrote file: {file_path}")
    
    def execute_command(
        self,
        command: str,
        cwd: str,
        build_id: str,
        timeout: int = 300
    ) -> Generator[str, None, Dict[str, Any]]:
        """
        Execute a build command and yield log lines.
        Returns final status dict.
        """
        log_queue = queue.Queue()
        self.build_queues[build_id] = log_queue
        
        result = {
            'success': False,
            'exit_code': None,
            'output': '',
            'error': ''
        }
        
        def log_line(line: str, level: str = 'info'):
            timestamp = datetime.utcnow().strftime('%H:%M:%S')
            formatted = f"[{timestamp}] [{level.upper()}] {line}"
            log_queue.put(formatted)
            return formatted
        
        yield log_line(f"Executing: {command}")
        yield log_line(f"Working directory: {cwd}")
        yield log_line("-" * 50)
        
        try:
            process = subprocess.Popen(
                command,
                shell=True,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            self.active_builds[build_id] = {
                'process': process,
                'started_at': datetime.utcnow(),
                'command': command
            }
            
            output_lines = []
            for line in iter(process.stdout.readline, ''):
                if line:
                    line = line.rstrip()
                    output_lines.append(line)
                    
                    level = 'info'
                    line_lower = line.lower()
                    if 'error' in line_lower or 'failed' in line_lower:
                        level = 'error'
                    elif 'warning' in line_lower or 'warn' in line_lower:
                        level = 'warning'
                    elif 'success' in line_lower or 'passed' in line_lower or 'ok' in line_lower:
                        level = 'success'
                    
                    yield log_line(line, level)
            
            process.wait(timeout=timeout)
            result['exit_code'] = process.returncode
            result['output'] = '\n'.join(output_lines)
            result['success'] = process.returncode == 0
            
            yield log_line("-" * 50)
            if result['success']:
                yield log_line("Command completed successfully", 'success')
            else:
                yield log_line(f"Command failed with exit code {result['exit_code']}", 'error')
                
        except subprocess.TimeoutExpired:
            process.kill()
            result['error'] = f"Build timed out after {timeout} seconds"
            yield log_line(result['error'], 'error')
            
        except Exception as e:
            result['error'] = str(e)
            yield log_line(f"Build error: {e}", 'error')
            
        finally:
            if build_id in self.active_builds:
                del self.active_builds[build_id]
            if build_id in self.build_queues:
                del self.build_queues[build_id]
        
        return result
    
    def collect_artifacts(
        self,
        temp_dir: str,
        artifact_path: str,
        language: str
    ) -> List[str]:
        """Collect build artifacts from temp directory to artifact storage"""
        config = self.get_build_config(language)
        if not config:
            return []
        
        collected = []
        build_dir = os.path.join(temp_dir, config.get('build_dir', 'dist'))
        
        if os.path.exists(build_dir):
            for item in os.listdir(build_dir):
                src = os.path.join(build_dir, item)
                dst = os.path.join(artifact_path, item)
                
                if os.path.isfile(src):
                    shutil.copy2(src, dst)
                    collected.append(item)
                    logger.info(f"Collected artifact: {item}")
                elif os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                    collected.append(item)
        
        for pattern in config.get('artifact_patterns', []):
            import glob
            for match in glob.glob(os.path.join(temp_dir, pattern)):
                if os.path.isfile(match):
                    filename = os.path.basename(match)
                    if filename not in collected:
                        shutil.copy2(match, os.path.join(artifact_path, filename))
                        collected.append(filename)
        
        return collected
    
    def run_build(
        self,
        project_id: str,
        build_id: str,
        language: str,
        files: List[Dict[str, Any]],
        build_type: str = 'build'
    ) -> Generator[str, None, Dict[str, Any]]:
        """
        Run a complete build process.
        Yields log lines and returns final result.
        """
        config = self.get_build_config(language)
        if not config:
            yield f"[ERROR] Unsupported language: {language}"
            return {'success': False, 'error': f'Unsupported language: {language}'}
        
        artifact_path = self.create_build_directory(project_id, build_id)
        
        with tempfile.TemporaryDirectory(prefix=f"nebula_build_{build_id}_") as temp_dir:
            yield f"[INFO] Created temp directory: {temp_dir}"
            yield f"[INFO] Build ID: {build_id}"
            yield f"[INFO] Language: {language}"
            yield f"[INFO] Build type: {build_type}"
            yield ""
            
            yield "[INFO] Writing project files..."
            self.write_project_files(temp_dir, files)
            yield f"[SUCCESS] Wrote {len(files)} files"
            yield ""
            
            commands_to_run = []
            
            if build_type == 'install':
                commands_to_run.append(('install', config.get('install')))
            elif build_type == 'run':
                if config.get('install'):
                    commands_to_run.append(('install', config.get('install')))
                commands_to_run.append(('run', config.get('run')))
            elif build_type == 'build':
                if config.get('install'):
                    commands_to_run.append(('install', config.get('install')))
                commands_to_run.append(('build', config.get('build')))
            elif build_type == 'test':
                if config.get('install'):
                    commands_to_run.append(('install', config.get('install')))
                commands_to_run.append(('test', config.get('test')))
            
            final_result = {'success': True, 'artifacts': [], 'logs': []}
            
            for step_name, command in commands_to_run:
                if not command:
                    continue
                    
                yield f"[INFO] === Running {step_name.upper()} step ==="
                
                step_result = None
                for log_line in self.execute_command(command, temp_dir, build_id):
                    yield log_line
                    final_result['logs'].append(log_line)
                    if isinstance(log_line, dict):
                        step_result = log_line
                
                if step_result and not step_result.get('success', True):
                    final_result['success'] = False
                    final_result['error'] = step_result.get('error', 'Step failed')
                    yield f"[ERROR] {step_name} step failed"
                    return final_result
                
                yield ""
            
            if build_type == 'build' and final_result['success']:
                yield "[INFO] Collecting artifacts..."
                artifacts = self.collect_artifacts(temp_dir, artifact_path, language)
                final_result['artifacts'] = artifacts
                
                if artifacts:
                    yield f"[SUCCESS] Collected {len(artifacts)} artifacts:"
                    for artifact in artifacts:
                        yield f"  - {artifact}"
                else:
                    yield "[WARNING] No artifacts found"
                
                final_result['artifact_path'] = artifact_path
            
            yield ""
            yield "=" * 50
            if final_result['success']:
                yield "[SUCCESS] Build completed successfully!"
            else:
                yield "[ERROR] Build failed"
            yield "=" * 50
            
            return final_result
    
    def cancel_build(self, build_id: str) -> bool:
        """Cancel an active build"""
        if build_id in self.active_builds:
            build_info = self.active_builds[build_id]
            process = build_info.get('process')
            if process:
                process.terminate()
                logger.info(f"Cancelled build: {build_id}")
                return True
        return False
    
    def get_build_status(self, build_id: str) -> Optional[Dict[str, Any]]:
        """Get status of an active build"""
        if build_id in self.active_builds:
            build_info = self.active_builds[build_id]
            return {
                'active': True,
                'started_at': build_info['started_at'].isoformat(),
                'command': build_info['command']
            }
        return None
    
    def list_artifacts(self, project_id: str, build_id: str) -> List[Dict[str, Any]]:
        """List artifacts for a build"""
        artifact_path = self.get_artifact_path(project_id, build_id)
        
        if not os.path.exists(artifact_path):
            return []
        
        artifacts = []
        for item in os.listdir(artifact_path):
            item_path = os.path.join(artifact_path, item)
            stat = os.stat(item_path)
            
            artifacts.append({
                'name': item,
                'path': item_path,
                'size': stat.st_size,
                'is_file': os.path.isfile(item_path),
                'modified_at': datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
        
        return artifacts
    
    def get_artifact_file(self, project_id: str, build_id: str, filename: str) -> Optional[str]:
        """Get full path to an artifact file"""
        artifact_path = self.get_artifact_path(project_id, build_id)
        file_path = os.path.join(artifact_path, filename)
        
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return file_path
        return None
    
    def cleanup_old_builds(self, project_id: str, keep_count: int = 5) -> int:
        """Clean up old build artifacts, keeping only the most recent ones"""
        project_path = os.path.join(ARTIFACTS_BASE_PATH, project_id)
        
        if not os.path.exists(project_path):
            return 0
        
        builds = []
        for build_id in os.listdir(project_path):
            build_path = os.path.join(project_path, build_id)
            if os.path.isdir(build_path):
                stat = os.stat(build_path)
                builds.append((build_id, stat.st_mtime))
        
        builds.sort(key=lambda x: x[1], reverse=True)
        
        removed = 0
        for build_id, _ in builds[keep_count:]:
            build_path = os.path.join(project_path, build_id)
            shutil.rmtree(build_path)
            removed += 1
            logger.info(f"Cleaned up old build: {build_id}")
        
        return removed


build_service = BuildService()
