import requests
import json
import subprocess
from typing import Dict, List, Optional
import logging
import xml.etree.ElementTree as ET
from datetime import datetime

logger = logging.getLogger(__name__)

class PlexService:
    def __init__(self, plex_url: str = "http://plex-server:32400", plex_token: Optional[str] = None):
        self.plex_url = plex_url
        self.plex_token = plex_token
        self.container_name = "plex-server"
    
    def _get_headers(self) -> Dict:
        """Get headers for Plex API requests"""
        headers = {
            "Accept": "application/json"
        }
        if self.plex_token:
            headers["X-Plex-Token"] = self.plex_token
        return headers
    
    def _make_request(self, endpoint: str, timeout: int = 10) -> Optional[Dict]:
        """Make a request to Plex API"""
        try:
            url = f"{self.plex_url}{endpoint}"
            response = requests.get(url, headers=self._get_headers(), timeout=timeout)
            
            if response.status_code == 200:
                if 'application/json' in response.headers.get('Content-Type', ''):
                    return response.json()
                else:
                    return {"raw": response.text}
            else:
                logger.warning(f"Plex API returned status {response.status_code} for {endpoint}")
                return None
        except requests.exceptions.RequestException as e:
            logger.error(f"Error making Plex API request to {endpoint}: {e}")
            return None
    
    def get_server_identity(self) -> Optional[Dict]:
        """Get Plex server identity and basic info"""
        try:
            response = requests.get(f"{self.plex_url}/identity", timeout=5)
            if response.status_code == 200:
                root = ET.fromstring(response.text)
                return {
                    "machine_identifier": root.get("machineIdentifier"),
                    "version": root.get("version"),
                    "name": root.get("friendlyName", "Plex Media Server"),
                    "platform": root.get("platform"),
                    "platform_version": root.get("platformVersion")
                }
        except Exception as e:
            logger.error(f"Error getting Plex identity: {e}")
        return None
    
    def get_server_status(self) -> Dict:
        """Get comprehensive Plex server status"""
        try:
            identity = self.get_server_identity()
            
            if not identity:
                return {
                    "status": "down",
                    "healthy": False,
                    "message": "Cannot connect to Plex server"
                }
            
            stats = self.get_container_stats()
            sessions = self.get_active_sessions()
            libraries = self.get_library_sections()
            
            return {
                "status": "healthy",
                "healthy": True,
                "server_name": identity.get("name", "Unknown"),
                "version": identity.get("version", "Unknown"),
                "platform": identity.get("platform", "Unknown"),
                "machine_id": identity.get("machine_identifier", "Unknown"),
                "active_streams": sessions.get("size", 0),
                "transcoding_sessions": sessions.get("transcoding_count", 0),
                "library_count": len(libraries) if libraries else 0,
                "cpu_percent": stats.get("cpu_percent", 0),
                "memory_percent": stats.get("memory_percent", 0),
                "memory_usage_mb": stats.get("memory_usage_mb", 0)
            }
        except Exception as e:
            logger.error(f"Error getting Plex status: {e}")
            return {
                "status": "error",
                "healthy": False,
                "message": str(e)
            }
    
    def get_active_sessions(self) -> Dict:
        """Get currently active streaming sessions"""
        try:
            data = self._make_request("/status/sessions")
            
            if not data:
                return {"size": 0, "sessions": [], "transcoding_count": 0}
            
            sessions = []
            transcoding_count = 0
            
            media_container = data.get("MediaContainer", {})
            session_list = media_container.get("Metadata", [])
            
            for session in session_list:
                user = session.get("User", {}).get("title", "Unknown")
                title = session.get("title", "Unknown")
                media_type = session.get("type", "unknown")
                
                transcode_session = session.get("TranscodeSession", {})
                is_transcoding = bool(transcode_session)
                
                if is_transcoding:
                    transcoding_count += 1
                
                sessions.append({
                    "user": user,
                    "title": title,
                    "type": media_type,
                    "state": session.get("Player", {}).get("state", "unknown"),
                    "transcoding": is_transcoding,
                    "video_decision": transcode_session.get("videoDecision", "direct play"),
                    "audio_decision": transcode_session.get("audioDecision", "direct play"),
                    "progress_percent": session.get("viewOffset", 0) / session.get("duration", 1) * 100 if session.get("duration") else 0
                })
            
            return {
                "size": len(sessions),
                "sessions": sessions,
                "transcoding_count": transcoding_count
            }
        except Exception as e:
            logger.error(f"Error getting Plex sessions: {e}")
            return {"size": 0, "sessions": [], "transcoding_count": 0}
    
    def get_library_sections(self) -> List[Dict]:
        """Get Plex library sections"""
        try:
            data = self._make_request("/library/sections")
            
            if not data:
                return []
            
            libraries = []
            media_container = data.get("MediaContainer", {})
            directory_list = media_container.get("Directory", [])
            
            for lib in directory_list:
                libraries.append({
                    "key": lib.get("key"),
                    "title": lib.get("title"),
                    "type": lib.get("type"),
                    "count": lib.get("count", 0),
                    "language": lib.get("language", "en"),
                    "uuid": lib.get("uuid"),
                    "updated_at": lib.get("updatedAt"),
                    "scanned_at": lib.get("scannedAt")
                })
            
            return libraries
        except Exception as e:
            logger.error(f"Error getting Plex libraries: {e}")
            return []
    
    def get_library_stats(self) -> Dict:
        """Get aggregate library statistics"""
        try:
            libraries = self.get_library_sections()
            
            stats = {
                "total_libraries": len(libraries),
                "movie_count": 0,
                "show_count": 0,
                "music_count": 0,
                "photo_count": 0,
                "libraries": []
            }
            
            for lib in libraries:
                lib_type = lib.get("type", "")
                count = lib.get("count", 0)
                
                if lib_type == "movie":
                    stats["movie_count"] += count
                elif lib_type == "show":
                    stats["show_count"] += count
                elif lib_type == "artist":
                    stats["music_count"] += count
                elif lib_type == "photo":
                    stats["photo_count"] += count
                
                stats["libraries"].append({
                    "name": lib.get("title"),
                    "type": lib_type,
                    "count": count
                })
            
            return stats
        except Exception as e:
            logger.error(f"Error getting library stats: {e}")
            return {
                "total_libraries": 0,
                "movie_count": 0,
                "show_count": 0,
                "music_count": 0,
                "photo_count": 0,
                "libraries": []
            }
    
    def get_container_stats(self) -> Dict:
        """Get Docker container statistics for Plex"""
        try:
            result = subprocess.run(
                ['docker', 'stats', self.container_name, '--no-stream', '--format', '{{json .}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                logger.warning(f"Container {self.container_name} stats not available")
                return {}
            
            stats_data = json.loads(result.stdout.strip())
            
            cpu_str = stats_data.get('CPUPerc', '0%').replace('%', '')
            mem_str = stats_data.get('MemPerc', '0%').replace('%', '')
            
            cpu_percent = float(cpu_str) if cpu_str else 0.0
            mem_percent = float(mem_str) if mem_str else 0.0
            
            mem_usage_str = stats_data.get('MemUsage', '0B / 0B')
            mem_usage_mb = 0.0
            
            if ' / ' in mem_usage_str:
                usage_part = mem_usage_str.split(' / ')[0]
                mem_usage_mb = self._parse_memory(usage_part)
            
            return {
                "cpu_percent": round(cpu_percent, 2),
                "memory_percent": round(mem_percent, 2),
                "memory_usage_mb": round(mem_usage_mb, 2),
                "net_io": stats_data.get('NetIO', '0B / 0B'),
                "block_io": stats_data.get('BlockIO', '0B / 0B')
            }
        except Exception as e:
            logger.error(f"Error getting container stats: {e}")
            return {}
    
    def get_transcode_sessions(self) -> List[Dict]:
        """Get detailed transcoding session information"""
        try:
            sessions_data = self.get_active_sessions()
            transcoding_sessions = []
            
            for session in sessions_data.get("sessions", []):
                if session.get("transcoding"):
                    transcoding_sessions.append({
                        "user": session.get("user"),
                        "title": session.get("title"),
                        "video_decision": session.get("video_decision"),
                        "audio_decision": session.get("audio_decision"),
                        "progress": round(session.get("progress_percent", 0), 1)
                    })
            
            return transcoding_sessions
        except Exception as e:
            logger.error(f"Error getting transcode sessions: {e}")
            return []
    
    def get_recent_activity(self, limit: int = 10) -> List[Dict]:
        """Get recent Plex activity"""
        try:
            data = self._make_request(f"/status/sessions/history/all?limit={limit}")
            
            if not data:
                return []
            
            activities = []
            media_container = data.get("MediaContainer", {})
            metadata_list = media_container.get("Metadata", [])
            
            for item in metadata_list:
                activities.append({
                    "title": item.get("title", "Unknown"),
                    "type": item.get("type", "unknown"),
                    "user": item.get("accountID", "Unknown"),
                    "viewed_at": item.get("viewedAt"),
                    "rating": item.get("rating")
                })
            
            return activities
        except Exception as e:
            logger.error(f"Error getting recent activity: {e}")
            return []
    
    def scan_library(self, section_id: str) -> bool:
        """Trigger a library scan"""
        try:
            url = f"{self.plex_url}/library/sections/{section_id}/refresh"
            response = requests.get(url, headers=self._get_headers(), timeout=30)
            
            if response.status_code == 200:
                logger.info(f"Library scan triggered for section {section_id}")
                return True
            else:
                logger.warning(f"Failed to trigger library scan: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error triggering library scan: {e}")
            return False
    
    def get_health_check(self) -> Dict:
        """Get health check status for monitoring"""
        try:
            identity = self.get_server_identity()
            
            if not identity:
                return {
                    "healthy": False,
                    "status": "down",
                    "message": "Plex server not responding"
                }
            
            sessions = self.get_active_sessions()
            stats = self.get_container_stats()
            
            health = {
                "healthy": True,
                "status": "healthy",
                "version": identity.get("version"),
                "active_streams": sessions.get("size", 0),
                "transcoding_sessions": sessions.get("transcoding_count", 0),
                "cpu_usage": stats.get("cpu_percent", 0),
                "memory_usage": stats.get("memory_percent", 0),
                "last_check": datetime.utcnow().isoformat()
            }
            
            if stats.get("cpu_percent", 0) > 90:
                health["status"] = "degraded"
                health["message"] = "High CPU usage"
            elif stats.get("memory_percent", 0) > 90:
                health["status"] = "degraded"
                health["message"] = "High memory usage"
            
            return health
        except Exception as e:
            logger.error(f"Error in health check: {e}")
            return {
                "healthy": False,
                "status": "error",
                "message": str(e)
            }
    
    def _parse_memory(self, mem_str: str) -> float:
        """Parse memory string like '123.4MiB' or '1.5GiB' to MB"""
        mem_str = mem_str.strip()
        try:
            if 'GiB' in mem_str:
                return float(mem_str.replace('GiB', '')) * 1024
            elif 'MiB' in mem_str:
                return float(mem_str.replace('MiB', ''))
            elif 'KiB' in mem_str:
                return float(mem_str.replace('KiB', '')) / 1024
            elif 'B' in mem_str:
                return float(mem_str.replace('B', '')) / (1024 * 1024)
            else:
                return 0.0
        except ValueError:
            return 0.0
