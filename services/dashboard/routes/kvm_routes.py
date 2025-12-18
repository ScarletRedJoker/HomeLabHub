"""
KVM Gaming Management Routes
Windows VM control with GPU passthrough for gaming/productivity mode switching
"""
import os
import logging
import re

from flask import Blueprint, jsonify, request, render_template
from utils.auth import require_auth, require_web_auth
from utils.rbac import require_permission
from models.rbac import Permission
from services.fleet_service import fleet_manager

logger = logging.getLogger(__name__)

kvm_bp = Blueprint('kvm', __name__, url_prefix='/kvm')

VM_NAME = os.environ.get('KVM_VM_NAME', 'win11')
HOST_ID = 'local'

def get_windows_ssh_config():
    """Get Windows VM SSH configuration from environment"""
    return {
        'ip': os.environ.get('WINDOWS_VM_IP', '192.168.122.250'),
        'user': os.environ.get('WINDOWS_VM_USER', 'Administrator'),
        'ssh_key': os.environ.get('WINDOWS_VM_SSH_KEY', '~/.ssh/id_rsa'),
        'known_hosts': os.environ.get('WINDOWS_VM_KNOWN_HOSTS', '~/.ssh/known_hosts'),
    }

def build_secure_ssh_cmd(command: str) -> str:
    """Build a secure SSH command with proper host key checking"""
    cfg = get_windows_ssh_config()
    return f'''ssh -o ConnectTimeout=10 -o UserKnownHostsFile={cfg["known_hosts"]} -i {cfg["ssh_key"]} {cfg["user"]}@{cfg["ip"]} "{command}" 2>&1'''


def make_response(success: bool, data=None, message=None, status_code=200):
    """Create consistent JSON response"""
    response = {'success': success}
    if data is not None:
        response['data'] = data
    if message is not None:
        response['message'] = message
    return jsonify(response), status_code


@kvm_bp.route('/')
@require_web_auth
def kvm_management():
    """Render KVM management page"""
    return render_template('kvm_management.html')


@kvm_bp.route('/api/status', methods=['GET'])
@require_auth
def get_vm_status():
    """Get Windows VM status via virsh"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh list --all | grep {VM_NAME}',
            bypass_whitelist=True
        )
        
        if not result.get('success') and 'error' in result:
            return make_response(False, message=result.get('error'), status_code=500)
        
        output = result.get('output', '').strip()
        
        status = 'unknown'
        if 'running' in output.lower():
            status = 'running'
        elif 'shut off' in output.lower():
            status = 'stopped'
        elif 'paused' in output.lower():
            status = 'paused'
        elif not output:
            status = 'not_found'
        
        return make_response(True, {
            'vm_name': VM_NAME,
            'status': status,
            'raw_output': output
        })
        
    except Exception as e:
        logger.error(f"Error getting VM status: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/start', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def start_vm():
    """Start the Windows VM"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh start {VM_NAME}',
            bypass_whitelist=True
        )
        
        if result.get('success'):
            return make_response(True, message=f'VM {VM_NAME} started successfully')
        else:
            return make_response(False, message=result.get('error') or result.get('output'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error starting VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def stop_vm():
    """Gracefully shutdown the Windows VM"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh shutdown {VM_NAME}',
            bypass_whitelist=True
        )
        
        if result.get('success'):
            return make_response(True, message=f'VM {VM_NAME} shutdown initiated')
        else:
            return make_response(False, message=result.get('error') or result.get('output'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error stopping VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/force-stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def force_stop_vm():
    """Force stop the Windows VM"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh destroy {VM_NAME}',
            bypass_whitelist=True
        )
        
        if result.get('success'):
            return make_response(True, message=f'VM {VM_NAME} force stopped')
        else:
            return make_response(False, message=result.get('error') or result.get('output'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error force stopping VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/restart', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def restart_vm():
    """Restart the Windows VM"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh reboot {VM_NAME}',
            bypass_whitelist=True
        )
        
        if result.get('success'):
            return make_response(True, message=f'VM {VM_NAME} reboot initiated')
        else:
            return make_response(False, message=result.get('error') or result.get('output'), status_code=400)
            
    except Exception as e:
        logger.error(f"Error restarting VM: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/gpu-status', methods=['GET'])
@require_auth
def get_gpu_status():
    """Get GPU status and telemetry"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            'nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,fan.speed --format=csv,noheader,nounits',
            bypass_whitelist=True
        )
        
        gpu_data = {
            'available': False,
            'name': 'Unknown',
            'temperature': 0,
            'gpu_utilization': 0,
            'memory_utilization': 0,
            'memory_used_mb': 0,
            'memory_total_mb': 0,
            'power_draw_w': 0,
            'fan_speed': 0,
            'vfio_bound': False
        }
        
        if result.get('success') and result.get('output'):
            output = result.get('output', '').strip()
            parts = [p.strip() for p in output.split(',')]
            
            if len(parts) >= 7:
                gpu_data['available'] = True
                gpu_data['name'] = parts[0]
                gpu_data['temperature'] = int(parts[1]) if parts[1].isdigit() else 0
                gpu_data['gpu_utilization'] = int(parts[2]) if parts[2].isdigit() else 0
                gpu_data['memory_utilization'] = int(parts[3]) if parts[3].isdigit() else 0
                gpu_data['memory_used_mb'] = int(float(parts[4])) if parts[4].replace('.', '').isdigit() else 0
                gpu_data['memory_total_mb'] = int(float(parts[5])) if parts[5].replace('.', '').isdigit() else 0
                gpu_data['power_draw_w'] = float(parts[6]) if parts[6].replace('.', '').isdigit() else 0
                if len(parts) >= 8:
                    gpu_data['fan_speed'] = int(parts[7]) if parts[7].isdigit() else 0
        
        vfio_result = fleet_manager.execute_command(
            HOST_ID,
            'lspci -nnk | grep -A3 "NVIDIA" | grep "vfio-pci"',
            bypass_whitelist=True
        )
        gpu_data['vfio_bound'] = bool(vfio_result.get('output', '').strip())
        
        return make_response(True, gpu_data)
        
    except Exception as e:
        logger.error(f"Error getting GPU status: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/mode', methods=['GET'])
@require_auth
def get_current_mode():
    """Get current mode (gaming/productivity)"""
    try:
        sunshine_result = fleet_manager.execute_command(
            HOST_ID,
            'pgrep -f sunshine || echo ""',
            bypass_whitelist=True
        )
        sunshine_running = bool(sunshine_result.get('output', '').strip())
        
        rdp_result = fleet_manager.execute_command(
            HOST_ID,
            'ss -tn | grep ":3389" | grep ESTAB || echo ""',
            bypass_whitelist=True
        )
        rdp_connected = bool(rdp_result.get('output', '').strip())
        
        moonlight_result = fleet_manager.execute_command(
            HOST_ID,
            'ss -un | grep ":47998\\|:47999\\|:48000" || echo ""',
            bypass_whitelist=True
        )
        moonlight_connected = bool(moonlight_result.get('output', '').strip())
        
        if moonlight_connected or sunshine_running:
            mode = 'gaming'
        elif rdp_connected:
            mode = 'productivity'
        else:
            mode = 'idle'
        
        return make_response(True, {
            'mode': mode,
            'sunshine_running': sunshine_running,
            'rdp_connected': rdp_connected,
            'moonlight_connected': moonlight_connected
        })
        
    except Exception as e:
        logger.error(f"Error getting current mode: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/mode/gaming', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def switch_to_gaming():
    """Switch to Gaming Mode (Sunshine)"""
    try:
        script_path = '/opt/homelab/deploy/local/scripts/switch-kvm-mode.sh'
        
        result = fleet_manager.execute_command(
            HOST_ID,
            f'bash {script_path} gaming 2>&1 || echo "Script not found, attempting manual switch"',
            timeout=120,
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'output': result.get('output', ''),
            'mode': 'gaming'
        }, message='Switched to Gaming Mode')
        
    except Exception as e:
        logger.error(f"Error switching to gaming mode: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/mode/productivity', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def switch_to_productivity():
    """Switch to Productivity Mode (RDP)"""
    try:
        script_path = '/opt/homelab/deploy/local/scripts/switch-kvm-mode.sh'
        
        result = fleet_manager.execute_command(
            HOST_ID,
            f'bash {script_path} productivity 2>&1 || echo "Script not found, attempting manual switch"',
            timeout=120,
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'output': result.get('output', ''),
            'mode': 'productivity'
        }, message='Switched to Productivity Mode')
        
    except Exception as e:
        logger.error(f"Error switching to productivity mode: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/diagnose', methods=['POST'])
@require_auth
def diagnose_kvm():
    """Run KVM diagnostics for gaming freezes"""
    try:
        diagnostics = {
            'checks': [],
            'warnings': [],
            'errors': []
        }
        
        vfio_result = fleet_manager.execute_command(
            HOST_ID,
            'lspci -nnk | grep -A3 "NVIDIA"',
            bypass_whitelist=True
        )
        if vfio_result.get('success'):
            output = vfio_result.get('output', '')
            if 'vfio-pci' in output:
                diagnostics['checks'].append({'name': 'VFIO Binding', 'status': 'ok', 'detail': 'GPU bound to vfio-pci'})
            elif 'nvidia' in output.lower():
                diagnostics['warnings'].append({'name': 'VFIO Binding', 'status': 'warning', 'detail': 'GPU using nvidia driver (not passed through)'})
            else:
                diagnostics['checks'].append({'name': 'VFIO Binding', 'status': 'ok', 'detail': output[:200]})
        
        hugepages_result = fleet_manager.execute_command(
            HOST_ID,
            'cat /proc/meminfo | grep -i huge',
            bypass_whitelist=True
        )
        if hugepages_result.get('success'):
            output = hugepages_result.get('output', '')
            if 'HugePages_Total' in output:
                match = re.search(r'HugePages_Total:\s+(\d+)', output)
                if match and int(match.group(1)) > 0:
                    diagnostics['checks'].append({'name': 'Hugepages', 'status': 'ok', 'detail': f'Hugepages configured: {match.group(1)}'})
                else:
                    diagnostics['warnings'].append({'name': 'Hugepages', 'status': 'warning', 'detail': 'Hugepages not configured (may affect performance)'})
        
        isolcpus_result = fleet_manager.execute_command(
            HOST_ID,
            'cat /proc/cmdline | grep -o "isolcpus=[^ ]*" || echo "not set"',
            bypass_whitelist=True
        )
        if isolcpus_result.get('success'):
            output = isolcpus_result.get('output', '').strip()
            if 'isolcpus=' in output:
                diagnostics['checks'].append({'name': 'CPU Isolation', 'status': 'ok', 'detail': output})
            else:
                diagnostics['warnings'].append({'name': 'CPU Isolation', 'status': 'warning', 'detail': 'No CPU isolation configured'})
        
        gpu_result = fleet_manager.execute_command(
            HOST_ID,
            'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null || echo "N/A"',
            bypass_whitelist=True
        )
        if gpu_result.get('success'):
            temp = gpu_result.get('output', '').strip()
            if temp.isdigit():
                temp_int = int(temp)
                if temp_int < 70:
                    diagnostics['checks'].append({'name': 'GPU Temperature', 'status': 'ok', 'detail': f'{temp}°C'})
                elif temp_int < 85:
                    diagnostics['warnings'].append({'name': 'GPU Temperature', 'status': 'warning', 'detail': f'{temp}°C (getting warm)'})
                else:
                    diagnostics['errors'].append({'name': 'GPU Temperature', 'status': 'error', 'detail': f'{temp}°C (too hot!)'})
        
        dmesg_result = fleet_manager.execute_command(
            HOST_ID,
            'dmesg | tail -100 | grep -i "vfio\\|gpu\\|nvidia\\|error\\|fail" | tail -10',
            bypass_whitelist=True
        )
        if dmesg_result.get('success'):
            output = dmesg_result.get('output', '').strip()
            if output:
                if 'error' in output.lower() or 'fail' in output.lower():
                    diagnostics['warnings'].append({'name': 'Kernel Messages', 'status': 'warning', 'detail': output[:500]})
                else:
                    diagnostics['checks'].append({'name': 'Kernel Messages', 'status': 'ok', 'detail': 'No critical errors in recent logs'})
            else:
                diagnostics['checks'].append({'name': 'Kernel Messages', 'status': 'ok', 'detail': 'No GPU/VFIO related messages'})
        
        iommu_result = fleet_manager.execute_command(
            HOST_ID,
            'dmesg | grep -i iommu | head -5',
            bypass_whitelist=True
        )
        if iommu_result.get('success'):
            output = iommu_result.get('output', '').strip()
            if 'IOMMU' in output.upper() or 'iommu' in output:
                diagnostics['checks'].append({'name': 'IOMMU', 'status': 'ok', 'detail': 'IOMMU enabled'})
            else:
                diagnostics['errors'].append({'name': 'IOMMU', 'status': 'error', 'detail': 'IOMMU may not be enabled'})
        
        return make_response(True, diagnostics)
        
    except Exception as e:
        logger.error(f"Error running diagnostics: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/logs', methods=['GET'])
@require_auth
def get_vm_logs():
    """Get recent VM-related logs"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            'journalctl -u libvirtd --no-pager -n 50 2>/dev/null || echo "No logs available"',
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'logs': result.get('output', 'No logs available')
        })
        
    except Exception as e:
        logger.error(f"Error getting VM logs: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/windows-diagnose', methods=['POST'])
@require_auth
def diagnose_windows_gaming():
    """Run gaming diagnostics on Windows VM (HAGS, Game Bar, drivers, Sunshine)"""
    try:
        vm_result = fleet_manager.execute_command(
            HOST_ID,
            f'virsh list --all | grep {VM_NAME}',
            bypass_whitelist=True
        )
        
        if 'running' not in vm_result.get('output', '').lower():
            return make_response(False, message='Windows VM is not running', status_code=400)
        
        ssh_cmd = build_secure_ssh_cmd(
            'powershell -ExecutionPolicy Bypass -File C:\\\\opt\\\\homelab\\\\scripts\\\\diagnose-gaming.ps1 -Json'
        )
        
        diag_result = fleet_manager.execute_command(
            HOST_ID,
            ssh_cmd,
            timeout=60,
            bypass_whitelist=True
        )
        
        if diag_result.get('success'):
            output = diag_result.get('output', '').strip()
            try:
                import json
                diagnostics = json.loads(output)
                return make_response(True, diagnostics)
            except:
                if 'Host key verification failed' in output:
                    return make_response(False, message='SSH host key not in known_hosts. Run: ssh-keyscan -H <WINDOWS_VM_IP> >> ~/.ssh/known_hosts', status_code=400)
                return make_response(True, {
                    'raw_output': output,
                    'note': 'Could not parse JSON - raw output returned'
                })
        else:
            return make_response(False, message=diag_result.get('error', 'Diagnostics failed'), status_code=500)
            
    except Exception as e:
        logger.error(f"Error running Windows diagnostics: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/sunshine/restart', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def restart_sunshine():
    """Restart Sunshine service on Windows VM"""
    try:
        ssh_cmd = build_secure_ssh_cmd(
            "powershell -Command \\\"Restart-Service SunshineService -Force; Start-Sleep 3; Get-Service SunshineService | Select-Object Status\\\""
        )
        
        result = fleet_manager.execute_command(
            HOST_ID,
            ssh_cmd,
            timeout=30,
            bypass_whitelist=True
        )
        
        output = result.get('output', '')
        if 'Host key verification failed' in output:
            return make_response(False, message='SSH host key not in known_hosts. Run: ssh-keyscan -H <WINDOWS_VM_IP> >> ~/.ssh/known_hosts', status_code=400)
        
        if result.get('success'):
            return make_response(True, {
                'output': output,
            }, message='Sunshine restart initiated')
        else:
            return make_response(False, message=result.get('error', 'Restart failed'), status_code=500)
            
    except Exception as e:
        logger.error(f"Error restarting Sunshine: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/vnc/status', methods=['GET'])
@require_auth
def get_vnc_status():
    """Get VNC service status on Ubuntu host"""
    try:
        # Check x11vnc and novnc status
        result = fleet_manager.execute_command(
            HOST_ID,
            '''echo "x11vnc: $(systemctl is-active x11vnc 2>/dev/null || echo 'not installed')"; echo "novnc: $(systemctl is-active novnc 2>/dev/null || echo 'not installed')"; echo "port_6080: $(ss -tlnp | grep :6080 | head -1 || echo 'not listening')"''',
            bypass_whitelist=True
        )
        
        output = result.get('output', '')
        status = {
            'x11vnc': 'unknown',
            'novnc': 'unknown',
            'port_listening': False,
            'url': None
        }
        
        if 'x11vnc: active' in output:
            status['x11vnc'] = 'running'
        elif 'x11vnc: inactive' in output:
            status['x11vnc'] = 'stopped'
        elif 'not installed' in output:
            status['x11vnc'] = 'not_installed'
            
        if 'novnc: active' in output:
            status['novnc'] = 'running'
            status['port_listening'] = True
            status['url'] = 'http://100.110.227.25:6080/vnc.html'
        elif 'novnc: inactive' in output:
            status['novnc'] = 'stopped'
            
        return make_response(True, status)
        
    except Exception as e:
        logger.error(f"Error getting VNC status: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/vnc/start', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def start_vnc():
    """Start VNC services on Ubuntu host"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            'sudo systemctl start x11vnc novnc 2>&1; sleep 2; systemctl is-active x11vnc novnc',
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'output': result.get('output', ''),
            'url': 'http://100.110.227.25:6080/vnc.html'
        }, message='VNC services started')
        
    except Exception as e:
        logger.error(f"Error starting VNC: {e}")
        return make_response(False, message=str(e), status_code=500)


@kvm_bp.route('/api/vnc/stop', methods=['POST'])
@require_auth
@require_permission(Permission.MANAGE_DOCKER)
def stop_vnc():
    """Stop VNC services on Ubuntu host"""
    try:
        result = fleet_manager.execute_command(
            HOST_ID,
            'sudo systemctl stop x11vnc novnc 2>&1',
            bypass_whitelist=True
        )
        
        return make_response(True, {
            'output': result.get('output', ''),
        }, message='VNC services stopped')
        
    except Exception as e:
        logger.error(f"Error stopping VNC: {e}")
        return make_response(False, message=str(e), status_code=500)


__all__ = ['kvm_bp']
