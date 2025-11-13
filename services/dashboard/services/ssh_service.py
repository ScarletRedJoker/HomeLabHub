import paramiko
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)

class SSHService:
    def __init__(self, host: str, port: int, username: str, key_path: Optional[str] = None):
        self.host = host
        self.port = port
        self.username = username
        self.key_path = key_path
        self.client = None
    
    def connect(self) -> bool:
        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            
            if self.key_path:
                self.client.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username,
                    key_filename=self.key_path
                )
            else:
                self.client.connect(
                    hostname=self.host,
                    port=self.port,
                    username=self.username
                )
            
            logger.info(f"SSH connected to {self.host}:{self.port}")
            return True
        except Exception as e:
            logger.error(f"SSH connection failed: {e}")
            return False
    
    def execute_command(self, command: str) -> Tuple[bool, str, str]:
        if not self.client:
            if not self.connect():
                return False, "", "SSH not connected"
        
        try:
            stdin, stdout, stderr = self.client.exec_command(command)
            exit_status = stdout.channel.recv_exit_status()
            
            output = stdout.read().decode('utf-8')
            error = stderr.read().decode('utf-8')
            
            success = exit_status == 0
            return success, output, error
        except Exception as e:
            logger.error(f"Error executing command: {e}")
            return False, "", str(e)
    
    def disconnect(self):
        if self.client:
            self.client.close()
            logger.info("SSH disconnected")
