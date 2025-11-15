# 🚀 CI/CD Pipeline Quick Start Guide

## What Was Built

A complete unified CI/CD deployment pipeline with:

✅ **5-Stage Pipeline** - Validate → Test → Build → Deploy → Verify  
✅ **Multi-Environment Support** - dev, staging, production  
✅ **Automatic Rollback** - Safety on failure  
✅ **Comprehensive Testing** - Unit, integration, smoke tests  
✅ **Security Scanning** - Image vulnerability detection  
✅ **Beautiful Reporting** - HTML + console reports  
✅ **GitHub Actions Integration** - Ready to use  
✅ **Interactive Menu** - Via homelab-manager.sh option 26  

---

## Quick Start

### Option 1: Using the Interactive Manager

```bash
./homelab-manager.sh
# Select option 26 - "Run CI/CD Pipeline"
# Choose environment and options
```

### Option 2: Direct Command Line

```bash
# Full pipeline for development
./deployment/unified-pipeline.sh --env dev

# With dry-run to preview
./deployment/unified-pipeline.sh --env dev --dry-run

# Specific stage only
./deployment/unified-pipeline.sh --stage test

# Production with approval
./deployment/unified-pipeline.sh --env production --require-approval
```

---

## Files Created

### Core Pipeline Files

1. **`deployment/unified-pipeline.sh`** (40KB)
   - Main orchestration script
   - 5 pipeline stages
   - Automatic rollback
   - Comprehensive reporting
   - Environment-specific deployments

2. **`deployment/pipeline-config.yaml`** (7.6KB)
   - Pipeline configuration
   - Environment settings
   - Stage customization
   - Service health check configs
   - Notification settings

3. **`.github/workflows/deploy.yml`** (14KB)
   - GitHub Actions workflow
   - Automatic deployments on push
   - Manual triggers with options
   - Multi-environment support
   - Approval gates for production

4. **`deployment/PIPELINE_GUIDE.md`** (28KB)
   - Complete documentation
   - Usage examples
   - Troubleshooting guide
   - Best practices
   - FAQ

### Modified Files

5. **`homelab-manager.sh`**
   - Added option 26: "Run CI/CD Pipeline"
   - Interactive environment selection
   - Stage selection menu
   - Report viewing

---

## Pipeline Stages

### Stage 1: Validation (30-60s)
Checks environment readiness, syntax, resources, and migration status

### Stage 2: Testing (3-10 min)
Runs unit tests, integration tests, and generates coverage reports

### Stage 3: Build (5-15 min)
Builds Docker images, tags versions, runs security scans

### Stage 4: Deploy (8-20 min)
Backups databases, runs migrations, deploys with health checks

### Stage 5: Verification (2-5 min)
Smoke tests, endpoint checks, health verification

---

## Usage Examples

### Development Deployment
```bash
./deployment/unified-pipeline.sh --env dev --parallel-build
```

### Staging Deployment
```bash
./deployment/unified-pipeline.sh --env staging
```

### Production Deployment (Safe)
```bash
./deployment/unified-pipeline.sh --env production --require-approval
```

### Run Only Tests
```bash
./deployment/unified-pipeline.sh --stage test
```

### Preview Changes (Dry-Run)
```bash
./deployment/unified-pipeline.sh --env production --dry-run
```

---

## GitHub Actions

The pipeline automatically runs on:
- Push to `main` branch → deploys to production
- Push to `develop` branch → deploys to staging
- Pull requests to `main` → runs tests only

Manual trigger:
1. Go to Actions tab in GitHub
2. Select "CI/CD Pipeline"
3. Click "Run workflow"
4. Choose environment and options

---

## Reports

After each pipeline run, check:

- **HTML Report**: `deployment/pipeline-report.html` (visual dashboard)
- **Execution Log**: `deployment/pipeline-execution.log` (detailed output)
- **History Log**: `deployment/pipeline-history.log` (all past runs)

---

## Integration with Existing Scripts

The pipeline integrates with:
- ✅ `validate-deployment.sh` - Pre-flight checks
- ✅ `test-deployment.sh` - Test suites
- ✅ `migrate-all.sh` - Database migrations
- ✅ `backup-databases.sh` - Database backups
- ✅ `deploy-with-health-check.sh` - Safe deployment
- ✅ `rollback-deployment.sh` - Rollback on failure
- ✅ `lib-common.sh` - Shared utilities

---

## Key Features

### Automatic Rollback
If deployment fails, the pipeline automatically:
1. Stops new containers
2. Restores database from backup
3. Restarts previous containers
4. Verifies rollback success

### Environment Safety
- **Dev**: Fast iteration, minimal checks
- **Staging**: Production-like testing
- **Production**: Maximum safety, requires approval

### Parallel Execution
Build images in parallel for faster deployments:
```bash
./deployment/unified-pipeline.sh --parallel-build
```

### Security Scanning
Automatic vulnerability scanning with Trivy (if installed):
```bash
# Install Trivy
wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee /etc/apt/sources.list.d/trivy.list
sudo apt-get update && sudo apt-get install trivy
```

---

## Configuration

Edit `deployment/pipeline-config.yaml` to customize:
- Stage timeouts
- Test suites
- Health check endpoints
- Notification settings
- Security scan settings
- Rollback behavior

---

## Next Steps

1. **Review Documentation**: Read `deployment/PIPELINE_GUIDE.md`
2. **Test the Pipeline**: Run `./deployment/unified-pipeline.sh --env dev --dry-run`
3. **Configure GitHub**: Add required secrets to GitHub repository
4. **Customize Settings**: Edit `deployment/pipeline-config.yaml`
5. **Run First Deployment**: Use option 26 in homelab-manager.sh

---

## Support

For detailed help:
- See `deployment/PIPELINE_GUIDE.md`
- Run `./deployment/unified-pipeline.sh --help`
- Check logs in `deployment/pipeline-execution.log`

---

## Success Criteria ✅

All requirements met:

✅ Unified pipeline script runs all stages  
✅ Pipeline validates before deploying  
✅ Tests run automatically  
✅ Deployment creates backups  
✅ Health checks verify deployment  
✅ Automatic rollback on failure  
✅ Pipeline report generated  
✅ GitHub Actions workflow created  
✅ Interactive menu integration  
✅ Comprehensive documentation  

---

**Happy Deploying! 🎉**
