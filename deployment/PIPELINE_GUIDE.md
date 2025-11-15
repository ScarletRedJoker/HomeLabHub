# Unified CI/CD Deployment Pipeline Guide

<div align="center">

🚀 **Complete Guide to Automated Deployment** 🚀

*Orchestrating Testing, Building, and Deployment for HomeLabHub*

---

[![Pipeline Status](https://img.shields.io/badge/pipeline-automated-success)](#)
[![Documentation](https://img.shields.io/badge/docs-complete-blue)](#)
[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)](#)

</div>

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Pipeline Architecture](#pipeline-architecture)
4. [Installation](#installation)
5. [Usage](#usage)
6. [Pipeline Stages](#pipeline-stages)
7. [Configuration](#configuration)
8. [CI/CD Integration](#cicd-integration)
9. [Environment-Specific Deployments](#environment-specific-deployments)
10. [Rollback Procedures](#rollback-procedures)
11. [Monitoring and Reporting](#monitoring-and-reporting)
12. [Troubleshooting](#troubleshooting)
13. [Best Practices](#best-practices)
14. [FAQ](#faq)
15. [Advanced Topics](#advanced-topics)

---

## 🎯 Overview

The Unified CI/CD Deployment Pipeline automates the entire deployment lifecycle for the HomeLabHub project, ensuring consistent, reliable, and safe deployments across all environments.

### Key Features

✅ **Fully Automated** - From code commit to production deployment  
✅ **Multi-Environment** - Dev, staging, and production support  
✅ **Safety First** - Automatic rollback on failure  
✅ **Comprehensive Testing** - Unit, integration, and smoke tests  
✅ **Security Scanning** - Image vulnerability detection  
✅ **Health Monitoring** - Continuous health checks  
✅ **Detailed Reporting** - HTML and JSON reports  
✅ **CI/CD Integration** - GitHub Actions, GitLab CI ready  

### What the Pipeline Does

The pipeline executes these stages in order:

1. **Validate** → Checks environment, configuration, and prerequisites
2. **Test** → Runs test suites across all services
3. **Build** → Builds and tags Docker images
4. **Deploy** → Deploys services with health checks
5. **Verify** → Post-deployment verification and smoke tests

If any stage fails, the pipeline can automatically rollback to the previous working state.

---

## 🚀 Quick Start

### Prerequisites

- Docker and Docker Compose installed
- Bash 4.0 or higher
- Git repository initialized
- `.env` file configured

### Run Your First Pipeline

```bash
# 1. Navigate to project root
cd /path/to/HomeLabHub

# 2. Make the script executable
chmod +x deployment/unified-pipeline.sh

# 3. Run the pipeline for development
./deployment/unified-pipeline.sh --env dev

# 4. View the results
open deployment/pipeline-report.html
```

That's it! The pipeline will validate, test, build, deploy, and verify your entire application.

---

## 🏗️ Pipeline Architecture

### Stage Flow

```
┌─────────────┐
│   Validate  │  ← Check environment, syntax, resources
└──────┬──────┘
       │ ✓ Pass
       ▼
┌─────────────┐
│    Test     │  ← Run unit, integration, smoke tests
└──────┬──────┘
       │ ✓ Pass
       ▼
┌─────────────┐
│    Build    │  ← Build images, tag, security scan
└──────┬──────┘
       │ ✓ Pass
       ▼
┌─────────────┐
│   Deploy    │  ← Backup, migrate, deploy, health check
└──────┬──────┘
       │ ✓ Pass
       ▼
┌─────────────┐
│   Verify    │  ← Smoke tests, endpoint verification
└──────┬──────┘
       │ ✓ Complete
       ▼
┌─────────────┐
│   Success   │  ← Generate reports, log history
└─────────────┘

       │ ✗ Fail (any stage)
       ▼
┌─────────────┐
│  Rollback   │  ← Automatic rollback to snapshot
└─────────────┘
```

### Component Architecture

```
unified-pipeline.sh              ← Main orchestrator
├── lib-common.sh                ← Shared utilities
├── pipeline-config.yaml         ← Configuration
│
├── Stage Scripts:
│   ├── validate-deployment.sh   ← Validation checks
│   ├── test-deployment.sh       ← Test execution
│   ├── migrate-all.sh           ← Database migrations
│   ├── deploy-with-health-check.sh ← Deployment
│   └── rollback-deployment.sh   ← Rollback logic
│
└── Output:
    ├── pipeline-execution.log   ← Detailed logs
    ├── pipeline-report.html     ← Visual report
    └── pipeline-history.log     ← Historical data
```

---

## 📦 Installation

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/HomeLabHub.git
cd HomeLabHub
```

### Step 2: Set Permissions

```bash
# Make all deployment scripts executable
chmod +x deployment/*.sh
chmod +x homelab-manager.sh
```

### Step 3: Configure Environment

```bash
# Generate .env file if it doesn't exist
./deployment/generate-unified-env.sh

# Edit .env with your configuration
nano .env
```

### Step 4: Verify Installation

```bash
# Run a dry-run to test without making changes
./deployment/unified-pipeline.sh --dry-run --env dev
```

---

## 💻 Usage

### Basic Usage

```bash
# Full pipeline for development
./deployment/unified-pipeline.sh --env dev

# Full pipeline for production
./deployment/unified-pipeline.sh --env production

# Preview changes without executing (dry-run)
./deployment/unified-pipeline.sh --env production --dry-run
```

### Run Specific Stages

```bash
# Run only validation
./deployment/unified-pipeline.sh --stage validate

# Run only tests
./deployment/unified-pipeline.sh --stage test

# Run only build
./deployment/unified-pipeline.sh --stage build

# Run only deployment
./deployment/unified-pipeline.sh --stage deploy
```

### Skip Stages

```bash
# Skip tests (use with caution!)
./deployment/unified-pipeline.sh --env staging --skip-tests

# Skip validation (not recommended)
./deployment/unified-pipeline.sh --env dev --skip-validation

# Skip build (use existing images)
./deployment/unified-pipeline.sh --env dev --skip-build
```

### Advanced Options

```bash
# Build in parallel (faster)
./deployment/unified-pipeline.sh --env dev --parallel-build

# Require manual approval before deploy
./deployment/unified-pipeline.sh --env production --require-approval

# Disable automatic rollback
./deployment/unified-pipeline.sh --env dev --no-rollback

# Push images to registry
./deployment/unified-pipeline.sh --env production --push-images --registry registry.example.com

# Skip security scanning
./deployment/unified-pipeline.sh --env dev --no-security-scan

# Enable debug mode
./deployment/unified-pipeline.sh --env dev --debug
```

### Using the Interactive Manager

```bash
# Launch the homelab manager
./homelab-manager.sh

# Select option 26 - "Run CI/CD Pipeline"
```

---

## 📊 Pipeline Stages

### Stage 1: Validation

**Purpose:** Verify that the environment is ready for deployment

**What it checks:**
- ✅ Docker daemon is running
- ✅ Docker Compose is installed
- ✅ `docker-compose.unified.yml` syntax is valid
- ✅ Required environment variables are set
- ✅ Required ports are available
- ✅ Sufficient disk space
- ✅ Critical files exist
- ✅ Database migration status

**Typical Duration:** 30-60 seconds

**How to run individually:**
```bash
./deployment/unified-pipeline.sh --stage validate
```

**What happens on failure:**
- Pipeline stops immediately
- Error report generated
- Suggestions provided for fixes
- No changes made to system

---

### Stage 2: Testing

**Purpose:** Run automated tests to ensure code quality

**Test Suites:**

1. **Infrastructure Tests**
   - Script syntax validation (shellcheck)
   - Common library tests
   - Lock mechanism tests
   - Dry-run mode tests

2. **Dashboard Tests (Python)**
   - Unit tests with pytest
   - Coverage analysis
   - API endpoint tests

3. **Discord Bot Tests (Node.js)**
   - Unit tests with Vitest
   - Integration tests
   - E2E tests

4. **Stream Bot Tests (Node.js)**
   - Unit tests with Vitest
   - Security tests
   - Mock API tests

**Typical Duration:** 3-10 minutes

**How to run individually:**
```bash
./deployment/unified-pipeline.sh --stage test
```

**Coverage Reports:**
- HTML reports generated in `services/*/coverage/`
- Console summary displayed
- Combined coverage report in `deployment/test-coverage-report.txt`

**What happens on failure:**
- Pipeline stops at test stage
- Failed tests are logged
- Coverage reports still generated
- No deployment occurs

---

### Stage 3: Build

**Purpose:** Build Docker images and prepare for deployment

**Build Process:**

1. **Image Building**
   - Builds all services from `docker-compose.unified.yml`
   - Uses BuildKit for optimization
   - Supports parallel building
   - Caches layers for speed

2. **Image Tagging**
   - `latest` - Most recent build
   - `<git-commit>` - Git commit hash
   - `<environment>` - dev/staging/production
   - `<timestamp>` - Build timestamp

3. **Security Scanning**
   - Scans for vulnerabilities using Trivy
   - Checks for HIGH and CRITICAL issues
   - Generates security report
   - Can fail build on critical issues

4. **Registry Push** (Optional)
   - Tags images for registry
   - Authenticates with registry
   - Pushes images
   - Verifies push success

**Typical Duration:** 5-15 minutes

**How to run individually:**
```bash
./deployment/unified-pipeline.sh --stage build --parallel-build
```

**What happens on failure:**
- Pipeline stops at build stage
- Build logs captured
- Previous images remain
- No deployment occurs

---

### Stage 4: Deploy

**Purpose:** Deploy services with safety measures

**Deployment Process:**

1. **Pre-Deployment**
   - Creates snapshot for rollback
   - Backs up all databases
   - Checks migration status

2. **Database Migrations**
   - Runs pending migrations
   - Validates schema changes
   - Records migration history

3. **Service Deployment**
   - Stops old containers gracefully
   - Starts new containers
   - Waits for health checks
   - Monitors startup logs

4. **Health Checks**
   - Verifies container running
   - Checks health endpoints
   - Validates service responses
   - Retries on transient failures

5. **Post-Deployment**
   - Runs smoke tests
   - Verifies critical endpoints
   - Logs deployment event

**Typical Duration:** 8-20 minutes

**How to run individually:**
```bash
./deployment/unified-pipeline.sh --stage deploy
```

**Approval Gates:**
- Development: No approval required
- Staging: Optional approval
- Production: Manual approval required (with `--require-approval`)

**What happens on failure:**
- Deployment halts immediately
- Automatic rollback initiated (if enabled)
- Database restored from backup
- Previous containers restarted
- Detailed failure analysis logged

---

### Stage 5: Verification

**Purpose:** Verify deployment success

**Verification Checks:**

1. **Smoke Tests**
   - Basic functionality tests
   - Critical path verification
   - Quick sanity checks

2. **Service Health**
   - All containers running
   - Health endpoints responding
   - No error logs

3. **Endpoint Verification**
   - HTTP endpoints accessible
   - Correct status codes
   - Expected responses

4. **Database Connectivity**
   - Connection pool healthy
   - Queries executing
   - No connection errors

**Typical Duration:** 2-5 minutes

**How to run individually:**
```bash
./deployment/unified-pipeline.sh --stage verify
```

**What happens on failure:**
- Warning logged (doesn't fail pipeline)
- Issues reported
- Manual investigation may be needed
- Deployment considered successful if deploy stage passed

---

## ⚙️ Configuration

### Pipeline Configuration File

The pipeline is configured via `deployment/pipeline-config.yaml`.

#### Key Configuration Sections:

**1. Environment Configuration**

```yaml
environments:
  dev:
    auto_rollback: true
    require_approval: false
    skip_tests: false
    parallel_build: true
    
  production:
    auto_rollback: true
    require_approval: true
    skip_tests: false
    parallel_build: false
```

**2. Stage Configuration**

```yaml
stages:
  validate:
    enabled: true
    timeout: 300
    fail_fast: true
    
  test:
    enabled: true
    timeout: 600
    fail_fast: true
```

**3. Service Configuration**

```yaml
services:
  homelab-dashboard:
    health_check_endpoint: "/health"
    health_check_port: 5000
    startup_timeout: 60
    critical: true
```

**4. Notification Configuration**

```yaml
notifications:
  slack:
    enabled: true
    webhook_url: "${SLACK_WEBHOOK_URL}"
    on_success: true
    on_failure: true
```

### Environment Variables

Set these in your `.env` file or export them:

```bash
# Deployment Configuration
ENVIRONMENT=dev                    # dev, staging, production
AUTO_ROLLBACK=true                # Enable automatic rollback
REQUIRE_APPROVAL=false            # Require manual approval
SKIP_TESTS=false                  # Skip testing stage
SKIP_VALIDATION=false             # Skip validation stage
PARALLEL_BUILD=true               # Build images in parallel

# Image Registry
PUSH_IMAGES=false                 # Push to registry
IMAGE_REGISTRY=registry.example.com

# Security
RUN_SECURITY_SCAN=true            # Run security scans

# Behavior
DRY_RUN=false                     # Preview mode
DEBUG=0                           # Debug logging
```

---

## 🔄 CI/CD Integration

### GitHub Actions

The pipeline is integrated with GitHub Actions via `.github/workflows/deploy.yml`.

#### Automatic Triggers

```yaml
on:
  push:
    branches:
      - main        → Deploys to production
      - develop     → Deploys to staging
      - feature/*   → Deploys to dev
```

#### Manual Triggers

1. Go to GitHub Actions tab
2. Select "CI/CD Pipeline" workflow
3. Click "Run workflow"
4. Choose environment and options
5. Click "Run workflow"

#### Required Secrets

Set these in GitHub Settings → Secrets:

```
DOCKER_REGISTRY       - Registry URL
DOCKER_USERNAME       - Registry username
DOCKER_PASSWORD       - Registry password
SLACK_WEBHOOK_URL     - Slack webhook (optional)
DISCORD_WEBHOOK_URL   - Discord webhook (optional)
```

#### Deployment Environments

Configure these in GitHub Settings → Environments:

- **development** - No approval required
- **staging** - Optional reviewers
- **production** - Required reviewers + deployment delay

---

### GitLab CI/CD (Template)

Create `.gitlab-ci.yml`:

```yaml
stages:
  - validate
  - test
  - build
  - deploy

variables:
  ENVIRONMENT: $CI_COMMIT_BRANCH

validate:
  stage: validate
  script:
    - ./deployment/unified-pipeline.sh --stage validate

test:
  stage: test
  script:
    - ./deployment/unified-pipeline.sh --stage test
  coverage: '/TOTAL.*\s+(\d+%)$/'

build:
  stage: build
  script:
    - ./deployment/unified-pipeline.sh --stage build --parallel-build

deploy:
  stage: deploy
  script:
    - ./deployment/unified-pipeline.sh --env $ENVIRONMENT
  only:
    - main
    - develop
```

---

### Jenkins Pipeline (Jenkinsfile)

```groovy
pipeline {
    agent any
    
    environment {
        ENVIRONMENT = "${env.BRANCH_NAME == 'main' ? 'production' : 'staging'}"
    }
    
    stages {
        stage('Validate') {
            steps {
                sh './deployment/unified-pipeline.sh --stage validate'
            }
        }
        
        stage('Test') {
            steps {
                sh './deployment/unified-pipeline.sh --stage test'
            }
        }
        
        stage('Build') {
            steps {
                sh './deployment/unified-pipeline.sh --stage build'
            }
        }
        
        stage('Deploy') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                sh "./deployment/unified-pipeline.sh --env ${ENVIRONMENT}"
            }
        }
    }
    
    post {
        always {
            publishHTML([
                reportDir: 'deployment',
                reportFiles: 'pipeline-report.html',
                reportName: 'Pipeline Report'
            ])
        }
    }
}
```

---

## 🌍 Environment-Specific Deployments

### Development Environment

**Purpose:** Local development and testing

**Characteristics:**
- Fast iteration
- Minimal checks
- No approval required
- Auto-rollback enabled

**Deploy Command:**
```bash
./deployment/unified-pipeline.sh --env dev --parallel-build
```

**Typical Use Cases:**
- Testing new features
- Debugging issues
- Rapid prototyping
- Integration testing

---

### Staging Environment

**Purpose:** Pre-production testing

**Characteristics:**
- Production-like
- Full test suite
- Optional approval
- Security scanning enabled

**Deploy Command:**
```bash
./deployment/unified-pipeline.sh --env staging
```

**Typical Use Cases:**
- Final testing before production
- Performance testing
- User acceptance testing
- Client demos

---

### Production Environment

**Purpose:** Live user-facing deployment

**Characteristics:**
- Maximum safety
- Required approval
- Full validation
- Comprehensive logging

**Deploy Command:**
```bash
./deployment/unified-pipeline.sh --env production --require-approval
```

**Safety Features:**
- Manual approval gate
- Pre-deployment snapshot
- Database backup
- Automatic rollback
- Post-deployment verification

---

## 🔙 Rollback Procedures

### Automatic Rollback

Automatic rollback is triggered when:
- Deployment fails
- Health checks fail
- Service crashes on startup
- Database migration fails

**Process:**
1. Detects failure condition
2. Stops new containers
3. Restores database from backup
4. Restarts previous containers
5. Verifies rollback success
6. Logs rollback event

**Enable/Disable:**
```bash
# Enable (default)
./deployment/unified-pipeline.sh --env production

# Disable
./deployment/unified-pipeline.sh --env production --no-rollback
```

---

### Manual Rollback

**View Available Snapshots:**
```bash
ls -lh deployment/backups/snapshots/
```

**Rollback to Latest:**
```bash
./deployment/rollback-deployment.sh restore latest
```

**Rollback to Specific Snapshot:**
```bash
./deployment/rollback-deployment.sh restore snapshot_20240115_143022
```

**Verify Rollback:**
```bash
# Check container status
docker-compose -f docker-compose.unified.yml ps

# Check service health
./deployment/test-deployment.sh --smoke
```

---

## 📈 Monitoring and Reporting

### Pipeline Reports

**HTML Report:**
- Visual dashboard
- Stage-by-stage results
- Duration metrics
- Error details
- Accessible at: `deployment/pipeline-report.html`

**Execution Log:**
- Detailed command output
- Timestamps
- Error traces
- Located at: `deployment/pipeline-execution.log`

**History Log:**
- All past executions
- Success/failure tracking
- Deployment timeline
- Located at: `deployment/pipeline-history.log`

### Viewing Reports

```bash
# Open HTML report in browser
open deployment/pipeline-report.html

# View execution log
less deployment/pipeline-execution.log

# View deployment history
tail -50 deployment/pipeline-history.log

# Search for failures
grep "FAILED" deployment/pipeline-history.log
```

### Metrics Tracked

- Total pipeline duration
- Stage-specific durations
- Test pass/fail rates
- Coverage percentages
- Build times
- Deployment success rate
- Rollback frequency

---

## 🔧 Troubleshooting

### Common Issues and Solutions

#### Issue: "Pipeline failed at validation stage"

**Symptoms:**
```
[✗] Validation checks failed
[✗] Missing required environment variable: DISCORD_BOT_TOKEN
```

**Solution:**
1. Edit `.env` file and add missing variables
2. Run validation again: `./deployment/unified-pipeline.sh --stage validate`
3. Check `.env.example` for required variables

---

#### Issue: "Tests failing"

**Symptoms:**
```
[✗] Dashboard tests failed
FAILED services/dashboard/tests/test_api.py::test_health
```

**Solution:**
1. View detailed test output: `cat deployment/pipeline-execution.log`
2. Run tests manually: `cd services/dashboard && pytest -v`
3. Fix failing tests
4. Re-run pipeline: `./deployment/unified-pipeline.sh --stage test`

---

#### Issue: "Build failed - image not found"

**Symptoms:**
```
[✗] Image build failed
Error: COPY failed: file not found
```

**Solution:**
1. Check Dockerfile paths
2. Ensure all source files exist
3. Clear Docker cache: `docker system prune -a`
4. Rebuild: `./deployment/unified-pipeline.sh --stage build`

---

#### Issue: "Deployment failed - health check timeout"

**Symptoms:**
```
[✗] homelab-dashboard did not become healthy within 120s
```

**Solution:**
1. Check container logs: `docker logs homelab-dashboard`
2. Verify environment variables
3. Check database connectivity
4. Increase timeout in `pipeline-config.yaml`
5. Manual start for debugging: `docker-compose up -d homelab-dashboard`

---

#### Issue: "Port already in use"

**Symptoms:**
```
[✗] Port 5000 is already in use by another process
```

**Solution:**
1. Find process using port: `sudo lsof -i :5000`
2. Stop the process or change port in `docker-compose.unified.yml`
3. Re-run pipeline

---

#### Issue: "Insufficient disk space"

**Symptoms:**
```
[✗] Insufficient disk space: 2GB available, 10GB required
```

**Solution:**
1. Clean Docker resources: `docker system prune -a --volumes`
2. Remove old images: `docker image prune -a`
3. Free up system space
4. Re-run pipeline

---

### Debug Mode

Enable debug mode for verbose logging:

```bash
./deployment/unified-pipeline.sh --env dev --debug
```

This will:
- Show all executed commands
- Display variable values
- Log function calls
- Show detailed error traces

---

## 📚 Best Practices

### 1. Development Workflow

✅ **DO:**
- Always run validation before deploying
- Run tests locally before pushing
- Use dry-run mode to preview changes
- Review logs after deployment
- Keep `.env` file up to date

❌ **DON'T:**
- Skip tests in production
- Deploy without validation
- Ignore warning messages
- Deploy during peak hours without approval
- Disable automatic rollback in production

---

### 2. Testing Strategy

✅ **DO:**
- Maintain high test coverage (>70%)
- Write tests for new features
- Run full test suite before production deploy
- Fix broken tests immediately
- Use test doubles for external services

❌ **DON'T:**
- Skip tests to save time
- Ignore intermittent test failures
- Deploy with failing tests
- Rely only on manual testing

---

### 3. Deployment Strategy

✅ **DO:**
- Deploy to dev first, then staging, then production
- Use manual approval for production
- Create database backups before deployment
- Monitor logs during deployment
- Verify health checks pass
- Run smoke tests after deployment

❌ **DON'T:**
- Deploy directly to production
- Skip staging environment
- Deploy without backups
- Ignore health check failures
- Deploy without verification

---

### 4. Rollback Strategy

✅ **DO:**
- Enable automatic rollback
- Keep recent snapshots available
- Test rollback procedures regularly
- Document rollback process
- Verify rollback success

❌ **DON'T:**
- Disable rollback without good reason
- Delete snapshots immediately
- Skip rollback verification
- Panic during issues

---

### 5. Security Practices

✅ **DO:**
- Run security scans on images
- Keep base images updated
- Scan for vulnerabilities
- Use secrets management
- Review security reports

❌ **DON'T:**
- Skip security scans
- Ignore HIGH/CRITICAL vulnerabilities
- Commit secrets to repository
- Use outdated base images

---

## ❓ FAQ

### Q: How long does a full pipeline run take?

**A:** Typical times:
- Development: 5-10 minutes
- Staging: 10-15 minutes
- Production: 15-25 minutes (with approval)

Build stage is usually the longest (5-15 min).

---

### Q: Can I skip the test stage?

**A:** Yes, but not recommended:
```bash
./deployment/unified-pipeline.sh --env dev --skip-tests
```

**Never skip tests in production!**

---

### Q: What happens if deployment fails?

**A:** If `AUTO_ROLLBACK=true`:
1. Deployment stops immediately
2. Database restored from backup
3. Previous containers restarted
4. Rollback verified
5. Failure logged

If `AUTO_ROLLBACK=false`:
1. Deployment stops
2. Error logged
3. Manual intervention required

---

### Q: How do I run only specific services?

**A:** The pipeline deploys all services. To deploy specific services:
```bash
# Use docker-compose directly
docker-compose -f docker-compose.unified.yml up -d homelab-dashboard
```

---

### Q: Can I customize pipeline stages?

**A:** Yes! Edit `deployment/pipeline-config.yaml`:
```yaml
stages:
  validate:
    enabled: true  # Set to false to disable
  test:
    enabled: true
```

---

### Q: How do I add custom tests?

**A:** Add test suites to `pipeline-config.yaml`:
```yaml
test:
  suites:
    - name: "My Custom Tests"
      path: "tests/custom"
      command: "npm test"
```

---

### Q: Where are deployment logs stored?

**A:**
- Execution log: `deployment/pipeline-execution.log`
- History: `deployment/pipeline-history.log`
- HTML report: `deployment/pipeline-report.html`

---

### Q: How do I integrate with my CI/CD system?

**A:** See [CI/CD Integration](#cicd-integration) section. Templates provided for:
- GitHub Actions
- GitLab CI
- Jenkins

---

### Q: Can I deploy to multiple environments simultaneously?

**A:** No. The pipeline runs sequentially to prevent conflicts. However, you can run multiple pipelines on different machines.

---

### Q: What's the difference between `--dry-run` and `--stage validate`?

**A:**
- `--dry-run`: Shows what would happen across ALL stages without executing
- `--stage validate`: Actually RUNS the validation stage only

---

## 🚀 Advanced Topics

### Custom Pipeline Stages

Add custom stages by creating a script and integrating it:

```bash
# Create custom stage script
cat > deployment/custom-stage.sh <<'EOF'
#!/bin/bash
echo "Running custom stage..."
# Your custom logic here
EOF

chmod +x deployment/custom-stage.sh
```

Integrate in `unified-pipeline.sh` by adding a new stage function.

---

### Parallel Service Deployment

For faster deployments, services can be deployed in parallel:

```yaml
# In pipeline-config.yaml
advanced:
  parallel_deployment: true
  max_parallel_services: 3
```

---

### Blue-Green Deployment

Coming soon! Blue-green deployment strategy for zero-downtime deployments.

---

### Canary Deployments

Coming soon! Gradual rollout to subset of users.

---

### Integration with Monitoring Tools

Integrate with Prometheus, Grafana, or Datadog:

```yaml
# In pipeline-config.yaml
monitoring:
  prometheus:
    enabled: true
    pushgateway: "http://localhost:9091"
```

---

### Custom Notification Handlers

Add custom notification handlers:

```bash
# In deployment/lib-common.sh
notify_custom() {
    local message="$1"
    # Send notification to your system
    curl -X POST https://your-notification-system.com \
        -d "{\"message\": \"$message\"}"
}
```

---

## 📞 Support

### Getting Help

1. Check this guide
2. Review [Troubleshooting](#troubleshooting)
3. Check logs: `deployment/pipeline-execution.log`
4. Search GitHub Issues
5. Create new GitHub Issue with logs

### Useful Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Project README](../README.md)

---

## 📝 Changelog

### Version 1.0.0 (2024-01-15)

Initial release with:
- ✅ 5-stage pipeline
- ✅ Multi-environment support
- ✅ Automatic rollback
- ✅ Comprehensive testing
- ✅ Security scanning
- ✅ HTML reporting
- ✅ CI/CD integration

---

## 📄 License

This pipeline is part of the HomeLabHub project. See [LICENSE](../LICENSE) for details.

---

<div align="center">

**🎉 Happy Deploying! 🎉**

Made with ❤️ for reliable, automated deployments

</div>
