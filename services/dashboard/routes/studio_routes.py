"""
Nebula Studio API Routes
Project Workspace Manager endpoints
"""
from flask import Blueprint, jsonify, request, render_template
from datetime import datetime
import logging
import uuid

logger = logging.getLogger(__name__)

studio_bp = Blueprint('studio', __name__, url_prefix='/api/studio')

try:
    from utils.auth import require_auth
except ImportError:
    def require_auth(f):
        return f


def get_db_session():
    """Get database session with error handling"""
    try:
        from services.db_service import db_service
        if not db_service.is_available:
            return None
        return db_service.get_session()
    except Exception as e:
        logger.error(f"Database error: {e}")
        return None


@studio_bp.route('/projects', methods=['GET'])
@require_auth
def list_projects():
    """
    GET /api/studio/projects
    List all studio projects
    """
    try:
        from models.studio import StudioProject
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            projects = session.query(StudioProject).order_by(StudioProject.updated_at.desc()).all()
            return jsonify({
                'success': True,
                'projects': [p.to_dict() for p in projects]
            })
    except Exception as e:
        logger.error(f"Error listing projects: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects', methods=['POST'])
@require_auth
def create_project():
    """
    POST /api/studio/projects
    Create a new studio project
    
    Request body:
    {
        "name": "My Project",
        "description": "Project description",
        "project_type": "web|game|cli|desktop|automation",
        "language": "python|nodejs|rust|cpp|csharp"
    }
    """
    try:
        from models.studio import StudioProject, ProjectType, ProjectLanguage, ProjectStatus
        
        data = request.get_json() or {}
        name = data.get('name')
        
        if not name:
            return jsonify({
                'success': False,
                'error': 'Project name is required'
            }), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = StudioProject(
                name=name,
                description=data.get('description', ''),
                project_type=ProjectType(data.get('project_type', 'web')),
                language=ProjectLanguage(data.get('language', 'python')),
                status=ProjectStatus.DRAFT,
                user_id=data.get('user_id')
            )
            session.add(project)
            session.flush()
            
            result = project.to_dict()
            
        return jsonify({
            'success': True,
            'project': result,
            'message': 'Project created successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>', methods=['GET'])
@require_auth
def get_project(project_id):
    """
    GET /api/studio/projects/<id>
    Get project details with files, builds, and deployments
    """
    try:
        from models.studio import StudioProject
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            result = project.to_dict()
            result['files'] = [f.to_dict() for f in project.files] if project.files else []
            result['builds'] = [b.to_dict() for b in project.builds] if project.builds else []
            result['deployments'] = [d.to_dict() for d in project.deployments] if project.deployments else []
            
            return jsonify({
                'success': True,
                'project': result
            })
            
    except Exception as e:
        logger.error(f"Error getting project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>', methods=['PUT'])
@require_auth
def update_project(project_id):
    """
    PUT /api/studio/projects/<id>
    Update project details
    """
    try:
        from models.studio import StudioProject, ProjectType, ProjectLanguage, ProjectStatus
        
        data = request.get_json() or {}
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            if 'name' in data:
                project.name = data['name']
            if 'description' in data:
                project.description = data['description']
            if 'project_type' in data:
                project.project_type = ProjectType(data['project_type'])
            if 'language' in data:
                project.language = ProjectLanguage(data['language'])
            if 'status' in data:
                project.status = ProjectStatus(data['status'])
            
            project.updated_at = datetime.utcnow()
            session.flush()
            
            result = project.to_dict()
            
        return jsonify({
            'success': True,
            'project': result,
            'message': 'Project updated successfully'
        })
        
    except Exception as e:
        logger.error(f"Error updating project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>', methods=['DELETE'])
@require_auth
def delete_project(project_id):
    """
    DELETE /api/studio/projects/<id>
    Delete a project and all associated files, builds, and deployments
    """
    try:
        from models.studio import StudioProject
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            project_name = project.name
            session.delete(project)
            
        return jsonify({
            'success': True,
            'message': f'Project "{project_name}" deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"Error deleting project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/files', methods=['GET'])
@require_auth
def list_files(project_id):
    """
    GET /api/studio/projects/<id>/files
    List all files in a project
    """
    try:
        from models.studio import StudioProject, ProjectFile
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).order_by(ProjectFile.file_path).all()
            
            return jsonify({
                'success': True,
                'files': [f.to_dict() for f in files]
            })
            
    except Exception as e:
        logger.error(f"Error listing files: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/files', methods=['POST'])
@require_auth
def create_file(project_id):
    """
    POST /api/studio/projects/<id>/files
    Create a new file in a project
    
    Request body:
    {
        "file_path": "src/main.py",
        "content": "# Python code",
        "language": "python"
    }
    """
    try:
        from models.studio import StudioProject, ProjectFile
        
        data = request.get_json() or {}
        file_path = data.get('file_path')
        
        if not file_path:
            return jsonify({
                'success': False,
                'error': 'File path is required'
            }), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            existing = session.query(ProjectFile).filter_by(
                project_id=project_id,
                file_path=file_path
            ).first()
            
            if existing:
                return jsonify({
                    'success': False,
                    'error': f'File "{file_path}" already exists'
                }), 409
            
            file = ProjectFile(
                project_id=uuid.UUID(project_id),
                file_path=file_path,
                content=data.get('content', ''),
                language=data.get('language', _detect_language(file_path))
            )
            session.add(file)
            session.flush()
            
            result = file.to_dict()
            
        return jsonify({
            'success': True,
            'file': result,
            'message': 'File created successfully'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/files/<file_id>', methods=['GET'])
@require_auth
def get_file(project_id, file_id):
    """
    GET /api/studio/projects/<id>/files/<file_id>
    Get a specific file
    """
    try:
        from models.studio import ProjectFile
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            file = session.query(ProjectFile).filter_by(
                id=file_id,
                project_id=project_id
            ).first()
            
            if not file:
                return jsonify({
                    'success': False,
                    'error': 'File not found'
                }), 404
            
            return jsonify({
                'success': True,
                'file': file.to_dict()
            })
            
    except Exception as e:
        logger.error(f"Error getting file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/files/<file_id>', methods=['PUT'])
@require_auth
def update_file(project_id, file_id):
    """
    PUT /api/studio/projects/<id>/files/<file_id>
    Update file content
    """
    try:
        from models.studio import ProjectFile
        
        data = request.get_json() or {}
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            file = session.query(ProjectFile).filter_by(
                id=file_id,
                project_id=project_id
            ).first()
            
            if not file:
                return jsonify({
                    'success': False,
                    'error': 'File not found'
                }), 404
            
            if 'content' in data:
                file.content = data['content']
            if 'file_path' in data:
                file.file_path = data['file_path']
            if 'language' in data:
                file.language = data['language']
            
            file.updated_at = datetime.utcnow()
            session.flush()
            
            result = file.to_dict()
            
        return jsonify({
            'success': True,
            'file': result,
            'message': 'File updated successfully'
        })
        
    except Exception as e:
        logger.error(f"Error updating file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/files/<file_id>', methods=['DELETE'])
@require_auth
def delete_file(project_id, file_id):
    """
    DELETE /api/studio/projects/<id>/files/<file_id>
    Delete a file
    """
    try:
        from models.studio import ProjectFile
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            file = session.query(ProjectFile).filter_by(
                id=file_id,
                project_id=project_id
            ).first()
            
            if not file:
                return jsonify({
                    'success': False,
                    'error': 'File not found'
                }), 404
            
            file_path = file.file_path
            session.delete(file)
            
        return jsonify({
            'success': True,
            'message': f'File "{file_path}" deleted successfully'
        })
        
    except Exception as e:
        logger.error(f"Error deleting file: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/build', methods=['POST'])
@require_auth
def trigger_build(project_id):
    """
    POST /api/studio/projects/<id>/build
    Trigger a new build for a project
    
    Request body:
    {
        "build_type": "run|build|test|install"
    }
    """
    try:
        from models.studio import StudioProject, ProjectBuild, ProjectFile, BuildStatus, ProjectStatus
        from services.build_service import build_service
        
        data = request.get_json() or {}
        build_type = data.get('build_type', 'build')
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            language = project.language.value
            if not build_service.get_build_config(language):
                return jsonify({
                    'success': False,
                    'error': f'Unsupported language: {language}'
                }), 400
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
            
            build = ProjectBuild(
                project_id=uuid.UUID(project_id),
                build_type=build_type,
                status=BuildStatus.PENDING,
                started_at=datetime.utcnow(),
                logs=f"Build started at {datetime.utcnow().isoformat()}\n"
            )
            session.add(build)
            session.flush()
            
            build_id = str(build.id)
            
            project.status = ProjectStatus.BUILDING
            project.updated_at = datetime.utcnow()
            session.flush()
        
        all_logs = []
        final_result = {'success': False}
        
        try:
            for log_line in build_service.run_build(
                project_id=project_id,
                build_id=build_id,
                language=language,
                files=files_data,
                build_type=build_type
            ):
                if isinstance(log_line, str):
                    all_logs.append(log_line)
                elif isinstance(log_line, dict):
                    final_result = log_line
        except Exception as e:
            all_logs.append(f"[ERROR] Build execution error: {str(e)}")
            final_result = {'success': False, 'error': str(e)}
        
        session_ctx = get_db_session()
        with session_ctx as session:
            build = session.query(ProjectBuild).filter_by(id=build_id).first()
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if build:
                build.logs = '\n'.join(all_logs)
                build.completed_at = datetime.utcnow()
                
                if final_result.get('success'):
                    build.status = BuildStatus.SUCCESS
                    build.output_path = final_result.get('artifact_path', '')
                    if project:
                        project.status = ProjectStatus.READY
                else:
                    build.status = BuildStatus.FAILED
                    if project:
                        project.status = ProjectStatus.DRAFT
                
                session.flush()
                result = build.to_dict()
        
        return jsonify({
            'success': final_result.get('success', False),
            'build': result,
            'artifacts': final_result.get('artifacts', []),
            'message': 'Build completed successfully' if final_result.get('success') else 'Build failed'
        }), 201 if final_result.get('success') else 500
        
    except Exception as e:
        logger.error(f"Error triggering build: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/build/stream', methods=['GET'])
@require_auth
def stream_build(project_id):
    """
    GET /api/studio/projects/<id>/build/stream?build_type=build
    Stream build logs via Server-Sent Events
    """
    from flask import Response
    
    try:
        from models.studio import StudioProject, ProjectBuild, ProjectFile, BuildStatus, ProjectStatus
        from services.build_service import build_service
        
        build_type = request.args.get('build_type', 'build')
        
        session_ctx = get_db_session()
        if not session_ctx:
            def error_stream():
                yield f"data: {{'error': 'Database not available'}}\n\n"
            return Response(error_stream(), mimetype='text/event-stream')
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                def error_stream():
                    yield f"data: {{'error': 'Project not found'}}\n\n"
                return Response(error_stream(), mimetype='text/event-stream')
            
            language = project.language.value
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
            
            build = ProjectBuild(
                project_id=uuid.UUID(project_id),
                build_type=build_type,
                status=BuildStatus.RUNNING,
                started_at=datetime.utcnow(),
                logs=""
            )
            session.add(build)
            session.flush()
            
            build_id = str(build.id)
            
            project.status = ProjectStatus.BUILDING
            project.updated_at = datetime.utcnow()
        
        def generate():
            import json
            all_logs = []
            final_result = {'success': False}
            
            yield f"data: {json.dumps({'type': 'start', 'build_id': build_id})}\n\n"
            
            try:
                for log_line in build_service.run_build(
                    project_id=project_id,
                    build_id=build_id,
                    language=language,
                    files=files_data,
                    build_type=build_type
                ):
                    if isinstance(log_line, str):
                        all_logs.append(log_line)
                        level = 'info'
                        if '[ERROR]' in log_line:
                            level = 'error'
                        elif '[WARNING]' in log_line:
                            level = 'warning'
                        elif '[SUCCESS]' in log_line:
                            level = 'success'
                        
                        yield f"data: {json.dumps({'type': 'log', 'message': log_line, 'level': level})}\n\n"
                    elif isinstance(log_line, dict):
                        final_result = log_line
            except Exception as e:
                error_msg = f"[ERROR] Build error: {str(e)}"
                all_logs.append(error_msg)
                yield f"data: {json.dumps({'type': 'log', 'message': error_msg, 'level': 'error'})}\n\n"
                final_result = {'success': False, 'error': str(e)}
            
            try:
                session_ctx = get_db_session()
                with session_ctx as session:
                    build = session.query(ProjectBuild).filter_by(id=build_id).first()
                    project = session.query(StudioProject).filter_by(id=project_id).first()
                    
                    if build:
                        build.logs = '\n'.join(all_logs)
                        build.completed_at = datetime.utcnow()
                        
                        if final_result.get('success'):
                            build.status = BuildStatus.SUCCESS
                            build.output_path = final_result.get('artifact_path', '')
                            if project:
                                project.status = ProjectStatus.READY
                        else:
                            build.status = BuildStatus.FAILED
                            if project:
                                project.status = ProjectStatus.DRAFT
            except Exception as e:
                logger.error(f"Error updating build status: {e}")
            
            yield f"data: {json.dumps({'type': 'complete', 'success': final_result.get('success', False), 'artifacts': final_result.get('artifacts', []), 'build_id': build_id})}\n\n"
        
        response = Response(generate(), mimetype='text/event-stream')
        response.headers['Cache-Control'] = 'no-cache'
        response.headers['X-Accel-Buffering'] = 'no'
        return response
        
    except Exception as e:
        logger.error(f"Error streaming build: {e}")
        def error_stream():
            import json
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream')


@studio_bp.route('/projects/<project_id>/builds/<build_id>/artifacts', methods=['GET'])
@require_auth
def list_build_artifacts(project_id, build_id):
    """
    GET /api/studio/projects/<id>/builds/<build_id>/artifacts
    List artifacts for a build
    """
    try:
        from services.build_service import build_service
        
        artifacts = build_service.list_artifacts(project_id, build_id)
        
        return jsonify({
            'success': True,
            'artifacts': artifacts
        })
        
    except Exception as e:
        logger.error(f"Error listing artifacts: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/builds/<build_id>/artifacts/<filename>', methods=['GET'])
@require_auth
def download_artifact(project_id, build_id, filename):
    """
    GET /api/studio/projects/<id>/builds/<build_id>/artifacts/<filename>
    Download an artifact file
    """
    try:
        from flask import send_file
        from services.build_service import build_service
        
        file_path = build_service.get_artifact_file(project_id, build_id, filename)
        
        if not file_path:
            return jsonify({
                'success': False,
                'error': 'Artifact not found'
            }), 404
        
        return send_file(file_path, as_attachment=True, download_name=filename)
        
    except Exception as e:
        logger.error(f"Error downloading artifact: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/builds/<build_id>/cancel', methods=['POST'])
@require_auth
def cancel_build(project_id, build_id):
    """
    POST /api/studio/projects/<id>/builds/<build_id>/cancel
    Cancel an active build
    """
    try:
        from models.studio import ProjectBuild, BuildStatus
        from services.build_service import build_service
        
        cancelled = build_service.cancel_build(build_id)
        
        if cancelled:
            session_ctx = get_db_session()
            if session_ctx:
                with session_ctx as session:
                    build = session.query(ProjectBuild).filter_by(id=build_id).first()
                    if build:
                        build.status = BuildStatus.FAILED
                        build.logs += "\n[CANCELLED] Build was cancelled by user"
                        build.completed_at = datetime.utcnow()
            
            return jsonify({
                'success': True,
                'message': 'Build cancelled successfully'
            })
        
        return jsonify({
            'success': False,
            'error': 'Build not found or already completed'
        }), 404
        
    except Exception as e:
        logger.error(f"Error cancelling build: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/build-configs', methods=['GET'])
@require_auth
def get_build_configs():
    """
    GET /api/studio/build-configs
    Get all available build configurations
    """
    try:
        from services.build_service import build_service, BUILD_CONFIGS
        
        return jsonify({
            'success': True,
            'languages': build_service.get_supported_languages(),
            'configs': BUILD_CONFIGS
        })
        
    except Exception as e:
        logger.error(f"Error getting build configs: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/builds', methods=['GET'])
@require_auth
def list_builds(project_id):
    """
    GET /api/studio/projects/<id>/builds
    List all builds for a project
    """
    try:
        from models.studio import StudioProject, ProjectBuild
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            builds = session.query(ProjectBuild).filter_by(project_id=project_id).order_by(ProjectBuild.started_at.desc()).all()
            
            return jsonify({
                'success': True,
                'builds': [b.to_dict() for b in builds]
            })
            
    except Exception as e:
        logger.error(f"Error listing builds: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/deploy', methods=['POST'])
@require_auth
def deploy_project(project_id):
    """
    POST /api/studio/projects/<id>/deploy
    Deploy a project to a target platform
    
    Request body:
    {
        "target": "docker|kvm|native|tailscale",
        "target_host": "hostname or IP for remote deployments",
        "port": 8080,
        "build_id": "uuid" (optional, uses latest successful build if not provided)
    }
    """
    try:
        from models.studio import (
            StudioProject, ProjectBuild, ProjectDeployment, ProjectFile,
            DeploymentTarget, DeploymentStatus, BuildStatus, ProjectStatus
        )
        from services.studio_deployment_service import studio_deployment_service
        
        data = request.get_json() or {}
        target = data.get('target', 'docker')
        target_host = data.get('target_host')
        port = data.get('port', 8080)
        build_id = data.get('build_id')
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            if build_id:
                build = session.query(ProjectBuild).filter_by(
                    id=build_id,
                    project_id=project_id
                ).first()
            else:
                build = session.query(ProjectBuild).filter_by(
                    project_id=project_id,
                    status=BuildStatus.SUCCESS
                ).order_by(ProjectBuild.completed_at.desc()).first()
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
            
            project_name = project.name
            language = project.language.value
            project_type = project.project_type.value
            build_output_path = build.output_path if build else None
            
            deployment = ProjectDeployment(
                project_id=uuid.UUID(project_id),
                build_id=build.id if build else None,
                target=DeploymentTarget(target),
                target_host=target_host,
                port=port,
                status=DeploymentStatus.DEPLOYING
            )
            session.add(deployment)
            session.flush()
            
            deployment_id = str(deployment.id)
        
        all_logs = []
        final_result = {'success': False}
        
        try:
            if target == 'docker':
                generator = studio_deployment_service.deploy_docker(
                    project_id=project_id,
                    project_name=project_name,
                    language=language,
                    project_type=project_type,
                    files=files_data,
                    build_output_path=build_output_path,
                    port=port,
                    target_host=target_host
                )
            elif target == 'native':
                generator = studio_deployment_service.deploy_native(
                    project_id=project_id,
                    project_name=project_name,
                    language=language,
                    files=files_data,
                    build_output_path=build_output_path,
                    target_host=target_host or 'localhost'
                )
            elif target == 'tailscale':
                if not target_host:
                    return jsonify({
                        'success': False,
                        'error': 'target_host is required for Tailscale deployment'
                    }), 400
                generator = studio_deployment_service.deploy_tailscale(
                    project_id=project_id,
                    project_name=project_name,
                    language=language,
                    project_type=project_type,
                    files=files_data,
                    target_device=target_host,
                    build_output_path=build_output_path,
                    port=port
                )
            elif target == 'kvm':
                generator = studio_deployment_service.deploy_kvm(
                    project_id=project_id,
                    project_name=project_name,
                    language=language,
                    project_type=project_type,
                    files=files_data,
                    vm_name=target_host or 'RDPWindows',
                    build_output_path=build_output_path,
                    port=port
                )
            else:
                return jsonify({
                    'success': False,
                    'error': f'Unsupported deployment target: {target}'
                }), 400
            
            for log_line in generator:
                if isinstance(log_line, str):
                    all_logs.append(log_line)
                elif isinstance(log_line, dict):
                    final_result = log_line
                    
        except Exception as e:
            all_logs.append(f"[ERROR] Deployment error: {str(e)}")
            final_result = {'success': False, 'error': str(e)}
        
        session_ctx = get_db_session()
        with session_ctx as session:
            deployment = session.query(ProjectDeployment).filter_by(id=deployment_id).first()
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if deployment:
                deployment.logs = '\n'.join(all_logs)
                
                if final_result.get('success'):
                    deployment.status = DeploymentStatus.ACTIVE
                    deployment.container_id = final_result.get('container_id')
                    deployment.service_name = final_result.get('service_name') or final_result.get('container_name')
                    deployment.url = final_result.get('url')
                    if project:
                        project.status = ProjectStatus.DEPLOYED
                else:
                    deployment.status = DeploymentStatus.FAILED
                
                deployment.updated_at = datetime.utcnow()
                session.flush()
                result = deployment.to_dict()
        
        return jsonify({
            'success': final_result.get('success', False),
            'deployment': result,
            'logs': all_logs,
            'message': f'Project deployed to {target} successfully' if final_result.get('success') else 'Deployment failed'
        }), 201 if final_result.get('success') else 500
        
    except Exception as e:
        logger.error(f"Error deploying project: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/deploy/stream', methods=['POST'])
@require_auth
def stream_deploy_project(project_id):
    """
    POST /api/studio/projects/<id>/deploy/stream
    Deploy a project with streaming logs via Server-Sent Events
    """
    from flask import Response
    
    try:
        from models.studio import (
            StudioProject, ProjectBuild, ProjectDeployment, ProjectFile,
            DeploymentTarget, DeploymentStatus, BuildStatus, ProjectStatus
        )
        from services.studio_deployment_service import studio_deployment_service
        import json
        
        data = request.get_json() or {}
        target = data.get('target', 'docker')
        target_host = data.get('target_host')
        port = data.get('port', 8080)
        build_id = data.get('build_id')
        
        session_ctx = get_db_session()
        if not session_ctx:
            def error_stream():
                yield f"data: {json.dumps({'error': 'Database not available'})}\n\n"
            return Response(error_stream(), mimetype='text/event-stream')
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                def error_stream():
                    yield f"data: {json.dumps({'error': 'Project not found'})}\n\n"
                return Response(error_stream(), mimetype='text/event-stream')
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
            
            if build_id:
                build = session.query(ProjectBuild).filter_by(id=build_id, project_id=project_id).first()
            else:
                build = session.query(ProjectBuild).filter_by(
                    project_id=project_id, status=BuildStatus.SUCCESS
                ).order_by(ProjectBuild.completed_at.desc()).first()
            
            project_name = project.name
            language = project.language.value
            project_type = project.project_type.value
            build_output_path = build.output_path if build else None
            
            deployment = ProjectDeployment(
                project_id=uuid.UUID(project_id),
                build_id=build.id if build else None,
                target=DeploymentTarget(target),
                target_host=target_host,
                port=port,
                status=DeploymentStatus.DEPLOYING
            )
            session.add(deployment)
            session.flush()
            deployment_id = str(deployment.id)
        
        def generate():
            all_logs = []
            final_result = {'success': False}
            
            yield f"data: {json.dumps({'type': 'start', 'deployment_id': deployment_id})}\n\n"
            
            try:
                if target == 'docker':
                    generator = studio_deployment_service.deploy_docker(
                        project_id=project_id, project_name=project_name,
                        language=language, project_type=project_type,
                        files=files_data, build_output_path=build_output_path,
                        port=port, target_host=target_host
                    )
                elif target == 'native':
                    generator = studio_deployment_service.deploy_native(
                        project_id=project_id, project_name=project_name,
                        language=language, files=files_data,
                        build_output_path=build_output_path,
                        target_host=target_host or 'localhost'
                    )
                elif target == 'tailscale':
                    generator = studio_deployment_service.deploy_tailscale(
                        project_id=project_id, project_name=project_name,
                        language=language, project_type=project_type,
                        files=files_data, target_device=target_host,
                        build_output_path=build_output_path, port=port
                    )
                elif target == 'kvm':
                    generator = studio_deployment_service.deploy_kvm(
                        project_id=project_id, project_name=project_name,
                        language=language, project_type=project_type,
                        files=files_data, vm_name=target_host or 'RDPWindows',
                        build_output_path=build_output_path, port=port
                    )
                else:
                    yield f"data: {json.dumps({'error': f'Unsupported target: {target}'})}\n\n"
                    return
                
                for log_line in generator:
                    if isinstance(log_line, str):
                        all_logs.append(log_line)
                        yield f"data: {json.dumps({'type': 'log', 'message': log_line})}\n\n"
                    elif isinstance(log_line, dict):
                        final_result = log_line
                
            except Exception as e:
                all_logs.append(f"[ERROR] {str(e)}")
                final_result = {'success': False, 'error': str(e)}
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
            session_ctx = get_db_session()
            if session_ctx:
                with session_ctx as session:
                    deployment = session.query(ProjectDeployment).filter_by(id=deployment_id).first()
                    project = session.query(StudioProject).filter_by(id=project_id).first()
                    
                    if deployment:
                        deployment.logs = '\n'.join(all_logs)
                        if final_result.get('success'):
                            deployment.status = DeploymentStatus.ACTIVE
                            deployment.container_id = final_result.get('container_id')
                            deployment.service_name = final_result.get('service_name') or final_result.get('container_name')
                            deployment.url = final_result.get('url')
                            if project:
                                project.status = ProjectStatus.DEPLOYED
                        else:
                            deployment.status = DeploymentStatus.FAILED
            
            yield f"data: {json.dumps({'type': 'complete', 'success': final_result.get('success', False), 'result': final_result})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        logger.error(f"Error in stream deploy: {e}")
        def error_stream():
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        return Response(error_stream(), mimetype='text/event-stream')


@studio_bp.route('/projects/<project_id>/deployments', methods=['GET'])
@require_auth
def list_deployments(project_id):
    """
    GET /api/studio/projects/<id>/deployments
    List all deployments for a project
    """
    try:
        from models.studio import StudioProject, ProjectDeployment
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            deployments = session.query(ProjectDeployment).filter_by(
                project_id=project_id
            ).order_by(ProjectDeployment.created_at.desc()).all()
            
            return jsonify({
                'success': True,
                'deployments': [d.to_dict() for d in deployments]
            })
            
    except Exception as e:
        logger.error(f"Error listing deployments: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/deployments/<deployment_id>/status', methods=['GET'])
@require_auth
def get_deployment_status(project_id, deployment_id):
    """
    GET /api/studio/projects/<id>/deployments/<id>/status
    Get status of a specific deployment
    """
    try:
        from models.studio import ProjectDeployment
        from services.studio_deployment_service import studio_deployment_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            deployment = session.query(ProjectDeployment).filter_by(
                id=deployment_id,
                project_id=project_id
            ).first()
            
            if not deployment:
                return jsonify({
                    'success': False,
                    'error': 'Deployment not found'
                }), 404
            
            runtime_status = studio_deployment_service.get_deployment_status(
                deployment_target=deployment.target.value,
                container_id=deployment.container_id,
                service_name=deployment.service_name,
                target_host=deployment.target_host
            )
            
            result = deployment.to_dict()
            result['runtime_status'] = runtime_status
            
            return jsonify({
                'success': True,
                'deployment': result
            })
            
    except Exception as e:
        logger.error(f"Error getting deployment status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/deployments/<deployment_id>', methods=['DELETE'])
@require_auth
def delete_deployment(project_id, deployment_id):
    """
    DELETE /api/studio/projects/<id>/deployments/<id>
    Stop and remove a deployment
    """
    try:
        from models.studio import ProjectDeployment, DeploymentStatus, StudioProject, ProjectStatus
        from services.studio_deployment_service import studio_deployment_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            deployment = session.query(ProjectDeployment).filter_by(
                id=deployment_id,
                project_id=project_id
            ).first()
            
            if not deployment:
                return jsonify({
                    'success': False,
                    'error': 'Deployment not found'
                }), 404
            
            success, message = studio_deployment_service.remove_deployment(
                deployment_target=deployment.target.value,
                container_id=deployment.container_id,
                service_name=deployment.service_name,
                target_host=deployment.target_host,
                project_id=project_id
            )
            
            deployment.status = DeploymentStatus.STOPPED
            deployment.updated_at = datetime.utcnow()
            
            active_deployments = session.query(ProjectDeployment).filter_by(
                project_id=project_id,
                status=DeploymentStatus.ACTIVE
            ).count()
            
            if active_deployments == 0:
                project = session.query(StudioProject).filter_by(id=project_id).first()
                if project and project.status == ProjectStatus.DEPLOYED:
                    project.status = ProjectStatus.READY
            
            session.flush()
            
            return jsonify({
                'success': success,
                'message': message
            })
            
    except Exception as e:
        logger.error(f"Error deleting deployment: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/deployments/<deployment_id>/stop', methods=['POST'])
@require_auth
def stop_deployment(project_id, deployment_id):
    """
    POST /api/studio/projects/<id>/deployments/<id>/stop
    Stop a running deployment without removing it
    """
    try:
        from models.studio import ProjectDeployment, DeploymentStatus
        from services.studio_deployment_service import studio_deployment_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            deployment = session.query(ProjectDeployment).filter_by(
                id=deployment_id,
                project_id=project_id
            ).first()
            
            if not deployment:
                return jsonify({
                    'success': False,
                    'error': 'Deployment not found'
                }), 404
            
            success, message = studio_deployment_service.stop_deployment(
                deployment_target=deployment.target.value,
                container_id=deployment.container_id,
                service_name=deployment.service_name,
                target_host=deployment.target_host
            )
            
            if success:
                deployment.status = DeploymentStatus.STOPPED
                deployment.updated_at = datetime.utcnow()
            
            session.flush()
            
            return jsonify({
                'success': success,
                'message': message,
                'deployment': deployment.to_dict()
            })
            
    except Exception as e:
        logger.error(f"Error stopping deployment: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/tailscale/devices', methods=['GET'])
@require_auth
def list_tailscale_devices():
    """
    GET /api/studio/tailscale/devices
    List available Tailscale devices for deployment
    """
    try:
        from services.studio_deployment_service import studio_deployment_service
        
        devices = studio_deployment_service.get_tailscale_devices()
        
        return jsonify({
            'success': True,
            'devices': devices
        })
        
    except Exception as e:
        logger.error(f"Error listing Tailscale devices: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


def _detect_language(file_path: str) -> str:
    """Detect programming language from file extension"""
    ext_map = {
        '.py': 'python',
        '.js': 'javascript',
        '.ts': 'typescript',
        '.jsx': 'javascript',
        '.tsx': 'typescript',
        '.rs': 'rust',
        '.cpp': 'cpp',
        '.c': 'c',
        '.h': 'c',
        '.hpp': 'cpp',
        '.cs': 'csharp',
        '.html': 'html',
        '.css': 'css',
        '.json': 'json',
        '.yaml': 'yaml',
        '.yml': 'yaml',
        '.md': 'markdown',
        '.sh': 'bash',
        '.sql': 'sql',
        '.go': 'go',
        '.java': 'java'
    }
    
    for ext, lang in ext_map.items():
        if file_path.endswith(ext):
            return lang
    
    return 'plaintext'


def _load_templates():
    """Load templates from JSON file"""
    import json
    import os
    templates_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'studio_templates.json')
    try:
        with open(templates_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load templates: {e}")
        return []


@studio_bp.route('/templates', methods=['GET'])
@require_auth
def list_templates():
    """
    GET /api/studio/templates
    List all project templates with optional category filter
    
    Query params:
    - category: Filter by category (games, cli, desktop, web, automation, discord)
    """
    try:
        templates = _load_templates()
        category = request.args.get('category')
        
        if category:
            templates = [t for t in templates if t.get('category') == category]
        
        template_list = [{
            'id': t['id'],
            'name': t['name'],
            'description': t['description'],
            'category': t['category'],
            'language': t['language'],
            'icon': t.get('icon', 'bi-folder'),
            'tags': t.get('tags', [])
        } for t in templates]
        
        categories = {}
        for t in _load_templates():
            cat = t.get('category', 'other')
            if cat not in categories:
                categories[cat] = {
                    'id': cat,
                    'name': cat.replace('_', ' ').title(),
                    'count': 0
                }
            categories[cat]['count'] += 1
        
        return jsonify({
            'success': True,
            'templates': template_list,
            'categories': list(categories.values())
        })
    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/templates/<template_id>', methods=['GET'])
@require_auth
def get_template(template_id):
    """
    GET /api/studio/templates/<id>
    Get full template details including file structure and content
    """
    try:
        templates = _load_templates()
        template = next((t for t in templates if t['id'] == template_id), None)
        
        if not template:
            return jsonify({
                'success': False,
                'error': 'Template not found'
            }), 404
        
        return jsonify({
            'success': True,
            'template': template
        })
    except Exception as e:
        logger.error(f"Error getting template: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/from-template', methods=['POST'])
@require_auth
def create_project_from_template():
    """
    POST /api/studio/projects/from-template
    Create a new project from a template
    
    Request body:
    {
        "template_id": "pygame-starter",
        "name": "My Game Project",
        "description": "My awesome game"
    }
    """
    try:
        from models.studio import StudioProject, ProjectFile, ProjectType, ProjectLanguage, ProjectStatus
        
        data = request.get_json() or {}
        template_id = data.get('template_id')
        project_name = data.get('name')
        
        if not template_id:
            return jsonify({
                'success': False,
                'error': 'Template ID is required'
            }), 400
        
        if not project_name:
            return jsonify({
                'success': False,
                'error': 'Project name is required'
            }), 400
        
        templates = _load_templates()
        template = next((t for t in templates if t['id'] == template_id), None)
        
        if not template:
            return jsonify({
                'success': False,
                'error': 'Template not found'
            }), 404
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        category_to_type = {
            'games': 'game',
            'cli': 'cli',
            'desktop': 'desktop',
            'web': 'web',
            'automation': 'automation',
            'discord': 'automation'
        }
        
        language_map = {
            'python': 'python',
            'nodejs': 'nodejs',
            'rust': 'rust',
            'csharp': 'csharp',
            'gdscript': 'python',
            'bash': 'python'
        }
        
        project_type = category_to_type.get(template.get('category', 'web'), 'web')
        project_language = language_map.get(template.get('language', 'python'), 'python')
        
        with session_ctx as session:
            project = StudioProject(
                name=project_name,
                description=data.get('description', template.get('description', '')),
                project_type=ProjectType(project_type),
                language=ProjectLanguage(project_language),
                status=ProjectStatus.DRAFT,
                user_id=data.get('user_id')
            )
            session.add(project)
            session.flush()
            
            for file_def in template.get('files', []):
                file = ProjectFile(
                    project_id=project.id,
                    file_path=file_def['path'],
                    content=file_def.get('content', ''),
                    language=_detect_language(file_def['path'])
                )
                session.add(file)
            
            session.flush()
            
            result = project.to_dict()
            result['files'] = [f.to_dict() for f in project.files] if project.files else []
            result['template'] = {
                'id': template['id'],
                'name': template['name'],
                'dependencies': template.get('dependencies', {}),
                'build_commands': template.get('build_commands', {})
            }
        
        return jsonify({
            'success': True,
            'project': result,
            'message': f'Project "{project_name}" created from template "{template["name"]}"'
        }), 201
        
    except Exception as e:
        logger.error(f"Error creating project from template: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/templates/categories', methods=['GET'])
@require_auth
def list_template_categories():
    """
    GET /api/studio/templates/categories
    List all template categories with counts
    """
    try:
        templates = _load_templates()
        
        category_info = {
            'games': {'name': 'Games', 'icon': 'bi-joystick', 'description': 'Game development templates'},
            'cli': {'name': 'CLI Tools', 'icon': 'bi-terminal', 'description': 'Command-line applications'},
            'desktop': {'name': 'Desktop Apps', 'icon': 'bi-window', 'description': 'Desktop GUI applications'},
            'web': {'name': 'Web Services', 'icon': 'bi-server', 'description': 'Web APIs and services'},
            'automation': {'name': 'Automations', 'icon': 'bi-gear-wide-connected', 'description': 'Automation and task runners'},
            'discord': {'name': 'Discord Bots', 'icon': 'bi-discord', 'description': 'Discord bot templates'}
        }
        
        categories = {}
        for t in templates:
            cat = t.get('category', 'other')
            if cat not in categories:
                info = category_info.get(cat, {'name': cat.title(), 'icon': 'bi-folder', 'description': ''})
                categories[cat] = {
                    'id': cat,
                    'name': info['name'],
                    'icon': info['icon'],
                    'description': info['description'],
                    'count': 0,
                    'templates': []
                }
            categories[cat]['count'] += 1
            categories[cat]['templates'].append({
                'id': t['id'],
                'name': t['name'],
                'language': t['language']
            })
        
        return jsonify({
            'success': True,
            'categories': list(categories.values())
        })
    except Exception as e:
        logger.error(f"Error listing template categories: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


studio_web_bp = Blueprint('studio_web', __name__)


@studio_web_bp.route('/studio')
@require_auth
def studio_page():
    """Render the Studio page"""
    return render_template('studio.html')


@studio_bp.route('/ai/status', methods=['GET'])
@require_auth
def ai_status():
    """
    GET /api/studio/ai/status
    Get AI service status and capabilities
    """
    try:
        from services.studio_ai_service import studio_ai_service
        return jsonify({
            'success': True,
            **studio_ai_service.get_status()
        })
    except Exception as e:
        logger.error(f"Error getting AI status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/ai/generate', methods=['POST'])
@require_auth
def ai_generate():
    """
    POST /api/studio/ai/generate
    Generate code from description (streaming)
    
    Request body:
    {
        "description": "Create a REST API endpoint",
        "language": "python",
        "project_files": [{"path": "main.py", "content": "..."}]
    }
    """
    from flask import Response
    try:
        from services.studio_ai_service import studio_ai_service
        
        data = request.get_json() or {}
        description = data.get('description', '')
        language = data.get('language', 'python')
        project_files = data.get('project_files', [])
        stream = data.get('stream', True)
        
        if not description:
            return jsonify({
                'success': False,
                'error': 'Description is required'
            }), 400
        
        def generate():
            for chunk in studio_ai_service.generate_code(
                description=description,
                language=language,
                project_files=project_files,
                stream=stream
            ):
                yield chunk
        
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )
    except Exception as e:
        logger.error(f"Error generating code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/ai/explain', methods=['POST'])
@require_auth
def ai_explain():
    """
    POST /api/studio/ai/explain
    Explain code snippet (streaming)
    
    Request body:
    {
        "code": "def my_function()...",
        "language": "python"
    }
    """
    from flask import Response
    try:
        from services.studio_ai_service import studio_ai_service
        
        data = request.get_json() or {}
        code = data.get('code', '')
        language = data.get('language', 'python')
        stream = data.get('stream', True)
        
        if not code:
            return jsonify({
                'success': False,
                'error': 'Code is required'
            }), 400
        
        def generate():
            for chunk in studio_ai_service.explain_code(
                code=code,
                language=language,
                stream=stream
            ):
                yield chunk
        
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )
    except Exception as e:
        logger.error(f"Error explaining code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/ai/refactor', methods=['POST'])
@require_auth
def ai_refactor():
    """
    POST /api/studio/ai/refactor
    Refactor/improve code (streaming)
    
    Request body:
    {
        "code": "def my_function()...",
        "language": "python",
        "instructions": "Make it more efficient"
    }
    """
    from flask import Response
    try:
        from services.studio_ai_service import studio_ai_service
        
        data = request.get_json() or {}
        code = data.get('code', '')
        language = data.get('language', 'python')
        instructions = data.get('instructions', '')
        stream = data.get('stream', True)
        
        if not code:
            return jsonify({
                'success': False,
                'error': 'Code is required'
            }), 400
        
        def generate():
            for chunk in studio_ai_service.refactor_code(
                code=code,
                language=language,
                instructions=instructions,
                stream=stream
            ):
                yield chunk
        
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )
    except Exception as e:
        logger.error(f"Error refactoring code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/ai/debug', methods=['POST'])
@require_auth
def ai_debug():
    """
    POST /api/studio/ai/debug
    Debug code and suggest fixes (streaming)
    
    Request body:
    {
        "code": "def my_function()...",
        "error_message": "TypeError: ...",
        "language": "python"
    }
    """
    from flask import Response
    try:
        from services.studio_ai_service import studio_ai_service
        
        data = request.get_json() or {}
        code = data.get('code', '')
        error_message = data.get('error_message', '')
        language = data.get('language', 'python')
        stream = data.get('stream', True)
        
        if not code:
            return jsonify({
                'success': False,
                'error': 'Code is required'
            }), 400
        
        def generate():
            for chunk in studio_ai_service.debug_code(
                code=code,
                error_message=error_message,
                language=language,
                stream=stream
            ):
                yield chunk
        
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )
    except Exception as e:
        logger.error(f"Error debugging code: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/ai/tests', methods=['POST'])
@require_auth
def ai_generate_tests():
    """
    POST /api/studio/ai/tests
    Generate unit tests for code (streaming)
    
    Request body:
    {
        "code": "def my_function()...",
        "language": "python"
    }
    """
    from flask import Response
    try:
        from services.studio_ai_service import studio_ai_service
        
        data = request.get_json() or {}
        code = data.get('code', '')
        language = data.get('language', 'python')
        stream = data.get('stream', True)
        
        if not code:
            return jsonify({
                'success': False,
                'error': 'Code is required'
            }), 400
        
        def generate():
            for chunk in studio_ai_service.generate_tests(
                code=code,
                language=language,
                stream=stream
            ):
                yield chunk
        
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )
    except Exception as e:
        logger.error(f"Error generating tests: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/ai/chat', methods=['POST'])
@require_auth
def ai_chat():
    """
    POST /api/studio/ai/chat
    General chat with project context (streaming)
    
    Request body:
    {
        "message": "How do I implement...",
        "conversation_history": [{"role": "user", "content": "..."}],
        "project_files": [{"path": "main.py", "content": "..."}]
    }
    """
    from flask import Response
    try:
        from services.studio_ai_service import studio_ai_service
        
        data = request.get_json() or {}
        message = data.get('message', '')
        conversation_history = data.get('conversation_history', [])
        project_files = data.get('project_files', [])
        stream = data.get('stream', True)
        
        if not message:
            return jsonify({
                'success': False,
                'error': 'Message is required'
            }), 400
        
        def generate():
            for chunk in studio_ai_service.chat(
                message=message,
                conversation_history=conversation_history,
                project_files=project_files,
                stream=stream
            ):
                yield chunk
        
        return Response(
            generate(),
            mimetype='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no'
            }
        )
    except Exception as e:
        logger.error(f"Error in AI chat: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/codeserver/status', methods=['GET'])
@require_auth
def codeserver_status():
    """
    GET /api/studio/codeserver/status
    Get Code Server integration status
    """
    try:
        from services.code_server_service import code_server_service
        return jsonify({
            'success': True,
            **code_server_service.get_status()
        })
    except Exception as e:
        logger.error(f"Error getting Code Server status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/open-in-codeserver', methods=['GET'])
@require_auth
def open_in_codeserver(project_id):
    """
    GET /api/studio/projects/<id>/open-in-codeserver
    Get URL to open project in Code Server
    
    Query params:
    - file: Optional file path to open directly
    - workspace: If true, opens the workspace file instead of folder
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.code_server_service import code_server_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
            
            sync_result = code_server_service.sync_project_files(
                project_id=project_id,
                files=files_data,
                project_name=project.name,
                language=project.language.value if project.language else 'python'
            )
            
            if not sync_result.get('success'):
                logger.warning(f"File sync had errors: {sync_result.get('errors')}")
        
        file_path = request.args.get('file')
        use_workspace = request.args.get('workspace', '').lower() == 'true'
        
        if use_workspace:
            url = code_server_service.get_code_server_workspace_url(project_id)
        else:
            url = code_server_service.get_code_server_url(project_id, file_path)
        
        return jsonify({
            'success': True,
            'url': url,
            'project_path': sync_result.get('project_path'),
            'synced_files': sync_result.get('synced_files', []),
            'workspace_file': sync_result.get('workspace_file')
        })
        
    except Exception as e:
        logger.error(f"Error generating Code Server URL: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/sync', methods=['POST'])
@require_auth
def sync_project_files(project_id):
    """
    POST /api/studio/projects/<id>/sync
    Manually sync project files to filesystem for Code Server
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.code_server_service import code_server_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
            
            result = code_server_service.sync_project_files(
                project_id=project_id,
                files=files_data,
                project_name=project.name,
                language=project.language.value if project.language else 'python'
            )
        
        return jsonify({
            'success': result.get('success', False),
            'project_path': result.get('project_path'),
            'synced_files': result.get('synced_files', []),
            'errors': result.get('errors', []),
            'workspace_file': result.get('workspace_file'),
            'code_server_url': code_server_service.get_code_server_url(project_id)
        })
        
    except Exception as e:
        logger.error(f"Error syncing project files: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/sync-from-filesystem', methods=['POST'])
@require_auth
def sync_from_filesystem(project_id):
    """
    POST /api/studio/projects/<id>/sync-from-filesystem
    Sync changes made in Code Server back to database
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.code_server_service import code_server_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        filesystem_files = code_server_service.read_files_from_filesystem(project_id)
        
        if not filesystem_files:
            return jsonify({
                'success': True,
                'message': 'No files found on filesystem',
                'updated': 0,
                'created': 0
            })
        
        updated_count = 0
        created_count = 0
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            for fs_file in filesystem_files:
                file_path = fs_file['file_path']
                content = fs_file['content']
                
                existing = session.query(ProjectFile).filter_by(
                    project_id=project_id,
                    file_path=file_path
                ).first()
                
                if existing:
                    if existing.content != content:
                        existing.content = content
                        existing.updated_at = datetime.utcnow()
                        updated_count += 1
                else:
                    new_file = ProjectFile(
                        project_id=uuid.UUID(project_id),
                        file_path=file_path,
                        content=content,
                        language=_detect_language(file_path)
                    )
                    session.add(new_file)
                    created_count += 1
            
            project.updated_at = datetime.utcnow()
            session.flush()
        
        return jsonify({
            'success': True,
            'message': 'Files synced from filesystem',
            'updated': updated_count,
            'created': created_count,
            'total_files': len(filesystem_files)
        })
        
    except Exception as e:
        logger.error(f"Error syncing from filesystem: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/git/init', methods=['POST'])
@require_auth
def git_init(project_id):
    """
    POST /api/studio/projects/<id>/git/init
    Initialize a git repository for the project
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.git_service import git_service
        
        data = request.get_json() or {}
        branch = data.get('branch', 'main')
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [{'file_path': f.file_path, 'content': f.content} for f in files]
            
            git_service.sync_files_to_workspace(project_id, files_data)
            
            success, message = git_service.init_repository(project_id, branch)
            
            if success:
                project.git_branch = branch
                session.flush()
            
            return jsonify({
                'success': success,
                'message': message,
                'branch': branch
            }), 200 if success else 500
            
    except Exception as e:
        logger.error(f"Error initializing git: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/clone', methods=['POST'])
@require_auth
def git_clone(project_id):
    """
    POST /api/studio/projects/<id>/git/clone
    Clone a repository for the project
    """
    from flask import Response
    
    try:
        from models.studio import StudioProject, ProjectFile
        from services.git_service import git_service
        import json
        
        data = request.get_json() or {}
        repo_url = data.get('repo_url')
        branch = data.get('branch', 'main')
        access_token = data.get('access_token')
        
        if not repo_url:
            return jsonify({'success': False, 'error': 'Repository URL is required'}), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        def generate():
            final_result = {'success': False}
            
            yield f"data: {json.dumps({'type': 'start', 'message': 'Starting clone operation'})}\n\n"
            
            try:
                generator = git_service.clone_repository(project_id, repo_url, branch, access_token)
                
                for log_line in generator:
                    if isinstance(log_line, str):
                        yield f"data: {json.dumps({'type': 'log', 'message': log_line})}\n\n"
                    elif isinstance(log_line, dict):
                        final_result = log_line
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                final_result = {'success': False, 'error': str(e)}
            
            if final_result.get('success'):
                session_ctx = get_db_session()
                if session_ctx:
                    with session_ctx as session:
                        project = session.query(StudioProject).filter_by(id=project_id).first()
                        if project:
                            project.git_repo_url = repo_url
                            project.git_branch = final_result.get('branch', branch)
                            project.git_last_commit = final_result.get('commit')
                            
                            workspace_files = git_service.get_workspace_files(project_id)
                            for file_path in workspace_files:
                                content = git_service.read_file(project_id, file_path)
                                if content is not None:
                                    existing = session.query(ProjectFile).filter_by(
                                        project_id=project_id,
                                        file_path=file_path
                                    ).first()
                                    
                                    if existing:
                                        existing.content = content
                                    else:
                                        new_file = ProjectFile(
                                            project_id=uuid.UUID(project_id),
                                            file_path=file_path,
                                            content=content,
                                            language=_detect_language(file_path)
                                        )
                                        session.add(new_file)
                            
                            session.flush()
            
            yield f"data: {json.dumps({'type': 'complete', 'success': final_result.get('success', False), 'result': final_result})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        logger.error(f"Error cloning repository: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/status', methods=['GET'])
@require_auth
def git_status(project_id):
    """
    GET /api/studio/projects/<id>/git/status
    Get git status for the project
    """
    try:
        from models.studio import StudioProject
        from services.git_service import git_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        status = git_service.get_status(project_id)
        
        return jsonify({
            'success': True,
            'status': status
        })
        
    except Exception as e:
        logger.error(f"Error getting git status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/commit', methods=['POST'])
@require_auth
def git_commit(project_id):
    """
    POST /api/studio/projects/<id>/git/commit
    Create a commit
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.git_service import git_service
        
        data = request.get_json() or {}
        message = data.get('message')
        author = data.get('author')
        
        if not message:
            return jsonify({'success': False, 'error': 'Commit message is required'}), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [{'file_path': f.file_path, 'content': f.content} for f in files]
            
            git_service.sync_files_to_workspace(project_id, files_data)
        
        success, result_message, commit_hash = git_service.commit(project_id, message, author)
        
        if success and commit_hash:
            session_ctx = get_db_session()
            if session_ctx:
                with session_ctx as session:
                    project = session.query(StudioProject).filter_by(id=project_id).first()
                    if project:
                        project.git_last_commit = commit_hash
                        session.flush()
        
        return jsonify({
            'success': success,
            'message': result_message,
            'commit': commit_hash
        }), 200 if success else 400
        
    except Exception as e:
        logger.error(f"Error creating commit: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/push', methods=['POST'])
@require_auth
def git_push(project_id):
    """
    POST /api/studio/projects/<id>/git/push
    Push changes to remote
    """
    from flask import Response
    
    try:
        from models.studio import StudioProject
        from services.git_service import git_service
        import json
        
        data = request.get_json() or {}
        remote = data.get('remote', 'origin')
        branch = data.get('branch')
        access_token = data.get('access_token')
        set_upstream = data.get('set_upstream', False)
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        def generate():
            final_result = {'success': False}
            
            yield f"data: {json.dumps({'type': 'start', 'message': 'Starting push operation'})}\n\n"
            
            try:
                generator = git_service.push(project_id, remote, branch, access_token, set_upstream)
                
                for log_line in generator:
                    if isinstance(log_line, str):
                        yield f"data: {json.dumps({'type': 'log', 'message': log_line})}\n\n"
                    elif isinstance(log_line, dict):
                        final_result = log_line
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                final_result = {'success': False, 'error': str(e)}
            
            yield f"data: {json.dumps({'type': 'complete', 'success': final_result.get('success', False), 'result': final_result})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        logger.error(f"Error pushing to remote: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/pull', methods=['POST'])
@require_auth
def git_pull(project_id):
    """
    POST /api/studio/projects/<id>/git/pull
    Pull changes from remote
    """
    from flask import Response
    
    try:
        from models.studio import StudioProject, ProjectFile
        from services.git_service import git_service
        import json
        
        data = request.get_json() or {}
        remote = data.get('remote', 'origin')
        branch = data.get('branch')
        access_token = data.get('access_token')
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        def generate():
            final_result = {'success': False}
            
            yield f"data: {json.dumps({'type': 'start', 'message': 'Starting pull operation'})}\n\n"
            
            try:
                generator = git_service.pull(project_id, remote, branch, access_token)
                
                for log_line in generator:
                    if isinstance(log_line, str):
                        yield f"data: {json.dumps({'type': 'log', 'message': log_line})}\n\n"
                    elif isinstance(log_line, dict):
                        final_result = log_line
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                final_result = {'success': False, 'error': str(e)}
            
            if final_result.get('success'):
                session_ctx = get_db_session()
                if session_ctx:
                    with session_ctx as session:
                        project = session.query(StudioProject).filter_by(id=project_id).first()
                        if project:
                            project.git_last_commit = final_result.get('commit')
                            
                            workspace_files = git_service.get_workspace_files(project_id)
                            for file_path in workspace_files:
                                content = git_service.read_file(project_id, file_path)
                                if content is not None:
                                    existing = session.query(ProjectFile).filter_by(
                                        project_id=project_id,
                                        file_path=file_path
                                    ).first()
                                    
                                    if existing:
                                        existing.content = content
                                    else:
                                        new_file = ProjectFile(
                                            project_id=uuid.UUID(project_id),
                                            file_path=file_path,
                                            content=content,
                                            language=_detect_language(file_path)
                                        )
                                        session.add(new_file)
                            
                            session.flush()
            
            yield f"data: {json.dumps({'type': 'complete', 'success': final_result.get('success', False), 'result': final_result})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        logger.error(f"Error pulling from remote: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/log', methods=['GET'])
@require_auth
def git_log(project_id):
    """
    GET /api/studio/projects/<id>/git/log
    Get commit history
    """
    try:
        from models.studio import StudioProject
        from services.git_service import git_service
        
        limit = request.args.get('limit', 50, type=int)
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        success, commits = git_service.get_log(project_id, limit)
        
        return jsonify({
            'success': success,
            'commits': commits
        })
        
    except Exception as e:
        logger.error(f"Error getting git log: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/diff', methods=['GET'])
@require_auth
def git_diff(project_id):
    """
    GET /api/studio/projects/<id>/git/diff
    Get current diff
    """
    try:
        from models.studio import StudioProject
        from services.git_service import git_service
        
        staged = request.args.get('staged', 'false').lower() == 'true'
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        success, diff = git_service.get_diff(project_id, staged)
        
        return jsonify({
            'success': success,
            'diff': diff
        })
        
    except Exception as e:
        logger.error(f"Error getting git diff: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/branches', methods=['GET'])
@require_auth
def git_branches(project_id):
    """
    GET /api/studio/projects/<id>/git/branches
    Get list of branches
    """
    try:
        from models.studio import StudioProject
        from services.git_service import git_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        success, branches = git_service.get_branches(project_id)
        
        return jsonify({
            'success': success,
            'branches': branches
        })
        
    except Exception as e:
        logger.error(f"Error getting branches: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/checkout', methods=['POST'])
@require_auth
def git_checkout(project_id):
    """
    POST /api/studio/projects/<id>/git/checkout
    Checkout a branch
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.git_service import git_service
        
        data = request.get_json() or {}
        branch = data.get('branch')
        create = data.get('create', False)
        
        if not branch:
            return jsonify({'success': False, 'error': 'Branch name is required'}), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        success, message = git_service.checkout_branch(project_id, branch, create)
        
        if success:
            session_ctx = get_db_session()
            if session_ctx:
                with session_ctx as session:
                    project = session.query(StudioProject).filter_by(id=project_id).first()
                    if project:
                        project.git_branch = branch
                        
                        workspace_files = git_service.get_workspace_files(project_id)
                        for file_path in workspace_files:
                            content = git_service.read_file(project_id, file_path)
                            if content is not None:
                                existing = session.query(ProjectFile).filter_by(
                                    project_id=project_id,
                                    file_path=file_path
                                ).first()
                                
                                if existing:
                                    existing.content = content
                                else:
                                    new_file = ProjectFile(
                                        project_id=uuid.UUID(project_id),
                                        file_path=file_path,
                                        content=content,
                                        language=_detect_language(file_path)
                                    )
                                    session.add(new_file)
                        
                        session.flush()
        
        return jsonify({
            'success': success,
            'message': message,
            'branch': branch
        }), 200 if success else 400
        
    except Exception as e:
        logger.error(f"Error checking out branch: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/git/remote', methods=['POST'])
@require_auth
def git_set_remote(project_id):
    """
    POST /api/studio/projects/<id>/git/remote
    Set remote URL
    """
    try:
        from models.studio import StudioProject
        from services.git_service import git_service
        
        data = request.get_json() or {}
        url = data.get('url')
        name = data.get('name', 'origin')
        
        if not url:
            return jsonify({'success': False, 'error': 'Remote URL is required'}), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({'success': False, 'error': 'Database not available'}), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            if not project:
                return jsonify({'success': False, 'error': 'Project not found'}), 404
        
        success, message = git_service.set_remote(project_id, url, name)
        
        if success:
            session_ctx = get_db_session()
            if session_ctx:
                with session_ctx as session:
                    project = session.query(StudioProject).filter_by(id=project_id).first()
                    if project:
                        project.git_repo_url = url
                        session.flush()
        
        return jsonify({
            'success': success,
            'message': message
        }), 200 if success else 400
        
    except Exception as e:
        logger.error(f"Error setting remote: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@studio_bp.route('/projects/<project_id>/preview/start', methods=['POST'])
@require_auth
def start_preview(project_id):
    """
    POST /api/studio/projects/<id>/preview/start
    Start a live preview server for the project
    
    Request body (optional):
    {
        "auto_reload": true
    }
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.preview_service import preview_service
        
        data = request.get_json() or {}
        auto_reload = data.get('auto_reload', True)
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            language = project.language.value
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
        
        result = preview_service.start_preview(
            project_id=project_id,
            language=language,
            files=files_data,
            auto_reload=auto_reload
        )
        
        return jsonify(result), 200 if result.get('success') else 500
        
    except Exception as e:
        logger.error(f"Error starting preview: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/preview/stop', methods=['POST'])
@require_auth
def stop_preview(project_id):
    """
    POST /api/studio/projects/<id>/preview/stop
    Stop the live preview server for the project
    """
    try:
        from services.preview_service import preview_service
        
        result = preview_service.stop_preview(project_id)
        
        return jsonify(result), 200 if result.get('success') else 404
        
    except Exception as e:
        logger.error(f"Error stopping preview: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/preview/status', methods=['GET'])
@require_auth
def get_preview_status(project_id):
    """
    GET /api/studio/projects/<id>/preview/status
    Get the status of the preview server
    """
    try:
        from services.preview_service import preview_service
        
        status = preview_service.get_status(project_id)
        
        return jsonify({
            'success': True,
            **status
        })
        
    except Exception as e:
        logger.error(f"Error getting preview status: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/preview/logs', methods=['GET'])
@require_auth
def get_preview_logs(project_id):
    """
    GET /api/studio/projects/<id>/preview/logs
    Get logs from the preview server
    
    Query params:
    - limit: Maximum number of log lines to return (default: 100)
    """
    try:
        from services.preview_service import preview_service
        
        limit = request.args.get('limit', 100, type=int)
        result = preview_service.get_logs(project_id, limit)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting preview logs: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'logs': []
        }), 500


@studio_bp.route('/projects/<project_id>/preview/health', methods=['GET'])
@require_auth
def preview_health_check(project_id):
    """
    GET /api/studio/projects/<id>/preview/health
    Health check for the preview server
    """
    try:
        from services.preview_service import preview_service
        
        health = preview_service.health_check(project_id)
        
        return jsonify({
            'success': True,
            **health
        })
        
    except Exception as e:
        logger.error(f"Error checking preview health: {e}")
        return jsonify({
            'success': False,
            'healthy': False,
            'reason': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/preview/restart', methods=['POST'])
@require_auth
def restart_preview(project_id):
    """
    POST /api/studio/projects/<id>/preview/restart
    Restart the preview server with fresh files
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.preview_service import preview_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            language = project.language.value
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
        
        result = preview_service.restart_preview(project_id, language, files_data)
        
        return jsonify(result), 200 if result.get('success') else 500
        
    except Exception as e:
        logger.error(f"Error restarting preview: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/preview/update-files', methods=['POST'])
@require_auth
def update_preview_files(project_id):
    """
    POST /api/studio/projects/<id>/preview/update-files
    Update files in the running preview (triggers auto-reload)
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.preview_service import preview_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            files = session.query(ProjectFile).filter_by(project_id=project_id).all()
            files_data = [f.to_dict() for f in files]
        
        result = preview_service.update_files(project_id, files_data)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error updating preview files: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/previews', methods=['GET'])
@require_auth
def list_running_previews():
    """
    GET /api/studio/previews
    List all running preview servers
    """
    try:
        from services.preview_service import preview_service
        
        previews = preview_service.list_running_previews()
        
        return jsonify({
            'success': True,
            'previews': previews
        })
        
    except Exception as e:
        logger.error(f"Error listing previews: {e}")
        return jsonify({
            'success': False,
            'error': str(e),
            'previews': []
        }), 500


@studio_bp.route('/projects/<project_id>/packages', methods=['GET'])
@require_auth
def list_packages(project_id):
    """
    GET /api/studio/projects/<id>/packages
    List installed packages for a project
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.package_service import package_service, PackageManager
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            language = project.language.value
            manager = package_service.get_manager_for_language(language)
            
            if not manager:
                return jsonify({
                    'success': True,
                    'packages': [],
                    'manager': None,
                    'message': f'No package manager for language: {language}'
                })
            
            deps_file = package_service.get_deps_file(manager)
            deps_content = None
            
            for file in session.query(ProjectFile).filter_by(project_id=project_id).all():
                if file.path.endswith(deps_file) or file.path == deps_file:
                    deps_content = file.content
                    break
            
            if not deps_content:
                return jsonify({
                    'success': True,
                    'packages': [],
                    'manager': manager.value,
                    'deps_file': deps_file,
                    'message': f'No {deps_file} found'
                })
            
            packages = package_service.parse_packages(deps_content, manager)
            
            return jsonify({
                'success': True,
                'packages': [p.to_dict() for p in packages],
                'manager': manager.value,
                'deps_file': deps_file
            })
            
    except Exception as e:
        logger.error(f"Error listing packages: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/packages', methods=['POST'])
@require_auth
def install_package(project_id):
    """
    POST /api/studio/projects/<id>/packages
    Install a package for a project
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.package_service import package_service, PackageManager
        
        data = request.get_json() or {}
        package_name = data.get('name')
        version = data.get('version')
        
        if not package_name:
            return jsonify({
                'success': False,
                'error': 'Package name is required'
            }), 400
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            language = project.language.value
            manager = package_service.get_manager_for_language(language)
            
            if not manager:
                return jsonify({
                    'success': False,
                    'error': f'No package manager for language: {language}'
                }), 400
            
            deps_file = package_service.get_deps_file(manager)
            deps_file_obj = None
            
            for file in session.query(ProjectFile).filter_by(project_id=project_id).all():
                if file.path.endswith(deps_file) or file.path == deps_file:
                    deps_file_obj = file
                    break
            
            if deps_file_obj:
                new_content = package_service.update_deps_file(
                    deps_file_obj.content or '',
                    package_name,
                    version,
                    manager,
                    'add'
                )
                deps_file_obj.content = new_content
                deps_file_obj.updated_at = datetime.utcnow()
            else:
                initial_content = ''
                if manager == PackageManager.NPM:
                    initial_content = json.dumps({
                        'name': project.name.lower().replace(' ', '-'),
                        'version': '1.0.0',
                        'dependencies': {}
                    }, indent=2)
                
                new_content = package_service.update_deps_file(
                    initial_content,
                    package_name,
                    version,
                    manager,
                    'add'
                )
                
                new_file = ProjectFile(
                    project_id=uuid.UUID(project_id),
                    path=deps_file,
                    content=new_content,
                    file_type='config'
                )
                session.add(new_file)
            
            session.flush()
            
            install_cmd = package_service.generate_install_command(package_name, version, manager)
            
            return jsonify({
                'success': True,
                'message': f'Package {package_name} added to {deps_file}',
                'install_command': install_cmd,
                'deps_file': deps_file,
                'manager': manager.value
            }), 201
            
    except Exception as e:
        logger.error(f"Error installing package: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/packages/<package_name>', methods=['DELETE'])
@require_auth
def uninstall_package(project_id, package_name):
    """
    DELETE /api/studio/projects/<id>/packages/<name>
    Uninstall a package from a project
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.package_service import package_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            language = project.language.value
            manager = package_service.get_manager_for_language(language)
            
            if not manager:
                return jsonify({
                    'success': False,
                    'error': f'No package manager for language: {language}'
                }), 400
            
            deps_file = package_service.get_deps_file(manager)
            deps_file_obj = None
            
            for file in session.query(ProjectFile).filter_by(project_id=project_id).all():
                if file.path.endswith(deps_file) or file.path == deps_file:
                    deps_file_obj = file
                    break
            
            if not deps_file_obj:
                return jsonify({
                    'success': False,
                    'error': f'No {deps_file} found'
                }), 404
            
            new_content = package_service.update_deps_file(
                deps_file_obj.content or '',
                package_name,
                None,
                manager,
                'remove'
            )
            deps_file_obj.content = new_content
            deps_file_obj.updated_at = datetime.utcnow()
            session.flush()
            
            uninstall_cmd = package_service.generate_uninstall_command(package_name, manager)
            
            return jsonify({
                'success': True,
                'message': f'Package {package_name} removed from {deps_file}',
                'uninstall_command': uninstall_cmd,
                'deps_file': deps_file,
                'manager': manager.value
            })
            
    except Exception as e:
        logger.error(f"Error uninstalling package: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/packages/search', methods=['GET'])
@require_auth
def search_packages():
    """
    GET /api/studio/packages/search
    Search package registries
    """
    try:
        from services.package_service import package_service, PackageManager
        
        query = request.args.get('q', '')
        manager_str = request.args.get('manager', 'pip')
        limit = min(int(request.args.get('limit', 20)), 50)
        
        if not query:
            return jsonify({
                'success': False,
                'error': 'Search query is required'
            }), 400
        
        try:
            manager = PackageManager(manager_str)
        except ValueError:
            return jsonify({
                'success': False,
                'error': f'Invalid package manager: {manager_str}'
            }), 400
        
        results = package_service.search_packages(query, manager, limit)
        
        return jsonify({
            'success': True,
            'results': results,
            'query': query,
            'manager': manager_str
        })
        
    except Exception as e:
        logger.error(f"Error searching packages: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/packages/info', methods=['GET'])
@require_auth
def get_package_info():
    """
    GET /api/studio/packages/info
    Get detailed package information
    """
    try:
        from services.package_service import package_service, PackageManager
        
        name = request.args.get('name', '')
        manager_str = request.args.get('manager', 'pip')
        
        if not name:
            return jsonify({
                'success': False,
                'error': 'Package name is required'
            }), 400
        
        try:
            manager = PackageManager(manager_str)
        except ValueError:
            return jsonify({
                'success': False,
                'error': f'Invalid package manager: {manager_str}'
            }), 400
        
        info = package_service.get_package_info(name, manager)
        
        if not info:
            return jsonify({
                'success': False,
                'error': f'Package not found: {name}'
            }), 404
        
        return jsonify({
            'success': True,
            'package': info
        })
        
    except Exception as e:
        logger.error(f"Error getting package info: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@studio_bp.route('/projects/<project_id>/packages/outdated', methods=['GET'])
@require_auth
def check_outdated_packages(project_id):
    """
    GET /api/studio/projects/<id>/packages/outdated
    Check for outdated packages in a project
    """
    try:
        from models.studio import StudioProject, ProjectFile
        from services.package_service import package_service
        
        session_ctx = get_db_session()
        if not session_ctx:
            return jsonify({
                'success': False,
                'error': 'Database not available'
            }), 503
        
        with session_ctx as session:
            project = session.query(StudioProject).filter_by(id=project_id).first()
            
            if not project:
                return jsonify({
                    'success': False,
                    'error': 'Project not found'
                }), 404
            
            language = project.language.value
            manager = package_service.get_manager_for_language(language)
            
            if not manager:
                return jsonify({
                    'success': True,
                    'packages': [],
                    'outdated_count': 0,
                    'message': f'No package manager for language: {language}'
                })
            
            deps_file = package_service.get_deps_file(manager)
            deps_content = None
            
            for file in session.query(ProjectFile).filter_by(project_id=project_id).all():
                if file.path.endswith(deps_file) or file.path == deps_file:
                    deps_content = file.content
                    break
            
            if not deps_content:
                return jsonify({
                    'success': True,
                    'packages': [],
                    'outdated_count': 0,
                    'message': f'No {deps_file} found'
                })
            
            packages = package_service.parse_packages(deps_content, manager)
            packages = package_service.check_outdated(packages, manager)
            
            outdated = [p for p in packages if p.is_outdated]
            
            return jsonify({
                'success': True,
                'packages': [p.to_dict() for p in packages],
                'outdated': [p.to_dict() for p in outdated],
                'outdated_count': len(outdated),
                'manager': manager.value,
                'deps_file': deps_file
            })
            
    except Exception as e:
        logger.error(f"Error checking outdated packages: {e}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
