"""
Network Auto-Discovery Service
Discovers NAS devices, hosts, and services on the network using multiple methods.
"""
import os
import socket
import logging
import time
import threading
import subprocess
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

logger = logging.getLogger(__name__)


class DiscoveryCache:
    """Simple in-memory cache with TTL for discovery results"""
    
    def __init__(self, ttl_seconds: int = 300):
        self._cache: Dict[str, Tuple[Any, datetime]] = {}
        self._ttl = timedelta(seconds=ttl_seconds)
        self._lock = threading.Lock()
    
    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._cache:
                value, timestamp = self._cache[key]
                if datetime.now(timezone.utc) - timestamp < self._ttl:
                    return value
                del self._cache[key]
        return None
    
    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._cache[key] = (value, datetime.now(timezone.utc))
    
    def invalidate(self, key: str = None) -> None:
        with self._lock:
            if key:
                self._cache.pop(key, None)
            else:
                self._cache.clear()
    
    def get_all(self) -> Dict[str, Any]:
        with self._lock:
            now = datetime.now(timezone.utc)
            return {
                k: v for k, (v, ts) in self._cache.items()
                if now - ts < self._ttl
            }


class NetworkDiscovery:
    """
    Network auto-discovery service for finding NAS, hosts, and services.
    
    Uses multiple discovery methods:
    - DNS/hostname resolution
    - TCP port probing
    - ARP/ping scanning
    - Tailscale status (if available)
    - Environment variable hints
    """
    
    COMMON_NAS_HOSTNAMES = [
        'nas', 'nas.local', 'synology', 'synology.local',
        'diskstation', 'diskstation.local', 'storage', 'storage.local'
    ]
    
    COMMON_SUBNETS = ['192.168.0', '192.168.1', '10.0.0', '172.16.0']
    
    COMMON_PORTS = {
        'smb': 445,
        'nfs': 2049,
        'ssh': 22,
        'http': 80,
        'https': 443,
        'rdp': 3389,
        'vnc': 5900,
        'plex': 32400,
        'homeassistant': 8123,
        'minio': 9000,
        'docker': 2375,
    }
    
    def __init__(self, cache_ttl: int = 300):
        self.cache = DiscoveryCache(ttl_seconds=cache_ttl)
        self.probe_timeout = 2.0
        self.executor = ThreadPoolExecutor(max_workers=20)
        
        self.env_hints = {
            'nas': os.environ.get('NAS_IP', '192.168.0.176'),
            'local_host': os.environ.get('TAILSCALE_LOCAL_HOST', '192.168.0.177'),
            'linode_host': os.environ.get('TAILSCALE_LINODE_HOST', ''),
            'kvm_host': os.environ.get('KVM_HOST_IP', '192.168.122.250'),
        }
    
    def probe_endpoint(self, ip: str, port: int, timeout: float = None) -> bool:
        """
        Test TCP connectivity to an endpoint.
        Returns True if the port is open and accepting connections.
        """
        if timeout is None:
            timeout = self.probe_timeout
        
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((ip, port))
            sock.close()
            return result == 0
        except socket.error as e:
            logger.debug(f"Probe failed for {ip}:{port}: {e}")
            return False
    
    def resolve_hostname(self, hostname: str) -> Optional[str]:
        """Resolve a hostname to an IP address"""
        try:
            ip = socket.gethostbyname(hostname)
            logger.info(f"Resolved {hostname} to {ip}")
            return ip
        except socket.gaierror:
            logger.debug(f"Could not resolve hostname: {hostname}")
            return None
    
    def ping_host(self, ip: str, timeout: int = 2) -> bool:
        """Check if a host responds to ICMP ping"""
        try:
            result = subprocess.run(
                ['ping', '-c', '1', '-W', str(timeout), ip],
                capture_output=True,
                timeout=timeout + 1
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return False
    
    def discover_nas(self, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Discover NAS devices using multiple methods.
        
        Methods tried in order:
        1. Environment variable hint
        2. DNS/hostname resolution
        3. Subnet scan with SMB port probe
        """
        cache_key = 'nas_discovery'
        if not force_refresh:
            cached = self.cache.get(cache_key)
            if cached:
                logger.debug("Returning cached NAS discovery result")
                return cached
        
        start_time = time.time()
        result = {
            'found': False,
            'ip': None,
            'name': None,
            'methods_tried': [],
            'discovery_method': None,
            'ports': {},
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        hint_ip = self.env_hints.get('nas')
        if hint_ip:
            result['methods_tried'].append(f'env_hint:{hint_ip}')
            if self.probe_endpoint(hint_ip, self.COMMON_PORTS['smb']):
                result.update({
                    'found': True,
                    'ip': hint_ip,
                    'name': 'NAS (from env)',
                    'discovery_method': 'env_hint',
                    'ports': {'smb': True}
                })
                self._check_additional_ports(result, hint_ip)
                self._log_discovery('nas', hint_ip, 'env_hint', True, time.time() - start_time)
                self.cache.set(cache_key, result)
                return result
        
        for hostname in self.COMMON_NAS_HOSTNAMES:
            result['methods_tried'].append(f'dns:{hostname}')
            ip = self.resolve_hostname(hostname)
            if ip and self.probe_endpoint(ip, self.COMMON_PORTS['smb']):
                result.update({
                    'found': True,
                    'ip': ip,
                    'name': hostname,
                    'discovery_method': f'dns:{hostname}',
                    'ports': {'smb': True}
                })
                self._check_additional_ports(result, ip)
                self._log_discovery('nas', ip, f'dns:{hostname}', True, time.time() - start_time)
                self.cache.set(cache_key, result)
                return result
        
        for subnet in self.COMMON_SUBNETS[:2]:
            result['methods_tried'].append(f'scan:{subnet}.x')
            found_ip = self._scan_subnet_for_port(subnet, self.COMMON_PORTS['smb'], range(170, 190))
            if found_ip:
                result.update({
                    'found': True,
                    'ip': found_ip,
                    'name': f'NAS ({found_ip})',
                    'discovery_method': f'subnet_scan:{subnet}',
                    'ports': {'smb': True}
                })
                self._check_additional_ports(result, found_ip)
                self._log_discovery('nas', found_ip, 'subnet_scan', True, time.time() - start_time)
                self.cache.set(cache_key, result)
                return result
        
        if hint_ip:
            result['ip'] = hint_ip
            result['name'] = 'NAS (offline - using hint)'
            result['discovery_method'] = 'fallback_hint'
        
        self._log_discovery('nas', hint_ip, 'all_methods_failed', False, time.time() - start_time)
        self.cache.set(cache_key, result)
        return result
    
    def discover_host(self, hostname_hint: str = None, resource_name: str = 'host') -> Dict[str, Any]:
        """
        Discover a host machine using multiple methods.
        
        Args:
            hostname_hint: Hostname or IP to try first
            resource_name: Name for the resource (e.g., 'local', 'linode', 'kvm')
        """
        cache_key = f'host_discovery:{resource_name}'
        cached = self.cache.get(cache_key)
        if cached:
            return cached
        
        start_time = time.time()
        result = {
            'found': False,
            'ip': None,
            'name': resource_name,
            'methods_tried': [],
            'discovery_method': None,
            'ports': {},
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        env_key = f'{resource_name}_host'
        hint_ip = self.env_hints.get(env_key) or hostname_hint
        
        if hint_ip:
            result['methods_tried'].append(f'env_hint:{hint_ip}')
            if self.probe_endpoint(hint_ip, self.COMMON_PORTS['ssh']):
                result.update({
                    'found': True,
                    'ip': hint_ip,
                    'discovery_method': 'env_hint',
                    'ports': {'ssh': True}
                })
                self._check_host_ports(result, hint_ip)
                self._log_discovery('host', hint_ip, 'env_hint', True, time.time() - start_time)
                self.cache.set(cache_key, result)
                return result
        
        tailscale_result = self._try_tailscale_discovery(resource_name)
        if tailscale_result:
            result['methods_tried'].append('tailscale_status')
            if self.probe_endpoint(tailscale_result['ip'], self.COMMON_PORTS['ssh']):
                result.update({
                    'found': True,
                    'ip': tailscale_result['ip'],
                    'discovery_method': 'tailscale',
                    'ports': {'ssh': True}
                })
                self._check_host_ports(result, tailscale_result['ip'])
                self._log_discovery('host', tailscale_result['ip'], 'tailscale', True, time.time() - start_time)
                self.cache.set(cache_key, result)
                return result
        
        if hostname_hint:
            result['methods_tried'].append(f'dns:{hostname_hint}')
            resolved_ip = self.resolve_hostname(hostname_hint)
            if resolved_ip and self.probe_endpoint(resolved_ip, self.COMMON_PORTS['ssh']):
                result.update({
                    'found': True,
                    'ip': resolved_ip,
                    'discovery_method': f'dns:{hostname_hint}',
                    'ports': {'ssh': True}
                })
                self._check_host_ports(result, resolved_ip)
                self.cache.set(cache_key, result)
                return result
        
        if hint_ip:
            result['ip'] = hint_ip
            result['name'] = f'{resource_name} (offline - using hint)'
            result['discovery_method'] = 'fallback_hint'
        
        self._log_discovery('host', hint_ip, 'all_methods_failed', False, time.time() - start_time)
        self.cache.set(cache_key, result)
        return result
    
    def discover_kvm(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Discover KVM virtual machines (Windows gaming VM, etc.)"""
        cache_key = 'kvm_discovery'
        if not force_refresh:
            cached = self.cache.get(cache_key)
            if cached:
                return cached
        
        start_time = time.time()
        result = {
            'found': False,
            'ip': None,
            'name': 'KVM Windows',
            'methods_tried': [],
            'discovery_method': None,
            'ports': {},
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        hint_ip = self.env_hints.get('kvm_host')
        if hint_ip:
            result['methods_tried'].append(f'env_hint:{hint_ip}')
            if self.probe_endpoint(hint_ip, self.COMMON_PORTS['rdp']):
                result.update({
                    'found': True,
                    'ip': hint_ip,
                    'discovery_method': 'env_hint',
                    'ports': {'rdp': True}
                })
                self._log_discovery('kvm', hint_ip, 'env_hint', True, time.time() - start_time)
                self.cache.set(cache_key, result)
                return result
        
        kvm_subnet = '192.168.122'
        result['methods_tried'].append(f'scan:{kvm_subnet}.x:3389')
        found_ip = self._scan_subnet_for_port(kvm_subnet, self.COMMON_PORTS['rdp'], range(1, 255))
        if found_ip:
            result.update({
                'found': True,
                'ip': found_ip,
                'discovery_method': f'subnet_scan:{kvm_subnet}',
                'ports': {'rdp': True}
            })
            self._log_discovery('kvm', found_ip, 'subnet_scan', True, time.time() - start_time)
            self.cache.set(cache_key, result)
            return result
        
        if hint_ip:
            result['ip'] = hint_ip
            result['discovery_method'] = 'fallback_hint'
        
        self._log_discovery('kvm', hint_ip, 'all_methods_failed', False, time.time() - start_time)
        self.cache.set(cache_key, result)
        return result
    
    def discover_service(self, service_name: str, ip_hint: str = None, port: int = None) -> Dict[str, Any]:
        """Discover a specific service by probing its port"""
        cache_key = f'service_discovery:{service_name}'
        cached = self.cache.get(cache_key)
        if cached:
            return cached
        
        start_time = time.time()
        result = {
            'found': False,
            'ip': None,
            'name': service_name,
            'port': port or self.COMMON_PORTS.get(service_name),
            'methods_tried': [],
            'discovery_method': None,
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        if not result['port']:
            result['error'] = f'Unknown port for service: {service_name}'
            return result
        
        if ip_hint:
            result['methods_tried'].append(f'ip_hint:{ip_hint}')
            if self.probe_endpoint(ip_hint, result['port']):
                result.update({
                    'found': True,
                    'ip': ip_hint,
                    'discovery_method': 'ip_hint'
                })
                self._log_discovery('service', f"{ip_hint}:{result['port']}", 'ip_hint', True, time.time() - start_time)
                self.cache.set(cache_key, result)
                return result
        
        hostname = service_name.replace('_', '-')
        result['methods_tried'].append(f'dns:{hostname}')
        resolved_ip = self.resolve_hostname(hostname)
        if resolved_ip and self.probe_endpoint(resolved_ip, result['port']):
            result.update({
                'found': True,
                'ip': resolved_ip,
                'discovery_method': f'dns:{hostname}'
            })
            self.cache.set(cache_key, result)
            return result
        
        self._log_discovery('service', service_name, 'all_methods_failed', False, time.time() - start_time)
        self.cache.set(cache_key, result)
        return result
    
    def get_network_config(self, force_refresh: bool = False) -> Dict[str, str]:
        """
        Get the current network configuration with all discovered IPs.
        Returns a dict suitable for setting environment variables.
        """
        cache_key = 'network_config'
        if not force_refresh:
            cached = self.cache.get(cache_key)
            if cached:
                return cached
        
        logger.info("Running full network discovery...")
        
        nas = self.discover_nas(force_refresh=force_refresh)
        local_host = self.discover_host(resource_name='local')
        linode_host = self.discover_host(resource_name='linode')
        kvm = self.discover_kvm(force_refresh=force_refresh)
        
        config = {
            'NAS_IP': nas.get('ip') or self.env_hints.get('nas', ''),
            'LOCAL_HOST_IP': local_host.get('ip') or self.env_hints.get('local_host', ''),
            'LINODE_HOST_IP': linode_host.get('ip') or self.env_hints.get('linode_host', ''),
            'KVM_HOST_IP': kvm.get('ip') or self.env_hints.get('kvm_host', ''),
        }
        
        config['_discovery_status'] = {
            'nas': {'found': nas.get('found', False), 'method': nas.get('discovery_method')},
            'local_host': {'found': local_host.get('found', False), 'method': local_host.get('discovery_method')},
            'linode_host': {'found': linode_host.get('found', False), 'method': linode_host.get('discovery_method')},
            'kvm': {'found': kvm.get('found', False), 'method': kvm.get('discovery_method')},
        }
        config['_timestamp'] = datetime.now(timezone.utc).isoformat()
        
        self.cache.set(cache_key, config)
        
        self._save_to_database(nas, local_host, linode_host, kvm)
        
        return config
    
    def run_full_discovery(self) -> Dict[str, Any]:
        """Run a complete network discovery and return all results"""
        start_time = time.time()
        
        results = {
            'nas': self.discover_nas(force_refresh=True),
            'local_host': self.discover_host(resource_name='local'),
            'linode_host': self.discover_host(resource_name='linode'),
            'kvm': self.discover_kvm(force_refresh=True),
            'services': {},
        }
        
        local_ip = results['local_host'].get('ip')
        if local_ip:
            for service, port in [('plex', 32400), ('homeassistant', 8123), ('minio', 9000)]:
                results['services'][service] = {
                    'reachable': self.probe_endpoint(local_ip, port),
                    'ip': local_ip,
                    'port': port
                }
        
        results['duration_ms'] = int((time.time() - start_time) * 1000)
        results['timestamp'] = datetime.now(timezone.utc).isoformat()
        
        return results
    
    def health_check_all(self) -> Dict[str, Any]:
        """Quick health check of all known resources"""
        results = {
            'healthy': 0,
            'unhealthy': 0,
            'resources': [],
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
        
        checks = []
        
        for name, env_key in [('NAS', 'nas'), ('Local Host', 'local_host'), ('KVM', 'kvm_host')]:
            ip = self.env_hints.get(env_key)
            if ip:
                if name == 'NAS':
                    port = self.COMMON_PORTS['smb']
                elif name == 'KVM':
                    port = self.COMMON_PORTS['rdp']
                else:
                    port = self.COMMON_PORTS['ssh']
                checks.append((name, ip, port))
        
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {
                executor.submit(self.probe_endpoint, ip, port, 1.0): (name, ip, port)
                for name, ip, port in checks
            }
            
            for future in as_completed(futures):
                name, ip, port = futures[future]
                try:
                    is_healthy = future.result()
                    status = 'healthy' if is_healthy else 'unhealthy'
                    results['resources'].append({
                        'name': name,
                        'ip': ip,
                        'port': port,
                        'status': status
                    })
                    if is_healthy:
                        results['healthy'] += 1
                    else:
                        results['unhealthy'] += 1
                except Exception as e:
                    results['resources'].append({
                        'name': name,
                        'ip': ip,
                        'port': port,
                        'status': 'error',
                        'error': str(e)
                    })
                    results['unhealthy'] += 1
        
        return results
    
    def _scan_subnet_for_port(self, subnet: str, port: int, host_range: range) -> Optional[str]:
        """Scan a subnet range for hosts with a specific port open"""
        futures = {}
        
        with ThreadPoolExecutor(max_workers=20) as executor:
            for host in host_range:
                ip = f"{subnet}.{host}"
                futures[executor.submit(self.probe_endpoint, ip, port, 0.5)] = ip
            
            for future in as_completed(futures, timeout=30):
                ip = futures[future]
                try:
                    if future.result():
                        return ip
                except Exception:
                    pass
        
        return None
    
    def _check_additional_ports(self, result: Dict, ip: str) -> None:
        """Check additional NAS-related ports"""
        for port_name in ['nfs', 'ssh', 'http', 'https']:
            port = self.COMMON_PORTS[port_name]
            result['ports'][port_name] = self.probe_endpoint(ip, port, 0.5)
    
    def _check_host_ports(self, result: Dict, ip: str) -> None:
        """Check common host ports"""
        for port_name in ['http', 'https', 'docker']:
            port = self.COMMON_PORTS[port_name]
            result['ports'][port_name] = self.probe_endpoint(ip, port, 0.5)
    
    def _try_tailscale_discovery(self, resource_name: str) -> Optional[Dict]:
        """Try to get host info from Tailscale status"""
        try:
            result = subprocess.run(
                ['tailscale', 'status', '--json'],
                capture_output=True,
                timeout=5
            )
            if result.returncode == 0:
                status = json.loads(result.stdout)
                peers = status.get('Peer', {})
                for peer_id, peer_info in peers.items():
                    hostname = peer_info.get('HostName', '').lower()
                    if resource_name.lower() in hostname:
                        ips = peer_info.get('TailscaleIPs', [])
                        if ips:
                            return {'ip': ips[0], 'hostname': hostname}
        except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError) as e:
            logger.debug(f"Tailscale discovery failed: {e}")
        return None
    
    def _log_discovery(self, discovery_type: str, target: str, method: str, success: bool, duration: float) -> None:
        """Log discovery operation to database"""
        try:
            from services.db_service import db_service
            from models.network_resource import NetworkDiscoveryLog
            
            if db_service.is_available:
                with db_service.get_session() as session:
                    log = NetworkDiscoveryLog(
                        discovery_type=discovery_type,
                        target=target,
                        method=method,
                        success='true' if success else 'false',
                        duration_ms=int(duration * 1000)
                    )
                    session.add(log)
                    session.commit()
        except Exception as e:
            logger.debug(f"Could not log discovery to database: {e}")
    
    def _save_to_database(self, nas: Dict, local_host: Dict, linode_host: Dict, kvm: Dict) -> None:
        """Save discovered resources to database"""
        try:
            from services.db_service import db_service
            from models.network_resource import NetworkResource
            
            if not db_service.is_available:
                return
            
            with db_service.get_session() as session:
                resources = [
                    ('nas', 'nas', nas),
                    ('local_host', 'host', local_host),
                    ('linode_host', 'host', linode_host),
                    ('kvm_windows', 'vm', kvm),
                ]
                
                for name, resource_type, data in resources:
                    if data.get('ip'):
                        NetworkResource.upsert(
                            session,
                            name=name,
                            resource_type=resource_type,
                            preferred_endpoint=data.get('ip'),
                            discovered_endpoints=[data.get('ip')] if data.get('ip') else [],
                            last_seen=datetime.now(timezone.utc) if data.get('found') else None,
                            health_status='healthy' if data.get('found') else 'unknown',
                            discovery_method=data.get('discovery_method'),
                            ports=data.get('ports', {})
                        )
                
                session.commit()
                logger.info("Saved discovered resources to database")
        except Exception as e:
            logger.warning(f"Could not save resources to database: {e}")


network_discovery = NetworkDiscovery()


def run_startup_discovery() -> Dict[str, str]:
    """
    Run network discovery at startup and return environment variables.
    This is called from docker-entrypoint.sh or during app initialization.
    """
    logger.info("=" * 60)
    logger.info("Running Network Auto-Discovery")
    logger.info("=" * 60)
    
    try:
        config = network_discovery.get_network_config(force_refresh=True)
        
        status = config.pop('_discovery_status', {})
        timestamp = config.pop('_timestamp', '')
        
        for key, value in config.items():
            if not key.startswith('_') and value:
                os.environ[key] = value
                logger.info(f"  {key}={value}")
        
        logger.info("")
        logger.info("Discovery Results:")
        for resource, info in status.items():
            status_icon = "✓" if info.get('found') else "✗"
            method = info.get('method', 'none')
            logger.info(f"  {status_icon} {resource}: {method}")
        
        logger.info("=" * 60)
        
        return config
    except Exception as e:
        logger.error(f"Network discovery failed: {e}")
        return {}


__all__ = ['NetworkDiscovery', 'network_discovery', 'run_startup_discovery']
