# Unified Logging Aggregation

## Overview

The Unified Logging system provides centralized log collection, storage, and analysis for all homelab services. It automatically collects logs from Docker containers, parses them, and stores them in PostgreSQL with full-text search capabilities.

## Architecture

### Components

1. **UnifiedLog Model** (`models/unified_log.py`)
   - Database table for storing all logs
   - Indexed fields for fast querying
   - Full-text search on log messages

2. **UnifiedLoggingService** (`services/unified_logging_service.py`)
   - Core service for log management
   - Log parsing and level detection
   - Query interface with filtering
   - Automatic log rotation

3. **LogCollector Worker** (`workers/log_collector.py`)
   - Celery background worker
   - Polls Docker containers every 10 seconds
   - Batch inserts for efficiency
   - Monitors: stream-bot, discord-bot, dashboard, postgres, minio, redis, etc.

4. **API Routes** (`routes/unified_logs_api.py`)
   - RESTful API for log retrieval
   - WebSocket endpoint for real-time streaming
   - Export functionality

## Features

### Log Collection
- **Automatic Collection**: Continuously polls Docker container logs
- **Service Detection**: Automatically tags logs by service name
- **Level Detection**: Parses log levels (DEBUG, INFO, WARN, ERROR, FATAL)
- **Timestamp Parsing**: Extracts timestamps from various log formats
- **Batch Processing**: Efficient batch inserts to minimize database load

### Log Storage
- **PostgreSQL Database**: Reliable, indexed storage
- **Full-Text Search**: Fast search across log messages
- **Metadata Support**: JSON field for additional context
- **30-Day Retention**: Automatic cleanup of old logs (configurable)

### Log Retrieval
- **Filtering**: By service, log level, date range, search terms
- **Pagination**: Efficient pagination for large result sets
- **Real-Time Streaming**: WebSocket support for live log monitoring
- **Export**: Export logs to JSON format

## API Endpoints

### GET /api/logs
Retrieve logs with filtering and pagination

**Query Parameters:**
- `service` (optional): Filter by service name
- `level` (optional): Filter by log level (DEBUG, INFO, WARN, ERROR, FATAL)
- `start_date` (optional): ISO format datetime
- `end_date` (optional): ISO format datetime
- `search` (optional): Search in message content
- `limit` (default: 100, max: 1000): Number of logs to return
- `offset` (default: 0): Offset for pagination

**Example:**
```bash
curl -X GET "http://localhost:5000/api/logs?service=stream-bot&level=ERROR&limit=50"
```

**Response:**
```json
{
  "success": true,
  "logs": [
    {
      "id": 1234,
      "service": "stream-bot",
      "container_id": "abc123...",
      "log_level": "ERROR",
      "message": "Failed to connect to database",
      "timestamp": "2025-11-19T10:30:00",
      "metadata": null
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 50,
    "offset": 0,
    "pages": 3
  }
}
```

### GET /api/logs/stats
Get log statistics by service and level

**Example:**
```bash
curl -X GET "http://localhost:5000/api/logs/stats"
```

**Response:**
```json
{
  "success": true,
  "total_logs": 50000,
  "stats_by_service": {
    "stream-bot": {
      "INFO": 1000,
      "ERROR": 50,
      "WARN": 100
    },
    "discord-bot": {
      "INFO": 2000,
      "ERROR": 20
    }
  },
  "oldest_log": "2025-10-20T10:00:00",
  "newest_log": "2025-11-19T10:30:00"
}
```

### DELETE /api/logs/cleanup
Trigger log rotation (delete old logs)

**Query Parameters:**
- `retention_days` (default: 30): Keep logs newer than this many days

**Example:**
```bash
curl -X DELETE "http://localhost:5000/api/logs/cleanup?retention_days=30"
```

**Response:**
```json
{
  "success": true,
  "deleted_count": 15000,
  "cutoff_date": "2025-10-20T10:30:00",
  "retention_days": 30
}
```

### POST /api/logs/collect
Manually trigger log collection from containers

**Example:**
```bash
curl -X POST "http://localhost:5000/api/logs/collect"
```

**Response:**
```json
{
  "success": true,
  "message": "Log collection task queued",
  "task_id": "abc-123-xyz"
}
```

### GET /api/logs/export
Export logs to JSON file

**Query Parameters:** Same as `/api/logs` GET endpoint

**Example:**
```bash
curl -X GET "http://localhost:5000/api/logs/export?service=stream-bot" \
  -o logs_export.json
```

### WebSocket /api/logs/stream
Real-time log streaming via WebSocket

**Usage:**
```javascript
const ws = new WebSocket('ws://localhost:5000/api/logs/stream');

// Send filter criteria
ws.send(JSON.stringify({
  service: 'stream-bot',
  level: 'ERROR'
}));

// Receive logs
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New logs:', data.data);
};
```

## Database Schema

### unified_logs Table

```sql
CREATE TABLE unified_logs (
    id SERIAL PRIMARY KEY,
    service VARCHAR(100) NOT NULL,
    container_id VARCHAR(64),
    log_level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB
);

-- Indexes
CREATE INDEX idx_service ON unified_logs(service);
CREATE INDEX idx_log_level ON unified_logs(log_level);
CREATE INDEX idx_timestamp ON unified_logs(timestamp);
CREATE INDEX idx_service_timestamp ON unified_logs(service, timestamp);
CREATE INDEX idx_log_level_timestamp ON unified_logs(log_level, timestamp);
CREATE INDEX idx_service_level_timestamp ON unified_logs(service, log_level, timestamp);

-- Full-text search index
CREATE INDEX idx_message_fulltext ON unified_logs 
  USING gin(to_tsvector('english', message));
```

## Background Tasks

### Log Collection Task
Runs periodically via Celery to collect logs from all monitored containers.

**Schedule:** Every 10 seconds (configurable)

**Monitored Services:**
- stream-bot
- discord-bot
- homelab-dashboard
- homelab-celery-worker
- discord-bot-db
- homelab-minio
- homelab-redis
- caddy
- homeassistant
- plex
- n8n

### Log Rotation Task
Automatically deletes logs older than the retention period.

**Schedule:** Daily at 2:00 AM (recommended)
**Default Retention:** 30 days

## Configuration

### Environment Variables

```bash
# Log retention period (days)
LOG_RETENTION_DAYS=30

# Log collection interval (seconds)
LOG_COLLECTION_INTERVAL=10

# Batch size for log inserts
LOG_BATCH_SIZE=100
```

### Celery Beat Schedule

Add to `celery_app.py`:

```python
from celery.schedules import crontab

app.conf.beat_schedule = {
    'collect-container-logs': {
        'task': 'workers.log_collector.collect_container_logs',
        'schedule': 10.0,  # Every 10 seconds
    },
    'rotate-old-logs': {
        'task': 'workers.log_collector.rotate_old_logs',
        'schedule': crontab(hour=2, minute=0),  # Daily at 2 AM
        'args': (30,)  # 30 days retention
    },
}
```

## Usage Examples

### Query Recent Errors

```bash
curl -X GET "http://localhost:5000/api/logs?level=ERROR&limit=20" \
  -H "Cookie: session=..."
```

### Search for Specific Error

```bash
curl -X GET "http://localhost:5000/api/logs?search=database+connection&level=ERROR" \
  -H "Cookie: session=..."
```

### Get Logs from Specific Time Range

```bash
curl -X GET "http://localhost:5000/api/logs?start_date=2025-11-19T00:00:00&end_date=2025-11-19T23:59:59" \
  -H "Cookie: session=..."
```

### Monitor Real-Time Logs

```javascript
const ws = new WebSocket('ws://localhost:5000/api/logs/stream');

ws.onopen = () => {
  // Filter for stream-bot errors only
  ws.send(JSON.stringify({
    service: 'stream-bot',
    level: 'ERROR'
  }));
};

ws.onmessage = (event) => {
  const response = JSON.parse(event.data);
  if (response.type === 'logs') {
    response.data.forEach(log => {
      console.error(`[${log.timestamp}] ${log.service}: ${log.message}`);
    });
  }
};
```

## Performance Considerations

### Indexing Strategy
- Composite indexes for common query patterns (service + timestamp, level + timestamp)
- Full-text search index for message content
- Regular VACUUM and ANALYZE on PostgreSQL

### Batch Processing
- Logs are collected and inserted in batches (default: 100)
- Reduces database connection overhead
- Configurable batch size

### Log Rotation
- Automatic cleanup prevents unbounded growth
- Runs during low-traffic hours (2 AM)
- Configurable retention period

### Query Optimization
- Always use indexed fields in WHERE clauses
- Limit result sets with pagination
- Use date range filters to reduce scan size

## Troubleshooting

### No Logs Appearing

1. **Check Celery Worker**
   ```bash
   docker logs homelab-celery-worker
   ```

2. **Verify Database Connection**
   ```bash
   curl http://localhost:5000/api/logs/stats
   ```

3. **Check Docker Socket Access**
   ```bash
   docker exec homelab-dashboard ls -la /var/run/docker.sock
   ```

### High Database Usage

1. **Run Log Rotation**
   ```bash
   curl -X DELETE "http://localhost:5000/api/logs/cleanup?retention_days=7"
   ```

2. **Reduce Collection Frequency**
   - Increase `LOG_COLLECTION_INTERVAL` in environment

3. **Optimize Indexes**
   ```sql
   VACUUM ANALYZE unified_logs;
   ```

### WebSocket Connection Issues

1. **Check Session Authentication**
   - Ensure user is logged in before connecting to WebSocket

2. **Verify WebSocket Support**
   - Check browser console for connection errors

3. **Proxy Configuration**
   - Ensure reverse proxy supports WebSocket upgrades

## Migration

### Running the Migration

```bash
cd services/dashboard
alembic upgrade head
```

### Verify Migration

```bash
alembic current
# Should show: 012_add_unified_logging
```

### Rollback (if needed)

```bash
alembic downgrade -1
```

## Best Practices

1. **Regular Rotation**: Set up automated log rotation to prevent database bloat
2. **Index Maintenance**: Run VACUUM ANALYZE weekly on production
3. **Monitoring**: Monitor Celery worker health for continuous log collection
4. **Backup**: Include unified_logs table in database backup strategy
5. **Alerting**: Set up alerts for high ERROR/FATAL log rates

## Future Enhancements

- [ ] Log aggregation by time buckets (hourly/daily summaries)
- [ ] Email notifications for critical errors
- [ ] Log correlation across services
- [ ] Advanced analytics and dashboards
- [ ] Log compression for archived data
- [ ] Export to external log services (e.g., Elasticsearch, Splunk)
