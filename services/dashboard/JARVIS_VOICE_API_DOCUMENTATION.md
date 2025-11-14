# Jarvis Voice API Documentation

## Overview
The Jarvis Voice API provides REST endpoints for Home Assistant integration, enabling voice-controlled deployment, database management, SSL certificate handling, and conversational AI assistance.

## Endpoints

### 1. POST /api/jarvis/voice/deploy
Deploy a website or project using voice commands.

**Request:**
```json
{
  "command": "deploy",
  "params": {
    "project_name": "my-website",
    "project_type": "flask",
    "domain": "example.com" // optional
  }
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "session_id": "uuid",
  "status": "started",
  "message": "Deployment of my-website has been initiated",
  "project_id": "uuid",
  "task_id": "celery-task-id"
}
```

**Features:**
- Creates or retrieves project from database
- Creates AI session for tracking
- Launches async Celery task for deployment
- Uses ArtifactBuilder to build Docker images
- Uses DeploymentExecutor to deploy containers

---

### 2. POST /api/jarvis/voice/database
Create a database container using Docker.

**Request:**
```json
{
  "db_type": "postgres",  // postgres, mysql, or mongodb
  "db_name": "my_database"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "session_id": "uuid",
  "status": "created",
  "message": "Postgres database my_database created successfully",
  "connection_string": "postgresql://admin:admin123@postgres_my_database:5432/my_database",
  "container_name": "postgres_my_database",
  "container_id": "abc123def456",
  "db_type": "postgres",
  "port": 5432
}
```

**Supported Database Types:**
- **postgres**: PostgreSQL 15 Alpine
  - Port: 5432
  - Default credentials: admin/admin123
- **mysql**: MySQL 8.0
  - Port: 3306
  - Default credentials: admin/admin123
- **mongodb**: MongoDB 7
  - Port: 27017
  - Default credentials: admin/admin123

**Features:**
- Automatically checks for existing containers
- Creates container on 'homelab' network
- Sets up restart policy
- Returns ready-to-use connection string

---

### 3. POST /api/jarvis/voice/ssl
Manage SSL certificates for domains.

**Request:**
```json
{
  "domain": "example.com",
  "action": "create"  // create, renew, or check
}
```

**Response - Check (200 OK):**
```json
{
  "success": true,
  "status": "active",
  "domain": "example.com",
  "expires_at": "2024-12-31T23:59:59",
  "issued_at": "2024-01-01T00:00:00",
  "provider": "letsencrypt",
  "auto_renew": true,
  "message": "SSL certificate for example.com is active"
}
```

**Response - Create (201 Created):**
```json
{
  "success": true,
  "status": "pending",
  "domain": "example.com",
  "message": "SSL certificate request created for example.com. Certificate provisioning will begin shortly.",
  "certificate_id": "uuid"
}
```

**Response - Renew (200 OK):**
```json
{
  "success": true,
  "status": "renewing",
  "domain": "example.com",
  "message": "SSL certificate renewal initiated for example.com",
  "last_renewal_attempt": "2024-01-15T12:00:00"
}
```

**Features:**
- Uses SSLCertificate model for persistence
- Supports Let's Encrypt provider
- Auto-renewal enabled by default
- Tracks certificate lifecycle

---

### 4. POST /api/jarvis/voice/query
Conversational Q&A with AI assistant.

**Request:**
```json
{
  "session_id": "uuid",  // optional - creates new session if not provided
  "message": "How do I deploy a Flask application?"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "response": "To deploy a Flask application, you can use...",
  "session_id": "uuid",
  "message_count": 4
}
```

**Features:**
- Maintains conversation history in AISession model
- Uses OpenAI integration for intelligent responses
- Context-aware conversations
- Automatic session creation
- Persists conversation in database

**Without Database (Fallback):**
```json
{
  "success": true,
  "response": "...",
  "session_id": null,
  "warning": "Database unavailable - session not persisted"
}
```

---

### 5. GET /api/jarvis/status
Get overall Jarvis system status and statistics.

**Response (200 OK):**
```json
{
  "success": true,
  "status": "online",
  "statistics": {
    "active_deployments": 5,
    "pending_builds": 2,
    "ssl_certificates": 3,
    "total_projects": 12,
    "active_ai_sessions": 1
  },
  "services": {
    "database": true,
    "ai": true,
    "docker": true,
    "celery": true
  },
  "timestamp": "2024-01-15T12:00:00"
}
```

**Features:**
- Real-time system statistics
- Service health checks
- Database query aggregations
- Celery worker status
- Docker availability check

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message description"
}
```

**Common HTTP Status Codes:**
- 200: Success
- 201: Created
- 202: Accepted (async task started)
- 400: Bad Request (validation error)
- 404: Not Found
- 409: Conflict (resource already exists)
- 500: Internal Server Error
- 503: Service Unavailable

---

## Integration Architecture

### Components

1. **Flask Blueprint** (`jarvis_voice_bp`)
   - URL prefix: `/api/jarvis`
   - Registered in `app.py`

2. **Celery Worker** (`run_voice_deployment_workflow`)
   - Queue: `deployments`
   - Handles async deployment tasks
   - Progress tracking via AISession

3. **Database Models**
   - `Project`: Project metadata
   - `ArtifactBuild`: Docker build tracking
   - `ComposeSpec`: Docker Compose configurations
   - `SSLCertificate`: SSL certificate management
   - `AISession`: Conversational session tracking
   - `Deployment`: Deployment records

4. **Services**
   - `ArtifactBuilder`: Docker image building
   - `DeploymentExecutor`: Container deployment
   - `AIService`: OpenAI integration
   - `db_service`: Database connection management

### Celery Task Flow

```
Voice Deploy Request
    ↓
Create Project & AISession
    ↓
Launch Celery Task (async)
    ↓
Step 1: Build Docker Image
    ↓
Step 2: Create Deployment Config
    ↓
Step 3: Start Deployment
    ↓
Step 4: Complete & Update Session
```

---

## Example Home Assistant Integration

```yaml
rest_command:
  jarvis_deploy:
    url: "http://dashboard:5000/api/jarvis/voice/deploy"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "command": "deploy",
        "params": {
          "project_name": "{{ project_name }}",
          "project_type": "{{ project_type }}",
          "domain": "{{ domain }}"
        }
      }
  
  jarvis_create_database:
    url: "http://dashboard:5000/api/jarvis/voice/database"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "db_type": "{{ db_type }}",
        "db_name": "{{ db_name }}"
      }
  
  jarvis_query:
    url: "http://dashboard:5000/api/jarvis/voice/query"
    method: POST
    headers:
      Content-Type: "application/json"
    payload: >
      {
        "message": "{{ message }}"
      }

automation:
  - alias: "Voice Deploy Website"
    trigger:
      - platform: event
        event_type: "jarvis_voice_command"
        event_data:
          command: "deploy website"
    action:
      - service: rest_command.jarvis_deploy
        data:
          project_name: "{{ trigger.event.data.project_name }}"
          project_type: "flask"
          domain: "{{ trigger.event.data.domain }}"
```

---

## Security Considerations

1. **No Authentication on Voice Endpoints**
   - Designed for internal network use only
   - Should be behind firewall or VPN
   - Consider adding API key authentication for production

2. **Database Credentials**
   - Default credentials are basic (admin/admin123)
   - Should be changed for production use
   - Consider using environment variables

3. **Docker Network**
   - Creates containers on 'homelab' network
   - Ensure network isolation is configured

---

## Testing

### Test Deploy Endpoint
```bash
curl -X POST http://localhost:5000/api/jarvis/voice/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "command": "deploy",
    "params": {
      "project_name": "test-app",
      "project_type": "flask",
      "domain": "test.local"
    }
  }'
```

### Test Database Creation
```bash
curl -X POST http://localhost:5000/api/jarvis/voice/database \
  -H "Content-Type: application/json" \
  -d '{
    "db_type": "postgres",
    "db_name": "test_db"
  }'
```

### Test AI Query
```bash
curl -X POST http://localhost:5000/api/jarvis/voice/query \
  -H "Content-Type: application/json" \
  -d '{
    "message": "How do I check my deployments?"
  }'
```

### Test Status
```bash
curl http://localhost:5000/api/jarvis/status
```

---

## Files Modified

1. **Created**: `routes/jarvis_voice_api.py`
   - All 5 endpoint implementations
   - Error handling and logging
   - Docker, database, and AI integration

2. **Modified**: `workers/workflow_worker.py`
   - Added `run_voice_deployment_workflow` Celery task
   - Integrated ArtifactBuilder and DeploymentExecutor
   - AI session progress tracking

3. **Modified**: `app.py`
   - Imported jarvis_voice_bp
   - Registered blueprint

---

## Dependencies

- Flask
- SQLAlchemy
- Celery
- Docker SDK for Python
- OpenAI Python SDK (via AI Integrations)

All dependencies are already installed in the project.
