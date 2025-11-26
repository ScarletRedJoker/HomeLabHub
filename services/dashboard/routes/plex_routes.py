"""Plex Media Import Routes"""
import os
import logging
import tempfile
import hashlib
from uuid import uuid4
from flask import Blueprint, request, jsonify, session, render_template
from werkzeug.utils import secure_filename
from functools import wraps
from typing import Any, Dict, Set

from config import Config  # type: ignore[import-not-found]
from services.plex_service import plex_service
from workers.plex_worker import process_import_job, cleanup_old_imports
from utils.auth import require_auth, require_web_auth

logger = logging.getLogger(__name__)

plex_bp = Blueprint('plex', __name__)

CHUNKED_UPLOADS: Dict[str, Any] = {}

UPLOAD_FOLDER: str = getattr(Config, 'UPLOAD_FOLDER', '/tmp/jarvis_uploads')
PLEX_MAX_UPLOAD_SIZE: int = getattr(Config, 'PLEX_MAX_UPLOAD_SIZE', 10 * 1024 * 1024 * 1024)
PLEX_CHUNK_SIZE: int = getattr(Config, 'PLEX_CHUNK_SIZE', 10 * 1024 * 1024)
PLEX_ALLOWED_EXTENSIONS: Set[str] = getattr(Config, 'PLEX_ALLOWED_EXTENSIONS', {
    'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts',
    'mp3', 'flac', 'm4a', 'wav', 'aac', 'ogg', 'wma', 'aiff', 'ape',
    'srt', 'ass', 'ssa', 'sub', 'vtt'
})


def login_required(f):
    """Decorator for API routes - supports both session and API key auth"""
    return require_auth(f)


@plex_bp.route('/plex')
@login_required
def plex_import_page():
    """Render Plex import page"""
    return render_template('plex_import.html')


@plex_bp.route('/api/plex/import', methods=['POST'])
@login_required
def import_media():
    """
    Upload media files for import
    
    Form data:
        files: Media files to upload (multiple)
        media_type: Media type (movie/tv_show/music) - optional, auto-detected
    
    Returns:
        JSON with job information
    """
    try:
        if 'files' not in request.files:
            return jsonify({'error': 'No files provided'}), 400
        
        files = request.files.getlist('files')
        
        if not files or len(files) == 0:
            return jsonify({'error': 'No files selected'}), 400
        
        # Get media type override (optional)
        media_type_override = request.form.get('media_type')
        user_id = session.get('username', 'unknown')
        
        # Create import job
        job_type = media_type_override or 'auto'
        job = plex_service.create_import_job(
            user_id=user_id,
            job_type=job_type,
            metadata={'manual_type': media_type_override}
        )
        
        job_id = str(job.id)
        uploaded_files = []
        
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        
        for file in files:
            if not file.filename or file.filename == '':
                continue
            
            filename = str(file.filename)
            
            temp_path = os.path.join(
                UPLOAD_FOLDER,
                f"{uuid4()}_{secure_filename(filename)}"
            )
            file.save(temp_path)
            
            try:
                # Upload to MinIO and create import item
                upload_info = plex_service.upload_media_file(
                    temp_path,
                    filename,
                    job_id,
                    media_type=media_type_override
                )
                
                uploaded_files.append({
                    'filename': filename,
                    'item_id': upload_info['item_id'],
                    'media_type': upload_info['media_type'],
                    'metadata': upload_info['metadata']
                })
                
            except Exception as e:
                logger.error(f"Failed to upload file {filename}: {e}")
                uploaded_files.append({
                    'filename': filename,
                    'error': str(e)
                })
            
            finally:
                # Cleanup temp file
                if os.path.exists(temp_path):
                    os.remove(temp_path)
        
        # Trigger async processing
        process_import_job.delay(job_id)
        
        return jsonify({
            'success': True,
            'message': f'Import job created with {len(uploaded_files)} files',
            'job_id': job_id,
            'uploaded_files': uploaded_files
        }), 200
    
    except Exception as e:
        logger.error(f"Import error: {e}", exc_info=True)
        return jsonify({'error': f'Import failed: {str(e)}'}), 500


@plex_bp.route('/api/plex/upload/config', methods=['GET'])
@login_required
def get_upload_config():
    """
    Get upload configuration for the frontend
    
    Returns:
        JSON with upload limits and allowed extensions
    """
    return jsonify({
        'success': True,
        'max_file_size': PLEX_MAX_UPLOAD_SIZE,
        'max_file_size_gb': PLEX_MAX_UPLOAD_SIZE / (1024 * 1024 * 1024),
        'chunk_size': PLEX_CHUNK_SIZE,
        'allowed_extensions': list(PLEX_ALLOWED_EXTENSIONS)
    }), 200


@plex_bp.route('/api/plex/upload/init', methods=['POST'])
@login_required
def init_chunked_upload():
    """
    Initialize a chunked upload session
    
    JSON body:
        filename: Original filename
        file_size: Total file size in bytes
        media_type: Optional media type override
    
    Returns:
        JSON with upload_id and job_id
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'JSON body required'}), 400
        
        filename = data.get('filename')
        file_size = data.get('file_size')
        media_type = data.get('media_type')
        
        if not filename:
            return jsonify({'error': 'filename is required'}), 400
        
        if not file_size or file_size <= 0:
            return jsonify({'error': 'valid file_size is required'}), 400
        
        # Validate the file
        is_valid, error = plex_service.validate_media_file(filename, file_size)
        if not is_valid:
            return jsonify({'error': error}), 400
        
        user_id = session.get('username', 'unknown')
        
        # Create import job
        job_type = media_type or plex_service.detect_media_type(filename)
        job = plex_service.create_import_job(
            user_id=user_id,
            job_type=job_type,
            metadata={'chunked_upload': True, 'manual_type': media_type}
        )
        
        job_id = str(job.id)
        upload_id = str(uuid4())
        
        chunk_size = PLEX_CHUNK_SIZE
        total_chunks = (file_size + chunk_size - 1) // chunk_size
        
        os.makedirs(UPLOAD_FOLDER, exist_ok=True)
        temp_path = os.path.join(UPLOAD_FOLDER, f"chunked_{upload_id}")
        
        # Store upload session info
        CHUNKED_UPLOADS[upload_id] = {
            'job_id': job_id,
            'filename': filename,
            'file_size': file_size,
            'media_type': media_type,
            'temp_path': temp_path,
            'chunk_size': chunk_size,
            'total_chunks': total_chunks,
            'received_chunks': set(),
            'user_id': user_id
        }
        
        logger.info(f"Initialized chunked upload {upload_id} for {filename} ({file_size} bytes, {total_chunks} chunks)")
        
        return jsonify({
            'success': True,
            'upload_id': upload_id,
            'job_id': job_id,
            'chunk_size': chunk_size,
            'total_chunks': total_chunks
        }), 200
        
    except Exception as e:
        logger.error(f"Error initializing chunked upload: {e}", exc_info=True)
        return jsonify({'error': f'Failed to initialize upload: {str(e)}'}), 500


@plex_bp.route('/api/plex/upload/chunk', methods=['POST'])
@login_required
def upload_chunk():
    """
    Upload a single chunk with proper file handling for random-access writes
    
    Form data:
        upload_id: Upload session ID
        chunk_index: Chunk index (0-based)
        chunk: The chunk data
    
    Returns:
        JSON with chunk upload status
    """
    try:
        upload_id = request.form.get('upload_id')
        chunk_index = request.form.get('chunk_index')
        
        if not upload_id or upload_id not in CHUNKED_UPLOADS:
            return jsonify({'error': 'Invalid or expired upload_id'}), 400
        
        if chunk_index is None:
            return jsonify({'error': 'chunk_index is required'}), 400
        
        try:
            chunk_index = int(chunk_index)
        except ValueError:
            return jsonify({'error': 'chunk_index must be an integer'}), 400
        
        if 'chunk' not in request.files:
            return jsonify({'error': 'No chunk data provided'}), 400
        
        upload_info = CHUNKED_UPLOADS[upload_id]
        
        # Verify chunk index is valid
        if chunk_index < 0 or chunk_index >= upload_info['total_chunks']:
            return jsonify({'error': f'Invalid chunk index: {chunk_index}. Expected 0-{upload_info["total_chunks"]-1}'}), 400
        
        # Skip if chunk already received
        if chunk_index in upload_info['received_chunks']:
            return jsonify({
                'success': True,
                'message': 'Chunk already received',
                'chunk_index': chunk_index,
                'received_chunks': len(upload_info['received_chunks']),
                'total_chunks': upload_info['total_chunks']
            }), 200
        
        chunk_file = request.files['chunk']
        chunk_data = chunk_file.read()
        
        # Validate chunk size (except last chunk)
        expected_chunk_size = upload_info['chunk_size']
        is_last_chunk = chunk_index == upload_info['total_chunks'] - 1
        
        if not is_last_chunk and len(chunk_data) != expected_chunk_size:
            logger.warning(f"Chunk {chunk_index} has unexpected size: {len(chunk_data)} (expected {expected_chunk_size})")
        
        temp_path = upload_info['temp_path']
        offset = chunk_index * upload_info['chunk_size']
        
        # Pre-allocate file if this is the first chunk being written
        if not os.path.exists(temp_path):
            # Create sparse file with final size
            with open(temp_path, 'wb') as f:
                f.seek(upload_info['file_size'] - 1)
                f.write(b'\0')
            logger.debug(f"Pre-allocated file {temp_path} with size {upload_info['file_size']}")
        
        # Write chunk at specific offset using r+b mode (read+write binary)
        with open(temp_path, 'r+b') as f:
            f.seek(offset)
            f.write(chunk_data)
        
        upload_info['received_chunks'].add(chunk_index)
        
        progress = len(upload_info['received_chunks']) / upload_info['total_chunks'] * 100
        
        logger.debug(f"Received chunk {chunk_index + 1}/{upload_info['total_chunks']} for upload {upload_id} ({len(chunk_data)} bytes at offset {offset})")
        
        return jsonify({
            'success': True,
            'chunk_index': chunk_index,
            'received_chunks': len(upload_info['received_chunks']),
            'total_chunks': upload_info['total_chunks'],
            'progress': round(progress, 2)
        }), 200
        
    except Exception as e:
        logger.error(f"Error uploading chunk: {e}", exc_info=True)
        return jsonify({'error': f'Chunk upload failed: {str(e)}'}), 500


@plex_bp.route('/api/plex/upload/complete', methods=['POST'])
@login_required
def complete_chunked_upload():
    """
    Complete a chunked upload with file integrity verification and trigger processing
    
    JSON body:
        upload_id: Upload session ID
        checksum: Optional client-computed file checksum for verification
    
    Returns:
        JSON with completion status
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'JSON body required'}), 400
        
        upload_id = data.get('upload_id')
        client_checksum = data.get('checksum')  # Optional
        
        if not upload_id or upload_id not in CHUNKED_UPLOADS:
            return jsonify({'error': 'Invalid or expired upload_id'}), 400
        
        upload_info = CHUNKED_UPLOADS[upload_id]
        
        # Verify all chunks received
        missing_chunks = set(range(upload_info['total_chunks'])) - upload_info['received_chunks']
        if missing_chunks:
            # Return sorted list of missing chunks for easier retry
            sorted_missing = sorted(list(missing_chunks))
            return jsonify({
                'success': False,
                'error': f'Missing {len(sorted_missing)} chunk(s)',
                'missing_chunks': sorted_missing,
                'received_chunks': len(upload_info['received_chunks']),
                'total_chunks': upload_info['total_chunks']
            }), 400
        
        temp_path = upload_info['temp_path']
        
        # Verify temp file exists
        if not os.path.exists(temp_path):
            return jsonify({
                'success': False,
                'error': 'Assembled file not found. Upload may have been corrupted.'
            }), 500
        
        # Verify file size
        actual_size = os.path.getsize(temp_path)
        expected_size = upload_info['file_size']
        
        if actual_size != expected_size:
            logger.error(f"File size mismatch for upload {upload_id}: expected {expected_size}, got {actual_size}")
            return jsonify({
                'success': False,
                'error': f'File size mismatch: expected {expected_size} bytes, got {actual_size} bytes. Some chunks may be corrupted.',
                'expected_size': expected_size,
                'actual_size': actual_size
            }), 400
        
        # Compute server-side checksum and verify if client provided one
        if client_checksum:
            server_checksum = hashlib.sha256()
            with open(temp_path, 'rb') as f:
                for block in iter(lambda: f.read(65536), b''):
                    server_checksum.update(block)
            server_checksum = server_checksum.hexdigest()
            
            if client_checksum != server_checksum:
                logger.error(f"Checksum mismatch for upload {upload_id}: client={client_checksum}, server={server_checksum}")
                return jsonify({
                    'success': False,
                    'error': 'File checksum mismatch. File may be corrupted during transfer.',
                    'client_checksum': client_checksum,
                    'server_checksum': server_checksum
                }), 400
            
            logger.info(f"Checksum verified for upload {upload_id}: {server_checksum}")
        
        try:
            # Upload the assembled file to MinIO
            upload_result = plex_service.upload_media_file(
                temp_path,
                upload_info['filename'],
                upload_info['job_id'],
                media_type=upload_info['media_type']
            )
            
            # Trigger async processing
            process_import_job.delay(upload_info['job_id'])
            
            logger.info(f"Completed chunked upload {upload_id}, job {upload_info['job_id']}, file size {actual_size} bytes")
            
            return jsonify({
                'success': True,
                'message': 'Upload completed and processing started',
                'job_id': upload_info['job_id'],
                'item_id': upload_result['item_id'],
                'metadata': upload_result['metadata'],
                'file_size': actual_size
            }), 200
            
        except Exception as e:
            logger.error(f"Failed to upload assembled file to MinIO: {e}", exc_info=True)
            return jsonify({
                'success': False,
                'error': f'Failed to save file to storage: {str(e)}'
            }), 500
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except Exception as e:
                    logger.warning(f"Failed to cleanup temp file {temp_path}: {e}")
            
            # Remove upload session
            if upload_id in CHUNKED_UPLOADS:
                del CHUNKED_UPLOADS[upload_id]
        
    except Exception as e:
        logger.error(f"Error completing chunked upload: {e}", exc_info=True)
        return jsonify({'success': False, 'error': f'Failed to complete upload: {str(e)}'}), 500


@plex_bp.route('/api/plex/upload/cancel', methods=['POST'])
@login_required
def cancel_chunked_upload():
    """
    Cancel a chunked upload session
    
    JSON body:
        upload_id: Upload session ID
    
    Returns:
        JSON with cancellation status
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'JSON body required'}), 400
        
        upload_id = data.get('upload_id')
        
        if not upload_id or upload_id not in CHUNKED_UPLOADS:
            return jsonify({'error': 'Invalid or expired upload_id'}), 400
        
        upload_info = CHUNKED_UPLOADS[upload_id]
        
        # Cleanup temp file
        if os.path.exists(upload_info['temp_path']):
            os.remove(upload_info['temp_path'])
        
        # Delete the import job if created
        try:
            plex_service.delete_import_job(upload_info['job_id'])
        except Exception as e:
            logger.warning(f"Failed to delete import job {upload_info['job_id']}: {e}")
        
        # Remove upload session
        del CHUNKED_UPLOADS[upload_id]
        
        logger.info(f"Cancelled chunked upload {upload_id}")
        
        return jsonify({
            'success': True,
            'message': 'Upload cancelled'
        }), 200
        
    except Exception as e:
        logger.error(f"Error cancelling chunked upload: {e}", exc_info=True)
        return jsonify({'error': f'Failed to cancel upload: {str(e)}'}), 500


@plex_bp.route('/api/plex/jobs', methods=['GET'])
@login_required
def list_jobs():
    """
    List import jobs
    
    Query params:
        limit: Maximum number of jobs (default: 50)
    
    Returns:
        JSON with list of jobs
    """
    try:
        user_id = session.get('username')
        limit = int(request.args.get('limit', 50))
        
        jobs = plex_service.list_import_jobs(user_id=user_id, limit=limit)
        
        return jsonify({
            'success': True,
            'jobs': [job.to_dict() for job in jobs]
        }), 200
    
    except Exception as e:
        logger.error(f"Error listing jobs: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/jobs/<job_id>', methods=['GET'])
@login_required
def get_job_status(job_id):
    """
    Get job status and progress
    
    Returns:
        JSON with job details and items
    """
    try:
        job = plex_service.get_import_job(job_id)
        
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        
        # Include items
        items = [item.to_dict() for item in job.items]
        
        job_dict = job.to_dict()
        job_dict['items'] = items
        
        total_files: int = int(job_dict.get('total_files', 0))
        processed_files: int = int(job_dict.get('processed_files', 0))
        
        if total_files > 0:
            job_dict['progress_percent'] = int((processed_files / total_files) * 100)
        else:
            job_dict['progress_percent'] = 0
        
        return jsonify({
            'success': True,
            'job': job_dict
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting job status: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/jobs/<job_id>/retry', methods=['POST'])
@login_required
def retry_job(job_id):
    """
    Retry failed import job
    
    Returns:
        JSON with retry status
    """
    try:
        job = plex_service.get_import_job(job_id)
        
        if not job:
            return jsonify({'error': 'Job not found'}), 404
        
        if job.status not in ['failed', 'cancelled']:
            return jsonify({'error': 'Only failed or cancelled jobs can be retried'}), 400
        
        # Reset job status
        plex_service.update_job_status(job_id, 'pending')
        
        # Reset failed items
        from services.db_service import db_service
        from models.plex import PlexImportItem
        
        with db_service.get_session() as session:
            failed_items = session.query(PlexImportItem).filter_by(
                job_id=job_id,
                status='failed'
            ).all()
            
            for item in failed_items:
                item.status = 'pending'
                item.error_message = None
            
            session.commit()
        
        # Trigger async processing
        process_import_job.delay(job_id)
        
        return jsonify({
            'success': True,
            'message': 'Job retry triggered',
            'job_id': job_id
        }), 200
    
    except Exception as e:
        logger.error(f"Error retrying job: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/jobs/<job_id>', methods=['DELETE'])
@login_required
def delete_job(job_id):
    """
    Cancel and delete import job
    
    Returns:
        JSON with deletion status
    """
    try:
        success = plex_service.delete_import_job(job_id)
        
        if not success:
            return jsonify({'error': 'Job not found or deletion failed'}), 404
        
        return jsonify({
            'success': True,
            'message': 'Job deleted successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error deleting job: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/scan', methods=['POST'])
@login_required
def trigger_scan():
    """
    Manually trigger Plex library scan
    
    Form data:
        library_type: Optional library type (movie/tv/music)
    
    Returns:
        JSON with scan result
    """
    try:
        library_type = request.form.get('library_type')
        
        result = plex_service.trigger_library_scan(library_type=library_type)
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': f"Scanned {result['count']} libraries",
                'libraries': result['scanned_libraries']
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Scan failed')
            }), 500
    
    except Exception as e:
        logger.error(f"Error triggering scan: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/status', methods=['GET'])
@login_required
def get_plex_status():
    """
    Get Plex connection status
    
    Returns:
        JSON with connection status and server info
    """
    try:
        status = plex_service.test_connection()
        
        return jsonify({
            'success': status.get('connected', False),
            **status
        }), 200 if status.get('connected') else 503
    
    except Exception as e:
        logger.error(f"Error checking Plex status: {e}", exc_info=True)
        return jsonify({'error': str(e), 'connected': False}), 500


@plex_bp.route('/api/plex/libraries', methods=['GET'])
@login_required
def get_libraries():
    """
    List Plex libraries
    
    Returns:
        JSON with list of libraries
    """
    try:
        libraries = plex_service.get_plex_libraries()
        
        return jsonify({
            'success': True,
            'libraries': libraries
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting libraries: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@plex_bp.route('/api/plex/cleanup', methods=['POST'])
@login_required
def cleanup_jobs():
    """
    Trigger cleanup of old import jobs
    
    Form data:
        days: Age threshold in days (default: 30)
    
    Returns:
        JSON with cleanup result
    """
    try:
        days = int(request.form.get('days', 30))
        
        # Trigger async cleanup
        task = cleanup_old_imports.delay(days)
        
        return jsonify({
            'success': True,
            'message': 'Cleanup task triggered',
            'task_id': task.id,
            'days': days
        }), 200
    
    except Exception as e:
        logger.error(f"Error triggering cleanup: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
