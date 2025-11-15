import os
from openai import OpenAI
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
            logger.warning("AI Service not initialized - missing API credentials")
    
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
        except Exception as e:
            logger.error(f"Error analyzing logs with AI: {e}")
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
        except Exception as e:
            logger.error(f"Error getting troubleshooting advice: {e}")
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
        except Exception as e:
            logger.error(f"Error in AI chat: {e}")
            return f"Error: {str(e)}"
