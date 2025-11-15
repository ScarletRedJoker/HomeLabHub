# Jarvis Safety Framework

**Version:** 1.0 (Phase 1)  
**Date:** November 15, 2025  
**Status:** Production Ready

## Executive Summary

The Jarvis Safety Framework is a comprehensive security system that enables autonomous command execution on Ubuntu hosts with proper guardrails, human-in-the-loop approvals, and full audit trails. This framework implements defense-in-depth principles to ensure Jarvis can safely automate infrastructure tasks without compromising system security.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Security Model](#security-model)
3. [Command Whitelist/Blacklist](#command-whitelistblacklist)
4. [Safe Command Executor](#safe-command-executor)
5. [Approval Workflow](#approval-workflow)
6. [Audit Logging](#audit-logging)
7. [Rate Limiting](#rate-limiting)
8. [API Documentation](#api-documentation)
9. [Usage Examples](#usage-examples)
10. [Future Roadmap](#future-roadmap)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Jarvis AI Agent                         │
│              (Voice Commands / ChatBot)                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              SafeCommandExecutor                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  1. Command Validation (Whitelist/Blacklist)        │  │
│  │  2. Risk Level Assessment                            │  │
│  │  3. Rate Limiting Check                              │  │
│  │  4. Approval Requirement Check                       │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                ┌───────┴────────┐
                │                │
                ▼                ▼
        ┌──────────────┐  ┌─────────────────┐
        │  Dry Run     │  │ Approval Queue  │
        │  (Preview)   │  │  (Human Review) │
        └──────────────┘  └────────┬────────┘
                                   │
                            User Approves/Rejects
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  Execute Command     │
                        │  + Audit Logging     │
                        │  + Checkpoint        │
                        └──────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  Structured Result   │
                        │  (stdout/stderr/code)│
                        └──────────────────────┘
```

### Component Architecture

```
services/dashboard/
├── jarvis/
│   ├── safe_executor.py          # Core execution engine
│   ├── command_whitelist.py      # Command validation rules
│   ├── deployment_executor.py    # Docker deployment logic
│   └── artifact_builder.py       # Docker image building
├── models/
│   └── jarvis_action.py          # Approval workflow database model
└── routes/
    └── jarvis_approval_api.py    # REST API for approvals
```

---

## Security Model

### 1. Least-Privilege SSH Access

**Current Implementation (Phase 1):**
- Commands execute in local context (no SSH yet)
- Uses Python `subprocess.run()` with safety constraints
- Shell access is sandboxed through command validation

**Future Implementation (Phase 2):**
- Dedicated SSH user with restricted sudo permissions
- SSH key-based authentication only (no passwords)
- Sudoers file configured with command-specific privileges
- Connection pooling with timeout management

**Example Sudoers Configuration (Phase 2):**
```bash
# /etc/sudoers.d/jarvis
jarvis ALL=(ALL) NOPASSWD: /usr/bin/docker compose up
jarvis ALL=(ALL) NOPASSWD: /usr/bin/docker compose down
jarvis ALL=(ALL) NOPASSWD: /usr/bin/systemctl status *
jarvis ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart *
```

### 2. Defense-in-Depth Layers

1. **Input Validation**: Regex-based pattern matching against whitelist
2. **Risk Assessment**: Automatic classification (SAFE → FORBIDDEN)
3. **Rate Limiting**: 60 commands per minute per user
4. **Approval Gates**: High-risk commands require human approval
5. **Execution Timeouts**: 30-second default timeout
6. **Audit Logging**: Every command logged to persistent storage
7. **Rollback Support**: Checkpoint data stored for recovery

---

## Command Whitelist/Blacklist

### Forbidden Commands (Always Blocked)

These commands are **never allowed** regardless of context:

```python
FORBIDDEN_PATTERNS = [
    r'^rm\s+-rf\s+/',              # Recursive delete from root
    r'^dd\s+if=',                   # Disk write operations
    r'>\s*/dev/sd[a-z]',           # Direct disk writes
    r'mkfs\.',                      # Filesystem formatting
    r'fdisk', 'parted',            # Disk partitioning
    r'shutdown', 'reboot', 'halt', # System power commands
    r'iptables\s+-F',              # Firewall flush
    r'wget.*\|\s*sh',              # Pipe to shell (security risk)
    r'curl.*\|\s*bash',            # Pipe to bash (security risk)
]
```

### Safe Commands (No Approval Required)

**Read-Only Information Gathering:**
```bash
ls, cat, head, tail, pwd, echo, date, whoami
df, free, ps, top, uptime, hostname
docker ps, docker images, docker logs, docker inspect
git status, git log, git diff
```

**Risk Level:** `SAFE`  
**Approval Required:** No  
**Execution:** Immediate

### Medium-Risk Commands (Approval Required)

**Service Management:**
```bash
docker compose up -d
docker compose down
docker start/stop/restart <container>
systemctl restart <service>
mkdir, touch, cp, mv
```

**Risk Level:** `MEDIUM_RISK` or `HIGH_RISK`  
**Approval Required:** Yes  
**Timeout:** 5 minutes for approval

### High-Risk Commands (Approval + Checkpoint)

**Destructive Operations:**
```bash
docker rm, docker rmi, docker volume rm
rm (non-root paths)
git push
systemctl stop <service>
```

**Risk Level:** `HIGH_RISK`  
**Approval Required:** Yes  
**Checkpoint:** Recommended  
**Timeout:** 24 hours for approval

---

## Safe Command Executor

### Features

#### 1. Command Validation
```python
from jarvis import SafeCommandExecutor

executor = SafeCommandExecutor()

# Validate before execution
is_allowed, risk_level, reason, requires_approval = executor.validate_command("docker ps")
# Returns: (True, CommandRiskLevel.SAFE, "Matched: docker ps", False)
```

#### 2. Dry-Run Mode
```python
# Preview what would happen without executing
result = executor.dry_run("docker compose up -d", user="admin")

print(result.to_dict())
# {
#   "success": True,
#   "command": "docker compose up -d",
#   "stdout": "[DRY RUN] Command validation: Matched: docker compose up",
#   "mode": "dry_run",
#   "risk_level": "medium_risk",
#   "requires_approval": True
# }
```

#### 3. Safe Execution
```python
# Execute safe commands immediately
result = executor.execute("ls -la /home/evin/contain", user="admin")

if result.success:
    print(f"Output: {result.stdout}")
else:
    print(f"Error: {result.stderr}")
```

#### 4. Approval-Required Commands
```python
# Attempt to execute high-risk command
result = executor.execute("docker stop my-container", user="admin")

if result.mode == ExecutionMode.APPROVAL_REQUIRED:
    print(f"Action ID: {result.metadata['action_id']}")
    print("Command queued for approval")
```

### ExecutionResult Object

Every command returns a structured `ExecutionResult`:

```python
@dataclass
class ExecutionResult:
    success: bool                    # True if command succeeded
    command: str                     # Original command
    stdout: str                      # Standard output
    stderr: str                      # Standard error
    exit_code: Optional[int]         # Process exit code
    execution_time_ms: float         # Execution time in milliseconds
    risk_level: CommandRiskLevel     # SAFE, MEDIUM_RISK, etc.
    mode: ExecutionMode              # DRY_RUN, EXECUTE, APPROVAL_REQUIRED
    timestamp: datetime              # Execution timestamp
    requires_approval: bool          # Whether approval is needed
    validation_message: str          # Validation details
```

---

## Approval Workflow

### Database Model

**Table:** `jarvis_actions`

```sql
CREATE TABLE jarvis_actions (
    id UUID PRIMARY KEY,
    action_type VARCHAR(50) NOT NULL,  -- COMMAND_EXECUTION, DEPLOYMENT, etc.
    status VARCHAR(20) NOT NULL,       -- PENDING, APPROVED, REJECTED, EXECUTED
    command TEXT,
    description TEXT NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    requested_by VARCHAR(100),
    requested_at TIMESTAMP NOT NULL,
    approved_by VARCHAR(100),
    approved_at TIMESTAMP,
    rejected_by VARCHAR(100),
    rejected_at TIMESTAMP,
    rejection_reason TEXT,
    executed_at TIMESTAMP,
    execution_result JSONB,
    execution_time_ms INTEGER,
    metadata JSONB,
    checkpoint_data JSONB,
    rollback_command TEXT,
    expires_at TIMESTAMP,
    requires_checkpoint BOOLEAN DEFAULT false
);
```

### Workflow States

```
PENDING → APPROVED → EXECUTED ✓
    ↓         ↓
REJECTED  FAILED ✗
    ↓
CANCELLED
```

### Automatic Expiration

Actions in `PENDING` status automatically expire after 24 hours (configurable) to prevent stale approvals.

---

## Audit Logging

### Log Format

**Location:** `/tmp/jarvis_audit.log`

Every command execution creates an audit entry:

```json
{
  "timestamp": "2025-11-15T14:23:45.123456",
  "user": "admin",
  "command": "docker compose up -d",
  "risk_level": "medium_risk",
  "mode": "execute",
  "success": true,
  "exit_code": 0,
  "execution_time_ms": 1234.56,
  "requires_approval": true
}
```

### Retention Policy

- **Audit logs:** Retained for 90 days (configurable)
- **Database actions:** Retained indefinitely for compliance
- **Rotation:** Automatic log rotation at 100MB

---

## Rate Limiting

### Configuration

```python
executor = SafeCommandExecutor(
    max_executions_per_minute=60,  # 60 commands per minute per user
    default_timeout=30              # 30 seconds per command
)
```

### Implementation

- **Sliding window**: Tracks commands in the last 60 seconds
- **Per-user limits**: Separate rate limits for each user
- **Graceful degradation**: Returns error instead of blocking

### Example

```python
# Attempt 61 commands in one minute
for i in range(61):
    result = executor.execute(f"echo {i}")
    if not result.success:
        print(result.stderr)
        # Output: "Rate limit exceeded: 60 executions per minute"
        break
```

---

## API Documentation

### Base URL

```
https://host.evindrake.net/api/jarvis/actions
```

### Authentication

All endpoints require authentication via session cookie or API key:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://host.evindrake.net/api/jarvis/actions/pending
```

### Endpoints

#### 1. Get Pending Actions

```http
GET /api/jarvis/actions/pending
```

**Query Parameters:**
- `limit` (int): Max results (default: 50)
- `offset` (int): Pagination offset (default: 0)
- `action_type` (string): Filter by type

**Response:**
```json
{
  "success": true,
  "data": {
    "actions": [
      {
        "id": "uuid-here",
        "action_type": "COMMAND_EXECUTION",
        "command": "docker compose up -d",
        "description": "Start docker compose services",
        "risk_level": "medium_risk",
        "requested_at": "2025-11-15T14:23:45Z",
        "status": "PENDING"
      }
    ],
    "total": 5,
    "limit": 50,
    "offset": 0
  }
}
```

#### 2. Approve Action

```http
POST /api/jarvis/actions/{action_id}/approve
```

**Request Body:**
```json
{
  "execute_immediately": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "status": "EXECUTED",
    "executed_at": "2025-11-15T14:25:30Z"
  },
  "execution": {
    "stdout": "Container started successfully",
    "exit_code": 0,
    "execution_time_ms": 1234.56
  }
}
```

#### 3. Reject Action

```http
POST /api/jarvis/actions/{action_id}/reject
```

**Request Body:**
```json
{
  "reason": "Not authorized at this time"
}
```

#### 4. Create Action

```http
POST /api/jarvis/actions/create
```

**Request Body:**
```json
{
  "action_type": "COMMAND_EXECUTION",
  "command": "docker compose restart nginx",
  "description": "Restart nginx container",
  "expires_in_hours": 24
}
```

#### 5. Get Statistics

```http
GET /api/jarvis/actions/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 150,
    "pending": 5,
    "approved": 120,
    "rejected": 10,
    "executed": 115,
    "failed": 5
  }
}
```

---

## Usage Examples

### Example 1: Safe Command (Immediate Execution)

```python
from jarvis import SafeCommandExecutor

executor = SafeCommandExecutor()

# List Docker containers (safe command, executes immediately)
result = executor.execute("docker ps", user="admin")

if result.success:
    print("Docker Containers:")
    print(result.stdout)
else:
    print(f"Error: {result.stderr}")
```

### Example 2: Dangerous Command (Blocked)

```python
# Attempt to delete root filesystem (always blocked)
result = executor.execute("rm -rf /", user="hacker")

print(result.success)  # False
print(result.stderr)   # "Command blocked by safety policy: Forbidden command pattern"
print(result.risk_level)  # CommandRiskLevel.FORBIDDEN
```

### Example 3: Approval Workflow

```python
from models import JarvisAction, ActionType, ActionStatus
from models import get_session

# Create action requiring approval
action = JarvisAction(
    action_type=ActionType.COMMAND_EXECUTION,
    command="docker compose up -d my-service",
    description="Deploy my-service container",
    risk_level="medium_risk",
    requested_by="jarvis"
)

with get_session() as session:
    session.add(action)
    session.commit()
    
    print(f"Action created: {action.id}")
    print("Waiting for approval...")

# Later, after human approval via API:
# POST /api/jarvis/actions/{action.id}/approve
```

### Example 4: Dry Run for Testing

```python
# Preview a command without executing
result = executor.dry_run("systemctl restart nginx", user="admin")

print(f"Would execute: {result.command}")
print(f"Risk Level: {result.risk_level.value}")
print(f"Requires Approval: {result.requires_approval}")
print(f"Validation: {result.validation_message}")
```

### Example 5: Rate Limiting

```python
import time

executor = SafeCommandExecutor(max_executions_per_minute=10)

# Execute 15 commands rapidly
for i in range(15):
    result = executor.execute(f"echo 'Test {i}'", user="admin")
    
    if not result.success:
        if "Rate limit exceeded" in result.stderr:
            print(f"Rate limited at command {i}")
            time.sleep(60)  # Wait for rate limit window to reset
        else:
            print(f"Error: {result.stderr}")
```

---

## Checkpoint and Rollback System

### Overview

For high-risk operations, Jarvis can create automatic checkpoints before execution and rollback if needed.

### Implementation (Phase 2)

```python
# Create checkpoint before destructive operation
checkpoint = {
    "container_state": docker_inspect("my-container"),
    "compose_config": read_file("docker-compose.yml"),
    "timestamp": datetime.utcnow()
}

action.checkpoint_data = checkpoint
action.rollback_command = "docker compose up -d my-container"

# If operation fails, automatic rollback
if execution_failed:
    executor.execute(action.rollback_command)
```

---

## Security Best Practices

### 1. Never Trust User Input

All commands pass through regex validation. Even whitelisted commands are checked for malicious patterns.

### 2. Principle of Least Privilege

Commands execute with minimum required permissions. SSH users (Phase 2) have restricted sudo access.

### 3. Audit Everything

Every command is logged with timestamp, user, risk level, and result. Logs are tamper-evident.

### 4. Fail Securely

If validation is uncertain, the command is **blocked by default**. Manual approval required.

### 5. Defense in Depth

Multiple security layers:
- Input validation
- Risk assessment
- Rate limiting
- Approval gates
- Execution timeouts
- Audit logging

---

## Future Roadmap

### Phase 2: SSH Integration (Next Release)

- [ ] SSH connection pooling
- [ ] Dedicated `jarvis` user with restricted sudo
- [ ] Key-based authentication
- [ ] Remote command execution
- [ ] Network isolation

### Phase 3: Advanced Features

- [ ] Machine learning for anomaly detection
- [ ] Automatic rollback on failure
- [ ] Multi-step workflow orchestration
- [ ] Integration with monitoring systems
- [ ] Slack/Discord approval notifications

### Phase 4: Enterprise Features

- [ ] Role-based access control (RBAC)
- [ ] Multi-level approval workflows
- [ ] Compliance reporting (SOC 2, ISO 27001)
- [ ] Integration with SIEM systems
- [ ] Disaster recovery automation

---

## Troubleshooting

### Common Issues

**Issue:** Commands always require approval  
**Solution:** Check command whitelist patterns. Safe commands must match exact patterns.

**Issue:** Rate limiting too aggressive  
**Solution:** Increase `max_executions_per_minute` in SafeCommandExecutor constructor.

**Issue:** Audit log filling disk  
**Solution:** Configure log rotation in `/tmp/jarvis_audit.log` (automatic at 100MB).

**Issue:** Approval actions expiring  
**Solution:** Adjust `expires_in_hours` when creating actions (default: 24 hours).

---

## Support and Contact

For questions or issues with the Jarvis Safety Framework:

- **Documentation:** This file
- **API Reference:** `/api/jarvis/actions` endpoints
- **Source Code:** `services/dashboard/jarvis/`
- **Database Schema:** `services/dashboard/alembic/versions/006_add_jarvis_actions.py`

---

## License

Copyright (c) 2025 Homelab Dashboard Project  
Internal Use Only

---

**Last Updated:** November 15, 2025  
**Version:** 1.0  
**Author:** Jarvis Safety Framework Team
