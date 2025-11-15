# API Quota Tracking System

The Stream Bot implements comprehensive API quota tracking to prevent rate limit errors and service disruptions across Twitch, YouTube, and Kick platforms.

## Overview

The quota tracking system monitors API usage in real-time, provides warnings as limits are approached, and implements a circuit breaker pattern to prevent quota exhaustion.

## Features

### ✅ Multi-Platform Support
- **Twitch**: 800 requests/minute (Helix API)
- **YouTube**: 10,000 quota units/day
- **Kick**: 100 requests/minute (conservative estimate)

### ✅ Smart Warning System
- **70% threshold**: Warning logged to console
- **85% threshold**: Alert logged to console (ready for email/in-app notifications)
- **95% threshold**: Circuit breaker activated - blocks new requests

### ✅ Storage Backend
- **Primary**: Redis with automatic TTL based on quota reset periods
- **Fallback**: In-memory storage if Redis is unavailable
- Automatically switches between Redis and in-memory based on availability

### ✅ Backoff Strategy
- Automatic delays when approaching limits:
  - 0ms delay: < 70% usage
  - 2000ms delay: 70-85% usage
  - 5000ms delay: 85-95% usage
  - Blocked until reset: > 95% usage

## Architecture

### Core Components

1. **QuotaService** (`server/quota-service.ts`)
   - Central service for tracking and managing quotas
   - Handles both Redis and in-memory storage
   - Provides status, tracking, and reset capabilities

2. **QuotaTracker Middleware** (`server/middleware/quota-tracker.ts`)
   - Express middleware for automatic quota tracking
   - Pre-request quota checking
   - Post-request quota tracking

3. **Integration Points**
   - `oauth-twitch.ts`: Tracks token exchange, validation, and refresh
   - `oauth-youtube.ts`: Tracks token exchange, profile fetch, and refresh
   - Future integrations can import and use tracking functions

## API Endpoints

### Get Quota Status
```http
GET /api/admin/quota/status?global=true
Authorization: Required (user session)
```

**Response:**
```json
{
  "user": {
    "quotas": [
      {
        "platform": "twitch",
        "current": 45,
        "limit": 800,
        "percentage": 5.625,
        "resetTime": "2025-11-15T09:00:00.000Z",
        "status": "ok",
        "isCircuitBreakerActive": false
      }
    ],
    "summary": {
      "hasWarnings": false,
      "hasCircuitBreaker": false,
      "totalPlatforms": 3
    }
  },
  "global": {
    "quotas": [...],
    "summary": {...}
  }
}
```

### Reset Quota
```http
POST /api/admin/quota/reset
Authorization: Required (user session)
Content-Type: application/json

{
  "platform": "twitch"
}
```

### Reset All Quotas
```http
POST /api/admin/quota/reset-all
Authorization: Required (user session)
```

## Usage Examples

### Using Quota Tracking in Code

```typescript
import { trackApiCall, waitForQuotaIfNeeded } from './middleware/quota-tracker';

async function makeTwitchApiCall(userId: string) {
  // Wait if quota is near limit (applies backoff)
  await waitForQuotaIfNeeded('twitch', 1, userId);
  
  // Make your API call
  const response = await axios.get('https://api.twitch.tv/...');
  
  // Track the API call
  await trackApiCall('twitch', 1, userId);
  
  return response.data;
}
```

### Using as Express Middleware

```typescript
import { quotaTracker } from './middleware/quota-tracker';

app.get('/api/twitch/streams', 
  requireAuth,
  quotaTracker({
    platform: 'twitch',
    cost: 1,
    userId: (req) => req.user?.id
  }),
  async (req, res) => {
    // Your handler - quota is already checked and will be tracked
  }
);
```

### YouTube API Cost Tracking

YouTube uses a quota unit system where different operations cost different amounts:

```typescript
// List operation costs 1 unit
await trackApiCall('youtube', 1, userId);

// Search operation costs 100 units
await trackApiCall('youtube', 100, userId);
```

## Configuration

### Environment Variables

```bash
# Redis configuration (optional - falls back to in-memory)
REDIS_URL=redis://localhost:6379

# Or with STREAMBOT_ prefix for unified deployments
STREAMBOT_REDIS_URL=redis://localhost:6379
```

### Platform Quota Limits

Located in `quota-service.ts`:

```typescript
const PLATFORM_CONFIGS: Record<Platform, PlatformQuotaConfig> = {
  twitch: {
    limit: 800,
    resetPeriodMs: 60 * 1000,
    resetPeriodName: 'minute',
    quotaCostPerCall: 1,
  },
  youtube: {
    limit: 10000,
    resetPeriodMs: 24 * 60 * 60 * 1000,
    resetPeriodName: 'day',
    quotaCostPerCall: 1,
  },
  kick: {
    limit: 100,
    resetPeriodMs: 60 * 1000,
    resetPeriodName: 'minute',
    quotaCostPerCall: 1,
  },
};
```

## Warning Thresholds

```typescript
const WARNING_THRESHOLD = 0.7;      // 70%
const ALERT_THRESHOLD = 0.85;       // 85%
const CIRCUIT_BREAKER_THRESHOLD = 0.95;  // 95%
```

## Monitoring and Logging

### Console Logs

The system automatically logs warnings and alerts:

```
[QuotaService] WARNING: twitch quota at 72.3% (578/800). Resets at 2025-11-15T09:00:00.000Z
[QuotaService] ALERT: twitch quota at 87.1% (697/800). Resets at 2025-11-15T09:00:00.000Z
[QuotaService] CIRCUIT BREAKER: twitch quota exhausted at 95.6% (765/800). Blocking requests until reset at 2025-11-15T09:00:00.000Z
```

### Warning Cooldown

Warnings are rate-limited to prevent log spam:
- Same platform warning: Once every 5 minutes
- Different severity levels: Logged immediately

## Testing

Run the quota service tests:

```bash
cd services/stream-bot
npx tsx tests/test-quota-service.ts
```

## Future Enhancements

### Planned Features
1. **Email Notifications**: Send emails at 85% threshold
2. **In-App Notifications**: Push notifications to dashboard
3. **Dashboard Banner**: Visual warning on quota status page
4. **Priority Queue**: Implement request prioritization
5. **Analytics Dashboard**: Historical quota usage charts
6. **Per-User Quotas**: Track individual user API usage
7. **Rate Limit Headers**: Parse and respect API rate limit headers

### Integration Points
- Integrate with notification service for email/push alerts
- Add dashboard UI component for quota visualization
- Implement webhook alerts for critical quota events

## Troubleshooting

### Circuit Breaker Activated Unexpectedly

Check quota status:
```bash
curl -X GET http://localhost:3000/api/admin/quota/status \
  -H "Cookie: session=..." 
```

Reset quota if needed:
```bash
curl -X POST http://localhost:3000/api/admin/quota/reset \
  -H "Content-Type: application/json" \
  -H "Cookie: session=..." \
  -d '{"platform": "twitch"}'
```

### Redis Connection Issues

The system automatically falls back to in-memory storage:
```
[QuotaService] No Redis URL configured, using in-memory store
```

To enable Redis, set the `REDIS_URL` environment variable.

### High API Usage

1. Check which platform is high:
   ```typescript
   const status = await quotaService.getAllQuotaStatus(userId);
   console.log(status);
   ```

2. Review recent API calls in application logs
3. Consider implementing caching for frequently requested data
4. Batch API requests where possible

## Best Practices

1. **Always track API calls**: Use `trackApiCall()` after every external API request
2. **Use waitForQuotaIfNeeded()**: Let the system handle backoff automatically
3. **Monitor quota status**: Check the admin endpoint regularly
4. **Plan for resets**: Understand quota reset periods for each platform
5. **Cache responses**: Reduce API calls by caching frequently accessed data
6. **Batch requests**: Combine multiple operations when platform APIs support it

## Security Considerations

- Quota endpoints require authentication
- User-scoped tracking prevents quota manipulation
- Reset endpoints limited to authenticated users
- Global quota status only accessible with `global=true` query param

## Platform-Specific Notes

### Twitch
- Rate limits are per-application, not per-user
- Some endpoints have stricter limits
- Token refresh doesn't count against quota

### YouTube
- Quota costs vary by operation type
- Read operations: 1-50 units
- Write operations: 50-1,600 units
- Daily limit resets at midnight Pacific Time

### Kick
- Limited public documentation
- Conservative 100/minute estimate used
- Adjust as actual limits are discovered

## Support

For issues or questions:
1. Check logs for quota warnings
2. Verify Redis connection if using Redis storage
3. Review platform API documentation for limit changes
4. Contact system administrator for quota adjustments
