"""
Network Monitoring Service
Provides detailed network statistics, bandwidth monitoring, and connection tracking.
"""

import psutil
import socket
from typing import Dict, List, Any
from collections import defaultdict


class NetworkService:
    """Service for monitoring network statistics and connections."""
    
    @staticmethod
    def get_network_stats() -> Dict[str, Any]:
        """Get comprehensive network statistics."""
        net_io = psutil.net_io_counters()
        
        return {
            'bytes_sent': net_io.bytes_sent,
            'bytes_recv': net_io.bytes_recv,
            'packets_sent': net_io.packets_sent,
            'packets_recv': net_io.packets_recv,
            'errors_in': net_io.errin,
            'errors_out': net_io.errout,
            'drops_in': net_io.dropin,
            'drops_out': net_io.dropout
        }
    
    @staticmethod
    def get_interface_stats() -> List[Dict[str, Any]]:
        """Get statistics for each network interface."""
        interfaces = []
        net_if_addrs = psutil.net_if_addrs()
        net_if_stats = psutil.net_if_stats()
        net_io_counters = psutil.net_io_counters(pernic=True)
        
        for interface_name, addrs in net_if_addrs.items():
            interface_info = {
                'name': interface_name,
                'addresses': [],
                'stats': {},
                'io': {}
            }
            
            # Get addresses
            for addr in addrs:
                addr_info = {
                    'family': str(addr.family),
                    'address': addr.address
                }
                if addr.netmask:
                    addr_info['netmask'] = addr.netmask
                if addr.broadcast:
                    addr_info['broadcast'] = addr.broadcast
                interface_info['addresses'].append(addr_info)
            
            # Get interface stats
            if interface_name in net_if_stats:
                stats = net_if_stats[interface_name]
                interface_info['stats'] = {
                    'is_up': stats.isup,
                    'speed': stats.speed,
                    'mtu': stats.mtu
                }
            
            # Get IO counters
            if interface_name in net_io_counters:
                io = net_io_counters[interface_name]
                interface_info['io'] = {
                    'bytes_sent': io.bytes_sent,
                    'bytes_recv': io.bytes_recv,
                    'packets_sent': io.packets_sent,
                    'packets_recv': io.packets_recv,
                    'errors_in': io.errin,
                    'errors_out': io.errout
                }
            
            interfaces.append(interface_info)
        
        return interfaces
    
    @staticmethod
    def get_connections() -> Dict[str, Any]:
        """Get active network connections."""
        try:
            connections = psutil.net_connections(kind='inet')
            
            # Group by status
            by_status = defaultdict(int)
            by_protocol = defaultdict(int)
            details = []
            
            for conn in connections:
                status = conn.status if hasattr(conn, 'status') else 'UNKNOWN'
                by_status[status] += 1
                
                # Determine protocol
                protocol = 'TCP' if conn.type == socket.SOCK_STREAM else 'UDP'
                by_protocol[protocol] += 1
                
                # Build connection detail
                detail = {
                    'protocol': protocol,
                    'status': status,
                    'local_address': f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else None,
                    'remote_address': f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else None,
                    'pid': conn.pid
                }
                
                # Add process name if available
                if conn.pid:
                    try:
                        process = psutil.Process(conn.pid)
                        detail['process'] = process.name()
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        detail['process'] = None
                
                details.append(detail)
            
            return {
                'total': len(connections),
                'by_status': dict(by_status),
                'by_protocol': dict(by_protocol),
                'connections': details[:100]  # Limit to 100 most recent
            }
        except (psutil.AccessDenied, PermissionError):
            return {
                'total': 0,
                'by_status': {},
                'by_protocol': {},
                'connections': [],
                'error': 'Permission denied. Run with elevated privileges for connection details.'
            }
    
    @staticmethod
    def get_listening_ports() -> List[Dict[str, Any]]:
        """Get all listening ports on the system."""
        try:
            connections = psutil.net_connections(kind='inet')
            listening = []
            
            for conn in connections:
                if conn.status == 'LISTEN':
                    port_info = {
                        'port': conn.laddr.port,
                        'address': conn.laddr.ip,
                        'protocol': 'TCP' if conn.type == socket.SOCK_STREAM else 'UDP',
                        'pid': conn.pid
                    }
                    
                    # Add process name if available
                    if conn.pid:
                        try:
                            process = psutil.Process(conn.pid)
                            port_info['process'] = process.name()
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            port_info['process'] = None
                    
                    listening.append(port_info)
            
            # Sort by port number
            listening.sort(key=lambda x: x['port'])
            
            return listening
        except (psutil.AccessDenied, PermissionError):
            return []
    
    @staticmethod
    def get_bandwidth_delta(previous_stats: Dict[str, int]) -> Dict[str, float]:
        """Calculate bandwidth usage since previous measurement."""
        current_stats = NetworkService.get_network_stats()
        
        if not previous_stats:
            return {'upload_mbps': 0, 'download_mbps': 0}
        
        # Calculate bytes per second (assuming 1 second interval)
        bytes_sent_delta = current_stats['bytes_sent'] - previous_stats.get('bytes_sent', 0)
        bytes_recv_delta = current_stats['bytes_recv'] - previous_stats.get('bytes_recv', 0)
        
        # Convert to Mbps
        upload_mbps = (bytes_sent_delta * 8) / (1024 * 1024)
        download_mbps = (bytes_recv_delta * 8) / (1024 * 1024)
        
        return {
            'upload_mbps': round(upload_mbps, 2),
            'download_mbps': round(download_mbps, 2),
            'upload_bytes': bytes_sent_delta,
            'download_bytes': bytes_recv_delta
        }
