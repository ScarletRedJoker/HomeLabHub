"""AI Chat API - ChatGPT-style Conversational Interface"""
from flask import Blueprint, jsonify, request, Response, stream_with_context
from services.ai_service import AIService
from services.db_service import db_service
from models.jarvis import AISession
from utils.auth import require_web_auth
from datetime import datetime
import logging
import json
import uuid

logger = logging.getLogger(__name__)

ai_chat_bp = Blueprint('ai_chat', __name__, url_prefix='/api/ai')

ai_service = AIService()

@ai_chat_bp.route('/status', methods=['GET'])
@require_web_auth
def status():
    """Get AI service status"""
    try:
        return jsonify({
            "success": True,
            "enabled": ai_service.enabled,
            "openai_available": ai_service.client is not None,
            "ollama_available": ai_service.ollama.enabled if ai_service.ollama else False,
            "models": {
                "openai": ["gpt-5", "gpt-4"] if ai_service.enabled else [],
                "ollama": ai_service.ollama.list_models() if ai_service.ollama and ai_service.ollama.enabled else []
            }
        })
    except Exception as e:
        logger.error(f"Error getting AI status: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@ai_chat_bp.route('/chat', methods=['POST'])
@require_web_auth
def chat():
    """Non-streaming chat endpoint"""
    try:
        if not ai_service.enabled and not (ai_service.ollama and ai_service.ollama.enabled):
            return jsonify({
                "success": False,
                "error": "AI service not available. Please configure OpenAI API or Ollama."
            }), 503
        
        data = request.json
        if not data:
            return jsonify({"success": False, "error": "No data provided"}), 400
        
        message = data.get('message', '').strip()
        conversation_history = data.get('conversation_history', [])
        model = data.get('model', 'gpt-5')
        session_id = data.get('session_id')
        
        if not message:
            return jsonify({"success": False, "error": "Message required"}), 400
        
        # Get AI response
        response = ai_service.chat(message, conversation_history, model)
        
        # Save to database if available
        if db_service.is_available:
            try:
                with db_service.get_session() as session:
                    # Get or create AI session
                    if session_id:
                        ai_session = session.query(AISession).filter_by(id=session_id).first()
                    else:
                        ai_session = AISession(
                            session_type='chat',
                            state='active',
                            intent='general_assistance',
                            context={'model': model},
                            messages=[]
                        )
                        session.add(ai_session)
                        session.commit()
                        session.refresh(ai_session)
                        session_id = str(ai_session.id)
                    
                    if ai_session:
                        # Append messages
                        messages = ai_session.messages or []
                        messages.append({
                            'timestamp': datetime.utcnow().isoformat(),
                            'role': 'user',
                            'content': message
                        })
                        messages.append({
                            'timestamp': datetime.utcnow().isoformat(),
                            'role': 'assistant',
                            'content': response
                        })
                        ai_session.messages = messages
                        session.commit()
            except Exception as e:
                logger.warning(f"Failed to save chat to database: {e}")
        
        return jsonify({
            "success": True,
            "response": response,
            "session_id": session_id,
            "model": model
        })
    
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@ai_chat_bp.route('/chat/stream', methods=['POST'])
@require_web_auth
def chat_stream():
    """Streaming chat endpoint using Server-Sent Events (SSE)"""
    try:
        if not ai_service.enabled and not (ai_service.ollama and ai_service.ollama.enabled):
            def error_stream():
                yield f"data: {json.dumps({'error': 'AI service not available'})}\n\n"
                yield "data: [DONE]\n\n"
            return Response(error_stream(), mimetype='text/event-stream')
        
        data = request.json
        if not data:
            def error_stream():
                yield f"data: {json.dumps({'error': 'No data provided'})}\n\n"
                yield "data: [DONE]\n\n"
            return Response(error_stream(), mimetype='text/event-stream')
        
        message = data.get('message', '').strip()
        conversation_history = data.get('conversation_history', [])
        model = data.get('model', 'gpt-5')
        session_id = data.get('session_id')
        
        if not message:
            def error_stream():
                yield f"data: {json.dumps({'error': 'Message required'})}\n\n"
                yield "data: [DONE]\n\n"
            return Response(error_stream(), mimetype='text/event-stream')
        
        def generate():
            """Generator for streaming responses"""
            accumulated_content = ''
            
            try:
                # Stream the response
                for chunk in ai_service.chat_stream(message, conversation_history, model):
                    yield chunk
                    
                    # Accumulate content for database storage
                    if chunk.startswith('data: ') and not chunk.startswith('data: [DONE]'):
                        try:
                            chunk_data = json.loads(chunk[6:])  # Remove "data: " prefix
                            if 'content' in chunk_data:
                                accumulated_content += chunk_data['content']
                        except json.JSONDecodeError:
                            pass
                
                # Save to database if available
                if db_service.is_available and accumulated_content:
                    try:
                        with db_service.get_session() as session:
                            # Get or create AI session
                            if session_id:
                                ai_session = session.query(AISession).filter_by(id=session_id).first()
                            else:
                                ai_session = AISession(
                                    session_type='chat',
                                    state='active',
                                    intent='general_assistance',
                                    context={'model': model},
                                    messages=[]
                                )
                                session.add(ai_session)
                                session.commit()
                                session.refresh(ai_session)
                            
                            if ai_session:
                                # Append messages
                                messages = ai_session.messages or []
                                messages.append({
                                    'timestamp': datetime.utcnow().isoformat(),
                                    'role': 'user',
                                    'content': message
                                })
                                messages.append({
                                    'timestamp': datetime.utcnow().isoformat(),
                                    'role': 'assistant',
                                    'content': accumulated_content
                                })
                                ai_session.messages = messages
                                session.commit()
                    except Exception as e:
                        logger.warning(f"Failed to save streamed chat to database: {e}")
            
            except Exception as e:
                logger.error(f"Error in stream generation: {e}", exc_info=True)
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                yield "data: [DONE]\n\n"
        
        return Response(stream_with_context(generate()), mimetype='text/event-stream')
    
    except Exception as e:
        logger.error(f"Error in chat stream endpoint: {e}", exc_info=True)
        def error_stream():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
        return Response(error_stream(), mimetype='text/event-stream')

@ai_chat_bp.route('/chat/history', methods=['GET'])
@require_web_auth
def chat_history():
    """Get chat history for a session"""
    try:
        session_id = request.args.get('session_id')
        
        if not session_id:
            return jsonify({"success": False, "error": "session_id required"}), 400
        
        if not db_service.is_available:
            return jsonify({"success": False, "error": "Database not available"}), 503
        
        with db_service.get_session() as session:
            ai_session = session.query(AISession).filter_by(id=session_id).first()
            
            if not ai_session:
                return jsonify({"success": False, "error": "Session not found"}), 404
            
            return jsonify({
                "success": True,
                "session_id": str(ai_session.id),
                "messages": ai_session.messages or [],
                "created_at": ai_session.created_at.isoformat() if ai_session.created_at else None
            })
    
    except Exception as e:
        logger.error(f"Error getting chat history: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@ai_chat_bp.route('/chat/sessions', methods=['GET'])
@require_web_auth
def list_sessions():
    """List all chat sessions"""
    try:
        if not db_service.is_available:
            return jsonify({"success": False, "error": "Database not available"}), 503
        
        with db_service.get_session() as session:
            ai_sessions = session.query(AISession).filter_by(
                session_type='chat'
            ).order_by(AISession.created_at.desc()).limit(50).all()
            
            sessions_list = []
            for ai_session in ai_sessions:
                messages = ai_session.messages or []
                first_message = messages[0]['content'] if messages else "New conversation"
                
                sessions_list.append({
                    "id": str(ai_session.id),
                    "preview": first_message[:100],
                    "message_count": len(messages),
                    "created_at": ai_session.created_at.isoformat() if ai_session.created_at else None,
                    "updated_at": ai_session.updated_at.isoformat() if ai_session.updated_at else None
                })
            
            return jsonify({
                "success": True,
                "sessions": sessions_list
            })
    
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500

@ai_chat_bp.route('/chat/clear', methods=['POST'])
@require_web_auth
def clear_session():
    """Clear a chat session"""
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({"success": False, "error": "session_id required"}), 400
        
        if not db_service.is_available:
            return jsonify({"success": False, "error": "Database not available"}), 503
        
        with db_service.get_session() as session:
            ai_session = session.query(AISession).filter_by(id=session_id).first()
            
            if not ai_session:
                return jsonify({"success": False, "error": "Session not found"}), 404
            
            # Clear messages
            ai_session.messages = []
            ai_session.state = 'cleared'
            session.commit()
            
            return jsonify({
                "success": True,
                "message": "Chat session cleared"
            })
    
    except Exception as e:
        logger.error(f"Error clearing session: {e}", exc_info=True)
        return jsonify({"success": False, "error": str(e)}), 500
