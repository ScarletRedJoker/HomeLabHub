"""
Jarvis Codebase Service
Gives Jarvis direct access to browse, read, edit, and understand the HomeLabHub codebase
"""

import os
import re
import json
import logging
import subprocess
from typing import Dict, Any, Optional, List
from pathlib import Path
from datetime import datetime

logger = logging.getLogger(__name__)

PROJECT_ROOT = os.environ.get('HOMELAB_PROJECT_ROOT', '/project')

PROTECTED_PATHS = [
    '.env',
    '.git',
    'secrets',
    'credentials',
    '__pycache__',
    'node_modules',
    '.venv',
    'venv',
]

EDITABLE_EXTENSIONS = [
    '.py', '.js', '.ts', '.jsx', '.tsx',
    '.html', '.css', '.scss', '.less',
    '.json', '.yaml', '.yml', '.toml',
    '.md', '.txt', '.sh', '.bash',
    '.sql', '.dockerfile', '.env.example',
]

MAX_FILE_SIZE = 1024 * 1024


class JarvisCodebaseService:
    """
    Service for Jarvis to directly access and modify the HomeLabHub codebase
    """
    
    def __init__(self, project_root: Optional[str] = None):
        self.project_root = Path(project_root or PROJECT_ROOT)
        self.enabled = self.project_root.exists()
        
        if not self.enabled:
            logger.warning(f"Codebase access disabled - project root not found: {self.project_root}")
        else:
            logger.info(f"Jarvis Codebase Service initialized at {self.project_root}")
    
    def _is_path_safe(self, path: str, for_write: bool = False) -> tuple[bool, str]:
        """Check if a path is safe to access"""
        try:
            if '..' in path or path.startswith('/'):
                return False, "Invalid path format"
            
            target = self.project_root / path
            resolved = target.resolve()
            project_resolved = self.project_root.resolve()
            
            if not str(resolved).startswith(str(project_resolved) + os.sep) and resolved != project_resolved:
                return False, "Path traversal attempt detected"
            
            if target.is_symlink():
                return False, "Symlinks are not allowed"
            
            path_parts = Path(path).parts
            for protected in PROTECTED_PATHS:
                if protected in path_parts:
                    if protected == '.env' and path.endswith('.env.example'):
                        continue
                    return False, f"Access to {protected} is restricted"
            
            if for_write:
                parent_resolved = resolved.parent.resolve()
                if not str(parent_resolved).startswith(str(project_resolved) + os.sep) and parent_resolved != project_resolved:
                    return False, "Cannot write to parent directory outside project"
                
                for protected in PROTECTED_PATHS:
                    if protected in Path(path).parent.parts:
                        return False, f"Cannot write to protected directory: {protected}"
            
            return True, "OK"
        except Exception as e:
            return False, str(e)
    
    def _is_editable(self, path: str) -> bool:
        """Check if a file type is editable"""
        return any(path.lower().endswith(ext) for ext in EDITABLE_EXTENSIONS)
    
    def get_project_structure(self, max_depth: int = 3, path: str = "") -> Dict[str, Any]:
        """Get the project directory structure"""
        if not self.enabled:
            return {'error': 'Codebase access not available'}
        
        safe, reason = self._is_path_safe(path)
        if not safe:
            return {'error': reason}
        
        base_path = self.project_root / path if path else self.project_root
        
        def build_tree(current_path: Path, depth: int) -> Dict[str, Any]:
            if depth > max_depth:
                return {'truncated': True}
            
            result: Dict[str, Any] = {
                'name': current_path.name or str(self.project_root),
                'type': 'directory' if current_path.is_dir() else 'file',
                'path': str(current_path.relative_to(self.project_root)),
            }
            
            if current_path.is_dir():
                children = []
                try:
                    for item in sorted(current_path.iterdir()):
                        if item.name.startswith('.') and item.name not in ['.gitignore', '.env.example']:
                            continue
                        if item.name in ['node_modules', '__pycache__', 'venv', '.venv', '.git']:
                            continue
                        
                        children.append(build_tree(item, depth + 1))
                except PermissionError:
                    result['error'] = 'Permission denied'
                
                result['children'] = children
            else:
                result['size'] = current_path.stat().st_size if current_path.exists() else 0
                result['editable'] = self._is_editable(str(current_path))
            
            return result
        
        return build_tree(base_path, 0)
    
    def list_files(self, path: str = "", pattern: Optional[str] = None) -> List[Dict[str, Any]]:
        """List files in a directory, optionally filtered by pattern"""
        if not self.enabled:
            return []
        
        safe, reason = self._is_path_safe(path)
        if not safe:
            return [{'error': reason}]
        
        base_path = self.project_root / path if path else self.project_root
        
        if not base_path.is_dir():
            return [{'error': 'Not a directory'}]
        
        files = []
        for item in sorted(base_path.iterdir()):
            if item.name.startswith('.') and item.name not in ['.gitignore', '.env.example']:
                continue
            if item.name in ['node_modules', '__pycache__', 'venv', '.venv', '.git']:
                continue
            
            if pattern and not re.search(pattern, item.name, re.IGNORECASE):
                continue
            
            files.append({
                'name': item.name,
                'path': str(item.relative_to(self.project_root)),
                'type': 'directory' if item.is_dir() else 'file',
                'size': item.stat().st_size if item.is_file() else None,
                'modified': datetime.fromtimestamp(item.stat().st_mtime).isoformat(),
                'editable': self._is_editable(item.name) if item.is_file() else False,
            })
        
        return files
    
    def read_file(self, path: str, max_lines: Optional[int] = None) -> Dict[str, Any]:
        """Read a file from the codebase"""
        if not self.enabled:
            return {'success': False, 'error': 'Codebase access not available'}
        
        safe, reason = self._is_path_safe(path)
        if not safe:
            return {'success': False, 'error': reason}
        
        file_path = self.project_root / path
        
        if not file_path.exists():
            return {'success': False, 'error': f'File not found: {path}'}
        
        if not file_path.is_file():
            return {'success': False, 'error': f'Not a file: {path}'}
        
        if file_path.stat().st_size > MAX_FILE_SIZE:
            return {'success': False, 'error': f'File too large (max {MAX_FILE_SIZE // 1024}KB)'}
        
        try:
            content = file_path.read_text(encoding='utf-8', errors='replace')
            
            lines = content.split('\n')
            total_lines = len(lines)
            
            if max_lines and len(lines) > max_lines:
                content = '\n'.join(lines[:max_lines])
                truncated = True
            else:
                truncated = False
            
            return {
                'success': True,
                'path': path,
                'content': content,
                'lines': min(total_lines, max_lines) if max_lines else total_lines,
                'total_lines': total_lines,
                'truncated': truncated,
                'size': file_path.stat().st_size,
                'editable': self._is_editable(path),
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def write_file(self, path: str, content: str, create_backup: bool = True) -> Dict[str, Any]:
        """Write content to a file in the codebase"""
        if not self.enabled:
            return {'success': False, 'error': 'Codebase access not available'}
        
        safe, reason = self._is_path_safe(path, for_write=True)
        if not safe:
            return {'success': False, 'error': reason}
        
        if not self._is_editable(path):
            return {'success': False, 'error': f'File type not editable: {path}'}
        
        if '\x00' in content:
            return {'success': False, 'error': 'Binary content not allowed'}
        
        file_path = self.project_root / path
        
        try:
            if create_backup and file_path.exists():
                backup_path = file_path.with_suffix(file_path.suffix + '.jarvis-backup')
                backup_path.write_text(file_path.read_text())
            
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content)
            
            return {
                'success': True,
                'path': path,
                'size': len(content),
                'lines': content.count('\n') + 1,
                'backup_created': create_backup and file_path.exists(),
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def edit_file(self, path: str, old_text: str, new_text: str) -> Dict[str, Any]:
        """Replace specific text in a file"""
        read_result = self.read_file(path)
        if not read_result.get('success'):
            return read_result
        
        content = read_result['content']
        
        if old_text not in content:
            return {
                'success': False,
                'error': 'Text to replace not found in file',
                'path': path
            }
        
        count = content.count(old_text)
        new_content = content.replace(old_text, new_text, 1)
        
        write_result = self.write_file(path, new_content)
        if write_result.get('success'):
            write_result['replacements'] = 1
            write_result['total_matches'] = count
        
        return write_result
    
    def search_code(self, pattern: str, path: str = "", file_pattern: Optional[str] = None, max_results: int = 50) -> List[Dict[str, Any]]:
        """Search for a pattern in the codebase using grep"""
        if not self.enabled:
            return [{'error': 'Codebase access not available'}]
        
        safe, reason = self._is_path_safe(path)
        if not safe:
            return [{'error': reason}]
        
        search_path = self.project_root / path if path else self.project_root
        
        try:
            cmd = ['grep', '-rn', '--include=*.py', '--include=*.js', '--include=*.ts', 
                   '--include=*.jsx', '--include=*.tsx', '--include=*.html', '--include=*.css',
                   '--include=*.json', '--include=*.yaml', '--include=*.yml', '--include=*.md']
            
            if file_pattern:
                cmd = ['grep', '-rn', f'--include={file_pattern}']
            
            cmd.extend([
                '--exclude-dir=node_modules', '--exclude-dir=__pycache__',
                '--exclude-dir=venv', '--exclude-dir=.venv', '--exclude-dir=.git',
                '-E', pattern, str(search_path)
            ])
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            matches = []
            for line in result.stdout.strip().split('\n')[:max_results]:
                if not line:
                    continue
                
                parts = line.split(':', 2)
                if len(parts) >= 3:
                    file_path = parts[0]
                    try:
                        rel_path = str(Path(file_path).relative_to(self.project_root))
                    except ValueError:
                        rel_path = file_path
                    
                    matches.append({
                        'path': rel_path,
                        'line': int(parts[1]),
                        'content': parts[2].strip(),
                    })
            
            return matches
        except subprocess.TimeoutExpired:
            return [{'error': 'Search timed out'}]
        except Exception as e:
            return [{'error': str(e)}]
    
    def get_file_context(self, path: str, line: int, context_lines: int = 5) -> Dict[str, Any]:
        """Get lines around a specific line number for context"""
        read_result = self.read_file(path)
        if not read_result.get('success'):
            return read_result
        
        lines = read_result['content'].split('\n')
        
        start = max(0, line - context_lines - 1)
        end = min(len(lines), line + context_lines)
        
        context = []
        for i in range(start, end):
            context.append({
                'line': i + 1,
                'content': lines[i],
                'highlight': i + 1 == line
            })
        
        return {
            'success': True,
            'path': path,
            'target_line': line,
            'context': context,
            'start_line': start + 1,
            'end_line': end,
        }
    
    def get_project_summary(self) -> Dict[str, Any]:
        """Get a summary of the project for AI context"""
        if not self.enabled:
            return {'error': 'Codebase access not available'}
        
        replit_md = self.project_root / 'replit.md'
        readme = self.project_root / 'README.md'
        
        summary = {
            'project_root': str(self.project_root),
            'enabled': self.enabled,
        }
        
        if replit_md.exists():
            summary['project_docs'] = replit_md.read_text()[:10000]
        elif readme.exists():
            summary['project_docs'] = readme.read_text()[:10000]
        
        file_counts = {}
        total_lines = 0
        
        for ext in ['.py', '.js', '.ts', '.html', '.css', '.json', '.yaml', '.md']:
            count = len(list(self.project_root.rglob(f'*{ext}')))
            if count > 0:
                file_counts[ext] = count
        
        summary['file_counts'] = file_counts
        
        services_dir = self.project_root / 'services'
        if services_dir.exists():
            summary['services'] = [d.name for d in services_dir.iterdir() if d.is_dir()]
        
        return summary
    
    def create_file(self, path: str, content: str = "") -> Dict[str, Any]:
        """Create a new file"""
        if not self.enabled:
            return {'success': False, 'error': 'Codebase access not available'}
        
        safe, reason = self._is_path_safe(path)
        if not safe:
            return {'success': False, 'error': reason}
        
        file_path = self.project_root / path
        
        if file_path.exists():
            return {'success': False, 'error': f'File already exists: {path}'}
        
        return self.write_file(path, content, create_backup=False)
    
    def delete_file(self, path: str) -> Dict[str, Any]:
        """Delete a file (moves to .jarvis-trash)"""
        if not self.enabled:
            return {'success': False, 'error': 'Codebase access not available'}
        
        safe, reason = self._is_path_safe(path)
        if not safe:
            return {'success': False, 'error': reason}
        
        file_path = self.project_root / path
        
        if not file_path.exists():
            return {'success': False, 'error': f'File not found: {path}'}
        
        try:
            trash_dir = self.project_root / '.jarvis-trash'
            trash_dir.mkdir(exist_ok=True)
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            trash_path = trash_dir / f"{file_path.name}.{timestamp}"
            
            file_path.rename(trash_path)
            
            return {
                'success': True,
                'path': path,
                'moved_to': str(trash_path.relative_to(self.project_root)),
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def get_git_status(self) -> Dict[str, Any]:
        """Get git status of the project"""
        if not self.enabled:
            return {'error': 'Codebase access not available'}
        
        try:
            result = subprocess.run(
                ['git', 'status', '--porcelain'],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            changes = []
            for line in result.stdout.strip().split('\n'):
                if line:
                    status = line[:2]
                    path = line[3:]
                    changes.append({'status': status.strip(), 'path': path})
            
            branch_result = subprocess.run(
                ['git', 'branch', '--show-current'],
                cwd=self.project_root,
                capture_output=True,
                text=True,
                timeout=5
            )
            
            return {
                'success': True,
                'branch': branch_result.stdout.strip(),
                'changes': changes,
                'has_changes': len(changes) > 0,
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}


jarvis_codebase = JarvisCodebaseService()
