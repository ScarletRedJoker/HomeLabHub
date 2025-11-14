# Jarvis Voice API Security Setup Guide

## Overview

The Jarvis Voice API endpoints have been secured with authentication to prevent unauthorized access. All endpoints now require either session authentication or API key authentication.

## Protected Endpoints

The following endpoints are now protected with the `@require_auth` decorator:

1. `POST /api/jarvis/voice/deploy` - Deploy projects
2. `POST /api/jarvis/voice/database` - Create databases
3. `POST /api/jarvis/voice/ssl` - Manage SSL certificates
4. `POST /api/jarvis/voice/query` - AI conversational queries
5. `GET /api/jarvis/status` - Get Jarvis system status

## Security Features Implemented

### 1. Authentication
- **Session-based**: Web interface users are authenticated via Flask sessions
- **API Key-based**: External integrations (like Home Assistant) use X-API-Key header
- **401 Unauthorized**: Requests without valid authentication are rejected

### 2. Input Validation
All user inputs are validated to prevent injection attacks:

- **Project Names**: Alphanumeric, hyphens, underscores only (max 64 chars)
- **Domain Names**: Valid domain format, max 253 chars
- **Database Names**: Lowercase alphanumeric and underscores only (max 64 chars)

### 3. Path Traversal Protection
- Project names are validated to prevent `..`, `/`, and `\` characters
- All inputs are sanitized before use

## Setup Instructions

### Step 1: Generate a Secure API Key

Generate a secure API key for the dashboard:

```bash
# Generate a secure random API key
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Step 2: Set the API Key in Dashboard Environment

Add the API key to your dashboard's environment variables:

```bash
# In docker-compose.unified.yml or .env file
DASHBOARD_API_KEY=your-generated-api-key-here
```

### Step 3: Configure Home Assistant

1. **Create/Edit `secrets.yaml`** in your Home Assistant config directory:

```yaml
# config/homeassistant/secrets.yaml
jarvis_api_key: "your-generated-api-key-here"
```

2. **Verify `configuration.yaml`** includes the X-API-Key header (already updated):

```yaml
rest_command:
  jarvis_deploy_website:
    url: "http://homelab-dashboard:5000/api/jarvis/voice/deploy"
    method: POST
    headers:
      Content-Type: "application/json"
      X-API-Key: "!secret jarvis_api_key"
    payload: '{"command": "{{ command }}", "params": {{ params | tojson }}}'
```

3. **Restart Home Assistant** to apply changes:

```bash
# Restart Home Assistant container
docker restart homeassistant
```

### Step 4: Restart Dashboard Service

Restart the dashboard to load the new API key:

```bash
# Restart the dashboard container
docker restart homelab-dashboard

# Or if using docker-compose
docker-compose -f docker-compose.unified.yml restart homelab-dashboard
```

## Testing Authentication

### Test 1: Unauthenticated Request (Should Fail)

```bash
curl -X POST http://homelab-dashboard:5000/api/jarvis/status
# Expected: 401 Unauthorized
```

### Test 2: Authenticated Request with API Key (Should Succeed)

```bash
curl -X GET http://homelab-dashboard:5000/api/jarvis/status \
  -H "X-API-Key: your-api-key-here"
# Expected: 200 OK with status information
```

### Test 3: Deploy Endpoint Validation

```bash
# Test with valid inputs
curl -X POST http://homelab-dashboard:5000/api/jarvis/voice/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"command": "deploy", "params": {"project_name": "test-app", "project_type": "static"}}'
# Expected: 202 Accepted

# Test with invalid project name (should fail validation)
curl -X POST http://homelab-dashboard:5000/api/jarvis/voice/deploy \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{"command": "deploy", "params": {"project_name": "../etc/passwd", "project_type": "static"}}'
# Expected: 400 Bad Request - Input validation failed
```

## Security Best Practices

### API Key Management

1. **Keep API Keys Secret**: Never commit API keys to version control
2. **Use Different Keys**: Use different API keys for different environments (dev/staging/prod)
3. **Rotate Keys Regularly**: Change API keys periodically (e.g., every 90 days)
4. **Limit Access**: Only share API keys with authorized integrations

### Monitoring

Monitor authentication failures in the dashboard logs:

```bash
# View dashboard logs
docker logs homelab-dashboard | grep "Unauthorized"

# Monitor in real-time
docker logs -f homelab-dashboard
```

### Input Validation Errors

The API will return detailed validation errors:

```json
{
  "success": false,
  "error": "Input validation failed: Project name must start with alphanumeric character and contain only letters, numbers, hyphens, and underscores (max 64 chars)"
}
```

## Troubleshooting

### Home Assistant Cannot Connect

1. **Check API Key**: Verify the API key in `secrets.yaml` matches `DASHBOARD_API_KEY`
2. **Check Network**: Ensure Home Assistant can reach `homelab-dashboard:5000`
3. **Check Logs**: Review Home Assistant and dashboard logs for errors

```bash
# Home Assistant logs
docker logs homeassistant | grep jarvis

# Dashboard logs
docker logs homelab-dashboard | grep "voice"
```

### 401 Unauthorized Errors

1. **Verify API Key**: Check that `DASHBOARD_API_KEY` is set in dashboard environment
2. **Check Header**: Ensure `X-API-Key` header is included in requests
3. **Restart Services**: Restart both Home Assistant and dashboard after changes

### Validation Errors

If you receive input validation errors:

1. **Project Names**: Use only alphanumeric characters, hyphens, and underscores
2. **Domain Names**: Use valid domain format (e.g., `example.com`)
3. **Database Names**: Use only lowercase alphanumeric and underscores

## Migration from Unauthenticated Setup

If you're migrating from the old unauthenticated setup:

1. Generate and set `DASHBOARD_API_KEY` environment variable
2. Add `jarvis_api_key` to Home Assistant's `secrets.yaml`
3. Restart both services
4. Test endpoints to ensure authentication works

## Support

If you encounter issues:

1. Check the logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure network connectivity between services
4. Review the authentication flow in `utils/auth.py`

## Code References

- **Authentication Decorator**: `services/dashboard/utils/auth.py`
- **API Endpoints**: `services/dashboard/routes/jarvis_voice_api.py`
- **Validation Functions**: Lines 43-72 in `jarvis_voice_api.py`
- **Home Assistant Config**: `config/homeassistant/configuration.yaml`
