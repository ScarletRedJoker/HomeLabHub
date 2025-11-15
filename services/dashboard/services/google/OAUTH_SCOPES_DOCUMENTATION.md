# Google Services OAuth Scopes Documentation

This document outlines the OAuth scopes required for Google Calendar, Gmail, and Drive integrations, along with the rationale for each scope.

## Overview

The Google services integration uses Replit's connector system to manage OAuth authentication and token refresh. All tokens are managed securely through the Replit platform and are never stored directly in code.

## Required Scopes by Service

### Google Calendar (`google-calendar`)

The Google Calendar integration requires the following scopes:

#### 1. `https://www.googleapis.com/auth/calendar.readonly`
**Purpose:** Read calendar events and calendar metadata  
**Used for:**
- Listing available calendars
- Reading calendar events for automation triggers
- Checking upcoming events that match automation keywords
- Displaying calendar information in the dashboard

**Example usage:**
```python
# List all calendars
calendars = calendar_service.list_calendars()

# Get upcoming events
events = calendar_service.list_events(
    calendar_id='primary',
    time_min=datetime.utcnow(),
    max_results=10
)
```

#### 2. `https://www.googleapis.com/auth/calendar.events`
**Purpose:** Create, modify, and delete calendar events  
**Used for:**
- Creating new calendar events programmatically
- Updating existing calendar events
- Deleting calendar events
- Managing event attendees and reminders

**Example usage:**
```python
# Create a new calendar event
event = calendar_service.create_event(
    summary="Deployment Scheduled",
    start_time=deployment_time,
    end_time=deployment_time + timedelta(hours=1),
    description="Automated deployment event"
)
```

**Security Note:** This scope allows full management of calendar events. The integration uses this responsibly only for user-initiated actions and automation triggers.

---

### Gmail (`google-mail`)

The Gmail integration requires the following scopes:

#### 1. `https://www.googleapis.com/auth/gmail.send`
**Purpose:** Send emails on behalf of the user  
**Used for:**
- Sending deployment notifications
- Sending SSL certificate expiry alerts
- Sending error notifications
- Sending system status reports
- Sending backup completion notifications

**Example usage:**
```python
# Send deployment notification
gmail_service.send_deployment_notification(
    to="admin@example.com",
    service_name="discord-bot",
    status="success",
    details="Deployment completed successfully"
)
```

**Security Note:** This scope only allows sending emails, not reading them. This minimizes privacy concerns and follows the principle of least privilege.

#### 2. `https://www.googleapis.com/auth/gmail.readonly`
**Purpose:** Read user profile information (email address)  
**Used for:**
- Verifying the connected Gmail account
- Displaying the connected email address in dashboard
- Testing Gmail connection status

**Example usage:**
```python
# Test Gmail connection
status = google_client_manager.test_connection('gmail')
# Returns: {'connected': True, 'email': 'user@example.com'}
```

**Security Note:** This scope provides minimal read access only to profile information, not to email content.

---

### Google Drive (`google-drive`)

The Google Drive integration requires the following scopes:

#### 1. `https://www.googleapis.com/auth/drive.file`
**Purpose:** Access files created by this application  
**Used for:**
- Uploading backup files to Google Drive
- Listing backups in the backup folder
- Downloading backup files
- Deleting old backup files
- Managing backup retention policies

**Example usage:**
```python
# Upload a backup to Google Drive
backup = drive_service.upload_backup(
    file_path="/path/to/backup.tar.gz",
    description="Nightly database backup"
)

# List all backups
backups = drive_service.list_backups()

# Clean up old backups
result = drive_service.cleanup_old_backups(retention_days=30)
```

**Security Note:** This scope only grants access to files created by this application, not to the user's entire Drive. This is the most restrictive Drive scope available while still allowing backup functionality.

#### 2. `https://www.googleapis.com/auth/drive.metadata.readonly`
**Purpose:** Read file metadata and storage quota information  
**Used for:**
- Checking available storage space
- Monitoring Drive usage
- Displaying storage information in dashboard
- Validating backup operations before upload

**Example usage:**
```python
# Get storage quota information
storage = drive_service.get_storage_info()
# Returns: {'limit': 15GB, 'usage': 5GB, 'usageInDrive': 5GB}
```

---

## Scope Validation and Security

### Principle of Least Privilege
All scopes follow the principle of least privilege:
- Only request scopes that are actively used
- Use read-only scopes when write access is not needed
- Prefer narrower scopes (e.g., `drive.file` over `drive`)

### Token Management
- Tokens are managed by Replit's connector system
- Tokens are cached in Redis with 55-minute TTL (5-minute buffer before expiry)
- Proactive token refresh occurs when tokens expire within 5 minutes
- Failed token refresh triggers user notification to reconnect

### Error Handling
The integration handles various OAuth-related errors:

1. **401 Unauthorized (Expired/Revoked Token)**
   - User-friendly message: "Your Google [Service] connection has expired or been revoked. Please reconnect your account in Settings."
   - Automatic retry with token refresh
   - Notification to user if refresh fails

2. **403 Forbidden (Insufficient Permissions)**
   - User-friendly message: "Insufficient permissions for Google [Service]. Please reconnect your account and grant [Scope] access."
   - No automatic retry (requires user action)
   - Clear guidance on what permissions are needed

3. **429 Rate Limit Exceeded**
   - User-friendly message: "Google [Service] rate limit exceeded. Please try again in [X] seconds."
   - Automatic retry with exponential backoff
   - Respects Retry-After header from Google

4. **Network Errors**
   - User-friendly message: "Unable to connect to Google [Service]. Please check your internet connection and try again."
   - Automatic retry up to 3 times
   - Exponential backoff between retries

## Testing OAuth Scopes

### Verify Scopes Are Sufficient
```python
# Test all Google service connections
from services.google.orchestrator import google_orchestrator

status = google_orchestrator.get_status()
print(f"Overall status: {status['overall_status']}")
for service_name, service_status in status['services'].items():
    print(f"{service_name}: {'✓' if service_status['connected'] else '✗'}")
```

### Test Individual Services
```python
# Test calendar service
calendars = calendar_service.list_calendars()
print(f"Calendar access: {len(calendars)} calendars found")

# Test gmail service
result = gmail_service.send_email(
    to="test@example.com",
    subject="Test Email",
    body="Testing Gmail integration"
)
print(f"Gmail send: {'✓' if result else '✗'}")

# Test drive service
storage = drive_service.get_storage_info()
print(f"Drive access: {storage['usage']}/{storage['limit']} bytes used")
```

## Revoking and Reconnecting

### When to Reconnect
Users should reconnect their Google account if they see any of these errors:
- "Your Google [Service] connection has expired"
- "Unable to refresh your Google [Service] connection"
- "Google [Service] is not connected"
- "Insufficient permissions"

### How to Reconnect
1. Go to Dashboard Settings
2. Navigate to Google Services section
3. Click "Reconnect" for the affected service
4. Authorize the requested scopes
5. Verify connection is successful

### Scope Changes
If scopes are added or modified:
1. Update `REQUIRED_SCOPES` in `google_client.py`
2. Update this documentation
3. Users may need to reconnect to grant new permissions
4. Send notification to affected users about required reconnection

## Compliance and Privacy

### Data Usage
- Calendar data: Only accessed for automation triggers, never stored permanently
- Gmail: Only used for sending notifications, email content never accessed
- Drive: Only accesses files created by this application

### Data Retention
- OAuth tokens: Cached in Redis for 55 minutes, then refreshed
- No user data is permanently stored except:
  - Calendar automation rules (user-configured)
  - Email notification preferences (user-configured)
  - Backup metadata (for backup management)

### Third-Party Access
- All OAuth flows go through Replit's connector system
- No direct handling of OAuth credentials in application code
- Tokens are never logged or exposed in error messages

## Troubleshooting

### Common Issues

**Issue: "Google [Service] is not connected"**
- Cause: User hasn't connected the service yet
- Solution: Connect the service in dashboard settings

**Issue: "Your Google [Service] connection has expired"**
- Cause: OAuth token expired and refresh failed
- Solution: Reconnect the service in dashboard settings

**Issue: "Insufficient permissions"**
- Cause: Required scopes not granted or revoked
- Solution: Reconnect and ensure all scopes are authorized

**Issue: "Rate limit exceeded"**
- Cause: Too many API requests in short timeframe
- Solution: Wait for rate limit to reset (usually 60 seconds)

### Debug Mode
To enable detailed OAuth logging:
```python
import logging
logging.getLogger('services.google').setLevel(logging.DEBUG)
```

This will show:
- Token fetch attempts
- Token expiry times
- Proactive refresh triggers
- Detailed error information

## References

- [Google Calendar API Scopes](https://developers.google.com/calendar/api/guides/auth)
- [Gmail API Scopes](https://developers.google.com/gmail/api/auth/scopes)
- [Google Drive API Scopes](https://developers.google.com/drive/api/guides/api-specific-auth)
- [OAuth 2.0 Best Practices](https://tools.ietf.org/html/rfc6819)
