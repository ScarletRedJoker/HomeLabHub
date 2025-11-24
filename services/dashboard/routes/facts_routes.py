"""Stream-Bot Facts Display Routes"""
import logging
import os
from flask import Blueprint, render_template, jsonify, request
from utils.auth import require_web_auth
from services.db_service import db_service
from models.artifact import Artifact
from sqlalchemy import desc
from datetime import datetime

logger = logging.getLogger(__name__)

facts_bp = Blueprint('facts', __name__)


@facts_bp.route('/facts')
@require_web_auth
def facts_page():
    """Display stream-bot generated facts"""
    return render_template('facts.html')


@facts_bp.route('/api/facts/latest', methods=['GET'])
@require_web_auth
def get_latest_facts():
    """Get latest facts from stream-bot
    
    Query params:
        limit: Number of facts to return (default: 20, max: 100)
        
    Returns:
        JSON with list of facts
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        from flask import request
        limit = min(int(request.args.get('limit', 20)), 100)
        
        with db_service.get_session() as session:
            # Query artifacts where type is 'fact'
            facts = session.query(Artifact).filter(
                Artifact.artifact_type == 'fact'
            ).order_by(
                desc(Artifact.created_at)
            ).limit(limit).all()
            
            facts_data = []
            for fact in facts:
                facts_data.append({
                    'id': str(fact.id),
                    'content': fact.data.get('fact', fact.content) if fact.data else fact.content,
                    'source': fact.source,
                    'created_at': fact.created_at.isoformat() if fact.created_at else None,
                    'tags': fact.tags or []
                })
            
            return jsonify({
                'success': True,
                'count': len(facts_data),
                'facts': facts_data
            })
            
    except Exception as e:
        logger.error(f"Error fetching facts: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@facts_bp.route('/api/facts/random', methods=['GET'])
@require_web_auth
def get_random_fact():
    """Get a random fact from the database
    
    Returns:
        JSON with a single random fact
    """
    try:
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        from sqlalchemy.sql.expression import func
        
        with db_service.get_session() as session:
            # Get random fact
            fact = session.query(Artifact).filter(
                Artifact.artifact_type == 'fact'
            ).order_by(func.random()).first()
            
            if not fact:
                return jsonify({
                    'success': True,
                    'fact': None,
                    'message': 'No facts available yet'
                })
            
            return jsonify({
                'success': True,
                'fact': {
                    'id': str(fact.id),
                    'content': fact.data.get('fact', fact.content) if fact.data else fact.content,
                    'source': fact.source,
                    'created_at': fact.created_at.isoformat() if fact.created_at else None
                }
            })
            
    except Exception as e:
        logger.error(f"Error fetching random fact: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@facts_bp.route('/api/stream/facts', methods=['POST'])
def create_fact():
    """Accept fact from stream-bot service and save to database
    
    Expects JSON: { "fact": "...", "source": "stream-bot", "tags"?: [...] }
    
    Returns:
        JSON with success status and fact ID
    """
    try:
        # Authenticate using SERVICE_AUTH_TOKEN
        auth_header = request.headers.get('X-API-Key') or request.headers.get('Authorization')
        expected_token = os.environ.get('SERVICE_AUTH_TOKEN', '')
        
        if not expected_token:
            logger.warning("SERVICE_AUTH_TOKEN not configured - accepting unauthenticated request")
        elif not auth_header or auth_header.replace('Bearer ', '') != expected_token:
            logger.warning(f"Unauthorized fact POST attempt from {request.remote_addr}")
            return jsonify({
                'success': False,
                'error': 'Unauthorized'
            }), 401
        
        if not db_service.is_available:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        data = request.get_json()
        if not data or 'fact' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing "fact" in request body'
            }), 400
        
        fact_content = data['fact']
        source = data.get('source', 'stream-bot')
        tags = data.get('tags', [])
        
        with db_service.get_session() as session:
            # Import FileType enum for facts
            from models.artifact import FileType
            
            # Create new Artifact with artifact_type='fact'
            # Provide dummy values for required file fields (facts aren't files)
            artifact = Artifact(
                artifact_type='fact',
                content=fact_content,
                source=source,
                tags=tags,
                data={'fact': fact_content},
                created_at=datetime.utcnow(),
                # Required file fields (use placeholder values for facts)
                filename='fact.txt',
                original_filename='fact.txt',
                file_type=FileType.single_file,
                storage_path='/facts',
                file_size=len(fact_content),
                checksum_sha256='0' * 64,  # Placeholder SHA256
                uploaded_by='stream-bot'
            )
            
            session.add(artifact)
            session.commit()
            
            logger.info(f"Saved fact from {source}: {fact_content[:50]}...")
            
            return jsonify({
                'success': True,
                'id': str(artifact.id),
                'message': 'Fact saved successfully'
            })
            
    except Exception as e:
        logger.error(f"Error saving fact: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
