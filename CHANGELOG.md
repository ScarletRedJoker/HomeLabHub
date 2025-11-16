# Changelog

All notable changes to the Homelab Dashboard project.

## [Unreleased - Phase 1: Local DNS]
### Planned
- PowerDNS integration for local nameserver
- DynDNS automation for NAS
- DNS management UI
- Jarvis voice commands for DNS

## [Unreleased - Phase 3: NAS Integration]
### Planned
- Auto-discover NAS devices on network
- Mount NFS/SMB shares
- Backup orchestration
- Plex automation workflow

## [2024-11-16] - Critical Fixes & Documentation
### Fixed
- **CRITICAL**: Authentication bug - aligned session key (`session['authenticated']`) across login and setup API
- **SECURITY**: Protected `/api/setup/status` endpoint from unauthorized access
- Unprofessional chat interface background - added cosmic gradient with grid pattern

### Added
- Comprehensive 120% roadmap with effort estimates
- Professional documentation structure (ARCHITECTURE.md, DEPLOYMENT.md, API_REFERENCE.md)
- Consolidated 33+ status docs into organized structure

### Changed
- Reorganized documentation into `docs/` directory
- Improved setup wizard error handling

## [2024-11-15] - Deployment System
### Added
- Interactive setup wizard (`setup.sh`) with OAuth guidance
- Self-healing deployment script (`deploy.sh`) with 3-attempt retry
- Setup API for Jarvis integration (`/api/setup/*`)
- HTTP health checks (not just container status)
- Comprehensive validation system

### Security
- CSRF protection on all setup endpoints
- SSRF protection with URL validation
- Rate limiting per endpoint
- Secure secret generation

## [2024-11-14] - Jarvis Task System
### Added
- Complete autonomous task execution framework
- Database models: JarvisTask, JarvisAction, DomainTask
- 20+ pre-built autonomous actions across 3 tiers
- Approval workflow for destructive operations
- Real-time task status tracking

### Tier 1 - Diagnostic Actions (8)
- DNS propagation verification
- SSL certificate validation
- Service health monitoring
- Git sync status verification
- Deployment health checks
- Disk usage analysis
- Log analysis and error detection
- Endpoint health verification

### Tier 2 - Remediation Actions (7)
- DNS record remediation
- SSL certificate renewal
- ddclient configuration fixes
- Service restart and recovery
- Git sync recovery
- Configuration rollback
- Database optimization

### Tier 3 - Proactive Maintenance (5)
- Temporary file cleanup
- Old log rotation
- Redis cache clearing
- Database vacuum/reindex
- System resource optimization

## [2024-11-13] - Domain Management System
### Added
- End-to-end domain lifecycle automation
- ZoneEdit DNS API integration with CRUD operations
- Caddy configuration automation with safe rollback
- SSL certificate monitoring and autonomous renewal
- 8-step automated provisioning workflow
- Import/Export functionality (JSON/CSV)
- Real-time health monitoring with alerts

### Database
- DomainRecord model (primary configuration)
- DomainEvent model (complete audit trail)
- DomainTask model (async task tracking)

### API Endpoints (9)
- GET /api/domains - List all
- POST /api/domains - Create
- GET /api/domains/:id - Get details
- PATCH /api/domains/:id - Update
- DELETE /api/domains/:id - Remove
- POST /api/domains/:id/provision - Auto-provision
- GET /api/domains/:id/health - Health check
- POST /api/domains/:id/renew-ssl - Force renewal
- POST /api/domains/import - Bulk import

## [2024-11-12] - ChatGPT-Style AI Interface
### Added
- Professional cosmic theme with gradients
- Markdown rendering with syntax highlighting
- Code copy buttons
- Streaming responses with real-time updates
- Mobile-responsive design

### Changed
- Redesigned chat interface to match ChatGPT quality
- Improved message bubbles with glassmorphism
- Enhanced code block styling

## [2024-11-01] - Initial Production Release
### Added
- Flask dashboard with system monitoring
- Docker container orchestration
- PostgreSQL database with Alembic migrations
- Redis + Celery for background jobs
- MinIO object storage
- Google Services integration
- Home Assistant integration
- Caddy reverse proxy
- Multi-service deployment (8 services)

### Security
- Session-based authentication
- API key authentication
- Rate limiting
- Audit logging

---

## Version Numbering

- **Phase 1**: Local DNS implementation
- **Phase 2**: Container Marketplace
- **Phase 3**: NAS Integration
- **Phase 4**: Code cleanup & optimization
- **v1.0.0**: Initial production release (November 2024)

## Breaking Changes

None yet - backward compatibility maintained.

## Migration Notes

No migrations required for current deployments.

---

Last Updated: November 16, 2024
