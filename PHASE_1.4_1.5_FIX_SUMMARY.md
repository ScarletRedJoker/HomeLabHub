# Phase 1.4 & 1.5 Fix Summary

**Date**: November 19, 2025  
**Task**: Fix Home Assistant template errors and Celery worker path issues

## Problems Identified

### Problem 1: Home Assistant Template Errors
- **Error**: `Template variable warning: 'dict object' has no attribute 'status'`
- **Location**: Jarvis Status sensor in `config/homeassistant/configuration.yaml`
- **Root Cause**: API returns `{success: true, data: {status: "active", ...}}` but template tried to access `value_json.status` instead of `value_json.data.status`

### Problem 2: Celery Worker Path Issues
- **Errors**:
  - `Compose file not found: docker-compose.unified.yml`
  - `Caddyfile not found: Caddyfile`
  - `.env file not found: .env`
- **Root Cause**: Celery worker container couldn't access configuration files because they weren't mounted and no environment variables were set for their paths

## Solutions Implemented

### ✅ Fix 1: Home Assistant Configuration
**File**: `config/homeassistant/configuration.yaml`

**Changes**:
```yaml
# Before (Lines 86-98)
sensor:
  - platform: rest
    name: "Jarvis Status"
    resource: "http://homelab-dashboard:5000/api/jarvis/status"
    scan_interval: 30
    headers:
      X-API-Key: "!secret jarvis_api_key"
    json_attributes:
      - active_deployments
      - pending_builds
      - ssl_certificates
      - total_projects
    value_template: '{{ value_json.status }}'

# After (Lines 89-103)
sensor:
  - platform: rest
    name: "Jarvis Status"
    resource: "http://homelab-dashboard:5000/api/jarvis/status"
    scan_interval: 30
    headers:
      X-API-Key: "!secret jarvis_api_key"
    json_attributes_path: "$.data"  # ← NEW: Navigate to data object
    json_attributes:
      - active_deployments
      - pending_builds
      - ssl_certificates
      - total_projects
    value_template: '{{ value_json.data.status if value_json.data is defined else "unknown" }}'  # ← FIXED
    availability: '{{ value_json.success is defined and value_json.success }}'  # ← NEW
```

**Benefits**:
- Properly accesses nested JSON response structure
- Safe navigation prevents template errors if data is missing
- Checks API success status for sensor availability

---

### ✅ Fix 2: Celery Worker Volume Mounts
**File**: `docker-compose.unified.yml`

**Changes** (Lines 122-158):
```yaml
homelab-celery-worker:
  # ... existing config ...
  environment:
    # ... existing vars ...
    - COMPOSE_FILE=/docker-compose.unified.yml      # ← NEW
    - CADDYFILE_PATH=/Caddyfile                     # ← NEW
    - ENV_FILE=/.env                                # ← NEW
  volumes:
    - ./services/dashboard:/app
    - /var/run/docker.sock:/var/run/docker.sock
    - ./services/dashboard/logs:/app/logs
    - ./docker-compose.unified.yml:/docker-compose.unified.yml:ro  # ← NEW
    - ./Caddyfile:/Caddyfile:ro                                    # ← NEW
    - ./.env:/.env:ro                                              # ← NEW
```

**Benefits**:
- Celery worker can now access all configuration files
- Read-only mounts prevent accidental modifications
- Environment variables provide explicit paths

---

### ✅ Fix 3: Manager Classes Environment Variable Support
**Files Modified**:
1. `services/dashboard/services/caddy_manager.py`
2. `services/dashboard/services/compose_manager.py`
3. `services/dashboard/services/env_manager.py`

#### CaddyManager (Line 31-32)
```python
# Before
def __init__(self, caddyfile_path: str = 'Caddyfile'):
    self.caddyfile_path = caddyfile_path

# After
def __init__(self, caddyfile_path: Optional[str] = None):
    self.caddyfile_path = caddyfile_path or os.getenv('CADDYFILE_PATH', 'Caddyfile')
```

#### ComposeManager (Line 21-22)
```python
# Before
def __init__(self, compose_file_path: str = 'docker-compose.unified.yml'):
    self.compose_file_path = compose_file_path

# After
def __init__(self, compose_file_path: Optional[str] = None):
    self.compose_file_path = compose_file_path or os.getenv('COMPOSE_FILE', 'docker-compose.unified.yml')
```

#### EnvManager (Line 21-22)
```python
# Before
def __init__(self, env_file_path: str = '.env'):
    self.env_file_path = env_file_path

# After
def __init__(self, env_file_path: Optional[str] = None):
    self.env_file_path = env_file_path or os.getenv('ENV_FILE', '.env')
```

**Benefits**:
- Flexible path configuration via environment variables
- Falls back to default paths when env vars not set
- Works seamlessly in both container and host environments

---

## Validation

### ✅ Code Quality Checks
- **LSP Diagnostics**: No errors in any modified Python files
- **Type Annotations**: All modified functions maintain proper type hints
- **Backward Compatibility**: Default values preserved for non-container environments

### ✅ Expected Results
After these fixes:
1. ✅ Home Assistant will stop showing template warnings
2. ✅ Celery worker will successfully load configuration files
3. ✅ Path-related errors will be eliminated from logs
4. ✅ All manager classes will work in both container and host environments

---

## Next Steps (For Production Deployment)

### 1. Restart Services
```bash
# Restart Home Assistant to apply configuration changes
docker restart homeassistant

# Restart Celery worker with new volumes and environment variables
docker-compose -f docker-compose.unified.yml up -d homelab-celery-worker
```

### 2. Verify Fixes
```bash
# Check Home Assistant logs (should see no template warnings)
docker logs homeassistant | grep -i "template variable warning"

# Check Celery worker logs (should see no file not found errors)
docker logs homelab-celery-worker | grep -i "not found"

# Verify files are accessible in Celery worker
docker exec homelab-celery-worker ls -la /docker-compose.unified.yml /Caddyfile /.env
```

### 3. Monitor
- Watch Home Assistant logs for 5-10 minutes to confirm no template errors
- Check Celery worker can process tasks that require config file access
- Verify Jarvis Status sensor shows correct data in Home Assistant UI

---

## Technical Details

### API Response Structure
The Jarvis Status API returns:
```json
{
  "success": true,
  "data": {
    "status": "active",
    "active_deployments": 5,
    "pending_builds": 2,
    "ssl_certificates": 12,
    "total_projects": 18
  }
}
```

### File Paths in Container
- **Dashboard Container**: Files at `/app/docker-compose.unified.yml`, `/app/Caddyfile`, `/app/.env`
- **Celery Worker Container**: Files at `/docker-compose.unified.yml`, `/Caddyfile`, `/.env`
- **Reason for Difference**: Celery mounts files at root to avoid path conflicts with app code

---

## Files Modified

1. ✅ `config/homeassistant/configuration.yaml` - Fixed sensor template
2. ✅ `docker-compose.unified.yml` - Added volume mounts and env vars to Celery worker
3. ✅ `services/dashboard/services/caddy_manager.py` - Environment variable support
4. ✅ `services/dashboard/services/compose_manager.py` - Environment variable support
5. ✅ `services/dashboard/services/env_manager.py` - Environment variable support

---

## Summary

All fixes have been successfully implemented:
- **Problem 1**: ✅ Fixed Home Assistant template to properly access nested JSON
- **Problem 2**: ✅ Added volume mounts and environment variables to Celery worker
- **Bonus**: ✅ Updated manager classes for flexible path configuration

The changes are backward compatible, type-safe, and ready for production deployment.
