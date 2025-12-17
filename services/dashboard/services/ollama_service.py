import os
import requests
import logging
from typing import List, Dict, Optional, Generator
import json

logger = logging.getLogger(__name__)

class OllamaService:
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.environ.get('OLLAMA_BASE_URL', 'http://ollama:11434')
        self.enabled = self._check_connection()
    
    def _check_connection(self) -> bool:
        """Check if Ollama is accessible"""
        try:
            response = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def list_models(self) -> List[Dict]:
        """List all installed models"""
        try:
            response = requests.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                data = response.json()
                return data.get('models', [])
            return []
        except Exception as e:
            logger.error(f"Error listing models: {e}")
            return []
    
    def pull_model(self, model_name: str) -> Generator[Dict, None, None]:
        """Pull a model with streaming progress"""
        try:
            response = requests.post(
                f"{self.base_url}/api/pull",
                json={"name": model_name},
                stream=True
            )
            
            for line in response.iter_lines():
                if line:
                    yield json.loads(line)
        except Exception as e:
            logger.error(f"Error pulling model: {e}")
            yield {"error": str(e)}
    
    def delete_model(self, model_name: str) -> bool:
        """Delete a model"""
        try:
            response = requests.delete(
                f"{self.base_url}/api/delete",
                json={"name": model_name}
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Error deleting model: {e}")
            return False
    
    def generate(self, model: str, prompt: str, stream: bool = False) -> Generator[str, None, None]:
        """Generate text with a model"""
        try:
            response = requests.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": stream
                },
                stream=stream
            )
            
            if stream:
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line)
                        if 'response' in data:
                            yield data['response']
            else:
                data = response.json()
                yield data.get('response', '')
        except Exception as e:
            logger.error(f"Error generating text: {e}")
            yield f"Error: {str(e)}"
    
    def chat(self, model: str, messages: List[Dict], stream: bool = True) -> Generator[str, None, None]:
        """Chat with a model (conversational)"""
        try:
            response = requests.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": stream
                },
                stream=stream
            )
            
            if stream:
                for line in response.iter_lines():
                    if line:
                        data = json.loads(line)
                        if 'message' in data and 'content' in data['message']:
                            yield data['message']['content']
            else:
                data = response.json()
                if 'message' in data and 'content' in data['message']:
                    yield data['message']['content']
        except Exception as e:
            logger.error(f"Error in chat: {e}")
            yield f"Error: {str(e)}"
