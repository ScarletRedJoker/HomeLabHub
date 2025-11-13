# Homelabhub Integration Guide

This Discord Ticket Bot includes Docker-based orchestration capabilities for integration with **homelabhub**, your custom homelab dashboard.

## Features

- **Auto-Discovery**: Docker labels for automatic service detection
- **Health Monitoring**: Built-in healthcheck endpoints
- **Metrics API**: Real-time bot statistics and system metrics
- **Control API**: Start, stop, restart bot via API calls
- **No Authentication Required**: Designed for internal Docker network communication

## Docker Labels

The Discord bot exposes the following labels for homelabhub discovery:

```yaml
labels:
  # Service identification
  - "homelabhub.enable=true"
  - "homelabhub.group=discord-bot"
  - "homelabhub.name=Discord Ticket Bot"
  - "homelabhub.description=Discord bot for support ticket management"
  - "homelabhub.icon=discord"
  - "homelabhub.category=application"
  - "homelabhub.importance=critical"
  
  # Web interface
  - "homelabhub.web.url=https://bot.rig-city.com"
  - "homelabhub.web.port=5000"
  - "homelabhub.web.protocol=https"
  
  # API endpoints
  - "homelabhub.health.endpoint=/health"
  - "homelabhub.metrics.endpoint=/api/homelabhub/metrics"
  - "homelabhub.control.endpoint=/api/homelabhub/control"
  
  # Display options
  - "homelabhub.display.status=online"
  - "homelabhub.display.version=1.0.0"
  - "homelabhub.display.uptime=true"
  - "homelabhub.display.stats=true"
```

## API Endpoints

### 1. Health Check
**Endpoint**: `GET /health`  
**Description**: Basic health check endpoint (existing)

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-11-11T10:00:00.000Z"
}
```

### 2. Status Check
**Endpoint**: `GET /api/homelabhub/status`  
**Description**: Quick bot status check

**Response**:
```json
{
  "status": "online",
  "uptime": 3600,
  "timestamp": "2025-11-11T10:00:00.000Z"
}
```

### 3. Detailed Metrics
**Endpoint**: `GET /api/homelabhub/metrics`  
**Description**: Comprehensive bot and system metrics

**Response**:
```json
{
  "service": "discord-ticket-bot",
  "status": "online",
  "uptime": {
    "seconds": 3600,
    "formatted": "1h 0m 0s"
  },
  "discord": {
    "ready": true,
    "ping": 45,
    "guilds": 2,
    "users": 459,
    "channels": 50
  },
  "system": {
    "platform": "linux",
    "arch": "x64",
    "nodeVersion": "v20.11.0",
    "memory": {
      "heapUsed": 120,
      "heapTotal": 150,
      "rss": 200,
      "unit": "MB"
    },
    "cpu": {
      "model": "Intel Core i7",
      "cores": 8,
      "usage": {}
    }
  },
  "endpoints": {
    "web": "https://bot.rig-city.com",
    "health": "/health",
    "metrics": "/api/homelabhub/metrics",
    "control": "/api/homelabhub/control"
  },
  "timestamp": "2025-11-11T10:00:00.000Z"
}
```

### 4. Control API
**Endpoint**: `POST /api/homelabhub/control`  
**Description**: Control bot operations

**Request Body**:
```json
{
  "action": "status" | "restart" | "refresh-cache" | "health-check"
}
```

**Actions**:

#### Status
```json
{
  "action": "status"
}
```

**Response**:
```json
{
  "status": "online",
  "ready": true,
  "uptime": 3600
}
```

#### Restart
```json
{
  "action": "restart"
}
```

**Response**:
```json
{
  "message": "Bot restart initiated",
  "action": "restart",
  "status": "processing"
}
```

*Note: Container will restart automatically if `restart: unless-stopped` is set in docker-compose.yml*

#### Refresh Cache
```json
{
  "action": "refresh-cache"
}
```

**Response**:
```json
{
  "message": "Cache refresh initiated",
  "action": "refresh-cache",
  "status": "completed"
}
```

#### Health Check
```json
{
  "action": "health-check"
}
```

**Response**:
```json
{
  "healthy": true,
  "checks": {
    "botReady": true,
    "websocketPing": 45,
    "guildsConnected": true
  }
}
```

## Homelabhub Integration Example

### Python Example (for homelabhub backend)

```python
import requests
import docker
import os

# Load API key from environment
API_KEY = os.getenv('HOMELABHUB_API_KEY')
headers = {'X-Homelabhub-Key': API_KEY}

# Discover Discord bot via Docker labels
client = docker.from_env()
containers = client.containers.list(
    filters={"label": "homelabhub.enable=true"}
)

for container in containers:
    labels = container.labels
    if labels.get("homelabhub.name") == "Discord Ticket Bot":
        # Get container network IP
        network = container.attrs['NetworkSettings']['Networks']['discordticketbot_bot-network']
        ip_address = network['IPAddress']
        
        # Fetch metrics with API key
        metrics_endpoint = labels.get("homelabhub.metrics.endpoint")
        response = requests.get(
            f"http://{ip_address}:5000{metrics_endpoint}",
            headers=headers
        )
        metrics = response.json()
        
        print(f"Bot Status: {metrics['status']}")
        print(f"Discord Guilds: {metrics['discord']['guilds']}")
        print(f"Uptime: {metrics['uptime']['formatted']}")
```

### JavaScript Example

```javascript
const Docker = require('dockerode');
const axios = require('axios');

const docker = new Docker();
const API_KEY = process.env.HOMELABHUB_API_KEY;
const headers = { 'X-Homelabhub-Key': API_KEY };

// Find Discord bot container
docker.listContainers({ 
  filters: { label: ['homelabhub.enable=true'] } 
}, async (err, containers) => {
  const botContainer = containers.find(c => 
    c.Labels['homelabhub.name'] === 'Discord Ticket Bot'
  );
  
  if (botContainer) {
    // Get container IP from network
    const containerInfo = await docker.getContainer(botContainer.Id).inspect();
    const network = containerInfo.NetworkSettings.Networks['discordticketbot_bot-network'];
    const ipAddress = network.IPAddress;
    
    // Fetch metrics with API key
    const metricsUrl = `http://${ipAddress}:5000/api/homelabhub/metrics`;
    const response = await axios.get(metricsUrl, { headers });
    
    console.log('Bot Metrics:', response.data);
    
    // Restart bot with API key
    await axios.post(`http://${ipAddress}:5000/api/homelabhub/control`, 
      { action: 'restart' },
      { headers }
    );
  }
});
```

## Docker Network Setup

For homelabhub to communicate with the Discord bot:

1. **Homelabhub must be on the same Docker network**:

```yaml
# In homelabhub's docker-compose.yml
services:
  homelabhub:
    networks:
      - discordticketbot_bot-network  # Connect to bot network

networks:
  discordticketbot_bot-network:
    external: true  # Reference existing network
```

2. **Or use container names with Docker DNS**:

```python
# Homelabhub can access bot via container name
response = requests.get('http://discord-bot-app:5000/api/homelabhub/metrics')
```

## Security Considerations

⚠️ **IMPORTANT**: Homelabhub endpoints are **protected by API key authentication**.

### API Key Setup (Required for Production)

1. **Generate a secure API key**:
```bash
openssl rand -hex 32
```

2. **Add to your `.env` file**:
```bash
HOMELABHUB_API_KEY=your_generated_secure_api_key_here
```

3. **Configure homelabhub to use the API key**:
All requests to homelabhub endpoints must include the API key in the header:
```
X-Homelabhub-Key: your_generated_secure_api_key_here
```

### Security Features

- ✅ **API Key Required**: All endpoints validate the `X-Homelabhub-Key` header
- ✅ **Fail-Safe**: Without the API key, endpoints return 401 Unauthorized
- ⚠️ **Warning**: If `HOMELABHUB_API_KEY` is not set, endpoints are unprotected (logs warning)
- 🔒 **Best Practice**: Always set `HOMELABHUB_API_KEY` in production

### Why API Key is Required

Even though these endpoints are designed for internal Docker network use, port 5000 is exposed on the host. This means:
- Anyone on your network could access these endpoints
- Remote attackers could potentially restart your bot
- **API key prevents unauthorized control**

## Monitoring & Alerts

Homelabhub can monitor the bot and send alerts:

```javascript
const API_KEY = process.env.HOMELABHUB_API_KEY;
const headers = { 'X-Homelabhub-Key': API_KEY };

// Check bot health every 60 seconds
setInterval(async () => {
  try {
    const health = await axios.post(
      'http://discord-bot-app:5000/api/homelabhub/control',
      { action: 'health-check' },
      { headers }
    );
    
    if (!health.data.healthy) {
      // Send alert to user
      console.error('Discord bot unhealthy!', health.data.checks);
    }
  } catch (error) {
    console.error('Discord bot unreachable!');
  }
}, 60000);
```

## Database Labels

The PostgreSQL database also includes homelabhub labels:

```yaml
labels:
  - "homelabhub.enable=true"
  - "homelabhub.group=discord-bot"
  - "homelabhub.name=Discord Bot Database"
  - "homelabhub.description=PostgreSQL database for Discord ticket bot"
  - "homelabhub.icon=database"
  - "homelabhub.category=database"
  - "homelabhub.importance=critical"
```

This allows homelabhub to track database status and group it with the bot service.

## Troubleshooting

### Can't connect to bot from homelabhub

```bash
# Check if both containers are on same network
docker network inspect discordticketbot_bot-network

# Verify homelabhub can reach bot
docker exec homelabhub ping discord-bot-app

# Test endpoint manually
docker exec homelabhub curl http://discord-bot-app:5000/api/homelabhub/status
```

### Metrics returning 503

The bot may not be fully initialized yet. Check:

```bash
# Check bot logs
docker logs discord-bot-app

# Verify bot is ready
curl http://localhost:5000/health
```

## Support

For issues with homelabhub integration, check:
- Docker network connectivity
- Container logs: `docker logs discord-bot-app`
- Bot status: `http://localhost:5000/api/homelabhub/status`
