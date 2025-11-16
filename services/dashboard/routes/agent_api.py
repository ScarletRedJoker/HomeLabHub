"""
Agent Communication API - Enable collaboration between Jarvis and Replit Agent
Provides endpoints for inter-agent messaging and task delegation
"""

from flask import Blueprint, jsonify, request
import logging
from datetime import datetime, timedelta
from utils.auth import require_auth
from models import get_session, AgentMessage

logger = logging.getLogger(__name__)

agent_bp = Blueprint('agents', __name__, url_prefix='/api/agents')


@agent_bp.route('/messages', methods=['GET'])
def get_messages():
    """
    Get agent communication feed
    
    Query Parameters:
    - limit: Number of messages to return (default 50)
    - from_agent: Filter by sender
    - to_agent: Filter by recipient
    - message_type: Filter by type
    - since: Get messages since timestamp (ISO format)
    
    Returns:
        JSON list of agent messages
    """
    session = get_session()
    try:
        limit = int(request.args.get('limit', 50))
        from_agent = request.args.get('from_agent')
        to_agent = request.args.get('to_agent')
        message_type = request.args.get('message_type')
        since = request.args.get('since')
        
        # Build query
        query = session.query(AgentMessage)
        
        if from_agent:
            query = query.filter(AgentMessage.from_agent == from_agent)
        
        if to_agent:
            query = query.filter(AgentMessage.to_agent == to_agent)
        
        if message_type:
            query = query.filter(AgentMessage.message_type == message_type)
        
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace('Z', '+00:00'))
                query = query.filter(AgentMessage.created_at >= since_dt)
            except ValueError:
                pass
        
        # Order by newest first
        query = query.order_by(AgentMessage.created_at.desc())
        
        # Apply limit
        messages = query.limit(limit).all()
        
        return jsonify({
            'success': True,
            'messages': [msg.to_dict() for msg in messages],
            'count': len(messages)
        })
        
    except Exception as e:
        logger.error(f"Error fetching agent messages: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        session.close()


@agent_bp.route('/send', methods=['POST'])
@require_auth
def send_message():
    """
    Send message from one agent to another
    
    POST Body:
    {
        "from_agent": "jarvis" | "replit_agent" | "user",
        "to_agent": "jarvis" | "replit_agent" | "user",
        "message_type": "task_delegation" | "status_update" | "request" | "response",
        "subject": "Optional subject line",
        "content": "Message content",
        "metadata": {},
        "priority": "low" | "normal" | "high" | "urgent"
    }
    
    Returns:
        JSON confirmation with message ID
    """
    session = get_session()
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                'success': False,
                'error': 'No data provided'
            }), 400
        
        # Validate required fields
        required_fields = ['from_agent', 'to_agent', 'message_type', 'content']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'error': f'Missing required field: {field}'
                }), 400
        
        # Create message
        message = AgentMessage(
            from_agent=data['from_agent'],
            to_agent=data['to_agent'],
            message_type=data['message_type'],
            subject=data.get('subject'),
            content=data['content'],
            message_metadata=data.get('metadata'),
            priority=data.get('priority', 'normal')
        )
        
        session.add(message)
        session.commit()
        
        logger.info(f"Agent message sent: {message.from_agent} → {message.to_agent} ({message.message_type})")
        
        return jsonify({
            'success': True,
            'message': 'Message sent successfully',
            'message_id': message.id,
            'data': message.to_dict()
        })
        
    except Exception as e:
        session.rollback()
        logger.error(f"Error sending agent message: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        session.close()


@agent_bp.route('/invoke', methods=['POST'])
@require_auth
def invoke_jarvis():
    """
    User or Replit Agent invokes Jarvis for a task
    
    POST Body:
    {
        "task": "Deploy Nextcloud to my homelab",
        "complexity": "low" | "medium" | "high",
        "delegate_to": "jarvis",
        "metadata": {}
    }
    
    Returns:
        JSON confirmation of task delegation
    """
    session = get_session()
    try:
        data = request.get_json()
        
        if not data or 'task' not in data:
            return jsonify({
                'success': False,
                'error': 'Task description is required'
            }), 400
        
        task = data['task']
        complexity = data.get('complexity', 'medium')
        delegate_to = data.get('delegate_to', 'jarvis')
        metadata = data.get('metadata', {})
        
        # Create task delegation message
        message = AgentMessage.create_task_delegation(
            from_agent='user',
            to_agent=delegate_to,
            task=task,
            complexity=complexity,
            metadata=metadata
        )
        
        session.add(message)
        session.commit()
        
        logger.info(f"Task delegated to {delegate_to}: {task}")
        
        # In a real implementation, this would trigger Jarvis to process the task
        # For now, we'll just create an acknowledgment message
        ack_message = AgentMessage.create_response(
            from_agent=delegate_to,
            to_agent='user',
            response=f"Task acknowledged. Analyzing: {task}",
            original_message_id=message.id
        )
        session.add(ack_message)
        session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Task successfully delegated to {delegate_to}',
            'task_id': message.id,
            'acknowledgment': ack_message.to_dict()
        })
        
    except Exception as e:
        session.rollback()
        logger.error(f"Error invoking Jarvis: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        session.close()


@agent_bp.route('/stats', methods=['GET'])
def get_stats():
    """
    Get agent collaboration statistics
    
    Returns:
        JSON with message counts, agent activity, etc.
    """
    session = get_session()
    try:
        # Total messages
        total_messages = session.query(AgentMessage).count()
        
        # Messages in last 24 hours
        yesterday = datetime.utcnow() - timedelta(days=1)
        recent_messages = session.query(AgentMessage).filter(
            AgentMessage.created_at >= yesterday
        ).count()
        
        # Messages by type
        from sqlalchemy import func
        messages_by_type = dict(
            session.query(
                AgentMessage.message_type,
                func.count(AgentMessage.id)
            ).group_by(AgentMessage.message_type).all()
        )
        
        # Messages by agent
        from_jarvis = session.query(AgentMessage).filter(
            AgentMessage.from_agent == 'jarvis'
        ).count()
        
        from_replit = session.query(AgentMessage).filter(
            AgentMessage.from_agent == 'replit_agent'
        ).count()
        
        return jsonify({
            'success': True,
            'stats': {
                'total_messages': total_messages,
                'recent_messages_24h': recent_messages,
                'messages_by_type': messages_by_type,
                'from_jarvis': from_jarvis,
                'from_replit_agent': from_replit,
                'collaboration_active': recent_messages > 0
            }
        })
        
    except Exception as e:
        logger.error(f"Error fetching agent stats: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        session.close()


@agent_bp.route('/messages/<int:message_id>', methods=['PATCH'])
def update_message_status(message_id):
    """
    Update status of an agent message
    
    PATCH Body:
    {
        "status": "delivered" | "acknowledged" | "completed"
    }
    
    Returns:
        JSON confirmation
    """
    session = get_session()
    try:
        data = request.get_json()
        
        if not data or 'status' not in data:
            return jsonify({
                'success': False,
                'error': 'Status is required'
            }), 400
        
        message = session.query(AgentMessage).filter_by(id=message_id).first()
        
        if not message:
            return jsonify({
                'success': False,
                'error': 'Message not found'
            }), 404
        
        message.status = data['status']
        session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Message status updated',
            'data': message.to_dict()
        })
        
    except Exception as e:
        session.rollback()
        logger.error(f"Error updating message status: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
    finally:
        session.close()
