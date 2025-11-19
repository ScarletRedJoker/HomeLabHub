# Feature Implementation Status

## 🎯 Project Overview

Implementing 5 major feature modules with production-ready deployment for Ubuntu 25.10 homelab.

**Total Scope:** ~15-20 new files, 2000+ lines of code across services, routes, workers, templates, and scripts.

---

## ✅ Phase 1: Core Infrastructure (COMPLETED)

### 1. Database Schema ✅
**File:** `services/dashboard/alembic/versions/006_feature_expansion.py`

Created 9 new tables:
- `plex_import_jobs` - Media import job tracking
- `plex_import_items` - Individual file tracking
- `service_telemetry` - Container metrics and health
- `storage_metrics` - Disk usage tracking
- `storage_alerts` - Alert thresholds
- `game_sessions` - Streaming session logs
- `sunshine_hosts` - Game streaming hosts
- `db_credentials` - Database connection management (encrypted)
- `db_backup_jobs` - Backup job tracking

**Status:** Ready to deploy with `alembic upgrade head`

### 2. Model Classes ✅
Created 5 model files with SQLAlchemy classes:

1. **`models/plex.py`** - PlexImportJob, PlexImportItem
2. **`models/service_ops.py`** - ServiceTelemetry  
3. **`models/storage.py`** - StorageMetric, StorageAlert
4. **`models/gaming.py`** - GameSession, SunshineHost
5. **`models/db_admin.py`** - DBCredential, DBBackupJob

**Status:** All models include `to_dict()` serialization and follow existing patterns

### 3. Configuration ✅
**File:** `services/dashboard/config.py`

Added new environment variables:
```python
# Plex
PLEX_URL, PLEX_TOKEN, PLEX_MEDIA_PATH
PLEX_MOVIES_PATH, PLEX_TV_PATH, PLEX_MUSIC_PATH

# Game Streaming
SUNSHINE_HOST, SUNSHINE_PORT, SUNSHINE_API_KEY
SUNSHINE_AUTO_DISCOVER

# Database Admin
DB_ADMIN_ALLOWED_HOSTS, DB_BACKUP_RETENTION_DAYS
DB_BACKUP_SCHEDULE

# Monitoring
TELEMETRY_COLLECTION_INTERVAL  
STORAGE_SCAN_INTERVAL
STORAGE_ALERT_THRESHOLD
```

**Status:** Config ready, `.env` template needs update

---

## 🚧 Phase 2: Feature Modules (PENDING)

### Feature 1: Plex Media Import 📽️

**Components to Build:**
- ✅ Models (PlexImportJob, PlexImportItem)
- ⏳ Service (`services/plex_service.py`)
  - Upload video files to MinIO
  - Detect movie vs TV show
  - Parse filename for metadata (title, year, season, episode)
  - Move files to Plex directories
  - Trigger Plex library scan via API
- ⏳ Routes (`routes/plex_routes.py`)
  - `POST /api/plex/import` - Upload media
  - `GET /api/plex/jobs` - List import jobs
  - `GET /api/plex/jobs/<id>` - Get job status
  - `POST /api/plex/scan` - Trigger library scan
- ⏳ Worker (`workers/plex_worker.py`)
  - Celery task: Process import queue
  - Celery task: Move files to Plex directories
  - Celery task: Call Plex API to refresh libraries
- ⏳ Frontend (`templates/plex_import.html`)
  - Drag & drop upload interface
  - Type selection (Movie/TV/Music)
  - Progress tracking
  - Job history

**Estimated Lines:** ~800 lines

---

### Feature 2: Service Quick Actions ⚡

**Components to Build:**
- ✅ Models (ServiceTelemetry)
- ⏳ Service (`services/service_ops.py`)
  - Collect container stats (CPU, memory, network)
  - Docker event subscriber
  - Health check executor
  - Restart service command
- ⏳ Routes (`routes/service_ops_routes.py`)
  - `GET /api/services/status` - All service status
  - `POST /api/services/<name>/restart` - Restart service
  - `GET /api/services/<name>/logs` - Recent logs
  - `GET /api/services/<name>/stats` - Resource usage
  - `GET /api/services/<name>/history` - Status history (24h)
- ⏳ WebSocket Handler
  - Real-time telemetry push
  - Status change notifications
- ⏳ Worker (`workers/telemetry_worker.py`)
  - Celery beat: Collect metrics every 30s
  - Store in service_telemetry table
- ⏳ Frontend (`templates/service_actions.html`)
  - Service cards with quick actions
  - Real-time status updates
  - Resource usage charts (Chart.js)
  - Last 50 log lines

**Estimated Lines:** ~900 lines

---

### Feature 3: Disk Space Monitoring 💾

**Components to Build:**
- ✅ Models (StorageMetric, StorageAlert)
- ⏳ Service (`services/storage_monitor.py`)
  - Scan Plex directories (Movies, TV, Music)
  - Query PostgreSQL database sizes
  - Check Docker volumes
  - Check MinIO buckets
  - Calculate growth trends
- ⏳ Routes (`routes/storage_routes.py`)
  - `GET /api/storage/metrics` - Current usage
  - `GET /api/storage/trends` - Historical data
  - `GET /api/storage/alerts` - Alert config
  - `POST /api/storage/alerts` - Update thresholds
- ⏳ Worker (`workers/storage_worker.py`)
  - Celery beat: Collect storage metrics hourly
  - Check alert thresholds
  - Send notifications when >80% full
- ⏳ Frontend (`templates/storage.html`)
  - Pie charts (Chart.js) for space breakdown
  - Line chart for growth trends
  - Alert configuration UI
  - Quick cleanup suggestions

**Estimated Lines:** ~700 lines

---

### Feature 4: Game Streaming Enhancement 🎮

**Components to Build:**
- ✅ Models (GameSession, SunshineHost)
- ⏳ Service (`services/game_streaming_service.py`)
  - Auto-discover Windows KVM (ARP scan)
  - Sunshine API client
  - Pairing flow management
  - Session tracking
  - Diagnostics runner
- ⏳ Routes (`routes/game_streaming_routes.py`)
  - `GET /api/gaming/hosts` - List available hosts
  - `POST /api/gaming/hosts/discover` - Auto-discover
  - `POST /api/gaming/pair` - Initiate pairing
  - `GET /api/gaming/sessions` - Active sessions
  - `POST /api/gaming/diagnostics` - Run tests
- ⏳ Worker (`workers/gaming_worker.py`)
  - Celery task: Host discovery
  - Celery task: Sunshine health check
  - Celery task: Session monitoring
- ⏳ Frontend (enhance `templates/game_streaming.html`)
  - Host auto-discovery UI
  - One-click pairing flow
  - Quick launch buttons
  - Diagnostics panel
  - Performance metrics

**Estimated Lines:** ~800 lines

---

### Feature 5: Database Management 🗄️

**Components to Build:**
- ✅ Models (DBCredential, DBBackupJob)
- ⏳ Service (`services/db_admin_service.py`)
  - Password encryption/decryption
  - Connection testing
  - User creation/reset
  - Backup execution (pg_dump)
  - Restore from backup
  - Schema migration runner
- ⏳ Routes (`routes/db_admin_routes.py`)
  - `GET /api/databases` - List databases
  - `POST /api/databases/test` - Test connection
  - `POST /api/databases/<name>/password` - Reset password
  - `POST /api/databases/<name>/backup` - Create backup
  - `POST /api/databases/<name>/restore` - Restore backup
  - `GET /api/databases/backups` - List backups
- ⏳ Worker (`workers/db_admin_worker.py`)
  - Celery task: Backup execution
  - Celery task: Restore execution
  - Celery beat: Scheduled backups (2 AM daily)
- ⏳ Frontend (`templates/db_management.html`)
  - Database list with connection status
  - Password management UI
  - Backup/restore interface
  - Backup history table

**Estimated Lines:** ~850 lines

---

## 🔧 Phase 3: Deployment Automation (PENDING)

### Update Setup Scripts

**1. homelab-manager.sh**
Add menu options:
```bash
12a) Run Plex Import
12b) View Service Quick Actions
12c) Check Disk Space
12d) Game Streaming Setup
12e) Database Management
```

**2. homelab-lifecycle-diagnostics.sh**
Add checks:
- Plex import queue health
- Storage alert thresholds
- Service telemetry collection
- Game streaming host availability
- Database backup status

**3. .env Template**
Add all new environment variables with documentation

**4. docker-compose.unified.yml** (if needed)
- Mount Plex media directories
- Expose ports for Sunshine proxy (optional)

**Estimated Lines:** ~400 lines across scripts

---

## 📋 Implementation Plan

### Recommended Approach: Parallel Subagent Delegation

Given the massive scope (5 features × ~800 lines each = ~4000 lines total), I recommend:

1. **Delegate each feature to a subagent** for parallel implementation
2. **Each subagent delivers:**
   - Complete service layer
   - Complete routes/API
   - Complete Celery workers
   - Complete frontend template
   - Integration tests
3. **I coordinate:**
   - Database migrations (DONE)
   - Model classes (DONE)
   - Configuration (DONE)
   - Final integration
   - Deployment scripts
   - Testing & validation

### Estimated Timeline
- **Phase 1:** Core Infrastructure - ✅ COMPLETE
- **Phase 2:** Feature Modules (parallel) - 🕒 2-3 hours per feature
- **Phase 3:** Deployment Scripts - 🕒 1 hour
- **Phase 4:** End-to-end Testing - 🕒 1 hour

**Total: ~10-15 hours for complete implementation**

---

## ❓ Question for You

Which approach do you prefer?

**Option A: Parallel Implementation (Recommended)**
- I delegate all 5 features to subagents simultaneously
- Fastest delivery (all features done together)
- You get everything at once

**Option B: Sequential Implementation**
- Implement features one-by-one
- You can test each feature as it's completed
- Slower but more iterative

**Option C: Priority Subset**
- Implement only top 3 features first (Plex, Service Actions, Storage)
- Ship to production
- Add remaining 2 features later

Let me know which you prefer!
