"""
Environment Variable Manager
Safely manage .env file for Docker Compose
"""

import logging
import os
import secrets
from typing import Dict, List, Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)


class EnvManager:
    """Manage environment variables in .env file"""
    
    def __init__(self, env_file_path: str = '.env'):
        self.env_file_path = env_file_path
        self.variables: Dict[str, str] = {}
        self.comments: Dict[str, str] = {}  # Store comments for each variable
        self.load_env()
    
    def load_env(self) -> Dict[str, str]:
        """Load environment variables from .env file"""
        if not os.path.exists(self.env_file_path):
            logger.warning(f".env file not found: {self.env_file_path}")
            self.variables = {}
            return self.variables
        
        try:
            with open(self.env_file_path, 'r') as f:
                lines = f.readlines()
            
            self.variables = {}
            self.comments = {}
            current_comment = []
            
            for line in lines:
                line = line.rstrip()
                
                # Handle comments
                if line.startswith('#') or not line.strip():
                    if line.startswith('#'):
                        current_comment.append(line)
                    continue
                
                # Parse variable
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    
                    self.variables[key] = value
                    
                    if current_comment:
                        self.comments[key] = '\n'.join(current_comment)
                        current_comment = []
            
            logger.info(f"Loaded {len(self.variables)} environment variables")
            return self.variables
        except Exception as e:
            logger.error(f"Error loading .env file: {e}")
            raise
    
    def serialize_state(self) -> str:
        """Serialize current in-memory state to .env format string"""
        lines = []
        lines.append("# Homelab Environment Variables")
        lines.append("# Auto-generated and managed by Homelab Dashboard\n")
        
        # Group variables by service (based on prefix)
        groups = {}
        for key in sorted(self.variables.keys()):
            prefix = key.split('_')[0] if '_' in key else 'GENERAL'
            if prefix not in groups:
                groups[prefix] = []
            groups[prefix].append(key)
        
        # Write grouped variables
        for group, keys in sorted(groups.items()):
            lines.append(f"\n# {group} Configuration")
            for key in keys:
                # Write comment if exists
                if key in self.comments:
                    lines.append(self.comments[key])
                
                value = self.variables[key]
                # Quote values with spaces
                if ' ' in value or '"' in value:
                    value = f'"{value}"'
                lines.append(f"{key}={value}")
        
        return '\n'.join(lines)
    
    def load_from_string(self, env_content: str) -> bool:
        """Load environment variables from string into memory"""
        try:
            self.variables = {}
            self.comments = {}
            current_comment = []
            
            for line in env_content.split('\n'):
                line = line.rstrip()
                
                # Handle comments
                if line.startswith('#') or not line.strip():
                    if line.startswith('#'):
                        current_comment.append(line)
                    continue
                
                # Parse variable
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    
                    # Remove quotes if present
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    
                    self.variables[key] = value
                    
                    if current_comment:
                        self.comments[key] = '\n'.join(current_comment)
                        current_comment = []
            
            logger.info(f"Loaded {len(self.variables)} environment variables from string")
            return True
        except Exception as e:
            logger.error(f"Error loading env from string: {e}")
            raise
    
    def write_to_file(self, file_path: str) -> bool:
        """Write current in-memory state to specified file path atomically"""
        try:
            # Write to temporary file first
            temp_path = f"{file_path}.tmp"
            with open(temp_path, 'w') as f:
                f.write(self.serialize_state())
                f.flush()
                os.fsync(f.fileno())
            
            # Atomically replace original
            os.replace(temp_path, file_path)
            
            # Fsync directory to ensure rename is persisted
            dir_fd = os.open(os.path.dirname(file_path) or '.', os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
            
            logger.info(f"Wrote env config to {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error writing env to {file_path}: {e}")
            raise
    
    def save_env(self) -> bool:
        """Save environment variables to .env file"""
        try:
            # Create backup first
            if os.path.exists(self.env_file_path):
                backup_path = f"{self.env_file_path}.backup"
                with open(self.env_file_path, 'r') as src:
                    with open(backup_path, 'w') as dst:
                        dst.write(src.read())
                logger.info(f"Created backup at {backup_path}")
            
            # Write new .env file
            with open(self.env_file_path, 'w') as f:
                f.write(self.serialize_state())
            
            logger.info(f"Saved {len(self.variables)} environment variables to {self.env_file_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving .env file: {e}")
            raise
    
    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get an environment variable value"""
        return self.variables.get(key, default)
    
    def set(self, key: str, value: str, comment: Optional[str] = None) -> bool:
        """Set an environment variable"""
        self.variables[key] = value
        if comment:
            self.comments[key] = f"# {comment}"
        logger.info(f"Set variable: {key}")
        return True
    
    def delete(self, key: str) -> bool:
        """Delete an environment variable"""
        if key in self.variables:
            del self.variables[key]
            if key in self.comments:
                del self.comments[key]
            logger.info(f"Deleted variable: {key}")
            return True
        else:
            logger.warning(f"Variable {key} not found")
            return False
    
    def list_variables(self, prefix: Optional[str] = None) -> Dict[str, str]:
        """List all variables, optionally filtered by prefix"""
        if prefix:
            return {k: v for k, v in self.variables.items() if k.startswith(prefix)}
        return self.variables.copy()
    
    def generate_secret(self, key: str, length: int = 32) -> str:
        """Generate a secure random secret and store it"""
        secret = secrets.token_urlsafe(length)
        self.set(key, secret, comment=f"Auto-generated secret")
        return secret
    
    def bulk_set(self, variables: Dict[str, str]) -> bool:
        """Set multiple variables at once"""
        for key, value in variables.items():
            self.variables[key] = value
        logger.info(f"Set {len(variables)} variables in bulk")
        return True
    
    def validate_required(self, required_vars: List[str]) -> Tuple[bool, List[str]]:
        """Check if all required variables are set"""
        missing = [var for var in required_vars if var not in self.variables or not self.variables[var]]
        return len(missing) == 0, missing
