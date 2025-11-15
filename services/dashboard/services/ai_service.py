import os
from openai import OpenAI, AuthenticationError, RateLimitError, APIError, APIConnectionError
from typing import List, Dict
import logging

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self):
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
            self.client = None
            self.enabled = False
            logger.warning("AI Service not initialized - missing API credentials. Set AI_INTEGRATIONS_OPENAI_API_KEY and AI_INTEGRATIONS_OPENAI_BASE_URL environment variables.")
    
    def analyze_logs(self, logs: str, context: str = "") -> str:
        if not self.enabled:
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
            
            return response.choices[0].message.content or "No response generated"
        except AuthenticationError as e:
            logger.error(f"OpenAI authentication error in analyze_logs: {e}")
            return "Authentication failed. Your OpenAI API key may be invalid or expired."
        except RateLimitError as e:
            logger.error(f"OpenAI rate limit error in analyze_logs: {e}")
            return "Rate limit exceeded. Please try again in a few moments."
        except APIConnectionError as e:
            logger.error(f"OpenAI connection error in analyze_logs: {e}")
            return "Cannot connect to OpenAI API. Please check your internet connection."
        except APIError as e:
            logger.error(f"OpenAI API error in analyze_logs: {e}")
            return f"OpenAI API error: {str(e)}"
        except Exception as e:
            logger.error(f"Unexpected error analyzing logs: {e}", exc_info=True)
            return f"Error analyzing logs: {str(e)}"
    
    def get_troubleshooting_advice(self, issue_description: str, service_name: str = "") -> str:
        if not self.enabled:
            return "AI troubleshooting is not available. Please check API configuration."
        
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
            
            return response.choices[0].message.content or "No response generated"
        except AuthenticationError as e:
            logger.error(f"OpenAI authentication error in get_troubleshooting_advice: {e}")
            return "Authentication failed. Your OpenAI API key may be invalid or expired."
        except RateLimitError as e:
            logger.error(f"OpenAI rate limit error in get_troubleshooting_advice: {e}")
            return "Rate limit exceeded. Please try again in a few moments."
        except APIConnectionError as e:
            logger.error(f"OpenAI connection error in get_troubleshooting_advice: {e}")
            return "Cannot connect to OpenAI API. Please check your internet connection."
        except APIError as e:
            logger.error(f"OpenAI API error in get_troubleshooting_advice: {e}")
            return f"OpenAI API error: {str(e)}"
        except Exception as e:
            logger.error(f"Unexpected error getting troubleshooting advice: {e}", exc_info=True)
            return f"Error: {str(e)}"
    
    def chat(self, message: str, conversation_history: List[Dict] = None) -> str:
        if not self.enabled:
            return "AI chat is not available. Please check API configuration."
        
        try:
            messages = [
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
                messages=messages,
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
