# Health Check Monitoring System

## Overview

Comprehensive health check monitoring system for homelab services. Monitors Stream Bot, Discord Bot, Dashboard, and all Docker services with automated polling, health history tracking, and alerting capabilities.

## Health Check Endpoints

### Stream Bot
- **Basic Health**: `GET http://stream-bot:5000/health`
- **Enhanced Health**: `GET http://stream-bot:5000/api/health`

Response includes:
- Database connectivity
- OAuth storage status
- Token refresh service status
- Bot manager status
- Platform connections (Twitch, YouTube, Kick)
- WebSocket client count
- Memory usage

### Discord Bot
- **Health Check**: `GET http://discord-bot:5000/health`

Response includes:
- Database connectivity
- Discord client connection status
- Guild connections
- Ticket channel manager status
- Cleanup job status

### Dashboard
- **Simple Health**: `GET http://dashboard:5000/health`
- **Comprehensive Health**: `GET http://dashboard:5000/api/health`

Response includes:
- Database connectivity
- Redis connectivity
- MinIO connectivity
- Docker connectivity
- Celery worker status

## Health Status Levels

- **healthy**: All checks pass
- **degraded**: Some non-critical checks fail but service is operational
- **unhealthy**: Critical checks fail, service is not operational
- **unknown**: Unable to connect to health endpoint

## Health Monitoring API

All endpoints require authentication via session or API key.

### Get Current Health Status
```bash
GET /api/health/status
```
Returns the most recent health check for all monitored services with uptime percentage.

### Get Health History
```bash
GET /api/health/history?service=stream-bot&hours=24&limit=100
```
Query parameters:
- `service`: Filter by service name (optional)
- `hours`: Number of hours to look back (default: 24)
- `limit`: Max records to return (default: 100)

### Get Health Alerts
```bash
GET /api/health/alerts?status=active&limit=50
```
Query parameters:
- `status`: Filter by status (active, resolved, all) - default: active
- `service`: Filter by service name (optional)
- `limit`: Max alerts to return (default: 50)

### Trigger Manual Health Check
```bash
POST /api/health/test/<service>
```
Manually trigger a health check for a specific service.

### Get Service Uptime
```bash
GET /api/health/uptime/<service>?hours=24
```
Get uptime percentage for a specific service over the specified period.

### Get Health Summary
```bash
GET /api/health/summary
```
Get comprehensive health summary with statistics, uptime, and active alerts.

## Health Monitoring Service

The health monitoring service runs automatically and:
- Polls all service health endpoints every 30 seconds
- Stores health check results in database
- Tracks uptime percentage over time
- Creates alerts when services become degraded or unhealthy
- Auto-resolves alerts when services return to healthy status

### Monitored Services

| Service | URL | Critical |
|---------|-----|----------|
| stream-bot | http://stream-bot:5000/health | Yes |
| discord-bot | http://discord-bot:5000/health | Yes |
| dashboard | http://homelab-dashboard:5000/api/health | Yes |
| postgres | Internal check | Yes |
| redis | Internal check | Yes |
| minio | http://minio:9000/minio/health/live | No |

## Alert Severity Levels

- **warning**: Non-critical service is degraded or unhealthy
- **critical**: Critical service is degraded or unhealthy

## Docker Healthcheck Configuration

Add healthcheck directives to your `docker-compose.yml`:

```yaml
version: '3.8'

services:
  stream-bot:
    image: stream-bot:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
  discord-bot:
    image: discord-bot:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
  dashboard:
    image: homelab-dashboard:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    
  postgres:
    image: postgres:15
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    
  redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    
  minio:
    image: minio/minio:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Healthcheck Parameters

- **test**: Command to run for health check
- **interval**: Time between health checks
- **timeout**: Time to wait before considering check failed
- **retries**: Consecutive failures before marking unhealthy
- **start_period**: Grace period before health checks start

## Database Schema

### service_health_checks
Stores health check results for all monitored services.

```sql
CREATE TABLE service_health_checks (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    checks JSONB,
    response_time_ms INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_timestamp ON service_health_checks(service_name, timestamp);
CREATE INDEX idx_status_timestamp ON service_health_checks(status, timestamp);
```

### service_health_alerts
Stores health alerts for degraded or unhealthy services.

```sql
CREATE TABLE service_health_alerts (
    id SERIAL PRIMARY KEY,
    service_name VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    triggered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_alert_service_status ON service_health_alerts(service_name, status);
CREATE INDEX idx_alert_triggered ON service_health_alerts(triggered_at);
```

## Example Usage

### Check Health via cURL

```bash
# Simple health check
curl http://localhost:5000/health

# Comprehensive health check
curl http://localhost:5000/api/health

# Get current status of all services
curl -H "X-API-Key: your-api-key" http://localhost:5000/api/health/status

# Get health history for stream-bot
curl -H "X-API-Key: your-api-key" \
  "http://localhost:5000/api/health/history?service=stream-bot&hours=24"

# Get active alerts
curl -H "X-API-Key: your-api-key" \
  "http://localhost:5000/api/health/alerts?status=active"

# Trigger manual health check
curl -X POST -H "X-API-Key: your-api-key" \
  "http://localhost:5000/api/health/test/stream-bot"
```

### Monitor Health with Docker

```bash
# Check container health status
docker ps --format "table {{.Names}}\t{{.Status}}"

# View health check logs
docker inspect --format='{{json .State.Health}}' stream-bot | jq

# Monitor all containers
watch -n 5 'docker ps --format "table {{.Names}}\t{{.Status}}"'
```

## Troubleshooting

### Service Showing as Unhealthy

1. Check if the service is running: `docker ps`
2. View service logs: `docker logs <service-name>`
3. Test health endpoint manually: `curl http://localhost:PORT/health`
4. Verify network connectivity between services
5. Check database/Redis connectivity if applicable

### Health Check Timing Out

1. Increase timeout in Docker healthcheck configuration
2. Check if service takes longer to start up
3. Increase `start_period` to allow more startup time
4. Verify service is responding on the correct port

### Alerts Not Triggering

1. Verify health monitoring service is running
2. Check dashboard logs for monitoring errors
3. Ensure database is accessible
4. Verify service URLs are correct in health_monitor_service.py

## Files

### Created Files
- `services/stream-bot/server/routes.ts` - Enhanced health endpoint
- `services/discord-bot/server/routes.ts` - Enhanced health endpoint
- `services/dashboard/routes/health_routes.py` - Dashboard health endpoints
- `services/dashboard/routes/health_monitoring_api.py` - Health monitoring API
- `services/dashboard/services/health_monitor_service.py` - Automated health monitoring
- `services/dashboard/models/health_check.py` - Database models
- `services/dashboard/alembic/versions/011_add_health_monitoring.py` - Database migration

### Modified Files
- `services/dashboard/app.py` - Registered health blueprints
- `services/dashboard/models/__init__.py` - Exported health models

## Future Enhancements

- Email/SMS notifications for critical alerts
- Grafana dashboard integration
- Prometheus metrics export
- Custom health check rules per service
- Health trend analysis and predictions
- Integration with PagerDuty/Opsgenie for alerting
