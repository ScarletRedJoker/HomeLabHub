"""
Docker Compose File Manager
Programmatically manage docker-compose.unified.yml
"""

import yaml
import logging
import os
from typing import Dict, Any, Optional, List
from pathlib import Path

logger = logging.getLogger(__name__)


class ComposeManager:
    """Manage Docker Compose configuration files"""
    
    def __init__(self, compose_file_path: str = 'docker-compose.unified.yml'):
        self.compose_file_path = compose_file_path
        self.config: Dict[str, Any] = {}
        self.load_config()
    
    def load_config(self) -> Dict[str, Any]:
        """Load the current docker-compose configuration"""
        if not os.path.exists(self.compose_file_path):
            logger.warning(f"Compose file not found: {self.compose_file_path}")
            self.config = {'version': '3.8', 'services': {}, 'volumes': {}, 'networks': {}}
            return self.config
        
        try:
            with open(self.compose_file_path, 'r') as f:
                self.config = yaml.safe_load(f) or {}
            logger.info(f"Loaded compose file with {len(self.config.get('services', {}))} services")
            return self.config
        except Exception as e:
            logger.error(f"Error loading compose file: {e}")
            raise
    
    def serialize_state(self) -> str:
        """Serialize current in-memory state to YAML string"""
        return yaml.dump(self.config, default_flow_style=False, sort_keys=False)
    
    def load_from_string(self, yaml_content: str) -> bool:
        """Load configuration from YAML string into memory"""
        try:
            self.config = yaml.safe_load(yaml_content) or {}
            logger.info("Loaded compose config from string")
            return True
        except Exception as e:
            logger.error(f"Error loading compose from string: {e}")
            raise
    
    def write_to_file(self, file_path: str) -> bool:
        """Write current in-memory state to specified file path atomically"""
        try:
            # Write to temporary file first
            temp_path = f"{file_path}.tmp"
            with open(temp_path, 'w') as f:
                yaml.dump(self.config, f, default_flow_style=False, sort_keys=False)
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
            
            logger.info(f"Wrote compose config to {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error writing compose to {file_path}: {e}")
            raise
    
    def save_config(self) -> bool:
        """Save the current configuration to file"""
        try:
            # Create backup first
            if os.path.exists(self.compose_file_path):
                backup_path = f"{self.compose_file_path}.backup"
                with open(self.compose_file_path, 'r') as src:
                    with open(backup_path, 'w') as dst:
                        dst.write(src.read())
                logger.info(f"Created backup at {backup_path}")
            
            # Save new configuration
            with open(self.compose_file_path, 'w') as f:
                yaml.dump(self.config, f, default_flow_style=False, sort_keys=False)
            logger.info(f"Saved compose configuration to {self.compose_file_path}")
            return True
        except Exception as e:
            logger.error(f"Error saving compose file: {e}")
            raise
    
    def add_service(self, service_name: str, service_config: Dict[str, Any]) -> bool:
        """Add a new service to the compose file"""
        if 'services' not in self.config:
            self.config['services'] = {}
        
        if service_name in self.config['services']:
            logger.warning(f"Service {service_name} already exists")
            return False
        
        self.config['services'][service_name] = service_config
        logger.info(f"Added service: {service_name}")
        return True
    
    def update_service(self, service_name: str, service_config: Dict[str, Any]) -> bool:
        """Update an existing service configuration"""
        if 'services' not in self.config or service_name not in self.config['services']:
            logger.warning(f"Service {service_name} not found")
            return False
        
        self.config['services'][service_name] = service_config
        logger.info(f"Updated service: {service_name}")
        return True
    
    def remove_service(self, service_name: str) -> bool:
        """Remove a service from the compose file"""
        if 'services' not in self.config or service_name not in self.config['services']:
            logger.warning(f"Service {service_name} not found")
            return False
        
        del self.config['services'][service_name]
        logger.info(f"Removed service: {service_name}")
        return True
    
    def get_service(self, service_name: str) -> Optional[Dict[str, Any]]:
        """Get a service configuration"""
        if 'services' not in self.config:
            return None
        return self.config['services'].get(service_name)
    
    def list_services(self) -> List[str]:
        """List all service names"""
        if 'services' not in self.config:
            return []
        return list(self.config['services'].keys())
    
    def add_volume(self, volume_name: str, volume_config: Optional[Dict[str, Any]] = None) -> bool:
        """Add a named volume"""
        if 'volumes' not in self.config:
            self.config['volumes'] = {}
        
        if volume_name in self.config['volumes']:
            logger.warning(f"Volume {volume_name} already exists")
            return False
        
        self.config['volumes'][volume_name] = volume_config or {}
        logger.info(f"Added volume: {volume_name}")
        return True
    
    def add_network(self, network_name: str, network_config: Optional[Dict[str, Any]] = None) -> bool:
        """Add a named network"""
        if 'networks' not in self.config:
            self.config['networks'] = {}
        
        if network_name in self.config['networks']:
            logger.warning(f"Network {network_name} already exists")
            return False
        
        self.config['networks'][network_name] = network_config or {}
        logger.info(f"Added network: {network_name}")
        return True
    
    def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate the compose configuration"""
        try:
            if not isinstance(self.config, dict):
                return False, "Configuration must be a dictionary"
            
            if 'services' not in self.config:
                return False, "No services defined"
            
            if not isinstance(self.config['services'], dict):
                return False, "Services must be a dictionary"
            
            for service_name, service_config in self.config['services'].items():
                if not isinstance(service_config, dict):
                    return False, f"Service {service_name} configuration must be a dictionary"
                
                if 'image' not in service_config and 'build' not in service_config:
                    return False, f"Service {service_name} must have either 'image' or 'build'"
            
            return True, None
        except Exception as e:
            return False, str(e)
