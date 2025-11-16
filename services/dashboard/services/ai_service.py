import os
from openai import OpenAI, AuthenticationError, RateLimitError, APIError, APIConnectionError
from typing import List, Dict, Optional, Any
import logging

from utils.nlp_helpers import (
    extract_domain, extract_ip_address, extract_ip_or_domain,
    parse_dns_record, extract_app_name, extract_backup_type,
    parse_mount_command, extract_network_range, generate_subdomain,
    detect_command_intent
)

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
        
        # Initialize service dependencies (lazy import to avoid circular dependencies)
        self._dns_service = None
        self._nas_service = None
        self._marketplace_service = None
    
    @property
    def dns_service(self):
        """Lazy load DNS service"""
        if self._dns_service is None:
            from services.dns_service import LocalDNSService
            self._dns_service = LocalDNSService()
        return self._dns_service
    
    @property
    def nas_service(self):
        """Lazy load NAS service"""
        if self._nas_service is None:
            from services.nas_service import NASDiscoveryService
            self._nas_service = NASDiscoveryService()
        return self._nas_service
    
    @property
    def marketplace_service(self):
        """Lazy load Marketplace service"""
        if self._marketplace_service is None:
            from services.marketplace_service import MarketplaceService
            self._marketplace_service = MarketplaceService()
        return self._marketplace_service
    
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
    
    # ============================================
    # Voice Command Handlers
    # ============================================
    
    def handle_dns_commands(self, user_input: str) -> Dict[str, Any]:
        """
        Handle DNS-related voice commands
        
        Examples:
            - "Jarvis, create DNS zone example.com"
            - "Jarvis, add A record nas.example.com pointing to 192.168.1.100"
            - "Jarvis, enable DynDNS for nas.example.com"
            - "Jarvis, show my DNS zones"
            - "Jarvis, delete DNS record nas.example.com"
        
        Args:
            user_input: Natural language command
            
        Returns:
            Response dictionary with success status and message
        """
        try:
            user_input_lower = user_input.lower()
            
            # Create DNS zone
            if "create zone" in user_input_lower or "add zone" in user_input_lower:
                zone = extract_domain(user_input)
                if not zone:
                    return {
                        'success': False,
                        'response': "I couldn't find a valid domain name in your command. Please specify a domain like 'example.com'.",
                        'type': 'error'
                    }
                
                success, result = self.dns_service.create_zone(zone)
                if success:
                    return {
                        'success': True,
                        'response': f"✓ DNS zone '{zone}' created successfully!",
                        'type': 'success',
                        'data': result
                    }
                else:
                    return {
                        'success': False,
                        'response': f"✗ Failed to create zone: {result}",
                        'type': 'error'
                    }
            
            # Add DNS record
            elif "add record" in user_input_lower or "create record" in user_input_lower:
                record_data = parse_dns_record(user_input)
                
                if not record_data.get('name') or not record_data.get('content'):
                    return {
                        'success': False,
                        'response': "I couldn't parse the DNS record details. Please try: 'add A record name.example.com pointing to 192.168.1.1'",
                        'type': 'error'
                    }
                
                # Extract zone from FQDN
                zone_parts = record_data['name'].split('.')
                if len(zone_parts) >= 2:
                    zone = '.'.join(zone_parts[-2:])
                else:
                    zone = record_data['name']
                
                success, result = self.dns_service.create_record(
                    zone=zone,
                    name=record_data['name'],
                    rtype=record_data['type'],
                    content=record_data['content'],
                    ttl=record_data.get('ttl', 300)
                )
                
                if success:
                    return {
                        'success': True,
                        'response': f"✓ DNS record added: {record_data['name']} → {record_data['content']} ({record_data['type']})",
                        'type': 'success',
                        'data': result
                    }
                else:
                    return {
                        'success': False,
                        'response': f"✗ Failed to add DNS record: {result}",
                        'type': 'error'
                    }
            
            # List DNS zones
            elif "show zones" in user_input_lower or "list zones" in user_input_lower or "my zones" in user_input_lower:
                success, result = self.dns_service.list_zones()
                
                if not success:
                    return {
                        'success': False,
                        'response': f"✗ Failed to retrieve zones: {result}",
                        'type': 'error'
                    }
                
                if not result or len(result) == 0:
                    return {
                        'success': True,
                        'response': "You don't have any DNS zones yet. Try: 'create DNS zone example.com'",
                        'type': 'info'
                    }
                
                zone_names = [z.get('name', z.get('id', 'Unknown')) for z in result]
                return {
                    'success': True,
                    'response': f"Your DNS zones: {', '.join(zone_names)}",
                    'type': 'success',
                    'data': result
                }
            
            # Delete DNS zone
            elif "delete zone" in user_input_lower or "remove zone" in user_input_lower:
                zone = extract_domain(user_input)
                if not zone:
                    return {
                        'success': False,
                        'response': "Please specify which zone to delete.",
                        'type': 'error'
                    }
                
                success, result = self.dns_service.delete_zone(zone)
                if success:
                    return {
                        'success': True,
                        'response': f"✓ DNS zone '{zone}' deleted successfully!",
                        'type': 'success'
                    }
                else:
                    return {
                        'success': False,
                        'response': f"✗ Failed to delete zone: {result}",
                        'type': 'error'
                    }
            
            else:
                return {
                    'success': False,
                    'response': "I didn't understand that DNS command. Try: 'create zone example.com' or 'add A record nas.example.com pointing to 192.168.1.1'",
                    'type': 'error'
                }
        
        except Exception as e:
            logger.error(f"Error handling DNS command: {e}", exc_info=True)
            return {
                'success': False,
                'response': f"Error processing DNS command: {str(e)}",
                'type': 'error'
            }
    
    def handle_nas_commands(self, user_input: str) -> Dict[str, Any]:
        """
        Handle NAS-related voice commands
        
        Examples:
            - "Jarvis, scan network for my NAS"
            - "Jarvis, mount share from 192.168.1.100"
            - "Jarvis, show my NAS devices"
        
        Args:
            user_input: Natural language command
            
        Returns:
            Response dictionary with success status and message
        """
        try:
            user_input_lower = user_input.lower()
            
            # Scan for NAS devices
            if "scan" in user_input_lower and "nas" in user_input_lower:
                network_range = extract_network_range(user_input)
                logger.info(f"Scanning network {network_range} for NAS devices")
                
                devices = self.nas_service.scan_network(network_range)
                
                if not devices or len(devices) == 0:
                    return {
                        'success': True,
                        'response': f"No NAS devices found on network {network_range}. Make sure your NAS is powered on and connected.",
                        'type': 'info'
                    }
                
                device_list = []
                for device in devices:
                    device_type = device.get('device_type', 'Unknown')
                    ip = device.get('ip_address', 'Unknown IP')
                    device_list.append(f"{device_type.capitalize()} at {ip}")
                
                return {
                    'success': True,
                    'response': f"✓ Found {len(devices)} NAS device(s): {', '.join(device_list)}",
                    'type': 'success',
                    'data': devices
                }
            
            # Mount NAS share
            elif "mount" in user_input_lower:
                mount_data = parse_mount_command(user_input)
                
                if not mount_data.get('ip_address'):
                    return {
                        'success': False,
                        'response': "Please specify the NAS IP address. Try: 'mount share from 192.168.1.100'",
                        'type': 'error'
                    }
                
                return {
                    'success': True,
                    'response': f"✓ Mount command parsed: {mount_data.get('share_name', 'share')} from {mount_data['ip_address']}. NAS mount functionality coming soon!",
                    'type': 'info',
                    'data': mount_data
                }
            
            # Show NAS devices
            elif "show nas" in user_input_lower or "list nas" in user_input_lower:
                return {
                    'success': True,
                    'response': "To scan for NAS devices, say: 'scan network for NAS'",
                    'type': 'info'
                }
            
            else:
                return {
                    'success': False,
                    'response': "I didn't understand that NAS command. Try: 'scan network for NAS' or 'mount share from 192.168.1.100'",
                    'type': 'error'
                }
        
        except Exception as e:
            logger.error(f"Error handling NAS command: {e}", exc_info=True)
            return {
                'success': False,
                'response': f"Error processing NAS command: {str(e)}",
                'type': 'error'
            }
    
    def handle_marketplace_commands(self, user_input: str) -> Dict[str, Any]:
        """
        Handle marketplace app deployment commands
        
        Examples:
            - "Jarvis, install Nextcloud"
            - "Jarvis, deploy Jellyfin"
            - "Jarvis, show available apps"
            - "Jarvis, what apps are installed?"
        
        Args:
            user_input: Natural language command
            
        Returns:
            Response dictionary with success status and message
        """
        try:
            user_input_lower = user_input.lower()
            
            # Install/deploy app
            if "install" in user_input_lower or "deploy" in user_input_lower:
                app_name = extract_app_name(user_input)
                
                if not app_name:
                    return {
                        'success': False,
                        'response': "Which app would you like to install? Try: 'install Nextcloud' or 'show available apps'",
                        'type': 'error'
                    }
                
                # Search for template
                templates = self.marketplace_service.search_templates(app_name)
                
                if not templates or len(templates) == 0:
                    return {
                        'success': False,
                        'response': f"App '{app_name}' not found in marketplace. Try: 'show available apps'",
                        'type': 'error'
                    }
                
                template = templates[0]
                subdomain = generate_subdomain(app_name)
                
                # Deploy the container
                success, message = self.marketplace_service.deploy_container(
                    template_id=template['id'],
                    subdomain=subdomain,
                    custom_config={}
                )
                
                if success:
                    return {
                        'success': True,
                        'response': f"✓ Deploying {template.get('display_name', app_name)}! Your app will be ready at https://{subdomain}.yourdomain.com in about 45 seconds.",
                        'type': 'success',
                        'data': {'app': app_name, 'subdomain': subdomain}
                    }
                else:
                    return {
                        'success': False,
                        'response': f"✗ Failed to deploy {app_name}: {message}",
                        'type': 'error'
                    }
            
            # List available apps
            elif "show apps" in user_input_lower or "list apps" in user_input_lower or "available apps" in user_input_lower:
                templates = self.marketplace_service.get_featured_templates()
                
                if not templates or len(templates) == 0:
                    return {
                        'success': True,
                        'response': "No apps available in the marketplace yet.",
                        'type': 'info'
                    }
                
                app_names = [t.get('display_name', t.get('name', 'Unknown')) for t in templates[:10]]
                return {
                    'success': True,
                    'response': f"Available apps: {', '.join(app_names)}. Say 'install [app name]' to deploy one!",
                    'type': 'success',
                    'data': templates
                }
            
            # List installed apps
            elif "installed" in user_input_lower or "my apps" in user_input_lower or "what's running" in user_input_lower:
                return {
                    'success': True,
                    'response': "Deployed apps feature coming soon! For now, check the Marketplace dashboard.",
                    'type': 'info'
                }
            
            else:
                return {
                    'success': False,
                    'response': "I didn't understand that marketplace command. Try: 'install Nextcloud' or 'show available apps'",
                    'type': 'error'
                }
        
        except Exception as e:
            logger.error(f"Error handling marketplace command: {e}", exc_info=True)
            return {
                'success': False,
                'response': f"Error processing marketplace command: {str(e)}",
                'type': 'error'
            }
    
    async def process_chat(self, user_input: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Main chat processing with intelligent command routing
        
        Routes voice commands to specialized handlers or falls back to AI chat
        
        Args:
            user_input: User's natural language input
            context: Optional conversation context
            
        Returns:
            Response dictionary with success status and message
        """
        if not user_input or not isinstance(user_input, str):
            return {
                'success': False,
                'response': "Please provide a valid command.",
                'type': 'error'
            }
        
        user_input_lower = user_input.lower()
        
        # Remove "Jarvis" prefix if present
        user_input_clean = user_input_lower.replace('jarvis,', '').replace('jarvis', '').strip()
        
        # Detect command intent
        intent = detect_command_intent(user_input_clean)
        
        logger.info(f"Processing chat with intent: {intent}")
        
        try:
            # Route to specialized command handlers
            if intent == 'dns':
                return self.handle_dns_commands(user_input_clean)
            
            elif intent == 'nas':
                return self.handle_nas_commands(user_input_clean)
            
            elif intent == 'marketplace':
                return self.handle_marketplace_commands(user_input_clean)
            
            # Default: Use AI chat for general queries
            else:
                response = self.chat(user_input, context.get('history', []) if context else [])
                return {
                    'success': True,
                    'response': response,
                    'type': 'chat'
                }
        
        except Exception as e:
            logger.error(f"Error in process_chat: {e}", exc_info=True)
            return {
                'success': False,
                'response': f"I encountered an error: {str(e)}",
                'type': 'error'
            }
