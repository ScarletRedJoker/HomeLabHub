"""Smart Home Control API Routes with CSRF Protection, Rate Limiting, and Real-time Updates"""
from flask import Blueprint, jsonify, request, render_template, make_response
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_wtf.csrf import CSRFProtect, generate_csrf
import logging
import re
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

from services.home_assistant_service import home_assistant_service
from services.websocket_service import websocket_service
from utils.auth import require_auth

logger = logging.getLogger(__name__)

smart_home_bp = Blueprint('smart_home', __name__, url_prefix='/smarthome')

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["1000 per hour"],
    storage_uri="memory://"
)


def add_security_headers(response):
    """Add security headers to response"""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    return response


@smart_home_bp.after_request
def after_request(response):
    """Add security headers to all responses"""
    return add_security_headers(response)


@smart_home_bp.route('/')
@require_auth
def smart_home_dashboard():
    """Render smart home control dashboard"""
    return render_template('smart_home.html')


@smart_home_bp.route('/api/csrf-token', methods=['GET'])
@require_auth
def get_csrf_token():
    """Get CSRF token for client-side requests"""
    try:
        token = generate_csrf()
        return jsonify({
            'success': True,
            'csrf_token': token
        }), 200
    except Exception as e:
        logger.error(f"Error generating CSRF token: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/devices', methods=['GET'])
@require_auth
def get_all_devices():
    """Get all smart home devices"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({
                'success': False,
                'error': 'Home Assistant not configured. Please set HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN environment variables.'
            }), 503
        
        domain_filter = request.args.get('domain')
        devices = home_assistant_service.get_devices(domain=domain_filter)
        
        return jsonify({
            'success': True,
            'devices': devices,
            'count': len(devices),
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting devices: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/devices/<domain>', methods=['GET'])
@require_auth
def get_devices_by_domain(domain: str):
    """Get devices filtered by domain"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        valid_domains = ['light', 'switch', 'sensor', 'climate', 'automation', 'scene']
        if domain not in valid_domains:
            return jsonify({
                'success': False,
                'error': f'Invalid domain. Must be one of: {", ".join(valid_domains)}'
            }), 400
        
        devices = home_assistant_service.get_devices(domain=domain)
        
        return jsonify({
            'success': True,
            'domain': domain,
            'devices': devices,
            'count': len(devices)
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting {domain} devices: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/device/<path:entity_id>', methods=['GET'])
@require_auth
def get_device_state(entity_id: str):
    """Get state of a specific device"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        state = home_assistant_service.get_state(entity_id)
        
        if not state:
            return jsonify({
                'success': False,
                'error': f'Device {entity_id} not found'
            }), 404
        
        return jsonify({
            'success': True,
            'entity_id': entity_id,
            'state': state
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting device state: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/device/<path:entity_id>/turn_on', methods=['POST'])
@require_auth
@limiter.limit("100 per minute")
def turn_on_device(entity_id: str):
    """Turn on a device with rate limiting and CSRF protection"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json() or {}
        success = home_assistant_service.turn_on(entity_id, **data)
        
        if success:
            websocket_service.broadcast_to_system({
                'type': 'device_update',
                'entity_id': entity_id,
                'action': 'turn_on',
                'timestamp': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Device {entity_id} turned on successfully")
            return jsonify({
                'success': True,
                'message': f'{entity_id} turned on',
                'entity_id': entity_id
            }), 200
        else:
            logger.warning(f"Failed to turn on device {entity_id}")
            return jsonify({
                'success': False,
                'error': 'Failed to turn on device'
            }), 500
    
    except Exception as e:
        logger.error(f"Error turning on device: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/device/<path:entity_id>/turn_off', methods=['POST'])
@require_auth
@limiter.limit("100 per minute")
def turn_off_device(entity_id: str):
    """Turn off a device with rate limiting and CSRF protection"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        success = home_assistant_service.turn_off(entity_id)
        
        if success:
            websocket_service.broadcast_to_system({
                'type': 'device_update',
                'entity_id': entity_id,
                'action': 'turn_off',
                'timestamp': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Device {entity_id} turned off successfully")
            return jsonify({
                'success': True,
                'message': f'{entity_id} turned off',
                'entity_id': entity_id
            }), 200
        else:
            logger.warning(f"Failed to turn off device {entity_id}")
            return jsonify({
                'success': False,
                'error': 'Failed to turn off device'
            }), 500
    
    except Exception as e:
        logger.error(f"Error turning off device: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/light/<path:entity_id>/brightness', methods=['POST'])
@require_auth
@limiter.limit("100 per minute")
def set_light_brightness(entity_id: str):
    """Set brightness of a light with rate limiting"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json()
        if not data or 'brightness' not in data:
            return jsonify({'success': False, 'error': 'brightness parameter required'}), 400
        
        brightness = int(data['brightness'])
        if not 0 <= brightness <= 255:
            return jsonify({'success': False, 'error': 'brightness must be between 0 and 255'}), 400
        
        success = home_assistant_service.set_brightness(entity_id, brightness)
        
        if success:
            websocket_service.broadcast_to_system({
                'type': 'device_update',
                'entity_id': entity_id,
                'action': 'set_brightness',
                'brightness': brightness,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Brightness for {entity_id} set to {brightness}")
            return jsonify({
                'success': True,
                'message': f'Brightness set to {brightness}',
                'entity_id': entity_id,
                'brightness': brightness
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to set brightness'}), 500
    
    except ValueError as e:
        return jsonify({'success': False, 'error': 'Invalid brightness value'}), 400
    except Exception as e:
        logger.error(f"Error setting brightness: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/light/<path:entity_id>/color', methods=['POST'])
@require_auth
@limiter.limit("100 per minute")
def set_light_color(entity_id: str):
    """Set color of a light with rate limiting"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json()
        if not data or 'rgb_color' not in data:
            return jsonify({'success': False, 'error': 'rgb_color parameter required (array of [r,g,b])'}), 400
        
        rgb_color = data['rgb_color']
        if not isinstance(rgb_color, list) or len(rgb_color) != 3:
            return jsonify({'success': False, 'error': 'rgb_color must be array of 3 values'}), 400
        
        success = home_assistant_service.set_color(entity_id, tuple(rgb_color))
        
        if success:
            websocket_service.broadcast_to_system({
                'type': 'device_update',
                'entity_id': entity_id,
                'action': 'set_color',
                'rgb_color': rgb_color,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Color for {entity_id} set to RGB{tuple(rgb_color)}")
            return jsonify({
                'success': True,
                'message': f'Color set to RGB{tuple(rgb_color)}',
                'entity_id': entity_id,
                'rgb_color': rgb_color
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to set color'}), 500
    
    except Exception as e:
        logger.error(f"Error setting color: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/climate/<path:entity_id>/temperature', methods=['POST'])
@require_auth
@limiter.limit("100 per minute")
def set_climate_temperature(entity_id: str):
    """Set temperature for climate device with rate limiting"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        data = request.get_json()
        if not data or 'temperature' not in data:
            return jsonify({'success': False, 'error': 'temperature parameter required'}), 400
        
        temperature = float(data['temperature'])
        success = home_assistant_service.set_temperature(entity_id, temperature)
        
        if success:
            websocket_service.broadcast_to_system({
                'type': 'device_update',
                'entity_id': entity_id,
                'action': 'set_temperature',
                'temperature': temperature,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Temperature for {entity_id} set to {temperature}")
            return jsonify({
                'success': True,
                'message': f'Temperature set to {temperature}',
                'entity_id': entity_id,
                'temperature': temperature
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to set temperature'}), 500
    
    except ValueError as e:
        return jsonify({'success': False, 'error': 'Invalid temperature value'}), 400
    except Exception as e:
        logger.error(f"Error setting temperature: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/scene/<path:entity_id>/activate', methods=['POST'])
@require_auth
@limiter.limit("100 per minute")
def activate_scene(entity_id: str):
    """Activate a scene with rate limiting"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        success = home_assistant_service.activate_scene(entity_id)
        
        if success:
            websocket_service.broadcast_to_system({
                'type': 'scene_activated',
                'entity_id': entity_id,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Scene {entity_id} activated successfully")
            return jsonify({
                'success': True,
                'message': f'Scene {entity_id} activated',
                'entity_id': entity_id
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to activate scene'}), 500
    
    except Exception as e:
        logger.error(f"Error activating scene: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/automation/<path:entity_id>/trigger', methods=['POST'])
@require_auth
@limiter.limit("100 per minute")
def trigger_automation(entity_id: str):
    """Trigger an automation with rate limiting"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({'success': False, 'error': 'Home Assistant not configured'}), 503
        
        success = home_assistant_service.trigger_automation(entity_id)
        
        if success:
            websocket_service.broadcast_to_system({
                'type': 'automation_triggered',
                'entity_id': entity_id,
                'timestamp': datetime.utcnow().isoformat()
            })
            
            logger.info(f"Automation {entity_id} triggered successfully")
            return jsonify({
                'success': True,
                'message': f'Automation {entity_id} triggered',
                'entity_id': entity_id
            }), 200
        else:
            return jsonify({'success': False, 'error': 'Failed to trigger automation'}), 500
    
    except Exception as e:
        logger.error(f"Error triggering automation: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@smart_home_bp.route('/api/automation/templates', methods=['GET'])
@require_auth
def get_automation_templates():
    """Get pre-made automation templates"""
    templates = [
        {
            'id': 'good_morning',
            'name': 'Good Morning',
            'description': 'Turn on lights, adjust temperature, start coffee maker',
            'icon': 'sun',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'bedroom_lights', 'brightness': 180},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 72},
                {'type': 'switch', 'action': 'turn_on', 'entities': 'coffee_maker'}
            ]
        },
        {
            'id': 'good_night',
            'name': 'Good Night',
            'description': 'Turn off all lights, lock doors, set security',
            'icon': 'moon',
            'actions': [
                {'type': 'light', 'action': 'turn_off', 'entities': 'all_lights'},
                {'type': 'lock', 'action': 'lock', 'entities': 'all_locks'},
                {'type': 'alarm', 'action': 'arm', 'mode': 'night'}
            ]
        },
        {
            'id': 'leaving_home',
            'name': 'Leaving Home',
            'description': 'Turn off everything, lock up, arm security',
            'icon': 'door-open',
            'actions': [
                {'type': 'light', 'action': 'turn_off', 'entities': 'all_lights'},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 65},
                {'type': 'lock', 'action': 'lock', 'entities': 'all_locks'},
                {'type': 'alarm', 'action': 'arm', 'mode': 'away'}
            ]
        },
        {
            'id': 'arriving_home',
            'name': 'Arriving Home',
            'description': 'Turn on lights, disarm security, adjust climate',
            'icon': 'house',
            'actions': [
                {'type': 'alarm', 'action': 'disarm'},
                {'type': 'light', 'action': 'turn_on', 'entities': 'entry_lights'},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 72}
            ]
        },
        {
            'id': 'movie_time',
            'name': 'Movie Time',
            'description': 'Dim lights, close blinds, turn on TV',
            'icon': 'film',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'living_room_lights', 'brightness': 50},
                {'type': 'cover', 'action': 'close', 'entities': 'living_room_blinds'},
                {'type': 'media_player', 'action': 'turn_on', 'entities': 'tv'}
            ]
        },
        {
            'id': 'party_mode',
            'name': 'Party Mode',
            'description': 'Colorful lights, music on, adjust temperature',
            'icon': 'party-horn',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'all_lights', 'effect': 'colorloop'},
                {'type': 'media_player', 'action': 'turn_on', 'entities': 'speakers'},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 70}
            ]
        },
        {
            'id': 'work_mode',
            'name': 'Work Mode',
            'description': 'Bright lights, focus temperature, quiet mode',
            'icon': 'laptop',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'office_lights', 'brightness': 255},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 68},
                {'type': 'media_player', 'action': 'turn_off', 'entities': 'all_speakers'}
            ]
        },
        {
            'id': 'dinner_time',
            'name': 'Dinner Time',
            'description': 'Warm lighting, comfortable temperature',
            'icon': 'utensils',
            'actions': [
                {'type': 'light', 'action': 'turn_on', 'entities': 'dining_room_lights', 'brightness': 150, 'color_temp': 2700},
                {'type': 'climate', 'action': 'set_temperature', 'temperature': 72}
            ]
        }
    ]
    
    return jsonify({
        'success': True,
        'templates': templates,
        'count': len(templates)
    }), 200


class VoiceCommandParser:
    """Parser for natural language voice commands with structured intent parsing"""
    
    INTENT_PATTERNS = {
        'turn_on': r'turn on|switch on|enable|activate',
        'turn_off': r'turn off|switch off|disable|deactivate',
        'set_temperature': r'set (?:the )?temperature|set (?:the )?thermostat|make it',
        'set_brightness': r'(?:set|dim|brighten) (?:the )?(?:brightness|lights?)',
        'activate_scene': r'activate|run|start',
        'good_morning': r'good morning|morning routine',
        'good_night': r'good night|night routine|bedtime',
        'movie_mode': r'movie (?:time|mode)',
    }
    
    ENTITY_PATTERNS = {
        'all_lights': r'all (?:the )?lights?|every light',
        'living_room': r'living room',
        'bedroom': r'bedroom',
        'kitchen': r'kitchen',
        'bathroom': r'bathroom',
        'office': r'office',
    }
    
    @staticmethod
    def parse_command(command: str) -> Dict[str, Any]:
        """
        Parse natural language command into structured intent
        
        Returns:
            Dict with 'intent', 'entities', 'parameters', and 'confidence'
        """
        command = command.lower().strip()
        result = {
            'original_command': command,
            'intent': None,
            'entities': [],
            'parameters': {},
            'confidence': 0.0,
            'suggestions': []
        }
        
        logger.info(f"Parsing voice command: {command}")
        
        for intent_name, pattern in VoiceCommandParser.INTENT_PATTERNS.items():
            if re.search(pattern, command, re.IGNORECASE):
                result['intent'] = intent_name
                result['confidence'] = 0.8
                logger.info(f"Matched intent: {intent_name}")
                break
        
        for entity_name, pattern in VoiceCommandParser.ENTITY_PATTERNS.items():
            if re.search(pattern, command, re.IGNORECASE):
                result['entities'].append(entity_name)
                logger.info(f"Matched entity: {entity_name}")
        
        temp_match = re.search(r'(\d+)\s*degrees?', command)
        if temp_match:
            result['parameters']['temperature'] = int(temp_match.group(1))
            logger.info(f"Extracted temperature: {result['parameters']['temperature']}")
        
        brightness_match = re.search(r'(\d+)\s*percent', command)
        if brightness_match:
            brightness_percent = int(brightness_match.group(1))
            result['parameters']['brightness'] = int(brightness_percent * 255 / 100)
            logger.info(f"Extracted brightness: {result['parameters']['brightness']}")
        
        if not result['intent']:
            result['suggestions'] = VoiceCommandParser._get_suggestions(command)
            logger.warning(f"No intent matched. Providing {len(result['suggestions'])} suggestions")
        
        return result
    
    @staticmethod
    def _get_suggestions(command: str) -> List[str]:
        """Get helpful suggestions for unrecognized commands"""
        suggestions = []
        
        if 'light' in command or 'lamp' in command:
            suggestions.extend([
                "Try: 'Turn on all lights'",
                "Try: 'Turn off living room lights'",
                "Try: 'Set brightness to 50 percent'"
            ])
        
        if 'temperature' in command or 'heat' in command or 'cold' in command:
            suggestions.extend([
                "Try: 'Set temperature to 72 degrees'",
                "Try: 'Set thermostat to 68 degrees'"
            ])
        
        if 'routine' in command or 'morning' in command or 'night' in command:
            suggestions.extend([
                "Try: 'Good morning'",
                "Try: 'Good night'",
                "Try: 'Movie time'"
            ])
        
        if not suggestions:
            suggestions = [
                "Try: 'Turn on all lights'",
                "Try: 'Set temperature to 72 degrees'",
                "Try: 'Good morning'",
                "Try: 'Movie time'"
            ]
        
        return suggestions


def validate_entity_id(entity_id: str) -> Tuple[bool, Optional[str]]:
    """
    Validate entity ID exists in Home Assistant
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not home_assistant_service.enabled:
        return False, "Home Assistant is not configured"
    
    state = home_assistant_service.get_state(entity_id)
    if not state:
        return False, f"Entity '{entity_id}' not found in Home Assistant"
    
    return True, None


@smart_home_bp.route('/api/voice/command', methods=['POST'])
@require_auth
@limiter.limit("50 per minute")
def process_voice_command():
    """
    Process natural language voice command with structured intent parsing
    
    Features:
    - Structured intent parsing
    - Entity validation before execution
    - Detailed error messages
    - Command processing logging
    - Helpful suggestions for failed commands
    """
    try:
        data = request.get_json()
        if not data or 'command' not in data:
            return jsonify({
                'success': False,
                'error': 'command parameter required',
                'example': {'command': 'turn on all lights'}
            }), 400
        
        command = data['command'].strip()
        logger.info(f"Received voice command: {command}")
        
        parsed = VoiceCommandParser.parse_command(command)
        
        response_data = {
            'success': False,
            'command': command,
            'parsed': parsed,
            'response': "I'm sorry, I didn't understand that command.",
            'timestamp': datetime.utcnow().isoformat(),
            'processing_log': []
        }
        
        if not parsed['intent']:
            response_data['processing_log'].append("No intent recognized")
            response_data['suggestions'] = parsed['suggestions']
            response_data['response'] = "I couldn't understand that command. Here are some suggestions:"
            logger.warning(f"Command not understood: {command}")
            return jsonify(response_data), 200
        
        response_data['processing_log'].append(f"Intent recognized: {parsed['intent']}")
        
        intent = parsed['intent']
        entities = parsed['entities']
        params = parsed['parameters']
        
        if intent in ['turn_on', 'turn_off']:
            action_func = home_assistant_service.turn_on if intent == 'turn_on' else home_assistant_service.turn_off
            action_text = 'turned on' if intent == 'turn_on' else 'turned off'
            
            if 'all_lights' in entities:
                lights = home_assistant_service.get_lights()
                response_data['processing_log'].append(f"Found {len(lights)} lights to control")
                
                success_count = 0
                for light in lights:
                    entity_id = light['entity_id']
                    is_valid, error = validate_entity_id(entity_id)
                    
                    if is_valid:
                        if action_func(entity_id):
                            success_count += 1
                        else:
                            response_data['processing_log'].append(f"Failed to control {entity_id}")
                    else:
                        response_data['processing_log'].append(f"Validation failed for {entity_id}: {error}")
                
                response_data['success'] = success_count > 0
                response_data['response'] = f"{success_count} out of {len(lights)} lights {action_text}"
                response_data['processing_log'].append(f"Successfully controlled {success_count} lights")
                logger.info(f"Controlled {success_count}/{len(lights)} lights via voice command")
            
            elif any(room in entities for room in ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office']):
                room = next(r for r in entities if r in ['living_room', 'bedroom', 'kitchen', 'bathroom', 'office'])
                entity_id = f'light.{room}'
                
                is_valid, error = validate_entity_id(entity_id)
                if not is_valid:
                    response_data['response'] = f"Error: {error}"
                    response_data['suggestions'] = [
                        f"Check if '{room}' light exists in Home Assistant",
                        "Try: 'Turn on all lights' instead"
                    ]
                    response_data['processing_log'].append(f"Entity validation failed: {error}")
                    logger.error(f"Entity validation failed for {entity_id}: {error}")
                    return jsonify(response_data), 200
                
                response_data['processing_log'].append(f"Validating entity: {entity_id}")
                
                if action_func(entity_id):
                    response_data['success'] = True
                    response_data['response'] = f"{room.replace('_', ' ').title()} lights {action_text}"
                    response_data['processing_log'].append(f"Successfully {action_text} {entity_id}")
                    logger.info(f"Successfully {action_text} {entity_id} via voice command")
                else:
                    response_data['response'] = f"Failed to {intent.replace('_', ' ')} {room} lights"
                    response_data['processing_log'].append(f"Action failed for {entity_id}")
        
        elif intent == 'set_temperature' and 'temperature' in params:
            temperature = params['temperature']
            response_data['processing_log'].append(f"Setting temperature to {temperature}°")
            
            climate_devices = home_assistant_service.get_climate_devices()
            if not climate_devices:
                response_data['response'] = "No climate devices found in your system"
                response_data['suggestions'] = ["Add a thermostat to Home Assistant first"]
                response_data['processing_log'].append("No climate devices available")
                logger.warning("No climate devices found for voice command")
            else:
                entity_id = climate_devices[0]['entity_id']
                is_valid, error = validate_entity_id(entity_id)
                
                if not is_valid:
                    response_data['response'] = f"Error: {error}"
                    response_data['processing_log'].append(f"Entity validation failed: {error}")
                    return jsonify(response_data), 200
                
                response_data['processing_log'].append(f"Using climate device: {entity_id}")
                
                if home_assistant_service.set_temperature(entity_id, temperature):
                    response_data['success'] = True
                    response_data['response'] = f"Temperature set to {temperature} degrees"
                    response_data['processing_log'].append(f"Successfully set temperature to {temperature}°")
                    logger.info(f"Temperature set to {temperature}° via voice command")
                else:
                    response_data['response'] = f"Failed to set temperature"
                    response_data['processing_log'].append("Temperature set action failed")
        
        elif intent in ['good_morning', 'good_night', 'movie_mode']:
            automation_map = {
                'good_morning': 'automation.good_morning',
                'good_night': 'automation.good_night',
                'movie_mode': 'automation.movie_time'
            }
            entity_id = automation_map[intent]
            
            is_valid, error = validate_entity_id(entity_id)
            if not is_valid:
                response_data['response'] = f"Routine not found: {error}"
                response_data['suggestions'] = [
                    f"Create the '{intent.replace('_', ' ')}' automation in Home Assistant first"
                ]
                response_data['processing_log'].append(f"Entity validation failed: {error}")
                logger.error(f"Automation {entity_id} not found: {error}")
                return jsonify(response_data), 200
            
            response_data['processing_log'].append(f"Triggering automation: {entity_id}")
            
            if home_assistant_service.trigger_automation(entity_id):
                responses = {
                    'good_morning': "Good morning! Starting your morning routine.",
                    'good_night': "Good night! Starting your bedtime routine.",
                    'movie_mode': "Activating movie mode. Enjoy the show!"
                }
                response_data['success'] = True
                response_data['response'] = responses[intent]
                response_data['processing_log'].append(f"Successfully triggered {intent} routine")
                logger.info(f"Triggered {intent} automation via voice command")
            else:
                response_data['response'] = f"Failed to trigger {intent.replace('_', ' ')} routine"
                response_data['processing_log'].append("Automation trigger failed")
        
        else:
            response_data['response'] = f"I understood '{intent}' but couldn't execute it with the given parameters"
            response_data['suggestions'] = parsed['suggestions']
            response_data['processing_log'].append(f"Intent {intent} recognized but execution path not implemented")
        
        if response_data['success']:
            websocket_service.broadcast_to_system({
                'type': 'voice_command_executed',
                'command': command,
                'intent': intent,
                'timestamp': datetime.utcnow().isoformat()
            })
        
        return jsonify(response_data), 200
    
    except Exception as e:
        logger.error(f"Error processing voice command: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e),
            'processing_log': [f"Exception occurred: {str(e)}"]
        }), 500


@smart_home_bp.route('/api/status', methods=['GET'])
@require_auth
def get_smart_home_status():
    """Get smart home system status"""
    try:
        if not home_assistant_service.enabled:
            return jsonify({
                'success': False,
                'status': 'disabled',
                'error': 'Home Assistant not configured'
            }), 503
        
        connected = home_assistant_service.check_connection()
        
        if not connected:
            return jsonify({
                'success': False,
                'status': 'disconnected',
                'error': 'Cannot connect to Home Assistant'
            }), 503
        
        devices = home_assistant_service.get_devices()
        lights = [d for d in devices if d['domain'] == 'light']
        switches = [d for d in devices if d['domain'] == 'switch']
        sensors = [d for d in devices if d['domain'] == 'sensor']
        climate = [d for d in devices if d['domain'] == 'climate']
        
        return jsonify({
            'success': True,
            'status': 'connected',
            'url': home_assistant_service.base_url,
            'device_counts': {
                'total': len(devices),
                'lights': len(lights),
                'switches': len(switches),
                'sensors': len(sensors),
                'climate': len(climate)
            },
            'timestamp': datetime.utcnow().isoformat()
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting status: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
