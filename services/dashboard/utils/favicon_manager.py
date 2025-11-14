"""
Favicon configuration persistence manager.
Handles loading and saving favicon metadata to ensure persistence across restarts.
"""
import os
import json
import logging
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

class FaviconManager:
    """Manages persistent storage of service favicon configurations."""
    
    def __init__(self, config_file: str = None):
        """
        Initialize the favicon manager.
        
        Args:
            config_file: Path to the favicon config JSON file. 
                        Defaults to dashboard/data/favicon_config.json
        """
        if config_file is None:
            # Store in dashboard/data directory
            dashboard_root = Path(__file__).parent.parent
            data_dir = dashboard_root / 'data'
            data_dir.mkdir(exist_ok=True)
            config_file = str(data_dir / 'favicon_config.json')
        
        self.config_file = config_file
        self._ensure_config_file()
    
    def _ensure_config_file(self):
        """Ensure the config file exists, creating it if necessary."""
        if not os.path.exists(self.config_file):
            logger.info(f"Creating favicon config file: {self.config_file}")
            self.save_favicons({})
    
    def load_favicons(self) -> Dict[str, str]:
        """
        Load favicon configuration from disk.
        
        Returns:
            Dictionary mapping service IDs to favicon filenames.
            Returns empty dict if file doesn't exist or is invalid.
        """
        try:
            with open(self.config_file, 'r') as f:
                favicons = json.load(f)
                logger.info(f"Loaded {len(favicons)} favicon configurations")
                return favicons
        except FileNotFoundError:
            logger.warning(f"Favicon config file not found: {self.config_file}")
            return {}
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in favicon config: {e}")
            return {}
        except Exception as e:
            logger.error(f"Error loading favicon config: {e}")
            return {}
    
    def save_favicons(self, favicons: Dict[str, str]):
        """
        Save favicon configuration to disk.
        
        Args:
            favicons: Dictionary mapping service IDs to favicon filenames
        """
        try:
            with open(self.config_file, 'w') as f:
                json.dump(favicons, f, indent=2)
            logger.info(f"Saved {len(favicons)} favicon configurations")
        except Exception as e:
            logger.error(f"Error saving favicon config: {e}")
            raise
    
    def set_favicon(self, service_id: str, filename: str):
        """
        Set the favicon for a specific service.
        
        Args:
            service_id: The service identifier
            filename: The favicon filename (not full path)
        """
        favicons = self.load_favicons()
        favicons[service_id] = filename
        self.save_favicons(favicons)
        logger.info(f"Set favicon for {service_id}: {filename}")
    
    def get_favicon(self, service_id: str) -> Optional[str]:
        """
        Get the favicon filename for a specific service.
        
        Args:
            service_id: The service identifier
            
        Returns:
            Favicon filename or None if not set
        """
        favicons = self.load_favicons()
        return favicons.get(service_id)
    
    def delete_favicon(self, service_id: str):
        """
        Remove the favicon configuration for a specific service.
        
        Args:
            service_id: The service identifier
        """
        favicons = self.load_favicons()
        if service_id in favicons:
            del favicons[service_id]
            self.save_favicons(favicons)
            logger.info(f"Deleted favicon for {service_id}")
    
    def get_all_favicons(self) -> Dict[str, str]:
        """
        Get all favicon configurations.
        
        Returns:
            Dictionary mapping service IDs to favicon filenames
        """
        return self.load_favicons()


# Global favicon manager instance
_favicon_manager = None

def get_favicon_manager() -> FaviconManager:
    """Get the global favicon manager instance."""
    global _favicon_manager
    if _favicon_manager is None:
        _favicon_manager = FaviconManager()
    return _favicon_manager
