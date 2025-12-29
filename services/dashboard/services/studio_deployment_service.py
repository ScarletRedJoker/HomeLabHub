"""
Nebula Studio Deployment Service
Handles deployment of Studio projects to Docker, KVM, Native (systemd), and Tailscale targets
"""
import os
import json
import logging
import subprocess
import tempfile
import shutil
from typing import Dict, Any, Optional, List, Generator, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)

DOCKERFILE_TEMPLATES = {
    'python': '''FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt 2>/dev/null || true
COPY . .
{expose_cmd}
CMD {cmd}
''',
    'nodejs': '''FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production 2>/dev/null || true
COPY . .
{expose_cmd}
CMD {cmd}
''',
    'rust': '''FROM rust:slim as builder
WORKDIR /app
COPY . .
RUN cargo build --release

FROM debian:bookworm-slim
COPY --from=builder /app/target/release/{binary} /usr/local/bin/app
{expose_cmd}
CMD ["/usr/local/bin/app"]
''',
    'cpp': '''FROM gcc:latest as builder
WORKDIR /app
COPY . .
RUN g++ -O3 -o app main.cpp

FROM debian:bookworm-slim
COPY --from=builder /app/app /usr/local/bin/app
{expose_cmd}
CMD ["/usr/local/bin/app"]
''',
    'csharp': '''FROM mcr.microsoft.com/dotnet/sdk:8.0 AS builder
WORKDIR /app
COPY . .
RUN dotnet publish -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=builder /out .
{expose_cmd}
ENTRYPOINT ["dotnet", "{dll}"]
''',
    'typescript': '''FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production 2>/dev/null || true
COPY . .
RUN npm run build 2>/dev/null || true
{expose_cmd}
CMD {cmd}
''',
    'go': '''FROM golang:1.21 as builder
WORKDIR /app
COPY . .
RUN go build -o app .

FROM debian:bookworm-slim
COPY --from=builder /app/app /usr/local/bin/app
{expose_cmd}
CMD ["/usr/local/bin/app"]
''',
    'bash': '''FROM ubuntu:22.04
WORKDIR /app
COPY . .
RUN chmod +x *.sh
{expose_cmd}
CMD ["./main.sh"]
''',
    'electron': '''FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
{expose_cmd}
CMD ["npm", "start"]
''',
    'tauri': '''FROM rust:slim as builder
WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev
RUN npm install && npm run tauri build

FROM debian:bookworm-slim
COPY --from=builder /app/src-tauri/target/release/{binary} /usr/local/bin/app
{expose_cmd}
CMD ["/usr/local/bin/app"]
''',
    'gdscript': '''FROM ubuntu:22.04
WORKDIR /app
COPY . .
{expose_cmd}
CMD ["echo", "Godot projects require Godot runtime"]
''',
    'unity': '''FROM ubuntu:22.04
WORKDIR /app
COPY . .
{expose_cmd}
CMD ["echo", "Unity projects require Unity runtime"]
'''
}

SYSTEMD_SERVICE_TEMPLATE = '''[Unit]
Description={description}
After=network.target

[Service]
Type=simple
User={user}
WorkingDirectory={workdir}
ExecStart={exec_start}
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
'''

DEFAULT_TAILSCALE_DEVICES = [
    {'name': 'homelab-local', 'ip': '100.110.227.25', 'description': 'Local Ubuntu Server'},
    {'name': 'homelab-linode', 'ip': '100.66.61.51', 'description': 'Linode Cloud Server'},
    {'name': 'rdpwindows', 'ip': '100.118.44.102', 'description': 'Gaming VM (KVM)'},
]


class StudioDeploymentService:
    """Handles deployment of Nebula Studio projects"""
    
    def __init__(self):
        self.build_dir = os.path.join(tempfile.gettempdir(), 'nebula-studio-builds')
        self.deploy_dir = '/opt/nebula-studio/deployments'
        os.makedirs(self.build_dir, exist_ok=True)
    
    def get_tailscale_devices(self) -> List[Dict[str, str]]:
        """Get list of Tailscale devices"""
        try:
            result = subprocess.run(
                ['tailscale', 'status', '--json'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode == 0:
                status = json.loads(result.stdout)
                devices = []
                for peer_id, peer in status.get('Peer', {}).items():
                    if peer.get('Online', False):
                        devices.append({
                            'name': peer.get('HostName', 'unknown'),
                            'ip': peer.get('TailscaleIPs', [''])[0],
                            'os': peer.get('OS', 'unknown'),
                            'online': True
                        })
                if devices:
                    return devices
        except Exception as e:
            logger.warning(f"Could not get Tailscale devices: {e}")
        return DEFAULT_TAILSCALE_DEVICES
    
    def generate_dockerfile(
        self,
        language: str,
        project_type: str,
        files: List[Dict],
        port: Optional[int] = None
    ) -> str:
        """Generate a Dockerfile for the project"""
        template = DOCKERFILE_TEMPLATES.get(language, DOCKERFILE_TEMPLATES['python'])
        
        expose_cmd = f'EXPOSE {port}' if port else ''
        
        main_file = self._find_main_file(files, language)
        
        if language == 'python':
            if project_type == 'web':
                cmd = f'["python", "-m", "flask", "run", "--host=0.0.0.0", "--port={port or 5000}"]'
            else:
                cmd = f'["python", "{main_file}"]'
        elif language == 'nodejs':
            cmd = '["npm", "start"]'
        elif language == 'rust':
            binary = 'app'
            template = template.replace('{binary}', binary)
            cmd = '["/usr/local/bin/app"]'
        elif language == 'cpp':
            cmd = '["/usr/local/bin/app"]'
        elif language == 'csharp':
            dll = 'app.dll'
            template = template.replace('{dll}', dll)
            cmd = f'["dotnet", "{dll}"]'
        else:
            cmd = f'["python", "{main_file}"]'
        
        return template.format(expose_cmd=expose_cmd, cmd=cmd)
    
    def _find_main_file(self, files: List[Dict], language: str) -> str:
        """Find the main entry point file"""
        main_patterns = {
            'python': ['main.py', 'app.py', 'run.py', '__main__.py'],
            'nodejs': ['index.js', 'main.js', 'app.js', 'server.js'],
            'rust': ['main.rs', 'lib.rs'],
            'cpp': ['main.cpp', 'main.c'],
            'csharp': ['Program.cs', 'Main.cs']
        }
        
        patterns = main_patterns.get(language, main_patterns['python'])
        
        for pattern in patterns:
            for f in files:
                if f.get('file_path', '').endswith(pattern):
                    return f['file_path']
        
        return patterns[0] if patterns else 'main.py'
    
    def deploy_docker(
        self,
        project_id: str,
        project_name: str,
        language: str,
        project_type: str,
        files: List[Dict],
        build_output_path: Optional[str] = None,
        port: int = 8080,
        target_host: Optional[str] = None
    ) -> Generator[str, None, Dict[str, Any]]:
        """Deploy project as Docker container"""
        container_name = f"nebula-studio-{project_name.lower().replace(' ', '-')}"
        image_name = f"nebula-studio/{container_name}:latest"
        
        yield f"[INFO] Starting Docker deployment for {project_name}..."
        
        project_dir = os.path.join(self.build_dir, project_id)
        os.makedirs(project_dir, exist_ok=True)
        
        yield "[INFO] Writing project files..."
        for f in files:
            file_path = os.path.join(project_dir, f.get('file_path', 'unknown'))
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'w') as fp:
                fp.write(f.get('content', ''))
        
        if build_output_path and os.path.exists(build_output_path):
            yield f"[INFO] Copying build artifacts from {build_output_path}..."
            for item in os.listdir(build_output_path):
                src = os.path.join(build_output_path, item)
                dst = os.path.join(project_dir, item)
                if os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
        
        dockerfile_content = self.generate_dockerfile(language, project_type, files, port)
        dockerfile_path = os.path.join(project_dir, 'Dockerfile')
        with open(dockerfile_path, 'w') as f:
            f.write(dockerfile_content)
        yield f"[INFO] Generated Dockerfile for {language} project"
        
        if language == 'python':
            req_path = os.path.join(project_dir, 'requirements.txt')
            if not os.path.exists(req_path):
                with open(req_path, 'w') as f:
                    f.write('flask\n')
        elif language == 'nodejs':
            pkg_path = os.path.join(project_dir, 'package.json')
            if not os.path.exists(pkg_path):
                with open(pkg_path, 'w') as f:
                    json.dump({'name': container_name, 'scripts': {'start': 'node index.js'}}, f)
        
        yield "[INFO] Building Docker image..."
        try:
            build_cmd = ['docker', 'build', '-t', image_name, project_dir]
            if target_host:
                build_cmd = ['ssh', target_host] + build_cmd
            
            result = subprocess.run(
                build_cmd,
                capture_output=True,
                text=True,
                timeout=600
            )
            
            if result.returncode != 0:
                yield f"[ERROR] Docker build failed: {result.stderr}"
                return {'success': False, 'error': result.stderr}
            
            yield "[SUCCESS] Docker image built successfully"
        except subprocess.TimeoutExpired:
            yield "[ERROR] Docker build timed out"
            return {'success': False, 'error': 'Build timed out'}
        except Exception as e:
            yield f"[ERROR] Docker build error: {str(e)}"
            return {'success': False, 'error': str(e)}
        
        yield f"[INFO] Stopping existing container {container_name} if running..."
        subprocess.run(['docker', 'rm', '-f', container_name], capture_output=True)
        
        yield f"[INFO] Starting container on port {port}..."
        try:
            run_cmd = [
                'docker', 'run', '-d',
                '--name', container_name,
                '-p', f'{port}:{port}',
                '--restart', 'unless-stopped',
                image_name
            ]
            
            result = subprocess.run(run_cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                yield f"[ERROR] Failed to start container: {result.stderr}"
                return {'success': False, 'error': result.stderr}
            
            container_id = result.stdout.strip()[:12]
            yield f"[SUCCESS] Container started: {container_id}"
            
            url = f"http://localhost:{port}"
            if target_host:
                url = f"http://{target_host}:{port}"
            
            return {
                'success': True,
                'container_id': container_id,
                'container_name': container_name,
                'image': image_name,
                'port': port,
                'url': url
            }
            
        except Exception as e:
            yield f"[ERROR] Failed to start container: {str(e)}"
            return {'success': False, 'error': str(e)}
    
    def deploy_native(
        self,
        project_id: str,
        project_name: str,
        language: str,
        files: List[Dict],
        build_output_path: Optional[str] = None,
        target_host: str = 'localhost',
        user: str = 'evin'
    ) -> Generator[str, None, Dict[str, Any]]:
        """Deploy project as native systemd service"""
        service_name = f"nebula-studio-{project_name.lower().replace(' ', '-')}"
        
        yield f"[INFO] Starting native deployment for {project_name}..."
        
        if target_host == 'localhost' or not target_host:
            deploy_path = os.path.join(self.deploy_dir, project_id)
            os.makedirs(deploy_path, exist_ok=True)
        else:
            deploy_path = f"/opt/nebula-studio/deployments/{project_id}"
            yield f"[INFO] Creating remote directory on {target_host}..."
            result = subprocess.run(
                ['ssh', target_host, f'mkdir -p {deploy_path}'],
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                yield f"[ERROR] Failed to create remote directory: {result.stderr}"
                return {'success': False, 'error': result.stderr}
        
        yield "[INFO] Copying project files..."
        temp_dir = os.path.join(self.build_dir, f'native-{project_id}')
        os.makedirs(temp_dir, exist_ok=True)
        
        for f in files:
            file_path = os.path.join(temp_dir, f.get('file_path', 'unknown'))
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'w') as fp:
                fp.write(f.get('content', ''))
        
        if build_output_path and os.path.exists(build_output_path):
            for item in os.listdir(build_output_path):
                src = os.path.join(build_output_path, item)
                dst = os.path.join(temp_dir, item)
                if os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
        
        if target_host == 'localhost' or not target_host:
            for item in os.listdir(temp_dir):
                src = os.path.join(temp_dir, item)
                dst = os.path.join(deploy_path, item)
                if os.path.isdir(src):
                    shutil.copytree(src, dst, dirs_exist_ok=True)
                else:
                    shutil.copy2(src, dst)
        else:
            result = subprocess.run(
                ['scp', '-r', f'{temp_dir}/.', f'{target_host}:{deploy_path}/'],
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                yield f"[ERROR] Failed to copy files: {result.stderr}"
                return {'success': False, 'error': result.stderr}
        
        yield "[SUCCESS] Files deployed"
        
        main_file = self._find_main_file(files, language)
        if language == 'python':
            exec_start = f'/usr/bin/python3 {deploy_path}/{main_file}'
        elif language == 'nodejs':
            exec_start = f'/usr/bin/node {deploy_path}/{main_file}'
        elif language in ['rust', 'cpp']:
            exec_start = f'{deploy_path}/app'
        else:
            exec_start = f'/usr/bin/python3 {deploy_path}/{main_file}'
        
        service_content = SYSTEMD_SERVICE_TEMPLATE.format(
            description=f'Nebula Studio - {project_name}',
            user=user,
            workdir=deploy_path,
            exec_start=exec_start
        )
        
        service_file_path = f'/etc/systemd/system/{service_name}.service'
        
        yield "[INFO] Creating systemd service..."
        
        if target_host == 'localhost' or not target_host:
            try:
                with open(service_file_path, 'w') as f:
                    f.write(service_content)
            except PermissionError:
                yield "[WARNING] Cannot write service file directly, attempting with sudo..."
                temp_service = os.path.join(temp_dir, f'{service_name}.service')
                with open(temp_service, 'w') as f:
                    f.write(service_content)
                subprocess.run(['sudo', 'cp', temp_service, service_file_path])
        else:
            temp_service = os.path.join(temp_dir, f'{service_name}.service')
            with open(temp_service, 'w') as f:
                f.write(service_content)
            subprocess.run(
                ['scp', temp_service, f'{target_host}:/tmp/{service_name}.service'],
                capture_output=True
            )
            subprocess.run(
                ['ssh', target_host, f'sudo cp /tmp/{service_name}.service {service_file_path}'],
                capture_output=True
            )
        
        yield "[INFO] Enabling and starting service..."
        
        if target_host == 'localhost' or not target_host:
            subprocess.run(['sudo', 'systemctl', 'daemon-reload'], capture_output=True)
            subprocess.run(['sudo', 'systemctl', 'enable', service_name], capture_output=True)
            subprocess.run(['sudo', 'systemctl', 'restart', service_name], capture_output=True)
        else:
            subprocess.run(
                ['ssh', target_host, f'sudo systemctl daemon-reload && sudo systemctl enable {service_name} && sudo systemctl restart {service_name}'],
                capture_output=True
            )
        
        yield f"[SUCCESS] Service {service_name} deployed and started"
        
        return {
            'success': True,
            'service_name': service_name,
            'target_host': target_host or 'localhost',
            'deploy_path': deploy_path
        }
    
    def deploy_tailscale(
        self,
        project_id: str,
        project_name: str,
        language: str,
        project_type: str,
        files: List[Dict],
        target_device: str,
        build_output_path: Optional[str] = None,
        port: int = 8080
    ) -> Generator[str, None, Dict[str, Any]]:
        """Deploy project to a Tailscale-connected device"""
        yield f"[INFO] Starting Tailscale deployment to {target_device}..."
        
        devices = self.get_tailscale_devices()
        device = next((d for d in devices if d['name'] == target_device or d['ip'] == target_device), None)
        
        if not device:
            yield f"[ERROR] Device {target_device} not found in Tailscale network"
            return {'success': False, 'error': f'Device {target_device} not found'}
        
        target_ip = device['ip']
        yield f"[INFO] Found device: {device['name']} ({target_ip})"
        
        yield "[INFO] Testing SSH connectivity..."
        result = subprocess.run(
            ['ssh', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=no', target_ip, 'echo ok'],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            yield f"[ERROR] Cannot connect to {target_ip} via SSH"
            return {'success': False, 'error': 'SSH connection failed'}
        
        yield "[SUCCESS] SSH connection verified"
        
        if project_type == 'web':
            for log_line in self.deploy_docker(
                project_id=project_id,
                project_name=project_name,
                language=language,
                project_type=project_type,
                files=files,
                build_output_path=build_output_path,
                port=port,
                target_host=target_ip
            ):
                if isinstance(log_line, dict):
                    result = log_line
                    result['target_device'] = device['name']
                    result['target_ip'] = target_ip
                    if result.get('success'):
                        result['url'] = f"http://{target_ip}:{port}"
                    return result
                yield log_line
        else:
            for log_line in self.deploy_native(
                project_id=project_id,
                project_name=project_name,
                language=language,
                files=files,
                build_output_path=build_output_path,
                target_host=target_ip
            ):
                if isinstance(log_line, dict):
                    result = log_line
                    result['target_device'] = device['name']
                    result['target_ip'] = target_ip
                    return result
                yield log_line
        
        return {'success': False, 'error': 'Deployment did not complete'}
    
    def deploy_kvm(
        self,
        project_id: str,
        project_name: str,
        language: str,
        project_type: str,
        files: List[Dict],
        vm_name: str = 'RDPWindows',
        build_output_path: Optional[str] = None,
        port: int = 8080
    ) -> Generator[str, None, Dict[str, Any]]:
        """Deploy project to KVM virtual machine"""
        yield f"[INFO] Starting KVM deployment to {vm_name}..."
        
        kvm_tailscale_ip = '100.118.44.102'
        
        result = subprocess.run(
            ['virsh', 'domstate', vm_name],
            capture_output=True,
            text=True
        )
        
        if 'running' not in result.stdout.lower():
            yield f"[WARNING] VM {vm_name} is not running"
            yield "[INFO] Attempting to start VM..."
            start_result = subprocess.run(
                ['virsh', 'start', vm_name],
                capture_output=True,
                text=True
            )
            if start_result.returncode != 0:
                yield f"[ERROR] Failed to start VM: {start_result.stderr}"
                return {'success': False, 'error': f'VM {vm_name} is not running and could not be started'}
            yield "[SUCCESS] VM started, waiting for boot..."
            import time
            time.sleep(30)
        
        yield "[INFO] Deploying via Tailscale to KVM..."
        for log_line in self.deploy_tailscale(
            project_id=project_id,
            project_name=project_name,
            language=language,
            project_type=project_type,
            files=files,
            target_device=kvm_tailscale_ip,
            build_output_path=build_output_path,
            port=port
        ):
            if isinstance(log_line, dict):
                result = log_line
                result['vm_name'] = vm_name
                return result
            yield log_line
        
        return {'success': False, 'error': 'KVM deployment did not complete'}
    
    def get_deployment_status(
        self,
        deployment_target: str,
        container_id: Optional[str] = None,
        service_name: Optional[str] = None,
        target_host: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get status of a deployment"""
        status = {
            'running': False,
            'status': 'unknown',
            'details': {}
        }
        
        if deployment_target == 'docker' and container_id:
            try:
                result = subprocess.run(
                    ['docker', 'inspect', container_id, '--format', '{{.State.Status}}'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    container_status = result.stdout.strip()
                    status['status'] = container_status
                    status['running'] = container_status == 'running'
                    
                    logs_result = subprocess.run(
                        ['docker', 'logs', '--tail', '50', container_id],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    status['details']['logs'] = logs_result.stdout + logs_result.stderr
            except Exception as e:
                status['error'] = str(e)
        
        elif deployment_target == 'native' and service_name:
            try:
                host_cmd = []
                if target_host and target_host != 'localhost':
                    host_cmd = ['ssh', target_host]
                
                result = subprocess.run(
                    host_cmd + ['systemctl', 'is-active', service_name],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                service_status = result.stdout.strip()
                status['status'] = service_status
                status['running'] = service_status == 'active'
                
                logs_result = subprocess.run(
                    host_cmd + ['journalctl', '-u', service_name, '-n', '50', '--no-pager'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                status['details']['logs'] = logs_result.stdout
            except Exception as e:
                status['error'] = str(e)
        
        return status
    
    def stop_deployment(
        self,
        deployment_target: str,
        container_id: Optional[str] = None,
        service_name: Optional[str] = None,
        target_host: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Stop a deployment"""
        try:
            if deployment_target == 'docker' and container_id:
                result = subprocess.run(
                    ['docker', 'stop', container_id],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    return True, 'Container stopped'
                return False, result.stderr
            
            elif deployment_target == 'native' and service_name:
                host_cmd = []
                if target_host and target_host != 'localhost':
                    host_cmd = ['ssh', target_host]
                
                result = subprocess.run(
                    host_cmd + ['sudo', 'systemctl', 'stop', service_name],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    return True, 'Service stopped'
                return False, result.stderr
            
            return False, 'Unknown deployment target or missing identifier'
        except Exception as e:
            return False, str(e)
    
    def remove_deployment(
        self,
        deployment_target: str,
        container_id: Optional[str] = None,
        service_name: Optional[str] = None,
        target_host: Optional[str] = None,
        project_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Remove a deployment completely"""
        try:
            if deployment_target == 'docker' and container_id:
                subprocess.run(['docker', 'stop', container_id], capture_output=True)
                result = subprocess.run(
                    ['docker', 'rm', container_id],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode == 0:
                    return True, 'Container removed'
                return False, result.stderr
            
            elif deployment_target == 'native' and service_name:
                host_cmd = []
                if target_host and target_host != 'localhost':
                    host_cmd = ['ssh', target_host]
                
                subprocess.run(
                    host_cmd + ['sudo', 'systemctl', 'stop', service_name],
                    capture_output=True
                )
                subprocess.run(
                    host_cmd + ['sudo', 'systemctl', 'disable', service_name],
                    capture_output=True
                )
                subprocess.run(
                    host_cmd + ['sudo', 'rm', f'/etc/systemd/system/{service_name}.service'],
                    capture_output=True
                )
                subprocess.run(
                    host_cmd + ['sudo', 'systemctl', 'daemon-reload'],
                    capture_output=True
                )
                
                if project_id:
                    deploy_path = f"/opt/nebula-studio/deployments/{project_id}"
                    subprocess.run(
                        host_cmd + ['rm', '-rf', deploy_path],
                        capture_output=True
                    )
                
                return True, 'Service removed'
            
            return False, 'Unknown deployment target or missing identifier'
        except Exception as e:
            return False, str(e)


studio_deployment_service = StudioDeploymentService()
