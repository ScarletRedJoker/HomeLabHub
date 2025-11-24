from openai import OpenAI
from typing import List, Dict, Generator, Optional, Any, cast
import logging
import json
import os

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        # Initialize OpenAI client with environment-based configuration
        try:
            # Check for Replit AI Integrations first, then fallback to manual config
            api_key = os.getenv('AI_INTEGRATIONS_OPENAI_API_KEY') or os.getenv('OPENAI_API_KEY')
            base_url = os.getenv('AI_INTEGRATIONS_OPENAI_BASE_URL') or os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
            
            if not api_key:
                raise ValueError("No OpenAI API key found in environment")
            
            self.client = OpenAI(
                api_key=api_key,
                base_url=base_url
            )
            self.enabled = True
            env_type = "Replit" if os.getenv('REPL_ID') else "Production"
            logger.info(f"AI Service initialized with {env_type} OpenAI credentials")
            logger.info(f"  Base URL: {base_url}")
        except ValueError as e:
            self.client = None
            self.enabled = False
            logger.warning(f"AI Service not initialized: {e}")
        except Exception as e:
            self.client = None
            self.enabled = False
            logger.error(f"Failed to initialize AI Service: {e}")
        
        # Initialize Ollama support
        try:
            from services.ollama_service import OllamaService
            self.ollama = OllamaService()
            if self.ollama.enabled:
                logger.info("Ollama service available")
            else:
                logger.warning("Ollama service not available")
        except Exception as e:
            logger.error(f"Failed to initialize Ollama service: {e}")
            self.ollama = None
    
    def analyze_logs(self, logs: str, context: str = "") -> str:
        if not self.enabled or self.client is None:
            return "AI troubleshooting is not available. Please check API configuration."
        
        try:
            prompt = f"""You are a DevOps troubleshooting assistant. Analyze the following logs and provide:
1. A summary of what's happening
2. Any errors or warnings found
3. Potential causes
4. Recommended solutions

Context: {context if context else 'General log analysis'}

Logs:
{logs}

Provide a clear, actionable response."""
            
            # Using gpt-4o
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert DevOps engineer helping troubleshoot server and container issues."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=2048
            )
            
            return response.choices[0].message.content or "No response generated"
        except Exception as e:
            logger.error(f"Error analyzing logs with AI: {e}")
            return f"Error analyzing logs: {str(e)}"
    
    def get_troubleshooting_advice(self, issue_description: str, service_name: str = "") -> str:
        if not self.enabled or self.client is None:
            return "AI troubleshooting is not available. Please check API configuration."
        
        try:
            prompt = f"""A user is experiencing an issue with their homelab service.
Service: {service_name if service_name else 'General'}
Issue: {issue_description}

Provide specific troubleshooting steps and potential solutions."""
            
            # Using gpt-4o
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert homelab administrator helping with Docker, networking, and server management."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=2048
            )
            
            return response.choices[0].message.content or "No response generated"
        except Exception as e:
            logger.error(f"Error getting troubleshooting advice: {e}")
            return f"Error: {str(e)}"
    
    def chat(self, message: str, conversation_history: Optional[List[Dict[str, Any]]] = None, model: str = "gpt-4o") -> str:
        # Validate and default model parameter
        if not model or not isinstance(model, str):
            model = "gpt-4o"
        
        # Check if using Ollama model
        if model.startswith("ollama/"):
            if self.ollama and self.ollama.enabled:
                # Use Ollama for chat
                model_name = model.replace("ollama/", "")
                messages = self._build_chat_messages(conversation_history, message)
                try:
                    response_parts = list(self.ollama.chat(model_name, messages, stream=False))
                    return ''.join(response_parts) if response_parts else "No response generated"
                except Exception as e:
                    logger.error(f"Error in Ollama chat: {e}")
                    return f"Error using Ollama: {str(e)}"
            else:
                return "Ollama not available. Please check Ollama service configuration."
        
        # Use OpenAI for chat
        if not self.enabled or self.client is None:
            # Try Ollama as fallback if OpenAI not available
            if self.ollama and self.ollama.enabled:
                logger.info("OpenAI not available, falling back to Ollama")
                # Use default Ollama model
                messages = self._build_chat_messages(conversation_history, message)
                try:
                    response_parts = list(self.ollama.chat("llama2", messages, stream=False))
                    return ''.join(response_parts) if response_parts else "No response generated"
                except Exception as e:
                    logger.error(f"Error in Ollama fallback: {e}")
                    return f"AI service not available. Please configure OpenAI API or Ollama."
            return "AI chat is not available. Please check API configuration."
        
        try:
            messages = [
                {"role": "system", "content": """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration

Be concise, practical, and action-oriented. When diagnosing issues, suggest specific commands or checks the user can perform. Focus on real solutions, not just general advice.

Format your responses using Markdown for better readability:
- Use **bold** for important terms
- Use `code` for commands, file paths, and configuration values
- Use code blocks with language tags for multi-line code (```bash, ```python, etc.)
- Use lists for step-by-step instructions
- Use headers (##, ###) for organizing longer responses"""}
            ]
            
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({"role": "user", "content": message})
            
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_completion_tokens=2048
            )
            
            return response.choices[0].message.content or "No response generated"
        except Exception as e:
            logger.error(f"Error in AI chat: {e}")
            return f"Error: {str(e)}"
    
    def _build_chat_messages(self, conversation_history: Optional[List[Dict[str, Any]]], message: str) -> List[Dict[str, Any]]:
        """Build chat messages array for Ollama/OpenAI"""
        messages = [
            {"role": "system", "content": """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration

Be concise, practical, and action-oriented. When diagnosing issues, suggest specific commands or checks the user can perform. Focus on real solutions, not just general advice.

Format your responses using Markdown for better readability:
- Use **bold** for important terms
- Use `code` for commands, file paths, and configuration values
- Use code blocks with language tags for multi-line code (```bash, ```python, etc.)
- Use lists for step-by-step instructions
- Use headers (##, ###) for organizing longer responses"""}
        ]
        
        if conversation_history:
            messages.extend(conversation_history)
        
        messages.append({"role": "user", "content": message})
        return messages
    
    def chat_stream(self, message: str, conversation_history: Optional[List[Dict[str, Any]]] = None, model: str = "gpt-4o-mini") -> Generator[str, None, None]:
        """
        Stream chat responses using Server-Sent Events (SSE)
        Supports both OpenAI and Ollama models
        
        Yields SSE-formatted messages with JSON data
        """
        # Validate and default model parameter
        if not model or not isinstance(model, str):
            model = "gpt-4o-mini"
        
        # Detect if using Ollama model (starts with "ollama/")
        if model.startswith("ollama/"):
            model_name = model.replace("ollama/", "")
            
            if not self.ollama or not self.ollama.enabled:
                yield f"data: {json.dumps({'error': 'Ollama not available'})}\n\n"
                yield "data: [DONE]\n\n"
                return
            
            try:
                # Convert conversation history format for Ollama
                messages = [
                    {"role": "system", "content": """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration

Be concise, practical, and action-oriented. When diagnosing issues, suggest specific commands or checks the user can perform. Focus on real solutions, not just general advice.

Format your responses using Markdown for better readability:
- Use **bold** for important terms
- Use `code` for commands, file paths, and configuration values
- Use code blocks with language tags for multi-line code (```bash, ```python, etc.)
- Use lists for step-by-step instructions
- Use headers (##, ###) for organizing longer responses"""}
                ]
                
                if conversation_history:
                    messages.extend(conversation_history)
                
                messages.append({"role": "user", "content": message})
                
                # Stream from Ollama
                for chunk in self.ollama.chat(model_name, messages, stream=True):
                    yield f"data: {json.dumps({'content': chunk})}\n\n"
                
                yield "data: [DONE]\n\n"
                
            except Exception as e:
                logger.error(f"Error in Ollama chat stream: {e}")
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                yield "data: [DONE]\n\n"
            return
        
        # OpenAI streaming
        if not self.enabled or self.client is None:
            # Try Ollama as fallback if OpenAI not available
            if self.ollama and self.ollama.enabled:
                logger.info("OpenAI not available for streaming, falling back to Ollama")
                try:
                    messages = self._build_chat_messages(conversation_history, message)
                    # Use default Ollama model for fallback
                    for chunk in self.ollama.chat("llama2", messages, stream=True):
                        yield f"data: {json.dumps({'content': chunk})}\n\n"
                    yield "data: [DONE]\n\n"
                    return
                except Exception as e:
                    logger.error(f"Error in Ollama streaming fallback: {e}")
                    yield f"data: {json.dumps({'error': f'AI service not available: {str(e)}'})}\n\n"
                    yield "data: [DONE]\n\n"
                    return
            
            yield f"data: {json.dumps({'error': 'AI chat is not available. Please check API configuration.'})}\n\n"
            yield "data: [DONE]\n\n"
            return
        
        try:
            messages = [
                {"role": "system", "content": """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration

Be concise, practical, and action-oriented. When diagnosing issues, suggest specific commands or checks the user can perform. Focus on real solutions, not just general advice.

Format your responses using Markdown for better readability:
- Use **bold** for important terms
- Use `code` for commands, file paths, and configuration values
- Use code blocks with language tags for multi-line code (```bash, ```python, etc.)
- Use lists for step-by-step instructions
- Use headers (##, ###) for organizing longer responses"""}
            ]
            
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({"role": "user", "content": message})
            
            stream = self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_completion_tokens=2048,
                stream=True
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'content': content})}\n\n"
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            logger.error(f"Error in AI chat stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
    
    def get_available_models(self) -> List[Dict[str, str]]:
        """
        Get list of available AI models (OpenAI + Ollama)
        
        Returns list of models with id, name, and description
        """
        models = [
            {
                "id": "gpt-4o-mini",
                "name": "GPT-4o Mini (OpenAI)",
                "description": "Latest OpenAI model (August 2025) - Best for complex reasoning",
                "provider": "openai"
            },
            {
                "id": "gpt-4",
                "name": "GPT-4 (OpenAI)",
                "description": "Previous generation - Fast and reliable",
                "provider": "openai"
            }
        ]
        
        # Add Ollama models if available
        if self.ollama and self.ollama.enabled:
            try:
                ollama_models = self.ollama.list_models()
                for model in ollama_models:
                    models.append({
                        "id": f"ollama/{model['name']}",
                        "name": f"{model['name']} (Local)",
                        "description": f"Local Ollama model - {formatBytes(model.get('size', 0))}",
                        "provider": "ollama",
                        "size": model.get('size', 0)
                    })
            except Exception as e:
                logger.error(f"Error loading Ollama models: {e}")
        
        return models

def formatBytes(bytes):
    """Helper to format bytes to human readable"""
    gb = bytes / 1024 / 1024 / 1024
    return f"{gb:.2f} GB"
