"""Home Assistant Integration Service with Health Checks and Auto-Reconnection"""
import requests
import logging
import os
import time
import threading
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from collections import deque
from enum import Enum
import urllib3

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """Connection state enum"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    RECONNECTING = "reconnecting"
    FAILED = "failed"


class QueuedCommand:
    """Represents a queued command to be executed when connection is restored"""
    def __init__(self, method: str, endpoint: str, **kwargs):
        self.method = method
        self.endpoint = endpoint
        self.kwargs = kwargs
        self.timestamp = datetime.utcnow()
        self.retries = 0


class HomeAssistantService:
    """Service for integrating with Home Assistant API with health checks and auto-reconnection"""
    
    def __init__(self, base_url: Optional[str] = None, access_token: Optional[str] = None):
        """
        Initialize Home Assistant service
        
        Args:
            base_url: Home Assistant URL (e.g., http://homeassistant:8123)
            access_token: Long-lived access token for Home Assistant
        """
        self.base_url = base_url or os.environ.get('HOME_ASSISTANT_URL', 'http://homeassistant:8123')
        self.access_token = access_token or os.environ.get('HOME_ASSISTANT_TOKEN')
        
        self.verify_ssl = os.environ.get('HOME_ASSISTANT_VERIFY_SSL', 'False').lower() == 'true'
        self.timeout_connect = int(os.environ.get('HOME_ASSISTANT_TIMEOUT_CONNECT', '10'))
        self.timeout_read = int(os.environ.get('HOME_ASSISTANT_TIMEOUT_READ', '30'))
        self.health_check_interval = int(os.environ.get('HOME_ASSISTANT_HEALTH_CHECK_INTERVAL', '300'))
        self.max_retries = int(os.environ.get('HOME_ASSISTANT_MAX_RETRIES', '3'))
        
        self.enabled = bool(self.access_token)
        self.connection_state = ConnectionState.DISCONNECTED
        self.last_health_check = None
        self.last_error = None
        self.consecutive_failures = 0
        
        self.command_queue: deque = deque(maxlen=100)
        self.health_check_thread = None
        self._stop_health_check = threading.Event()
        
        if not self.verify_ssl:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        
        if not self.enabled:
            logger.warning("╔══════════════════════════════════════════════════════════════╗")
            logger.warning("║ Home Assistant Service - DISABLED                            ║")
            logger.warning("╠══════════════════════════════════════════════════════════════╣")
            logger.warning("║ No access token configured                                   ║")
            logger.warning("║                                                              ║")
            logger.warning("║ To enable Home Assistant integration:                        ║")
            logger.warning("║   1. Set HOME_ASSISTANT_URL (e.g., https://home.example.com) ║")
            logger.warning("║   2. Set HOME_ASSISTANT_TOKEN (long-lived access token)      ║")
            logger.warning("║                                                              ║")
            logger.warning("║ Optional settings:                                           ║")
            logger.warning("║   - HOME_ASSISTANT_VERIFY_SSL=False (default for internal)   ║")
            logger.warning("║   - HOME_ASSISTANT_TIMEOUT_CONNECT=10 (seconds)              ║")
            logger.warning("║   - HOME_ASSISTANT_TIMEOUT_READ=30 (seconds)                 ║")
            logger.warning("║   - HOME_ASSISTANT_HEALTH_CHECK_INTERVAL=300 (5 minutes)     ║")
            logger.warning("╚══════════════════════════════════════════════════════════════╝")
        else:
            logger.info("╔══════════════════════════════════════════════════════════════╗")
            logger.info("║ Home Assistant Service - INITIALIZING                        ║")
            logger.info("╠══════════════════════════════════════════════════════════════╣")
            logger.info(f"║ URL: {self.base_url:<54} ║")
            token_display = '****'
            if self.access_token and len(self.access_token) >= 4:
                token_display = '*' * 10 + self.access_token[-4:]
            logger.info(f"║ Token: {token_display:<48} ║")
            logger.info(f"║ SSL Verification: {str(self.verify_ssl):<43} ║")
            logger.info(f"║ Timeout: {self.timeout_connect}s connect / {self.timeout_read}s read{' ' * 28} ║")
            logger.info(f"║ Health Check Interval: {self.health_check_interval}s{' ' * 35} ║")
            logger.info("╚══════════════════════════════════════════════════════════════╝")
            
            initial_check = self._test_connection()
            if initial_check:
                logger.info("✓ Initial connection test: SUCCESS")
                self.connection_state = ConnectionState.CONNECTED
                self._start_health_check_thread()
            else:
                logger.error("✗ Initial connection test: FAILED")
                logger.error(f"  Error: {self.last_error}")
                self.connection_state = ConnectionState.FAILED
                self._suggest_troubleshooting()
    
    def _suggest_troubleshooting(self):
        """Provide troubleshooting suggestions"""
        logger.error("╔══════════════════════════════════════════════════════════════╗")
        logger.error("║ TROUBLESHOOTING STEPS                                        ║")
        logger.error("╠══════════════════════════════════════════════════════════════╣")
        logger.error("║ 1. Verify Home Assistant is running and accessible          ║")
        logger.error(f"║    URL: {self.base_url:<51} ║")
        logger.error("║                                                              ║")
        logger.error("║ 2. Check your access token is valid:                        ║")
        logger.error("║    - Login to Home Assistant                                 ║")
        logger.error("║    - Go to Profile > Security                                ║")
        logger.error("║    - Create a long-lived access token                        ║")
        logger.error("║                                                              ║")
        logger.error("║ 3. Verify network connectivity:                             ║")
        logger.error("║    - Can you ping the Home Assistant server?                 ║")
        logger.error("║    - Are there firewall rules blocking access?               ║")
        logger.error("║                                                              ║")
        logger.error("║ 4. Check SSL/TLS settings:                                   ║")
        logger.error("║    - If using self-signed cert, set:                         ║")
        logger.error("║      HOME_ASSISTANT_VERIFY_SSL=False                         ║")
        logger.error("║                                                              ║")
        logger.error("║ 5. Review Home Assistant logs for rejected requests         ║")
        logger.error("╚══════════════════════════════════════════════════════════════╝")
    
    def _get_headers(self) -> Dict[str, str]:
        """Get authorization headers for API requests"""
        return {
            'Authorization': f'Bearer {self.access_token}',
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    
    def _calculate_backoff(self, retry_count: int) -> float:
        """Calculate exponential backoff delay"""
        base_delay = 1.0
        max_delay = 60.0
        delay = min(base_delay * (2 ** retry_count), max_delay)
        return delay
    
    def _test_connection(self) -> bool:
        """Test connection to Home Assistant"""
        try:
            response = requests.get(
                f"{self.base_url}/api/",
                headers=self._get_headers(),
                timeout=(self.timeout_connect, self.timeout_read),
                verify=self.verify_ssl
            )
            
            if response.status_code == 200:
                data = response.json()
                if 'message' in data:
                    return True
            
            self.last_error = f"Unexpected response: HTTP {response.status_code}"
            return False
            
        except requests.exceptions.SSLError as e:
            self.last_error = f"SSL Certificate Error: {str(e)}\n  → Set HOME_ASSISTANT_VERIFY_SSL=False if using self-signed cert"
            return False
        except requests.exceptions.ConnectionError as e:
            self.last_error = f"Connection Error: Cannot reach {self.base_url}\n  → Check if Home Assistant is running and accessible"
            return False
        except requests.exceptions.Timeout as e:
            self.last_error = f"Timeout Error: Server did not respond within {self.timeout_connect}s\n  → Check network latency or increase timeout"
            return False
        except requests.exceptions.RequestException as e:
            self.last_error = f"Request Error: {str(e)}"
            return False
        except Exception as e:
            self.last_error = f"Unexpected Error: {str(e)}"
            return False
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Optional[Dict]:
        """
        Make API request to Home Assistant with retry logic
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (e.g., /api/states)
            **kwargs: Additional request parameters
            
        Returns:
            Response JSON or None on error
        """
        if not self.enabled:
            self.last_error = "Home Assistant not configured (missing token)"
            logger.error(self.last_error)
            return None
        
        if self.connection_state == ConnectionState.FAILED:
            logger.warning(f"Connection in FAILED state. Queueing command: {method} {endpoint}")
            self._queue_command(method, endpoint, **kwargs)
            return None
        
        url = f"{self.base_url}{endpoint}"
        retry_count = 0
        
        while retry_count <= self.max_retries:
            try:
                if retry_count > 0:
                    self.connection_state = ConnectionState.RECONNECTING
                    delay = self._calculate_backoff(retry_count - 1)
                    logger.info(f"Retry {retry_count}/{self.max_retries} after {delay:.1f}s delay...")
                    time.sleep(delay)
                
                response = requests.request(
                    method=method,
                    url=url,
                    headers=self._get_headers(),
                    timeout=(self.timeout_connect, self.timeout_read),
                    verify=self.verify_ssl,
                    **kwargs
                )
                
                response.raise_for_status()
                
                if self.connection_state != ConnectionState.CONNECTED:
                    logger.info("✓ Connection restored")
                    self.connection_state = ConnectionState.CONNECTED
                    self._process_queued_commands()
                
                self.consecutive_failures = 0
                self.last_error = None
                
                return response.json() if response.text else {}
            
            except requests.exceptions.HTTPError as e:
                status_code = e.response.status_code if e.response else 0
                
                if status_code == 401:
                    self.last_error = "Authentication Failed: Invalid or expired access token\n  → Generate a new long-lived access token in Home Assistant"
                    logger.error(self.last_error)
                    self.connection_state = ConnectionState.FAILED
                    return None
                
                elif status_code == 404:
                    self.last_error = f"Not Found: {endpoint} does not exist"
                    logger.error(self.last_error)
                    return None
                
                elif status_code == 408:
                    self.last_error = f"Request Timeout: Server took too long to respond"
                    logger.error(self.last_error)
                    retry_count += 1
                    continue
                
                else:
                    self.last_error = f"HTTP {status_code}: {str(e)}"
                    logger.error(self.last_error)
                    retry_count += 1
                    continue
            
            except requests.exceptions.SSLError as e:
                self.last_error = f"SSL Error: {str(e)}\n  → Try setting HOME_ASSISTANT_VERIFY_SSL=False"
                logger.error(self.last_error)
                self.connection_state = ConnectionState.FAILED
                return None
            
            except requests.exceptions.ConnectionError as e:
                self.last_error = f"Connection Error: {str(e)}"
                logger.error(self.last_error)
                retry_count += 1
                continue
            
            except requests.exceptions.Timeout as e:
                self.last_error = f"Timeout: {str(e)}"
                logger.error(self.last_error)
                retry_count += 1
                continue
            
            except requests.exceptions.RequestException as e:
                self.last_error = f"Request Error: {str(e)}"
                logger.error(self.last_error)
                retry_count += 1
                continue
            
            except Exception as e:
                self.last_error = f"Unexpected Error: {str(e)}"
                logger.error(self.last_error, exc_info=True)
                return None
        
        self.consecutive_failures += 1
        logger.error(f"✗ All retry attempts failed ({self.max_retries} retries)")
        
        if self.consecutive_failures >= 3:
            logger.error(f"✗ {self.consecutive_failures} consecutive failures - marking connection as FAILED")
            self.connection_state = ConnectionState.FAILED
            self._queue_command(method, endpoint, **kwargs)
        
        return None
    
    def _queue_command(self, method: str, endpoint: str, **kwargs):
        """Queue a command for later execution"""
        cmd = QueuedCommand(method, endpoint, **kwargs)
        self.command_queue.append(cmd)
        logger.info(f"Command queued: {method} {endpoint} (queue size: {len(self.command_queue)})")
    
    def _process_queued_commands(self):
        """Process queued commands after connection is restored"""
        if not self.command_queue:
            return
        
        logger.info(f"Processing {len(self.command_queue)} queued commands...")
        
        while self.command_queue:
            cmd = self.command_queue.popleft()
            
            age = (datetime.utcnow() - cmd.timestamp).total_seconds()
            if age > 600:
                logger.warning(f"Discarding stale command (age: {age:.0f}s): {cmd.method} {cmd.endpoint}")
                continue
            
            logger.info(f"Replaying: {cmd.method} {cmd.endpoint}")
            self._request(cmd.method, cmd.endpoint, **cmd.kwargs)
    
    def _health_check_loop(self):
        """Background thread for periodic health checks"""
        logger.info(f"Health check thread started (interval: {self.health_check_interval}s)")
        
        while not self._stop_health_check.is_set():
            time.sleep(self.health_check_interval)
            
            if not self.enabled:
                break
            
            logger.debug("Running health check...")
            self.last_health_check = datetime.utcnow()
            
            if self._test_connection():
                if self.connection_state != ConnectionState.CONNECTED:
                    logger.info("✓ Health check: Connection restored")
                    self.connection_state = ConnectionState.CONNECTED
                    self.consecutive_failures = 0
                    self._process_queued_commands()
                else:
                    logger.debug("✓ Health check: OK")
            else:
                logger.warning(f"✗ Health check failed: {self.last_error}")
                self.consecutive_failures += 1
                
                if self.consecutive_failures >= 3:
                    self.connection_state = ConnectionState.FAILED
                    logger.error(f"✗ Health check: Connection marked as FAILED after {self.consecutive_failures} failures")
        
        logger.info("Health check thread stopped")
    
    def _start_health_check_thread(self):
        """Start background health check thread"""
        if self.health_check_thread and self.health_check_thread.is_alive():
            return
        
        self._stop_health_check.clear()
        self.health_check_thread = threading.Thread(
            target=self._health_check_loop,
            name="HomeAssistantHealthCheck",
            daemon=True
        )
        self.health_check_thread.start()
    
    def stop_health_check(self):
        """Stop the health check thread"""
        if self.health_check_thread:
            self._stop_health_check.set()
            self.health_check_thread.join(timeout=5)
    
    def get_connection_status(self) -> Dict[str, Any]:
        """Get current connection status"""
        return {
            'enabled': self.enabled,
            'state': self.connection_state.value,
            'base_url': self.base_url,
            'last_health_check': self.last_health_check.isoformat() if self.last_health_check else None,
            'last_error': self.last_error,
            'consecutive_failures': self.consecutive_failures,
            'queued_commands': len(self.command_queue),
            'verify_ssl': self.verify_ssl,
            'timeout': {
                'connect': self.timeout_connect,
                'read': self.timeout_read
            }
        }
    
    def check_connection(self) -> bool:
        """
        Check if Home Assistant is accessible
        
        Returns:
            Connection status
        """
        return self._test_connection()
    
    def get_states(self) -> List[Dict[str, Any]]:
        """Get all entity states from Home Assistant"""
        result = self._request('GET', '/api/states')
        return result if isinstance(result, list) else []
    
    def get_state(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """
        Get state of a specific entity
        
        Args:
            entity_id: Entity ID (e.g., light.living_room)
            
        Returns:
            Entity state dictionary or None
        """
        return self._request('GET', f'/api/states/{entity_id}')
    
    def call_service(self, domain: str, service: str, entity_id: Optional[str] = None, 
                    **service_data) -> Optional[Dict]:
        """
        Call a Home Assistant service
        
        Args:
            domain: Service domain (e.g., light, switch, climate)
            service: Service name (e.g., turn_on, turn_off)
            entity_id: Target entity ID (optional)
            **service_data: Additional service parameters
            
        Returns:
            Service call result or None
        """
        data = {}
        if entity_id:
            data['entity_id'] = entity_id
        data.update(service_data)
        
        return self._request('POST', f'/api/services/{domain}/{service}', json=data)
    
    def get_devices(self, domain: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all devices, optionally filtered by domain
        
        Args:
            domain: Filter by domain (light, switch, sensor, etc.)
            
        Returns:
            List of device dictionaries
        """
        states = self.get_states()
        
        if domain:
            states = [s for s in states if s.get('entity_id', '').startswith(f"{domain}.")]
        
        devices = []
        for state in states:
            entity_id = state.get('entity_id', '')
            attributes = state.get('attributes', {})
            
            device = {
                'entity_id': entity_id,
                'name': attributes.get('friendly_name', entity_id),
                'state': state.get('state'),
                'domain': entity_id.split('.')[0] if '.' in entity_id else 'unknown',
                'attributes': attributes,
                'last_changed': state.get('last_changed'),
                'last_updated': state.get('last_updated')
            }
            devices.append(device)
        
        return devices
    
    def get_lights(self) -> List[Dict[str, Any]]:
        """Get all lights"""
        return self.get_devices('light')
    
    def get_switches(self) -> List[Dict[str, Any]]:
        """Get all switches"""
        return self.get_devices('switch')
    
    def get_sensors(self) -> List[Dict[str, Any]]:
        """Get all sensors"""
        return self.get_devices('sensor')
    
    def get_climate_devices(self) -> List[Dict[str, Any]]:
        """Get all climate devices (thermostats, AC, etc.)"""
        return self.get_devices('climate')
    
    def turn_on(self, entity_id: str, **kwargs) -> bool:
        """
        Turn on a device
        
        Args:
            entity_id: Entity to turn on
            **kwargs: Additional parameters (brightness, color, etc.)
            
        Returns:
            Success status
        """
        domain = entity_id.split('.')[0]
        result = self.call_service(domain, 'turn_on', entity_id, **kwargs)
        return result is not None
    
    def turn_off(self, entity_id: str) -> bool:
        """
        Turn off a device
        
        Args:
            entity_id: Entity to turn off
            
        Returns:
            Success status
        """
        domain = entity_id.split('.')[0]
        result = self.call_service(domain, 'turn_off', entity_id)
        return result is not None
    
    def set_brightness(self, entity_id: str, brightness: int) -> bool:
        """
        Set brightness of a light (0-255)
        
        Args:
            entity_id: Light entity
            brightness: Brightness level (0-255)
            
        Returns:
            Success status
        """
        return self.turn_on(entity_id, brightness=brightness)
    
    def set_color(self, entity_id: str, rgb_color: tuple) -> bool:
        """
        Set color of a light
        
        Args:
            entity_id: Light entity
            rgb_color: RGB tuple (r, g, b) - values 0-255
            
        Returns:
            Success status
        """
        return self.turn_on(entity_id, rgb_color=list(rgb_color))
    
    def set_temperature(self, entity_id: str, temperature: float) -> bool:
        """
        Set temperature for climate device
        
        Args:
            entity_id: Climate entity
            temperature: Target temperature
            
        Returns:
            Success status
        """
        result = self.call_service('climate', 'set_temperature', entity_id, temperature=temperature)
        return result is not None
    
    def trigger_automation(self, entity_id: str) -> bool:
        """
        Trigger an automation
        
        Args:
            entity_id: Automation entity
            
        Returns:
            Success status
        """
        result = self.call_service('automation', 'trigger', entity_id)
        return result is not None
    
    def get_automations(self) -> List[Dict[str, Any]]:
        """Get all automations"""
        return self.get_devices('automation')
    
    def create_scene(self, scene_name: str, entities: Dict[str, Dict]) -> bool:
        """
        Create a scene
        
        Args:
            scene_name: Name of the scene
            entities: Dictionary of entity_id -> state mappings
            
        Returns:
            Success status
        """
        result = self.call_service('scene', 'create', 
                                   entity_id=None,
                                   scene_id=scene_name.lower().replace(' ', '_'),
                                   entities=entities)
        return result is not None
    
    def activate_scene(self, entity_id: str) -> bool:
        """
        Activate a scene
        
        Args:
            entity_id: Scene entity
            
        Returns:
            Success status
        """
        result = self.call_service('scene', 'turn_on', entity_id)
        return result is not None
    
    def get_history(self, entity_id: str, hours: int = 24) -> Optional[List]:
        """
        Get history for an entity
        
        Args:
            entity_id: Entity ID
            hours: Hours of history to retrieve
            
        Returns:
            History data or None
        """
        from datetime import timedelta
        timestamp = (datetime.now() - timedelta(hours=hours)).isoformat()
        result = self._request('GET', f'/api/history/period/{timestamp}?filter_entity_id={entity_id}')
        if result and isinstance(result, list):
            return result
        return None
    
    def send_notification(self, message: str, title: Optional[str] = None) -> bool:
        """
        Send notification through Home Assistant
        
        Args:
            message: Notification message
            title: Notification title (optional)
            
        Returns:
            Success status
        """
        data = {'message': message}
        if title:
            data['title'] = title
        
        result = self.call_service('notify', 'notify', **data)
        return result is not None


home_assistant_service = HomeAssistantService()
