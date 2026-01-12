# Phase 7: API Gateway & Authentication

## Overview

Phase 7 implements a unified API gateway for secure inter-service communication with authentication and authorization. This phase extends the Traefik deployment from Phase 3 with additional middleware for JWT authentication, rate limiting, CORS handling, and service-to-service authentication.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │   Traefik (Port 443) │
              │    API Gateway       │
              └──────────┬───────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
   Middlewares:   Auth Service   Backend Services
   - JWT Auth     (Port 8000)    (Dashboard, Bots, etc)
   - Rate Limit
   - CORS
   - Security Headers
```

### Components

1. **Traefik API Gateway** (from Phase 3)
   - Dynamic service discovery
   - Automatic HTTPS via Let's Encrypt
   - Request routing and load balancing
   - **NEW**: Authentication middleware
   - **NEW**: Rate limiting
   - **NEW**: CORS handling

2. **Auth Service** (NEW in Phase 7)
   - JWT token generation and validation
   - Service-to-service authentication tokens
   - User authentication integration
   - ForwardAuth endpoint for Traefik

## Authentication Flows

### 1. User Authentication Flow

```
User → Login → Auth Service → JWT Token
                                   ↓
User → API Request (with JWT) → Traefik → Validate (ForwardAuth)
                                              ↓
                                         Auth Service
                                              ↓
                                         Backend Service
```

**Example:**
```bash
# 1. User logs in
curl -X POST https://auth.evindrake.net/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "secret"}'

# Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-11-24T12:00:00Z",
  "user": {
    "username": "admin",
    "roles": ["user", "admin"]
  }
}

# 2. User makes authenticated request
curl https://dashboard.evindrake.net/api/services \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 2. Service-to-Service Authentication

```
Service A → API Request (with Service Token) → Traefik → Validate
                                                            ↓
                                                       Auth Service
                                                            ↓
                                                       Service B
```

**Example:**
```bash
# Generate service token (requires admin service token)
./homelab gateway generate-token discord-bot

# Use service token for inter-service communication
curl http://homelab-dashboard:8080/api/internal/metrics \
  -H "Authorization: Bearer <service-token>"
```

## Middleware Configuration

### Available Middlewares

1. **auth-jwt**: JWT user authentication
   - ForwardAuth to auth service
   - Validates JWT tokens
   - Adds user info headers (X-User-Id, X-User-Roles)

2. **auth-service**: Service-to-service authentication
   - Validates service tokens
   - Adds service info headers (X-Service-Name)

3. **rate-limit**: Request rate limiting
   - Default: 100 requests/minute
   - Burst: 50 requests
   - Configurable per service

4. **rate-limit-strict**: Aggressive rate limiting
   - 20 requests/minute for public endpoints
   - Burst: 10 requests

5. **cors**: Cross-Origin Resource Sharing
   - Configurable allowed origins
   - Credentials support
   - Preflight handling

6. **security-headers**: Security HTTP headers
   - HSTS (Strict-Transport-Security)
   - Content Security Policy
   - X-Frame-Options
   - X-Content-Type-Options

### Applying Middlewares to Services

Services can specify middlewares in `services.yaml`:

```yaml
services:
  dashboard:
    api_gateway:
      expose_publicly: true
      require_auth: true
      rate_limit: "100/minute"
      allowed_origins: ["*"]
      middlewares:
        - auth-jwt
        - rate-limit
        - cors
        - security-headers
```

Or via Traefik labels in compose files:

```yaml
labels:
  - "traefik.http.routers.myservice.middlewares=auth-jwt,rate-limit,cors"
```

## Rate Limiting

### Configuration

Rate limiting is configured per service in `services.yaml`:

```yaml
api_gateway:
  rate_limit: "100/minute"  # Format: <number>/<period>
```

### Custom Rate Limits

Create custom rate limit middlewares in Traefik labels:

```yaml
labels:
  # Custom rate limit: 200 requests per minute
  - "traefik.http.middlewares.my-rate-limit.ratelimit.average=200"
  - "traefik.http.middlewares.my-rate-limit.ratelimit.burst=100"
  - "traefik.http.middlewares.my-rate-limit.ratelimit.period=1m"
```

## CORS Configuration

### Default CORS Policy

```yaml
allowed_origins: ["*"]
allowed_methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
allowed_headers: ["*"]
allow_credentials: true
max_age: 100
```

### Per-Service CORS

Restrict CORS for specific services:

```yaml
api_gateway:
  allowed_origins:
    - "https://dashboard.evindrake.net"
    - "https://app.example.com"
```

## CLI Commands

### Gateway Management

```bash
# View gateway status and routes
./homelab gateway status

# List registered service tokens
./homelab gateway tokens

# Generate new service token
./homelab gateway generate-token <service-name>

# View gateway access logs
./homelab gateway logs

# View live access log (follow mode)
./homelab gateway logs --follow
```

### Examples

```bash
# Check gateway health
$ ./homelab gateway status
Gateway Status: healthy
Active Routes: 12
Middlewares: 7
Access Log: /var/lib/docker/volumes/traefik_data/_data/access.log

# Generate token for discord-bot
$ ./homelab gateway generate-token discord-bot
Service Token Generated:
  Service: discord-bot
  Token: abc123xyz456...
  Env Var: SERVICE_TOKEN_DISCORD_BOT

Add to .env:
  SERVICE_TOKEN_DISCORD_BOT=abc123xyz456...

# View recent access logs
$ ./homelab gateway logs
2025-11-23T12:00:00Z dashboard.evindrake.net GET /api/services 200 45ms
2025-11-23T12:00:01Z auth.evindrake.net POST /api/v1/auth/login 200 120ms
2025-11-23T12:00:02Z bot.evindrake.net GET /health 200 5ms
```

## Security Best Practices

### 1. Token Management

- **JWT Tokens**: Expire after 24 hours (configurable)
- **Service Tokens**: Never expire - rotate manually
- **Storage**: Store service tokens in `.env` files, never commit to git
- **Rotation**: Rotate service tokens every 90 days

### 2. Rate Limiting

- **Public APIs**: Use strict rate limiting (20 req/min)
- **Authenticated APIs**: Standard rate limiting (100 req/min)
- **Internal APIs**: Higher limits or no limits

### 3. CORS Configuration

- **Development**: Allow all origins (`["*"]`)
- **Production**: Restrict to specific domains
- **Credentials**: Only allow credentials for trusted origins

### 4. Security Headers

Always enable security headers middleware:
- Prevents clickjacking (X-Frame-Options)
- Enforces HTTPS (HSTS)
- Prevents MIME sniffing
- Sets Content Security Policy

## Environment Variables

### Auth Service

```bash
# JWT Configuration
JWT_SECRET=<random-32-char-secret>
JWT_EXPIRY_HOURS=24

# Service Tokens
SERVICE_TOKEN_DASHBOARD=<token>
SERVICE_TOKEN_DISCORD_BOT=<token>
SERVICE_TOKEN_STREAM_BOT=<token>
SERVICE_TOKEN_CELERY_WORKER=<token>
```

### Traefik

```bash
# Let's Encrypt
LETSENCRYPT_EMAIL=admin@evindrake.net

# Cloudflare DNS
CLOUDFLARE_EMAIL=admin@evindrake.net
CLOUDFLARE_DNS_API_TOKEN=<token>
CLOUDFLARE_ZONE_API_TOKEN=<token>

# Dashboard Auth
TRAEFIK_DASHBOARD_AUTH=<htpasswd-string>
```

## API Endpoints

### Auth Service Endpoints

#### POST /api/v1/auth/login
Login and get JWT token

**Request:**
```json
{
  "username": "admin",
  "password": "secret"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_at": "2025-11-24T12:00:00Z",
  "user": {
    "username": "admin",
    "roles": ["user", "admin"]
  }
}
```

#### POST /api/v1/auth/validate
Validate JWT token (used by Traefik ForwardAuth)

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```
200 OK
X-User-Id: admin
X-User-Roles: user,admin
X-Token-Type: user
```

#### POST /api/v1/auth/service-token/generate
Generate service-to-service token (requires service token auth)

**Request:**
```json
{
  "service_name": "discord-bot"
}
```

**Response:**
```json
{
  "service_name": "discord-bot",
  "token": "abc123xyz456...",
  "env_var": "SERVICE_TOKEN_DISCORD_BOT",
  "note": "Add to .env as SERVICE_TOKEN_DISCORD_BOT=abc123xyz456..."
}
```

#### POST /api/v1/auth/service-token/validate
Validate service token

**Headers:**
```
Authorization: Bearer <service-token>
```

**Response:**
```
200 OK
X-Service-Name: discord-bot
X-Token-Type: service
```

#### GET /api/v1/auth/tokens
List all registered service tokens (requires service token auth)

**Response:**
```json
{
  "services": ["dashboard", "discord-bot", "stream-bot"],
  "count": 3
}
```

#### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "healthy",
  "service": "auth-service",
  "version": "1.0.0",
  "timestamp": "2025-11-23T12:00:00Z"
}
```

## Monitoring

### Access Logs

Traefik access logs are stored in JSON format:

```bash
# View access logs
docker exec traefik tail -f /data/access.log

# Filter by service
docker exec traefik grep "dashboard" /data/access.log | jq

# View rate limit rejections
docker exec traefik grep '"StatusCode":429' /data/access.log | jq
```

### Metrics

Traefik exposes Prometheus metrics (Phase 5 integration):

- `traefik_entrypoint_requests_total`
- `traefik_entrypoint_request_duration_seconds`
- `traefik_router_requests_total`
- `traefik_service_requests_total`

## Troubleshooting

### Authentication Failures

```bash
# Check auth service logs
docker logs homelab-auth-service --tail=50

# Test JWT validation manually
curl -X POST http://localhost:8000/api/v1/auth/validate \
  -H "Authorization: Bearer <token>"
```

### Rate Limiting Issues

```bash
# View rate limit configuration
docker exec traefik cat /etc/traefik/traefik.yml

# Check access logs for 429 errors
docker exec traefik grep '"StatusCode":429' /data/access.log
```

### CORS Errors

```bash
# Test CORS preflight
curl -X OPTIONS https://dashboard.evindrake.net/api/test \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

## Migration from Phase 3

Phase 7 is backward compatible with Phase 3. No changes required to existing services unless you want to enable authentication or custom rate limiting.

### Optional Enhancements

1. **Add authentication to dashboard:**
   ```yaml
   labels:
     - "traefik.http.routers.dashboard.middlewares=auth-jwt,dashboard-nocache"
   ```

2. **Add rate limiting to public APIs:**
   ```yaml
   labels:
     - "traefik.http.routers.public-api.middlewares=rate-limit-strict,cors"
   ```

3. **Enable service-to-service auth:**
   - Generate service tokens
   - Add to .env files
   - Update service code to include tokens in requests

## Known Limitations (MVP)

### Service Catalog Metadata Injection

**Status**: ⚠️ Not Implemented in MVP

The `services.yaml` file defines authentication requirements, rate limits, and middleware configurations. However, **automatic metadata injection is not yet implemented**.

**Current Workarounds:**

1. **Authentication Middleware**: Manually add to Traefik labels
   ```yaml
   labels:
     - "traefik.http.routers.myservice.middlewares=auth-jwt,rate-limit"
   ```

2. **Rate Limits**: Manually configure per-service rate limiting in compose files

3. **CORS Settings**: Manually add CORS middleware to services that need it

**Impact**: Services require manual middleware configuration rather than automatic inheritance from `services.yaml`.

## Future Enhancements (Post-MVP)

- **Metadata injection**: Automatic middleware configuration from `services.yaml`
- **OAuth2 integration**: Replace simple JWT with OAuth2 provider
- **Circuit breaker**: Automatic failure handling and retry logic
- **Request tracing**: Distributed tracing with Jaeger/Zipkin
- **Advanced rate limiting**: IP-based, user-based, sliding window
- **API versioning**: Automatic version routing
- **GraphQL gateway**: Unified GraphQL endpoint

## Related Documentation

- [Phase 3: Service Discovery](PHASE3_SERVICE_DISCOVERY.md)
- [Phase 4: Database Platform](PHASE4_DATABASE_UPGRADE.md)
- [Phase 5: Observability](PHASE5_OBSERVABILITY.md)
- [Phase 6: CI/CD](PHASE6_CICD.md)
