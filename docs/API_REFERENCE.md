# API Reference

## Authentication

All API endpoints require authentication unless marked as public.

### Session Authentication
```bash
# Login first
POST /login
Content-Type: application/x-www-form-urlencoded

username=admin&password=<your-password>

# Session cookie is set automatically
# All subsequent requests are authenticated
```

### API Key Authentication
```bash
# Include in Authorization header
curl -H "Authorization: Bearer ${DASHBOARD_API_KEY}" \
     http://localhost:5000/api/health
```

## Core API Endpoints

### Health & Status

#### GET /health
Public endpoint - check service health

**Response:**
```json
{
  "status": "healthy",
  "uptime": 12345,
  "services": {
    "database": "ok",
    "redis": "ok",
    "celery": "ok"
  }
}
```

#### GET /api/setup/status
Get setup status (requires authentication)

**Response:**
```json
{
  "ready": true,
  "services": {
    "openai": {"configured": true, "valid": true},
    "home_assistant": {"configured": false},
    "discord": {"configured": true, "valid": false}
  },
  "warnings": ["Discord token may be invalid"],
  "errors": []
}
```

### Jarvis AI

#### POST /api/chat
Send message to Jarvis AI

**Request:**
```json
{
  "message": "What containers are running?",
  "conversation_id": "optional-uuid"
}
```

**Response (streaming):**
```
data: {"type": "token", "content": "Currently"}
data: {"type": "token", "content": " running"}
data: {"type": "done"}
```

#### POST /api/jarvis/task
Create autonomous task

**Request:**
```json
{
  "task_type": "domain_provision",
  "description": "Set up new.example.com",
  "parameters": {
    "domain": "new.example.com",
    "service_type": "web"
  }
}
```

**Response:**
```json
{
  "success": true,
  "task_id": "task-123",
  "status": "pending"
}
```

### Domain Management

#### GET /api/domains
List all managed domains

**Response:**
```json
{
  "domains": [
    {
      "id": 1,
      "domain": "host.evindrake.net",
      "status": "healthy",
      "ssl_expiry": "2025-02-15",
      "last_check": "2024-11-16T06:00:00Z"
    }
  ]
}
```

#### POST /api/domains
Create new domain

**Request:**
```json
{
  "domain": "new.example.com",
  "service_type": "web",
  "port": 8080
}
```

#### POST /api/domains/:id/provision
Trigger automatic provisioning

**Response:**
```json
{
  "success": true,
  "task_id": "provision-123",
  "steps": [
    "dns_create",
    "dns_verify",
    "caddy_configure",
    "ssl_acquire",
    "verify_https"
  ]
}
```

### Container Management

#### GET /api/containers
List all Docker containers

**Response:**
```json
{
  "containers": [
    {
      "id": "abc123",
      "name": "dashboard",
      "status": "running",
      "image": "python:3.11",
      "ports": ["5000:5000"]
    }
  ]
}
```

#### POST /api/containers/:id/restart
Restart container

#### GET /api/containers/:id/logs
Get container logs (supports ?tail=100 parameter)

### System Monitoring

#### GET /api/system/stats
Real-time system statistics

**Response:**
```json
{
  "cpu": {
    "percent": 45.2,
    "cores": 8
  },
  "memory": {
    "total": 16000000000,
    "used": 8000000000,
    "percent": 50.0
  },
  "disk": {
    "total": 500000000000,
    "used": 250000000000,
    "percent": 50.0
  },
  "network": {
    "bytes_sent": 1000000,
    "bytes_recv": 2000000
  }
}
```

### Setup & Configuration

#### POST /api/setup/validate/:service
Validate service credentials

**Services:** `openai`, `home_assistant`, `discord`

**Request:**
```json
{
  "api_key": "sk-..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "OpenAI API key is valid",
  "details": {
    "model": "gpt-4",
    "organization": "org-..."
  }
}
```

#### GET /api/setup/guides/:service
Get step-by-step setup guide

**Response:**
```json
{
  "title": "OpenAI API Setup",
  "steps": [
    {
      "step": 1,
      "title": "Create Account",
      "description": "Visit https://platform.openai.com/signup",
      "url": "https://platform.openai.com/signup"
    }
  ]
}
```

## WebSocket Endpoints

### /ws/chat
Real-time Jarvis chat (requires authentication)

**Client → Server:**
```json
{
  "type": "message",
  "content": "What's my disk usage?",
  "conversation_id": "uuid"
}
```

**Server → Client:**
```json
{
  "type": "response",
  "content": "Your disk is 50% full...",
  "metadata": {
    "thinking_time": 1.2
  }
}
```

### /ws/tasks
Real-time task updates

**Server → Client:**
```json
{
  "type": "task_update",
  "task_id": "task-123",
  "status": "running",
  "progress": 60,
  "message": "Configuring Caddy..."
}
```

## Error Responses

### Standard Error Format
```json
{
  "success": false,
  "error": "Invalid credentials",
  "code": "AUTH_FAILED",
  "details": {
    "field": "username"
  }
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Rate Limits

Default limits (per IP):
- `/api/chat`: 10 requests/minute
- `/api/setup/*`: 20 requests/minute
- Other endpoints: 100 requests/minute

**Rate limit headers:**
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1699999999
```

## Future API (Phase 1: Local DNS)

### DNS Management

#### GET /api/dns/zones
List DNS zones

#### POST /api/dns/zones
Create DNS zone

#### POST /api/dns/records
Add DNS record

**Request:**
```json
{
  "zone": "example.com",
  "name": "nas",
  "type": "A",
  "content": "192.168.1.100",
  "ttl": 300
}
```

#### POST /api/dns/dyndns/enable
Enable DynDNS for hostname

**Request:**
```json
{
  "hostname": "nas.example.com",
  "check_interval": 300
}
```

---

Last Updated: November 16, 2024
