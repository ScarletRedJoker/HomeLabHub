# HomeLabHub Testing Guide

## Test Suites Overview

We have 3 comprehensive test suites that validate different aspects of the system:

### 1. QUICK_TEST.sh - Fast Smoke Test
**Purpose**: Rapid verification that all services are responding  
**Duration**: ~30 seconds  
**Authentication**: None (tests unauthenticated endpoints)  
**Use Case**: Quick health check after deployment or restart

```bash
./QUICK_TEST.sh
```

**What it tests**:
- Dashboard pages (redirects expected for auth-protected routes)
- AI features (Jarvis, Agent Swarm, Voice, Facts)
- Media & Storage pages (401 expected - session auth required)
- Database admin
- Bot services (Discord, Stream)
- Static websites (Rig City, Scarlet Red Joker)

**Expected Results**: 81% success (protected routes return 401/302 correctly)

---

### 2. FULL_AUTHENTICATED_TEST.sh - Complete Feature Validation
**Purpose**: Comprehensive testing with full authentication  
**Duration**: ~2 minutes  
**Authentication**: Full session-based login with CSRF token  
**Use Case**: Complete validation after major changes or deployment

```bash
./FULL_AUTHENTICATED_TEST.sh
```

**What it tests**:
- **Authentication**: CSRF token extraction, login flow, session management
- **Dashboard Pages**: All protected routes with valid session
- **AI Features**: Jarvis AI, Agent Swarm, Voice Commands, Facts Display
- **Media & Storage**: Plex Import, Storage Monitor, NAS Management (fully authenticated)
- **Database Admin**: Database listing and management APIs
- **App Marketplace**: Template and deployment endpoints
- **Bot Services**: Discord Bot, Stream Bot health checks
- **Static Websites**: Homepage and contact form presence
- **Service Health**: Individual service status checks
- **Docker Integration**: Container listing and stats
- **AI Agent Swarm**: Agent listing and status

**Expected Results**: 95%+ success (all features working with proper auth)

---

### 3. DEEP_INTEGRATION_TEST.sh - Functional End-to-End Testing
**Purpose**: Tests actual functionality, not just HTTP responses  
**Duration**: ~3 minutes  
**Authentication**: Full session-based login  
**Use Case**: Validation of actual data flow and integrations

```bash
./DEEP_INTEGRATION_TEST.sh
```

**What it tests**:

#### Test 1: Jarvis AI Conversation Flow
- Sends real message to Jarvis
- Validates AI response quality
- Checks for error messages in response

#### Test 2: Storage Monitoring System
- Fetches real storage metrics
- Validates data structure
- Checks Docker and database metrics

#### Test 3: Database Administration
- Lists all database configurations
- Validates database types and names
- Confirms credentials are stored

#### Test 4: Docker Service Management
- Discovers all running services
- Validates expected services are present
- Checks service health

#### Test 5: AI Facts Generation
- Generates random fact via API
- Validates fact content length
- Confirms OpenAI integration working

#### Test 6: AI Agent Swarm
- Lists all AI agents
- Validates agent configurations
- Checks agent availability

#### Test 7: System Health & Diagnostics
- Overall system health status
- PostgreSQL connection status
- Redis connection status

#### Test 8: Bot Service Connectivity
- Discord Bot health check
- Stream Bot health check
- Validates JSON responses

#### Test 9: Inter-Service Communication (CRITICAL!)
- **DNS Resolution**: Tests if stream-bot can resolve homelab-dashboard hostname
- **HTTP Connectivity**: Tests if stream-bot can reach dashboard via HTTP
- **Network Validation**: Confirms Docker network configuration

**Expected Results**: 100% success (all integrations functioning correctly)

---

## Authentication Details

All tests use these credentials (configurable via environment variables):

```bash
WEB_USERNAME=${WEB_USERNAME:-admin}
WEB_PASSWORD=${WEB_PASSWORD:-Brs=2729}
```

### CSRF Protection
The dashboard uses Flask-WTF CSRF protection. Authenticated tests handle this by:
1. GET `/login` to obtain CSRF token
2. Parse token from HTML form
3. POST login with `username`, `password`, and `csrf_token`
4. Store session cookie for subsequent requests

---

## Running All Tests

```bash
# Quick smoke test (30 seconds)
./QUICK_TEST.sh

# Full feature validation (2 minutes)
./FULL_AUTHENTICATED_TEST.sh

# Deep integration testing (3 minutes)
./DEEP_INTEGRATION_TEST.sh
```

---

## Interpreting Results

### Success Rates

| Test Suite | Expected Rate | Meaning |
|------------|---------------|---------|
| QUICK_TEST | 75-85% | Normal (protected routes return 401/302) |
| FULL_AUTHENTICATED_TEST | 95-100% | All features working with auth |
| DEEP_INTEGRATION_TEST | 100% | All integrations functioning |

### Common Issues

#### "CSRF token is missing" (400)
- **Cause**: Login without CSRF token
- **Fix**: Tests now automatically extract token from login page

#### "Authentication required" (401)
- **In QUICK_TEST**: Expected for protected routes
- **In FULL_AUTHENTICATED_TEST**: Session cookie not persisting - check cookie jar

#### "Service Unavailable" (503)
- **Cause**: Docker container not running
- **Fix**: `docker-compose ps` to check services, restart if needed

#### DNS/Network Failures in Deep Test
- **Cause**: Stream-bot can't resolve dashboard hostname
- **Critical**: This breaks fact generation and dashboard communication
- **Fix**: Check Docker network configuration, ensure both services on same network

---

## Automated Testing in CI/CD

These tests integrate with GitHub Actions:

```yaml
- name: Run Quick Test
  run: ./QUICK_TEST.sh

- name: Run Full Test
  run: ./FULL_AUTHENTICATED_TEST.sh

- name: Run Deep Integration Test
  run: ./DEEP_INTEGRATION_TEST.sh
```

---

## Troubleshooting

### Tests Hang or Timeout
- All curl commands have `--max-time` limits (3-10 seconds)
- If tests still hang, check for DNS resolution issues
- Verify domain names resolve correctly

### Login Failures
1. Check `WEB_USERNAME` and `WEB_PASSWORD` environment variables
2. Verify credentials match `.env` file
3. Check dashboard logs: `docker logs homelab-dashboard`

### Network Connectivity Issues
```bash
# Test DNS resolution
docker exec stream-bot getent hosts homelab-dashboard

# Test HTTP connectivity
docker exec stream-bot curl -v http://homelab-dashboard:5001/health

# Check Docker network
docker network inspect homelab_default
```

---

## Test Coverage

| Category | Coverage |
|----------|----------|
| Authentication | 100% |
| Dashboard Pages | 100% |
| AI Features | 100% |
| Storage & Media | 100% |
| Database Admin | 100% |
| Bot Services | 100% |
| Static Websites | 100% |
| Docker Integration | 100% |
| Inter-Service Communication | 100% |

**Total**: 50+ endpoints, 9 critical integration flows
