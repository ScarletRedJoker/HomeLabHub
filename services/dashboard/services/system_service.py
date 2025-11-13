import psutil
import platform
from typing import Dict
import logging

logger = logging.getLogger(__name__)

class SystemService:
    @staticmethod
    def get_system_info() -> Dict:
        try:
            cpu_percent = psutil.cpu_percent(interval=1, percpu=False)
            cpu_per_core = psutil.cpu_percent(interval=1, percpu=True)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            net_io = psutil.net_io_counters()
            
            boot_time = psutil.boot_time()
            
            return {
                'cpu': {
                    'percent': cpu_percent,
                    'per_core': cpu_per_core,
                    'count': psutil.cpu_count(),
                    'physical_count': psutil.cpu_count(logical=False)
                },
                'memory': {
                    'total_gb': round(memory.total / (1024**3), 2),
                    'available_gb': round(memory.available / (1024**3), 2),
                    'used_gb': round(memory.used / (1024**3), 2),
                    'percent': memory.percent
                },
                'disk': {
                    'total_gb': round(disk.total / (1024**3), 2),
                    'used_gb': round(disk.used / (1024**3), 2),
                    'free_gb': round(disk.free / (1024**3), 2),
                    'percent': disk.percent
                },
                'network': {
                    'bytes_sent_mb': round(net_io.bytes_sent / (1024**2), 2),
                    'bytes_recv_mb': round(net_io.bytes_recv / (1024**2), 2),
                    'packets_sent': net_io.packets_sent,
                    'packets_recv': net_io.packets_recv
                },
                'system': {
                    'platform': platform.system(),
                    'platform_release': platform.release(),
                    'platform_version': platform.version(),
                    'hostname': platform.node(),
                    'boot_time': boot_time
                }
            }
        except Exception as e:
            logger.error(f"Error getting system info: {e}")
            return {}
    
    @staticmethod
    def get_process_list() -> list:
        try:
            processes = []
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent']):
                try:
                    processes.append(proc.info)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return sorted(processes, key=lambda x: x.get('cpu_percent', 0), reverse=True)[:20]
        except Exception as e:
            logger.error(f"Error getting process list: {e}")
            return []
