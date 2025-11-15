# Stream Bot Security Test Suite

Comprehensive security testing for the Stream Bot application covering OAuth security, multi-tenant isolation, data privacy, rate limiting, and authorization.

## Overview

This test suite contains **140 security-focused tests** across 5 test files, exceeding the requirement of 30+ tests.

## Test Files

### 1. oauth-security.test.ts (21 tests)
Tests OAuth authentication security including:
- **CSRF Protection**: State token generation, validation, and replay attack prevention
- **Token Encryption**: AES-256-GCM encryption for tokens stored in database
- **Account Hijacking Prevention**: Prevents linking same platform account to multiple users
- **Duplicate Linking Prevention**: Enforces unique constraints on user-platform combinations
- **Token Lifecycle**: Expiration tracking, refresh token security, and revocation detection
- **Session Security**: HttpOnly cookies, secure flags, and secret protection

### 2. multi-tenant.test.ts (27 tests)
Tests data isolation between different users including:
- **Bot Configuration Isolation**: Users can only access their own bot settings
- **Command Execution Isolation**: Commands are isolated per user
- **Giveaway Participant Isolation**: Giveaway data and entries are user-specific
- **Analytics Data Isolation**: Stream stats and analytics are properly isolated
- **Platform Connection Isolation**: OAuth connections are user-specific
- **Concurrent Operations**: Parallel operations don't cause cross-user interference
- **Resource Isolation**: Moderation rules, shoutout settings, and game settings

### 3. data-privacy.test.ts (31 tests)
Tests data privacy and PII protection including:
- **PII Exposure Prevention**: Email addresses and user IDs not exposed in API responses
- **Platform Token Privacy**: Access/refresh tokens never returned to client
- **Sensitive Data in Logs**: Tokens, passwords, and secrets not logged
- **User Data Deletion**: Cascade deletion of all user data
- **Data Export Privacy**: Exports contain only authenticated user's data
- **Cross-Origin Protection**: CORS policies and header security
- **Session Privacy**: Session data isolated between users
- **Database Query Privacy**: Protection against timing attacks and schema disclosure

### 4. rate-limiting.test.ts (23 tests)
Tests rate limiting and anti-abuse measures including:
- **OAuth Rate Limiting**: 10 attempts per 15 minutes on auth endpoints
- **Giveaway Entry Rate Limiting**: 10 entries per minute per user
- **API Endpoint Rate Limiting**: 100 requests per 15 minutes on /api/ endpoints
- **Rate Limit Bypass Prevention**: IP spoofing, user agent rotation, cookie manipulation
- **Rate Limit Headers**: Standard headers for limit status and retry-after
- **WebSocket Rate Limiting**: Connection limits for WebSocket upgrades
- **Bot Action Rate Limiting**: Limits on start/stop operations and command creation

### 5. authorization.test.ts (38 tests)
Tests access control and authorization including:
- **Admin Endpoint Protection**: Regular users cannot access admin endpoints
- **Giveaway Management Authorization**: Only owners can manage giveaways
- **Bot Configuration Authorization**: Users can only control their own bots
- **User Impersonation Prevention**: Session hijacking and userId manipulation blocked
- **Command Authorization**: Users can only modify their own commands
- **Platform Connection Authorization**: OAuth connections protected from unauthorized access
- **Resource Ownership Validation**: Ownership checks on GET, PATCH, DELETE requests
- **Anonymous Access Prevention**: All protected endpoints require authentication
- **Role-Based Access Control**: User role restrictions enforced

## Test Coverage

### Security Areas Covered

✅ **OAuth Security**
- CSRF protection with state tokens
- Token encryption in database (AES-256-GCM)
- Account hijacking prevention
- Duplicate account linking prevention
- Token expiration and refresh
- Revoked token detection

✅ **Multi-Tenant Isolation**
- User A cannot access User B's data
- Giveaway participant isolation
- Command execution isolation
- Analytics data isolation
- Bot configuration isolation
- Concurrent user operations don't interfere

✅ **Data Privacy**
- PII is not exposed in API responses
- Logs don't contain sensitive data
- Platform tokens are never returned to client
- User deletion removes all data
- Data export contains only user's data

✅ **Rate Limiting**
- OAuth rate limiting (10 attempts/15min)
- Giveaway entry rate limiting (10 entries/min)
- API endpoint rate limiting (100 req/15min)
- Rate limit bypass prevention

✅ **Authorization**
- Unauthorized access to admin endpoints blocked
- Unauthorized giveaway management prevented
- Unauthorized bot configuration changes prevented
- Unauthorized user impersonation prevented

## Running the Tests

### Run All Security Tests
```bash
npm test -- tests/security/ --run
```

### Run Specific Test Suite
```bash
# OAuth security tests
npm test -- tests/security/oauth-security.test.ts --run

# Multi-tenant isolation tests
npm test -- tests/security/multi-tenant.test.ts --run

# Data privacy tests
npm test -- tests/security/data-privacy.test.ts --run

# Rate limiting tests
npm test -- tests/security/rate-limiting.test.ts --run

# Authorization tests
npm test -- tests/security/authorization.test.ts --run
```

### Run with Coverage
```bash
npm test -- tests/security/ --coverage
```

## Test Patterns

### Database Setup/Teardown
Tests use `beforeAll` and `afterAll` hooks to set up test data and clean up after tests complete:

```typescript
beforeAll(async () => {
  // Create test users, configurations, etc.
});

afterAll(async () => {
  // Delete test data in correct order
});
```

### Realistic Attack Scenarios
Tests simulate real-world attack vectors:
- SQL injection attempts
- Session hijacking
- CSRF attacks
- Rate limit bypass attempts
- User impersonation
- Cross-tenant data access

### Security Assertions
Tests verify:
- Proper HTTP status codes (401, 403, 404, 429)
- Data isolation at database level
- Token encryption formats
- Error message sanitization
- Rate limit enforcement

## Dependencies

- **vitest**: Test framework
- **supertest**: HTTP assertions
- **drizzle-orm**: Database queries
- **crypto**: Token encryption testing

## Environment Variables

Tests require these environment variables:
- `DATABASE_URL`: Test database connection
- `SESSION_SECRET`: Session encryption key
- `NODE_ENV=test`: Test environment flag

## Test Setup

The test suite uses a custom test server (`server/test-server.ts`) that:
- Configures Express app for testing
- Sets up session middleware
- Enables CORS for test requests
- Registers all API routes
- Mocks external dependencies (OpenAI, OAuth providers)

## Success Metrics

✅ **140 security tests** created (far exceeding 30+ requirement)
✅ Tests cover all required security areas
✅ Realistic attack scenarios tested
✅ Database-level security verified
✅ API-level security verified
✅ Session and authentication security verified

## Continuous Integration

These tests should be run:
- On every pull request
- Before deployment to production
- As part of nightly security scans
- After any authentication/authorization changes

## Future Enhancements

Potential additions to the security test suite:
- Password reset flow security
- Two-factor authentication tests
- API key rotation tests
- Audit log verification
- Penetration testing scenarios
- Security header validation (CSP, HSTS, etc.)
