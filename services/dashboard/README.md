# Homelab Dashboard

A comprehensive Flask-based dashboard for managing homelab infrastructure, Docker containers, databases, deployments, and smart home devices.

## Features

### System Monitoring
- Real-time system statistics (CPU, memory, disk usage)
- Process monitoring
- Network interface statistics and bandwidth monitoring
- Container status and log viewing

### Docker Management
- List, start, stop, and restart containers
- View container logs
- Monitor container status and resource usage

### Database Management
- Create and manage PostgreSQL, MySQL, and MongoDB containers
- Database backups
- Connection string generation
- Template-based database deployment

### Deployment System
- Template-based service deployment
- Environment variable management
- Service lifecycle management (deploy, update, rebuild, remove)
- Multiple deployment strategies (rolling, blue-green, recreate)

### Jarvis AI Platform
- Voice-controlled deployments
- AI-powered conversational assistant
- Automated artifact building
- SSL certificate management
- Project and workflow management

### Smart Home Integration
- Home Assistant integration
- Device control (lights, switches, sensors, climate)
- Scene activation and automation triggers
- Voice command processing
- Pre-made automation templates

### File & Artifact Management
- File upload to MinIO object storage
- Artifact analysis and validation
- ZIP file extraction
- Artifact download with pre-signed URLs

### AI Assistant
- Log analysis
- Troubleshooting advice
- Conversational chat interface

### Network Management
- Port monitoring
- Connection tracking
- Interface statistics
- Bandwidth delta calculation

### Domain & SSL
- Domain health monitoring
- SSL certificate tracking
- DNS record verification

## Architecture

### Tech Stack
- **Backend**: Flask 3.0.0
- **Database**: PostgreSQL (via SQLAlchemy 2.0.23)
- **Task Queue**: Celery 5.3.4 with Redis 5.0.1
- **WebSocket**: Flask-Sock 0.7.0
- **Storage**: MinIO 7.2.0
- **Container Management**: Docker SDK 7.1.0
- **Migrations**: Alembic 1.13.1
- **AI Integration**: OpenAI >=1.55.3

### Components
- **Flask Application** (`app.py`): Main application with blueprint registration
- **Routes**: Modular blueprint-based routing
- **Services**: Business logic layer (Docker, System, AI, Database, etc.)
- **Models**: SQLAlchemy ORM models for database entities
- **Workers**: Celery workers for async tasks
- **Jarvis**: AI-powered deployment and automation system

## Setup & Installation

### Prerequisites
- Python 3.11+
- PostgreSQL database
- Redis server
- Docker daemon
- MinIO server (optional, for artifact storage)
- Home Assistant (optional, for smart home features)

### Installation

1. **Install dependencies**:
```bash
cd services/dashboard
pip install -r requirements.txt
```

2. **Set up environment variables** (see Environment Variables section)

3. **Run database migrations**:
```bash
alembic upgrade head
```

4. **Start Celery workers** (in separate terminals):
```bash
# Main worker
celery -A celery_app worker --loglevel=info

# Deployment queue worker
celery -A celery_app worker --loglevel=info -Q deployments
```

5. **Run the application**:
```bash
# Development
python app.py

# Production
gunicorn --bind 0.0.0.0:5000 --workers 4 --reuse-port app:app
```

## Environment Variables

### Required Variables
- `WEB_USERNAME` - Dashboard login username
- `WEB_PASSWORD` - Dashboard login password

### Flask Configuration
- `SESSION_SECRET` - Flask session secret key (auto-generated if not set)
- `FLASK_ENV` - Environment mode (development/production)

### Database
- `JARVIS_DATABASE_URL` - PostgreSQL connection string for Jarvis platform

### Redis & Celery
- `REDIS_URL` - Redis connection URL (default: `redis://localhost:6379/0`)

### WebSocket
- `DASHBOARD_API_KEY` - API key for WebSocket authentication (auto-generated if not set)
- `WEBSOCKET_PING_INTERVAL` - WebSocket ping interval in seconds (default: 25)
- `WEBSOCKET_PING_TIMEOUT` - WebSocket timeout in seconds (default: 60)

### Docker
- `DOCKER_HOST` - Docker daemon socket (default: `unix:///var/run/docker.sock`)

### SSH (Remote Execution)
- `SSH_HOST` - SSH host for remote commands (default: `localhost`)
- `SSH_PORT` - SSH port (default: `22`)
- `SSH_USER` - SSH username (default: `root`)
- `SSH_KEY_PATH` - Path to SSH private key (default: `/root/.ssh/id_rsa`)

### Service Paths
- `STATIC_SITE_PATH` - Path to static site files (default: `/var/www/scarletredjoker`)

### URLs
- `NOVNC_URL` - noVNC remote desktop URL (default: `https://vnc.evindrake.net`)
- `WINDOWS_KVM_IP` - Windows KVM IP address

### MinIO Object Storage
- `MINIO_ENDPOINT` - MinIO server endpoint (default: `minio:9000`)
- `MINIO_ROOT_USER` - MinIO access key (default: `admin`)
- `MINIO_ROOT_PASSWORD` - MinIO secret key (default: `minio_admin_password`)
- `MINIO_SECURE` - Use HTTPS for MinIO (default: `False`)

### Upload Settings
- `MAX_UPLOAD_SIZE` - Maximum upload size in bytes (default: 524288000 / 500MB)
- `ALLOWED_EXTENSIONS` - Comma-separated allowed file extensions (default: `zip,tar,gz,html,css,js,py,php,java,go,rs,dockerfile,sh,bash`)
- `UPLOAD_FOLDER` - Temporary upload directory (default: `/tmp/jarvis_uploads`)

### Celery Configuration
- `CELERY_TIMEZONE` - Timezone for Celery tasks (default: `America/New_York`)
- `CELERY_TASK_TIME_LIMIT` - Task hard time limit in seconds (default: 1800)
- `CELERY_TASK_SOFT_TIME_LIMIT` - Task soft time limit in seconds (default: 1500)

## API Endpoints

### Core Routes
*Main application routes*

- `GET /health`
  - Health check endpoint with service status


### Web Interface Routes
*HTML pages and web interface*

- `GET /`

- `GET /ai-assistant`

- `GET /containers`

- `GET /dashboard`

- `GET /databases`

- `GET /domains`

- `GET /file-manager`

- `GET /game-connect`

- `GET /game-streaming`

- `GET, POST /login`

- `GET /logout`

- `GET /logs`

- `GET /network`

- `GET /remote-desktop`

- `GET /scripts`

- `GET /system`


### System API
*Core system management and monitoring*
**Prefix:** `/api`

- `GET /api/activity/recent`

- `POST /api/ai/analyze-logs`

- `POST /api/ai/chat`

- `POST /api/ai/troubleshoot`

- `GET /api/containers`

- `GET /api/containers/<container_name>/logs`

- `POST /api/containers/<container_name>/restart`

- `POST /api/containers/<container_name>/start`

- `GET /api/containers/<container_name>/status`

- `POST /api/containers/<container_name>/stop`

- `GET /api/databases`

- `POST /api/databases`

- `GET /api/databases/<container_name>`

- `DELETE /api/databases/<container_name>`

- `POST /api/databases/<container_name>/backup`

- `GET /api/databases/<container_name>/connection-examples`

- `GET /api/databases/templates`

- `GET /api/domains`

- `GET /api/domains/<path:subdomain>/check`

- `GET /api/domains/ssl-certificates`

- `GET /api/network/bandwidth`

- `GET /api/network/connections`

- `GET /api/network/interfaces`

- `GET /api/network/ports`

- `GET /api/network/stats`

- `POST /api/scripts/execute`

- `GET /api/services/status`

- `GET /api/system/disk`

- `GET /api/system/info`

- `GET /api/system/processes`

- `GET /api/system/stats`


### Deployment API
*Service deployment and template management*
**Prefix:** `/api/deployment`

- `POST /api/deployment/deploy`
  - Deploy a new service from a template

- `GET /api/deployment/environment`
  - List environment variables

- `POST /api/deployment/environment`
  - Set an environment variable

- `DELETE /api/deployment/environment/<key>`
  - Delete an environment variable

- `GET /api/deployment/services`
  - List all deployed services

- `GET /api/deployment/services/<service_name>`
  - Get detailed information about a service

- `DELETE /api/deployment/services/<service_name>`
  - Remove a deployed service

- `PATCH /api/deployment/services/<service_name>`
  - Update a service configuration

- `POST /api/deployment/services/<service_name>/rebuild`
  - Rebuild and restart a service

- `GET /api/deployment/templates`
  - List all available service templates

- `GET /api/deployment/templates/<template_id>`
  - Get details of a specific template


### Jarvis Deployment API
*AI-powered deployment operations*
**Prefix:** `/api/jarvis/deployments`

- `GET /api/jarvis/deployments/<deployment_id>/logs`
  - Get deployment logs

- `POST /api/jarvis/deployments/<deployment_id>/stop`
  - Stop a running deployment

- `POST /api/jarvis/deployments/deploy`
  - Create a new Jarvis deployment


### Upload & Artifacts API
*File upload and artifact management*
**Prefix:** `/api`

- `GET /api/artifacts`
  - List all artifacts

- `GET /api/artifacts/<artifact_id>`
  - Get artifact details

- `DELETE /api/artifacts/<artifact_id>`
  - Delete an artifact

- `GET /api/artifacts/<artifact_id>/download`
  - Download an artifact

- `POST /api/upload/file`
  - Upload a single file

- `POST /api/upload/validate`
  - Validate a file without uploading

- `POST /api/upload/zip`
  - Upload a zip file

- `GET /uploads`
  - Render uploads page


### Analysis API
*Artifact analysis and code inspection*
**Prefix:** `/api`

- `GET /analysis/result/<artifact_id>`
  - Render analysis result page

- `POST /api/analyze/artifact/<artifact_id>`
  - Trigger analysis for an uploaded artifact

- `GET /api/analyze/artifact/<artifact_id>/result`
  - Get detailed analysis result for an artifact

- `GET /api/analyze/artifact/<artifact_id>/status`
  - Get analysis status for an artifact

- `POST /api/analyze/preview`
  - Analyze uploaded file without saving to database (for preview)


### Artifact Builder API
*Automated artifact building and templates*
**Prefix:** `/api/artifacts`

- `POST /api/artifacts/build`
  - Build artifact for a project

- `GET /api/artifacts/build/<build_id>`
  - Get build status

- `GET /api/artifacts/build/<build_id>/logs`
  - Get build logs

- `GET /api/artifacts/builds`
  - List recent builds

- `GET /api/artifacts/templates`
  - List available Dockerfile templates


### Smart Home API
*Home Assistant integration and device control*
**Prefix:** `/smarthome`

- `GET /smarthome/`
  - Render smart home control dashboard

- `POST /smarthome/api/automation/<path:entity_id>/trigger`
  - Trigger an automation with rate limiting

- `GET /smarthome/api/automation/templates`
  - Get pre-made automation templates

- `POST /smarthome/api/climate/<path:entity_id>/temperature`
  - Set temperature for climate device with rate limiting

- `GET /smarthome/api/csrf-token`
  - Get CSRF token for client-side requests

- `GET /smarthome/api/device/<path:entity_id>`
  - Get state of a specific device

- `POST /smarthome/api/device/<path:entity_id>/turn_off`
  - Turn off a device with rate limiting and CSRF protection

- `POST /smarthome/api/device/<path:entity_id>/turn_on`
  - Turn on a device with rate limiting and CSRF protection

- `GET /smarthome/api/devices`
  - Get all smart home devices

- `GET /smarthome/api/devices/<domain>`
  - Get devices filtered by domain

- `POST /smarthome/api/light/<path:entity_id>/brightness`
  - Set brightness of a light with rate limiting

- `POST /smarthome/api/light/<path:entity_id>/color`
  - Set color of a light with rate limiting

- `POST /smarthome/api/scene/<path:entity_id>/activate`
  - Activate a scene with rate limiting

- `GET /smarthome/api/status`
  - Get smart home system status

- `POST /smarthome/api/voice/command`
  - Process natural language voice command with structured intent parsing


### Jarvis Voice API
*Voice-controlled operations and AI queries*
**Prefix:** `/api/jarvis`

- `GET /api/jarvis/status`
  - Get overall Jarvis system status

- `POST /api/jarvis/voice/database`
  - Create a database container using Docker

- `POST /api/jarvis/voice/deploy`
  - Deploy a website/project using voice commands

- `POST /api/jarvis/voice/query`
  - Conversational Q&A with AI assistant

- `POST /api/jarvis/voice/ssl`
  - Manage SSL certificates


### WebSocket Endpoints
*Real-time communication channels*
**Prefix:** `/ws`

- `GET /ws/deployments/<deployment_id>`
  - WebSocket endpoint for deployment-specific progress updates (per-user rooms)

- `GET /ws/system`
  - WebSocket endpoint for system-wide events (per-user)

- `GET /ws/tasks`
  - WebSocket endpoint for general task notifications (per-user)

- `GET /ws/workflows/<workflow_id>`
  - WebSocket endpoint for workflow-specific updates (per-user rooms)

## Running the Service

### Development Mode
```bash
python app.py
```
The application will be available at `http://0.0.0.0:5000`

### Production Mode
```bash
gunicorn --bind 0.0.0.0:5000 --workers 4 --reuse-port app:app
```

### With Celery Workers
```bash
# Terminal 1: Start Flask app
gunicorn --bind 0.0.0.0:5000 --workers 4 --reuse-port app:app

# Terminal 2: Start Celery worker
celery -A celery_app worker --loglevel=info

# Terminal 3: Start deployment queue worker
celery -A celery_app worker --loglevel=info -Q deployments
```

## Troubleshooting

### Missing Environment Variables
If you see the error "Missing required environment variables", ensure both `WEB_USERNAME` and `WEB_PASSWORD` are set in your environment or `.env` file.

### Database Connection Issues
- Verify `JARVIS_DATABASE_URL` is correctly formatted: `postgresql://user:password@host:port/database`
- Check PostgreSQL service is running
- Run migrations: `alembic upgrade head`

### Redis Connection Failed
- Ensure Redis is running on the specified `REDIS_URL`
- Default is `redis://localhost:6379/0`
- Workflow features will be unavailable without Redis

### Docker Connection Issues
- Verify Docker daemon is running
- Check `DOCKER_HOST` environment variable
- Ensure user has Docker permissions

### MinIO Upload Failures
- Verify MinIO service is running
- Check `MINIO_ENDPOINT`, `MINIO_ROOT_USER`, and `MINIO_ROOT_PASSWORD`
- Ensure buckets exist or service has permission to create them

### WebSocket Connection Failures
- Check that `DASHBOARD_API_KEY` is set (or let it auto-generate)
- Verify client is sending proper authentication (token, session, or API key)

### Smart Home Integration Not Working
- Set `HOME_ASSISTANT_URL` environment variable
- Set `HOME_ASSISTANT_TOKEN` with a long-lived access token from Home Assistant
- Verify Home Assistant is accessible from the dashboard server

### AI Features Unavailable
- Set `OPENAI_API_KEY` environment variable
- Ensure OpenAI package is installed: `pip install openai>=1.55.3`

## Security Notes

- All API endpoints require authentication via `@require_auth` or `@login_required` decorators
- WebSocket connections authenticate via token, session, or API key
- File uploads are validated and size-limited
- Shell command execution is restricted to an allowlist
- Database names and project names are validated against injection attacks
- Container names are validated with regex patterns
- SSL/TLS recommended for production deployments
