from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam
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
                logger.debug("Ollama service not available (optional)")
        except Exception as e:
            logger.error(f"Failed to initialize Ollama service: {e}")
            self.ollama = None
        
        # Initialize codebase access
        self.codebase = None
        try:
            from services.jarvis_codebase_service import jarvis_codebase
            self.codebase = jarvis_codebase
            if self.codebase.enabled:
                logger.info(f"Codebase access enabled: {self.codebase.project_root}")
        except Exception as e:
            logger.warning(f"Codebase access not available: {e}")
    
    def _get_system_prompt(self) -> str:
        """Get the Jarvis system prompt with codebase context if available"""
        base_prompt = """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration
- **Direct codebase access and modification**

Be concise, practical, and action-oriented. When diagnosing issues, suggest specific commands or checks the user can perform. Focus on real solutions, not just general advice.

Format your responses using Markdown for better readability:
- Use **bold** for important terms
- Use `code` for commands, file paths, and configuration values
- Use code blocks with language tags for multi-line code (```bash, ```python, etc.)
- Use lists for step-by-step instructions
- Use headers (##, ###) for organizing longer responses"""

        # Add codebase context if available
        if self.codebase and self.codebase.enabled:
            codebase_context = f"""

## Codebase Access
You have DIRECT ACCESS to the HomeLabHub codebase at `{self.codebase.project_root}`.

You can:
- **Browse files**: List directories, view file structure
- **Read code**: Read any file in the codebase
- **Edit code**: Modify existing files (creates automatic backups)
- **Create files**: Add new files to the project
- **Search code**: Search for patterns using regex
- **Git status**: Check current git status and changes

When a user asks about the code, bots, or services, you can directly read and analyze the actual source code. When they ask you to fix something, you can directly edit the files.

Key project directories:
- `services/dashboard/` - Flask dashboard (Python)
- `services/discord-bot/` - Discord bot (Node.js)
- `services/stream-bot/` - Stream bot for Twitch/Kick/YouTube (Node.js)
- `deploy/` - Docker Compose and deployment configs

To access code, use the Codebase API endpoints available at `/api/jarvis/codebase/`."""
            return base_prompt + codebase_context
        
        return base_prompt
    
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
                max_tokens=2048
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
                max_tokens=2048
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
            system_prompt = self._get_system_prompt()
            messages = [
                {"role": "system", "content": system_prompt}
            ]
            
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({"role": "user", "content": message})
            
            response = self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=2048
            )
            
            return response.choices[0].message.content or "No response generated"
        except Exception as e:
            logger.error(f"Error in AI chat: {e}")
            return f"Error: {str(e)}"
    
    def _build_chat_messages(self, conversation_history: Optional[List[Dict[str, Any]]], message: str) -> List[Dict[str, Any]]:
        """Build chat messages array for Ollama/OpenAI"""
        system_prompt = self._get_system_prompt()
        messages = [
            {"role": "system", "content": system_prompt}
        ]
        
        if conversation_history:
            messages.extend(conversation_history)
        
        messages.append({"role": "user", "content": message})
        return messages
    
    def chat_stream(self, message: str, conversation_history: Optional[List[Dict[str, Any]]] = None, model: str = "gpt-4o") -> Generator[str, None, None]:
        """
        Stream chat responses using Server-Sent Events (SSE)
        Supports both OpenAI and Ollama models
        
        Yields SSE-formatted messages with JSON data
        """
        # Validate and default model parameter
        if not model or not isinstance(model, str):
            model = "gpt-4o"
        
        # Detect if using Ollama model (starts with "ollama/")
        if model.startswith("ollama/"):
            model_name = model.replace("ollama/", "")
            
            if not self.ollama or not self.ollama.enabled:
                yield f"data: {json.dumps({'error': 'Ollama not available'})}\n\n"
                yield "data: [DONE]\n\n"
                return
            
            try:
                # Convert conversation history format for Ollama
                system_prompt = self._get_system_prompt()
                messages = [
                    {"role": "system", "content": system_prompt}
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
            system_prompt = self._get_system_prompt()
            messages = [
                {"role": "system", "content": system_prompt}
            ]
            
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({"role": "user", "content": message})
            
            stream = self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=2048,
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
                "id": "gpt-4o",
                "name": "GPT-4o (OpenAI)",
                "description": "Latest OpenAI model - Best for complex reasoning",
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

    def chat_autonomous(self, message: str, conversation_history: Optional[List[Dict[str, Any]]] = None, 
                         model: str = "gpt-4o", max_tool_calls: int = 5) -> Dict[str, Any]:
        """
        Autonomous chat with tool calling - Jarvis can execute real commands
        Returns both the response and any tool execution results
        """
        if not self.enabled or self.client is None:
            return {
                "success": False,
                "response": "AI service not available",
                "tool_calls": []
            }
        
        try:
            from services.jarvis_tool_executor import jarvis_tool_executor, TOOL_DEFINITIONS
            
            system_prompt = self._get_autonomous_system_prompt()
            messages = [{"role": "system", "content": system_prompt}]
            
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({"role": "user", "content": message})
            
            tool_results = []
            iterations = 0
            
            while iterations < max_tool_calls:
                iterations += 1
                
                response = self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                    max_tokens=2048
                )
                
                assistant_message = response.choices[0].message
                
                if not assistant_message.tool_calls:
                    return {
                        "success": True,
                        "response": assistant_message.content or "Task completed.",
                        "tool_calls": tool_results
                    }
                
                messages.append({
                    "role": "assistant",
                    "content": assistant_message.content,
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments
                            }
                        }
                        for tc in assistant_message.tool_calls
                    ]
                })
                
                for tool_call in assistant_message.tool_calls:
                    tool_name = tool_call.function.name
                    try:
                        arguments = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError:
                        arguments = {}
                    
                    logger.info(f"Executing tool: {tool_name} with args: {arguments}")
                    result = jarvis_tool_executor.execute_tool(tool_name, arguments)
                    
                    tool_result_record = {
                        "tool": tool_name,
                        "arguments": arguments,
                        "success": result.success,
                        "output": result.output,
                        "error": result.error,
                        "execution_time": result.execution_time,
                        "host": result.host
                    }
                    tool_results.append(tool_result_record)
                    
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps({
                            "success": result.success,
                            "output": result.output,
                            "error": result.error
                        })
                    })
            
            return {
                "success": True,
                "response": "Maximum tool calls reached. Here are the results so far.",
                "tool_calls": tool_results
            }
            
        except Exception as e:
            logger.error(f"Error in autonomous chat: {e}", exc_info=True)
            return {
                "success": False,
                "response": f"Error: {str(e)}",
                "tool_calls": []
            }
    
    def _get_autonomous_system_prompt(self) -> str:
        """System prompt for autonomous mode with tool execution"""
        return """You are Jarvis, an autonomous AI homelab assistant with REAL command execution capabilities.

You have access to tools that let you ACTUALLY execute commands and gather information:
- **git_status**: Check git repository status
- **git_log**: View commit history
- **docker_containers**: List running containers on any host
- **docker_logs**: Get container logs
- **check_service_health**: Check if services are healthy
- **analyze_logs**: Search logs for errors/patterns
- **system_resources**: Check CPU, memory, disk usage
- **fleet_command**: Execute commands on remote hosts (linode, ubuntu)
- **restart_container**: Restart a Docker container
- **network_check**: Test network connectivity

When a user asks you to check something, diagnose an issue, or gather information:
1. USE THE TOOLS to actually execute commands and get real data
2. Analyze the real output and provide insights
3. If you find issues, explain them and suggest fixes
4. For fixes that require action, use the appropriate tool

DO NOT just describe what you would do - ACTUALLY DO IT using the tools.
Be proactive: if checking one thing reveals another potential issue, investigate it.

Available hosts:
- local: The current server (Linode cloud)
- linode: Linode cloud server (100.66.61.51)
- ubuntu: Local Ubuntu server (100.110.227.25)

## CRITICAL: Response Format After Tool Execution

When tools are executed, you MUST:
1. **Summarize results in 1-2 sentences** (e.g., "✅ All 8 containers are running healthy" or "⚠️ Found 3 errors in the dashboard logs")
2. **Highlight any issues that need attention** with clear indicators (✅ healthy, ⚠️ warning, ❌ error)
3. **Suggest next steps if relevant** (e.g., "Would you like me to check logs for any specific service?")
4. **Keep technical details minimal** unless the user specifically asks for raw output

DO NOT just repeat or dump raw tool output. Provide actionable insights.

### Good Response Examples:
- "✅ All 8 containers are running healthy on Linode. The dashboard has been up for 4 hours. Would you like me to check logs for any specific service?"
- "⚠️ Found 2 issues: Redis is using 85% memory and Plex hasn't been accessed in 3 days. Should I investigate the Redis memory usage?"
- "❌ The nginx container crashed 10 minutes ago. I can see a config syntax error in the logs. Want me to show the specific error and suggest a fix?"

### Bad Response Examples (AVOID):
- Dumping 50 lines of docker ps output
- Showing raw JSON responses without interpretation
- Listing every container's full details when user just asked "are things working?"

Be conversational, helpful, and action-oriented. Users want insights, not data dumps."""


def formatBytes(bytes):
    """Helper to format bytes to human readable"""
    gb = bytes / 1024 / 1024 / 1024
    return f"{gb:.2f} GB"
