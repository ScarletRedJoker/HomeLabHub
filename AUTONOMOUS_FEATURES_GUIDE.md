# 🤖 Autonomous Homelab Management System

**Status:** ✅ Fully Operational  
**Version:** 1.0.0  
**Last Updated:** November 19, 2025

---

## Overview

Your Nebula Command Dashboard now features a **fully autonomous AI-driven management system** that continuously monitors, optimizes, and secures your homelab infrastructure with minimal human intervention.

### What "Autonomous" Means

The system operates in a continuous loop:
1. **Monitor** - Constantly check all services, containers, databases, network, and security
2. **Analyze** - Use AI agents to diagnose issues and identify optimization opportunities  
3. **Decide** - Create tasks for remediation, optimization, or security improvements
4. **Request Approval** - For destructive actions, the system asks for your permission
5. **Execute** - Perform approved actions automatically
6. **Report** - Log everything and provide summaries

**The system never stops working unless there's nothing left to do!**

---

## 🎯 Core Features

### 1. Autonomous Monitoring & Self-Healing
**Service:** `AutonomousMonitor`  
**Schedule:** Every 5 minutes + Health check every 2 minutes

**What it does:**
- ✅ Monitors Docker container health (healthy, unhealthy, stopped, restarting)
- ✅ Checks database connections and performance
- ✅ Tests network connectivity and DNS resolution
- ✅ Monitors disk space usage
- ✅ **Self-healing:** Automatically restarts containers that exit cleanly (exit code 0)
- ✅ Creates tasks for complex issues requiring AI agent intervention

**Self-Healing Examples:**
- Container crashes → Automatically restarts if safe (clean exit)
- Database connection fails → Creates task for Database Agent (Athena) to diagnose
- Network timeout → Creates task for Network Agent (Mercury) to investigate
- Disk 90%+ full → Creates cleanup task with storage recommendations

**Health Check Dashboard:**
```
GET /api/health/system-summary
{
  "container_health": {"healthy": 12, "unhealthy": 1, "stopped": 0, "restarting": 0},
  "database_health": {"connected": true, "latency_ms": 15},
  "network_health": {"external_reachable": true, "dns_functional": true},
  "disk_status": {"usage_percent": 65, "available_gb": 150},
  "issues_found": 3,
  "tasks_created": 2
}
```

---

### 2. Continuous Optimization
**Service:** `ContinuousOptimizer`  
**Schedule:** Every 30 minutes

**What it does:**
- 📊 Analyzes container resource usage (CPU, memory, network, disk I/O)
- 📊 Identifies over-provisioned containers (wasting resources)
- 📊 Identifies under-provisioned containers (performance limited)
- 📊 Monitors database query performance and suggests index creation
- 📊 Detects slow queries and recommends optimization
- 📊 Analyzes disk space and identifies cleanup opportunities
- 📊 Checks for outdated Docker images and suggests updates
- 📊 Tracks performance trends over time

**Optimization Task Examples:**
- "Container 'homelab-dashboard' using only 10% of allocated 2GB memory → Reduce to 512MB"
- "Database query 'SELECT * FROM agents WHERE...' is slow → Add index on 'status' column"
- "45GB of old Docker images detected → Run cleanup to free space"
- "Container 'stream-bot' using 'openai:1.0' but version 1.5 available → Consider updating"

**Efficiency Report (Daily at 2 AM):**
```json
{
  "resource_usage_trends": {
    "current_efficiency": 78,
    "average_efficiency": 82,
    "trend": "declining"
  },
  "optimization_opportunities": [
    "Reduce memory for homelab-celery-worker (over-provisioned)",
    "Add database index on agents.status for faster queries"
  ],
  "savings_potential": {
    "memory_mb": 1536,
    "storage_gb": 45,
    "estimated_monthly_cost": "$12"
  }
}
```

---

### 3. Autonomous Security Monitoring
**Service:** `AutonomousSecurity`  
**Schedule:** Every hour + Security summary daily at 3 AM

**What it does:**
- 🔒 Scans all running containers for known vulnerabilities
- 🔒 Monitors SSL certificate expiration (warns 30 days before expiry)
- 🔒 Tracks failed authentication attempts (detects brute force attacks)
- 🔒 Scans for exposed ports that shouldn't be public
- 🔒 Calculates overall security score (0-100)
- 🔒 Classifies security level (Excellent, Good, Warning, Critical)
- 🔒 Creates remediation tasks for security issues

**Security Scoring:**
- **100 points** = Perfect security
- **-20 per critical vulnerability** found in containers
- **-10 per expired certificate**
- **-5 per certificate expiring soon** (< 30 days)
- **-15 if failed login attempts** exceed threshold
- **-10 per unexpectedly exposed port**

**Security Levels:**
- **90-100:** Excellent 🟢
- **70-89:** Good 🟡
- **50-69:** Warning 🟠
- **<50:** Critical 🔴

**Security Summary:**
```json
{
  "vulnerabilities_found": 2,
  "vulnerable_containers": ["stream-bot"],
  "certificates_expiring": 1,
  "certificates_expired": 0,
  "failed_logins": 45,
  "suspicious_authentication": true,
  "open_ports": [8123, 9000],
  "security_score": 65,
  "security_level": "warning"
}
```

**Remediation Tasks:**
- "Container 'stream-bot' has 2 vulnerabilities → Update to latest image"
- "SSL certificate for 'host.evindrake.net' expires in 25 days → Renew certificate"
- "45 failed login attempts from IP 192.168.1.50 → Consider blocking IP"

---

## 🤖 Multi-Agent Collaboration System

### Agent Swarm

Your system has 5 specialized AI agents that work together:

#### 1. **Jarvis Prime** (Orchestrator)
- **Role:** Master AI that coordinates everything
- **Model:** GPT-5
- **Capabilities:** Task delegation, decision-making, synthesis, planning
- **Prompt Focus:** Analyze problems, delegate to specialists, synthesize findings, ensure safety

#### 2. **Athena** (Database Specialist)
- **Role:** PostgreSQL expert
- **Model:** GPT-5
- **Capabilities:** Database health, query optimization, connection repair, migrations
- **Prompt Focus:** Root cause analysis, SQL diagnostics, performance tuning

#### 3. **Mercury** (Network Specialist)
- **Role:** Connectivity and DNS expert
- **Model:** GPT-5
- **Capabilities:** Network diagnosis, DNS analysis, SSL monitoring, connectivity testing
- **Prompt Focus:** TCP/IP, DNS resolution, certificate validation, packet routing

#### 4. **Atlas** (Container Specialist)
- **Role:** Docker and container expert
- **Model:** GPT-5
- **Capabilities:** Container health, resource optimization, log analysis, networking
- **Prompt Focus:** Container status, resource usage, restart loops, image troubleshooting

#### 5. **Sentinel** (Security Specialist)
- **Role:** Security and vulnerability expert
- **Model:** GPT-5
- **Capabilities:** Vulnerability scanning, intrusion detection, security audits, compliance
- **Prompt Focus:** CVE analysis, security best practices, incident response, hardening

### How Agents Collaborate

```
User reports: "My database is slow"
         ↓
    Jarvis Prime analyzes
         ↓
Delegates to Athena (Database) and Atlas (Container)
         ↓
Athena: "Queries are unoptimized, missing index on 'status' column"
Atlas: "Database container has CPU throttling, needs more resources"
         ↓
    Jarvis Prime synthesizes
         ↓
Creates tasks: 
  1. Add database index (approved automatically)
  2. Increase container CPU limit (requires approval)
         ↓
Executes approved actions
         ↓
Reports results to user
```

### Agent Communication

All agent-to-agent conversations are logged in the `agent_conversations` table:
- **from_agent_id** - Which agent is speaking
- **to_agent_id** - Which agent is being consulted
- **message** - The actual consultation/response
- **message_type** - consultation, delegation, synthesis, etc.
- **task_id** - Which task they're collaborating on

You can view agent conversations in the Jarvis dashboard to see how they're working together!

---

## 📋 Task System

### Task States

Every task created by the autonomous system goes through these states:

1. **pending** - Task created, waiting to be assigned
2. **in_progress** - Agent is currently working on it
3. **waiting** - Waiting for approval or additional information
4. **completed** - Successfully finished
5. **failed** - Execution failed (with error details)

### Task Approval Workflow

For **safe, automatic actions** (requires_approval=False):
```
Monitor detects issue → Creates task → Agent executes → Reports result
```

For **destructive or risky actions** (requires_approval=True):
```
Monitor detects issue → Creates task → **Waits for approval** → Agent executes → Reports result
```

### Approval API Endpoints

**Get Pending Tasks (requiring approval):**
```bash
GET /api/agents/tasks/pending

Response:
[
  {
    "id": 123,
    "description": "Increase CPU limit for homelab-dashboard from 1 to 2 cores",
    "task_type": "resource_optimization",
    "priority": 5,
    "requires_approval": true,
    "approved": false,
    "created_at": "2025-11-19T10:30:00Z"
  }
]
```

**Approve a Task:**
```bash
POST /api/agents/tasks/123/approve
Body: {
  "approved_by": "Evin",
  "notes": "Approved - dashboard has been slow lately"
}

Response:
{
  "success": true,
  "message": "Task approved and queued for execution"
}
```

**Reject a Task:**
```bash
POST /api/agents/tasks/123/reject
Body: {
  "rejected_by": "Evin",
  "reason": "Not necessary right now, monitoring for a few more days"
}

Response:
{
  "success": true,
  "message": "Task rejected"
}
```

**Check Task Status:**
```bash
GET /api/agents/tasks/123/status

Response:
{
  "id": 123,
  "status": "completed",
  "result": {
    "success": true,
    "details": "CPU limit increased successfully, container restarted"
  },
  "execution_log": [
    {"timestamp": "2025-11-19T10:31:00Z", "action": "validated_request"},
    {"timestamp": "2025-11-19T10:31:05Z", "action": "updated_compose_file"},
    {"timestamp": "2025-11-19T10:31:10Z", "action": "restarted_container"},
    {"timestamp": "2025-11-19T10:31:15Z", "action": "verified_health"}
  ]
}
```

---

## ⏰ Autonomous Schedules

The system runs these background jobs continuously:

| Task | Frequency | Purpose |
|------|-----------|---------|
| **health_check** | Every 2 minutes | Quick container/database health check |
| **autonomous_monitoring** | Every 5 minutes | Full system scan + self-healing |
| **continuous_optimization** | Every 30 minutes | Resource analysis + optimization suggestions |
| **security_scan** | Every 1 hour | Vulnerability scan + SSL check |
| **efficiency_report** | Daily at 2:00 AM | Comprehensive optimization report |
| **security_summary** | Daily at 3:00 AM | Comprehensive security posture report |

All tasks run in the **`autonomous`** Celery queue for isolation from user-triggered tasks.

---

## 🎛️ Configuration

### Enabling/Disabling Autonomous Features

All autonomous features are **enabled by default**. To disable:

**Option 1: Environment Variables**
```bash
# In your .env file
AUTONOMOUS_MONITORING_ENABLED=false
AUTONOMOUS_OPTIMIZATION_ENABLED=false
AUTONOMOUS_SECURITY_ENABLED=false
```

**Option 2: Celery Beat Configuration**
Edit `services/dashboard/celery_app.py` and comment out the periodic tasks you don't want.

### Adjusting Schedules

Edit `services/dashboard/celery_app.py`:
```python
'autonomous-monitoring': {
    'task': 'workers.celery_tasks.autonomous_monitoring_task',
    'schedule': crontab(minute='*/10'),  # Changed from 5 to 10 minutes
}
```

### Tuning Approval Requirements

Edit the autonomous services to adjust which actions require approval:

**In autonomous_monitor.py:**
```python
# Make container restarts require approval
task_context = {
    'requires_approval': True,  # Changed from False
    'action': 'restart_container',
    'container': container_name
}
```

---

## 📊 Monitoring the Autonomous System

### Dashboard Views

1. **System Health Dashboard** - Real-time health metrics
2. **Agent Activity** - See what agents are working on
3. **Pending Tasks** - Tasks waiting for your approval
4. **Task History** - Completed tasks with results
5. **Agent Conversations** - See how agents collaborate
6. **Security Score** - Current security posture
7. **Optimization Trends** - Resource efficiency over time

### Logs

All autonomous actions are logged:

```bash
# Dashboard logs (includes orchestrator decisions)
docker logs homelab-dashboard | grep "AutonomousMonitor\|ContinuousOptimizer\|AutonomousSecurity"

# Celery worker logs (includes task execution)
docker logs homelab-celery-worker | grep "autonomous"
```

### Metrics

Key metrics to track:
- **Tasks created per day** - Should be relatively stable
- **Tasks requiring approval** - High percentage = system being cautious (good)
- **Self-healing success rate** - Percentage of issues fixed automatically
- **Security score trend** - Should be 70+ consistently
- **Resource efficiency trend** - Should improve over time

---

## 🚀 Getting Started

### 1. Verify Everything is Running

```bash
# Check containers
docker ps

# Should see:
# - homelab-dashboard (healthy)
# - homelab-celery-worker (healthy)
# - homelab-redis (healthy)

# Check Celery is running autonomous tasks
docker logs homelab-celery-worker | grep "autonomous"
```

### 2. Access Jarvis Dashboard

Visit: **https://host.evindrake.net**

- Go to **"Agent Tasks"** tab to see pending approvals
- Go to **"System Health"** to see current status
- Go to **"Security"** to see security score

### 3. Let the System Run

The autonomous system starts working **immediately**:
- First health check runs 2 minutes after startup
- First monitoring scan runs 5 minutes after startup
- First security scan runs 1 hour after startup
- Daily reports arrive at 2 AM and 3 AM

### 4. Approve Your First Task

When you see a task requiring approval:
1. Review the task description and context
2. If you approve, click "Approve" or use the API
3. Watch the execution log to see it complete
4. Review the result

---

## 🔧 Troubleshooting

### "No autonomous tasks are running"

Check Celery Beat (scheduler) is running:
```bash
docker logs homelab-celery-worker | grep "beat"
```

Restart if needed:
```bash
docker-compose restart homelab-celery-worker
```

### "Tasks are created but never execute"

Check if tasks require approval:
```bash
curl https://host.evindrake.net/api/agents/tasks/pending
```

Approve them via API or dashboard.

### "I see 'ModuleNotFoundError' in Celery logs"

This means Celery can't find the autonomous services. Verify:
```bash
docker exec homelab-celery-worker python -c "from services.dashboard.services.autonomous_monitor import AutonomousMonitor; print('OK')"
```

If this fails, rebuild the container:
```bash
docker-compose build homelab-celery-worker
docker-compose up -d homelab-celery-worker
```

### "Security score is always 100"

This is good! It means no issues were found. To test:
1. Let a certificate expire (wait or manually adjust date)
2. Try multiple failed logins to trigger the threshold
3. Expose a container port publicly

---

## 🎯 Best Practices

### 1. Review Daily Reports

Check the efficiency and security summaries each morning:
- Look for new optimization opportunities
- Review security score trends
- Approve any pending tasks

### 2. Trust the Self-Healing

The system is designed to safely restart containers and fix common issues. Let it work!

Exceptions:
- If you see the same container restarting repeatedly, investigate
- If security score drops below 70, review immediately

### 3. Approve Thoughtfully

When asked to approve a task:
- **Read the description carefully** - What exactly will be changed?
- **Check the context** - Why is this needed?
- **Consider the impact** - Is this a good time for this change?
- **Review the agent's analysis** - Does it make sense?

### 4. Monitor Agent Conversations

Periodically review how agents are collaborating:
- Are they making good decisions?
- Are they consulting the right specialists?
- Are they missing any issues?

This helps you understand your infrastructure better!

### 5. Tune Over Time

As you gain confidence:
- Reduce approval requirements for routine tasks
- Adjust monitoring schedules based on your needs
- Add custom agents for specific workflows

---

## 🌟 Advanced Features

### Creating Custom Agents

You can add your own specialist agents! Example:

```python
from models.agent import Agent, AgentType

custom_agent = Agent(
    agent_type="backup",
    name="Chronos",
    description="Backup and disaster recovery specialist",
    system_prompt="""You are Chronos, the backup specialist.
    Your role is to ensure all data is backed up safely and can be restored.
    
    Your expertise:
    - Backup strategy design
    - Disaster recovery planning
    - Data integrity verification
    - Restore testing
    """,
    capabilities=['backup-automation', 'disaster-recovery', 'data-verification'],
    model='gpt-5'
)
```

### Creating Custom Autonomous Tasks

Add your own monitoring logic:

```python
from services.dashboard.services.autonomous_monitor import AutonomousMonitor

class CustomMonitor(AutonomousMonitor):
    def check_custom_service(self):
        # Your custom monitoring logic
        if custom_condition:
            self._create_task(
                task_type='custom_remediation',
                description='Custom issue detected',
                priority=7,
                agent_type='orchestrator',
                context={
                    'requires_approval': True,
                    'custom_data': your_data
                }
            )
```

### Integrating External Monitoring

Send data to external systems:

```python
# In autonomous_monitor.py, add to run_monitoring():
summary = self.get_system_summary()

# Send to Grafana, Datadog, etc.
send_to_external_monitoring(summary)
```

---

## 📚 Related Documentation

- **Agent Swarm Architecture:** See `services/dashboard/services/agent_orchestrator.py`
- **Task Models:** See `services/dashboard/models/agent.py`
- **API Documentation:** See `services/dashboard/routes/agent_api.py`
- **Celery Configuration:** See `services/dashboard/celery_app.py`

---

## ✅ Success Indicators

You'll know the autonomous system is working well when:

1. ✅ Security score stays above 80
2. ✅ Containers rarely need manual restarts
3. ✅ You receive optimization suggestions regularly
4. ✅ Issues are detected before you notice them
5. ✅ Most tasks complete without requiring approval
6. ✅ Agent conversations show thoughtful problem-solving
7. ✅ Daily reports provide actionable insights

---

## 🎉 Congratulations!

You now have a **cutting-edge autonomous homelab management system** that:
- Never stops monitoring and improving
- Uses AI agents to solve complex problems
- Asks for approval when needed
- Continuously optimizes performance
- Proactively secures your infrastructure
- Reports everything transparently

**Welcome to the future of infrastructure management!** 🚀

---

**Questions or Issues?**  
Review the logs, check the task history, or consult the agent conversations to see what the system is thinking!
