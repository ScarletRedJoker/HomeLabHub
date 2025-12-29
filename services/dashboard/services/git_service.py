"""
Git Service for Nebula Studio
Provides git operations using subprocess calls to git CLI
"""
import subprocess
import os
import shutil
import logging
import json
from typing import Optional, Dict, List, Tuple, Generator
from datetime import datetime

logger = logging.getLogger(__name__)


class GitService:
    """Service for git repository operations"""
    
    def __init__(self, workspace_base: str = '/tmp/studio_workspaces'):
        self.workspace_base = workspace_base
        os.makedirs(workspace_base, exist_ok=True)
    
    def _get_project_path(self, project_id: str) -> str:
        """Get the workspace path for a project"""
        return os.path.join(self.workspace_base, project_id)
    
    def _run_git(self, project_id: str, args: List[str], check: bool = True) -> Tuple[bool, str, str]:
        """Run a git command in the project directory"""
        project_path = self._get_project_path(project_id)
        
        try:
            result = subprocess.run(
                ['git'] + args,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            success = result.returncode == 0
            if not check or success:
                return success, result.stdout.strip(), result.stderr.strip()
            else:
                logger.error(f"Git command failed: git {' '.join(args)}\n{result.stderr}")
                return False, result.stdout.strip(), result.stderr.strip()
                
        except subprocess.TimeoutExpired:
            return False, '', 'Git command timed out'
        except FileNotFoundError:
            return False, '', 'Git is not installed'
        except Exception as e:
            return False, '', str(e)
    
    def init_repository(self, project_id: str, initial_branch: str = 'main') -> Tuple[bool, str]:
        """Initialize a new git repository"""
        project_path = self._get_project_path(project_id)
        os.makedirs(project_path, exist_ok=True)
        
        success, stdout, stderr = self._run_git(project_id, ['init', '-b', initial_branch], check=False)
        
        if success:
            self._run_git(project_id, ['config', 'user.email', 'studio@nebula.local'], check=False)
            self._run_git(project_id, ['config', 'user.name', 'Nebula Studio'], check=False)
            return True, f'Repository initialized on branch {initial_branch}'
        else:
            return False, stderr or 'Failed to initialize repository'
    
    def clone_repository(self, project_id: str, repo_url: str, branch: str = 'main', 
                         access_token: Optional[str] = None) -> Generator[str, None, Dict]:
        """Clone a repository with streaming output"""
        project_path = self._get_project_path(project_id)
        
        if os.path.exists(project_path):
            shutil.rmtree(project_path)
        os.makedirs(os.path.dirname(project_path), exist_ok=True)
        
        clone_url = repo_url
        if access_token and 'github.com' in repo_url:
            clone_url = repo_url.replace('https://', f'https://{access_token}@')
        elif access_token and 'gitlab.com' in repo_url:
            clone_url = repo_url.replace('https://', f'https://oauth2:{access_token}@')
        
        yield f"[INFO] Cloning repository from {repo_url}..."
        yield f"[INFO] Target branch: {branch}"
        
        try:
            result = subprocess.run(
                ['git', 'clone', '--branch', branch, '--single-branch', clone_url, project_path],
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                yield "[SUCCESS] Repository cloned successfully"
                
                self._run_git(project_id, ['config', 'user.email', 'studio@nebula.local'], check=False)
                self._run_git(project_id, ['config', 'user.name', 'Nebula Studio'], check=False)
                
                success, commit_hash, _ = self._run_git(project_id, ['rev-parse', 'HEAD'], check=False)
                
                return {
                    'success': True,
                    'commit': commit_hash if success else None,
                    'branch': branch
                }
            else:
                yield f"[ERROR] Clone failed: {result.stderr}"
                return {
                    'success': False,
                    'error': result.stderr
                }
                
        except subprocess.TimeoutExpired:
            yield "[ERROR] Clone operation timed out"
            return {'success': False, 'error': 'Clone operation timed out'}
        except Exception as e:
            yield f"[ERROR] Clone failed: {str(e)}"
            return {'success': False, 'error': str(e)}
    
    def get_status(self, project_id: str) -> Dict:
        """Get git status for a project"""
        project_path = self._get_project_path(project_id)
        
        if not os.path.exists(os.path.join(project_path, '.git')):
            return {
                'initialized': False,
                'error': 'Not a git repository'
            }
        
        success, branch_output, _ = self._run_git(project_id, ['branch', '--show-current'], check=False)
        current_branch = branch_output if success else 'unknown'
        
        success, commit_hash, _ = self._run_git(project_id, ['rev-parse', 'HEAD'], check=False)
        
        success, status_output, _ = self._run_git(project_id, ['status', '--porcelain'], check=False)
        
        changes = {'staged': [], 'unstaged': [], 'untracked': []}
        if status_output:
            for line in status_output.split('\n'):
                if not line:
                    continue
                status = line[:2]
                filename = line[3:]
                
                if status[0] != ' ' and status[0] != '?':
                    changes['staged'].append({'file': filename, 'status': status[0]})
                if status[1] != ' ' and status[1] != '?':
                    changes['unstaged'].append({'file': filename, 'status': status[1]})
                if status == '??':
                    changes['untracked'].append(filename)
        
        success, remote_output, _ = self._run_git(project_id, ['remote', '-v'], check=False)
        has_remote = bool(remote_output)
        
        remote_url = None
        if remote_output:
            for line in remote_output.split('\n'):
                if 'origin' in line and '(fetch)' in line:
                    parts = line.split()
                    if len(parts) >= 2:
                        remote_url = parts[1]
                    break
        
        ahead_behind = {'ahead': 0, 'behind': 0}
        if has_remote:
            success, ab_output, _ = self._run_git(project_id, 
                ['rev-list', '--left-right', '--count', f'HEAD...origin/{current_branch}'], 
                check=False)
            if success and ab_output:
                parts = ab_output.split()
                if len(parts) == 2:
                    ahead_behind['ahead'] = int(parts[0])
                    ahead_behind['behind'] = int(parts[1])
        
        return {
            'initialized': True,
            'branch': current_branch,
            'commit': commit_hash if success else None,
            'changes': changes,
            'has_remote': has_remote,
            'remote_url': remote_url,
            'ahead': ahead_behind['ahead'],
            'behind': ahead_behind['behind'],
            'clean': not any([changes['staged'], changes['unstaged'], changes['untracked']])
        }
    
    def get_diff(self, project_id: str, staged: bool = False) -> Tuple[bool, str]:
        """Get diff of changes"""
        args = ['diff']
        if staged:
            args.append('--cached')
        
        success, diff_output, stderr = self._run_git(project_id, args, check=False)
        return success, diff_output if success else stderr
    
    def add_files(self, project_id: str, files: Optional[List[str]] = None) -> Tuple[bool, str]:
        """Stage files for commit"""
        if files:
            args = ['add'] + files
        else:
            args = ['add', '-A']
        
        success, stdout, stderr = self._run_git(project_id, args, check=False)
        return success, 'Files staged successfully' if success else stderr
    
    def commit(self, project_id: str, message: str, author: Optional[str] = None) -> Tuple[bool, str, Optional[str]]:
        """Create a commit"""
        if not message:
            return False, 'Commit message is required', None
        
        self.add_files(project_id)
        
        args = ['commit', '-m', message]
        if author:
            args.extend(['--author', author])
        
        success, stdout, stderr = self._run_git(project_id, args, check=False)
        
        if success:
            _, commit_hash, _ = self._run_git(project_id, ['rev-parse', 'HEAD'], check=False)
            return True, 'Commit created successfully', commit_hash
        else:
            if 'nothing to commit' in stderr:
                return False, 'Nothing to commit', None
            return False, stderr, None
    
    def push(self, project_id: str, remote: str = 'origin', branch: Optional[str] = None,
             access_token: Optional[str] = None, set_upstream: bool = False) -> Generator[str, None, Dict]:
        """Push changes to remote"""
        yield "[INFO] Preparing to push..."
        
        if branch is None:
            success, branch, _ = self._run_git(project_id, ['branch', '--show-current'], check=False)
            if not success:
                branch = 'main'
        
        if access_token:
            success, remote_url, _ = self._run_git(project_id, ['remote', 'get-url', remote], check=False)
            if success and remote_url:
                if 'github.com' in remote_url:
                    auth_url = remote_url.replace('https://', f'https://{access_token}@')
                    self._run_git(project_id, ['remote', 'set-url', remote, auth_url], check=False)
        
        args = ['push']
        if set_upstream:
            args.extend(['-u', remote, branch])
        else:
            args.extend([remote, branch])
        
        yield f"[INFO] Pushing to {remote}/{branch}..."
        
        try:
            project_path = self._get_project_path(project_id)
            result = subprocess.run(
                ['git'] + args,
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                yield "[SUCCESS] Push completed successfully"
                return {'success': True, 'branch': branch}
            else:
                yield f"[ERROR] Push failed: {result.stderr}"
                return {'success': False, 'error': result.stderr}
                
        except subprocess.TimeoutExpired:
            yield "[ERROR] Push operation timed out"
            return {'success': False, 'error': 'Push operation timed out'}
        except Exception as e:
            yield f"[ERROR] Push failed: {str(e)}"
            return {'success': False, 'error': str(e)}
    
    def pull(self, project_id: str, remote: str = 'origin', branch: Optional[str] = None,
             access_token: Optional[str] = None) -> Generator[str, None, Dict]:
        """Pull changes from remote"""
        yield "[INFO] Fetching remote changes..."
        
        if branch is None:
            success, branch, _ = self._run_git(project_id, ['branch', '--show-current'], check=False)
            if not success:
                branch = 'main'
        
        if access_token:
            success, remote_url, _ = self._run_git(project_id, ['remote', 'get-url', remote], check=False)
            if success and remote_url:
                if 'github.com' in remote_url:
                    auth_url = remote_url.replace('https://', f'https://{access_token}@')
                    self._run_git(project_id, ['remote', 'set-url', remote, auth_url], check=False)
        
        yield f"[INFO] Pulling from {remote}/{branch}..."
        
        try:
            project_path = self._get_project_path(project_id)
            result = subprocess.run(
                ['git', 'pull', remote, branch],
                cwd=project_path,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                yield "[SUCCESS] Pull completed successfully"
                
                success, commit_hash, _ = self._run_git(project_id, ['rev-parse', 'HEAD'], check=False)
                return {'success': True, 'commit': commit_hash, 'branch': branch}
            else:
                yield f"[ERROR] Pull failed: {result.stderr}"
                return {'success': False, 'error': result.stderr}
                
        except subprocess.TimeoutExpired:
            yield "[ERROR] Pull operation timed out"
            return {'success': False, 'error': 'Pull operation timed out'}
        except Exception as e:
            yield f"[ERROR] Pull failed: {str(e)}"
            return {'success': False, 'error': str(e)}
    
    def get_log(self, project_id: str, limit: int = 50) -> Tuple[bool, List[Dict]]:
        """Get commit history"""
        format_str = '%H|%an|%ae|%at|%s'
        success, log_output, stderr = self._run_git(
            project_id, 
            ['log', f'--format={format_str}', f'-{limit}'],
            check=False
        )
        
        if not success:
            return False, []
        
        commits = []
        for line in log_output.split('\n'):
            if not line:
                continue
            parts = line.split('|', 4)
            if len(parts) == 5:
                commits.append({
                    'hash': parts[0],
                    'author': parts[1],
                    'email': parts[2],
                    'timestamp': int(parts[3]),
                    'date': datetime.fromtimestamp(int(parts[3])).isoformat(),
                    'message': parts[4]
                })
        
        return True, commits
    
    def get_branches(self, project_id: str) -> Tuple[bool, List[Dict]]:
        """Get list of branches"""
        success, branch_output, stderr = self._run_git(
            project_id, 
            ['branch', '-a', '--format=%(refname:short)|%(objectname:short)|%(upstream:short)'],
            check=False
        )
        
        if not success:
            return False, []
        
        success, current_branch, _ = self._run_git(project_id, ['branch', '--show-current'], check=False)
        
        branches = []
        for line in branch_output.split('\n'):
            if not line or 'HEAD' in line:
                continue
            parts = line.split('|')
            name = parts[0]
            branches.append({
                'name': name,
                'short_commit': parts[1] if len(parts) > 1 else '',
                'upstream': parts[2] if len(parts) > 2 else '',
                'current': name == current_branch,
                'remote': name.startswith('remotes/') or name.startswith('origin/')
            })
        
        return True, branches
    
    def checkout_branch(self, project_id: str, branch: str, create: bool = False) -> Tuple[bool, str]:
        """Checkout a branch"""
        if create:
            args = ['checkout', '-b', branch]
        else:
            args = ['checkout', branch]
        
        success, stdout, stderr = self._run_git(project_id, args, check=False)
        return success, f'Switched to branch {branch}' if success else stderr
    
    def create_branch(self, project_id: str, branch_name: str) -> Tuple[bool, str]:
        """Create a new branch"""
        success, stdout, stderr = self._run_git(project_id, ['branch', branch_name], check=False)
        return success, f'Branch {branch_name} created' if success else stderr
    
    def set_remote(self, project_id: str, url: str, name: str = 'origin') -> Tuple[bool, str]:
        """Set or update remote URL"""
        success, _, _ = self._run_git(project_id, ['remote', 'get-url', name], check=False)
        
        if success:
            s, stdout, stderr = self._run_git(project_id, ['remote', 'set-url', name, url], check=False)
        else:
            s, stdout, stderr = self._run_git(project_id, ['remote', 'add', name, url], check=False)
        
        return s, f'Remote {name} set to {url}' if s else stderr
    
    def write_file(self, project_id: str, file_path: str, content: str) -> bool:
        """Write a file to the project workspace"""
        project_path = self._get_project_path(project_id)
        full_path = os.path.join(project_path, file_path)
        
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        try:
            with open(full_path, 'w') as f:
                f.write(content)
            return True
        except Exception as e:
            logger.error(f"Failed to write file: {e}")
            return False
    
    def read_file(self, project_id: str, file_path: str) -> Optional[str]:
        """Read a file from the project workspace"""
        project_path = self._get_project_path(project_id)
        full_path = os.path.join(project_path, file_path)
        
        try:
            with open(full_path, 'r') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to read file: {e}")
            return None
    
    def sync_files_to_workspace(self, project_id: str, files: List[Dict]) -> bool:
        """Sync files from database to workspace"""
        project_path = self._get_project_path(project_id)
        os.makedirs(project_path, exist_ok=True)
        
        for file_data in files:
            file_path = file_data.get('file_path', '')
            content = file_data.get('content', '')
            
            if file_path:
                self.write_file(project_id, file_path, content)
        
        return True
    
    def get_workspace_files(self, project_id: str) -> List[str]:
        """Get list of files in workspace"""
        project_path = self._get_project_path(project_id)
        
        if not os.path.exists(project_path):
            return []
        
        files = []
        for root, dirs, filenames in os.walk(project_path):
            dirs[:] = [d for d in dirs if d != '.git']
            
            for filename in filenames:
                rel_path = os.path.relpath(os.path.join(root, filename), project_path)
                files.append(rel_path)
        
        return files


git_service = GitService()
