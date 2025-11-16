# End-to-End Test Documentation

## Overview

This document provides comprehensive documentation for all E2E test suites across the HomeLabHub microservices architecture. These tests validate critical user journeys and ensure system reliability across all services.

## Test Architecture

### Test Framework Stack

- **Stream Bot & Discord Bot**: Vitest + Supertest (TypeScript)
- **Dashboard**: Pytest + HTTPX (Python)
- **Mock APIs**: Custom mock implementations for external services
- **Coverage**: V8 for Node.js, Coverage.py for Python

### Test Environment

All E2E tests run in isolated test environments with:
- Separate test databases
- Mocked external API calls
- Predictable test data fixtures
- Automatic cleanup after test runs

## Stream Bot E2E Tests

**Location**: `services/stream-bot/tests/e2e/user-flows.test.ts`

### Flow 1: User Signup → OAuth Platform Linking → Bot Setup → Command Execution

**Purpose**: Validates the complete onboarding flow for new users

**Test Steps**:
1. User signs up with email/password
2. User logs in and receives session cookie
3. User connects Twitch platform via OAuth
4. User creates bot configuration
5. User creates first custom command
6. User executes command and verifies response
7. System tracks command usage

**What it validates**:
- User authentication works end-to-end
- Session management is secure
- OAuth integration with platforms succeeds
- Bot configuration is stored correctly
- Commands execute and log usage

**Key assertions**:
```typescript
- signupResponse.status === 201
- loginResponse contains session cookie
- platformConnection.isConnected === true
- botConfig.isActive === true
- commandExecution returns correct response
- usageLogs.length > 0
```

### Flow 2: Giveaway Creation → User Entry → Winner Selection → Notification

**Purpose**: Tests the complete giveaway lifecycle

**Test Steps**:
1. User creates new giveaway with specific rules
2. Multiple mock users enter the giveaway
3. System tracks all entries
4. User ends giveaway and selects winners
5. System marks giveaway as inactive
6. Winners are selected randomly but fairly

**What it validates**:
- Giveaway creation with various entry methods
- Entry tracking and deduplication
- Winner selection algorithm
- Giveaway state management
- Data integrity throughout lifecycle

**Key assertions**:
```typescript
- giveaway.isActive === true (initially)
- entries.length === 5
- winners.length <= winnersCount
- giveaway.isActive === false (after end)
- giveaway.endedAt is set
```

### Flow 3: Command Creation → Usage Tracking → Analytics

**Purpose**: Validates command analytics and usage tracking

**Test Steps**:
1. User creates command with cooldown
2. Command is executed multiple times
3. System tracks each execution with metadata
4. User requests analytics for command
5. System returns accurate usage statistics
6. Analytics include unique users and temporal data

**What it validates**:
- Command execution throttling
- Usage log creation
- Analytics aggregation accuracy
- Temporal analysis (hourly breakdown)
- Unique user tracking

**Key assertions**:
```typescript
- analytics.totalExecutions >= executeCount
- analytics.uniqueUsers >= 3
- analytics.executionsByHour is defined
- platformStats contains all platforms
```

### Flow 4: Token Expiration → Auto-refresh → Continued Service

**Purpose**: Tests automatic token refresh mechanism

**Test Steps**:
1. Create platform connection with expired token
2. System detects expired token
3. System automatically refreshes using refresh token
4. New access token is stored
5. Expiration time is updated
6. Service continues without interruption

**What it validates**:
- Token expiration detection
- Automatic refresh mechanism
- Token storage and update
- Service continuity during refresh
- Error handling for invalid refresh tokens

**Key assertions**:
```typescript
- refreshResponse.accessToken !== 'expired_access_token'
- newExpiresAt > Date.now()
- connection.isConnected remains true
- subsequent operations succeed
```

### Flow 5: Multi-Platform Bot Management

**Purpose**: Tests managing bot across multiple streaming platforms

**Test Steps**:
1. User connects to Twitch, YouTube, and Kick
2. User creates global command for all platforms
3. Command executes on each platform
4. System tracks platform-specific statistics
5. Analytics show per-platform usage

**What it validates**:
- Multi-platform connection management
- Cross-platform command execution
- Platform-specific analytics
- Simultaneous platform operations

## Discord Bot E2E Tests

**Location**: `services/discord-bot/tests/e2e/ticket-flow.test.ts`

### Flow 1: Ticket Creation → Staff Assignment → Resolution → Closure

**Purpose**: Tests the complete support ticket lifecycle

**Test Steps**:
1. User creates support ticket
2. Ticket is assigned to staff member
3. Multiple messages are exchanged
4. Staff marks ticket as resolved
5. Ticket is closed with resolution notes
6. Full history is recorded

**What it validates**:
- Ticket creation and numbering
- Staff assignment workflow
- Message threading
- Status transitions
- Resolution tracking
- Audit trail completeness

**Key assertions**:
```typescript
- ticket.status === 'open' (initially)
- ticket.status === 'in_progress' (after assignment)
- messages.length >= 3
- ticket.status === 'resolved'
- ticket.closedAt is set
- history.events.length > 0
```

### Flow 2: Stream Go-Live Detection → Notification → Multiple Platforms

**Purpose**: Tests stream notification system across platforms

**Test Steps**:
1. Configure notifications for Twitch, YouTube, Kick
2. Mock stream goes live on Twitch
3. System detects go-live event
4. Notifications sent to configured Discord channels
5. Stream goes offline
6. System updates notification status

**What it validates**:
- Multi-platform stream detection
- Notification delivery
- Message templating
- Role mentions
- Auto-detection capability
- Offline event handling

**Key assertions**:
```typescript
- notifications.length === 3
- notification.isEnabled === true
- goLiveResponse.notificationsSent > 0
- messageTemplate interpolation works
- offlineResponse.success === true
```

### Flow 3: OAuth Linking → Multiple Servers → Permission Handling

**Purpose**: Tests Discord OAuth and multi-server management

**Test Steps**:
1. User authenticates via Discord OAuth
2. System retrieves user's Discord servers
3. User accesses server settings with admin permissions
4. User updates server configuration
5. User creates ticket in specific server
6. Permissions are enforced

**What it validates**:
- OAuth authentication flow
- Server list retrieval
- Permission-based access control
- Multi-server data isolation
- Settings management
- Cross-server operations

**Key assertions**:
```typescript
- oauthResponse contains accessToken
- servers.length >= 3
- settings update succeeds for admin
- ticket.serverId matches target server
- unauthorized access is blocked
```

### Flow 4: Ticket Concurrency and Rate Limiting

**Purpose**: Tests system behavior under concurrent operations

**Test Steps**:
1. Create 5 tickets simultaneously
2. All tickets are created successfully
3. Ticket numbers are sequential
4. No data conflicts occur
5. All tickets queryable

**What it validates**:
- Concurrent request handling
- Transaction isolation
- Auto-increment consistency
- Race condition prevention

## Dashboard E2E Tests

**Location**: `services/dashboard/tests/e2e/test_dashboard_flows.py`

### Flow 1: Login → Docker Management → Container Start/Stop → Logs

**Purpose**: Tests Docker container management through dashboard

**Test Steps**:
1. User authenticates to dashboard
2. User views list of Docker containers
3. User stops running container
4. User starts stopped container
5. User restarts container
6. User views container logs

**What it validates**:
- Authentication and session management
- Docker API integration
- Container state management
- Log retrieval and display
- Error handling for Docker operations

**Key assertions**:
```python
assert dashboard_response.status_code == 200
assert len(containers) > 0
assert stop_response.json['success'] is True
assert start_response.json['success'] is True
assert 'logs' in logs_response.json
```

### Flow 2: Jarvis Command → Approval → Execution → Audit Log

**Purpose**: Tests AI assistant command approval workflow

**Test Steps**:
1. User submits command to Jarvis
2. AI analyzes command and assesses risk
3. Command requires approval
4. User reviews and approves command
5. System executes command safely
6. Full audit trail is recorded

**What it validates**:
- AI command analysis
- Risk assessment
- Approval workflow
- Safe command execution
- Audit logging
- Command history

**Key assertions**:
```python
assert command_result['status'] == 'pending_approval'
assert command_result['risk_level'] == 'low'
assert approve_response.json['status'] == 'approved'
assert exec_result['success'] is True
assert len(audit_log['events']) >= 3
```

### Flow 3: Google Calendar Access → Event Retrieval → Display

**Purpose**: Tests Google Calendar integration

**Test Steps**:
1. User authenticates with Google OAuth
2. System fetches calendar events
3. Events are displayed on dashboard
4. User creates new calendar event
5. User updates existing event
6. User deletes event

**What it validates**:
- Google OAuth flow
- Calendar API integration
- Event CRUD operations
- Error handling
- Data synchronization

**Key assertions**:
```python
assert auth_response.json['authenticated'] is True
assert len(events) == 2
assert events[0]['summary'] == 'Team Meeting'
assert create_response.status_code == 201
assert updated_event['summary'] == 'Updated E2E Test Event'
```

### Flow 4: Home Assistant → Device Control → Status Update

**Purpose**: Tests smart home device control

**Test Steps**:
1. User connects to Home Assistant
2. System fetches device list
3. User controls light (turn off)
4. User controls switch (turn on)
5. User sets thermostat temperature
6. System fetches updated device status
7. User controls multiple devices simultaneously

**What it validates**:
- Home Assistant API integration
- Device discovery
- Device state control
- Bulk operations
- Real-time status updates

**Key assertions**:
```python
assert connect_response.json['connected'] is True
assert len(devices) == 3
assert turn_off_response.json['success'] is True
assert status['state'] == 'off'
assert bulk_control_response.json['affected_devices'] == 2
```

### Flow 5: Network Monitoring and Diagnostics

**Purpose**: Tests network monitoring capabilities

**Test Steps**:
1. Get system network interfaces
2. Scan for open ports
3. Check service health
4. View network statistics

**What it validates**:
- Network interface enumeration
- Port scanning functionality
- Service health monitoring
- Network diagnostics

## Mock External APIs

**Location**: `services/stream-bot/tests/mocks/external-apis.ts`

### Mocked Services

1. **Twitch API**
   - Token validation and refresh
   - User info retrieval
   - Stream status checking

2. **YouTube API**
   - OAuth token management
   - Channel info
   - Live stream detection

3. **Kick API**
   - User authentication
   - Stream status

4. **Discord API**
   - Guild information
   - User guilds
   - Message sending

5. **Spotify API**
   - Currently playing track
   - Playback control

### Usage

```typescript
import { setupMockAPIs, mockAPIs } from './tests/mocks/external-apis';

// Enable mocks for testing
const mocks = setupMockAPIs();

// Use mock APIs in tests
const twitchInfo = await mocks.twitch.getUserInfo('mock_token');
```

## Running Tests

### Stream Bot

```bash
# Run all tests
cd services/stream-bot
npm test

# Run only E2E tests
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode for development
npm run test:watch

# Interactive UI
npm run test:ui
```

### Discord Bot

```bash
# Run all tests
cd services/discord-bot
npm test

# Run only E2E tests
npm run test:e2e

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Dashboard

```bash
# Run all tests
cd services/dashboard
pytest

# Run only E2E tests
pytest tests/e2e/

# Run with coverage
pytest --cov

# Run specific test file
pytest tests/e2e/test_dashboard_flows.py -v

# Run specific test
pytest tests/e2e/test_dashboard_flows.py::TestDashboardE2EFlows::test_e2e_flow_1_docker_management -v
```

## Test Coverage Goals

- **Line Coverage**: > 80% for critical paths
- **Branch Coverage**: > 75%
- **E2E Coverage**: 100% of critical user flows

### Viewing Coverage Reports

**Stream Bot & Discord Bot**:
```bash
npm run test:coverage
# Open coverage/index.html in browser
```

**Dashboard**:
```bash
pytest --cov --cov-report=html
# Open htmlcov/index.html in browser
```

## Continuous Integration

### CI Configuration

Tests are designed to run in CI environments:

```yaml
# Example GitHub Actions
- name: Run E2E Tests (Stream Bot)
  run: |
    cd services/stream-bot
    npm install
    npm run test:e2e
    
- name: Run E2E Tests (Discord Bot)
  run: |
    cd services/discord-bot
    npm install
    npm run test:e2e
    
- name: Run E2E Tests (Dashboard)
  run: |
    cd services/dashboard
    pip install -r requirements.txt
    pytest tests/e2e/ -v
```

### Headless Mode

All tests run in headless mode by default, suitable for CI:
- No browser windows
- No GUI dependencies
- Fast execution
- Parallel test execution supported

## Test Data Management

### Fixtures

Each test suite uses fixtures for repeatable testing:

**Stream Bot/Discord Bot**:
```typescript
beforeEach(async () => {
  // Create test user
  // Setup platform connections
  // Initialize bot config
});

afterEach(async () => {
  // Cleanup test data
  // Reset database state
});
```

**Dashboard**:
```python
@pytest.fixture
def authenticated_client(self, client):
    with client.session_transaction() as sess:
        sess['user_id'] = 'test_user_123'
    return client
```

### Database Isolation

- Each test uses unique IDs with timestamps
- Complete cleanup in `afterAll`/`afterEach` hooks
- No cross-test data pollution
- Parallel test execution safe

## Debugging Tests

### Enable Verbose Logging

**Stream Bot/Discord Bot**:
```bash
DEBUG=* npm run test:e2e
```

**Dashboard**:
```bash
pytest tests/e2e/ -v -s
```

### Run Single Test

**Vitest**:
```bash
npm test -- --run tests/e2e/user-flows.test.ts
```

**Pytest**:
```bash
pytest tests/e2e/test_dashboard_flows.py::TestDashboardE2EFlows::test_e2e_flow_1_docker_management -v
```

## Smoke Test Suite

Quick validation tests for rapid feedback:

**Stream Bot**:
```bash
npm run test:unit  # Runs faster unit tests only
```

**Dashboard**:
```bash
pytest -m "not slow"  # Skips slow E2E tests
```

## Test Maintenance

### Adding New Tests

1. Create test file in appropriate `tests/e2e/` directory
2. Follow existing test patterns
3. Use descriptive test names
4. Add cleanup in `afterAll` hooks
5. Update this documentation

### Updating Mocks

When external APIs change:
1. Update mock implementations in `tests/mocks/`
2. Ensure mock responses match real API structure
3. Test against real API occasionally

## Common Issues

### Database Connection Issues

**Solution**: Ensure test database is running and environment variables are set:
```bash
export DATABASE_URL="postgresql://test:test@localhost:5432/test_db"
```

### Port Already in Use

**Solution**: Tests use random ports or ensure previous test cleanup completed:
```bash
# Kill any hanging test processes
pkill -f "node.*test"
```

### Timeout Errors

**Solution**: Increase test timeout in config:
```typescript
// vitest.config.ts
test: {
  testTimeout: 60000  // 60 seconds
}
```

```python
# pytest.ini
[pytest]
timeout = 60
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Descriptive Names**: Use clear, descriptive test names
3. **Assertions**: Include multiple assertions to catch edge cases
4. **Cleanup**: Always clean up test data
5. **Mocking**: Mock external services to avoid flakiness
6. **Documentation**: Document what each test validates
7. **Performance**: Keep tests fast (< 10s per test)
8. **Reliability**: Tests should pass consistently

## Success Metrics

✅ **Requirements Met**:
- [x] At least 3 E2E tests per service
- [x] All critical user flows covered
- [x] Tests pass consistently
- [x] Comprehensive test documentation
- [x] CI-friendly (headless mode)
- [x] Coverage reports generated
- [x] Mock external APIs implemented
- [x] Test scripts in package.json/requirements.txt

## Summary

This E2E test suite provides comprehensive coverage of critical user journeys across all HomeLabHub services. Tests are:
- **Reliable**: Consistent results with mocked external dependencies
- **Fast**: Optimized for quick feedback
- **Maintainable**: Clear structure and documentation
- **CI-Ready**: Designed for automated testing pipelines
- **Comprehensive**: Cover all critical flows end-to-end

For questions or issues, refer to individual test files or update this documentation.
