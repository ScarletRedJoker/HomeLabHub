import os
from openai import OpenAI, AuthenticationError, RateLimitError, APIError, APIConnectionError
from typing import List, Dict, Optional, Any
import logging

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
        self.client: Optional[OpenAI] = None
        self.enabled: bool = False
        
        ai_api_key = os.environ.get('AI_INTEGRATIONS_OPENAI_API_KEY')
        ai_base_url = os.environ.get('AI_INTEGRATIONS_OPENAI_BASE_URL')
        
        if ai_api_key and ai_base_url:
            self.client = OpenAI(
                api_key=ai_api_key,
                base_url=ai_base_url
            )
            self.enabled = True
            logger.info("AI Service initialized with Replit AI Integrations")
        else:
            logger.warning("AI Service not initialized - missing API credentials. Set AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL environment variables.")
    
    def analyze_logs(self, logs: str, context: str = ""):
        """Analyze logs with AI - returns dict for consistent error handling"""
        if not self.enabled or self.client is None:
            return {
                'success': False,
                'error': 'AI service not configured',
                'message': 'Please configure AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL to use log analysis',
                'setup_url': '/settings/integrations'
            }
        
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
            
            # the newest OpenAI model is "gpt-5" which was released August 7, 2025.
            # do not change this unless explicitly requested by the user
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=[
                    {"role": "system", "content": "You are an expert DevOps engineer helping troubleshoot server and container issues."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=2048
            )
            
            return {
                'success': True,
                'analysis': response.choices[0].message.content or "No response generated"
            }
        except AuthenticationError as e:
            logger.error(f"OpenAI authentication error in analyze_logs: {e}")
            return {
                'success': False,
                'error': 'Authentication failed',
                'message': 'Your OpenAI API key may be invalid or expired'
            }
        except RateLimitError as e:
            logger.error(f"OpenAI rate limit error in analyze_logs: {e}")
            return {
                'success': False,
                'error': 'Rate limit exceeded',
                'message': 'Please try again in a few moments'
            }
        except APIConnectionError as e:
            logger.error(f"OpenAI connection error in analyze_logs: {e}")
            return {
                'success': False,
                'error': 'Connection failed',
                'message': 'Cannot connect to OpenAI API. Please check your internet connection'
            }
        except APIError as e:
            logger.error(f"OpenAI API error in analyze_logs: {e}")
            return {
                'success': False,
                'error': 'API error',
                'message': str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error analyzing logs: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unexpected error',
                'message': str(e)
            }
    
    def get_troubleshooting_advice(self, issue_description: str, service_name: str = ""):
        """Get troubleshooting advice - returns dict for consistent error handling"""
        if not self.enabled or self.client is None:
            return {
                'success': False,
                'error': 'AI service not configured',
                'message': 'Please configure AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL to use troubleshooting',
                'setup_url': '/settings/integrations'
            }
        
        try:
            prompt = f"""A user is experiencing an issue with their homelab service.
Service: {service_name if service_name else 'General'}
Issue: {issue_description}

Provide specific troubleshooting steps and potential solutions."""
            
            # the newest OpenAI model is "gpt-5" which was released August 7, 2025.
            # do not change this unless explicitly requested by the user
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=[
                    {"role": "system", "content": "You are an expert homelab administrator helping with Docker, networking, and server management."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=2048
            )
            
            return {
                'success': True,
                'advice': response.choices[0].message.content or "No response generated"
            }
        except AuthenticationError as e:
            logger.error(f"OpenAI authentication error in get_troubleshooting_advice: {e}")
            return {
                'success': False,
                'error': 'Authentication failed',
                'message': 'Your OpenAI API key may be invalid or expired'
            }
        except RateLimitError as e:
            logger.error(f"OpenAI rate limit error in get_troubleshooting_advice: {e}")
            return {
                'success': False,
                'error': 'Rate limit exceeded',
                'message': 'Please try again in a few moments'
            }
        except APIConnectionError as e:
            logger.error(f"OpenAI connection error in get_troubleshooting_advice: {e}")
            return {
                'success': False,
                'error': 'Connection failed',
                'message': 'Cannot connect to OpenAI API. Please check your internet connection'
            }
        except APIError as e:
            logger.error(f"OpenAI API error in get_troubleshooting_advice: {e}")
            return {
                'success': False,
                'error': 'API error',
                'message': str(e)
            }
        except Exception as e:
            logger.error(f"Unexpected error getting troubleshooting advice: {e}", exc_info=True)
            return {
                'success': False,
                'error': 'Unexpected error',
                'message': str(e)
            }
    
    def chat(self, message: str, conversation_history: Optional[List[Dict[str, str]]] = None) -> str:
        if not self.enabled or self.client is None:
            return "AI chat is not available. Please check API configuration."
        
        try:
            messages: List[Dict[str, str]] = [
                {"role": "system", "content": """You are Jarvis, an AI-first homelab copilot assistant. You help with:
- Docker container management and troubleshooting
- Server health monitoring and diagnostics
- Network configuration and debugging
- Log analysis and error resolution
- Service deployment and orchestration

Be concise, practical, and action-oriented. When diagnosing issues, suggest specific commands or checks the user can perform. Focus on real solutions, not just general advice."""}
            ]
            
            if conversation_history:
                messages.extend(conversation_history)
            
            messages.append({"role": "user", "content": message})
            
            # the newest OpenAI model is "gpt-5" which was released August 7, 2025.
            # do not change this unless explicitly requested by the user
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=messages,  # type: ignore
                max_completion_tokens=1024
            )
            
            return response.choices[0].message.content or "No response generated"
        except AuthenticationError as e:
            logger.error(f"OpenAI authentication error: {e}")
            return "Authentication failed. Your OpenAI API key may be invalid or expired. Please check your API key in the Replit Secrets."
        except RateLimitError as e:
            logger.error(f"OpenAI rate limit error: {e}")
            return "Rate limit exceeded. Please try again in a few moments. If this persists, check your OpenAI account usage limits."
        except APIConnectionError as e:
            logger.error(f"OpenAI connection error: {e}")
            return "Cannot connect to OpenAI API. Please check your internet connection and try again."
        except APIError as e:
            logger.error(f"OpenAI API error: {e}")
            return f"OpenAI API error: {str(e)}. Please try again or contact support if the issue persists."
        except Exception as e:
            logger.error(f"Unexpected error in AI chat: {e}", exc_info=True)
            return f"An unexpected error occurred: {str(e)}. Please try again."
    
    def generate_code(self, prompt: str, files: List[str], context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Generate production-ready code using GPT-5/GPT-4
        
        Args:
            prompt: Description of the code to generate
            files: List of file paths to modify
            context: Additional context for code generation
            
        Returns:
            Dictionary with success status, generated code, and metadata
        """
        if not self.enabled or self.client is None:
            return {
                'success': False,
                'error': 'AI code generation is not available. Please check API configuration.'
            }
        
        try:
            import re
            
            # Read existing files for context
            file_contents = {}
            for file_path in files:
                try:
                    with open(file_path, 'r') as f:
                        file_contents[file_path] = f.read()
                except FileNotFoundError:
                    file_contents[file_path] = "# New file"
            
            # Build comprehensive prompt
            system_prompt = """You are Jarvis, an expert software engineer specializing in the Homelab Dashboard project.

Project Stack:
- Backend: Flask, Python 3.11, SQLAlchemy, Alembic
- Frontend: Bootstrap 5, JavaScript (vanilla), Chart.js
- Database: PostgreSQL
- Task Queue: Celery, Redis
- Architecture: Microservices with Docker

Coding Standards:
- Always use type hints for Python functions
- Write comprehensive docstrings (Google style)
- Handle all errors with try/except and logging
- Use structured logging (logger.info/error)
- Follow PEP 8 style guide
- Write defensive code with input validation
- Add database transactions where needed
- Use environment variables for configuration

Generate production-ready, tested, well-documented code."""

            # Build user prompt with file context
            files_info = '\n'.join(f"- {fp}: {len(fc)} lines" for fp, fc in file_contents.items())
            context_snippets = '\n\n'.join(
                f"# {fp}\n{fc[:500]}..." if len(fc) > 500 else f"# {fp}\n{fc}"
                for fp, fc in file_contents.items()
            )
            
            user_prompt = f"""Task: {prompt}

Files to modify:
{files_info}

Existing code context:
```python
{context_snippets}
```

Generate complete, production-ready code that:
1. Solves the task completely
2. Maintains existing patterns and style
3. Includes error handling
4. Has type hints and docstrings
5. Is secure and tested

Return the complete code for each file wrapped in ```python code blocks."""

            # Make API call
            # the newest OpenAI model is "gpt-5" which was released August 7, 2025.
            # do not change this unless explicitly requested by the user
            response = self.client.chat.completions.create(
                model="gpt-5",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.1,  # Low temperature for consistent code
                max_completion_tokens=4000
            )
            
            generated_code = response.choices[0].message.content or ""
            
            # Parse response to extract code for each file
            code_by_file = self._parse_generated_code(generated_code, files)
            
            logger.info(f"Successfully generated code for {len(code_by_file)} files")
            
            tokens_used = response.usage.total_tokens if response.usage else 0
            
            return {
                'success': True,
                'code': code_by_file,
                'raw_response': generated_code,
                'model': 'gpt-5',
                'tokens_used': tokens_used
            }
        
        except AuthenticationError as e:
            logger.error(f"OpenAI authentication error in generate_code: {e}")
            return {
                'success': False,
                'error': 'Authentication failed. Your OpenAI API key may be invalid or expired.'
            }
        except RateLimitError as e:
            logger.error(f"OpenAI rate limit error in generate_code: {e}")
            return {
                'success': False,
                'error': 'Rate limit exceeded. Please try again in a few moments.'
            }
        except APIConnectionError as e:
            logger.error(f"OpenAI connection error in generate_code: {e}")
            return {
                'success': False,
                'error': 'Cannot connect to OpenAI API. Please check your internet connection.'
            }
        except APIError as e:
            logger.error(f"OpenAI API error in generate_code: {e}")
            return {
                'success': False,
                'error': f'OpenAI API error: {str(e)}'
            }
        except Exception as e:
            logger.error(f"Unexpected error in code generation: {e}", exc_info=True)
            return {
                'success': False,
                'error': f'Code generation failed: {str(e)}'
            }
    
    def _parse_generated_code(self, response: str, files: List[str]) -> Dict[str, str]:
        """Parse GPT response to extract code for each file
        
        Args:
            response: Raw GPT response
            files: List of expected files
            
        Returns:
            Dictionary mapping file paths to generated code
        """
        import re
        
        code_by_file = {}
        
        # Look for code blocks wrapped in ```python
        code_blocks = re.findall(r'```python\n(.*?)```', response, re.DOTALL)
        
        if len(code_blocks) == len(files):
            # One code block per file
            for i, file_path in enumerate(files):
                code_by_file[file_path] = code_blocks[i]
        elif len(code_blocks) == 1:
            # Single code block, assign to first file
            code_by_file[files[0]] = code_blocks[0]
        else:
            # Fallback: try to detect file sections in response
            for file_path in files:
                # Look for file path as a header
                pattern = rf"{re.escape(file_path)}.*?```python\n(.*?)```"
                match = re.search(pattern, response, re.DOTALL)
                if match:
                    code_by_file[file_path] = match.group(1)
                else:
                    # Last resort: use entire response for each file
                    code_by_file[file_path] = response
        
        return code_by_file
