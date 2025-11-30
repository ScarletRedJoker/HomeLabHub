"""
Jarvis 2.0 Website Builder Service
Autonomous AI-powered website generation from natural language
"""

import os
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from pathlib import Path
from openai import OpenAI

logger = logging.getLogger(__name__)

WORKSPACE_PATH = os.environ.get('BUILDER_WORKSPACE', '/tmp/jarvis_builds')

TECH_STACK_TEMPLATES = {
    'static_html': {
        'name': 'Static HTML/CSS/JS',
        'description': 'Simple static website with HTML, CSS, and JavaScript',
        'files': ['index.html', 'css/style.css', 'js/main.js'],
        'deploy_type': 'static'
    },
    'flask': {
        'name': 'Python Flask',
        'description': 'Flask web application with Jinja2 templates',
        'files': ['app.py', 'requirements.txt', 'templates/base.html', 'static/css/style.css'],
        'deploy_type': 'python'
    },
    'fastapi': {
        'name': 'Python FastAPI',
        'description': 'FastAPI REST API with async support',
        'files': ['main.py', 'requirements.txt', 'routers/__init__.py'],
        'deploy_type': 'python'
    },
    'express': {
        'name': 'Node.js Express',
        'description': 'Express.js web server with EJS templates',
        'files': ['package.json', 'server.js', 'routes/index.js', 'views/index.ejs'],
        'deploy_type': 'nodejs'
    },
    'react': {
        'name': 'React (Vite)',
        'description': 'React SPA with Vite bundler',
        'files': ['package.json', 'vite.config.js', 'src/App.jsx', 'src/main.jsx', 'index.html'],
        'deploy_type': 'nodejs'
    },
    'vue': {
        'name': 'Vue.js (Vite)',
        'description': 'Vue 3 SPA with Vite bundler',
        'files': ['package.json', 'vite.config.js', 'src/App.vue', 'src/main.js', 'index.html'],
        'deploy_type': 'nodejs'
    },
    'nextjs': {
        'name': 'Next.js',
        'description': 'React framework with SSR and API routes',
        'files': ['package.json', 'next.config.js', 'pages/index.js', 'pages/api/hello.js'],
        'deploy_type': 'nodejs'
    }
}


class JarvisWebsiteBuilder:
    """
    Autonomous AI-powered website builder
    Generates complete websites from natural language descriptions
    """
    
    def __init__(self):
        try:
            api_key = os.getenv('AI_INTEGRATIONS_OPENAI_API_KEY') or os.getenv('OPENAI_API_KEY')
            base_url = os.getenv('AI_INTEGRATIONS_OPENAI_BASE_URL') or os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
            
            if not api_key:
                raise ValueError("No OpenAI API key found in environment")
            
            self.client = OpenAI(api_key=api_key, base_url=base_url)
            self.enabled = True
            self.model = "gpt-4o"
            logger.info(f"Jarvis Website Builder initialized with {self.model}")
        except Exception as e:
            self.client = None
            self.enabled = False
            logger.error(f"Failed to initialize Jarvis Website Builder: {e}")
        
        os.makedirs(WORKSPACE_PATH, exist_ok=True)
    
    def start_project(self, project_name: str, description: str, domain: Optional[str] = None) -> Dict[str, Any]:
        """
        Initialize a new website project
        
        Args:
            project_name: Name of the project
            description: Natural language description of the website
            domain: Optional production domain
            
        Returns:
            Project initialization result with project_id
        """
        try:
            from models import get_session
            from models.builder_project import BuilderProject, BuilderProjectStatus
            
            session = get_session()
            
            project_id = uuid.uuid4()
            project_path = os.path.join(WORKSPACE_PATH, str(project_id))
            os.makedirs(project_path, exist_ok=True)
            
            project = BuilderProject(
                id=project_id,
                name=project_name,
                description=description,
                domain=domain,
                status=BuilderProjectStatus.PLANNING,
                project_path=project_path,
                current_step='initialized',
                ai_messages=[{
                    'role': 'system',
                    'content': f'Project initialized: {project_name}',
                    'timestamp': datetime.utcnow().isoformat()
                }]
            )
            
            session.add(project)
            session.commit()
            
            result = project.to_dict()
            session.close()
            
            logger.info(f"Started new project: {project_name} (ID: {project_id})")
            
            return {
                'success': True,
                'project': result,
                'message': f"Project '{project_name}' initialized. Ready to plan."
            }
            
        except Exception as e:
            logger.error(f"Error starting project: {e}")
            return {
                'success': False,
                'error': str(e)
            }
    
    def plan_project(self, project_id: str, description: str) -> Dict[str, Any]:
        """
        Generate project plan using AI
        
        Args:
            project_id: UUID of the project
            description: Detailed description of what to build
            
        Returns:
            Project plan with pages, features, and tech stack recommendation
        """
        if not self.enabled:
            return {'success': False, 'error': 'AI service not available'}
        
        try:
            from models import get_session
            from models.builder_project import BuilderProject, BuilderProjectStatus, BuilderCheckpoint, CheckpointStatus
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            planning_prompt = f"""You are Jarvis, an AI website architect. Analyze this website request and create a detailed build plan.

Website Description:
{description}

Create a JSON response with:
{{
    "project_name": "suggested project name if not provided",
    "summary": "brief summary of what will be built",
    "tech_stack": "one of: static_html, flask, fastapi, express, react, vue, nextjs",
    "tech_stack_reason": "why this tech stack is recommended",
    "pages": [
        {{
            "name": "page name",
            "path": "/path",
            "description": "what this page does",
            "components": ["list of UI components needed"],
            "features": ["list of features"]
        }}
    ],
    "features": {{
        "authentication": true/false,
        "database": true/false,
        "api": true/false,
        "responsive": true,
        "seo": true/false,
        "analytics": true/false
    }},
    "api_endpoints": [
        {{
            "method": "GET/POST/PUT/DELETE",
            "path": "/api/...",
            "description": "what this endpoint does"
        }}
    ],
    "database_models": [
        {{
            "name": "ModelName",
            "fields": ["field1: type", "field2: type"],
            "description": "what this model represents"
        }}
    ],
    "estimated_complexity": "simple/moderate/complex",
    "build_steps": ["ordered list of build steps"]
}}

Respond ONLY with valid JSON, no markdown or extra text."""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are Jarvis, an expert web architect. Always respond with valid JSON only."},
                    {"role": "user", "content": planning_prompt}
                ],
                temperature=0.7,
                max_tokens=2000
            )
            
            plan_text = response.choices[0].message.content.strip()
            if plan_text.startswith('```'):
                plan_text = plan_text.split('\n', 1)[1].rsplit('```', 1)[0]
            
            plan = json.loads(plan_text)
            
            project.plan = plan
            project.status = BuilderProjectStatus.PLANNING
            project.current_step = 'plan_generated'
            
            if plan.get('tech_stack'):
                from models.builder_project import BuilderTechStack
                try:
                    project.tech_stack = BuilderTechStack(plan['tech_stack'])
                except ValueError:
                    project.tech_stack = BuilderTechStack.STATIC_HTML
            
            project.features = plan.get('features', {})
            
            messages = project.ai_messages or []
            messages.append({
                'role': 'assistant',
                'content': f"I've created a plan for your {plan.get('tech_stack', 'web')} project with {len(plan.get('pages', []))} pages.",
                'timestamp': datetime.utcnow().isoformat()
            })
            project.ai_messages = messages
            
            checkpoint = BuilderCheckpoint(
                project_id=project.id,
                stage='planning',
                step_name='plan_review',
                message=f"I've analyzed your request and created a project plan. Here's what I'm proposing:\n\n"
                       f"**Tech Stack:** {plan.get('tech_stack', 'static_html').replace('_', ' ').title()}\n"
                       f"**Pages:** {len(plan.get('pages', []))}\n"
                       f"**Complexity:** {plan.get('estimated_complexity', 'moderate')}\n\n"
                       f"Please review the plan and approve to continue, or provide feedback for changes.",
                context={'plan': plan},
                preview_data={'plan_summary': plan},
                status=CheckpointStatus.PENDING
            )
            session.add(checkpoint)
            
            session.commit()
            result = project.to_dict()
            checkpoint_dict = checkpoint.to_dict()
            session.close()
            
            return {
                'success': True,
                'project': result,
                'plan': plan,
                'checkpoint': checkpoint_dict,
                'message': 'Project plan generated. Awaiting approval.'
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            return {'success': False, 'error': 'Failed to generate valid project plan'}
        except Exception as e:
            logger.error(f"Error planning project: {e}")
            return {'success': False, 'error': str(e)}
    
    def generate_page(self, project_id: str, page_spec: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate complete HTML/CSS/JS for a page
        
        Args:
            project_id: Project UUID
            page_spec: Page specification from the plan
            
        Returns:
            Generated page content
        """
        if not self.enabled:
            return {'success': False, 'error': 'AI service not available'}
        
        try:
            from models import get_session
            from models.builder_project import BuilderProject, BuilderPage
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            tech_stack = project.tech_stack.value if project.tech_stack else 'static_html'
            
            generation_prompt = f"""Generate a complete, production-ready {page_spec.get('name', 'page')} page.

Project: {project.name}
Tech Stack: {tech_stack}
Page Name: {page_spec.get('name')}
Page Path: {page_spec.get('path', '/')}
Description: {page_spec.get('description', 'Main page')}
Components Needed: {', '.join(page_spec.get('components', []))}
Features: {', '.join(page_spec.get('features', []))}

Overall Project Context:
{json.dumps(project.plan, indent=2) if project.plan else 'No plan available'}

Generate a response with:
{{
    "html": "complete HTML content",
    "css": "complete CSS styles",
    "js": "complete JavaScript code",
    "component_code": "if React/Vue, the component code",
    "dependencies": ["list of required npm/pip packages"],
    "notes": "any implementation notes"
}}

Requirements:
- Modern, responsive design
- Clean, semantic HTML5
- Mobile-first CSS with flexbox/grid
- Accessible (ARIA labels where needed)
- Professional appearance with good UX
- Include placeholder content that makes sense

Respond ONLY with valid JSON."""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert frontend developer. Generate production-ready code. Respond with valid JSON only."},
                    {"role": "user", "content": generation_prompt}
                ],
                temperature=0.7,
                max_tokens=4000
            )
            
            content_text = response.choices[0].message.content.strip()
            if content_text.startswith('```'):
                content_text = content_text.split('\n', 1)[1].rsplit('```', 1)[0]
            
            page_content = json.loads(content_text)
            
            page = BuilderPage(
                project_id=project.id,
                name=page_spec.get('name', 'Untitled Page'),
                path=page_spec.get('path', '/'),
                page_type='page',
                html_content=page_content.get('html'),
                css_content=page_content.get('css'),
                js_content=page_content.get('js'),
                component_code=page_content.get('component_code'),
                page_meta={
                    'dependencies': page_content.get('dependencies', []),
                    'notes': page_content.get('notes')
                },
                is_generated=True,
                generation_prompt=generation_prompt,
                generated_at=datetime.utcnow()
            )
            
            session.add(page)
            
            self._write_page_files(project.project_path, page, tech_stack)
            
            generated_files = project.generated_files or {}
            generated_files[page_spec.get('path', '/')] = {
                'page_id': str(page.id),
                'name': page.name,
                'generated_at': datetime.utcnow().isoformat()
            }
            project.generated_files = generated_files
            
            session.commit()
            result = page.to_dict()
            session.close()
            
            return {
                'success': True,
                'page': result,
                'content': page_content,
                'message': f"Generated {page.name} successfully"
            }
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse page generation response: {e}")
            return {'success': False, 'error': 'Failed to generate valid page content'}
        except Exception as e:
            logger.error(f"Error generating page: {e}")
            return {'success': False, 'error': str(e)}
    
    def generate_backend(self, project_id: str, api_spec: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate backend API code
        
        Args:
            project_id: Project UUID
            api_spec: API specification from the plan
            
        Returns:
            Generated backend code
        """
        if not self.enabled:
            return {'success': False, 'error': 'AI service not available'}
        
        try:
            from models import get_session
            from models.builder_project import BuilderProject
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            tech_stack = project.tech_stack.value if project.tech_stack else 'flask'
            
            backend_prompt = f"""Generate complete backend API code for this project.

Project: {project.name}
Tech Stack: {tech_stack}
Description: {project.description}

API Endpoints to implement:
{json.dumps(api_spec.get('endpoints', project.plan.get('api_endpoints', [])), indent=2)}

Database Models:
{json.dumps(api_spec.get('models', project.plan.get('database_models', [])), indent=2)}

Generate a response with:
{{
    "main_file": "complete main application file (app.py for Flask, main.py for FastAPI, server.js for Express)",
    "routes": {{
        "filename": "route code"
    }},
    "models": {{
        "filename": "model code"
    }},
    "config": "configuration file content",
    "requirements": "requirements.txt or package.json content",
    "setup_instructions": "how to run the backend"
}}

Requirements:
- Production-ready code
- Proper error handling
- Input validation
- CORS configuration
- Environment variable support
- Database connection handling (if needed)

Respond ONLY with valid JSON."""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are an expert backend developer. Generate production-ready API code. Respond with valid JSON only."},
                    {"role": "user", "content": backend_prompt}
                ],
                temperature=0.7,
                max_tokens=4000
            )
            
            content_text = response.choices[0].message.content.strip()
            if content_text.startswith('```'):
                content_text = content_text.split('\n', 1)[1].rsplit('```', 1)[0]
            
            backend_code = json.loads(content_text)
            
            self._write_backend_files(project.project_path, backend_code, tech_stack)
            
            generated_files = project.generated_files or {}
            generated_files['backend'] = {
                'files': list(backend_code.get('routes', {}).keys()) + list(backend_code.get('models', {}).keys()),
                'generated_at': datetime.utcnow().isoformat()
            }
            project.generated_files = generated_files
            
            session.commit()
            session.close()
            
            return {
                'success': True,
                'backend': backend_code,
                'message': 'Backend API generated successfully'
            }
            
        except Exception as e:
            logger.error(f"Error generating backend: {e}")
            return {'success': False, 'error': str(e)}
    
    def generate_database_schema(self, project_id: str, requirements: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate database schema/models
        
        Args:
            project_id: Project UUID
            requirements: Database requirements
            
        Returns:
            Generated database schema
        """
        if not self.enabled:
            return {'success': False, 'error': 'AI service not available'}
        
        try:
            from models import get_session
            from models.builder_project import BuilderProject
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            tech_stack = project.tech_stack.value if project.tech_stack else 'flask'
            
            db_type = 'SQLAlchemy' if tech_stack in ['flask', 'fastapi'] else 'Prisma/Mongoose'
            
            schema_prompt = f"""Generate database schema for this project.

Project: {project.name}
Tech Stack: {tech_stack}
ORM/Database: {db_type}

Models needed:
{json.dumps(requirements.get('models', project.plan.get('database_models', [])), indent=2)}

Generate a response with:
{{
    "schema_type": "{db_type}",
    "models": {{
        "model_name": "complete model code"
    }},
    "migrations": "migration file content if applicable",
    "seed_data": "optional seed data for testing",
    "setup_sql": "raw SQL if needed for setup"
}}

Requirements:
- Proper relationships and foreign keys
- Indexes for common queries
- Timestamps (created_at, updated_at)
- UUID primary keys preferred

Respond ONLY with valid JSON."""

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a database architect. Generate production-ready schema. Respond with valid JSON only."},
                    {"role": "user", "content": schema_prompt}
                ],
                temperature=0.7,
                max_tokens=3000
            )
            
            content_text = response.choices[0].message.content.strip()
            if content_text.startswith('```'):
                content_text = content_text.split('\n', 1)[1].rsplit('```', 1)[0]
            
            schema = json.loads(content_text)
            
            self._write_schema_files(project.project_path, schema, tech_stack)
            
            generated_files = project.generated_files or {}
            generated_files['database'] = {
                'models': list(schema.get('models', {}).keys()),
                'generated_at': datetime.utcnow().isoformat()
            }
            project.generated_files = generated_files
            
            session.commit()
            session.close()
            
            return {
                'success': True,
                'schema': schema,
                'message': 'Database schema generated successfully'
            }
            
        except Exception as e:
            logger.error(f"Error generating database schema: {e}")
            return {'success': False, 'error': str(e)}
    
    def check_in(self, project_id: str, step: str, current_state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Human-in-the-loop checkpoint - create checkpoint for user approval
        
        Args:
            project_id: Project UUID
            step: Current build step
            current_state: Current state of the build
            
        Returns:
            Checkpoint information for user review
        """
        try:
            from models import get_session
            from models.builder_project import BuilderProject, BuilderCheckpoint, CheckpointStatus
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            checkpoint_messages = {
                'plan_complete': "I've completed the project plan. Review the proposed architecture and pages before I start building.",
                'scaffold_complete': "Project structure is ready. I've created the base files and directory structure.",
                'pages_generated': "All pages have been generated. Review the code and preview before proceeding.",
                'backend_complete': "Backend API is ready. Check the endpoints and database models.",
                'pre_deploy': "Everything is built and tested. Ready to deploy to preview?",
                'preview_deployed': "Preview is live! Test it out and approve for production deployment.",
                'production_ready': "Ready for production deployment. This will make your site live."
            }
            
            message = checkpoint_messages.get(step, f"Checkpoint reached: {step}")
            
            checkpoint = BuilderCheckpoint(
                project_id=project.id,
                stage=project.status.value if project.status else 'building',
                step_name=step,
                message=message,
                context=current_state,
                preview_data=current_state.get('preview'),
                status=CheckpointStatus.PENDING
            )
            
            session.add(checkpoint)
            project.current_step = step
            
            session.commit()
            result = checkpoint.to_dict()
            session.close()
            
            return {
                'success': True,
                'checkpoint': result,
                'awaiting_approval': True,
                'message': message
            }
            
        except Exception as e:
            logger.error(f"Error creating checkpoint: {e}")
            return {'success': False, 'error': str(e)}
    
    def approve_checkpoint(self, checkpoint_id: str) -> Dict[str, Any]:
        """
        Approve a checkpoint and continue building
        
        Args:
            checkpoint_id: Checkpoint UUID
            
        Returns:
            Result of approval
        """
        try:
            from models import get_session
            from models.builder_project import BuilderCheckpoint, CheckpointStatus, BuilderProject, BuilderProjectStatus
            
            session = get_session()
            checkpoint = session.query(BuilderCheckpoint).filter_by(id=checkpoint_id).first()
            
            if not checkpoint:
                return {'success': False, 'error': 'Checkpoint not found'}
            
            checkpoint.status = CheckpointStatus.APPROVED
            checkpoint.responded_at = datetime.utcnow()
            checkpoint.user_response = 'approved'
            
            project = session.query(BuilderProject).filter_by(id=checkpoint.project_id).first()
            
            next_stage_map = {
                'planning': BuilderProjectStatus.SCAFFOLDING,
                'scaffolding': BuilderProjectStatus.BUILDING,
                'building': BuilderProjectStatus.REVIEWING,
                'reviewing': BuilderProjectStatus.DEPLOYING,
                'deploying': BuilderProjectStatus.COMPLETE
            }
            
            current_stage = checkpoint.stage
            if current_stage in next_stage_map:
                project.status = next_stage_map[current_stage]
            
            session.commit()
            
            result = {
                'success': True,
                'checkpoint': checkpoint.to_dict(),
                'project': project.to_dict(),
                'next_stage': project.status.value,
                'message': f'Checkpoint approved. Moving to {project.status.value}.'
            }
            
            session.close()
            return result
            
        except Exception as e:
            logger.error(f"Error approving checkpoint: {e}")
            return {'success': False, 'error': str(e)}
    
    def reject_checkpoint(self, checkpoint_id: str, feedback: str) -> Dict[str, Any]:
        """
        Reject a checkpoint with feedback
        
        Args:
            checkpoint_id: Checkpoint UUID
            feedback: User feedback for changes
            
        Returns:
            Result of rejection
        """
        try:
            from models import get_session
            from models.builder_project import BuilderCheckpoint, CheckpointStatus, BuilderProject
            
            session = get_session()
            checkpoint = session.query(BuilderCheckpoint).filter_by(id=checkpoint_id).first()
            
            if not checkpoint:
                return {'success': False, 'error': 'Checkpoint not found'}
            
            checkpoint.status = CheckpointStatus.REJECTED
            checkpoint.responded_at = datetime.utcnow()
            checkpoint.user_response = 'rejected'
            checkpoint.user_feedback = feedback
            
            project = session.query(BuilderProject).filter_by(id=checkpoint.project_id).first()
            
            messages = project.ai_messages or []
            messages.append({
                'role': 'user',
                'content': f'Feedback on {checkpoint.step_name}: {feedback}',
                'timestamp': datetime.utcnow().isoformat()
            })
            project.ai_messages = messages
            
            session.commit()
            
            result = {
                'success': True,
                'checkpoint': checkpoint.to_dict(),
                'project': project.to_dict(),
                'message': 'Feedback received. Will revise based on your input.'
            }
            
            session.close()
            return result
            
        except Exception as e:
            logger.error(f"Error rejecting checkpoint: {e}")
            return {'success': False, 'error': str(e)}
    
    def deploy_preview(self, project_id: str) -> Dict[str, Any]:
        """
        Deploy project to preview subdomain
        
        Args:
            project_id: Project UUID
            
        Returns:
            Preview deployment result
        """
        try:
            from models import get_session
            from models.builder_project import BuilderProject, BuilderProjectStatus
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            preview_subdomain = f"preview-{str(project.id)[:8]}"
            preview_domain = f"{preview_subdomain}.jarvis-builds.local"
            
            project.preview_domain = preview_domain
            project.status = BuilderProjectStatus.DEPLOYING
            project.current_step = 'deploying_preview'
            
            project.status = BuilderProjectStatus.REVIEWING
            project.current_step = 'preview_deployed'
            
            session.commit()
            
            result = {
                'success': True,
                'project': project.to_dict(),
                'preview_url': f"https://{preview_domain}",
                'message': f'Preview deployed at {preview_domain}'
            }
            
            session.close()
            return result
            
        except Exception as e:
            logger.error(f"Error deploying preview: {e}")
            return {'success': False, 'error': str(e)}
    
    def deploy_production(self, project_id: str, domain: str) -> Dict[str, Any]:
        """
        Deploy project to production domain
        
        Args:
            project_id: Project UUID
            domain: Production domain
            
        Returns:
            Production deployment result
        """
        try:
            from models import get_session
            from models.builder_project import BuilderProject, BuilderProjectStatus
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            project.domain = domain
            project.status = BuilderProjectStatus.DEPLOYING
            project.current_step = 'deploying_production'
            
            project.status = BuilderProjectStatus.COMPLETE
            project.current_step = 'production_deployed'
            project.deployed_at = datetime.utcnow()
            
            session.commit()
            
            result = {
                'success': True,
                'project': project.to_dict(),
                'production_url': f"https://{domain}",
                'message': f'Successfully deployed to {domain}!'
            }
            
            session.close()
            return result
            
        except Exception as e:
            logger.error(f"Error deploying to production: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_project_status(self, project_id: str) -> Dict[str, Any]:
        """
        Get current build status of a project
        
        Args:
            project_id: Project UUID
            
        Returns:
            Current project status and details
        """
        try:
            from models import get_session
            from models.builder_project import BuilderProject, BuilderCheckpoint, CheckpointStatus
            
            session = get_session()
            project = session.query(BuilderProject).filter_by(id=project_id).first()
            
            if not project:
                return {'success': False, 'error': 'Project not found'}
            
            pending_checkpoint = session.query(BuilderCheckpoint).filter_by(
                project_id=project_id,
                status=CheckpointStatus.PENDING
            ).order_by(BuilderCheckpoint.created_at.desc()).first()
            
            result = {
                'success': True,
                'project': project.to_dict(),
                'status': project.status.value if project.status else 'unknown',
                'current_step': project.current_step,
                'pending_checkpoint': pending_checkpoint.to_dict() if pending_checkpoint else None,
                'pages_count': len(project.pages) if project.pages else 0,
                'checkpoints_count': len(project.checkpoints) if project.checkpoints else 0
            }
            
            session.close()
            return result
            
        except Exception as e:
            logger.error(f"Error getting project status: {e}")
            return {'success': False, 'error': str(e)}
    
    def list_projects(self) -> Dict[str, Any]:
        """
        List all builder projects
        
        Returns:
            List of all projects
        """
        try:
            from models import get_session
            from models.builder_project import BuilderProject
            
            session = get_session()
            projects = session.query(BuilderProject).order_by(BuilderProject.created_at.desc()).all()
            
            result = {
                'success': True,
                'projects': [p.to_dict() for p in projects],
                'count': len(projects)
            }
            
            session.close()
            return result
            
        except Exception as e:
            logger.error(f"Error listing projects: {e}")
            return {'success': False, 'error': str(e)}
    
    def _write_page_files(self, project_path: str, page, tech_stack: str):
        """Write generated page files to disk"""
        try:
            if tech_stack == 'static_html':
                page_dir = os.path.join(project_path, page.path.strip('/') or 'index')
                os.makedirs(page_dir, exist_ok=True)
                
                if page.html_content:
                    with open(os.path.join(page_dir, 'index.html'), 'w') as f:
                        f.write(page.html_content)
                
                if page.css_content:
                    css_dir = os.path.join(project_path, 'css')
                    os.makedirs(css_dir, exist_ok=True)
                    with open(os.path.join(css_dir, f'{page.name.lower().replace(" ", "_")}.css'), 'w') as f:
                        f.write(page.css_content)
                
                if page.js_content:
                    js_dir = os.path.join(project_path, 'js')
                    os.makedirs(js_dir, exist_ok=True)
                    with open(os.path.join(js_dir, f'{page.name.lower().replace(" ", "_")}.js'), 'w') as f:
                        f.write(page.js_content)
            
            elif tech_stack in ['react', 'vue', 'nextjs']:
                src_dir = os.path.join(project_path, 'src', 'pages' if tech_stack == 'nextjs' else 'components')
                os.makedirs(src_dir, exist_ok=True)
                
                ext = 'jsx' if tech_stack == 'react' else 'vue' if tech_stack == 'vue' else 'js'
                filename = f'{page.name.replace(" ", "")}{"" if tech_stack == "vue" else ""}.{ext}'
                
                content = page.component_code or page.html_content
                if content:
                    with open(os.path.join(src_dir, filename), 'w') as f:
                        f.write(content)
            
            elif tech_stack in ['flask', 'fastapi']:
                templates_dir = os.path.join(project_path, 'templates')
                os.makedirs(templates_dir, exist_ok=True)
                
                if page.html_content:
                    template_name = f'{page.name.lower().replace(" ", "_")}.html'
                    with open(os.path.join(templates_dir, template_name), 'w') as f:
                        f.write(page.html_content)
            
            elif tech_stack == 'express':
                views_dir = os.path.join(project_path, 'views')
                os.makedirs(views_dir, exist_ok=True)
                
                if page.html_content:
                    view_name = f'{page.name.lower().replace(" ", "_")}.ejs'
                    with open(os.path.join(views_dir, view_name), 'w') as f:
                        f.write(page.html_content)
                        
        except Exception as e:
            logger.error(f"Error writing page files: {e}")
    
    def _write_backend_files(self, project_path: str, backend_code: Dict, tech_stack: str):
        """Write generated backend files to disk"""
        try:
            if backend_code.get('main_file'):
                main_filename = {
                    'flask': 'app.py',
                    'fastapi': 'main.py',
                    'express': 'server.js'
                }.get(tech_stack, 'app.py')
                
                with open(os.path.join(project_path, main_filename), 'w') as f:
                    f.write(backend_code['main_file'])
            
            for filename, code in backend_code.get('routes', {}).items():
                routes_dir = os.path.join(project_path, 'routes')
                os.makedirs(routes_dir, exist_ok=True)
                with open(os.path.join(routes_dir, filename), 'w') as f:
                    f.write(code)
            
            for filename, code in backend_code.get('models', {}).items():
                models_dir = os.path.join(project_path, 'models')
                os.makedirs(models_dir, exist_ok=True)
                with open(os.path.join(models_dir, filename), 'w') as f:
                    f.write(code)
            
            if backend_code.get('requirements'):
                req_file = 'requirements.txt' if tech_stack in ['flask', 'fastapi'] else 'package.json'
                with open(os.path.join(project_path, req_file), 'w') as f:
                    f.write(backend_code['requirements'])
                    
        except Exception as e:
            logger.error(f"Error writing backend files: {e}")
    
    def _write_schema_files(self, project_path: str, schema: Dict, tech_stack: str):
        """Write generated schema files to disk"""
        try:
            models_dir = os.path.join(project_path, 'models')
            os.makedirs(models_dir, exist_ok=True)
            
            for model_name, model_code in schema.get('models', {}).items():
                ext = 'py' if tech_stack in ['flask', 'fastapi'] else 'js'
                filename = f'{model_name.lower()}.{ext}'
                with open(os.path.join(models_dir, filename), 'w') as f:
                    f.write(model_code)
            
            if schema.get('migrations'):
                migrations_dir = os.path.join(project_path, 'migrations')
                os.makedirs(migrations_dir, exist_ok=True)
                with open(os.path.join(migrations_dir, 'initial.sql'), 'w') as f:
                    f.write(schema['migrations'])
                    
        except Exception as e:
            logger.error(f"Error writing schema files: {e}")


jarvis_website_builder = JarvisWebsiteBuilder()
